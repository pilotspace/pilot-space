"""Unit tests for project MCP tools.

Tests for 5 project tools (PR-001 to PR-005) that AI agents use
to query and manipulate projects during conversations.

Since tools are SDK MCP tools (closures within the server factory),
we test server configuration and tool registration rather than
direct tool invocation.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

if TYPE_CHECKING:
    from pilot_space.ai.tools.mcp_server import ToolContext


# Fixtures


@pytest.fixture
def workspace_id() -> str:
    """Workspace UUID string."""
    return str(uuid4())


@pytest.fixture
def user_id() -> str:
    """User UUID string."""
    return str(uuid4())


@pytest.fixture
def mock_tool_context(workspace_id: str, user_id: str) -> ToolContext:
    """Mock ToolContext with session and IDs."""
    from pilot_space.ai.tools.mcp_server import ToolContext

    mock_session = MagicMock()
    return ToolContext(
        db_session=mock_session,
        workspace_id=workspace_id,
        user_id=user_id,
    )


# Test Classes


class TestServerConfiguration:
    """Test suite for server configuration and tool registration."""

    def test_server_name_constant(self) -> None:
        """Verify SERVER_NAME is correct."""
        from pilot_space.ai.mcp.project_server import SERVER_NAME

        assert SERVER_NAME == "pilot-projects"

    def test_tool_names_list(self) -> None:
        """Verify TOOL_NAMES contains all 5 tools."""
        from pilot_space.ai.mcp.project_server import TOOL_NAMES

        assert len(TOOL_NAMES) == 5

        expected_tools = [
            "mcp__pilot-projects__get_project",
            "mcp__pilot-projects__search_projects",
            "mcp__pilot-projects__create_project",
            "mcp__pilot-projects__update_project",
            "mcp__pilot-projects__update_project_settings",
        ]
        for tool_name in expected_tools:
            assert tool_name in TOOL_NAMES, f"{tool_name} not in TOOL_NAMES"

    def test_server_requires_tool_context(self) -> None:
        """Verify server raises error without tool_context."""
        from pilot_space.ai.mcp.project_server import create_project_tools_server

        event_queue = asyncio.Queue()

        with pytest.raises(ValueError, match="ToolContext is required"):
            create_project_tools_server(event_queue=event_queue, tool_context=None)

    def test_server_creation_success(
        self,
        mock_tool_context: ToolContext,
    ) -> None:
        """Verify server can be created with valid tool_context."""
        from pilot_space.ai.mcp.project_server import create_project_tools_server

        event_queue = asyncio.Queue()
        server = create_project_tools_server(
            event_queue=event_queue,
            tool_context=mock_tool_context,
        )

        # Server should be a dict with type, name, and instance
        assert isinstance(server, dict)
        assert server["type"] == "sdk"
        assert server["name"] == "pilot-projects"
        assert "instance" in server

    def test_identifier_pattern_validation(self) -> None:
        """Verify identifier pattern regex is correct."""
        from pilot_space.ai.mcp.project_server import _IDENTIFIER_PATTERN

        # Valid identifiers
        assert _IDENTIFIER_PATTERN.match("AB")
        assert _IDENTIFIER_PATTERN.match("PILOT")
        assert _IDENTIFIER_PATTERN.match("ABCDEFGHIJ")

        # Invalid identifiers
        assert not _IDENTIFIER_PATTERN.match("A")  # Too short
        assert not _IDENTIFIER_PATTERN.match("ABCDEFGHIJK")  # Too long
        assert not _IDENTIFIER_PATTERN.match("abc")  # Lowercase
        assert not _IDENTIFIER_PATTERN.match("AB1")  # Contains number
        assert not _IDENTIFIER_PATTERN.match("AB-CD")  # Contains hyphen


class TestGetProject:
    """Test suite for get_project tool (PR-001)."""

    def test_tool_registered_in_approval_map(self) -> None:
        """Verify get_project is in approval map as AUTO_EXECUTE."""
        from pilot_space.ai.tools.mcp_server import TOOL_APPROVAL_MAP, ToolApprovalLevel

        assert "get_project" in TOOL_APPROVAL_MAP
        assert TOOL_APPROVAL_MAP["get_project"] == ToolApprovalLevel.AUTO_EXECUTE


class TestSearchProjects:
    """Test suite for search_projects tool (PR-002)."""

    def test_tool_registered_in_approval_map(self) -> None:
        """Verify search_projects is in approval map as AUTO_EXECUTE."""
        from pilot_space.ai.tools.mcp_server import TOOL_APPROVAL_MAP, ToolApprovalLevel

        assert "search_projects" in TOOL_APPROVAL_MAP
        assert TOOL_APPROVAL_MAP["search_projects"] == ToolApprovalLevel.AUTO_EXECUTE


class TestCreateProject:
    """Test suite for create_project tool (PR-003)."""

    def test_tool_registered_in_approval_map(self) -> None:
        """Verify create_project is in approval map as REQUIRE_APPROVAL."""
        from pilot_space.ai.tools.mcp_server import TOOL_APPROVAL_MAP, ToolApprovalLevel

        assert "create_project" in TOOL_APPROVAL_MAP
        assert TOOL_APPROVAL_MAP["create_project"] == ToolApprovalLevel.REQUIRE_APPROVAL


class TestUpdateProject:
    """Test suite for update_project tool (PR-004)."""

    def test_tool_registered_in_approval_map(self) -> None:
        """Verify update_project is in approval map as REQUIRE_APPROVAL."""
        from pilot_space.ai.tools.mcp_server import TOOL_APPROVAL_MAP, ToolApprovalLevel

        assert "update_project" in TOOL_APPROVAL_MAP
        assert TOOL_APPROVAL_MAP["update_project"] == ToolApprovalLevel.REQUIRE_APPROVAL


class TestUpdateProjectSettings:
    """Test suite for update_project_settings tool (PR-005)."""

    def test_tool_registered_in_approval_map(self) -> None:
        """Verify update_project_settings is in approval map as REQUIRE_APPROVAL."""
        from pilot_space.ai.tools.mcp_server import TOOL_APPROVAL_MAP, ToolApprovalLevel

        assert "update_project_settings" in TOOL_APPROVAL_MAP
        assert TOOL_APPROVAL_MAP["update_project_settings"] == ToolApprovalLevel.REQUIRE_APPROVAL


class TestToolCategoryRegistration:
    """Test suite for verifying all tools are registered in correct approval map."""

    def test_all_project_tools_in_approval_map(self) -> None:
        """Verify all 5 project tools are registered with correct approval levels."""
        from pilot_space.ai.tools.mcp_server import TOOL_APPROVAL_MAP, ToolApprovalLevel

        # Read-only tools (AUTO_EXECUTE)
        auto_execute_tools = ["get_project", "search_projects"]
        for tool_name in auto_execute_tools:
            assert tool_name in TOOL_APPROVAL_MAP
            assert TOOL_APPROVAL_MAP[tool_name] == ToolApprovalLevel.AUTO_EXECUTE

        # Mutation tools (REQUIRE_APPROVAL)
        require_approval_tools = [
            "create_project",
            "update_project",
            "update_project_settings",
        ]
        for tool_name in require_approval_tools:
            assert tool_name in TOOL_APPROVAL_MAP
            assert TOOL_APPROVAL_MAP[tool_name] == ToolApprovalLevel.REQUIRE_APPROVAL
