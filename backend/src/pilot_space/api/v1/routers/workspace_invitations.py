"""Workspace invitation router for Pilot Space API.

Provides endpoints for invitation management (invite, list, cancel, rescind).
Extracted from workspaces.py to keep files under 700 lines.
"""

from __future__ import annotations

from uuid import UUID

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select

from pilot_space.api.v1.dependencies import (
    WorkspaceInvitationServiceDep,
    WorkspaceServiceDep,
)
from pilot_space.api.v1.schemas.workspace import (
    InvitationCreateRequest,
    InvitationResponse,
    WorkspaceMemberResponse,
)
from pilot_space.application.services.workspace_invitation import (
    CancelInvitationPayload,
    ListInvitationsPayload,
)
from pilot_space.container.container import Container
from pilot_space.dependencies.auth import CurrentUser, CurrentUserId, SessionDep
from pilot_space.infrastructure.database.models.project import Project
from pilot_space.infrastructure.database.repositories.project_member import (
    ProjectMemberRepository,
)
from pilot_space.infrastructure.database.repositories.workspace_member_repository import (
    WorkspaceMemberRepository,
)
from pilot_space.infrastructure.database.rls import set_rls_context
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/workspaces", tags=["workspaces", "invitations"])


@router.post(
    "/{workspace_id}/members",
    # H-7 fix: add response_model for proper OpenAPI docs and response validation
    response_model=WorkspaceMemberResponse | InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["workspaces", "invitations"],
)
@inject
async def add_workspace_member(
    workspace_id: UUID,
    request: InvitationCreateRequest,
    session: SessionDep,
    current_user: CurrentUser,
    workspace_service: WorkspaceServiceDep,
    wm_repo: WorkspaceMemberRepository = Depends(
        Provide[Container.workspace_member_rbac_repository]
    ),
) -> WorkspaceMemberResponse | InvitationResponse:
    """Invite or add a member to workspace.

    If the email belongs to an existing user, adds them immediately.
    If not, creates a pending invitation for auto-accept on signup.
    Requires admin or owner role.

    Source: FR-014, FR-015, FR-016, US3.

    Note: Authorization check is now in service layer.
    """
    await set_rls_context(session, current_user.user_id, workspace_id)

    # FR-03: validate project_assignments — at least one required for MEMBER/GUEST
    assignments = request.project_assignments or []
    if request.role in ("MEMBER", "GUEST") and not assignments:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one project assignment is required when inviting MEMBER or GUEST",
        )

    # Validate all project_ids belong to this workspace and are not archived
    if assignments:
        project_ids = [
            UUID(str(a["project_id"])) for a in assignments if "project_id" in a
        ]
        rows = await session.execute(
            select(Project.id, Project.is_archived).where(
                and_(
                    Project.id.in_(project_ids),
                    Project.workspace_id == workspace_id,
                    Project.is_deleted == False,  # noqa: E712
                )
            )
        )
        found = {row.id: row.is_archived for row in rows.all()}
        missing = [pid for pid in project_ids if pid not in found]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Projects not found in workspace: {[str(p) for p in missing]}",
            )
        archived = [pid for pid, is_arch in found.items() if is_arch]
        if archived:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cannot assign to archived projects: {[str(p) for p in archived]}",
            )

    try:
        result = await workspace_service.invite_member(
            workspace_id=workspace_id,
            email=request.email,
            role=request.role,
            invited_by=current_user.user_id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        ) from e

    if result.is_immediate and result.member:
        member = result.member

        # FR-03: materialize project assignments for immediately added user
        if assignments:
            from pilot_space.application.services.project_member import (
                InviteAssignmentsPayload,
                ProjectMemberService,
            )

            pm_repo = ProjectMemberRepository(session=session)
            pm_svc = ProjectMemberService(project_member_repository=pm_repo)
            await pm_svc.materialize_invite_assignments(
                InviteAssignmentsPayload(
                    workspace_id=workspace_id,
                    user_id=member.user_id,
                    assigned_by=current_user.user_id,
                    project_assignments=assignments,
                )
            )

        return WorkspaceMemberResponse(
            user_id=member.user_id,
            email=member.user.email if member.user else "",
            full_name=member.user.full_name if member.user else None,
            avatar_url=member.user.avatar_url if member.user else None,
            role=member.role.value,
            joined_at=member.created_at,
        )

    invitation = result.invitation
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected error creating invitation",
        )

    # Store project_assignments on the invitation object for later materialization
    if assignments:
        invitation.project_assignments = assignments
        await session.flush()

    return InvitationResponse(
        id=invitation.id,
        email=invitation.email,
        role=invitation.role.value,
        status=invitation.status.value,
        invited_by=invitation.invited_by,
        suggested_sdlc_role=invitation.suggested_sdlc_role,
        expires_at=invitation.expires_at,
        created_at=invitation.created_at,
    )


@router.get(
    "/{workspace_id}/invitations",
    response_model=list[InvitationResponse],
    tags=["workspaces", "invitations"],
)
async def list_workspace_invitations(
    workspace_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    service: WorkspaceInvitationServiceDep,
) -> list[InvitationResponse]:
    """List invitations for a workspace.

    Requires admin or owner role.
    Source: plan.md API Contract Endpoint 2.
    """
    result = await service.list_invitations(
        ListInvitationsPayload(
            workspace_id=workspace_id,
            requesting_user_id=current_user.user_id,
        )
    )

    return [
        InvitationResponse(
            id=inv.id,
            email=inv.email,
            role=inv.role.value,
            status=inv.status.value,
            invited_by=inv.invited_by,
            suggested_sdlc_role=inv.suggested_sdlc_role,
            expires_at=inv.expires_at,
            created_at=inv.created_at,
        )
        for inv in result.invitations
    ]


@router.delete(
    "/{workspace_id}/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["workspaces", "invitations"],
)
async def cancel_workspace_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    service: WorkspaceInvitationServiceDep,
) -> None:
    """Cancel a pending invitation.

    Requires admin or owner role.
    Source: plan.md API Contract Endpoint 3, US3 acceptance scenario 5.
    """
    await service.cancel_invitation(
        CancelInvitationPayload(
            workspace_id=workspace_id,
            invitation_id=invitation_id,
            actor_id=current_user.user_id,
        )
    )


@router.delete(
    "/{workspace_id}/members/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["workspaces", "invitations"],
)
@inject
async def rescind_workspace_invitation(
    workspace_id: UUID,
    invitation_id: UUID,
    session: SessionDep,
    current_user_id: CurrentUserId,
    service: WorkspaceInvitationServiceDep,
    wm_repo: WorkspaceMemberRepository = Depends(
        Provide[Container.workspace_member_rbac_repository]
    ),
) -> None:
    """Rescind (cancel) a pending invitation from the Members page.

    Admin/owner only. Sets invitation status to 'cancelled'.
    Source: T026, US3 FR-03.
    """
    await set_rls_context(session, current_user_id, workspace_id)

    caller = await wm_repo.get_by_user_workspace(current_user_id, workspace_id)
    if not caller or caller.role.value not in ("ADMIN", "OWNER"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace admins or owners can rescind invitations",
        )

    try:
        await service.cancel_invitation(
            CancelInvitationPayload(
                workspace_id=workspace_id,
                invitation_id=invitation_id,
                actor_id=current_user_id,
            )
        )
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg.lower() or "already processed" in error_msg.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_msg,
            ) from e
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=error_msg,
        ) from e


__all__ = ["router"]
