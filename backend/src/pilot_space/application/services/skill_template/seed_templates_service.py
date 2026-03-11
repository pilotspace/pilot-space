"""Seed templates service -- P20-07.

Seeds new workspaces with built-in skill templates from RoleTemplate rows.
Non-fatal: all exceptions are caught and logged.

Source: Phase 20, P20-07
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from pilot_space.infrastructure.database.repositories.role_skill_repository import (
    RoleTemplateRepository,
)
from pilot_space.infrastructure.database.repositories.skill_template_repository import (
    SkillTemplateRepository,
)
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)


class SeedTemplatesService:
    """Seed new workspaces with built-in skill templates from RoleTemplates.

    Non-fatal: all exceptions are caught and logged. Workspace creation
    succeeds regardless of seeding outcome.

    Called via ``asyncio.create_task`` in workspace creation -- fire-and-forget.
    """

    def __init__(self, db_session: AsyncSession) -> None:
        """Initialize with a database session.

        Args:
            db_session: Active async database session.
        """
        self._session = db_session

    async def seed_workspace(self, workspace_id: UUID) -> None:
        """Copy all RoleTemplate rows into skill_templates as built_in.

        Idempotent: skips if workspace already has built_in templates.
        Non-fatal: wraps entire body in try/except, logs errors, never raises.

        Args:
            workspace_id: UUID of the newly created workspace.
        """
        try:
            await self._do_seed(workspace_id)
        except Exception:
            logger.exception(
                "Failed to seed skill templates for workspace %s",
                workspace_id,
            )

    async def _do_seed(self, workspace_id: UUID) -> None:
        """Internal seeding logic.

        Args:
            workspace_id: UUID of the workspace to seed.
        """
        skill_repo = SkillTemplateRepository(self._session)

        # Idempotency guard: check if workspace already has built_in templates
        existing = await skill_repo.get_by_workspace(workspace_id)
        has_built_in = any(getattr(t, "source", None) == "built_in" for t in existing)
        if has_built_in:
            logger.debug(
                "Workspace %s already has built_in templates, skipping seeding",
                workspace_id,
            )
            return

        # Load all role templates
        role_repo = RoleTemplateRepository(self._session)
        role_templates = await role_repo.get_all_ordered()

        for rt in role_templates:
            await skill_repo.create(
                workspace_id=workspace_id,
                name=rt.display_name,
                description=rt.description,
                skill_content=rt.default_skill_content,
                source="built_in",
                icon=rt.icon,
                sort_order=rt.sort_order,
                role_type=rt.role_type,
            )

        logger.info(
            "Seeded %d built-in skill templates for workspace %s",
            len(role_templates),
            workspace_id,
        )


__all__ = ["SeedTemplatesService"]
