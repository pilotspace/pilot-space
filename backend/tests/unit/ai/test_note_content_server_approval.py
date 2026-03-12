"""Unit tests for check_approval_from_db wiring in note_content_server.py.

Tests verify that:
1. Each mutating tool calls check_approval_from_db with correct tool_name and ActionType
2. search_note_content does NOT call check_approval_from_db
3. The file no longer imports or uses get_tool_approval_level

All external dependencies (DB, publisher) are fully mocked.
"""

from __future__ import annotations

import inspect
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pilot_space.ai.infrastructure.approval import ActionType as AT
from pilot_space.ai.tools.mcp_server import ToolApprovalLevel, ToolContext

_WORKSPACE_ID = str(uuid.uuid4())
_NOTE_ID = str(uuid.uuid4())
_BLOCK_ID = str(uuid.uuid4())


def _make_tool_context() -> ToolContext:
    """Build a minimal ToolContext with a fake async session."""
    return ToolContext(
        db_session=AsyncMock(),
        workspace_id=_WORKSPACE_ID,
        user_id=str(uuid.uuid4()),
    )


def _make_publisher() -> MagicMock:
    """Build a mock EventPublisher."""
    publisher = MagicMock()
    publisher.publish_focus_and_content = AsyncMock()
    return publisher


def _create_tools(publisher: MagicMock, tool_context: ToolContext):
    """Create note_content_server and capture tools by name.

    Patches create_sdk_mcp_server to intercept the tools list.
    """
    captured_tools = {}

    def _capture_create(**kwargs):
        for t in kwargs.get("tools", []):
            captured_tools[t.name] = t
        return {"type": "sdk_mcp", "name": kwargs["name"], "instance": MagicMock()}

    with patch(
        "pilot_space.ai.mcp.note_content_server.create_sdk_mcp_server",
        side_effect=_capture_create,
    ):
        from pilot_space.ai.mcp.note_content_server import (
            create_note_content_server,
        )

        create_note_content_server(publisher, tool_context=tool_context)

    return captured_tools


def _patch_note_repo():
    """Patch NoteRepository at the import location."""
    mock_note = MagicMock()
    mock_note.workspace_id = uuid.UUID(_WORKSPACE_ID)
    mock_repo = MagicMock()
    mock_repo.get_by_id = AsyncMock(return_value=mock_note)
    return patch(
        "pilot_space.infrastructure.database.repositories.note_repository.NoteRepository",
        return_value=mock_repo,
    )


class TestNoteContentServerApprovalWiring:
    """Verify each mutating tool calls check_approval_from_db."""

    @pytest.mark.asyncio
    async def test_insert_block_calls_check_approval(self) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.REQUIRE_APPROVAL)
        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            _patch_note_repo(),
            patch(
                "pilot_space.ai.mcp.note_content_server.check_approval_from_db",
                mock_chk,
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["insert_block"].handler({"note_id": _NOTE_ID, "content_markdown": "hello"})
        mock_chk.assert_awaited_once_with("insert_block", AT.INSERT_BLOCK, ctx)

    @pytest.mark.asyncio
    async def test_remove_block_calls_check_approval(self) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.REQUIRE_APPROVAL)
        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            _patch_note_repo(),
            patch(
                "pilot_space.ai.mcp.note_content_server.check_approval_from_db",
                mock_chk,
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["remove_block"].handler({"note_id": _NOTE_ID, "block_id": _BLOCK_ID})
        mock_chk.assert_awaited_once_with("remove_block", AT.REMOVE_BLOCK, ctx)

    @pytest.mark.asyncio
    async def test_remove_content_calls_check_approval(self) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.REQUIRE_APPROVAL)
        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            _patch_note_repo(),
            patch(
                "pilot_space.ai.mcp.note_content_server.check_approval_from_db",
                mock_chk,
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["remove_content"].handler({"note_id": _NOTE_ID, "pattern": "text"})
        mock_chk.assert_awaited_once_with("remove_content", AT.REMOVE_CONTENT, ctx)

    @pytest.mark.asyncio
    async def test_replace_content_calls_check_approval(self) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.REQUIRE_APPROVAL)
        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            _patch_note_repo(),
            patch(
                "pilot_space.ai.mcp.note_content_server.check_approval_from_db",
                mock_chk,
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["replace_content"].handler(
                {
                    "note_id": _NOTE_ID,
                    "old_pattern": "old",
                    "new_content": "new",
                }
            )
        mock_chk.assert_awaited_once_with("replace_content", AT.REPLACE_CONTENT, ctx)

    @pytest.mark.asyncio
    async def test_create_pm_block_calls_check_approval(self) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.REQUIRE_APPROVAL)
        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            _patch_note_repo(),
            patch(
                "pilot_space.ai.mcp.note_content_server.check_approval_from_db",
                mock_chk,
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["create_pm_block"].handler(
                {
                    "note_id": _NOTE_ID,
                    "block_type": "dashboard",
                    "data": {"title": "t"},
                }
            )
        mock_chk.assert_awaited_once_with("create_pm_block", AT.INSERT_BLOCK, ctx)

    @pytest.mark.asyncio
    async def test_update_pm_block_calls_check_approval(self) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.REQUIRE_APPROVAL)
        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            _patch_note_repo(),
            patch(
                "pilot_space.ai.mcp.note_content_server.check_approval_from_db",
                mock_chk,
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["update_pm_block"].handler(
                {
                    "note_id": _NOTE_ID,
                    "block_id": _BLOCK_ID,
                    "data": {"title": "t"},
                }
            )
        mock_chk.assert_awaited_once_with("update_pm_block", AT.REPLACE_CONTENT, ctx)


class TestSearchNoteContentNoApproval:
    """Verify search_note_content does NOT call check_approval_from_db."""

    @pytest.mark.asyncio
    async def test_search_does_not_call_approval(self) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.AUTO_EXECUTE)
        mock_note = MagicMock()
        mock_note.workspace_id = uuid.UUID(_WORKSPACE_ID)
        mock_note.content = {"content": []}
        mock_repo = MagicMock()
        mock_repo.get_by_id = AsyncMock(return_value=mock_note)

        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            patch(
                "pilot_space.ai.mcp.note_content_server.check_approval_from_db",
                mock_chk,
            ),
            patch(
                "pilot_space.infrastructure.database.repositories.note_repository.NoteRepository",
                return_value=mock_repo,
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["search_note_content"].handler({"note_id": _NOTE_ID, "pattern": "test"})
        mock_chk.assert_not_awaited()


class TestNoGetToolApprovalLevelImport:
    """Verify note_content_server no longer imports get_tool_approval_level."""

    def test_no_get_tool_approval_level_usage(self) -> None:
        from pilot_space.ai.mcp import note_content_server

        source = inspect.getsource(note_content_server)
        assert "get_tool_approval_level" not in source
