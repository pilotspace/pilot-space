"""Workspace action buttons REST API endpoints (SKBTN-01..04).

Admin-only endpoints for action button CRUD, reorder, and toggle.
Members can list active buttons. Uses direct instantiation pattern
(not @inject DI) -- follows workspace_plugins router pattern.

Source: Phase 17, SKBTN-01..04
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from pilot_space.api.middleware.request_context import WorkspaceId
from pilot_space.api.v1.schemas.skill_action_button import (
    SkillActionButtonCreate,
    SkillActionButtonReorder,
    SkillActionButtonResponse,
    SkillActionButtonUpdate,
)
from pilot_space.dependencies import CurrentUserId, DbSession
from pilot_space.infrastructure.database.models.skill_action_button import (
    SkillActionButton,
)
from pilot_space.infrastructure.database.models.workspace_member import (
    WorkspaceMember,
    WorkspaceRole,
)
from pilot_space.infrastructure.database.repositories.skill_action_button_repository import (
    SkillActionButtonRepository,
)
from pilot_space.infrastructure.database.rls import set_rls_context
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/{workspace_id}/action-buttons",
    tags=["Action Buttons"],
)


async def _require_member(user_id: UUID, workspace_id: UUID, session: DbSession) -> None:
    """Verify user is an active member of the workspace. Raises 403 if not."""
    stmt = select(WorkspaceMember.id).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
        WorkspaceMember.is_deleted == False,  # noqa: E712
    )
    result = await session.execute(stmt)
    if result.scalar() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")


async def _require_admin(user_id: UUID, workspace_id: UUID, session: DbSession) -> None:
    """Verify user is ADMIN or OWNER. Raises 403 if not."""
    stmt = select(WorkspaceMember.role).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
        WorkspaceMember.is_deleted == False,  # noqa: E712
    )
    result = await session.execute(stmt)
    row = result.scalar()
    if row is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    role = row.value if hasattr(row, "value") else str(row).upper()
    if role not in (WorkspaceRole.ADMIN.value, WorkspaceRole.OWNER.value):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[SkillActionButtonResponse],
    summary="List active action buttons",
)
async def list_active_buttons(
    workspace_id: WorkspaceId,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> list[SkillActionButtonResponse]:
    """Return active action buttons for all workspace members."""
    await set_rls_context(session, current_user_id, workspace_id)
    await _require_member(current_user_id, workspace_id, session)
    repo = SkillActionButtonRepository(session)
    buttons = await repo.get_active_by_workspace(workspace_id)
    return [SkillActionButtonResponse.model_validate(b) for b in buttons]


@router.get(
    "/admin",
    response_model=list[SkillActionButtonResponse],
    summary="List all action buttons (admin)",
)
async def list_all_buttons(
    workspace_id: WorkspaceId,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> list[SkillActionButtonResponse]:
    """Return all action buttons including inactive (admin only)."""
    await set_rls_context(session, current_user_id, workspace_id)
    await _require_admin(current_user_id, workspace_id, session)
    repo = SkillActionButtonRepository(session)
    buttons = await repo.get_all_by_workspace(workspace_id)
    return [SkillActionButtonResponse.model_validate(b) for b in buttons]


@router.post(
    "",
    response_model=SkillActionButtonResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an action button",
)
async def create_button(
    workspace_id: WorkspaceId,
    request: SkillActionButtonCreate,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> SkillActionButtonResponse:
    """Create a new action button (admin only)."""
    await set_rls_context(session, current_user_id, workspace_id)
    await _require_admin(current_user_id, workspace_id, session)

    button = SkillActionButton(
        workspace_id=workspace_id,
        name=request.name,
        icon=request.icon,
        binding_type=request.binding_type,
        binding_id=request.binding_id,
        binding_metadata=request.binding_metadata,
    )

    repo = SkillActionButtonRepository(session)
    created = await repo.create(button)
    logger.info(
        "[ActionButtons] Created %s in workspace %s",
        request.name,
        workspace_id,
    )
    return SkillActionButtonResponse.model_validate(created)


@router.patch(
    "/{button_id}",
    response_model=SkillActionButtonResponse,
    summary="Update an action button",
)
async def update_button(
    workspace_id: WorkspaceId,
    button_id: UUID,
    request: SkillActionButtonUpdate,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> SkillActionButtonResponse:
    """Update an existing action button (admin only)."""
    await set_rls_context(session, current_user_id, workspace_id)
    await _require_admin(current_user_id, workspace_id, session)

    repo = SkillActionButtonRepository(session)
    button = await repo.get_by_workspace_and_id(workspace_id, button_id)
    if button is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Button not found")

    # Apply non-None fields
    update_data = request.model_dump(exclude_unset=True)
    for field_name, value in update_data.items():
        setattr(button, field_name, value)

    updated = await repo.update(button)
    logger.info("[ActionButtons] Updated %s", button_id)
    return SkillActionButtonResponse.model_validate(updated)


@router.put(
    "/reorder",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reorder action buttons",
)
async def reorder_buttons(
    workspace_id: WorkspaceId,
    request: SkillActionButtonReorder,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> None:
    """Reorder action buttons by providing ordered list of IDs (admin only)."""
    await set_rls_context(session, current_user_id, workspace_id)
    await _require_admin(current_user_id, workspace_id, session)

    repo = SkillActionButtonRepository(session)
    all_buttons = await repo.get_all_by_workspace(workspace_id)
    buttons_by_id = {b.id: b for b in all_buttons}
    for idx, bid in enumerate(request.button_ids):
        button = buttons_by_id.get(bid)
        if button is not None:
            button.sort_order = idx * 10
    await session.flush()

    logger.info(
        "[ActionButtons] Reordered %d buttons in workspace %s",
        len(request.button_ids),
        workspace_id,
    )


@router.delete(
    "/{button_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an action button",
)
async def delete_button(
    workspace_id: WorkspaceId,
    button_id: UUID,
    session: DbSession,
    current_user_id: CurrentUserId,
) -> None:
    """Soft-delete an action button (admin only)."""
    await set_rls_context(session, current_user_id, workspace_id)
    await _require_admin(current_user_id, workspace_id, session)

    repo = SkillActionButtonRepository(session)
    button = await repo.get_by_workspace_and_id(workspace_id, button_id)
    if button is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Button not found")

    await repo.soft_delete(button)
    logger.info(
        "[ActionButtons] Deleted %s from workspace %s",
        button_id,
        workspace_id,
    )


__all__ = ["router"]
