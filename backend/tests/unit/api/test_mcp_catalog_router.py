"""Tests for MCP catalog router — MCPC-01, MCPC-02, MCPC-04.

Tests verify REST endpoint behavior using httpx AsyncClient with FastAPI
dependency overrides — follows test_workspace_plugins_router.py pattern.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio

_USER_ID = uuid4()


def _create_test_app():
    """Create a minimal FastAPI app with mcp_catalog router and dependency overrides."""
    from unittest.mock import MagicMock

    from fastapi import FastAPI

    from pilot_space.api.v1.routers.mcp_catalog import router
    from pilot_space.dependencies.auth import get_current_user, get_db_session

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/mcp-catalog")

    # Build a minimal TokenPayload-like mock
    mock_user = MagicMock()
    mock_user.sub = str(_USER_ID)

    # Override DI dependencies for testing
    mock_session = AsyncMock()
    app.dependency_overrides[get_db_session] = lambda: mock_session
    app.dependency_overrides[get_current_user] = lambda: mock_user

    return app, mock_session


def _make_mock_catalog_entry(
    *,
    name: str = "Context7",
    description: str = "Up-to-date documentation for any library.",
    url_template: str = "https://mcp.context7.com/mcp",
    transport_type: str = "http",
    auth_type: str = "bearer",
    catalog_version: str = "1.0.0",
    is_official: bool = True,
    sort_order: int = 0,
    icon_url: str | None = None,
    setup_instructions: str | None = None,
    oauth_auth_url: str | None = None,
    oauth_token_url: str | None = None,
    oauth_scopes: str | None = None,
) -> MagicMock:
    """Build a mock McpCatalogEntry ORM instance."""
    entry = MagicMock()
    entry.id = uuid4()
    entry.name = name
    entry.description = description
    entry.url_template = url_template
    entry.transport_type = transport_type
    entry.auth_type = auth_type
    entry.catalog_version = catalog_version
    entry.is_official = is_official
    entry.sort_order = sort_order
    entry.icon_url = icon_url
    entry.setup_instructions = setup_instructions
    entry.oauth_auth_url = oauth_auth_url
    entry.oauth_token_url = oauth_token_url
    entry.oauth_scopes = oauth_scopes
    return entry


# ---------------------------------------------------------------------------
# MCPC-01: GET /api/v1/mcp-catalog returns 200 with items list
# ---------------------------------------------------------------------------


async def test_list_catalog_returns_200_with_items() -> None:
    """MCPC-01: GET /mcp-catalog returns 200 with items list and total."""
    app, _ = _create_test_app()
    mock_context7 = _make_mock_catalog_entry(name="Context7")
    mock_github = _make_mock_catalog_entry(
        name="GitHub",
        transport_type="http",
        auth_type="oauth2",
        sort_order=1,
    )

    with pytest.MonkeyPatch().context() as mp:
        import pilot_space.api.v1.routers.mcp_catalog as catalog_module

        async def _mock_get_all_active(self: object) -> list[MagicMock]:
            return [mock_context7, mock_github]

        mp.setattr(
            catalog_module.McpCatalogRepository,
            "get_all_active",
            _mock_get_all_active,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            resp = await client.get(
                "/api/v1/mcp-catalog",
                headers={"Authorization": "Bearer test-token"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] == 2
    assert len(data["items"]) == 2


async def test_list_catalog_response_shape() -> None:
    """MCPC-01: Response items include required fields: name, description, transport_type, auth_type, is_official, catalog_version."""
    app, _ = _create_test_app()
    mock_entry = _make_mock_catalog_entry(
        name="Context7",
        description="Docs on demand",
        transport_type="http",
        auth_type="bearer",
        is_official=True,
        catalog_version="1.0.0",
    )

    with pytest.MonkeyPatch().context() as mp:
        import pilot_space.api.v1.routers.mcp_catalog as catalog_module

        async def _mock_get_all_active(self: object) -> list[MagicMock]:
            return [mock_entry]

        mp.setattr(
            catalog_module.McpCatalogRepository,
            "get_all_active",
            _mock_get_all_active,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            resp = await client.get(
                "/api/v1/mcp-catalog",
                headers={"Authorization": "Bearer test-token"},
            )

    assert resp.status_code == 200
    item = resp.json()["items"][0]
    # Required fields per MCPC-01
    assert item["name"] == "Context7"
    assert item["description"] == "Docs on demand"
    assert item["transport_type"] == "http"
    assert item["auth_type"] == "bearer"
    assert item["is_official"] is True
    assert item["catalog_version"] == "1.0.0"
    assert "url_template" in item
    assert "id" in item


# ---------------------------------------------------------------------------
# MCPC-04: Context7 and GitHub seeded entries are present
# ---------------------------------------------------------------------------


async def test_official_entries_names_match_seeds() -> None:
    """MCPC-04: Catalog contains Context7 (bearer/http) and GitHub (oauth2/http) as official entries."""
    app, _ = _create_test_app()
    mock_context7 = _make_mock_catalog_entry(
        name="Context7",
        transport_type="http",
        auth_type="bearer",
        is_official=True,
    )
    mock_github = _make_mock_catalog_entry(
        name="GitHub",
        transport_type="http",
        auth_type="oauth2",
        is_official=True,
        sort_order=1,
        oauth_auth_url="https://github.com/login/oauth/authorize",
        oauth_token_url="https://github.com/login/oauth/access_token",
        oauth_scopes="repo read:user",
    )

    with pytest.MonkeyPatch().context() as mp:
        import pilot_space.api.v1.routers.mcp_catalog as catalog_module

        async def _mock_get_all_active(self: object) -> list[MagicMock]:
            return [mock_context7, mock_github]

        mp.setattr(
            catalog_module.McpCatalogRepository,
            "get_all_active",
            _mock_get_all_active,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            resp = await client.get(
                "/api/v1/mcp-catalog",
                headers={"Authorization": "Bearer test-token"},
            )

    assert resp.status_code == 200
    items = resp.json()["items"]
    names = {item["name"] for item in items}
    assert "Context7" in names
    assert "GitHub" in names

    context7_item = next(i for i in items if i["name"] == "Context7")
    assert context7_item["auth_type"] == "bearer"
    assert context7_item["transport_type"] == "http"
    assert context7_item["is_official"] is True

    github_item = next(i for i in items if i["name"] == "GitHub")
    assert github_item["auth_type"] == "oauth2"
    assert github_item["transport_type"] == "http"
    assert github_item["is_official"] is True
    assert github_item["oauth_auth_url"] == "https://github.com/login/oauth/authorize"
    assert github_item["oauth_scopes"] == "repo read:user"


# ---------------------------------------------------------------------------
# MCPC-02: WorkspaceMcpServerCreate accepts catalog_entry_id + installed_catalog_version
# ---------------------------------------------------------------------------


def test_workspace_mcp_server_create_accepts_catalog_fields() -> None:
    """MCPC-02: WorkspaceMcpServerCreate schema accepts catalog_entry_id and installed_catalog_version."""

    from pilot_space.api.v1.routers._mcp_server_schemas import WorkspaceMcpServerCreate

    catalog_id = uuid4()
    payload = WorkspaceMcpServerCreate(
        display_name="Context7",
        url="https://mcp.context7.com/mcp",
        auth_type="bearer",
        transport_type="http",
        catalog_entry_id=catalog_id,
        installed_catalog_version="1.0.0",
    )

    assert payload.catalog_entry_id == catalog_id
    assert payload.installed_catalog_version == "1.0.0"


def test_workspace_mcp_server_create_catalog_fields_are_optional() -> None:
    """MCPC-02: catalog_entry_id and installed_catalog_version are optional (default None)."""
    from pilot_space.api.v1.routers._mcp_server_schemas import WorkspaceMcpServerCreate

    payload = WorkspaceMcpServerCreate(
        display_name="My Server",
        url="https://example.com/mcp",
    )

    assert payload.catalog_entry_id is None
    assert payload.installed_catalog_version is None


def test_workspace_mcp_server_response_includes_catalog_fields() -> None:
    """MCPC-02: WorkspaceMcpServerResponse includes catalog_entry_id and installed_catalog_version."""

    from pilot_space.api.v1.routers._mcp_server_schemas import WorkspaceMcpServerResponse

    catalog_id = uuid4()
    server_id = uuid4()
    workspace_id = uuid4()

    response = WorkspaceMcpServerResponse(
        id=server_id,
        workspace_id=workspace_id,
        display_name="Context7",
        url="https://mcp.context7.com/mcp",
        auth_type="bearer",
        transport_type="http",
        last_status="connected",
        last_status_checked_at=datetime.now(tz=UTC),
        created_at=datetime.now(tz=UTC),
        catalog_entry_id=str(catalog_id),
        installed_catalog_version="1.0.0",
    )

    assert response.catalog_entry_id == str(catalog_id)
    assert response.installed_catalog_version == "1.0.0"


def test_workspace_mcp_server_response_catalog_fields_default_none() -> None:
    """MCPC-02: catalog fields on response default to None when not set."""

    from pilot_space.api.v1.routers._mcp_server_schemas import WorkspaceMcpServerResponse

    response = WorkspaceMcpServerResponse(
        id=uuid4(),
        workspace_id=uuid4(),
        display_name="My Server",
        url="https://example.com/mcp",
        auth_type="bearer",
        transport_type="http",
        last_status=None,
        last_status_checked_at=None,
        created_at=datetime.now(tz=UTC),
    )

    assert response.catalog_entry_id is None
    assert response.installed_catalog_version is None


# ---------------------------------------------------------------------------
# Empty catalog returns empty list (edge case)
# ---------------------------------------------------------------------------


async def test_list_catalog_empty_returns_empty_list() -> None:
    """GET /mcp-catalog returns empty items list when catalog has no entries."""
    app, _ = _create_test_app()

    with pytest.MonkeyPatch().context() as mp:
        import pilot_space.api.v1.routers.mcp_catalog as catalog_module

        async def _mock_get_all_active(self: object) -> list[object]:
            return []

        mp.setattr(
            catalog_module.McpCatalogRepository,
            "get_all_active",
            _mock_get_all_active,
        )

        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            resp = await client.get(
                "/api/v1/mcp-catalog",
                headers={"Authorization": "Bearer test-token"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0
