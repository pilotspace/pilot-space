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
from pilot_space.api.v1.dependencies import (
    GraphCompilerServiceDep,
    GraphDecompilerServiceDep,
    SkillGraphServiceDep,
)
from pilot_space.api.v1.schemas.skill_graph import (
    ExecutionPreviewResponse,
    ExecutionTraceStep,
    SkillGraphCompileResponse,
    SkillGraphCreate,
    SkillGraphDecompileRequest,
    SkillGraphDecompileResponse,
    SkillGraphResponse,
    SkillGraphUpdate,
)
from pilot_space.application.services.skill.graph_compiler_service import (
    GraphCompilePayload,
    GraphCompilerService,
)
from pilot_space.application.services.skill.graph_decompiler_service import (
    GraphDecompilePayload,
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


@router.post(
    "/{graph_id}/compile",
    response_model=SkillGraphCompileResponse,
    status_code=status.HTTP_200_OK,
    summary="Compile a skill graph to SKILL.md",
)
async def compile_skill_graph(
    workspace_id: WorkspaceId,
    graph_id: UUID,
    session: DbSession,
    current_user_id: CurrentUserId,
    service: GraphCompilerServiceDep,
) -> SkillGraphCompileResponse:
    """Compile graph JSON into deterministic SKILL.md content.

    Traverses the graph in topological order and generates structured
    markdown. Persists result to skill_templates.skill_content.
    """
    await set_rls_context(session, current_user_id, workspace_id)
    result = await service.compile(
        GraphCompilePayload(
            graph_id=graph_id,
            workspace_id=workspace_id,
            user_id=current_user_id,
        )
    )
    return SkillGraphCompileResponse(
        skill_content=result.skill_content,
        node_order=result.node_order,
        compiled_at=result.compiled_at,
        graph_id=graph_id,
        template_id=result.skill_template_id,
    )


@router.post(
    "/{graph_id}/preview",
    response_model=ExecutionPreviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Preview execution trace for a skill graph",
)
async def preview_skill_graph(
    workspace_id: WorkspaceId,
    graph_id: UUID,
    session: DbSession,
    current_user_id: CurrentUserId,
    service: SkillGraphServiceDep,
) -> ExecutionPreviewResponse:
    """Return a step-by-step execution trace for the graph.

    Loads the graph, performs topological sort, and returns ordered
    trace steps for animated preview in the graph editor.
    """
    await set_rls_context(session, current_user_id, workspace_id)
    graph = await service.get(graph_id)
    graph_json = graph.graph_json  # type: ignore[union-attr]
    nodes = graph_json.get("nodes", [])
    edges = graph_json.get("edges", [])

    sorted_nodes = GraphCompilerService.topological_sort(nodes, edges)

    trace: list[ExecutionTraceStep] = []
    for step_num, node in enumerate(sorted_nodes, start=1):
        data = node.get("data", {})
        node_type = data.get("nodeType", node.get("type", "unknown"))
        label = data.get("label", "Untitled")

        # Build step description based on node type
        description = _trace_description(node_type, label, data.get("config", {}))

        trace.append(
            ExecutionTraceStep(
                node_id=node["id"],
                node_type=node_type,
                label=label,
                step_number=step_num,
                description=description,
            )
        )

    return ExecutionPreviewResponse(trace=trace)


def _trace_description(node_type: str, label: str, config: dict[str, str]) -> str:
    """Generate a human-readable description for a trace step."""
    descriptions: dict[str, str] = {
        "input": f"Receive input: {label}",
        "output": f"Emit output ({config.get('outputFormat', 'text')}): {label}",
        "prompt": f"Execute prompt: {label}",
        "skill": f"Invoke skill '{config.get('skillName', 'unknown')}': {label}",
        "condition": f"Evaluate condition: {config.get('conditionExpression', '') or label}",
        "transform": f"Apply transformation: {label}",
    }
    return descriptions.get(node_type, f"Execute: {label}")


@router.post(
    "/decompile",
    response_model=SkillGraphDecompileResponse,
    status_code=status.HTTP_200_OK,
    summary="Decompile SKILL.md into graph JSON",
)
async def decompile_skill_graph(
    workspace_id: WorkspaceId,
    payload: SkillGraphDecompileRequest,
    session: DbSession,
    current_user_id: CurrentUserId,
    service: GraphDecompilerServiceDep,
) -> SkillGraphDecompileResponse:
    """Analyze SKILL.md content and produce a React Flow-compatible graph.

    Uses AI analysis when available, with heuristic fallback.
    Returns graph JSON with nodes, edges, and confidence indicator.
    """
    await set_rls_context(session, current_user_id, workspace_id)
    result = await service.decompile(
        GraphDecompilePayload(
            skill_content=payload.skill_content,
            workspace_id=workspace_id,
            user_id=current_user_id,
        )
    )
    return SkillGraphDecompileResponse(
        graph_json=result.graph_json,
        node_count=result.node_count,
        edge_count=result.edge_count,
        confidence=result.confidence,
    )


__all__ = ["router"]
