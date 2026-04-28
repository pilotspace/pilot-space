"""Phase 87.1 Plan 03 — RED tests for artifact_id extraction + persistence.

Verifies:
  * ``extract_artifact_ids_from_blocks`` correctly mines artifact UUIDs out
    of the ``tool_result`` payloads emitted by the ``create_file`` tool.
  * ``save_session_messages`` propagates the extracted ids into
    ``session_handler.add_message(metadata=...)``.
  * ``StreamEvent.ARTIFACT_CREATED`` exists.
  * The full round-trip survives ``AIMessage.to_dict() / from_dict()`` —
    metadata is the chat-replay storage path (``AISession.session_data``
    JSONB), NOT the unused ``ai_messages.message_metadata`` SQLAlchemy
    column. Asserting this guards against the silent-drop bug discovered
    in Wave 3 review (advisor reconcile).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from pilot_space.ai.agents.pilotspace_stream_utils import (
    StreamEvent,
    extract_artifact_ids_from_blocks,
    save_session_messages,
)
from pilot_space.ai.session.session_models import AIMessage


def _create_file_blocks(
    *,
    tool_id: str = "abc",
    artifact_id: str = "11111111-1111-1111-1111-111111111111",
    filename: str = "report.md",
    fmt: str = "md",
    content_dict: bool = True,
    is_error: bool = False,
    name: str = "create_file",
) -> dict[str, dict[str, Any]]:
    """Build a minimal content_blocks dict mirroring the SSE-captured shape."""
    payload: dict[str, Any] = {
        "artifact_id": artifact_id,
        "filename": filename,
        "mime_type": "text/markdown" if fmt == "md" else "text/html",
        "size_bytes": 24,
        "format": fmt,
    }
    content: Any = payload if content_dict else __import__("json").dumps(payload)
    return {
        f"tool_use_{tool_id}": {
            "type": "tool_use",
            "id": tool_id,
            "name": name,
            "input": {"filename": filename, "content": "x", "format": fmt},
            "index": 0,
        },
        f"tool_result_{tool_id}": {
            "type": "tool_result",
            "tool_use_id": tool_id,
            "content": content,
            "is_error": is_error,
            "index": 1,
        },
    }


# ---------------------------------------------------------------------------
# StreamEvent registry
# ---------------------------------------------------------------------------


def test_stream_event_artifact_created_exists() -> None:
    assert StreamEvent.ARTIFACT_CREATED.value == "artifact_created"


# ---------------------------------------------------------------------------
# extract_artifact_ids_from_blocks
# ---------------------------------------------------------------------------


class TestExtractArtifactIdsFromBlocks:
    def test_returns_empty_for_no_create_file_calls(self) -> None:
        blocks: dict[str, dict[str, Any]] = {
            "tool_use_x": {
                "type": "tool_use",
                "id": "x",
                "name": "get_issue",
                "input": {},
                "index": 0,
            },
        }
        assert extract_artifact_ids_from_blocks(blocks) == []

    def test_returns_empty_for_empty_blocks(self) -> None:
        assert extract_artifact_ids_from_blocks({}) == []

    def test_extracts_single_artifact_id_from_dict_content(self) -> None:
        blocks = _create_file_blocks(artifact_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        assert extract_artifact_ids_from_blocks(blocks) == [
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        ]

    def test_extracts_artifact_id_from_json_string_content(self) -> None:
        blocks = _create_file_blocks(content_dict=False)
        ids = extract_artifact_ids_from_blocks(blocks)
        assert ids == ["11111111-1111-1111-1111-111111111111"]

    def test_skips_failed_create_file_calls(self) -> None:
        blocks = _create_file_blocks(is_error=True)
        assert extract_artifact_ids_from_blocks(blocks) == []

    def test_extracts_multiple_artifact_ids_in_index_order(self) -> None:
        first = _create_file_blocks(
            tool_id="t1", artifact_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        )
        second_use = {
            "tool_use_t2": {
                "type": "tool_use",
                "id": "t2",
                "name": "create_file",
                "input": {"filename": "b.html", "content": "x", "format": "html"},
                "index": 2,
            },
            "tool_result_t2": {
                "type": "tool_result",
                "tool_use_id": "t2",
                "content": {
                    "artifact_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                    "filename": "b.html",
                    "mime_type": "text/html",
                    "size_bytes": 1,
                    "format": "html",
                },
                "is_error": False,
                "index": 3,
            },
        }
        merged = {**first, **second_use}
        ids = extract_artifact_ids_from_blocks(merged)
        assert ids == [
            "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        ]

    def test_skips_malformed_payloads(self) -> None:
        blocks = {
            "tool_use_t": {
                "type": "tool_use",
                "id": "t",
                "name": "create_file",
                "input": {},
                "index": 0,
            },
            "tool_result_t": {
                "type": "tool_result",
                "tool_use_id": "t",
                "content": "not-json-and-not-dict",
                "is_error": False,
                "index": 1,
            },
        }
        assert extract_artifact_ids_from_blocks(blocks) == []

    def test_skips_non_create_file_tool_results(self) -> None:
        blocks = _create_file_blocks(name="get_issue")
        assert extract_artifact_ids_from_blocks(blocks) == []


# ---------------------------------------------------------------------------
# save_session_messages — passes metadata kwarg AND it round-trips
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestSaveSessionMessagesPropagatesMetadata:
    async def test_passes_artifact_ids_metadata_to_add_message(self) -> None:
        handler = AsyncMock()
        blocks = _create_file_blocks(
            artifact_id="cccccccc-cccc-cccc-cccc-cccccccccccc",
        )
        # Add a text reply alongside the tool call so structured_content
        # is non-empty and the assistant add_message branch fires.
        blocks["text_99"] = {
            "type": "text",
            "text": "Done",
            "index": 99,
        }
        await save_session_messages(
            session_handler=handler,
            session_id="11111111-1111-1111-1111-111111111111",
            message="please make me a file",
            content_blocks=blocks,
        )
        # Two add_message calls: user, assistant. Inspect assistant.
        calls = handler.add_message.await_args_list
        assert len(calls) == 2
        assistant_kwargs = calls[1].kwargs
        assert assistant_kwargs["role"] == "assistant"
        assert assistant_kwargs["metadata"] == {
            "artifact_ids": ["cccccccc-cccc-cccc-cccc-cccccccccccc"]
        }

    async def test_no_metadata_kwarg_when_no_create_file(self) -> None:
        handler = AsyncMock()
        blocks: dict[str, dict[str, Any]] = {
            "text_0": {"type": "text", "text": "Hello", "index": 0},
        }
        await save_session_messages(
            session_handler=handler,
            session_id="22222222-2222-2222-2222-222222222222",
            message="hi",
            content_blocks=blocks,
        )
        assistant_kwargs = handler.add_message.await_args_list[1].kwargs
        # Either the kwarg is omitted or explicitly None — both acceptable.
        assert assistant_kwargs.get("metadata") in (None, {})

    async def test_caps_artifact_ids_at_50_entries(self) -> None:
        handler = AsyncMock()
        blocks: dict[str, dict[str, Any]] = {
            "text_99": {"type": "text", "text": "ok", "index": 99},
        }
        for i in range(60):
            tid = f"t{i}"
            blocks[f"tool_use_{tid}"] = {
                "type": "tool_use",
                "id": tid,
                "name": "create_file",
                "input": {},
                "index": i * 2,
            }
            blocks[f"tool_result_{tid}"] = {
                "type": "tool_result",
                "tool_use_id": tid,
                "content": {
                    "artifact_id": f"00000000-0000-0000-0000-{i:012d}",
                    "filename": "a.md",
                    "mime_type": "text/markdown",
                    "size_bytes": 1,
                    "format": "md",
                },
                "is_error": False,
                "index": i * 2 + 1,
            }
        await save_session_messages(
            session_handler=handler,
            session_id="33333333-3333-3333-3333-333333333333",
            message="batch",
            content_blocks=blocks,
        )
        assistant_kwargs = handler.add_message.await_args_list[1].kwargs
        assert assistant_kwargs["metadata"] is not None
        assert len(assistant_kwargs["metadata"]["artifact_ids"]) == 50


# ---------------------------------------------------------------------------
# AIMessage dataclass round-trip — guards against the silent-drop bug.
# This is the chat-replay storage path; if metadata doesn't survive
# to_dict/from_dict, reload loses the artifact reference.
# ---------------------------------------------------------------------------


class TestAIMessageMetadataRoundTrip:
    def test_metadata_field_exists(self) -> None:
        msg = AIMessage(
            role="assistant",
            content="ok",
            metadata={"artifact_ids": ["abc"]},
        )
        assert msg.metadata == {"artifact_ids": ["abc"]}

    def test_metadata_survives_to_dict_from_dict(self) -> None:
        msg = AIMessage(
            role="assistant",
            content="ok",
            metadata={"artifact_ids": ["abc", "def"]},
        )
        round_tripped = AIMessage.from_dict(msg.to_dict())
        assert round_tripped.metadata == {"artifact_ids": ["abc", "def"]}
