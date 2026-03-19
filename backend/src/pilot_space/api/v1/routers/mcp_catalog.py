"""MCP server catalog router — Phase 35, MCPC-01.

Provides a global read-only catalog of known MCP servers.
The catalog is not workspace-scoped — all authenticated users can browse it.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from pilot_space.dependencies import CurrentUser, DbSession
from pilot_space.infrastructure.database.repositories.mcp_catalog_repository import (
    McpCatalogRepository,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic response schemas
# ---------------------------------------------------------------------------


class McpCatalogEntryResponse(BaseModel):
    """Response schema for a single MCP catalog entry."""

    id: UUID
    name: str
    description: str
    url_template: str
    transport_type: str
    auth_type: str
    catalog_version: str
    is_official: bool
    icon_url: str | None = None
    setup_instructions: str | None = None
    sort_order: int = 0
    oauth_auth_url: str | None = None
    oauth_token_url: str | None = None
    oauth_scopes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class McpCatalogListResponse(BaseModel):
    """List response for MCP catalog entries."""

    items: list[McpCatalogEntryResponse]
    total: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=McpCatalogListResponse,
    tags=["mcp", "catalog"],
    summary="List MCP catalog entries",
    description=(
        "Returns all active entries in the global MCP server catalog. "
        "Available to all authenticated users. "
        "Entries are ordered by sort_order (ascending)."
    ),
)
async def list_catalog_entries(
    current_user: CurrentUser,
    session: DbSession,
) -> McpCatalogListResponse:
    """List all active MCP catalog entries.

    Args:
        current_user: Authenticated user (auth gate only, not used in query).
        session: Async database session.

    Returns:
        McpCatalogListResponse with items list and total count.
    """
    repo = McpCatalogRepository(session=session)
    entries = await repo.get_all_active()
    items = [McpCatalogEntryResponse.model_validate(e) for e in entries]
    return McpCatalogListResponse(items=items, total=len(items))


__all__ = ["router"]
