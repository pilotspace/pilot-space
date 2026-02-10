"""Type aliases for service dependency injection.

Provides clean, reusable type hints for FastAPI router endpoints using
the dependency-injector + FastAPI integration pattern.

Pattern from Context7 docs:
https://python-dependency-injector.ets-labs.io/examples/fastapi.html

Usage:
    @router.post("/issues")
    @inject
    async def create_issue(
        request: IssueCreateRequest,
        session: SessionDep,  # Trigger session context
        service: CreateIssueServiceDep,  # Auto-injected from container
    ):
        result = await service.execute(payload)
        return IssueResponse.from_issue(result.issue)
"""

from typing import Annotated

from dependency_injector.wiring import Provide
from fastapi import Depends

from pilot_space.application.services.ai_context import (
    ExportAIContextService,
    GenerateAIContextService,
    RefineAIContextService,
)
from pilot_space.application.services.annotation import (
    CreateAnnotationService,
)
from pilot_space.application.services.cycle import (
    AddIssueToCycleService,
    CreateCycleService,
    GetCycleService,
    RolloverCycleService,
    UpdateCycleService,
)
from pilot_space.application.services.discussion import (
    CreateDiscussionService,
)
from pilot_space.application.services.homepage import (
    DismissSuggestionService,
    GetActivityService,
    GetDigestService,
)
from pilot_space.application.services.integration import (
    AutoTransitionService,
    ConnectGitHubService,
    LinkCommitService,
    ProcessGitHubWebhookService,
)
from pilot_space.application.services.issue import (
    ActivityService,
    CreateIssueService,
    GetIssueService,
    ListIssuesService,
    UpdateIssueService,
)
from pilot_space.application.services.note import (
    CreateNoteFromChatService,
    CreateNoteService,
    GetNoteService,
    UpdateNoteService,
)
from pilot_space.application.services.note.ai_update_service import (
    NoteAIUpdateService,
)
from pilot_space.application.services.onboarding import (
    CreateGuidedNoteService,
    GetOnboardingService,
    UpdateOnboardingService,
)
from pilot_space.application.services.role_skill import (
    CreateRoleSkillService,
    DeleteRoleSkillService,
    GenerateRoleSkillService,
    ListRoleSkillsService,
    UpdateRoleSkillService,
)
from pilot_space.application.services.workspace import WorkspaceService
from pilot_space.container import Container
from pilot_space.infrastructure.database.repositories.activity_repository import (
    ActivityRepository,
)
from pilot_space.infrastructure.database.repositories.cycle_repository import (
    CycleRepository,
)
from pilot_space.infrastructure.database.repositories.invitation_repository import (
    InvitationRepository,
)
from pilot_space.infrastructure.database.repositories.issue_repository import (
    IssueRepository,
)
from pilot_space.infrastructure.database.repositories.note_issue_link_repository import (
    NoteIssueLinkRepository,
)
from pilot_space.infrastructure.database.repositories.note_repository import (
    NoteRepository,
)
from pilot_space.infrastructure.database.repositories.project_repository import (
    ProjectRepository,
)
from pilot_space.infrastructure.database.repositories.user_repository import (
    UserRepository,
)
from pilot_space.infrastructure.database.repositories.workspace_repository import (
    WorkspaceRepository,
)

# ===== Repository Dependencies =====

ActivityRepositoryDep = Annotated[
    ActivityRepository,
    Depends(Provide[Container.activity_repository]),
]

CycleRepositoryDep = Annotated[
    CycleRepository,
    Depends(Provide[Container.cycle_repository]),
]

InvitationRepositoryDep = Annotated[
    InvitationRepository,
    Depends(Provide[Container.invitation_repository]),
]

IssueRepositoryDep = Annotated[
    IssueRepository,
    Depends(Provide[Container.issue_repository]),
]

NoteIssueLinkRepositoryDep = Annotated[
    NoteIssueLinkRepository,
    Depends(Provide[Container.note_issue_link_repository]),
]

