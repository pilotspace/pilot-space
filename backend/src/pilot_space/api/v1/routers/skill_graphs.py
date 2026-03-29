"""Skill graph CRUD API endpoints.

REST API for workspace-scoped skill graph persistence.
- POST  /{workspace_id}/skill-graphs                        -> create (201)
- GET   /{workspace_id}/skill-graphs/{graph_id}              -> get (200)
- PUT   /{workspace_id}/skill-graphs/{graph_id}              -> update (200)
- GET   /{workspace_id}/skill-graphs/by-template/{template}  -> get by template (200)
- PUT   /{workspace_id}/skill-graphs/by-template/{template}  -> upsert (200)

Source: Phase 52, P52-03
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, status

from pilot_space.api.middleware.request_context import WorkspaceId
from pilot_space.api.v1.dependencies import SkillGraphServiceDep
from pilot_space.api.v1.schemas.skill_graph import (
    SkillGraphCreate,
    SkillGraphResponse,
    SkillGraphUpdate,
)
from pilot_space.dependencies import CurrentUserId, DbSession
from pilot_space.infrastructure.database.rls import set_rls_context

router = APIRouter(
    prefix="/{workspace_id}/skill-graphs",
    tags=["Skill Graphs"],
)


@router.post(
    "",
    response_model=SkillGraphResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a skill graph",
)
async def create_skill_graph(
    workspace_id: WorkspaceId,
    payload: SkillGraphCreate,
    session: DbSession,
    current_user_id: CurrentUserId,
    service: SkillGraphServiceDep,
) -> SkillGraphResponse:
    """Create a new skill graph linked to a skill template."""
    await set_rls_context(session, current_user_id, workspace_id)
    graph = await service.create(workspace_id, payload)
    return SkillGraphResponse.model_validate(graph)


@router.get(
    "/{graph_id}",
    response_model=SkillGraphResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a skill graph by ID",
)
async def get_skill_graph(
    workspace_id: WorkspaceId,
    graph_id: UUID,
    session: DbSession,
    current_user_id: CurrentUserId,
    service: SkillGraphServiceDep,
) -> SkillGraphResponse:
    """Return the full graph JSON for a skill graph."""
    await set_rls_context(session, current_user_id, workspace_id)
    graph = await service.get(graph_id)
    return SkillGraphResponse.model_validate(graph)


@router.put(
    "/{graph_id}",
    response_model=SkillGraphResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a skill graph",
)
async def update_skill_graph(
    workspace_id: WorkspaceId,
    graph_id: UUID,
    payload: SkillGraphUpdate,
    session: DbSession,
    current_user_id: CurrentUserId,
    service: SkillGraphServiceDep,
) -> SkillGraphResponse:
    """Update graph JSON with new node/edge data."""
    await set_rls_context(session, current_user_id, workspace_id)
    graph = await service.update(graph_id, payload)
    return SkillGraphResponse.model_validate(graph)


@router.get(
    "/by-template/{skill_template_id}",
    response_model=SkillGraphResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a skill graph by template ID",
)
async def get_skill_graph_by_template(
    workspace_id: WorkspaceId,
    skill_template_id: UUID,
    session: DbSession,
    current_user_id: CurrentUserId,
    service: SkillGraphServiceDep,
) -> SkillGraphResponse:
    """Return the graph for a given skill template."""
    await set_rls_context(session, current_user_id, workspace_id)
    graph = await service.get_by_template(skill_template_id)
    return SkillGraphResponse.model_validate(graph)


@router.put(
    "/by-template/{skill_template_id}",
    response_model=SkillGraphResponse,
    status_code=status.HTTP_200_OK,
    summary="Upsert a skill graph by template ID",
)
async def upsert_by_template(
    workspace_id: WorkspaceId,
    skill_template_id: UUID,
    payload: SkillGraphUpdate,
    session: DbSession,
    current_user_id: CurrentUserId,
    service: SkillGraphServiceDep,
) -> SkillGraphResponse:
    """Create or update the graph for a given skill template."""
    await set_rls_context(session, current_user_id, workspace_id)
    graph = await service.upsert_by_template(workspace_id, skill_template_id, payload)
    return SkillGraphResponse.model_validate(graph)


__all__ = ["router"]
