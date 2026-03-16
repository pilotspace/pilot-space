"""MemoryEmbeddingJobHandler — embed memory entries, constitution rules, and graph nodes.

T-067: Handles 'memory_embedding' task_type for memory_entries and
constitution_rules tables via Gemini 768-dim embeddings.

Feature 016: Also handles 'graph_embedding' task_type for graph_nodes table
via EmbeddingService (OpenAI → Ollama cascade).

Feature 015: AI Workforce Platform — Memory Engine
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import text

from pilot_space.infrastructure.database.repositories._graph_helpers import (
    GRAPH_EMBEDDING_DIMS,
    serialize_embedding,
)
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from pilot_space.application.services.embedding_service import EmbeddingService

logger = get_logger(__name__)

_GEMINI_EMBEDDING_MODEL = "models/gemini-embedding-exp-03-07"
_MEMORY_TABLE = "memory_entries"
_CONSTITUTION_TABLE = "constitution_rules"
_GRAPH_NODES_TABLE = "graph_nodes"


async def _embed_text(content: str, api_key: str | None) -> list[float] | None:
    """Embed text via Gemini gemini-embedding-exp-03-07 (768-dim).

    DEPRECATED: Used only for memory_entries and constitution_rules (sunset 2026-06-01).
    Graph nodes use EmbeddingService instead.

    Args:
        content: Text to embed.
        api_key: Google AI API key.

    Returns:
        768-dim float list or None on failure.
    """
    if not api_key:
        return None
    try:
        import google.generativeai as genai  # type: ignore[import-untyped]

        genai.configure(api_key=api_key)  # type: ignore[attr-defined]
        result = genai.embed_content(  # type: ignore[attr-defined]
            model=_GEMINI_EMBEDDING_MODEL,
            content=content,
            task_type="SEMANTIC_SIMILARITY",
        )
        return list(result["embedding"])
    except Exception:
        logger.warning("Gemini embedding failed in MemoryEmbeddingJobHandler", exc_info=True)
        return None


class MemoryEmbeddingJobHandler:
    """Handles memory and graph embedding jobs from the ai_normal queue.

    Routes by payload type:
    - payload['table'] in {memory_entries, constitution_rules}: embed via Gemini (768-dim)
    - handle_graph_node(payload): embed graph_nodes row via EmbeddingService (OpenAI → Ollama).

    Args:
        session: Async DB session.
        google_api_key: Google AI API key for Gemini embeddings (deprecated tables).
        embedding_service: EmbeddingService for graph node embeddings (OpenAI → Ollama cascade).
    """

    _ALLOWED_TABLES: frozenset[str] = frozenset({_MEMORY_TABLE, _CONSTITUTION_TABLE})

    def __init__(
        self,
        session: AsyncSession,
        google_api_key: str | None = None,
        embedding_service: EmbeddingService | None = None,
    ) -> None:
        self._session = session
        self._api_key = google_api_key
        self._embedding = embedding_service

    async def handle(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Process a memory embedding job.

        Args:
            payload: Queue message payload with entry_id, workspace_id, table.

        Returns:
            Result dict with success status and entry_id.
        """
        entry_id_str = payload.get("entry_id")
        table = payload.get("table", _MEMORY_TABLE)

        if not entry_id_str:
            return {"success": False, "error": "missing entry_id"}

        entry_id = UUID(entry_id_str)

        # Fetch content from appropriate table
        content = await self._fetch_content(entry_id, table)
        if content is None:
            logger.warning(
                "MemoryEmbeddingJobHandler: entry %s not found in %s",
                entry_id,
                table,
            )
            return {"success": False, "error": f"entry {entry_id} not found in {table}"}

        # Generate embedding
        embedding = await _embed_text(content, self._api_key)
        if embedding is None:
            return {"success": False, "error": "embedding generation failed"}

        # Store embedding — worker owns the commit
        await self._store_embedding(entry_id, table, serialize_embedding(embedding))
        await self._session.flush()

        logger.info(
            "MemoryEmbeddingJobHandler: embedded entry %s in %s (%d dims)",
            entry_id,
            table,
            len(embedding),
        )
        return {"success": True, "entry_id": str(entry_id), "table": table}

    async def handle_graph_node(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Embed a graph node (768-dim) using EmbeddingService (OpenAI → Ollama).

        Args:
            payload: Queue message payload with node_id and workspace_id.

        Returns:
            Result dict with success status and node_id.
        """
        node_id_str = payload.get("node_id")
        workspace_id_str = payload.get("workspace_id")

        if not node_id_str:
            return {"success": False, "error": "missing node_id"}
        if not workspace_id_str:
            return {"success": False, "error": "missing workspace_id"}

        node_id = UUID(node_id_str)
        workspace_id = UUID(workspace_id_str)

        # Fetch node content from graph_nodes table
        content = await self._fetch_graph_node_content(node_id, workspace_id)
        if content is None:
            logger.warning(
                "MemoryEmbeddingJobHandler: graph node %s not found in workspace %s",
                node_id,
                workspace_id,
            )
            return {
                "success": False,
                "error": f"graph node {node_id} not found",
            }

        # Empty/whitespace content cannot be embedded — skip gracefully
        if not content.strip():
            logger.info(
                "MemoryEmbeddingJobHandler: graph node %s has empty content, skipping",
                node_id,
            )
            return {
                "success": True,
                "node_id": str(node_id),
                "skipped": "empty_content",
            }

        if self._embedding is None:
            return {"success": False, "error": "no EmbeddingService configured"}

        embedding = await self._embedding.embed(content)
        if embedding is None:
            # Transient infra failure — raise so the worker retries / dead-letters
            raise RuntimeError("all embedding providers failed (OpenAI + Ollama)")

        # Store embedding back to graph_nodes — worker owns the commit
        await self._store_graph_node_embedding(node_id, serialize_embedding(embedding))
        await self._session.flush()

        logger.info(
            "MemoryEmbeddingJobHandler: embedded graph node %s (%d dims)",
            node_id,
            len(embedding),
        )
        return {
            "success": True,
            "node_id": str(node_id),
            "workspace_id": str(workspace_id),
            "dims": len(embedding),
        }

    async def _fetch_content(self, entry_id: UUID, table: str) -> str | None:
        """Fetch text content for memory/constitution embedding.

        Args:
            entry_id: Record UUID.
            table: Table name (memory_entries or constitution_rules).

        Returns:
            Content text or None if not found.
        """
        if table not in self._ALLOWED_TABLES:
            logger.error("Unknown table for memory embedding: %s", table)
            return None

        query = text(f"SELECT content FROM {table} WHERE id = :id AND is_deleted = false")
        result = await self._session.execute(query, {"id": str(entry_id)})
        row = result.first()
        return row[0] if row else None

    async def _fetch_graph_node_content(self, node_id: UUID, workspace_id: UUID) -> str | None:
        """Fetch content from the graph_nodes table for embedding.

        Args:
            node_id: Graph node UUID.
            workspace_id: Owning workspace UUID (used for RLS-safe filtering).

        Returns:
            Content text or None if not found.
        """
        query = text(
            f"SELECT content FROM {_GRAPH_NODES_TABLE} "
            "WHERE id = :id AND workspace_id = :workspace_id AND is_deleted = false"
        )
        result = await self._session.execute(
            query,
            {"id": str(node_id), "workspace_id": str(workspace_id)},
        )
        row = result.first()
        return row[0] if row else None

    async def _store_embedding(
        self,
        entry_id: UUID,
        table: str,
        embedding_str: str,
    ) -> None:
        """Store vector embedding in a memory/constitution table.

        Args:
            entry_id: Record UUID.
            table: Table name (must be in _ALLOWED_TABLES).
            embedding_str: Embedding as '[0.1,0.2,...]' string.
        """
        if table not in self._ALLOWED_TABLES:
            raise ValueError(f"Unknown table for embedding storage: {table}")
        update_sql = text(
            f"UPDATE {table} SET embedding = CAST(:embedding AS vector({GRAPH_EMBEDDING_DIMS})) WHERE id = :id"
        )
        await self._session.execute(
            update_sql,
            {"embedding": embedding_str, "id": str(entry_id)},
        )

    async def _store_graph_node_embedding(
        self,
        node_id: UUID,
        embedding_str: str,
    ) -> None:
        """Store 768-dim vector embedding in graph_nodes table.

        Args:
            node_id: Graph node UUID.
            embedding_str: Embedding as '[0.1,0.2,...]' string.
        """
        update_sql = text(
            f"UPDATE {_GRAPH_NODES_TABLE} "
            f"SET embedding = CAST(:emb AS vector({GRAPH_EMBEDDING_DIMS})) "
            "WHERE id = :id"
        )
        await self._session.execute(
            update_sql,
            {"emb": embedding_str, "id": str(node_id)},
        )


__all__ = ["MemoryEmbeddingJobHandler"]
