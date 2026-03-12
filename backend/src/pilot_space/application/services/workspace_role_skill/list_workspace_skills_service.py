"""ListWorkspaceSkillsService — list all non-deleted workspace role skills.

Source: Phase 16, WRSKL-01
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import TYPE_CHECKING

from pilot_space.application.services.workspace_role_skill.types import (
    ListWorkspaceSkillsPayload,
)

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from pilot_space.infrastructure.database.models.workspace_role_skill import (
        WorkspaceRoleSkill,
    )


class ListWorkspaceSkillsService:
    """List all non-deleted workspace role skills for a workspace.

    Returns all skills (pending and active) — admin view.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def execute(self, payload: ListWorkspaceSkillsPayload) -> Sequence[WorkspaceRoleSkill]:
        """List workspace role skills.

        Args:
            payload: Contains workspace_id to scope the query.

        Returns:
            Sequence of non-deleted WorkspaceRoleSkill rows, newest first.
        """
        from pilot_space.infrastructure.database.repositories.workspace_role_skill_repository import (
            WorkspaceRoleSkillRepository,
        )

        repo = WorkspaceRoleSkillRepository(self._session)
        return await repo.get_by_workspace(payload.workspace_id)


__all__ = ["ListWorkspaceSkillsService"]
