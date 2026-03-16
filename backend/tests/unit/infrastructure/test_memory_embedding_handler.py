"""Unit tests for MemoryEmbeddingJobHandler.handle_graph_node.

Covers:
- Missing node_id / workspace_id in payload → early-return errors
- Node not found in DB → error without commit
- No EmbeddingService configured → error
- Happy path: embedding stored, success result returned
- EmbeddingService returns None → error without commit
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from pilot_space.application.services.embedding_service import EmbeddingConfig, EmbeddingService
from pilot_space.infrastructure.queue.handlers.memory_embedding_handler import (
    MemoryEmbeddingJobHandler,
)

pytestmark = pytest.mark.asyncio

_NODE_ID = uuid4()
_WORKSPACE_ID = uuid4()


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    return session


def _make_embedding_service(embed_return: list[float] | None = None) -> EmbeddingService:
    """Return an EmbeddingService with a mocked embed() method."""
    svc = EmbeddingService(EmbeddingConfig(openai_api_key=None))
    svc.embed = AsyncMock(return_value=embed_return)  # type: ignore[method-assign]
    return svc


def _make_handler(
    session: AsyncMock,
    embedding_service: EmbeddingService | None = None,
) -> MemoryEmbeddingJobHandler:
    return MemoryEmbeddingJobHandler(
        session=session,
        google_api_key=None,
        embedding_service=embedding_service,
    )


class TestHandleGraphNodeEarlyReturns:
    """Guard clause tests — no DB calls or embedding calls should be made."""

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

    async def test_returns_error_when_no_embedding_service(self) -> None:
        session = _make_session()
        mock_result = MagicMock()
        mock_result.first.return_value = ("Node content text.",)
        session.execute = AsyncMock(return_value=mock_result)

        handler = _make_handler(session, embedding_service=None)

        result = await handler.handle_graph_node(
            {"node_id": str(_NODE_ID), "workspace_id": str(_WORKSPACE_ID)}
        )

        assert result["success"] is False
        assert "no EmbeddingService" in result["error"]
        session.commit.assert_not_called()

    async def test_skips_empty_content_gracefully(self) -> None:
        """Empty/whitespace content should return success with skipped flag."""
        session = _make_session()
        mock_result = MagicMock()
        mock_result.first.return_value = ("   ",)
        session.execute = AsyncMock(return_value=mock_result)

        embedding_svc = _make_embedding_service()
        handler = _make_handler(session, embedding_service=embedding_svc)

        result = await handler.handle_graph_node(
            {"node_id": str(_NODE_ID), "workspace_id": str(_WORKSPACE_ID)}
        )

        assert result["success"] is True
        assert result["skipped"] == "empty_content"
        embedding_svc.embed.assert_not_called()

    async def test_skips_blank_content_gracefully(self) -> None:
        """Completely empty string should return success with skipped flag."""
        session = _make_session()
        mock_result = MagicMock()
        mock_result.first.return_value = ("",)
        session.execute = AsyncMock(return_value=mock_result)

        embedding_svc = _make_embedding_service()
        handler = _make_handler(session, embedding_service=embedding_svc)

        result = await handler.handle_graph_node(
            {"node_id": str(_NODE_ID), "workspace_id": str(_WORKSPACE_ID)}
        )

        assert result["success"] is True
        assert result["skipped"] == "empty_content"
        embedding_svc.embed.assert_not_called()


class TestHandleGraphNodeHappyPath:
    """Happy path: node found, embedding generated, stored successfully."""

    async def test_happy_path_stores_embedding_and_returns_success(self) -> None:
        session = _make_session()
        mock_select = MagicMock()
        mock_select.first.return_value = ("This is the node content about Python.",)
        mock_update = MagicMock()
        session.execute = AsyncMock(side_effect=[mock_select, mock_update])

        fake_embedding = [0.1] * 768
        embedding_svc = _make_embedding_service(embed_return=fake_embedding)
        handler = _make_handler(session, embedding_service=embedding_svc)

        result = await handler.handle_graph_node(
            {"node_id": str(_NODE_ID), "workspace_id": str(_WORKSPACE_ID)}
        )

        assert result["success"] is True
        assert result["node_id"] == str(_NODE_ID)
        assert result["dims"] == 768
        session.flush.assert_awaited_once()
        session.commit.assert_not_called()  # worker owns commit
        # execute called twice: SELECT then UPDATE
        assert session.execute.await_count == 2

    async def test_raises_when_embedding_fails(self) -> None:
        """Transient embedding failure raises RuntimeError for worker retry (H-1)."""
        session = _make_session()
        mock_result = MagicMock()
        mock_result.first.return_value = ("Node content text.",)
        session.execute = AsyncMock(return_value=mock_result)

        embedding_svc = _make_embedding_service(embed_return=None)
        handler = _make_handler(session, embedding_service=embedding_svc)

        with pytest.raises(RuntimeError, match="all embedding providers failed"):
            await handler.handle_graph_node(
                {"node_id": str(_NODE_ID), "workspace_id": str(_WORKSPACE_ID)}
            )
        session.commit.assert_not_called()

    async def test_embedding_service_called_with_node_content(self) -> None:
        """EmbeddingService.embed() receives the text fetched from graph_nodes."""
        content = "Work intent: refactor knowledge graph repository."
        session = _make_session()
        mock_select = MagicMock()
        mock_select.first.return_value = (content,)
        mock_update = MagicMock()
        session.execute = AsyncMock(side_effect=[mock_select, mock_update])

        embedding_svc = _make_embedding_service(embed_return=[0.0] * 768)
        handler = _make_handler(session, embedding_service=embedding_svc)

        await handler.handle_graph_node(
            {"node_id": str(_NODE_ID), "workspace_id": str(_WORKSPACE_ID)}
        )

        embedding_svc.embed.assert_awaited_once_with(content)
