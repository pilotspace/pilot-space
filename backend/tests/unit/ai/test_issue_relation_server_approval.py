"""Unit tests for check_approval_from_db wiring in issue_relation_server.py.

Tests verify that each of the 4 plan-specified tools calls check_approval_from_db
with correct tool_name and ActionType, and that the file no longer imports
get_tool_approval_level.

All external dependencies (DB, publisher, entity resolver) are fully mocked.
"""

from __future__ import annotations

import inspect
import uuid
from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pilot_space.ai.infrastructure.approval import ActionType as AT
from pilot_space.ai.tools.mcp_server import ToolApprovalLevel, ToolContext

_WORKSPACE_ID = str(uuid.uuid4())
_ISSUE_ID = str(uuid.uuid4())
_ISSUE_ID_2 = str(uuid.uuid4())
_NOTE_ID = str(uuid.uuid4())


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
    """Create issue_relation_server and capture tools by name."""
    captured_tools = {}

    def _capture_create(**kwargs):
        for t in kwargs.get("tools", []):
            captured_tools[t.name] = t
        return {
            "type": "sdk_mcp",
            "name": kwargs["name"],
            "instance": MagicMock(),
        }

    with patch(
        "pilot_space.ai.mcp.issue_relation_server.create_sdk_mcp_server",
        side_effect=_capture_create,
    ):
        from pilot_space.ai.mcp.issue_relation_server import (
            create_issue_relation_tools_server,
        )

        create_issue_relation_tools_server(publisher, tool_context=tool_context)

    return captured_tools


def _mock_deps():
    """Return context manager that patches entity resolver and repos."""
    mock_issue = MagicMock()
    mock_issue.workspace_id = uuid.UUID(_WORKSPACE_ID)
    mock_note = MagicMock()
    mock_note.workspace_id = uuid.UUID(_WORKSPACE_ID)

    mock_issue_repo = MagicMock()
    mock_issue_repo.get_by_id = AsyncMock(return_value=mock_issue)
    mock_note_repo = MagicMock()
    mock_note_repo.get_by_id = AsyncMock(return_value=mock_note)

    stack = ExitStack()
    stack.enter_context(
        patch(
            "pilot_space.ai.mcp.issue_relation_server.resolve_entity_id_strict",
            new_callable=AsyncMock,
            side_effect=lambda _t, eid, _ctx: uuid.UUID(eid),
        )
    )
    stack.enter_context(
        patch(
            "pilot_space.ai.mcp.issue_relation_server.IssueRepository",
            return_value=mock_issue_repo,
        )
    )
    stack.enter_context(
        patch(
            "pilot_space.infrastructure.database.repositories.note_repository.NoteRepository",
            return_value=mock_note_repo,
        )
    )
    return stack


class TestIssueRelationServerApprovalWiring:
    """Verify each tool calls check_approval_from_db with correct args."""

    @pytest.mark.asyncio
    async def test_link_issue_to_note_calls_check_approval(self) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.REQUIRE_APPROVAL)
        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            _mock_deps(),
            patch(
                "pilot_space.ai.mcp.issue_relation_server.check_approval_from_db",
                mock_chk,
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["link_issue_to_note"].handler({"issue_id": _ISSUE_ID, "note_id": _NOTE_ID})
        mock_chk.assert_awaited_once_with("link_issue_to_note", AT.LINK_ISSUE_TO_NOTE, ctx)

    @pytest.mark.asyncio
    async def test_link_issues_calls_check_approval(self) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.REQUIRE_APPROVAL)
        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            _mock_deps(),
            patch(
                "pilot_space.ai.mcp.issue_relation_server.check_approval_from_db",
                mock_chk,
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["link_issues"].handler(
                {
                    "source_issue_id": _ISSUE_ID,
                    "target_issue_id": _ISSUE_ID_2,
                    "link_type": "related",
                }
            )
        mock_chk.assert_awaited_once_with("link_issues", AT.LINK_ISSUES, ctx)

    @pytest.mark.asyncio
    async def test_add_sub_issue_calls_check_approval(self) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.REQUIRE_APPROVAL)
        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            _mock_deps(),
            patch(
                "pilot_space.ai.mcp.issue_relation_server.check_approval_from_db",
                mock_chk,
            ),
            patch(
                "pilot_space.ai.mcp.issue_relation_server._check_circular_parent",
                new_callable=AsyncMock,
                return_value=(False, None),
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["add_sub_issue"].handler(
                {
                    "parent_issue_id": _ISSUE_ID,
                    "child_issue_id": _ISSUE_ID_2,
                }
            )
        mock_chk.assert_awaited_once_with("add_sub_issue", AT.ADD_SUB_ISSUE, ctx)

    @pytest.mark.asyncio
    async def test_transition_issue_state_calls_check_approval(
        self,
    ) -> None:
        mock_chk = AsyncMock(return_value=ToolApprovalLevel.REQUIRE_APPROVAL)
        publisher = _make_publisher()
        ctx = _make_tool_context()
        with (
            _mock_deps(),
            patch(
                "pilot_space.ai.mcp.issue_relation_server.check_approval_from_db",
                mock_chk,
            ),
        ):
            tools = _create_tools(publisher, ctx)
            await tools["transition_issue_state"].handler(
                {
                    "issue_id": _ISSUE_ID,
                    "target_state_id": str(uuid.uuid4()),
                }
            )
        mock_chk.assert_awaited_once_with("transition_issue_state", AT.TRANSITION_ISSUE_STATE, ctx)


class TestNoGetToolApprovalLevelImport:
    """Verify issue_relation_server no longer imports get_tool_approval_level."""

    def test_no_get_tool_approval_level_usage(self) -> None:
        from pilot_space.ai.mcp import issue_relation_server

        source = inspect.getsource(issue_relation_server)
        assert "get_tool_approval_level" not in source
