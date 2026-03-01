"""Pilot Space API client — thin httpx wrapper with Bearer auth.

Usage:
    client = PilotAPIClient(api_url="https://...", api_key="ps_...")
    ctx = await client.get_implement_context("PS-42")
"""

from __future__ import annotations

from typing import Any

import httpx

from pilot_cli.config import PilotConfig


class PilotAPIError(Exception):
    """Raised when Pilot Space API returns an error response."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"API error {status_code}: {detail}")


class PilotAPIClient:
    """Async httpx client for Pilot Space REST API.

    Uses a fresh AsyncClient per call to avoid event-loop lifecycle issues
    when the caller manages its own event loop (e.g. Typer + asyncio.run).
    """

    def __init__(self, api_url: str, api_key: str) -> None:
        self._base_url = api_url.rstrip("/")
        self._headers: dict[str, str] = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    @classmethod
    def from_config(cls, config: PilotConfig) -> PilotAPIClient:
        """Construct client from a loaded PilotConfig."""
        return cls(api_url=config.api_url, api_key=config.api_key)

    async def validate_key(self) -> dict[str, Any]:
        """Validate the configured API key.

        Calls POST /api/v1/auth/validate-key.

        Returns:
            Parsed JSON body, e.g. {"workspace_slug": "acme"}.

        Raises:
            PilotAPIError: On non-2xx response.
        """
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{self._base_url}/api/v1/auth/validate-key",
                headers=self._headers,
                timeout=10.0,
            )
            self._raise_for_error(resp)
            return resp.json()  # type: ignore[no-any-return]

    async def get_implement_context(self, issue_id: str) -> dict[str, Any]:
        """Fetch implementation context for an issue.

        Calls GET /api/v1/issues/{issue_id}/implement-context.

        Args:
            issue_id: Issue identifier, e.g. "PS-42".

        Returns:
            Parsed JSON body with issue metadata, codebase context, and
            suggested branch name.

        Raises:
            PilotAPIError: On non-2xx response.
        """
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self._base_url}/api/v1/issues/{issue_id}/implement-context",
                headers=self._headers,
                timeout=30.0,
            )
            self._raise_for_error(resp)
            return resp.json()  # type: ignore[no-any-return]

    async def update_issue_status(self, issue_id: str, status: str) -> None:
        """Update the status of an issue.

        Calls PATCH /api/v1/issues/{issue_id}/state with {"state": status}.

        Args:
            issue_id: Issue identifier, e.g. "PS-42".
            status: Target status, e.g. "in_progress", "in_review".

        Raises:
            PilotAPIError: On non-2xx response.
        """
        async with httpx.AsyncClient() as client:
            resp = await client.patch(
                f"{self._base_url}/api/v1/issues/{issue_id}/state",
                headers=self._headers,
                json={"state": status},
                timeout=10.0,
            )
            self._raise_for_error(resp)

    @staticmethod
    def _raise_for_error(response: httpx.Response) -> None:
        """Raise PilotAPIError for any non-2xx response.

        Args:
            response: The httpx Response to inspect.

        Raises:
            PilotAPIError: If response.is_error is True.
        """
        if response.is_error:
            try:
                detail = response.json().get("detail", response.text)
            except Exception:
                detail = response.text
            raise PilotAPIError(response.status_code, str(detail))
