"""Dependency Graph API -- project-scoped issue dependency graph.

T-237: GET /api/v1/projects/{project_id}/dependency-graph
       Returns nodes, edges, critical_path, and circular dependency detection.

Feature 017: Note Versioning / PM Block Engine -- Phase 2c

Thin HTTP shell -- all business logic delegated to DependencyGraphService.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query
from pydantic import BaseModel

from pilot_space.api.v1.dependencies import DependencyGraphServiceDep
from pilot_space.dependencies.auth import CurrentUserId, SessionDep

router = APIRouter(prefix="/projects", tags=["dependency-graph"])


# -- Response Schemas ----------------------------------------------------------


class DependencyNode(BaseModel):
    id: str
    identifier: str
    name: str
    state: str
    state_group: str


class DependencyEdge(BaseModel):
    source_id: str
    target_id: str
    is_critical: bool = False


class DependencyGraphResponse(BaseModel):
    nodes: list[DependencyNode]
    edges: list[DependencyEdge]
    critical_path: list[str]
    circular_deps: list[list[str]]
    has_circular: bool


# -- Endpoint ------------------------------------------------------------------


@router.get(
    "/{project_id}/dependency-graph",
    response_model=DependencyGraphResponse,
    summary="Dependency graph for a project",
)
async def get_dependency_graph(
    project_id: Annotated[UUID, Path()],
    session: SessionDep,
    workspace_id: Annotated[str, Query(description="Workspace UUID for RLS enforcement")],
    current_user_id: CurrentUserId,
    service: DependencyGraphServiceDep,
) -> DependencyGraphResponse:
    """Return DAG nodes, edges, critical path, and circular dep detection for a project."""
    workspace_uuid = UUID(workspace_id)
    result = await service.get_project_graph(project_id, workspace_uuid)
    return DependencyGraphResponse(
        nodes=[
            DependencyNode(
                id=n.id,
                identifier=n.identifier,
                name=n.name,
                state=n.state,
                state_group=n.state_group,
            )
            for n in result.nodes
        ],
        edges=[
            DependencyEdge(
                source_id=e.source_id,
                target_id=e.target_id,
                is_critical=e.is_critical,
            )
            for e in result.edges
        ],
        critical_path=result.critical_path,
        circular_deps=result.circular_deps,
        has_circular=result.has_circular,
    )
