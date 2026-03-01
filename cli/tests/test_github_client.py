"""Tests for GitHubClient PR creation and URL parsing."""

from __future__ import annotations

import httpx
import pytest
import respx

from pilot_cli.github_client import GitHubClient, GitHubClientError, PRCreationResult

OWNER = "acme-org"
REPO = "my-service"
TOKEN = "ghp_test123"

PULLS_URL = f"https://api.github.com/repos/{OWNER}/{REPO}/pulls"
REPO_URL = f"https://api.github.com/repos/{OWNER}/{REPO}"


# ---------------------------------------------------------------------------
# from_clone_url
# ---------------------------------------------------------------------------


class TestFromCloneUrl:
    def test_parse_https_url(self) -> None:
        client = GitHubClient.from_clone_url(
            TOKEN, f"https://github.com/{OWNER}/{REPO}.git"
        )
        assert client._owner == OWNER
        assert client._repo == REPO

    def test_parse_https_url_without_dot_git(self) -> None:
        client = GitHubClient.from_clone_url(
            TOKEN, f"https://github.com/{OWNER}/{REPO}"
        )
        assert client._owner == OWNER
        assert client._repo == REPO

    def test_parse_ssh_url(self) -> None:
        client = GitHubClient.from_clone_url(
            TOKEN, f"git@github.com:{OWNER}/{REPO}.git"
        )
        assert client._owner == OWNER
        assert client._repo == REPO

    def test_parse_ssh_url_without_dot_git(self) -> None:
        client = GitHubClient.from_clone_url(TOKEN, f"git@github.com:{OWNER}/{REPO}")
        assert client._owner == OWNER
        assert client._repo == REPO

    def test_invalid_url_raises(self) -> None:
        with pytest.raises(ValueError, match="Cannot parse"):
            GitHubClient.from_clone_url(TOKEN, "https://gitlab.com/org/repo.git")

    def test_non_github_https_url_raises(self) -> None:
        with pytest.raises(ValueError, match="Cannot parse"):
            GitHubClient.from_clone_url(TOKEN, "https://bitbucket.org/org/repo.git")

    def test_token_passed_to_client(self) -> None:
        client = GitHubClient.from_clone_url(
            TOKEN, f"https://github.com/{OWNER}/{REPO}.git"
        )
        assert client._token == TOKEN

    def test_sets_correct_auth_header(self) -> None:
        client = GitHubClient.from_clone_url(
            TOKEN, f"https://github.com/{OWNER}/{REPO}.git"
        )
        assert client._headers["Authorization"] == f"Bearer {TOKEN}"


# ---------------------------------------------------------------------------
# create_pull_request
# ---------------------------------------------------------------------------


