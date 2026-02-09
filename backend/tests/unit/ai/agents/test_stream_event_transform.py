"""Unit tests for StreamEvent transformation and deduplication.

Tests the transform_stream_event() function and its integration with
transform_sdk_message() for real-time SSE forwarding of thinking blocks,
tool calls, and text deltas from Claude Agent SDK StreamEvent objects.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from pilot_space.ai.agents.pilotspace_agent_helpers import (
    transform_sdk_message,
    transform_tool_result,
)
from pilot_space.ai.agents.stream_event_transformer import transform_stream_event


class MockStreamEvent:
    """Mock SDK StreamEvent with raw Anthropic API event data."""

    def __init__(
        self,
        event: dict[str, Any],
        parent_tool_use_id: str | None = None,
        uuid: str | None = None,
        session_id: str = "test-session",
    ) -> None:
        self.event = event
        self.parent_tool_use_id = parent_tool_use_id
        self.uuid = uuid or str(uuid4())
        self.session_id = session_id
        self.__class__ = type(
            "StreamEvent",
            (),
            {
                "__name__": "StreamEvent",
            },
        )
        self.__class__.__name__ = "StreamEvent"


class MockAssistantMessage:
    """Mock SDK AssistantMessage."""

    def __init__(self, content: list[Any]) -> None:
        self.content = content
        self.__class__ = type(
            "AssistantMessage",
            (),
            {
                "__name__": "AssistantMessage",
            },
        )
        self.__class__.__name__ = "AssistantMessage"


def _make_holder(message_id: str = "msg-123") -> dict[str, Any]:
    """Create a fresh current_message_id_holder."""
    return {"_current_message_id": message_id}


class TestTransformStreamEventThinking:
    """Test thinking block streaming."""

    def test_thinking_content_block_start(self) -> None:
        """StreamEvent with thinking content_block_start emits content_block_start."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "thinking"},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )

        assert result is not None
        assert "event: content_block_start" in result
        data = json.loads(result.split("data: ")[1].split("\n")[0])
        assert data["contentType"] == "thinking"
        assert data["index"] == 0

    def test_thinking_delta(self) -> None:
        """StreamEvent with thinking_delta emits thinking_delta SSE."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "thinking_delta", "thinking": "Let me analyze..."},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )

        assert result is not None
        assert "event: thinking_delta" in result
        data = json.loads(result.split("data: ")[1].split("\n")[0])
        assert data["delta"] == "Let me analyze..."
        assert data["messageId"] == "msg-123"
        assert data["blockIndex"] == 0

    def test_thinking_delta_with_parent_tool_use_id(self) -> None:
        """Thinking delta includes parentToolUseId when present."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "thinking_delta", "thinking": "Thinking..."},
            },
            parent_tool_use_id="toolu_abc",
            current_message_id_holder=holder,
        )

        assert result is not None
        data = json.loads(result.split("data: ")[1].split("\n")[0])
        assert data["parentToolUseId"] == "toolu_abc"


class TestTransformStreamEventToolUse:
    """Test tool_use block streaming."""

    def test_tool_use_content_block_start(self) -> None:
        """StreamEvent with tool_use content_block_start emits both events."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_start",
                "index": 1,
                "content_block": {
                    "type": "tool_use",
                    "id": "toolu_123",
                    "name": "update_note_block",
                },
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )

        assert result is not None
        # Should have both content_block_start and tool_use
        assert "event: content_block_start" in result
        assert "event: tool_use" in result

        # Parse the tool_use event
        events = result.strip().split("\n\n")
        tool_use_event = next(e for e in events if e.startswith("event: tool_use"))
        data = json.loads(tool_use_event.split("data: ")[1])
        assert data["toolCallId"] == "toolu_123"
        assert data["toolName"] == "update_note_block"
        assert data["toolInput"] == {}

    def test_input_json_delta(self) -> None:
        """StreamEvent with input_json_delta emits tool_input_delta SSE."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 1,
                "delta": {
                    "type": "input_json_delta",
                    "partial_json": '{"note_id": "abc',
                },
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )

        assert result is not None
        assert "event: tool_input_delta" in result
        data = json.loads(result.split("data: ")[1].split("\n")[0])
        assert data["delta"] == '{"note_id": "abc'
        assert data["blockIndex"] == 1


