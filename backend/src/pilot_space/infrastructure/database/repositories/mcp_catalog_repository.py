"""McpCatalogRepository for MCP server catalog database operations.

Provides global (non-workspace-scoped) read operations for catalog entries.
The catalog is read-only at runtime — entries are seeded via migrations.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select

from pilot_space.infrastructure.database.models.mcp_catalog_entry import McpCatalogEntry

if TYPE_CHECKING:
    from collections.abc import Sequence
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession


class McpCatalogRepository:
    """Repository for McpCatalogEntry entities.

    Provides read-only access to the global MCP server catalog.
    All entries are shared across workspaces — no workspace scoping.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize repository with an async database session.

        Args:
            session: Async SQLAlchemy session.
        """
        self.session = session

    async def get_all_active(self) -> Sequence[McpCatalogEntry]:
        """Return all non-deleted catalog entries ordered by sort_order.

        Returns:
            Sequence of McpCatalogEntry rows where is_deleted=False,
            ordered by sort_order ascending.
        """
        query = (
            select(McpCatalogEntry)
            .where(McpCatalogEntry.is_deleted == False)  # noqa: E712
            .order_by(McpCatalogEntry.sort_order.asc())
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_by_id(self, entry_id: UUID) -> McpCatalogEntry | None:
        """Return a single catalog entry by ID, or None if not found/deleted.

        Args:
            entry_id: UUID of the catalog entry.

        Returns:
            McpCatalogEntry if found and not deleted, None otherwise.
        """
        query = select(McpCatalogEntry).where(
            McpCatalogEntry.id == entry_id,
            McpCatalogEntry.is_deleted == False,  # noqa: E712
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()


__all__ = ["McpCatalogRepository"]
