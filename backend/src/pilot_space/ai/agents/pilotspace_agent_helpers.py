"""Helper functions for PilotSpace Agent.

SSE event emission, message transformation utilities, and subagent definitions.
Extracted from pilotspace_agent.py for modularity (file size quality gate).
"""

from __future__ import annotations

import json
import logging
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from claude_agent_sdk import AgentDefinition

if TYPE_CHECKING:
    from claude_agent_sdk import Message

    from pilot_space.ai.agents.pilotspace_agent import ChatInput

logger = logging.getLogger(__name__)


def build_subagent_definitions() -> dict[str, AgentDefinition]:
    """Build subagent definitions for SDK agent spawning.

    Each subagent has a dedicated model, tool set, and detailed prompt
    aligned with provider routing per DD-011.
    """
    return {
        "pr-review": AgentDefinition(
            description="Expert code reviewer for GitHub PRs",
            prompt=(
                "You are a senior code reviewer specializing in architecture, security, "
                "and performance analysis. Review the pull request thoroughly:\n"
                "1. Identify security vulnerabilities (OWASP Top 10)\n"
                "2. Check architecture compliance with project patterns\n"
                "3. Evaluate performance implications\n"
                "4. Assess test coverage adequacy\n"
                "Tag each finding with severity: CRITICAL, HIGH, MEDIUM, LOW, INFO."
            ),
            tools=["Read", "Glob", "Grep", "WebFetch", "Bash"],
            model="opus",
        ),
        "ai-context": AgentDefinition(
            description="Aggregates context for issues from notes, code, and tasks",
            prompt=(
                "You are a context aggregation specialist. For the given issue, "
                "find and organize all relevant context:\n"
                "1. Related notes and meeting documents\n"
                "2. Relevant code files and functions\n"
                "3. Similar or duplicate issues\n"
                "4. Dependency relationships\n"
                "Return a structured summary with references."
            ),
            tools=["Read", "Glob", "Grep"],
            model="opus",
        ),
        "doc-generator": AgentDefinition(
            description="Generates technical documentation from code and architecture",
            prompt=(
                "You are a technical writer. Generate clear, comprehensive documentation:\n"
                "1. Follow existing project documentation style\n"
                "2. Include code examples where appropriate\n"
                "3. Document public APIs with parameters and return types\n"
                "4. Add architecture decision references (DD-XXX) where relevant."
            ),
            tools=["Read", "Glob", "Grep", "Write"],
            model="sonnet",
        ),
    }


def build_contextual_message(input_data: ChatInput) -> str:
    """Enrich user message with note/issue context for the SDK.

    Includes note_id and block_ids so the model can call note tools
    (extract_issues, update_note_block, etc.) with correct parameters.
    """
    parts: list[str] = []

    note = input_data.context.get("note")
    note_id = input_data.context.get("note_id")
    if note is not None:
        note_title = getattr(note, "title", "Untitled") or "Untitled"
        note_content = getattr(note, "content", {})

        note_header = f"# {note_title}"
        if note_id:
            note_header += f"\nnote_id: {note_id}"

        selected_block_ids = input_data.context.get("selected_block_ids", [])
        if selected_block_ids:
            note_header += (
                f"\nselected_block_ids: {', '.join(str(bid) for bid in selected_block_ids)}"
            )

        if note_content:
            from pilot_space.application.services.note.content_converter import (
                ContentConverter,
            )

            converter = ContentConverter()
            markdown = converter.tiptap_to_markdown(note_content)
            if markdown.strip():
                parts.append(f"<note_context>\n{note_header}\n\n{markdown}\n</note_context>")
        else:
            parts.append(f"<note_context>\n{note_header}\n\n(empty note)\n</note_context>")

    selected_text = input_data.context.get("selected_text")
    if selected_text:
        parts.append(f"<selected_text>\n{selected_text}\n</selected_text>")

    if parts:
        context_block = "\n\n".join(parts)
        return f"{context_block}\n\n{input_data.message}"
    return input_data.message