class TestTransformStreamEventText:
    """Test text block streaming."""

    def test_text_content_block_start(self) -> None:
        """StreamEvent with text content_block_start emits content_block_start."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_start",
                "index": 2,
                "content_block": {"type": "text", "text": ""},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )

        assert result is not None
        assert "event: content_block_start" in result
        data = json.loads(result.split("data: ")[1].split("\n")[0])
        assert data["contentType"] == "text"

    def test_text_delta(self) -> None:
        """StreamEvent with text_delta emits text_delta SSE."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 2,
                "delta": {"type": "text_delta", "text": "Hello, I'll help you"},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )

        assert result is not None
        assert "event: text_delta" in result
        data = json.loads(result.split("data: ")[1].split("\n")[0])
        assert data["delta"] == "Hello, I'll help you"
        assert data["messageId"] == "msg-123"


class TestTransformStreamEventIgnored:
    """Test ignored event types."""

    @pytest.mark.parametrize(
        "event_type",
        [
            "message_start",
            "message_delta",
            "message_stop",
            "ping",
        ],
    )
    def test_ignored_event_types(self, event_type: str) -> None:
        """Ignored Anthropic event types return None."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={"type": event_type},
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )
        assert result is None

    def test_content_block_stop_returns_none_without_buffer(self) -> None:
        """content_block_stop returns None when no delta buffer is provided."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={"type": "content_block_stop"},
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )
        assert result is None

    def test_empty_thinking_delta_returns_none(self) -> None:
        """Thinking delta with empty text returns None."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "thinking_delta", "thinking": ""},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )
        assert result is None

    def test_empty_text_delta_returns_none(self) -> None:
        """Text delta with empty text returns None."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "text_delta", "text": ""},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )
        assert result is None


class TestStreamEventDedup:
    """Test AssistantMessage deduplication after StreamEvent forwarding."""

    def test_assistant_message_skips_streamed_blocks(self) -> None:
        """AssistantMessage blocks already sent via StreamEvent are skipped."""
        holder = _make_holder()

        # Simulate StreamEvents being sent for blocks 0 and 1
        holder["_stream_events_sent"] = True
        holder["_streamed_block_indices"] = {0, 1}

        text_block = MagicMock()
        text_block.type = "text"
        text_block.text = "Already streamed text"
        text_block.citations = []

        tool_block = MagicMock()
        tool_block.type = "tool_use"
        tool_block.name = "update_note_block"
        tool_block.input = {}
        tool_block.id = "toolu_123"

        msg = MockAssistantMessage([text_block, tool_block])

        result = transform_sdk_message(msg, holder)

        # All blocks were streamed, so no events should be emitted
        assert result is None or result == ""

        # Dedup state preserved for partial message re-delivery (cleaned on SystemMessage init)
        assert holder.get("_stream_events_sent") is True

    def test_assistant_message_processes_new_blocks(self) -> None:
        """AssistantMessage processes blocks NOT sent via StreamEvent."""
        holder = _make_holder()

        # Only block 0 was streamed
        holder["_stream_events_sent"] = True
        holder["_streamed_block_indices"] = {0}

        streamed_block = MagicMock()
        streamed_block.type = "text"
        streamed_block.text = "Already streamed"
        streamed_block.citations = []

        new_block = MagicMock()
        new_block.type = "text"
        new_block.text = "New content not streamed"
        new_block.citations = []
        new_block.parent_tool_use_id = None

        msg = MockAssistantMessage([streamed_block, new_block])

        result = transform_sdk_message(msg, holder)

        assert result is not None
        assert "New content not streamed" in result
        assert "Already streamed" not in result

    def test_no_stream_events_processes_normally(self) -> None:
        """Without stream events, AssistantMessage processes all blocks."""
        holder = _make_holder()

        text_block = MagicMock()
        text_block.type = "text"
        text_block.text = "Normal response"
        text_block.citations = []
        text_block.parent_tool_use_id = None

        msg = MockAssistantMessage([text_block])

        result = transform_sdk_message(msg, holder)

        assert result is not None
        assert "Normal response" in result


