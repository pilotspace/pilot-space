"""Database MCP tools for Pilot Space data access.

Provides workspace members, cycle context, and note annotations.
Issue/note/project context tools replaced by dedicated MCP servers (spec 010).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from pilot_space.ai.tools.mcp_server import ToolContext, register_tool
from pilot_space.infrastructure.database.models import (
    AnnotationType,
    Cycle,
    Note,
    WorkspaceMember,
)


@register_tool("database")
async def get_workspace_members(
    ctx: ToolContext,
    include_skills: bool = False,
) -> dict[str, Any]:
    """Get workspace members with roles.

    Retrieves team members for assignee recommendations
    and workload analysis.

    Args:
        ctx: Tool context with workspace_id
        include_skills: Whether to include member skills/expertise

    Returns:
        List of workspace members with roles
    """
    query = (
        select(WorkspaceMember)
        .where(
            WorkspaceMember.workspace_id == UUID(ctx.workspace_id),
        )
        .options(selectinload(WorkspaceMember.user))
    )

    result = await ctx.db_session.execute(query)
    members = result.scalars().all()

    return {
        "members": [
            {
                "id": str(m.user.id) if m.user else None,
                "name": m.user.full_name or m.user.email if m.user else None,
                "email": m.user.email if m.user else None,
                "role": m.role.value if m.role else None,
                "skills": getattr(m.user, "skills", []) if include_skills and m.user else [],
            }
            for m in members
            if m.user
        ],
        "count": len(members),
    }


@register_tool("database")
async def get_cycle_context(
    cycle_id: str,
    ctx: ToolContext,
    include_issues: bool = False,
) -> dict[str, Any]:
    """Get cycle (sprint) context with progress metrics.

    Retrieves cycle details for sprint planning and
    velocity analysis.

    Args:
        cycle_id: UUID of the cycle
        ctx: Tool context with db_session
        include_issues: Whether to include issues in cycle

    Returns:
        Cycle details with progress metrics
    """
    uuid_id = UUID(cycle_id)

    query = select(Cycle).where(
        Cycle.id == uuid_id,
        Cycle.workspace_id == UUID(ctx.workspace_id),
    )

    if include_issues:
        query = query.options(selectinload(Cycle.issues))

    result = await ctx.db_session.execute(query)
    cycle = result.scalar_one_or_none()

    if not cycle:
        return {"error": f"Cycle {cycle_id} not found", "found": False}

    response: dict[str, Any] = {
        "found": True,
        "cycle": {
            "id": str(cycle.id),
            "name": cycle.name,
            "description": cycle.description,
            "start_date": cycle.start_date.isoformat() if cycle.start_date else None,
            "end_date": cycle.end_date.isoformat() if cycle.end_date else None,
            "status": cycle.status.value if cycle.status else None,
        },
    }

    if include_issues:
        issues = cycle.issues or []
        completed_count = sum(
            1 for i in issues if i.state and i.state.group and i.state.group.value == "completed"
        )
        response["metrics"] = {
            "total_issues": len(issues),
            "completed_issues": completed_count,
            "progress_percent": (completed_count / len(issues) * 100) if issues else 0,
        }
        response["issues"] = [
            {
                "id": str(i.id),
                "identifier": i.identifier,
                "title": i.name,
                "state": i.state.name if i.state else None,
            }
            for i in issues[:20]  # Limit to 20
        ]

    return response


@register_tool("database")
async def create_note_annotation(
    note_id: str,
    ctx: ToolContext,
    annotation_type: str,
    content: str,
    block_id: str | None = None,
    confidence: float = 0.8,
) -> dict[str, Any]:
    """Create AI annotation for a note (Phase 89 Plan 03 — routed via ProposalBus).

    Builds a ``Proposal`` row and returns a pending stub. The actual insert
    is performed by ``intent_handlers.note.execute_create_note_annotation``
    only after the user accepts the proposal via
    ``POST /api/v1/proposals/{id}/accept``.

    The legacy DD-003 AUTO_EXECUTE label is superseded by Phase 89: all AI
    writes require a proposal. In ``ChatMode.ACT`` the frontend can render
    the resulting proposal as an instant-applied receipt for a UX
    equivalent to auto-execute.

    Args:
        note_id: UUID of the note
        ctx: Tool context with db_session + session/message ids + chat_mode
        annotation_type: Type (suggestion, warning, issue_candidate, info)
        content: Annotation content
        block_id: Optional block ID to attach annotation to
        confidence: Confidence score (0.0-1.0)

    Returns:
        Pending-proposal stub: ``{proposal_id, status: "pending", preview}``
        (or ``{error, created: False}`` on validation / mode-gating failure).
    """
    from pilot_space.ai.proposals import (
        build_fields_diff,
        resolve_proposal_policy,
    )
    from pilot_space.ai.proposals.tool_shim import (
        build_proposal_identity,
        get_proposal_bus,
        resolve_chat_mode,
    )
    from pilot_space.domain.proposal import ArtifactType, DiffKind

    # Step 1: Read current state — verify note exists + belongs to workspace.
    note_query = select(Note).where(
        Note.id == UUID(note_id),
        Note.workspace_id == UUID(ctx.workspace_id),
    )
    result = await ctx.db_session.execute(note_query)
    note = result.scalar_one_or_none()
    if not note:
        return {"error": f"Note {note_id} not found", "created": False}

    # Validate annotation type (pre-flight — surface error to agent
    # without emitting a proposal we'd only have to reject).
    try:
        AnnotationType(annotation_type)
    except ValueError:
        valid_types = [t.value for t in AnnotationType]
        return {
            "error": f"Invalid annotation_type. Valid types: {valid_types}",
            "created": False,
        }
    if not 0.0 <= confidence <= 1.0:
        return {
            "error": "Confidence must be between 0.0 and 1.0",
            "created": False,
        }

    # Step 2: Build intent_args (JSON-serialisable kwargs replay).
    intent_args = {
        "note_id": note_id,
        "annotation_type": annotation_type,
        "content": content,
        "block_id": block_id,
        "confidence": confidence,
    }

    # Step 3: Build a fields-diff preview the frontend can render as
    # "adding a margin annotation".
    diff_payload = build_fields_diff(
        current={},
        proposed={
            "annotation_type": annotation_type,
            "block_id": block_id,
            "content": content,
            "confidence": confidence,
        },
    )

    # Step 4: Mode-gate.
    mode = resolve_chat_mode(ctx)
    policy = resolve_proposal_policy(mode, tool_kind="mutating")
    if not policy.allow_creation:
        return {
            "created": False,
            "proposal_status": "errored",
            "reason": policy.reject_with_reason
            or "Mutation not permitted in current mode",
        }

    # Step 5: Hand off to ProposalBus.
    session_id, message_id = build_proposal_identity(ctx)
    bus = get_proposal_bus()
    proposal = await bus.create_proposal(
        workspace_id=UUID(ctx.workspace_id),
        session_id=session_id,
        message_id=message_id,
        target_artifact_type=ArtifactType.NOTE,
        target_artifact_id=UUID(note_id),
        intent_tool="create_note_annotation",
        intent_args=intent_args,
        diff_kind=DiffKind.FIELDS,
        diff_payload=diff_payload,
        reasoning=None,
        mode=mode,
        accept_disabled=policy.accept_disabled,
        persist=policy.persist,
        plan_preview_only=policy.plan_preview_only,
    )

    return {
        "created": False,  # not yet — waiting for user decision
        "proposal_id": str(proposal.id),
        "status": "pending",
        "preview": diff_payload,
    }
