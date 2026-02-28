"""Unit tests for MCP note server tools (note_server.py).

Tests the in-process SDK MCP server tools that emit SSE events via
EventPublisher and return short text confirmations. Focuses on the
write_to_note tool and TOOL_NAMES constant.

H-3: _verify_note_workspace now fails closed when tool_context is None.
     Tests that need SSE event flow must use _make_mock_context() which
     provides a mock context with exists_in_workspace returning True.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pilot_space.ai.mcp.event_publisher import EventPublisher
from pilot_space.ai.mcp.note_server import (
    SERVER_NAME,
    TOOL_NAMES,
    create_note_tools_server,
)

_NOTE_REPO_PATH = "pilot_space.infrastructure.database.repositories.note_repository.NoteRepository"

# Stable UUIDs for all tests
_NOTE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
_NOTE_ID_ALT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
_WS_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff"


def _make_mock_context() -> MagicMock:
    """Create a mock tool_context that passes workspace verification.

    The mock NoteRepository.exists_in_workspace returns True so that
    _verify_note_workspace succeeds without hitting the real database.
    """
    ctx = MagicMock()
    ctx.workspace_id = _WS_ID
    ctx.db_session = AsyncMock()
    return ctx


def _parse_sse_event(raw: str) -> dict:
    """Parse an SSE event string into event type and JSON data."""
    lines = raw.strip().split("\n")
    event_type = ""
    data_str = ""
    for line in lines:
        if line.startswith("event: "):
            event_type = line[7:]
        elif line.startswith("data: "):
            data_str = line[6:]
    return {"event": event_type, "data": json.loads(data_str)}


def _capture_tools(
    publisher: EventPublisher,
    context_note_id: str | None = None,
    tool_context: MagicMock | None = None,
):
    """Create note server and capture the SdkMcpTool objects.

    Patches create_sdk_mcp_server in the note_server module to intercept
    the tools list before it gets wrapped into the MCP server instance.
    Pass tool_context=_make_mock_context() for tests that exercise the
    SSE event path (workspace verification must pass).
    """
    captured: dict[str, object] = {}

    import pilot_space.ai.mcp.note_server as ns_module

    original_create = ns_module.create_sdk_mcp_server

    def _intercept_create(*, name, version, tools):
        captured["tools"] = {t.name: t for t in tools}
        return original_create(name=name, version=version, tools=tools)

    with patch.object(ns_module, "create_sdk_mcp_server", side_effect=_intercept_create):
        create_note_tools_server(
            publisher,
            context_note_id=context_note_id,
            tool_context=tool_context,
        )

    return captured["tools"]


def _drain_queue(queue: asyncio.Queue[str]) -> list[dict]:
    """Drain all SSE events from queue and parse them."""
    events = []
    while not queue.empty():
        raw = queue.get_nowait()
        events.append(_parse_sse_event(raw))
    return events


class TestWriteToNoteTool:
    """Tests for the write_to_note MCP tool."""

    @pytest.mark.asyncio
    async def test_emits_content_update_and_returns_confirmation(self) -> None:
        """write_to_note emits content_update SSE and returns short confirmation."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
            write_tool = tools["write_to_note"]
            result = await write_tool.handler({"note_id": "ignored", "markdown": "# Hello World"})

        text = result["content"][0]["text"]
        assert "Content appended" in text

        events = _drain_queue(queue)
        event_types = [e["event"] for e in events]
        assert "focus_block" in event_types
        assert "content_update" in event_types

        cu = next(e for e in events if e["event"] == "content_update")
        assert cu["data"]["status"] in ("pending_apply", "approval_required")
        assert cu["data"]["operation"] == "append_blocks"
        assert cu["data"]["markdown"] == "# Hello World"
        assert cu["data"]["noteId"] == _NOTE_ID

    @pytest.mark.asyncio
    async def test_uses_context_note_id(self) -> None:
        """write_to_note uses context_note_id instead of model-provided note_id."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID_ALT, tool_context=mock_ctx)
            write_tool = tools["write_to_note"]
            await write_tool.handler({"note_id": _NOTE_ID, "markdown": "Content"})

        events = _drain_queue(queue)
        cu = next(e for e in events if e["event"] == "content_update")
        assert cu["data"]["noteId"] == _NOTE_ID_ALT

    @pytest.mark.asyncio
    async def test_rejects_empty_markdown(self) -> None:
        """write_to_note returns error text for empty markdown content."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        # Validation check fires before workspace check, no context needed
        tools = _capture_tools(publisher, context_note_id=_NOTE_ID)
        write_tool = tools["write_to_note"]

        result = await write_tool.handler({"note_id": _NOTE_ID, "markdown": ""})

        assert "Error" in result["content"][0]["text"]
        assert "empty" in result["content"][0]["text"].lower()
        assert queue.empty()

    @pytest.mark.asyncio
    async def test_rejects_whitespace_only_markdown(self) -> None:
        """write_to_note rejects whitespace-only markdown."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        tools = _capture_tools(publisher, context_note_id=_NOTE_ID)
        write_tool = tools["write_to_note"]

        result = await write_tool.handler({"note_id": _NOTE_ID, "markdown": "   \n\t  "})

        assert "Error" in result["content"][0]["text"]
        assert queue.empty()

    @pytest.mark.asyncio
    async def test_payload_has_null_after_block_id(self) -> None:
        """write_to_note payload has null after_block_id for end-of-doc append."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
            write_tool = tools["write_to_note"]
            await write_tool.handler({"note_id": _NOTE_ID, "markdown": "Some content"})

        events = _drain_queue(queue)
        cu = next(e for e in events if e["event"] == "content_update")
        assert cu["data"]["afterBlockId"] is None

    @pytest.mark.asyncio
    async def test_focus_block_emitted_with_scroll_to_end(self) -> None:
        """write_to_note emits focus_block with scrollToEnd=True."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
            write_tool = tools["write_to_note"]
            await write_tool.handler({"note_id": _NOTE_ID, "markdown": "Content"})

        events = _drain_queue(queue)
        fb = next(e for e in events if e["event"] == "focus_block")
        assert fb["data"]["scrollToEnd"] is True
        assert fb["data"]["noteId"] == _NOTE_ID


class TestToolNamesConstant:
    """Tests for the TOOL_NAMES constant."""

    def test_includes_write_to_note(self) -> None:
        """TOOL_NAMES includes the write_to_note tool."""
        expected = f"mcp__{SERVER_NAME}__write_to_note"
        assert expected in TOOL_NAMES

    def test_includes_insert_pm_block(self) -> None:
        """TOOL_NAMES includes the insert_pm_block tool."""
        expected = f"mcp__{SERVER_NAME}__insert_pm_block"
        assert expected in TOOL_NAMES

    def test_does_not_include_search_notes(self) -> None:
        """TOOL_NAMES does not contain search_notes (moved to note_query_server)."""
        assert f"mcp__{SERVER_NAME}__search_notes" not in TOOL_NAMES

    def test_has_nine_tools(self) -> None:
        """TOOL_NAMES has 9 entries (search_notes removed, insert_pm_block added)."""
        assert len(TOOL_NAMES) == 9

    def test_all_tools_have_server_prefix(self) -> None:
        """All tool names follow the mcp__{SERVER_NAME}__<tool> pattern."""
        prefix = f"mcp__{SERVER_NAME}__"
        for name in TOOL_NAMES:
            assert name.startswith(prefix), f"{name} missing server prefix"


class TestInsertPmBlockTool:
    """Tests for the insert_pm_block MCP tool."""

    @pytest.mark.asyncio
    async def test_emits_content_update_and_returns_confirmation(self) -> None:
        """insert_pm_block emits content_update SSE and returns confirmation."""
        import asyncio

        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        data_json = '{"title": "Architecture Decision", "status": "accepted"}'
        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
            pm_tool = tools["insert_pm_block"]
            result = await pm_tool.handler(
                {
                    "note_id": "ignored",
                    "block_type": "decision",
                    "data": data_json,
                }
            )

        text = result["content"][0]["text"]
        assert "decision" in text
        assert "inserted" in text

        events = _drain_queue(queue)
        event_types = [e["event"] for e in events]
        assert "content_update" in event_types

        cu = next(e for e in events if e["event"] == "content_update")
        assert cu["data"]["operation"] == "insert_pm_block"
        assert cu["data"]["noteId"] == _NOTE_ID
        assert cu["data"]["pmBlockData"]["blockType"] == "decision"
        assert cu["data"]["pmBlockData"]["data"] == data_json
        assert cu["data"]["pmBlockData"]["version"] == 1

    @pytest.mark.asyncio
    async def test_uses_context_note_id(self) -> None:
        """insert_pm_block uses context_note_id instead of model-provided note_id."""
        import asyncio

        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID_ALT, tool_context=mock_ctx)
            pm_tool = tools["insert_pm_block"]
            await pm_tool.handler(
                {
                    "note_id": _NOTE_ID,
                    "block_type": "risk",
                    "data": '{"level": "high"}',
                }
            )

        events = _drain_queue(queue)
        cu = next(e for e in events if e["event"] == "content_update")
        assert cu["data"]["noteId"] == _NOTE_ID_ALT

    @pytest.mark.asyncio
    async def test_rejects_invalid_block_type(self) -> None:
        """insert_pm_block returns error for invalid block_type."""
        import asyncio

        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
            pm_tool = tools["insert_pm_block"]
            result = await pm_tool.handler(
                {
                    "note_id": _NOTE_ID,
                    "block_type": "invalid_type",
                    "data": "{}",
                }
            )

        text = result["content"][0]["text"]
        assert "Error" in text
        assert "Invalid block_type" in text

    @pytest.mark.asyncio
    async def test_rejects_invalid_json_data(self) -> None:
        """insert_pm_block returns error for non-JSON data string."""
        import asyncio

        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
            pm_tool = tools["insert_pm_block"]
            result = await pm_tool.handler(
                {
                    "note_id": _NOTE_ID,
                    "block_type": "raci",
                    "data": "not valid json {",
                }
            )

        text = result["content"][0]["text"]
        assert "Error" in text
        assert "JSON" in text

    @pytest.mark.asyncio
    async def test_after_block_id_in_payload(self) -> None:
        """insert_pm_block passes after_block_id through to the SSE payload."""
        import asyncio

        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
            pm_tool = tools["insert_pm_block"]
            await pm_tool.handler(
                {
                    "note_id": _NOTE_ID,
                    "block_type": "raci",
                    "data": '{"roles": []}',
                    "after_block_id": "block-uuid-xyz",
                }
            )

        events = _drain_queue(queue)
        cu = next(e for e in events if e["event"] == "content_update")
        assert cu["data"]["afterBlockId"] == "block-uuid-xyz"

    @pytest.mark.asyncio
    async def test_null_after_block_id_when_not_provided(self) -> None:
        """insert_pm_block sets afterBlockId to None when not provided."""
        import asyncio

        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
            pm_tool = tools["insert_pm_block"]
            await pm_tool.handler(
                {
                    "note_id": _NOTE_ID,
                    "block_type": "status_update",
                    "data": '{"status": "on-track"}',
                }
            )

        events = _drain_queue(queue)
        cu = next(e for e in events if e["event"] == "content_update")
        assert cu["data"]["afterBlockId"] is None

    @pytest.mark.asyncio
    async def test_all_valid_block_types_accepted(self) -> None:
        """insert_pm_block accepts all valid block types without error."""
        import asyncio

        valid_types = [
            "raci",
            "risk",
            "decision",
            "dependency",
            "assumption",
            "requirement",
            "acceptance_criteria",
            "user_story",
            "definition_of_done",
            "status_update",
        ]

        for block_type in valid_types:
            queue: asyncio.Queue[str] = asyncio.Queue()
            publisher = EventPublisher(queue)
            mock_ctx = _make_mock_context()

            with patch(_NOTE_REPO_PATH) as mock_repo_cls:
                mock_repo = AsyncMock()
                mock_repo.exists_in_workspace = AsyncMock(return_value=True)
                mock_repo_cls.return_value = mock_repo
                tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
                pm_tool = tools["insert_pm_block"]
                result = await pm_tool.handler(
                    {
                        "note_id": _NOTE_ID,
                        "block_type": block_type,
                        "data": "{}",
                    }
                )

            text = result["content"][0]["text"]
            assert "Error" not in text, f"block_type '{block_type}' was rejected"

    @pytest.mark.asyncio
    async def test_schema_validation_warns_on_missing_keys(self) -> None:
        """insert_pm_block accepts data with missing keys but does not reject (H-4)."""
        import asyncio

        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
            pm_tool = tools["insert_pm_block"]
            # decision requires: summary, rationale, alternatives -- supply none
            result = await pm_tool.handler(
                {
                    "note_id": _NOTE_ID,
                    "block_type": "decision",
                    "data": "{}",
                }
            )

        # Missing keys should warn but NOT block the operation
        text = result["content"][0]["text"]
        assert "Error" not in text, "insert_pm_block should not reject on missing schema keys"
        assert "inserted" in text

    @pytest.mark.asyncio
    async def test_schema_validation_warns_on_unknown_keys(self) -> None:
        """insert_pm_block accepts data with extra unknown keys (H-4 extensibility)."""
        import asyncio

        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        mock_ctx = _make_mock_context()

        with patch(_NOTE_REPO_PATH) as mock_repo_cls:
            mock_repo = AsyncMock()
            mock_repo.exists_in_workspace = AsyncMock(return_value=True)
            mock_repo_cls.return_value = mock_repo
            tools = _capture_tools(publisher, context_note_id=_NOTE_ID, tool_context=mock_ctx)
            pm_tool = tools["insert_pm_block"]
            result = await pm_tool.handler(
                {
                    "note_id": _NOTE_ID,
                    "block_type": "risk",
                    "data": (
                        '{"description": "infra outage", "likelihood": "high",'
                        ' "impact": "high", "mitigation": "fallback", "unknownExtra": "ok"}'
                    ),
                }
            )

        text = result["content"][0]["text"]
        assert "Error" not in text, "insert_pm_block should allow extra keys for extensibility"


class TestVerifyNoteWorkspaceFailClosed:
    """Tests that _verify_note_workspace fails closed on missing context (H-3)."""

    @pytest.mark.asyncio
    async def test_write_to_note_returns_error_without_context(self) -> None:
        """write_to_note returns auth error when tool_context is None (H-3)."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        # No tool_context provided -- must fail closed
        tools = _capture_tools(publisher, context_note_id=_NOTE_ID)
        write_tool = tools["write_to_note"]

        result = await write_tool.handler({"note_id": _NOTE_ID, "markdown": "Some content"})

        text = result["content"][0]["text"]
        assert "authentication context required" in text
        assert queue.empty()

    @pytest.mark.asyncio
    async def test_update_note_block_returns_error_without_context(self) -> None:
        """update_note_block returns auth error when tool_context is None (H-3)."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        tools = _capture_tools(publisher, context_note_id=_NOTE_ID)
        tool = tools["update_note_block"]

        result = await tool.handler(
            {
                "note_id": _NOTE_ID,
                "block_id": "block-1",
                "new_content_markdown": "# New content",
            }
        )

        text = result["content"][0]["text"]
        assert "authentication context required" in text
        assert queue.empty()


class TestUpdateNoteTool:
    """Tests for the update_note MCP tool (L-3: uses _verify_note_workspace)."""

    @pytest.mark.asyncio
    async def test_requires_note_id(self) -> None:
        """update_note returns error when note_id is missing."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        tools = _capture_tools(publisher, context_note_id=None)
        update_tool = tools["update_note"]

        result = await update_tool.handler({})

        text = result["content"][0]["text"]
        assert "Error" in text
        assert "note_id" in text

    @pytest.mark.asyncio
    async def test_returns_error_without_context(self) -> None:
        """update_note returns auth error when tool_context is None (H-3, L-3)."""
        queue: asyncio.Queue[str] = asyncio.Queue()
        publisher = EventPublisher(queue)
        tools = _capture_tools(publisher, context_note_id=_NOTE_ID)
        update_tool = tools["update_note"]

        result = await update_tool.handler({"note_id": _NOTE_ID, "title": "New Title"})

        text = result["content"][0]["text"]
        assert "authentication context required" in text
