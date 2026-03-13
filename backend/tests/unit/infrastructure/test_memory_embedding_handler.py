"""Unit tests for MemoryEmbeddingJobHandler.

Covers:
- handle_graph_node: missing fields, node not found, no service, happy path, failure
- handle: missing entry_id, no EmbeddingService, content not found, embed returns None, success paths
- _fetch_content: unknown table, row not found
- _store_embedding: unknown table raises ValueError

All embedding now uses EmbeddingService (Gemini _embed_text removed).
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
        embedding_service=embedding_service,
    )


class TestHandleGraphNodeEarlyReturns:
    """Guard clause tests -- no DB calls or embedding calls should be made."""

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


# ---------------------------------------------------------------------------
# Tests for handle() -- memory_entries / constitution_rules embedding
# (Now uses EmbeddingService instead of Gemini _embed_text)
# ---------------------------------------------------------------------------


class TestHandleMemoryEmbedding:
    """Tests for MemoryEmbeddingJobHandler.handle() method."""

    async def test_handle_missing_entry_id_returns_error(self) -> None:
        session = _make_session()
        handler = _make_handler(session)

        result = await handler.handle({})

        assert result == {"success": False, "error": "missing entry_id"}
        session.execute.assert_not_called()

    async def test_handle_no_embedding_service_returns_error(self) -> None:
        """handle() returns error when no EmbeddingService is configured."""
        session = _make_session()
        handler = _make_handler(session, embedding_service=None)

        entry_id = uuid4()
        result = await handler.handle(
            {"entry_id": str(entry_id), "table": "memory_entries"},
        )

        assert result["success"] is False
        assert "no EmbeddingService" in result["error"]

    async def test_handle_content_not_found_returns_error(self) -> None:
        session = _make_session()
        entry_id = uuid4()
        embedding_svc = _make_embedding_service(embed_return=[0.1] * 768)
        handler = _make_handler(session, embedding_service=embedding_svc)

        # Simulate _fetch_content returning None (row not found)
        mock_result = MagicMock()
        mock_result.first.return_value = None
        session.execute = AsyncMock(return_value=mock_result)

        result = await handler.handle(
            {"entry_id": str(entry_id), "table": "memory_entries"},
        )

        assert result["success"] is False
        assert str(entry_id) in result["error"]
        assert "not found" in result["error"]

    async def test_handle_embedding_returns_none_returns_error(self) -> None:
        """When EmbeddingService.embed() returns None, handle() returns error."""
        session = _make_session()
        entry_id = uuid4()
        embedding_svc = _make_embedding_service(embed_return=None)
        handler = _make_handler(session, embedding_service=embedding_svc)

        # Simulate _fetch_content returning content
        mock_result = MagicMock()
        mock_result.first.return_value = ("some content",)
        session.execute = AsyncMock(return_value=mock_result)

        result = await handler.handle(
            {"entry_id": str(entry_id), "table": "memory_entries"},
        )

        assert result == {"success": False, "error": "embedding generation failed"}

    async def test_handle_success_memory_entries(self) -> None:
        session = _make_session()
        entry_id = uuid4()
        fake_embedding = [0.1] * 768
        embedding_svc = _make_embedding_service(embed_return=fake_embedding)
        handler = _make_handler(session, embedding_service=embedding_svc)

        # Simulate: first execute = SELECT (fetch content), second = UPDATE (store embedding)
        mock_select = MagicMock()
        mock_select.first.return_value = ("content text",)
        mock_update = MagicMock()
        session.execute = AsyncMock(side_effect=[mock_select, mock_update])

        result = await handler.handle(
            {"entry_id": str(entry_id), "table": "memory_entries"},
        )

        assert result["success"] is True
        assert result["entry_id"] == str(entry_id)
        assert result["table"] == "memory_entries"
        session.flush.assert_awaited_once()
        embedding_svc.embed.assert_awaited_once_with("content text")

    async def test_handle_success_constitution_rules(self) -> None:
        session = _make_session()
        entry_id = uuid4()
        fake_embedding = [0.1] * 768
        embedding_svc = _make_embedding_service(embed_return=fake_embedding)
        handler = _make_handler(session, embedding_service=embedding_svc)

        mock_select = MagicMock()
        mock_select.first.return_value = ("rule content",)
        mock_update = MagicMock()
        session.execute = AsyncMock(side_effect=[mock_select, mock_update])

        result = await handler.handle(
            {"entry_id": str(entry_id), "table": "constitution_rules"},
        )

        assert result["success"] is True
        assert result["entry_id"] == str(entry_id)
        assert result["table"] == "constitution_rules"
        session.flush.assert_awaited_once()
        embedding_svc.embed.assert_awaited_once_with("rule content")


# ---------------------------------------------------------------------------
# Tests for _fetch_content()
# ---------------------------------------------------------------------------


class TestFetchContent:
    """Tests for MemoryEmbeddingJobHandler._fetch_content()."""

    async def test_fetch_content_unknown_table_returns_none(self) -> None:
        session = _make_session()
        handler = _make_handler(session)

        result = await handler._fetch_content(uuid4(), "unknown_table")

        assert result is None
        session.execute.assert_not_called()

    async def test_fetch_content_valid_table_row_not_found(self) -> None:
        session = _make_session()
        mock_result = MagicMock()
        mock_result.first.return_value = None
        session.execute = AsyncMock(return_value=mock_result)
        handler = _make_handler(session)

        result = await handler._fetch_content(uuid4(), "memory_entries")

        assert result is None
        session.execute.assert_awaited_once()


# ---------------------------------------------------------------------------
# Tests for _store_embedding() validation
# ---------------------------------------------------------------------------


class TestStoreEmbeddingValidation:
    """Tests for MemoryEmbeddingJobHandler._store_embedding() table validation."""

    async def test_store_embedding_unknown_table_raises(self) -> None:
        session = _make_session()
        handler = _make_handler(session)

        with pytest.raises(ValueError, match="Unknown table for embedding storage"):
            await handler._store_embedding(uuid4(), "evil_table", "[0.1]")


# ---------------------------------------------------------------------------
# Verify Gemini is fully removed
# ---------------------------------------------------------------------------


class TestGeminiRemoved:
    """Verify _embed_text and google.generativeai are removed from the module."""

    def test_no_embed_text_function_exported(self) -> None:
        import pilot_space.infrastructure.queue.handlers.memory_embedding_handler as mod

        assert not hasattr(mod, "_embed_text")

    def test_no_gemini_constant(self) -> None:
        import pilot_space.infrastructure.queue.handlers.memory_embedding_handler as mod

        assert not hasattr(mod, "_GEMINI_EMBEDDING_MODEL")

    def test_init_has_no_google_api_key_param(self) -> None:
        """MemoryEmbeddingJobHandler.__init__ should not accept google_api_key."""
        import inspect

        sig = inspect.signature(MemoryEmbeddingJobHandler.__init__)
        assert "google_api_key" not in sig.parameters
