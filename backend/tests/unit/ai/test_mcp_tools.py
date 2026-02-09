"""Unit tests for MCP tool registry and database tools.

Tests tool registration and category-based retrieval.
"""

from __future__ import annotations

from pilot_space.ai.tools.database_tools import get_workspace_members
from pilot_space.ai.tools.mcp_server import ToolRegistry


class TestToolRegistry:
    """Test suite for ToolRegistry."""

    def test_get_all_tool_names(self) -> None:
        """Verify all registered tools are returned."""
        tools = ToolRegistry.get_all_tool_names()
        assert "get_workspace_members" in tools
        assert isinstance(tools, list)

    def test_get_tools_by_category(self) -> None:
        """Verify tools can be retrieved by category."""
        database_tools = ToolRegistry.get_tools_by_category("database")
        assert "get_workspace_members" in database_tools
        assert isinstance(database_tools, list)

    def test_get_categories(self) -> None:
        """Verify all categories are returned."""
        categories = ToolRegistry.get_categories()
        assert "database" in categories
        assert "github" in categories
        assert "search" in categories

    def test_get_tool_by_name(self) -> None:
        """Verify specific tool can be retrieved by name."""
        tool = ToolRegistry.get_tool("get_workspace_members")
        assert tool is not None
        assert tool.__name__ == "get_workspace_members"

    def test_get_tools_with_category_filter(self) -> None:
        """Verify tools can be filtered by category."""
        tools = ToolRegistry.get_tools(categories=["database"])
        assert len(tools) >= 1
        assert get_workspace_members in tools

    def test_get_tools_with_name_filter(self) -> None:
        """Verify tools can be retrieved by name list."""
        tools = ToolRegistry.get_tools(names=["get_workspace_members"])
        assert len(tools) == 1
        assert tools[0].__name__ == "get_workspace_members"

    def test_get_tools_returns_all_when_no_filter(self) -> None:
        """Verify all tools returned when no filter specified."""
        tools = ToolRegistry.get_tools()
        assert len(tools) >= 1

    def test_get_tools_avoids_duplicates(self) -> None:
        """Verify no duplicates when same tool matches multiple filters."""
        tools = ToolRegistry.get_tools(names=["get_workspace_members"], categories=["database"])
        assert sum(1 for t in tools if t.__name__ == "get_workspace_members") == 1
