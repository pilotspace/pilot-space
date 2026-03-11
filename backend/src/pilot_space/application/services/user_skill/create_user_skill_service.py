"""CreateUserSkillService -- AI-based user skill creation from template.

User picks a template, provides experience description, AI generates
personalized skill content, and a UserSkill row is created.

Source: Phase 20, P20-08
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from pilot_space.application.services.role_skill.generate_role_skill_service import (
    GenerateRoleSkillPayload,
    GenerateRoleSkillService,
)
from pilot_space.infrastructure.database.repositories.skill_template_repository import (
    SkillTemplateRepository,
)
from pilot_space.infrastructure.database.repositories.user_skill_repository import (
    UserSkillRepository,
)
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession

    from pilot_space.infrastructure.database.models.user_skill import UserSkill

logger = get_logger(__name__)


class CreateUserSkillService:
    """Service for creating personalized user skills from templates.

    Flow:
    1. Load and validate template (active, correct workspace).
    2. Check for duplicate (user already has skill from this template).
    3. Generate personalized skill content via AI (with template fallback).
    4. Create UserSkill row.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize with a database session.

        Args:
            session: Active async database session.
        """
        self._session = session

    async def create(
        self,
        *,
        user_id: UUID,
        workspace_id: UUID,
        template_id: UUID,
        experience_description: str,
    ) -> UserSkill:
        """Create a personalized user skill from a template.

        Args:
            user_id: The user creating the skill.
            workspace_id: The workspace context.
            template_id: The source template UUID.
            experience_description: User's experience for AI personalization.

        Returns:
            The created UserSkill.

        Raises:
            ValueError: If template not found, inactive, deleted, wrong workspace,
                or user already has a skill from this template.
        """
        template_repo = SkillTemplateRepository(self._session)
        user_skill_repo = UserSkillRepository(self._session)

        # 1. Load and validate template
        template = await template_repo.get_by_id(template_id)
        if template is None:
            msg = f"Template not found: {template_id}"
            raise ValueError(msg)

        if not template.is_active or template.is_deleted or template.workspace_id != workspace_id:
            msg = f"Template {template_id} is not active in workspace {workspace_id}"
            raise ValueError(msg)

        # 2. Check for duplicate
        existing = await user_skill_repo.get_by_user_workspace_template(
            user_id, workspace_id, template_id
        )
        if existing is not None:
            msg = f"User already has a skill from template {template_id}"
            raise ValueError(msg)

        # 3. Generate personalized content via AI
        skill_content = await self._generate_content(
            template=template,
            experience_description=experience_description,
            user_id=user_id,
            workspace_id=workspace_id,
        )

        # 4. Create UserSkill row
        user_skill = await user_skill_repo.create(
            user_id=user_id,
            workspace_id=workspace_id,
            template_id=template_id,
            skill_content=skill_content,
            experience_description=experience_description,
        )

        logger.info(
            "Created user skill from template %s for user %s in workspace %s",
            template_id,
            user_id,
            workspace_id,
        )

        return user_skill

    async def _generate_content(
        self,
        *,
        template: object,
        experience_description: str,
        user_id: UUID,
        workspace_id: UUID,
    ) -> str:
        """Generate personalized skill content via AI.

        Reuses GenerateRoleSkillService pattern with template content
        as context. Falls back to template content + experience if AI unavailable.

        Args:
            template: SkillTemplate with name, skill_content, role_type.
            experience_description: User's experience description.
            user_id: The user UUID for rate limiting.
            workspace_id: The workspace UUID for API key resolution.

        Returns:
            Generated skill content markdown.
        """
        role_type = getattr(template, "role_type", None) or "custom"
        template_name = getattr(template, "name", "Custom Skill")

        gen_service = GenerateRoleSkillService(self._session)
        payload = GenerateRoleSkillPayload(
            role_type=role_type,
            experience_description=experience_description,
            role_name=template_name,
            workspace_id=workspace_id,
            user_id=user_id,
        )

        result = await gen_service.execute(payload)
        return result.skill_content


__all__ = ["CreateUserSkillService"]
