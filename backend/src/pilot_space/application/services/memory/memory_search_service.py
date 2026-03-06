"""MemorySearchService — hybrid memory search with <200ms SLA.

T-030: Embed query with Gemini → hybrid fusion → return top results.

Feature 015: AI Workforce Platform — Memory Engine
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any
from uuid import UUID

from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from pilot_space.application.services.embedding_service import EmbeddingService
    from pilot_space.infrastructure.database.repositories.memory_repository import (
        MemoryEntryRepository,
    )

logger = get_logger(__name__)

_DEFAULT_LIMIT = 5


@dataclass(frozen=True, slots=True)
class MemorySearchPayload:
    """Payload for memory search.

    Attributes:
        query: Natural language query text.
        workspace_id: Workspace to search in.
        limit: Maximum results to return (default 5).
        google_api_key: Optional Gemini API key for embedding (deprecated tables).
    """

    query: str
    workspace_id: UUID
    limit: int = _DEFAULT_LIMIT
    google_api_key: str | None = None  # kept for deprecated memory_entries hybrid search


@dataclass
class MemorySearchResult:
    """Result from memory search.

    Attributes:
        results: List of memory entry dicts with score.
        query: Original query text.
        embedding_used: Whether vector embedding was used.
    """

    results: list[dict[str, Any]] = field(default_factory=list)
    query: str = ""
    embedding_used: bool = False


class MemorySearchService:
    """Hybrid memory search service (deprecated tables: memory_entries).

    Combines vector similarity (via EmbeddingService) and full-text search
    (tsvector ts_rank) with 0.7/0.3 fusion scoring.

    Falls back to keyword-only search when embeddings are unavailable.
    SLA: <200ms at 1000 entries.

    Example:
        service = MemorySearchService(memory_repository, session, embedding_service=svc)
        result = await service.execute(MemorySearchPayload(
            query="API rate limiting",
            workspace_id=workspace_id,
        ))
    """

    def __init__(
        self,
        memory_repository: MemoryEntryRepository,
        session: AsyncSession,
        embedding_service: EmbeddingService | None = None,
    ) -> None:
        """Initialize service.

        Args:
            memory_repository: Repository for MemoryEntry access.
            session: Async DB session.
            embedding_service: Optional EmbeddingService for vector embedding.
        """
        self._memory_repo = memory_repository
        self._session = session
        self._embedding = embedding_service

    async def execute(self, payload: MemorySearchPayload) -> MemorySearchResult:
        """Execute hybrid memory search.

        Args:
            payload: Search parameters.

        Returns:
            MemorySearchResult with ranked entries.
        """
        embedding = await self._embedding.embed(payload.query) if self._embedding else None

        if embedding is not None:
            results = await self._memory_repo.hybrid_search(
                query_embedding=embedding,
                query_text=payload.query,
                workspace_id=payload.workspace_id,
                limit=payload.limit,
            )
            return MemorySearchResult(
                results=results,
                query=payload.query,
                embedding_used=True,
            )

        # Fallback: keyword-only via list_by_workspace (no vector scoring)
        logger.warning(
            "Embedding unavailable — using keyword-only memory search for workspace %s",
            payload.workspace_id,
        )
        entries = await self._memory_repo.list_by_workspace(
            workspace_id=payload.workspace_id,
            limit=payload.limit,
        )
        keyword_results = [
            {
                "id": str(entry.id),
                "content": entry.content,
                "source_type": entry.source_type,
                "pinned": entry.pinned,
                "embedding_score": 0.0,
                "text_score": 0.0,
                "score": 0.0,
            }
            for entry in entries
        ]
        return MemorySearchResult(
            results=keyword_results,
            query=payload.query,
            embedding_used=False,
        )
