"""Tests for pilot implement command — happy path, edge cases, error paths."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from typer.testing import CliRunner

from pilot_cli.api_client import PilotAPIError
from pilot_cli.commands.implement import (
    _build_pr_body,
    _extract_issue_number,
    _normalize_ctx,
)
from pilot_cli.config import PilotConfig
from pilot_cli.main import app

runner = CliRunner()

MOCK_CTX: dict[str, Any] = {
    "issue": {
        "id": "PS-42",
        "title": "Fix auth race condition",
        "status": "todo",
        "priority": "high",
        "labels": ["backend", "auth"],
        "description": "Race condition in token refresh.",
        "acceptanceCriteria": ["Test passes", "No race condition"],
    },
    "suggestedBranch": "feat/ps-42-fix-auth-race-condition",
    "linkedNotes": [],
    "workspace": {"name": "Acme", "slug": "acme"},
    "project": {"name": "Backend", "techStackSummary": "FastAPI + SQLAlchemy"},
    "repository": {
        "cloneUrl": "https://github.com/acme/backend.git",
        "defaultBranch": "main",
        "provider": "github",
    },
}

MOCK_CONFIG = PilotConfig(
    api_url="https://api.example.io",
    api_key="ps_test",
    workspace_slug="acme",
)


def _mock_repo(dirty: bool = True) -> MagicMock:
    repo = MagicMock()
    repo.git.checkout = MagicMock()
    repo.git.add = MagicMock()
    repo.git.push = MagicMock()
    repo.index.commit = MagicMock()
    repo.is_dirty.return_value = dirty
    return repo


@pytest.fixture(autouse=True)
def patch_workspaces_dir(tmp_path: Path):  # type: ignore[no-untyped-def]
    """Redirect WORKSPACES_DIR to a temp path for all tests."""
    with patch("pilot_cli.commands.implement.WORKSPACES_DIR", tmp_path / "workspaces"):
        yield


class TestImplementHappyPath:
    def test_full_workflow_creates_pr(self, tmp_path: Path) -> None:
        """Happy path: context fetched, repo cloned, PR created, issue updated."""
        mock_repo = _mock_repo(dirty=True)

        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
            patch(
                "pilot_cli.commands.implement.git.Repo.clone_from",
                return_value=mock_repo,
            ),
            patch("pilot_cli.commands.implement.GitHubClient") as mock_gh_cls,
            patch(
                "pilot_cli.commands.implement.subprocess.run",
                return_value=MagicMock(returncode=0),
            ),
            patch(
                "pilot_cli.commands.implement._get_github_token",
                return_value="ghp_test",
            ),
            patch("pilot_cli.commands.implement._inject_claude_md"),
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.return_value = MOCK_CTX
            api_client.update_issue_status = AsyncMock()
            mock_client_cls.from_config.return_value = api_client

            gh_client = AsyncMock()
            pr_result = MagicMock()
            pr_result.url = "https://github.com/acme/backend/pull/5"
            gh_client.create_pull_request.return_value = pr_result
            mock_gh_cls.from_clone_url.return_value = gh_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 0, result.output
        assert "Fix auth race condition" in result.output
        assert "https://github.com/acme/backend/pull/5" in result.output
        api_client.update_issue_status.assert_awaited_once_with("PS-42", "in_review")

    def test_no_changes_skips_pr(self, tmp_path: Path) -> None:
        """If repo has no changes after claude, skip commit and PR."""
        mock_repo = _mock_repo(dirty=False)

        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
            patch(
                "pilot_cli.commands.implement.git.Repo.clone_from",
                return_value=mock_repo,
            ),
            patch(
                "pilot_cli.commands.implement.subprocess.run",
                return_value=MagicMock(returncode=0),
            ),
            patch(
                "pilot_cli.commands.implement._get_github_token",
                return_value="ghp_test",
            ),
            patch("pilot_cli.commands.implement._inject_claude_md"),
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.return_value = MOCK_CTX
            mock_client_cls.from_config.return_value = api_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 0, result.output
        assert "No changes" in result.output
        mock_repo.index.commit.assert_not_called()

    def test_no_github_token_pushes_without_pr(self, tmp_path: Path) -> None:
        """Without GitHub token, branch is pushed but PR creation is skipped."""
        mock_repo = _mock_repo(dirty=True)

        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
            patch(
                "pilot_cli.commands.implement.git.Repo.clone_from",
                return_value=mock_repo,
            ),
            patch(
                "pilot_cli.commands.implement.subprocess.run",
                return_value=MagicMock(returncode=0),
            ),
            patch("pilot_cli.commands.implement._get_github_token", return_value=None),
            patch("pilot_cli.commands.implement.GitHubClient") as mock_gh_cls,
            patch("pilot_cli.commands.implement._inject_claude_md"),
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.return_value = MOCK_CTX
            api_client.update_issue_status = AsyncMock()
            mock_client_cls.from_config.return_value = api_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 0, result.output
        assert "GITHUB_TOKEN" in result.output
        mock_gh_cls.from_clone_url.assert_not_called()

    def test_existing_clone_reuses_repo(self, tmp_path: Path) -> None:
        """If workspace dir already exists, re-use it instead of cloning."""
        workspace_dir = tmp_path / "workspaces" / "acme" / "PS-42"
        workspace_dir.mkdir(parents=True)
        mock_repo = _mock_repo(dirty=True)

        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
            patch("pilot_cli.commands.implement.git.Repo", return_value=mock_repo),
            patch("pilot_cli.commands.implement.git.Repo.clone_from") as mock_clone,
            patch(
                "pilot_cli.commands.implement.subprocess.run",
                return_value=MagicMock(returncode=0),
            ),
            patch("pilot_cli.commands.implement._get_github_token", return_value=None),
            patch("pilot_cli.commands.implement._inject_claude_md"),
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.return_value = MOCK_CTX
            api_client.update_issue_status = AsyncMock()
            mock_client_cls.from_config.return_value = api_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 0, result.output
        assert "already exists" in result.output
        mock_clone.assert_not_called()

    def test_branch_checkout_fallback_on_existing_branch(self, tmp_path: Path) -> None:
        """If branch already exists, check it out instead of creating a new one."""
        import git as gitlib

        mock_repo = _mock_repo(dirty=True)
        # First call raises (branch exists), second call (checkout) succeeds
        mock_repo.git.checkout.side_effect = [
            gitlib.GitCommandError("checkout", "branch exists"),
            None,
        ]

        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
            patch(
                "pilot_cli.commands.implement.git.Repo.clone_from",
                return_value=mock_repo,
            ),
            patch(
                "pilot_cli.commands.implement.subprocess.run",
                return_value=MagicMock(returncode=0),
            ),
            patch("pilot_cli.commands.implement._get_github_token", return_value=None),
            patch("pilot_cli.commands.implement._inject_claude_md"),
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.return_value = MOCK_CTX
            api_client.update_issue_status = AsyncMock()
            mock_client_cls.from_config.return_value = api_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 0, result.output
        # checkout was called twice: once with -b (raises), once without
        assert mock_repo.git.checkout.call_count == 2


class TestImplementErrorPaths:
    def test_missing_config_exits_1(self) -> None:
        """Missing config prints login hint and exits 1."""
        with patch(
            "pilot_cli.commands.implement.PilotConfig.load",
            side_effect=FileNotFoundError("missing"),
        ):
            result = runner.invoke(app, ["implement", "PS-42"])
        assert result.exit_code == 1
        assert "pilot login" in result.output

    def test_403_non_assignee_exits_1(self) -> None:
        """403 from API prints helpful message and exits 1."""
        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.side_effect = PilotAPIError(
                403, "Forbidden"
            )
            mock_client_cls.from_config.return_value = api_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 1
        assert "not assigned" in result.output

    def test_422_no_github_integration_exits_1(self) -> None:
        """422 from API prints GitHub integration hint and exits 1."""
        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.side_effect = PilotAPIError(
                422, "No GitHub"
            )
            mock_client_cls.from_config.return_value = api_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 1
        assert "GitHub integration" in result.output

    def test_500_generic_error_exits_1(self) -> None:
        """Generic 5xx error shows status code and detail, exits 1."""
        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.side_effect = PilotAPIError(
                500, "Internal Server Error"
            )
            mock_client_cls.from_config.return_value = api_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 1
        assert "500" in result.output

    def test_clone_failure_exits_1(self, tmp_path: Path) -> None:
        """Git clone failure prints helpful message and exits 1."""
        import git as gitlib

        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
            patch(
                "pilot_cli.commands.implement.git.Repo.clone_from",
                side_effect=gitlib.GitCommandError("clone", "Authentication failed"),
            ),
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.return_value = MOCK_CTX
            mock_client_cls.from_config.return_value = api_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 1
        assert "Clone failed" in result.output

    def test_pr_creation_failure_warns_but_continues(self, tmp_path: Path) -> None:
        """GitHubClientError during PR creation shows warning but does not abort."""
        from pilot_cli.github_client import GitHubClientError

        mock_repo = _mock_repo(dirty=True)

        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
            patch(
                "pilot_cli.commands.implement.git.Repo.clone_from",
                return_value=mock_repo,
            ),
            patch("pilot_cli.commands.implement.GitHubClient") as mock_gh_cls,
            patch(
                "pilot_cli.commands.implement.subprocess.run",
                return_value=MagicMock(returncode=0),
            ),
            patch(
                "pilot_cli.commands.implement._get_github_token",
                return_value="ghp_test",
            ),
            patch("pilot_cli.commands.implement._inject_claude_md"),
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.return_value = MOCK_CTX
            api_client.update_issue_status = AsyncMock()
            mock_client_cls.from_config.return_value = api_client

            gh_client = AsyncMock()
            gh_client.create_pull_request.side_effect = GitHubClientError(
                422, "PR already exists"
            )
            mock_gh_cls.from_clone_url.return_value = gh_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 0, result.output
        assert "PR creation failed" in result.output
        # Issue status should still be updated despite PR failure
        api_client.update_issue_status.assert_awaited_once_with("PS-42", "in_review")

    def test_status_update_failure_warns_but_does_not_crash(
        self, tmp_path: Path
    ) -> None:
        """PilotAPIError on status update shows warning, does not exit non-zero."""
        mock_repo = _mock_repo(dirty=True)

        with (
            patch(
                "pilot_cli.commands.implement.PilotConfig.load",
                return_value=MOCK_CONFIG,
            ),
            patch("pilot_cli.commands.implement.PilotAPIClient") as mock_client_cls,
            patch(
                "pilot_cli.commands.implement.git.Repo.clone_from",
                return_value=mock_repo,
            ),
            patch("pilot_cli.commands.implement.GitHubClient") as mock_gh_cls,
            patch(
                "pilot_cli.commands.implement.subprocess.run",
                return_value=MagicMock(returncode=0),
            ),
            patch(
                "pilot_cli.commands.implement._get_github_token",
                return_value="ghp_test",
            ),
            patch("pilot_cli.commands.implement._inject_claude_md"),
        ):
            api_client = AsyncMock()
            api_client.get_implement_context.return_value = MOCK_CTX
            api_client.update_issue_status = AsyncMock(
                side_effect=PilotAPIError(500, "DB error")
            )
            mock_client_cls.from_config.return_value = api_client

            pr_result = MagicMock()
            pr_result.url = "https://github.com/acme/backend/pull/6"
            gh_client = AsyncMock()
            gh_client.create_pull_request.return_value = pr_result
            mock_gh_cls.from_clone_url.return_value = gh_client

            result = runner.invoke(app, ["implement", "PS-42"])

        assert result.exit_code == 0, result.output
        assert "Could not update issue status" in result.output


class TestNormalizeCtx:
    """Unit tests for the camelCase → snake_case context normalizer."""

    def test_maps_acceptance_criteria(self) -> None:
        """acceptanceCriteria list is mapped to acceptance_criteria."""
        normalized = _normalize_ctx(MOCK_CTX)
        assert normalized["issue"]["acceptance_criteria"] == [
            "Test passes",
            "No race condition",
        ]

    def test_maps_repository_fields(self) -> None:
        """cloneUrl and defaultBranch are mapped to snake_case keys."""
        normalized = _normalize_ctx(MOCK_CTX)
        assert (
            normalized["repository"]["clone_url"]
            == "https://github.com/acme/backend.git"
        )
        assert normalized["repository"]["default_branch"] == "main"

    def test_maps_project_tech_stack_summary(self) -> None:
        """techStackSummary is mapped to tech_stack_summary."""
        normalized = _normalize_ctx(MOCK_CTX)
        assert normalized["project"]["tech_stack_summary"] == "FastAPI + SQLAlchemy"

    def test_empty_linked_notes(self) -> None:
        """Empty linkedNotes produces empty list."""
        normalized = _normalize_ctx(MOCK_CTX)
        assert normalized["linked_notes"] == []

    def test_linked_notes_snake_case_mapping(self) -> None:
        """linkedNotes with camelCase keys are normalized correctly."""
        ctx = dict(MOCK_CTX)
        ctx["linkedNotes"] = [
            {
                "noteTitle": "Sprint Planning Notes",
                "relevantBlocks": ["Block A", "Block B"],
            }
        ]
        normalized = _normalize_ctx(ctx)
        assert len(normalized["linked_notes"]) == 1
        note = normalized["linked_notes"][0]
        assert note["note_title"] == "Sprint Planning Notes"
        assert note["relevant_blocks"] == ["Block A", "Block B"]

    def test_suggested_branch_preserved(self) -> None:
        """suggestedBranch value is passed through as suggested_branch."""
        normalized = _normalize_ctx(MOCK_CTX)
        assert normalized["suggested_branch"] == "feat/ps-42-fix-auth-race-condition"

    def test_missing_optional_fields_default_to_empty(self) -> None:
        """Missing optional fields fall back to empty strings / lists."""
        ctx: dict[str, Any] = {
            "issue": {"id": "PS-1", "title": "T"},
            "suggestedBranch": "feat/ps-1",
            "linkedNotes": [],
            "workspace": {"name": "W", "slug": "w"},
            "project": {"name": "P"},
            "repository": {"cloneUrl": "https://github.com/a/b.git"},
        }
        normalized = _normalize_ctx(ctx)
        assert normalized["issue"]["acceptance_criteria"] == []
        assert normalized["repository"]["default_branch"] == ""
        assert normalized["project"]["tech_stack_summary"] == ""


class TestHelpers:
    """Unit tests for small helper functions."""

    def test_extract_issue_number_standard(self) -> None:
        assert _extract_issue_number("PS-42") == "42"

    def test_extract_issue_number_no_dash(self) -> None:
        assert _extract_issue_number("42") == "42"

    def test_extract_issue_number_multi_dash(self) -> None:
        assert _extract_issue_number("PROJ-123") == "123"

    def test_build_pr_body_contains_issue_id(self) -> None:
        body = _build_pr_body("PS-42", "Fix auth race condition", MOCK_CTX)
        assert "PS-42" in body
        assert "Fix auth race condition" in body

    def test_build_pr_body_acceptance_criteria_listed(self) -> None:
        body = _build_pr_body("PS-42", "Fix auth race condition", MOCK_CTX)
        assert "- [ ] Test passes" in body
        assert "- [ ] No race condition" in body

    def test_build_pr_body_no_acceptance_criteria(self) -> None:
        ctx = dict(MOCK_CTX)
        ctx["issue"] = dict(MOCK_CTX["issue"])
        ctx["issue"]["acceptanceCriteria"] = []
        body = _build_pr_body("PS-42", "Fix auth race condition", ctx)
        assert "_None specified._" in body


class TestInjectClaudeMd:
    """Tests for CLAUDE.md injection logic."""

    def test_creates_claude_md_when_absent(self, tmp_path: Path) -> None:
        """CLAUDE.md is created from template when it does not exist."""
        from pilot_cli.commands.implement import _inject_claude_md

        _inject_claude_md(tmp_path, MOCK_CTX)
        claude_md = tmp_path / "CLAUDE.md"
        assert claude_md.exists()
        content = claude_md.read_text()
        assert "Fix auth race condition" in content
        assert "Test passes" in content

    def test_appends_to_existing_claude_md(self, tmp_path: Path) -> None:
        """When CLAUDE.md exists, content is appended not overwritten."""
        from pilot_cli.commands.implement import _inject_claude_md

        claude_md = tmp_path / "CLAUDE.md"
        claude_md.write_text("# Existing Project Docs\n\nKeep this content.\n")

        _inject_claude_md(tmp_path, MOCK_CTX)

        content = claude_md.read_text()
        assert "# Existing Project Docs" in content
        assert "Keep this content." in content
        assert "Fix auth race condition" in content

    def test_rendered_template_contains_repository_url(self, tmp_path: Path) -> None:
        """Rendered CLAUDE.md includes the repository clone URL."""
        from pilot_cli.commands.implement import _inject_claude_md

        _inject_claude_md(tmp_path, MOCK_CTX)
        content = (tmp_path / "CLAUDE.md").read_text()
        assert "https://github.com/acme/backend.git" in content

    def test_rendered_template_contains_suggested_branch(self, tmp_path: Path) -> None:
        """Rendered CLAUDE.md includes the suggested branch name."""
        from pilot_cli.commands.implement import _inject_claude_md

        _inject_claude_md(tmp_path, MOCK_CTX)
        content = (tmp_path / "CLAUDE.md").read_text()
        assert "feat/ps-42-fix-auth-race-condition" in content


class TestGetGithubToken:
    """Unit tests for the _get_github_token helper."""

    def test_returns_env_var_when_set(self) -> None:
        """GITHUB_TOKEN env var is returned directly without calling gh CLI."""
        from pilot_cli.commands.implement import _get_github_token

        with (
            patch.dict("os.environ", {"GITHUB_TOKEN": "ghp_from_env"}),
            patch("pilot_cli.commands.implement.subprocess.run") as mock_run,
        ):
            token = _get_github_token()

        assert token == "ghp_from_env"
        mock_run.assert_not_called()

    def test_falls_back_to_gh_cli_when_env_absent(self) -> None:
        """When GITHUB_TOKEN is not set, gh auth token output is returned."""
        from pilot_cli.commands.implement import _get_github_token

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "ghp_from_cli\n"

        env = {k: v for k, v in __import__("os").environ.items() if k != "GITHUB_TOKEN"}
        with (
            patch.dict("os.environ", env, clear=True),
            patch(
                "pilot_cli.commands.implement.subprocess.run",
                return_value=mock_result,
            ),
        ):
            token = _get_github_token()

        assert token == "ghp_from_cli"

    def test_returns_none_when_gh_cli_fails(self) -> None:
        """When gh CLI exits non-zero, None is returned."""
        from pilot_cli.commands.implement import _get_github_token

        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stdout = ""

        env = {k: v for k, v in __import__("os").environ.items() if k != "GITHUB_TOKEN"}
        with (
            patch.dict("os.environ", env, clear=True),
            patch(
                "pilot_cli.commands.implement.subprocess.run",
                return_value=mock_result,
            ),
        ):
            token = _get_github_token()

        assert token is None

    def test_returns_none_when_gh_cli_returns_empty_stdout(self) -> None:
        """gh CLI exit-0 but empty stdout (not logged in) → None."""
        from pilot_cli.commands.implement import _get_github_token

        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "   "  # whitespace only after strip → falsy

        env = {k: v for k, v in __import__("os").environ.items() if k != "GITHUB_TOKEN"}
        with (
            patch.dict("os.environ", env, clear=True),
            patch(
                "pilot_cli.commands.implement.subprocess.run",
                return_value=mock_result,
            ),
        ):
            token = _get_github_token()

        assert token is None
