"""Unit tests for MemoryEmbeddingJobHandler.handle_graph_node.

Covers:
- Early return when openai_api_key is None
- Missing node_id in payload
- Missing workspace_id in payload
- Node not found in DB
- Happy path: embedding stored, success result returned
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from pilot_space.infrastructure.queue.handlers.memory_embedding_handler import (
    MemoryEmbeddingJobHandler,
)

pytestmark = pytest.mark.asyncio

_NODE_ID = uuid4()
_WORKSPACE_ID = uuid4()


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    return session


def _make_handler(
    session: AsyncMock,
    openai_api_key: str | None = "sk-test",  # pragma: allowlist secret
) -> MemoryEmbeddingJobHandler:
    return MemoryEmbeddingJobHandler(
        session=session,
        google_api_key=None,
        openai_api_key=openai_api_key,
    )


class TestHandleGraphNodeEarlyReturns:
    """Guard clause tests — no DB calls should be made."""

    async def test_returns_error_when_all_providers_fail(self) -> None:
        """When both OpenAI (no key) and Ollama fail, error is returned."""
        session = _make_session()
        mock_result = MagicMock()
        mock_result.first.return_value = ("Node content text.",)
        session.execute = AsyncMock(return_value=mock_result)
        handler = _make_handler(session, openai_api_key=None)

        with patch(
            "pilot_space.infrastructure.queue.handlers.memory_embedding_handler._embed_text_ollama",
            new=AsyncMock(return_value=None),
        ):
            result = await handler.handle_graph_node(
                {"node_id": str(_NODE_ID), "workspace_id": str(_WORKSPACE_ID)}
            )

        assert result["success"] is False
        assert "all embedding providers failed" in result["error"]

    async def test_returns_error_when_node_id_missing(self) -> None:
        session = _make_session()
        handler = _make_handler(session)

        result = await handler.handle_graph_node({"workspace_id": str(_WORKSPACE_ID)})

        assert result == {"success": False, "error": "missing node_id"}
        session.execute.assert_not_called()

    async def test_returns_error_when_workspace_id_missing(self) -> None:
        session = _make_session()
        handler = _make_handler(session)

        result = await handler.handle_graph_node({"node_id": str(_NODE_ID)})

        assert result == {"success": False, "error": "missing workspace_id"}
        session.execute.assert_not_called()

    async def test_returns_error_when_node_not_found_in_db(self) -> None:
        session = _make_session()
        # execute returns a result with no rows
        mock_result = MagicMock()
        mock_result.first.return_value = None
        session.execute = AsyncMock(return_value=mock_result)

        handler = _make_handler(session)

        result = await handler.handle_graph_node(
            {"node_id": str(_NODE_ID), "workspace_id": str(_WORKSPACE_ID)}
        )

        assert result["success"] is False
        assert f"graph node {_NODE_ID} not found" in result["error"]
        session.commit.assert_not_called()


class TestHandleGraphNodeHappyPath:
    """Happy path: node found, embedding generated, stored successfully."""

    async def test_happy_path_stores_embedding_and_returns_success(self) -> None:
        session = _make_session()

        # DB returns a row with content
        mock_result = MagicMock()
        mock_result.first.return_value = ("This is the node content about Python.",)
        # Second execute call is the UPDATE — return a no-op result
        mock_update_result = MagicMock()
        session.execute = AsyncMock(side_effect=[mock_result, mock_update_result])

        handler = _make_handler(session)

        fake_embedding = [0.1] * 1536

        with patch(
            "pilot_space.infrastructure.queue.handlers.memory_embedding_handler._embed_text_openai",
            new=AsyncMock(return_value=fake_embedding),
        ):
            result = await handler.handle_graph_node(
                {"node_id": str(_NODE_ID), "workspace_id": str(_WORKSPACE_ID)}
            )

        assert result["success"] is True
        assert result["node_id"] == str(_NODE_ID)
        assert result["dims"] == 1536
        session.commit.assert_awaited_once()
        # execute called twice: SELECT then UPDATE
        assert session.execute.await_count == 2

    async def test_returns_error_when_openai_embedding_fails(self) -> None:
        session = _make_session()

        mock_result = MagicMock()
        mock_result.first.return_value = ("Node content text.",)
        session.execute = AsyncMock(return_value=mock_result)

        handler = _make_handler(session)

        with (
            patch(
                "pilot_space.infrastructure.queue.handlers.memory_embedding_handler._embed_text_openai",
                new=AsyncMock(return_value=None),
            ),
            patch(
                "pilot_space.infrastructure.queue.handlers.memory_embedding_handler._embed_text_ollama",
                new=AsyncMock(return_value=None),
            ),
        ):
            result = await handler.handle_graph_node(
                {"node_id": str(_NODE_ID), "workspace_id": str(_WORKSPACE_ID)}
            )

        assert result["success"] is False
        assert "all embedding providers failed" in result["error"]
        session.commit.assert_not_called()