class TestCreatePullRequest:
    @respx.mock
    @pytest.mark.asyncio
    async def test_creates_pr_returns_result(self) -> None:
        respx.post(PULLS_URL).mock(
            return_value=httpx.Response(
                201,
                json={
                    "html_url": f"https://github.com/{OWNER}/{REPO}/pull/42",
                    "number": 42,
                    "title": "feat: add new feature",
                },
            )
        )
        client = GitHubClient(token=TOKEN, owner=OWNER, repo=REPO)
        result = await client.create_pull_request(
            title="feat: add new feature",
            body="Closes #PS-42",
            head="feat/ps-42-add-feature",
            base="main",
        )

        assert isinstance(result, PRCreationResult)
        assert result.number == 42
        assert result.title == "feat: add new feature"
        assert "pull/42" in result.url

    @respx.mock
    @pytest.mark.asyncio
    async def test_draft_flag_passed_in_request_body(self) -> None:
        route = respx.post(PULLS_URL).mock(
            return_value=httpx.Response(
                201,
                json={
                    "html_url": f"https://github.com/{OWNER}/{REPO}/pull/7",
                    "number": 7,
                    "title": "draft PR",
                },
            )
        )
        client = GitHubClient(token=TOKEN, owner=OWNER, repo=REPO)
        await client.create_pull_request(
            title="draft PR",
            body="",
            head="feat/x",
            base="main",
            draft=True,
        )

        import json

        body = json.loads(route.calls[0].request.content)
        assert body["draft"] is True

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_422_validation_failed(self) -> None:
        respx.post(PULLS_URL).mock(
            return_value=httpx.Response(422, json={"message": "Validation Failed"})
        )
        client = GitHubClient(token=TOKEN, owner=OWNER, repo=REPO)

        with pytest.raises(GitHubClientError) as exc:
            await client.create_pull_request(
                title="t", body="b", head="feat/x", base="main"
            )
        assert exc.value.status_code == 422

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_401_unauthorized(self) -> None:
        respx.post(PULLS_URL).mock(
            return_value=httpx.Response(401, json={"message": "Bad credentials"})
        )
        client = GitHubClient(token="bad_token", owner=OWNER, repo=REPO)

        with pytest.raises(GitHubClientError) as exc:
            await client.create_pull_request(
                title="t", body="b", head="feat/x", base="main"
            )
        assert exc.value.status_code == 401

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_500_with_non_json_body(self) -> None:
        respx.post(PULLS_URL).mock(
            return_value=httpx.Response(500, text="Internal Server Error")
        )
        client = GitHubClient(token=TOKEN, owner=OWNER, repo=REPO)

        with pytest.raises(GitHubClientError) as exc:
            await client.create_pull_request(
                title="t", body="b", head="feat/x", base="main"
            )
        assert exc.value.status_code == 500

    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_correct_auth_header(self) -> None:
        route = respx.post(PULLS_URL).mock(
            return_value=httpx.Response(
                201,
                json={
                    "html_url": f"https://github.com/{OWNER}/{REPO}/pull/1",
                    "number": 1,
                    "title": "t",
                },
            )
        )
        client = GitHubClient(token=TOKEN, owner=OWNER, repo=REPO)
        await client.create_pull_request(
            title="t", body="b", head="feat/x", base="main"
        )

        assert route.calls[0].request.headers["authorization"] == f"Bearer {TOKEN}"

    @respx.mock
    @pytest.mark.asyncio
    async def test_sends_correct_accept_header(self) -> None:
        route = respx.post(PULLS_URL).mock(
            return_value=httpx.Response(
                201,
                json={
                    "html_url": f"https://github.com/{OWNER}/{REPO}/pull/1",
                    "number": 1,
                    "title": "t",
                },
            )
        )
        client = GitHubClient(token=TOKEN, owner=OWNER, repo=REPO)
        await client.create_pull_request(
            title="t", body="b", head="feat/x", base="main"
        )

        assert route.calls[0].request.headers["accept"] == "application/vnd.github+json"


# ---------------------------------------------------------------------------
# get_default_branch
# ---------------------------------------------------------------------------


class TestGetDefaultBranch:
    @respx.mock
    @pytest.mark.asyncio
    async def test_returns_main(self) -> None:
        respx.get(REPO_URL).mock(
            return_value=httpx.Response(200, json={"default_branch": "main"})
        )
        client = GitHubClient(token=TOKEN, owner=OWNER, repo=REPO)
        branch = await client.get_default_branch()
        assert branch == "main"

    @respx.mock
    @pytest.mark.asyncio
    async def test_returns_master(self) -> None:
        respx.get(REPO_URL).mock(
            return_value=httpx.Response(200, json={"default_branch": "master"})
        )
        client = GitHubClient(token=TOKEN, owner=OWNER, repo=REPO)
        branch = await client.get_default_branch()
        assert branch == "master"

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_404(self) -> None:
        respx.get(REPO_URL).mock(
            return_value=httpx.Response(404, json={"message": "Not Found"})
        )
        client = GitHubClient(token=TOKEN, owner=OWNER, repo=REPO)

        with pytest.raises(GitHubClientError) as exc:
            await client.get_default_branch()
        assert exc.value.status_code == 404

    @respx.mock
    @pytest.mark.asyncio
    async def test_raises_on_403_forbidden(self) -> None:
        respx.get(REPO_URL).mock(
            return_value=httpx.Response(403, json={"message": "Forbidden"})
        )
        client = GitHubClient(token=TOKEN, owner=OWNER, repo=REPO)

        with pytest.raises(GitHubClientError) as exc:
            await client.get_default_branch()
        assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# GitHubClientError
# ---------------------------------------------------------------------------


class TestGitHubClientError:
    def test_str_contains_status_code(self) -> None:
        err = GitHubClientError(422, "Validation Failed")
        assert "422" in str(err)

    def test_str_contains_message(self) -> None:
        err = GitHubClientError(422, "Validation Failed")
        assert "Validation Failed" in str(err)

    def test_status_code_attribute(self) -> None:
        err = GitHubClientError(503, "Service Unavailable")
        assert err.status_code == 503