NoteRepositoryDep = Annotated[
    NoteRepository,
    Depends(Provide[Container.note_repository]),
]

ProjectRepositoryDep = Annotated[
    ProjectRepository,
    Depends(Provide[Container.project_repository]),
]

UserRepositoryDep = Annotated[
    UserRepository,
    Depends(Provide[Container.user_repository]),
]

WorkspaceRepositoryDep = Annotated[
    WorkspaceRepository,
    Depends(Provide[Container.workspace_repository]),
]

# ===== Issue Service Dependencies =====

CreateIssueServiceDep = Annotated[
    CreateIssueService,
    Depends(Provide[Container.create_issue_service]),
]

UpdateIssueServiceDep = Annotated[
    UpdateIssueService,
    Depends(Provide[Container.update_issue_service]),
]

GetIssueServiceDep = Annotated[
    GetIssueService,
    Depends(Provide[Container.get_issue_service]),
]

ListIssuesServiceDep = Annotated[
    ListIssuesService,
    Depends(Provide[Container.list_issues_service]),
]

ActivityServiceDep = Annotated[
    ActivityService,
    Depends(Provide[Container.activity_service]),
]

# ===== Note Service Dependencies =====

CreateNoteServiceDep = Annotated[
    CreateNoteService,
    Depends(Provide[Container.create_note_service]),
]

UpdateNoteServiceDep = Annotated[
    UpdateNoteService,
    Depends(Provide[Container.update_note_service]),
]

GetNoteServiceDep = Annotated[
    GetNoteService,
    Depends(Provide[Container.get_note_service]),
]

CreateNoteFromChatServiceDep = Annotated[
    CreateNoteFromChatService,
    Depends(Provide[Container.create_note_from_chat_service]),
]

NoteAIUpdateServiceDep = Annotated[
    NoteAIUpdateService,
    Depends(Provide[Container.ai_update_note_service]),
]

# ===== Cycle Service Dependencies =====

CreateCycleServiceDep = Annotated[
    CreateCycleService,
    Depends(Provide[Container.create_cycle_service]),
]

UpdateCycleServiceDep = Annotated[
    UpdateCycleService,
    Depends(Provide[Container.update_cycle_service]),
]

GetCycleServiceDep = Annotated[
    GetCycleService,
    Depends(Provide[Container.get_cycle_service]),
]

AddIssueToCycleServiceDep = Annotated[
    AddIssueToCycleService,
    Depends(Provide[Container.add_issue_to_cycle_service]),
]

RolloverCycleServiceDep = Annotated[
    RolloverCycleService,
    Depends(Provide[Container.rollover_cycle_service]),
]

# ===== AI Context Service Dependencies =====

GenerateAIContextServiceDep = Annotated[
    GenerateAIContextService,
    Depends(Provide[Container.generate_ai_context_service]),
]

RefineAIContextServiceDep = Annotated[
    RefineAIContextService,
    Depends(Provide[Container.refine_ai_context_service]),
]

ExportAIContextServiceDep = Annotated[
    ExportAIContextService,
    Depends(Provide[Container.export_ai_context_service]),
]

# ===== Annotation Service Dependencies =====

CreateAnnotationServiceDep = Annotated[
    CreateAnnotationService,
    Depends(Provide[Container.create_annotation_service]),
]

# ===== Discussion Service Dependencies =====

CreateDiscussionServiceDep = Annotated[
    CreateDiscussionService,
    Depends(Provide[Container.create_discussion_service]),
]

# ===== Integration Service Dependencies =====

ConnectGitHubServiceDep = Annotated[
    ConnectGitHubService,
    Depends(Provide[Container.connect_github_service]),
]

ProcessGitHubWebhookServiceDep = Annotated[
    ProcessGitHubWebhookService,
    Depends(Provide[Container.process_github_webhook_service]),
]

LinkCommitServiceDep = Annotated[
    LinkCommitService,
    Depends(Provide[Container.link_commit_service]),
]