class TestContentBlockStopFlush:
    """Test that content_block_stop flushes the delta buffer.

    This ensures tool_input_delta events reach the frontend BEFORE
    the tool executes, not after tool_result (which would be too late
    for early UI feedback like auto-scroll and pending-edit highlight).
    """

    def test_content_block_stop_flushes_tool_input_deltas(self) -> None:
        """content_block_stop flushes buffered tool_input_delta events."""
        from pilot_space.ai.agents.sse_delta_buffer import DeltaBuffer

        holder = _make_holder()
        buffer = DeltaBuffer()
        buffer.set_message_context("msg-123")

        # Simulate tool input streaming (input_json_delta → buffer)
        transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 1,
                "delta": {"type": "input_json_delta", "partial_json": '{"block_id": "abc"}'},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
            delta_buffer=buffer,
        )

        # Buffer has content but hasn't flushed yet (within 50ms window)
        assert buffer._has_buffered_content()

        # content_block_stop triggers flush
        result = transform_stream_event(
            event_data={"type": "content_block_stop", "index": 1},
            parent_tool_use_id=None,
            current_message_id_holder=holder,
            delta_buffer=buffer,
        )

        # Buffer flushed — tool_input_delta event emitted
        assert result is not None
        assert "event: tool_input_delta" in result
        data = json.loads(result.split("data: ")[1].split("\n")[0])
        assert data["delta"] == '{"block_id": "abc"}'
        assert data["blockIndex"] == 1

        # Buffer is now empty
        assert not buffer._has_buffered_content()

    def test_content_block_stop_flushes_all_buffer_types(self) -> None:
        """content_block_stop flushes thinking, text, and tool_input deltas."""
        from pilot_space.ai.agents.sse_delta_buffer import DeltaBuffer

        holder = _make_holder()
        buffer = DeltaBuffer()
        buffer.set_message_context("msg-123")

        # Buffer text and thinking deltas
        buffer.add_thinking_delta(0, "analyzing...")
        buffer.add_text_delta(2, "Here is the result")

        result = transform_stream_event(
            event_data={"type": "content_block_stop", "index": 0},
            parent_tool_use_id=None,
            current_message_id_holder=holder,
            delta_buffer=buffer,
        )

        assert result is not None
        assert "event: thinking_delta" in result
        assert "event: text_delta" in result
        assert not buffer._has_buffered_content()

    def test_content_block_stop_empty_buffer_returns_none(self) -> None:
        """content_block_stop with empty buffer returns None."""
        from pilot_space.ai.agents.sse_delta_buffer import DeltaBuffer

        holder = _make_holder()
        buffer = DeltaBuffer()

        result = transform_stream_event(
            event_data={"type": "content_block_stop"},
            parent_tool_use_id=None,
            current_message_id_holder=holder,
            delta_buffer=buffer,
        )

        assert result is None

    def test_tool_input_delta_order_before_tool_result(self) -> None:
        """Simulates the full SSE sequence proving correct event ordering.

        Expected order after fix:
        1. tool_use (empty input from content_block_start)
        2. tool_input_delta (flushed by content_block_stop, BEFORE tool executes)
        3. content_update + tool_result (from UserMessage after tool execution)
        """
        from pilot_space.ai.agents.sse_delta_buffer import DeltaBuffer

        holder = _make_holder()
        buffer = DeltaBuffer()
        buffer.set_message_context("msg-123")
        sse_events: list[str] = []

        # Step 1: content_block_start → tool_use(empty)
        result = transform_stream_event(
            event_data={
                "type": "content_block_start",
                "index": 1,
                "content_block": {
                    "type": "tool_use",
                    "id": "toolu_abc",
                    "name": "update_note_block",
                },
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
            delta_buffer=buffer,
        )
        if result:
            sse_events.append(result)

        # Step 2: input_json_delta → buffered
        result = transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 1,
                "delta": {
                    "type": "input_json_delta",
                    "partial_json": '{"block_id": "block-xyz", "markdown": "hello"}',
                },
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
            delta_buffer=buffer,
        )
        if result:
            sse_events.append(result)

        # Step 3: content_block_stop → FLUSH (tool_input_delta emitted)
        result = transform_stream_event(
            event_data={"type": "content_block_stop", "index": 1},
            parent_tool_use_id=None,
            current_message_id_holder=holder,
            delta_buffer=buffer,
        )
        if result:
            sse_events.append(result)

        # Verify: tool_use came first, then tool_input_delta
        all_events = "".join(sse_events)
        tool_use_pos = all_events.index("event: tool_use")
        tool_input_pos = all_events.index("event: tool_input_delta")
        assert tool_use_pos < tool_input_pos, (
            "tool_input_delta must arrive after tool_use but before tool_result"
        )

        # Verify tool_input_delta contains the block_id (escaped in JSON)
        assert "block-xyz" in all_events


