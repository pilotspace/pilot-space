"""Tests for PilotAPIClient auth header injection and error propagation."""

from __future__ import annotations

import httpx
import pytest
import respx

from pilot_cli.api_client import PilotAPIClient, PilotAPIError
from pilot_cli.config import PilotConfig

BASE = "https://api.example.io"
KEY = "ps_test123"


@respx.mock
@pytest.mark.asyncio
async def test_validate_key_injects_bearer_header() -> None:
    """validate_key sends Authorization: Bearer header."""
    route = respx.post(f"{BASE}/api/v1/auth/validate-key").mock(
        return_value=httpx.Response(200, json={"workspace_slug": "acme"})
    )
    client = PilotAPIClient(api_url=BASE, api_key=KEY)
    result = await client.validate_key()

    assert result["workspace_slug"] == "acme"
    assert route.calls[0].request.headers["authorization"] == f"Bearer {KEY}"


@respx.mock
@pytest.mark.asyncio
async def test_validate_key_sends_content_type_json() -> None:
    """validate_key sends Content-Type: application/json header."""
    route = respx.post(f"{BASE}/api/v1/auth/validate-key").mock(
        return_value=httpx.Response(200, json={"workspace_slug": "acme"})
    )
    client = PilotAPIClient(api_url=BASE, api_key=KEY)
    await client.validate_key()

    assert route.calls[0].request.headers["content-type"] == "application/json"


@respx.mock
@pytest.mark.asyncio
async def test_api_error_propagation() -> None:
    """4xx responses raise PilotAPIError with status_code."""
    respx.post(f"{BASE}/api/v1/auth/validate-key").mock(
        return_value=httpx.Response(401, json={"detail": "Invalid API key"})
    )
    client = PilotAPIClient(api_url=BASE, api_key="bad_key")

    with pytest.raises(PilotAPIError) as exc_info:
        await client.validate_key()

    assert exc_info.value.status_code == 401
    assert "Invalid API key" in exc_info.value.detail


@respx.mock
@pytest.mark.asyncio
async def test_api_error_500_propagation() -> None:
    """5xx responses raise PilotAPIError with status_code."""
    respx.post(f"{BASE}/api/v1/auth/validate-key").mock(
        return_value=httpx.Response(500, text="Internal Server Error")
    )
    client = PilotAPIClient(api_url=BASE, api_key=KEY)

    with pytest.raises(PilotAPIError) as exc_info:
        await client.validate_key()

    assert exc_info.value.status_code == 500


@respx.mock
@pytest.mark.asyncio
async def test_get_implement_context_returns_data() -> None:
    """get_implement_context returns parsed JSON on 200."""
    mock_ctx = {
        "issue": {"title": "Fix bug"},
        "suggested_branch": "feat/ps-42-fix-bug",
    }
    respx.get(f"{BASE}/api/v1/issues/PS-42/implement-context").mock(
        return_value=httpx.Response(200, json=mock_ctx)
    )
    client = PilotAPIClient(api_url=BASE, api_key=KEY)
    result = await client.get_implement_context("PS-42")

    assert result["issue"]["title"] == "Fix bug"
    assert result["suggested_branch"] == "feat/ps-42-fix-bug"


@respx.mock
@pytest.mark.asyncio
async def test_get_implement_context_404_raises() -> None:
    """get_implement_context raises PilotAPIError on 404."""
    respx.get(f"{BASE}/api/v1/issues/PS-999/implement-context").mock(
        return_value=httpx.Response(404, json={"detail": "Issue not found"})
    )
    client = PilotAPIClient(api_url=BASE, api_key=KEY)

    with pytest.raises(PilotAPIError) as exc_info:
        await client.get_implement_context("PS-999")

    assert exc_info.value.status_code == 404


@respx.mock
@pytest.mark.asyncio
async def test_update_issue_status_sends_patch() -> None:
    """update_issue_status sends PATCH /issues/{id}/state with correct JSON body."""
    route = respx.patch(f"{BASE}/api/v1/issues/PS-42/state").mock(
        return_value=httpx.Response(204)
    )
    client = PilotAPIClient(api_url=BASE, api_key=KEY)
    await client.update_issue_status("PS-42", "in_progress")

    import json

    body = json.loads(route.calls[0].request.content)
    assert body == {"state": "in_progress"}


@respx.mock
@pytest.mark.asyncio
async def test_update_issue_status_error_raises() -> None:
    """update_issue_status raises PilotAPIError on non-2xx."""
    respx.patch(f"{BASE}/api/v1/issues/PS-42/state").mock(
        return_value=httpx.Response(403, json={"detail": "Forbidden"})
    )
    client = PilotAPIClient(api_url=BASE, api_key=KEY)

    with pytest.raises(PilotAPIError) as exc_info:
        await client.update_issue_status("PS-42", "in_progress")

    assert exc_info.value.status_code == 403


def test_from_config_constructs_client() -> None:
    """from_config builds client with correct base URL and key."""
    config = PilotConfig(
        api_url=BASE,
        api_key=KEY,
        workspace_slug="acme",
    )
    client = PilotAPIClient.from_config(config)

    assert client._base_url == BASE
    assert client._headers["Authorization"] == f"Bearer {KEY}"


def test_base_url_trailing_slash_stripped() -> None:
    """Trailing slash in api_url is stripped to avoid double-slash URLs."""
    client = PilotAPIClient(api_url=f"{BASE}/", api_key=KEY)
    assert client._base_url == BASE


def test_pilot_api_error_str_representation() -> None:
    """PilotAPIError.__str__ contains status code and detail."""
    err = PilotAPIError(status_code=422, detail="Validation failed")
    assert "422" in str(err)
    assert "Validation failed" in str(err)


@respx.mock
@pytest.mark.asyncio
async def test_api_error_non_json_body_falls_back_to_text() -> None:
    """PilotAPIError detail falls back to response text for non-JSON bodies."""
    respx.post(f"{BASE}/api/v1/auth/validate-key").mock(
        return_value=httpx.Response(503, text="Service Unavailable")
    )
    client = PilotAPIClient(api_url=BASE, api_key=KEY)

    with pytest.raises(PilotAPIError) as exc_info:
        await client.validate_key()

    assert "Service Unavailable" in exc_info.value.detail
