"""Repository for SkillActionButton entities.

Provides workspace-scoped CRUD operations for action buttons.
Primary query patterns:
- get_active_by_workspace: hot-path for member button display
- get_all_by_workspace: admin list (includes inactive)
- get_by_id: single button lookup by workspace + ID
- deactivate_by_plugin_id: bulk deactivate on plugin uninstall

Source: Phase 17, SKBTN-01..04
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import and_, cast, select, update
from sqlalchemy.dialects.postgresql import JSONB

from pilot_space.infrastructure.database.models.skill_action_button import (
    SkillActionButton,
)
from pilot_space.infrastructure.database.repositories.base import BaseRepository

if TYPE_CHECKING:
    from collections.abc import Sequence
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession


class SkillActionButtonRepository(BaseRepository[SkillActionButton]):
    """Repository for SkillActionButton entities.

    All write operations use flush() (no commit) -- callers own transaction
    boundaries via the session context.
    """

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SkillActionButton)

    async def get_active_by_workspace(
        self,
        workspace_id: UUID,
        *,
        limit: int | None = None,
        offset: int = 0,
    ) -> Sequence[SkillActionButton]:
        """Get active buttons for a workspace (member hot-path).

        Returns only rows where is_active=True AND is_deleted=False,
        ordered by sort_order ascending.

        Args:
            workspace_id: The workspace UUID.
            limit: Maximum number of rows to return (None = no limit).
            offset: Number of rows to skip for pagination.

        Returns:
            Active SkillActionButton rows ordered by sort_order.
        """
        query = (
            select(SkillActionButton)
            .where(
                and_(
                    SkillActionButton.workspace_id == workspace_id,
                    SkillActionButton.is_active == True,  # noqa: E712
                    SkillActionButton.is_deleted == False,  # noqa: E712
                )
            )
            .order_by(SkillActionButton.sort_order.asc())
            .offset(offset)
        )
        if limit is not None:
            query = query.limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_all_by_workspace(
        self,
        workspace_id: UUID,
        *,
        limit: int | None = None,
        offset: int = 0,
    ) -> Sequence[SkillActionButton]:
        """Get all non-deleted buttons for a workspace (admin view).

        Ordered by sort_order ascending so admin sees display order.

        Args:
            workspace_id: The workspace UUID.
            limit: Maximum number of rows to return (None = no limit).
            offset: Number of rows to skip for pagination.

        Returns:
            All non-deleted SkillActionButton rows for the workspace.
        """
        query = (
            select(SkillActionButton)
            .where(
                and_(
                    SkillActionButton.workspace_id == workspace_id,
                    SkillActionButton.is_deleted == False,  # noqa: E712
                )
            )
            .order_by(SkillActionButton.sort_order.asc())
            .offset(offset)
        )
        if limit is not None:
            query = query.limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_by_workspace_and_id(
        self,
        workspace_id: UUID,
        button_id: UUID,
    ) -> SkillActionButton | None:
        """Get a single button by workspace and ID.

        Args:
            workspace_id: The workspace UUID.
            button_id: The button UUID.

        Returns:
            The matching button or None.
        """
        query = select(SkillActionButton).where(
            and_(
                SkillActionButton.id == button_id,
                SkillActionButton.workspace_id == workspace_id,
                SkillActionButton.is_deleted == False,  # noqa: E712
            )
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def create(self, entity: SkillActionButton) -> SkillActionButton:  # type: ignore[override]
        """Create a new action button.

        Args:
            entity: The SkillActionButton instance to persist.

        Returns:
            The persisted SkillActionButton with generated ID.
        """
        self.session.add(entity)
        await self.session.flush()
        await self.session.refresh(entity)
        return entity

    async def update(self, entity: SkillActionButton) -> SkillActionButton:
        """Update an existing action button.

        Caller mutates the entity, then calls update() to flush changes.

        Args:
            entity: The SkillActionButton instance with updated fields.

        Returns:
            The updated SkillActionButton.
        """
        merged = await self.session.merge(entity)
        await self.session.flush()
        await self.session.refresh(merged)
        return merged

    async def soft_delete(  # type: ignore[override]
        self,
        button: SkillActionButton,
    ) -> None:
        """Soft-delete an action button.

        Sets is_deleted=True, deleted_at=now(), and is_active=False
        atomically to ensure immediate exclusion from display.

        Args:
            button: The SkillActionButton to soft-delete.
        """
        button.is_active = False
        button.is_deleted = True
        button.deleted_at = datetime.now(tz=UTC)
        await self.session.flush()

    async def deactivate_by_plugin_id(
        self,
        workspace_id: UUID,
        plugin_id: str,
    ) -> int:
        """Bulk deactivate buttons associated with a plugin.

        Finds buttons where binding_metadata contains the given plugin_id
        and sets is_active=False.

        Args:
            workspace_id: The workspace UUID.
            plugin_id: The plugin ID string to match in binding_metadata.

        Returns:
            Number of rows updated.
        """
        stmt = (
            update(SkillActionButton)
            .where(
                and_(
                    SkillActionButton.workspace_id == workspace_id,
                    SkillActionButton.is_deleted == False,  # noqa: E712
                    cast(SkillActionButton.binding_metadata, JSONB)["plugin_id"].astext
                    == plugin_id,
                )
            )
            .values(is_active=False)
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return result.rowcount  # type: ignore[return-value]


__all__ = ["SkillActionButtonRepository"]
