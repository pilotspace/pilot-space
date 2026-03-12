"""CreateWorkspaceSkillService — AI-generate then persist a workspace role skill.

Implements CQRS-lite command pattern.

Source: Phase 16, WRSKL-01
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from pilot_space.application.services.workspace_role_skill.types import (
    CreateWorkspaceSkillPayload,
)
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from pilot_space.infrastructure.database.models.workspace_role_skill import (
        WorkspaceRoleSkill,
    )

logger = get_logger(__name__)


class CreateWorkspaceSkillService:
    """Generate AI skill content then persist a new workspace role skill.

    1. Calls GenerateRoleSkillService to produce AI-generated skill_content.
    2. Persists via WorkspaceRoleSkillRepository with is_active=False.
    3. Returns the created entity.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def execute(self, payload: CreateWorkspaceSkillPayload) -> WorkspaceRoleSkill:
        """Generate and create a workspace role skill.

        Args:
            payload: Creation parameters including role_type, role_name,
                     experience_description, workspace_id, and created_by.

        Returns:
            Created WorkspaceRoleSkill with is_active=False.

        Raises:
            ValueError: If role_type is invalid.
        """
        from pilot_space.application.services.role_skill.generate_role_skill_service import (
            GenerateRoleSkillPayload,
            GenerateRoleSkillService,
        )
        from pilot_space.infrastructure.database.repositories.workspace_role_skill_repository import (
            WorkspaceRoleSkillRepository,
        )

        # Generate skill content via AI (falls back to template if AI unavailable)
        generate_svc = GenerateRoleSkillService(session=self._session)
        result = await generate_svc.execute(
            GenerateRoleSkillPayload(
                role_type=payload.role_type,
                experience_description=payload.experience_description,
                role_name=payload.role_name,
                workspace_id=payload.workspace_id,
                user_id=payload.created_by,
            )
        )

        # Persist as inactive (WRSKL-02: requires explicit activation)
        repo = WorkspaceRoleSkillRepository(self._session)
        skill = await repo.create(
            workspace_id=payload.workspace_id,
            created_by=payload.created_by,
            role_type=payload.role_type,
            role_name=result.suggested_role_name,
            skill_content=result.skill_content,
            experience_description=payload.experience_description,
        )

        logger.info(
            "Workspace role skill created",
            extra={
                "workspace_id": str(payload.workspace_id),
                "role_type": payload.role_type,
                "created_by": str(payload.created_by),
                "generation_model": result.generation_model,
            },
        )

        return skill


__all__ = ["CreateWorkspaceSkillService"]