def transform_sdk_message(  # noqa: PLR0911
    message: Message,
    current_message_id_holder: dict[str, str | None],
) -> str | None:
    """Transform Claude SDK message to frontend SSE event.

    SDK Message Types (actual attributes from claude-agent-sdk):
    - SystemMessage: data(dict), subtype — init message with session_id
    - AssistantMessage: content(list[TextBlock]), error, model — AI response
    - ResultMessage: session_id, is_error, result, usage — completion signal
    - ToolResultMessage: tool_name, result — MCP tool execution result

    Output format matches frontend SSEEvent expectations:
    - ``event: <type>\\ndata: <json>\\n\\n`` (proper SSE with event prefix)
    - camelCase field names (messageId, sessionId, delta, stopReason)

    For MCP tool results from note tools, emits content_update events.

    Args:
        message: SDK message object
        current_message_id_holder: Mutable dict with "_current_message_id" key for state

    Returns:
        SSE-formatted string or None if message should be ignored
    """
    msg_type = type(message).__name__

    if msg_type in ("ToolResultMessage", "ToolResult"):
        return transform_tool_result(message)

    if msg_type == "SystemMessage":
        raw_data = getattr(message, "data", None)
        if isinstance(raw_data, dict) and raw_data.get("type") == "system":
            subtype = raw_data.get("subtype")
            if subtype == "init":
                session_id = raw_data.get("session_id", "")
                current_message_id_holder["_current_message_id"] = str(uuid4())
                data = {
                    "messageId": current_message_id_holder["_current_message_id"],
                    "sessionId": str(session_id),
                }
                return f"event: message_start\ndata: {json.dumps(data)}\n\n"
        return None

    if msg_type == "AssistantMessage":
        content = getattr(message, "content", None)
        if content is None:
            return None

        message_id_value = current_message_id_holder.get("_current_message_id")
        message_id = message_id_value if message_id_value else str(uuid4())

        if isinstance(content, list):
            events: list[str] = []
            text_parts: list[str] = []
            thinking_parts: list[str] = []

            for block_idx, block in enumerate(content):
                block_type = _get_block_type(block)

                # Emit content_block_start for each block
                content_type = "tool_use" if block_type == "tool_use" else "text"
                block_start_data = {"index": block_idx, "contentType": content_type}
                events.append(
                    f"event: content_block_start\ndata: {json.dumps(block_start_data)}\n\n",
                )

                if block_type == "thinking":
                    thinking_text = _get_block_text(block, "thinking")
                    if thinking_text:
                        thinking_parts.append(thinking_text)
                elif block_type == "tool_use":
                    tool_event = _handle_tool_use_block(block, message_id)
                    if tool_event:
                        events.append(tool_event)
                else:
                    text = _get_block_text(block, "text")
                    if text:
                        text_parts.append(text)

            if thinking_parts:
                thinking_content = " ".join(thinking_parts)
                thinking_data = {
                    "messageId": message_id,
                    "delta": thinking_content,
                }
                events.append(
                    f"event: thinking_delta\ndata: {json.dumps(thinking_data)}\n\n",
                )

            if text_parts:
                text_content = " ".join(text_parts)
                text_data = {
                    "messageId": message_id,
                    "delta": text_content,
                }
                events.append(
                    f"event: text_delta\ndata: {json.dumps(text_data)}\n\n",
                )

            return "".join(events) if events else None

        text_content = str(content)
        if not text_content.strip():
            return None
        data = {
            "messageId": message_id,
            "delta": text_content,
        }
        return f"event: text_delta\ndata: {json.dumps(data)}\n\n"

    if msg_type == "ResultMessage":
        session_id = getattr(message, "session_id", "")
        is_error = getattr(message, "is_error", False)
        usage = getattr(message, "usage", None)
        message_id_value = current_message_id_holder.get("_current_message_id")
        message_id = message_id_value if message_id_value else str(uuid4())

        if is_error:
            result = getattr(message, "result", "")
            error_data: dict[str, Any] = {
                "errorCode": "api_error",
                "message": str(result) if result else "Unknown error",
                "retryable": False,
            }
            return f"event: error\ndata: {json.dumps(error_data)}\n\n"

        # Check for structured output in result
        events_prefix = ""
        result_raw = getattr(message, "result", None)
        if isinstance(result_raw, dict) and "schemaType" in result_raw:
            structured_data: dict[str, Any] = {
                "messageId": message_id,
                "schemaType": result_raw["schemaType"],
                "data": result_raw,
            }
            events_prefix = f"event: structured_result\ndata: {json.dumps(structured_data)}\n\n"

        data_stop: dict[str, Any] = {
            "messageId": message_id,
            "stopReason": "end_turn",
        }
        if usage:
            input_tokens = getattr(usage, "input_tokens", 0)
            output_tokens = getattr(usage, "output_tokens", 0)
            cached_read = getattr(usage, "cached_read_input_tokens", 0)
            cached_creation = getattr(
                usage,
                "cached_creation_input_tokens",
                0,
            )
            data_stop["usage"] = {
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "totalTokens": input_tokens + output_tokens,
                "cachedTokens": cached_read + cached_creation,
                "cachedReadTokens": cached_read,
                "cachedCreationTokens": cached_creation,
            }
            total_cost = getattr(usage, "total_cost_usd", None)
            if total_cost is not None:
                data_stop["costUsd"] = total_cost
        stop_event = f"event: message_stop\ndata: {json.dumps(data_stop)}\n\n"
        return f"{events_prefix}{stop_event}" if events_prefix else stop_event

    return None


