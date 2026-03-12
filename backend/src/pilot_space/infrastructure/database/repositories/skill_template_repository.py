"""Repository for SkillTemplate entities.

Provides workspace-scoped CRUD operations for skill templates.
Primary query patterns:
- get_active_by_workspace: catalog view (active, non-deleted, ordered by sort_order)
- get_by_workspace: admin list (all non-deleted rows)

Source: Phase 20, P20-01
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import and_, literal, select

from pilot_space.infrastructure.database.models.skill_template import SkillTemplate
from pilot_space.infrastructure.database.repositories.base import BaseRepository

if TYPE_CHECKING:
    from collections.abc import Sequence
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession


class SkillTemplateRepository(BaseRepository[SkillTemplate]):
    """Repository for SkillTemplate entities.

    All write operations use flush() (no commit) -- callers own transaction
    boundaries via the session context.
    """

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SkillTemplate)

    async def create(  # type: ignore[override]
        self,
        *,
        workspace_id: UUID,
        name: str,
        description: str,
        skill_content: str,
        source: str,
        icon: str = "Wand2",
        sort_order: int = 0,
        role_type: str | None = None,
        is_active: bool = True,
        created_by: UUID | None = None,
    ) -> SkillTemplate:
        """Create a new skill template.

        Args:
            workspace_id: Owning workspace UUID.
            name: Template display name.
            description: Brief description for catalog.
            skill_content: SKILL.md-format markdown content.
            source: Origin type ('built_in', 'workspace', 'custom').
            icon: Frontend icon identifier.
            sort_order: Display ordering.
            role_type: Optional SDLC role lineage.
            is_active: Whether template is visible in catalog.
            created_by: Admin user UUID who creates the template.

        Returns:
            Newly created SkillTemplate.
        """
        template = SkillTemplate(
            workspace_id=workspace_id,
            name=name,
            description=description,
            skill_content=skill_content,
            source=source,
            icon=icon,
            sort_order=sort_order,
            role_type=role_type,
            is_active=is_active,
            created_by=created_by,
        )
        self.session.add(template)
        await self.session.flush()
        await self.session.refresh(template)
        return template

    async def get_active_by_workspace(
        self,
        workspace_id: UUID,
        *,
        limit: int | None = None,
        offset: int = 0,
    ) -> Sequence[SkillTemplate]:
        """Get active templates for a workspace (catalog view).

        Returns only rows where is_active=True AND is_deleted=False,
        ordered by sort_order ascending.

        Args:
            workspace_id: The workspace UUID.
            limit: Maximum number of rows to return (None = no limit).
            offset: Number of rows to skip for pagination.

        Returns:
            Active SkillTemplate rows for the workspace.
        """
        query = (
            select(SkillTemplate)
            .where(
                and_(
                    SkillTemplate.workspace_id == workspace_id,
                    SkillTemplate.is_active == True,  # noqa: E712
                    SkillTemplate.is_deleted == False,  # noqa: E712
                )
            )
            .order_by(SkillTemplate.sort_order.asc())
            .offset(offset)
        )
        if limit is not None:
            query = query.limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def has_built_in_templates(
        self,
        workspace_id: UUID,
    ) -> bool:
        """Check if a workspace already has any built-in skill templates.

        Uses a SELECT EXISTS query to avoid loading all template rows.
        Used as an idempotency guard in SeedTemplatesService.

        Args:
            workspace_id: The workspace UUID.

        Returns:
            True if at least one built-in template exists, False otherwise.
        """
        subq = (
            select(literal(1))
            .where(
                and_(
                    SkillTemplate.workspace_id == workspace_id,
                    SkillTemplate.source == "built_in",
                    SkillTemplate.is_deleted == False,  # noqa: E712
                )
            )
            .exists()
        )
        result = await self.session.execute(select(subq))
        return bool(result.scalar())

    async def get_by_workspace(
        self,
        workspace_id: UUID,
        *,
        limit: int | None = None,
        offset: int = 0,
    ) -> Sequence[SkillTemplate]:
        """Get all non-deleted templates for a workspace (admin list view).

        Ordered by sort_order ascending.

        Args:
            workspace_id: The workspace UUID.
            limit: Maximum number of rows to return (None = no limit).
            offset: Number of rows to skip for pagination.

        Returns:
            All non-deleted SkillTemplate rows for the workspace.
        """
        query = (
            select(SkillTemplate)
            .where(
                and_(
                    SkillTemplate.workspace_id == workspace_id,
                    SkillTemplate.is_deleted == False,  # noqa: E712
                )
            )
            .order_by(SkillTemplate.sort_order.asc())
            .offset(offset)
        )
        if limit is not None:
            query = query.limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def update(  # type: ignore[override]
        self,
        template: SkillTemplate,
    ) -> SkillTemplate:
        """Update a skill template.

        Args:
            template: The template to update (already modified in-memory).

        Returns:
            Updated SkillTemplate.
        """
        await self.session.flush()
        await self.session.refresh(template)
        return template

    async def soft_delete(
        self,
        template_id: UUID,
    ) -> SkillTemplate | None:
        """Soft-delete a skill template.

        Sets is_deleted=True, deleted_at=now(), and is_active=False.

        Args:
            template_id: The template UUID to soft-delete.

        Returns:
            Updated SkillTemplate with is_deleted=True, or None.
        """
        template = await self.get_by_id(template_id)
        if template is None:
            return None
        template.is_active = False
        template.is_deleted = True
        template.deleted_at = datetime.now(tz=UTC)
        await self.session.flush()
        await self.session.refresh(template)
        return template


__all__ = ["SkillTemplateRepository"]