AutoTransitionServiceDep = Annotated[
    AutoTransitionService,
    Depends(Provide[Container.auto_transition_service]),
]

# ===== Onboarding Service Dependencies =====

CreateGuidedNoteServiceDep = Annotated[
    CreateGuidedNoteService,
    Depends(Provide[Container.create_guided_note_service]),
]

GetOnboardingServiceDep = Annotated[
    GetOnboardingService,
    Depends(Provide[Container.get_onboarding_service]),
]

UpdateOnboardingServiceDep = Annotated[
    UpdateOnboardingService,
    Depends(Provide[Container.update_onboarding_service]),
]

# ===== Role Skill Service Dependencies =====

CreateRoleSkillServiceDep = Annotated[
    CreateRoleSkillService,
    Depends(Provide[Container.create_role_skill_service]),
]

UpdateRoleSkillServiceDep = Annotated[
    UpdateRoleSkillService,
    Depends(Provide[Container.update_role_skill_service]),
]

DeleteRoleSkillServiceDep = Annotated[
    DeleteRoleSkillService,
    Depends(Provide[Container.delete_role_skill_service]),
]

ListRoleSkillsServiceDep = Annotated[
    ListRoleSkillsService,
    Depends(Provide[Container.list_role_skills_service]),
]

GenerateRoleSkillServiceDep = Annotated[
    GenerateRoleSkillService,
    Depends(Provide[Container.generate_role_skill_service]),
]

# ===== Homepage Service Dependencies =====

GetActivityServiceDep = Annotated[
    GetActivityService,
    Depends(Provide[Container.get_activity_service]),
]

GetDigestServiceDep = Annotated[
    GetDigestService,
    Depends(Provide[Container.get_digest_service]),
]

DismissSuggestionServiceDep = Annotated[
    DismissSuggestionService,
    Depends(Provide[Container.dismiss_suggestion_service]),
]

# ===== Workspace Service Dependencies =====

WorkspaceServiceDep = Annotated[
    WorkspaceService,
    Depends(Provide[Container.workspace_service]),
]

__all__ = [
    # Repository Dependencies
    "ActivityRepositoryDep",
    # Service Dependencies
    "ActivityServiceDep",
    "AddIssueToCycleServiceDep",
    "AutoTransitionServiceDep",
    "ConnectGitHubServiceDep",
    "CreateAnnotationServiceDep",
    "CreateCycleServiceDep",
    "CreateDiscussionServiceDep",
    "CreateGuidedNoteServiceDep",
    "CreateIssueServiceDep",
    "CreateNoteFromChatServiceDep",
    "CreateNoteServiceDep",
    "CreateRoleSkillServiceDep",
    "CycleRepositoryDep",
    "DeleteRoleSkillServiceDep",
    "DismissSuggestionServiceDep",
    "ExportAIContextServiceDep",
    "GenerateAIContextServiceDep",
    "GenerateRoleSkillServiceDep",
    "GetActivityServiceDep",
    "GetCycleServiceDep",
    "GetDigestServiceDep",
    "GetIssueServiceDep",
    "GetNoteServiceDep",
    "GetOnboardingServiceDep",
    "InvitationRepositoryDep",
    "IssueRepositoryDep",
    "LinkCommitServiceDep",
    "ListIssuesServiceDep",
    "ListRoleSkillsServiceDep",
    "NoteAIUpdateServiceDep",
    "NoteIssueLinkRepositoryDep",
    "NoteRepositoryDep",
    "ProcessGitHubWebhookServiceDep",
    "ProjectRepositoryDep",
    "RefineAIContextServiceDep",
    "RolloverCycleServiceDep",
    "UpdateCycleServiceDep",
    "UpdateIssueServiceDep",
    "UpdateNoteServiceDep",
    "UpdateOnboardingServiceDep",
    "UpdateRoleSkillServiceDep",
    "UserRepositoryDep",
    "WorkspaceRepositoryDep",
    "WorkspaceServiceDep",
]
