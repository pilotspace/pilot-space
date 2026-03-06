"""Unit tests for KgPopulateHandler.

Covers:
- Invalid payload → early-return error without DB calls
- Unknown entity_type → error
- Issue not found → error
- Note not found → error
- Happy path issue: IssueNode upserted, similarity search performed
- Happy path note: NoteNode + NOTE_CHUNK nodes created, PARENT_OF edges added
- Similarity below threshold → no RELATES_TO edge
- Similarity above threshold → RELATES_TO edge created
- Embedding service returns None → graceful degradation (text-only search)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from pilot_space.application.services.embedding_service import EmbeddingConfig, EmbeddingService
from pilot_space.domain.graph_node import NodeType
from pilot_space.domain.graph_query import ScoredNode
from pilot_space.infrastructure.queue.handlers.kg_populate_handler import (
    TASK_KG_POPULATE,
    KgPopulateHandler,
)

pytestmark = pytest.mark.asyncio

_WORKSPACE_ID = uuid4()
_PROJECT_ID = uuid4()
_ISSUE_ID = uuid4()
_NOTE_ID = uuid4()


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.execute = AsyncMock()
    session.get = AsyncMock()
    session.flush = AsyncMock()
    session.commit = AsyncMock()
    session.add = MagicMock()
    return session


def _make_embedding_service(embed_return: list[float] | None = None) -> EmbeddingService:
    svc = EmbeddingService(EmbeddingConfig(openai_api_key=None))
    svc.embed = AsyncMock(return_value=embed_return)  # type: ignore[method-assign]
    return svc


def _make_handler(
    session: AsyncMock,
    embedding_service: EmbeddingService | None = None,
    queue: MagicMock | None = None,
) -> KgPopulateHandler:
    if embedding_service is None:
        embedding_service = _make_embedding_service()
    return KgPopulateHandler(
        session=session,
        embedding_service=embedding_service,
        queue=queue,
    )


def _make_scored_node(score: float = 0.9, project_id: UUID | None = None) -> ScoredNode:
    from pilot_space.domain.graph_node import GraphNode

    node = MagicMock(spec=GraphNode)
    node.id = uuid4()
    node.properties = {"project_id": str(project_id or _PROJECT_ID)}
    sn = MagicMock(spec=ScoredNode)
    sn.score = score
    sn.node = node
    return sn


class TestInvalidPayload:
    async def test_missing_workspace_id_returns_error(self) -> None:
        session = _make_session()
        handler = _make_handler(session)
        result = await handler.handle(
            {"entity_type": "issue", "entity_id": str(_ISSUE_ID), "project_id": str(_PROJECT_ID)}
        )
        assert result["success"] is False
        session.get.assert_not_called()

    async def test_invalid_uuid_returns_error(self) -> None:
        session = _make_session()
        handler = _make_handler(session)
        result = await handler.handle(
            {
                "workspace_id": "not-a-uuid",
                "project_id": str(_PROJECT_ID),
                "entity_type": "issue",
                "entity_id": str(_ISSUE_ID),
            }
        )
        assert result["success"] is False
        session.get.assert_not_called()

    async def test_unknown_entity_type_returns_error(self) -> None:
        session = _make_session()
        handler = _make_handler(session)
        result = await handler.handle(
            {
                "workspace_id": str(_WORKSPACE_ID),
                "project_id": str(_PROJECT_ID),
                "entity_type": "unknown",
                "entity_id": str(_ISSUE_ID),
            }
        )
        assert result["success"] is False
        assert "unknown" in result["error"]


class TestHandleIssue:
    def _valid_payload(self) -> dict:
        return {
            "workspace_id": str(_WORKSPACE_ID),
            "project_id": str(_PROJECT_ID),
            "entity_type": "issue",
            "entity_id": str(_ISSUE_ID),
        }

    async def test_issue_not_found_returns_error(self) -> None:
        session = _make_session()
        session.get.return_value = None
        handler = _make_handler(session)
        result = await handler.handle(self._valid_payload())
        assert result["success"] is False
        assert "not found" in result["error"]

    async def test_deleted_issue_returns_error(self) -> None:
        session = _make_session()
        issue = MagicMock()
        issue.is_deleted = True
        session.get.return_value = issue
        handler = _make_handler(session)
        result = await handler.handle(self._valid_payload())
        assert result["success"] is False

    async def test_happy_path_calls_write_service(self) -> None:
        session = _make_session()
        issue = MagicMock()
        issue.is_deleted = False
        issue.name = "Fix the login bug"
        issue.description = "Users cannot log in with OAuth."
        issue.identifier = "PS-42"
        issue.state_id = uuid4()
        session.get.return_value = issue

        write_result = MagicMock()
        write_result.node_ids = [uuid4()]

        with (
            patch(
                "pilot_space.infrastructure.queue.handlers.kg_populate_handler.GraphWriteService"
            ) as MockWrite,
            patch(
                "pilot_space.infrastructure.queue.handlers.kg_populate_handler.KnowledgeGraphRepository"
            ) as MockRepo,
        ):
            mock_write_svc = AsyncMock()
            mock_write_svc.execute = AsyncMock(return_value=write_result)
            MockWrite.return_value = mock_write_svc

            mock_repo = AsyncMock()
            mock_repo.hybrid_search = AsyncMock(return_value=[])
            MockRepo.return_value = mock_repo

            handler = _make_handler(session, _make_embedding_service([0.1] * 768))
            result = await handler.handle(self._valid_payload())

        assert result["success"] is True
        assert len(result["node_ids"]) == 1
        mock_write_svc.execute.assert_called_once()
        call_args = mock_write_svc.execute.call_args[0][0]
        assert call_args.nodes[0].node_type == NodeType.ISSUE
        assert "Fix the login bug" in call_args.nodes[0].content

    async def test_similarity_above_threshold_creates_edge(self) -> None:
        session = _make_session()
        issue = MagicMock()
        issue.is_deleted = False
        issue.name = "Test issue"
        issue.description = "Description"
        issue.identifier = "PS-1"
        issue.state_id = None
        session.get.return_value = issue

        similar_node = _make_scored_node(score=0.9)
        write_result = MagicMock()
        write_result.node_ids = [uuid4()]

        with (
            patch(
                "pilot_space.infrastructure.queue.handlers.kg_populate_handler.GraphWriteService"
            ) as MockWrite,
            patch(
                "pilot_space.infrastructure.queue.handlers.kg_populate_handler.KnowledgeGraphRepository"
            ) as MockRepo,
        ):
            mock_write_svc = AsyncMock()
            mock_write_svc.execute = AsyncMock(return_value=write_result)
            MockWrite.return_value = mock_write_svc

            mock_repo = AsyncMock()
            mock_repo.hybrid_search = AsyncMock(return_value=[similar_node])
            mock_repo.upsert_edge = AsyncMock()
            MockRepo.return_value = mock_repo

            handler = _make_handler(session, _make_embedding_service([0.1] * 768))
            result = await handler.handle(self._valid_payload())

        assert result["success"] is True
        mock_repo.upsert_edge.assert_called_once()

    async def test_similarity_below_threshold_no_edge(self) -> None:
        session = _make_session()
        issue = MagicMock()
        issue.is_deleted = False
        issue.name = "Test issue"
        issue.description = "Description"
        issue.identifier = "PS-1"
        issue.state_id = None
        session.get.return_value = issue

        low_score_node = _make_scored_node(score=0.3)
        write_result = MagicMock()
        write_result.node_ids = [uuid4()]

        with (
            patch(
                "pilot_space.infrastructure.queue.handlers.kg_populate_handler.GraphWriteService"
            ) as MockWrite,
            patch(
                "pilot_space.infrastructure.queue.handlers.kg_populate_handler.KnowledgeGraphRepository"
            ) as MockRepo,
        ):
            mock_write_svc = AsyncMock()
            mock_write_svc.execute = AsyncMock(return_value=write_result)
            MockWrite.return_value = mock_write_svc

            mock_repo = AsyncMock()
            mock_repo.hybrid_search = AsyncMock(return_value=[low_score_node])
            mock_repo.upsert_edge = AsyncMock()
            MockRepo.return_value = mock_repo

            handler = _make_handler(session, _make_embedding_service([0.1] * 768))
            result = await handler.handle(self._valid_payload())

        assert result["success"] is True
        mock_repo.upsert_edge.assert_not_called()


class TestHandleNote:
    def _valid_payload(self) -> dict:
        return {
            "workspace_id": str(_WORKSPACE_ID),
            "project_id": str(_PROJECT_ID),
            "entity_type": "note",
            "entity_id": str(_NOTE_ID),
        }

    async def test_note_not_found_returns_error(self) -> None:
        session = _make_session()
        # execute returns scalar_one_or_none → None
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        session.execute.return_value = mock_result

        handler = _make_handler(session)
        result = await handler.handle(self._valid_payload())
        assert result["success"] is False
        assert "not found" in result["error"]

    async def test_happy_path_note_creates_nodes(self) -> None:
        session = _make_session()
        note = MagicMock()
        note.title = "Architecture Notes"
        note.content = {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 1},
                    "content": [{"type": "text", "text": "Overview"}],
                },
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "This is the overview section content."}],
                },
                {
                    "type": "heading",
                    "attrs": {"level": 2},
                    "content": [{"type": "text", "text": "Details"}],
                },
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "This is the details section content."}],
                },
            ],
        }

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = note
        session.execute.return_value = mock_result

        parent_result = MagicMock()
        parent_result.node_ids = [uuid4()]

        chunk_result = MagicMock()
        chunk_result.node_ids = [uuid4(), uuid4()]

        call_count = 0

        async def side_effect_execute(payload):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return parent_result
            return chunk_result

        with (
            patch(
                "pilot_space.infrastructure.queue.handlers.kg_populate_handler.GraphWriteService"
            ) as MockWrite,
            patch(
                "pilot_space.infrastructure.queue.handlers.kg_populate_handler.KnowledgeGraphRepository"
            ) as MockRepo,
        ):
            mock_write_svc = AsyncMock()
            mock_write_svc.execute = AsyncMock(side_effect=side_effect_execute)
            MockWrite.return_value = mock_write_svc

            mock_repo = AsyncMock()
            mock_repo.hybrid_search = AsyncMock(return_value=[])
            mock_repo.upsert_edge = AsyncMock()
            MockRepo.return_value = mock_repo

            handler = _make_handler(session, _make_embedding_service())
            result = await handler.handle(self._valid_payload())

        assert result["success"] is True
        assert result["chunks"] >= 1
        # First call is parent NOTE node, second is chunk nodes
        assert mock_write_svc.execute.call_count >= 2
        parent_call = mock_write_svc.execute.call_args_list[0][0][0]
        assert parent_call.nodes[0].node_type == NodeType.NOTE
        chunk_call = mock_write_svc.execute.call_args_list[1][0][0]
        assert chunk_call.nodes[0].node_type == NodeType.NOTE_CHUNK

    async def test_embedding_none_still_returns_success(self) -> None:
        """When embed() returns None, text-only search is used and result is still success."""
        session = _make_session()
        note = MagicMock()
        note.title = "Simple Note"
        note.content = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Just some content."}],
                }
            ],
        }
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = note
        session.execute.return_value = mock_result

        write_result = MagicMock()
        write_result.node_ids = [uuid4()]
        embedding_svc = _make_embedding_service(embed_return=None)

        with (
            patch(
                "pilot_space.infrastructure.queue.handlers.kg_populate_handler.GraphWriteService"
            ) as MockWrite,
            patch(
                "pilot_space.infrastructure.queue.handlers.kg_populate_handler.KnowledgeGraphRepository"
            ) as MockRepo,
        ):
            mock_write_svc = AsyncMock()
            mock_write_svc.execute = AsyncMock(return_value=write_result)
            MockWrite.return_value = mock_write_svc

            mock_repo = AsyncMock()
            mock_repo.hybrid_search = AsyncMock(return_value=[])
            MockRepo.return_value = mock_repo

            handler = _make_handler(session, embedding_svc)
            result = await handler.handle(self._valid_payload())

        assert result["success"] is True


class TestConstant:
    async def test_task_constant_value(self) -> None:
        assert TASK_KG_POPULATE == "kg_populate"
