"""GitHub client for creating pull requests via REST API.

Uses httpx directly (no PyGithub dependency) to avoid the extra install weight.
Requires a GitHub token with repo:write scope.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import httpx


@dataclass
class PRCreationResult:
    """Result of a successful PR creation."""

    url: str
    number: int
    title: str


class GitHubClientError(Exception):
    """Raised when the GitHub API returns a non-2xx response."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        super().__init__(f"GitHub API error {status_code}: {message}")


_HTTPS_RE = re.compile(r"https://github\.com/([^/]+)/([^/.]+?)(?:\.git)?$")
_SSH_RE = re.compile(r"git@github\.com:([^/]+)/([^/.]+?)(?:\.git)?$")


class GitHubClient:
    """Async GitHub REST API client scoped to a single repository.

    Exposes only the operations required by the ``pilot implement`` workflow:
    - :meth:`create_pull_request` — open a PR from a feature branch
    - :meth:`get_default_branch` — discover the repo's default branch

    Each method opens a fresh :class:`httpx.AsyncClient` so callers do not
    need to manage client lifecycle or worry about event-loop mismatches.
    """

    BASE_URL = "https://api.github.com"

    def __init__(self, token: str, owner: str, repo: str) -> None:
        """Initialise client for a specific repository.

        Args:
            token: GitHub personal access token or installation token
                   with at least ``repo:write`` scope.
            owner: Repository owner — GitHub user login or organisation name.
            repo:  Repository name without the owner prefix.
        """
        self._token = token
        self._owner = owner
        self._repo = repo
        self._headers: dict[str, str] = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    @classmethod
    def from_clone_url(cls, token: str, clone_url: str) -> GitHubClient:
        """Parse owner/repo from a GitHub clone URL and return a client.

        Supports both HTTPS and SSH remote formats:

        - ``https://github.com/org/repo.git``
        - ``git@github.com:org/repo.git``

        Args:
            token:     GitHub token passed directly to :meth:`__init__`.
            clone_url: Remote URL to parse.

        Returns:
            A :class:`GitHubClient` bound to the parsed owner and repo.

        Raises:
            ValueError: If the URL cannot be parsed as a GitHub remote.
        """
        https_match = _HTTPS_RE.match(clone_url)
        ssh_match = _SSH_RE.match(clone_url)
        match = https_match or ssh_match
        if not match:
            raise ValueError(f"Cannot parse GitHub owner/repo from URL: {clone_url}")
        return cls(token=token, owner=match.group(1), repo=match.group(2))

    async def create_pull_request(
        self,
        *,
        title: str,
        body: str,
        head: str,
        base: str,
        draft: bool = False,
    ) -> PRCreationResult:
        """Create a pull request on the repository.

        Args:
            title: PR title shown in the GitHub UI.
            body:  PR description (Markdown supported).
            head:  Source branch name (the feature branch).
            base:  Target branch name (e.g. ``"main"``).
            draft: When ``True``, opens the PR as a draft.

        Returns:
            :class:`PRCreationResult` with the PR URL, number, and title.

        Raises:
            GitHubClientError: On any non-2xx response from the GitHub API.
        """
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self.BASE_URL}/repos/{self._owner}/{self._repo}/pulls",
                headers=self._headers,
                json={
                    "title": title,
                    "body": body,
                    "head": head,
                    "base": base,
                    "draft": draft,
                },
                timeout=30.0,
            )
        if resp.is_error:
            try:
                msg = resp.json().get("message", resp.text)
            except Exception:
                msg = resp.text
            raise GitHubClientError(resp.status_code, str(msg))

        data = resp.json()
        return PRCreationResult(
            url=data["html_url"],
            number=data["number"],
            title=data["title"],
        )

    async def get_default_branch(self) -> str:
        """Return the default branch name for the repository.

        Fetches repository metadata from ``GET /repos/{owner}/{repo}``
        and extracts the ``default_branch`` field.

        Returns:
            Branch name string, e.g. ``"main"`` or ``"master"``.

        Raises:
            GitHubClientError: On any non-2xx response.
        """
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.BASE_URL}/repos/{self._owner}/{self._repo}",
                headers=self._headers,
                timeout=10.0,
            )
        if resp.is_error:
            raise GitHubClientError(resp.status_code, "Failed to fetch repository info")
        return str(resp.json()["default_branch"])