def _handle_tool_use_block(block: Any, message_id: str) -> str | None:
    """Handle tool_use block from AssistantMessage content.

    Detects AskUserQuestion tool calls and emits ask_user_question SSE events.
    Other tool_use blocks emit standard tool_use SSE events.

    Args:
        block: SDK ToolUseBlock (dict or object)
        message_id: Current message ID

    Returns:
        SSE event string or None
    """
    if isinstance(block, dict):
        tool_name = block.get("name", "")
        tool_input = block.get("input", {})
        tool_id = block.get("id", str(uuid4()))
    else:
        tool_name = getattr(block, "name", "")
        tool_input = getattr(block, "input", {})
        tool_id = getattr(block, "id", str(uuid4()))

    if not tool_name:
        return None

    if tool_name == "AskUserQuestion":
        return _emit_ask_user_question_event(tool_id, tool_input, message_id)

    # Standard tool_use event
    tool_data: dict[str, Any] = {
        "toolCallId": str(tool_id),
        "toolName": tool_name,
        "toolInput": tool_input,
    }
    return f"event: tool_use\ndata: {json.dumps(tool_data)}\n\n"


def _emit_ask_user_question_event(
    tool_id: str,
    tool_input: Any,
    message_id: str,
) -> str:
    """Emit ask_user_question SSE event from AskUserQuestion tool call.

    Args:
        tool_id: Tool call ID (used to submit answer back)
        tool_input: AskUserQuestion parameters (questions, options, etc.)
        message_id: Current message ID
    """
    questions = []
    if isinstance(tool_input, dict):
        raw_questions = tool_input.get("questions", [])
        if isinstance(raw_questions, list):
            for q in raw_questions:
                if isinstance(q, dict):
                    questions.append(
                        {
                            "question": q.get("question", ""),
                            "options": q.get("options", []),
                            "multiSelect": q.get("multiSelect", False),
                            "header": q.get("header", ""),
                        }
                    )

    event_data: dict[str, Any] = {
        "messageId": message_id,
        "questionId": str(tool_id),
        "questions": questions,
    }
    return f"event: ask_user_question\ndata: {json.dumps(event_data)}\n\n"


def _get_block_type(block: Any) -> str:
    """Extract block type from SDK content block.

    SDK blocks can be dicts or typed objects (TextBlock, ThinkingBlock).
    """
    if isinstance(block, dict):
        return str(block.get("type", "text"))
    return str(getattr(block, "type", "text"))


