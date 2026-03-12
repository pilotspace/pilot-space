"""Workspace role skill services for Pilot Space (CQRS-lite).

Provides services for workspace-level role skill management:
- CreateWorkspaceSkillService: AI-generate + persist a workspace skill
- ActivateWorkspaceSkillService: Approve (activate) a workspace skill
- ListWorkspaceSkillsService: List all non-deleted workspace skills
- DeleteWorkspaceSkillService: Soft-delete a workspace skill

Source: Phase 16, WRSKL-01..04
"""

from pilot_space.application.services.workspace_role_skill.activate_workspace_skill_service import (
    ActivateWorkspaceSkillService,
)
from pilot_space.application.services.workspace_role_skill.create_workspace_skill_service import (
    CreateWorkspaceSkillService,
)
from pilot_space.application.services.workspace_role_skill.delete_workspace_skill_service import (
    DeleteWorkspaceSkillService,
)
from pilot_space.application.services.workspace_role_skill.list_workspace_skills_service import (
    ListWorkspaceSkillsService,
)
from pilot_space.application.services.workspace_role_skill.types import (
    ActivateWorkspaceSkillPayload,
    CreateWorkspaceSkillPayload,
    DeleteWorkspaceSkillPayload,
    ListWorkspaceSkillsPayload,
)

__all__ = [
    "ActivateWorkspaceSkillPayload",
    "ActivateWorkspaceSkillService",
    "CreateWorkspaceSkillPayload",
    "CreateWorkspaceSkillService",
    "DeleteWorkspaceSkillPayload",
    "DeleteWorkspaceSkillService",
    "ListWorkspaceSkillsPayload",
    "ListWorkspaceSkillsService",
]
