"""Unified AI chat endpoint for conversational agents.

Provides a single endpoint for all AI chat interactions with streaming
responses via SSE (Server-Sent Events).

Reference: docs/architect/pilotspace-agent-architecture.md
Design Decisions: DD-058 (SSE streaming), DD-003 (Approval flow)
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from pilot_space.dependencies import (
    CurrentUserId,
    DbSession,
    OrchestratorDep,
    PermissionHandlerDep,
    SessionHandlerDep,
    SkillRegistryDep,
)

router = APIRouter(prefix="/ai", tags=["ai-chat"])


class ChatContext(BaseModel):
    """Context for AI chat request.

    Provides optional context about the current workspace, note, issue,
    or selected text to inform AI responses.
    """

    workspace_id: UUID = Field(..., description="Workspace ID for context")
    note_id: UUID | None = Field(None, description="Note ID if chatting within note")
    issue_id: UUID | None = Field(None, description="Issue ID if chatting about issue")
    selected_text: str | None = Field(None, description="Selected text from editor")


class ChatRequest(BaseModel):
    """Request for AI chat interaction.

    Attributes:
        message: User message to send to AI.
        session_id: Optional session ID to resume existing conversation.
        context: Context about current workspace/note/issue.
    """

    message: str = Field(..., min_length=1, max_length=10000, description="User message")
    session_id: str | None = Field(None, description="Session ID to resume conversation")
    context: ChatContext = Field(..., description="Context for AI response")


@router.post("/chat")
async def chat(
    request: ChatRequest,
    user_id: CurrentUserId,
    session: DbSession,
    orchestrator: OrchestratorDep,
    session_handler: SessionHandlerDep,
    permission_handler: PermissionHandlerDep,
    skill_registry: SkillRegistryDep,
) -> StreamingResponse:
    """Unified AI chat endpoint with streaming responses.

    Supports:
    - Multi-turn conversations via session_id
    - Context-aware responses (note, issue, workspace)
    - Real-time streaming via SSE
    - Tool calls with approval flow
    - Skill discovery and invocation

    Args:
        request: Chat request with message and context.
        user_id: Current user ID.
        session: Database session.
        orchestrator: SDK orchestrator for agent execution.
        session_handler: Session handler for multi-turn conversations.
        permission_handler: Permission handler for approval flow.
        skill_registry: Skill registry for skill discovery.

    Returns:
        StreamingResponse with SSE events.
    """
    from pilot_space.api.v1.middleware import extract_ai_context

    # Extract full AI context (loads Note/Issue objects if IDs provided)
    ai_context = await extract_ai_context(
        request=request,  # type: ignore[arg-type]
        session=session,
        note_id=request.context.note_id,
        issue_id=request.context.issue_id,
        workspace_id=request.context.workspace_id,
        selected_text=request.context.selected_text,
    )

    # Get or create conversation session
    conv_session = None
    if session_handler is not None:
        if request.session_id:
            # Resume existing session
            from uuid import UUID as parse_uuid

            session_id_uuid = parse_uuid(request.session_id)
            conv_session = await session_handler.get_session(session_id_uuid)
        else:
            # Create new session
            conv_session = await session_handler.create_session(
                workspace_id=request.context.workspace_id,
                user_id=user_id,
                agent_name="conversation",
            )

    # Build agent input
    agent_input = {
        "message": request.message,
        "context": ai_context,
        "session_id": conv_session.session_id if conv_session else None,
        "user_id": str(user_id),
        "workspace_id": str(request.context.workspace_id),
    }

    # Stream response from conversation agent
    async def stream_response():
        """Generate SSE stream from agent responses."""
        from pilot_space.ai.sdk import SSETransformer

        transformer = SSETransformer()

        try:
            # Execute conversation agent with streaming
            # Note: execute_stream method needs to be added to SDKOrchestrator
            # For now, we'll use a placeholder that will be implemented
            async for event in _execute_stream_placeholder(
                orchestrator,
                agent_name="conversation",
                input_data=agent_input,
                context=ai_context,
            ):
                # Transform Claude SDK events to PilotSpace SSE format
                sse_event = _transform_event(event, transformer)
                if sse_event:
                    yield sse_event.to_sse_string()

            # Send message_stop at end
            stop_event = transformer.message_stop(stop_reason="end_turn")
            yield stop_event.to_sse_string()

        except Exception as e:
            # Send error event
            error_event = transformer.error(
                error_type="internal_error",
                message=str(e),
            )
            yield error_event.to_sse_string()

    return StreamingResponse(
        stream_response(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


async def _execute_stream_placeholder(
    orchestrator: Any,
    agent_name: str,
    input_data: dict[str, Any],
    context: dict[str, Any],
):
    """Placeholder for streaming execution.

    TODO: Implement execute_stream in SDKOrchestrator.
    For now, this is a stub that will be replaced.
    """
    # This will be implemented when we add streaming support to orchestrator
    if False:
        yield {}


def _transform_event(event: dict[str, Any], transformer: Any):
    """Transform orchestrator event to SSE event.

    Args:
        event: Event from orchestrator.
        transformer: SSE transformer.

    Returns:
        SSEEvent or None if event should be skipped.
    """
    from pilot_space.ai.sdk import transform_claude_event

    event_type = event.get("type")

    # Text delta events
    if event_type == "text":
        return transformer.text_delta(event.get("text", ""))

    # Tool use events
    if event_type == "tool_use":
        return transformer.tool_use(
            tool_name=event["tool_name"],
            tool_input=event["tool_input"],
            tool_use_id=event["tool_use_id"],
        )

    # Tool result events
    if event_type == "tool_result":
        return transformer.tool_result(
            tool_use_id=event["tool_use_id"],
            result=event["result"],
            is_error=event.get("is_error", False),
        )

    # Approval request events
    if event_type == "approval_request":
        return transformer.approval_request(
            approval_id=event["approval_id"],
            action_name=event["action_name"],
            description=event["description"],
            proposed_changes=event["proposed_changes"],
        )

    # Task progress events
    if event_type == "task_progress":
        return transformer.task_progress(
            task_name=event["task_name"],
            progress=event["progress"],
            status=event["status"],
            message=event.get("message"),
        )

    # Try to transform Claude SDK events directly
    return transform_claude_event(event)