def _get_block_text(block: Any, attr: str = "text") -> str:
    """Extract text from SDK content block by attribute name.

    Args:
        block: SDK content block (dict or object)
        attr: Attribute name to read ('text' for TextBlock, 'thinking' for ThinkingBlock)
    """
    if isinstance(block, dict):
        return str(block.get(attr, block.get("text", "")))
    return str(getattr(block, attr, getattr(block, "text", "")))


def transform_tool_result(message: Message) -> str | None:
    """Transform MCP tool result to content_update SSE event.

    Intercepts tool results from note tools and emits content_update events
    with appropriate operation types.

    Args:
        message: Tool result message from SDK

    Returns:
        SSE-formatted content_update event or None for non-content operations
    """
    result_data = getattr(message, "result", {})

    if not isinstance(result_data, dict) or result_data.get("status") != "pending_apply":
        return None

    operation = result_data.get("operation")
    note_id = result_data.get("note_id")

    if not note_id or not isinstance(note_id, str):
        logger.warning(
            f"Tool result missing valid note_id: operation={operation}, note_id={note_id}"
        )
        return None

    if not operation or not isinstance(operation, str):
        return None

    operation_handlers = {
        "replace_block": emit_replace_block_event,
        "append_blocks": emit_append_blocks_event,
        "create_issues": emit_issue_creation_events,
        "create_single_issue": emit_issue_creation_events,
    }

    handler = operation_handlers.get(operation)
    if handler:
        return handler(result_data, note_id)

    return None


def emit_replace_block_event(result_data: dict[str, Any], note_id: str) -> str:
    """Emit content_update SSE event for replace_block operation.

    Args:
        result_data: Tool result data
        note_id: Note ID

    Returns:
        SSE-formatted content_update event
    """
    event_data = {
        "noteId": note_id,
        "operation": "replace_block",
        "blockId": result_data.get("block_id"),
        "markdown": result_data.get("markdown"),
        "content": None,
        "issueData": None,
        "afterBlockId": None,
    }
    return f"event: content_update\ndata: {json.dumps(event_data)}\n\n"


def emit_append_blocks_event(result_data: dict[str, Any], note_id: str) -> str:
    """Emit content_update SSE event for append_blocks operation.

    Args:
        result_data: Tool result data
        note_id: Note ID

    Returns:
        SSE-formatted content_update event
    """
    event_data = {
        "noteId": note_id,
        "operation": "append_blocks",
        "blockId": result_data.get("block_id"),
        "markdown": result_data.get("markdown"),
        "content": None,
        "issueData": None,
        "afterBlockId": result_data.get("after_block_id"),
    }
    return f"event: content_update\ndata: {json.dumps(event_data)}\n\n"


def emit_issue_creation_events(result_data: dict[str, Any], note_id: str) -> str:
    """Emit content_update SSE events for issue creation.

    For multiple issues, creates one event with all issue data.
    Frontend will handle inserting multiple inline issue nodes.

    Args:
        result_data: Tool result data
        note_id: Note ID

    Returns:
        SSE-formatted content_update event(s)
    """
    operation = result_data.get("operation")

    if operation == "create_single_issue":
        issue_data = result_data.get("issue", {})
        event_data = {
            "noteId": note_id,
            "operation": "insert_inline_issue",
            "blockId": result_data.get("block_id"),
            "markdown": None,
            "content": None,
            "issueData": issue_data,
            "afterBlockId": None,
        }
        return f"event: content_update\ndata: {json.dumps(event_data)}\n\n"

    issues = result_data.get("issues", [])
    if not issues:
        return ""

    events = []
    block_ids = result_data.get("block_ids", [])

    for idx, issue in enumerate(issues):
        block_id = block_ids[idx] if idx < len(block_ids) else None
        event_data = {
            "noteId": note_id,
            "operation": "insert_inline_issue",
            "blockId": block_id,
            "markdown": None,
            "content": None,
            "issueData": issue,
            "afterBlockId": None,
        }
        events.append(f"event: content_update\ndata: {json.dumps(event_data)}\n\n")

    return "".join(events)
