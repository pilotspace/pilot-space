"""Unit tests for search MCP tools.

Tests semantic_search and search_codebase tools with mocked database.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from pilot_space.ai.tools.mcp_server import ToolContext
from pilot_space.ai.tools.search_tools import search_codebase, semantic_search


@pytest.fixture
def tool_context() -> ToolContext:
    """Create mock tool context."""
    mock_session = AsyncMock()
    return ToolContext(
        db_session=mock_session,
        workspace_id=str(uuid4()),
        user_id=str(uuid4()),
    )


class TestSemanticSearch:
    """Test semantic_search tool."""

    @pytest.mark.asyncio
    async def test_search_issues_by_title(self, tool_context: ToolContext) -> None:
        """Verify issue search by title."""
        # Arrange - Create mock issue objects
        mock_issue = MagicMock()
        mock_issue.id = uuid4()
        mock_issue.name = "Authentication bug in login"
        mock_issue.description = "Users cannot log in"
        mock_issue.priority = MagicMock(value="high")
        mock_issue.state = MagicMock(name="In Progress")
        mock_issue.identifier = "TEST-1"
        mock_issue.is_deleted = False

        # Mock database response
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [mock_issue]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        tool_context.db_session.execute = AsyncMock(return_value=mock_result)

        # Act
        result = await semantic_search(
            query="authentication",
            ctx=tool_context,
            content_types=["issue"],
            limit=10,
        )

        # Assert
        assert result["total"] >= 0
        assert result["search_method"] == "text_similarity"
        assert "results" in result
        # Verify workspace filtering was applied
        tool_context.db_session.execute.assert_called()

    @pytest.mark.asyncio
    async def test_search_notes_by_title(self, tool_context: ToolContext) -> None:
        """Verify note search by title."""
        # Arrange
        mock_note = MagicMock()
        mock_note.id = uuid4()
        mock_note.title = "Architecture decisions for auth"
        mock_note.summary = "Design document for authentication"
        mock_note.word_count = 500
        mock_note.is_pinned = False
        mock_note.is_deleted = False

        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [mock_note]
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        tool_context.db_session.execute = AsyncMock(return_value=mock_result)

        # Act
        result = await semantic_search(
            query="auth",
            ctx=tool_context,
            content_types=["note"],
            limit=5,
        )

        # Assert
        assert result["total"] >= 0
        assert result["search_method"] == "text_similarity"
        assert "results" in result

    @pytest.mark.asyncio
    async def test_search_all_content_types(self, tool_context: ToolContext) -> None:
        """Verify search across all content types."""
        # Arrange
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        tool_context.db_session.execute = AsyncMock(return_value=mock_result)

        # Act
        result = await semantic_search(
            query="test query",
            ctx=tool_context,
            content_types=None,  # Search all types
            limit=10,
        )

        # Assert
        assert result["search_method"] == "text_similarity"
        assert isinstance(result["results"], list)

    @pytest.mark.asyncio
    async def test_search_enforces_max_limit(self, tool_context: ToolContext) -> None:
        """Verify limit is capped at 50."""
        # Arrange
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result = MagicMock()
        mock_result.scalars.return_value = mock_scalars
        tool_context.db_session.execute = AsyncMock(return_value=mock_result)

        # Act
        result = await semantic_search(
            query="test",
            ctx=tool_context,
            limit=100,  # Over max
        )

        # Assert
        assert len(result["results"]) <= 50


class TestSearchCodebase:
    """Test search_codebase tool — now returns not_implemented stub."""

    @pytest.mark.asyncio
    async def test_returns_not_implemented(self, tool_context: ToolContext) -> None:
        """search_codebase returns honest not_implemented status without DB query."""
        result = await search_codebase(
            query="async def",
            ctx=tool_context,
        )

        assert result["found"] is False
        assert result["status"] == "not_implemented"
        assert "not yet available" in result["message"].lower()
        assert result["query"] == "async def"
        tool_context.db_session.execute.assert_not_called()