class TestStreamEventViaTransformSdkMessage:
    """Test StreamEvent handling through the main transform_sdk_message entry point."""

    def test_stream_event_routed_correctly(self) -> None:
        """StreamEvent type is detected and routed to transform_stream_event."""
        holder = _make_holder()
        msg = MockStreamEvent(
            event={
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "text_delta", "text": "Hello"},
            },
        )

        result = transform_sdk_message(msg, holder)

        assert result is not None
        assert "event: text_delta" in result
        assert holder.get("_stream_events_sent") is True


class TestToolResultCompletion:
    """Test tool_result event emission alongside content_update."""

    def test_pending_apply_emits_tool_result(self) -> None:
        """ToolResultMessage with pending_apply emits both content_update and tool_result."""
        msg = MagicMock()
        msg.__class__.__name__ = "ToolResultMessage"
        msg.result = {
            "status": "pending_apply",
            "operation": "replace_block",
            "note_id": str(uuid4()),
            "block_id": "block-1",
            "markdown": "## Updated",
        }
        msg.tool_use_id = "toolu_456"
        msg.name = "update_note_block"
        msg.tool_name = "update_note_block"

        result = transform_tool_result(msg)

        assert result is not None
        assert "event: content_update" in result
        assert "event: tool_result" in result

        # Parse the tool_result event
        events = result.strip().split("\n\n")
        tool_result_events = [e for e in events if e.startswith("event: tool_result")]
        assert len(tool_result_events) == 1
        data = json.loads(tool_result_events[0].split("data: ")[1])
        assert data["toolCallId"] == "toolu_456"
        assert data["status"] == "completed"

    def test_non_pending_apply_no_double_tool_result(self) -> None:
        """Non-pending_apply tool results emit only one tool_result (existing behavior)."""
        msg = MagicMock()
        msg.__class__.__name__ = "ToolResultMessage"
        msg.result = {"output": "some result"}
        msg.tool_use_id = "toolu_789"
        msg.name = "Read"
        msg.tool_name = "Read"

        result = transform_tool_result(msg)

        assert result is not None
        assert "event: tool_result" in result
        # Should have exactly one tool_result event
        events = result.strip().split("\n\n")
        tool_result_events = [e for e in events if e.startswith("event: tool_result")]
        assert len(tool_result_events) == 1


