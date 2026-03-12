"""Tests for SeedPluginsService — SKRG-05.

Tests verify default plugin seeding behavior on workspace creation,
and that the background task wrapper uses an independent DB session.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

pytestmark = pytest.mark.asyncio


async def test_seed_workspace_installs_default_plugins() -> None:
    """SKRG-05: seed_workspace installs the default plugin set."""
    from pilot_space.application.services.workspace_plugin.seed_plugins_service import (
        SeedPluginsService,
    )

    mock_session = AsyncMock()
    workspace_id = uuid4()

    with (
        patch.dict("os.environ", {"GITHUB_TOKEN": "test-token"}),
        patch(
            "pilot_space.application.services.workspace_plugin.seed_plugins_service.GitHubPluginService"
        ) as MockGH,
        patch(
            "pilot_space.application.services.workspace_plugin.seed_plugins_service.InstallPluginService"
        ) as MockInstall,
    ):
        from pilot_space.integrations.github.plugin_service import SkillContent

        mock_gh = MockGH.return_value
        mock_gh.fetch_skill_content = AsyncMock(
            return_value=SkillContent(
                skill_md="---\nname: test\n---\n# Test",
                references=[],
                display_name="test",
                description="test desc",
            )
        )
        mock_gh.get_head_sha = AsyncMock(return_value="a" * 40)
        mock_gh.aclose = AsyncMock()

        mock_install = MockInstall.return_value
        mock_install.install = AsyncMock()

        svc = SeedPluginsService(db_session=mock_session)
        await svc.seed_workspace(workspace_id=workspace_id)

        # Should install at least 2 default plugins (mcp-builder, claude-api)
        assert mock_install.install.await_count >= 2


async def test_seed_workspace_skips_when_github_token_missing() -> None:
    """SKRG-05: seed_workspace gracefully skips when GITHUB_TOKEN is absent."""
    from pilot_space.application.services.workspace_plugin.seed_plugins_service import (
        SeedPluginsService,
    )

    mock_session = AsyncMock()

    with patch.dict("os.environ", {}, clear=False):
        # Ensure GITHUB_TOKEN is not set
        import os

        os.environ.pop("GITHUB_TOKEN", None)

        svc = SeedPluginsService(db_session=mock_session)
        # Should not raise — just return silently
        await svc.seed_workspace(workspace_id=uuid4())


async def test_seed_failure_is_nonfatal() -> None:
    """SKRG-05: seed failure does not propagate — workspace creation succeeds."""
    from pilot_space.application.services.workspace_plugin.seed_plugins_service import (
        SeedPluginsService,
    )

    mock_session = AsyncMock()

    with (
        patch.dict("os.environ", {"GITHUB_TOKEN": "test-token"}),
        patch(
            "pilot_space.application.services.workspace_plugin.seed_plugins_service.GitHubPluginService"
        ) as MockGH,
    ):
        mock_gh = MockGH.return_value
        mock_gh.fetch_skill_content = AsyncMock(side_effect=Exception("GitHub down"))
        mock_gh.get_head_sha = AsyncMock(side_effect=Exception("GitHub down"))
        mock_gh.aclose = AsyncMock()

        svc = SeedPluginsService(db_session=mock_session)
        # Should not raise — seed failures are non-fatal
        await svc.seed_workspace(workspace_id=uuid4())


# ---------------------------------------------------------------------------
# Background task wrapper tests (independent session + non-fatal contract)
# ---------------------------------------------------------------------------


async def test_seed_workspace_background_uses_independent_session() -> None:
    """SKRG-05: _seed_workspace_background creates its own DB session via get_db_session().

    The background task must NOT reuse the request-scoped session. It calls
    get_db_session() to obtain an independent session for the background work.
    """
    from pilot_space.api.v1.routers.workspaces import _seed_workspace_background

    workspace_id = uuid4()
    mock_bg_session = AsyncMock()

    mock_ctx = AsyncMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_bg_session)
    mock_ctx.__aexit__ = AsyncMock(return_value=False)

    with (
        patch(
            "pilot_space.api.v1.routers.workspaces.get_db_session",
            return_value=mock_ctx,
        ) as mock_get_session,
        patch.dict("os.environ", {"GITHUB_TOKEN": "test-token"}),
        patch(
            "pilot_space.application.services.workspace_plugin.seed_plugins_service.GitHubPluginService"
        ) as MockGH,
        patch(
            "pilot_space.application.services.workspace_plugin.seed_plugins_service.InstallPluginService"
        ) as MockInstall,
    ):
        from pilot_space.integrations.github.plugin_service import SkillContent

        mock_gh = MockGH.return_value
        mock_gh.fetch_skill_content = AsyncMock(
            return_value=SkillContent(
                skill_md="---\nname: test\n---\n# Test",
                references=[],
                display_name="test",
                description="test desc",
            )
        )
        mock_gh.get_head_sha = AsyncMock(return_value="a" * 40)
        mock_gh.aclose = AsyncMock()

        mock_install = MockInstall.return_value
        mock_install.install = AsyncMock()

        await _seed_workspace_background(workspace_id)

        # Verify get_db_session() was called (proving independent session)
        mock_get_session.assert_called_once()


async def test_seed_workspace_background_non_fatal_on_exception() -> None:
    """SKRG-05: _seed_workspace_background catches all exceptions without propagating.

    Even if get_db_session() itself raises, the background task must not
    propagate the exception. It logs and returns silently.
    """
    from pilot_space.api.v1.routers.workspaces import _seed_workspace_background

    workspace_id = uuid4()

    with (
        patch(
            "pilot_space.api.v1.routers.workspaces.get_db_session",
            side_effect=RuntimeError("DB connection pool exhausted"),
        ),
        patch(
            "pilot_space.api.v1.routers.workspaces.logger",
        ) as mock_logger,
    ):
        # Must NOT raise — background task swallows all exceptions
        await _seed_workspace_background(workspace_id)

        # Verify the exception was logged
        mock_logger.exception.assert_called_once()
