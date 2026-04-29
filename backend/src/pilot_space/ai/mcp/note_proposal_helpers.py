"""Shared ProposalBus helpers for note MCP tool shims (EDIT-05 / DD-003).

Extracted to keep note_server.py under 700 lines.

Each note tool that mutates note content calls ``route_through_proposal_bus``
after validating inputs.  The helper:

1. Validates ``tool_context`` (workspace UUID + user).
2. Resolves ``ChatMode`` and ``ProposalPolicy`` — rejects if policy disallows.
3. Calls ``bus.create_proposal(...)`` with the supplied ``intent_tool``,
   ``intent_args``, ``diff_payload``, and ``target_artifact_id``.
4. Returns the JSON ``{status, operation, proposal_id, preview}`` string
   that MCP tools should wrap with ``_text_result()``.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from pilot_space.domain.proposal import ArtifactType, DiffKind
from pilot_space.infrastructure.logging import get_logger

logger = get_logger(__name__)


async def route_through_proposal_bus(
    *,
    tool_context: Any,
    intent_tool: str,
    intent_args: dict[str, Any],
    diff_payload: dict[str, Any],
    diff_kind: DiffKind,
    target_artifact_id: UUID,
) -> str | None:
    """Build and persist a Proposal via ``ProposalBus``.

    Returns a JSON string ready to pass to ``_text_result()``, or ``None``
    when a policy error string should be returned instead.  When ``None`` is
    returned the caller should check ``policy_error`` key.

    On policy rejection, returns a JSON string with ``proposal_status=errored``.
    On tool_context missing, returns a JSON string with ``status=error``.
    """
    if not tool_context:
        return json.dumps({"status": "error", "reason": "Tool context not available"})

    from pilot_space.ai.proposals import resolve_proposal_policy
    from pilot_space.ai.proposals.tool_shim import (
        build_proposal_identity,
        get_proposal_bus,
        resolve_chat_mode,
    )

    workspace_uuid: UUID
    try:
        workspace_uuid = UUID(str(tool_context.workspace_id))
    except (ValueError, TypeError):
        return json.dumps({"status": "error", "reason": "valid workspace context required"})
    if not tool_context.user_id:
        return json.dumps({"status": "error", "reason": "valid user context required"})

    mode = resolve_chat_mode(tool_context)
    policy = resolve_proposal_policy(mode, tool_kind="mutating")
    if not policy.allow_creation:
        return json.dumps(
            {
                "proposal_status": "errored",
                "reason": policy.reject_with_reason or "Mutation not permitted in current mode",
            }
        )

    session_id, message_id = build_proposal_identity(tool_context)
    bus = get_proposal_bus()
    proposal = await bus.create_proposal(
        workspace_id=workspace_uuid,
        session_id=session_id,
        message_id=message_id,
        target_artifact_type=ArtifactType.NOTE,
        target_artifact_id=target_artifact_id,
        intent_tool=intent_tool,
        intent_args=intent_args,
        diff_kind=diff_kind,
        diff_payload=diff_payload,
        reasoning=None,
        mode=mode,
        accept_disabled=policy.accept_disabled,
        persist=policy.persist,
        plan_preview_only=policy.plan_preview_only,
    )

    logger.info(
        "[NoteTools] %s proposal queued: %s -> %s",
        intent_tool,
        target_artifact_id,
        proposal.id,
    )
    return json.dumps(
        {
            "status": "pending",
            "operation": intent_tool,
            "proposal_id": str(proposal.id),
            "preview": diff_payload,
        }
    )


__all__ = ["route_through_proposal_bus"]