class TestDedupStateResetOnInit:
    """Test that dedup state is cleared when a new session starts."""

    def test_init_clears_stale_dedup_state(self) -> None:
        """SystemMessage init resets dedup state from previous failed request."""
        holder = _make_holder()

        # Simulate stale state from a previous request that failed
        holder["_stream_events_sent"] = True
        holder["_streamed_block_indices"] = {0, 1, 2}

        # New session init should clear stale dedup state
        init_msg = MagicMock()
        init_msg.__class__.__name__ = "SystemMessage"
        init_msg.data = {
            "type": "system",
            "subtype": "init",
            "session_id": "new-session-id",
        }

        result = transform_sdk_message(init_msg, holder)

        assert result is not None
        assert "event: message_start" in result
        # Dedup state must be cleared
        assert "_stream_events_sent" not in holder
        assert "_streamed_block_indices" not in holder

    def test_init_reset_prevents_false_dedup(self) -> None:
        """After init reset, AssistantMessage blocks are NOT incorrectly skipped."""
        holder = _make_holder()

        # Stale state from previous request
        holder["_stream_events_sent"] = True
        holder["_streamed_block_indices"] = {0, 1}

        # New session init clears state
        init_msg = MagicMock()
        init_msg.__class__.__name__ = "SystemMessage"
        init_msg.data = {
            "type": "system",
            "subtype": "init",
            "session_id": "new-session",
        }
        transform_sdk_message(init_msg, holder)

        # New AssistantMessage arrives (no StreamEvents in this request)
        text_block = MagicMock()
        text_block.type = "text"
        text_block.text = "Fresh response"
        text_block.citations = []
        text_block.parent_tool_use_id = None

        msg = MockAssistantMessage([text_block])
        result = transform_sdk_message(msg, holder)

        # Block should NOT be skipped
        assert result is not None
        assert "Fresh response" in result


class TestSignatureDeltaForwarding:
    """Test signature_delta forwarding for multi-turn thinking integrity."""

    def test_signature_delta_forwarded_as_thinking_delta(self) -> None:
        """signature_delta events are forwarded as thinking_delta with signature field."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "signature_delta", "signature": "EqoB_test_sig"},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )

        assert result is not None
        assert "event: thinking_delta" in result
        data = json.loads(result.split("data: ")[1].split("\n")[0])
        assert data["signature"] == "EqoB_test_sig"
        assert data["blockIndex"] == 0
        assert data["messageId"] == "msg-123"
        # Should NOT have a delta text field
        assert "delta" not in data

    def test_empty_signature_delta_returns_none(self) -> None:
        """signature_delta with empty signature returns None."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "signature_delta", "signature": ""},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )
        assert result is None

    def test_signature_delta_preserves_block_index(self) -> None:
        """signature_delta preserves the correct block index."""
        holder = _make_holder()
        result = transform_stream_event(
            event_data={
                "type": "content_block_delta",
                "index": 3,
                "delta": {"type": "signature_delta", "signature": "sig_at_idx_3"},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )

        assert result is not None
        data = json.loads(result.split("data: ")[1].split("\n")[0])
        assert data["blockIndex"] == 3


class TestStreamEventTracking:
    """Test that stream event tracking state is managed correctly."""

    def test_stream_events_set_tracking_flag(self) -> None:
        """Processing a StreamEvent sets _stream_events_sent flag."""
        holder = _make_holder()
        transform_stream_event(
            event_data={
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "text"},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )
        assert holder["_stream_events_sent"] is True

    def test_stream_events_track_block_indices(self) -> None:
        """Processing StreamEvents tracks which block indices were sent."""
        holder = _make_holder()
        transform_stream_event(
            event_data={
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "text"},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )
        transform_stream_event(
            event_data={
                "type": "content_block_start",
                "index": 2,
                "content_block": {"type": "tool_use", "id": "t1", "name": "Read"},
            },
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )
        assert holder["_streamed_block_indices"] == {0, 2}

    def test_ignored_events_dont_set_tracking(self) -> None:
        """Ignored events (message_stop etc.) don't set tracking flags."""
        holder = _make_holder()
        transform_stream_event(
            event_data={"type": "message_stop"},
            parent_tool_use_id=None,
            current_message_id_holder=holder,
        )
        assert "_stream_events_sent" not in holder
