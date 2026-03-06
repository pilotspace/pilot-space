"""GraphSearchService — hybrid knowledge graph search with embedding + text fusion.

Executes vector + full-text hybrid search over the knowledge graph, merges
user-scoped context, and collects intra-result edges for sub-graph display.

Feature 016: Knowledge Graph — Memory Engine replacement
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from pilot_space.domain.graph_edge import GraphEdge
from pilot_space.domain.graph_node import GraphNode, NodeType
from pilot_space.domain.graph_query import ScoredNode
from pilot_space.infrastructure.database.repositories._graph_helpers import (
    GRAPH_EDGE_DENSITY_WEIGHT,
    GRAPH_EMBEDDING_WEIGHT,
    GRAPH_RECENCY_WEIGHT,
    GRAPH_TEXT_WEIGHT,
    compute_recency_score,
)
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from pilot_space.application.services.embedding_service import EmbeddingService
    from pilot_space.infrastructure.database.repositories.knowledge_graph_repository import (
        KnowledgeGraphRepository,
    )

logger = get_logger(__name__)


@dataclass(frozen=True, slots=True)
class GraphSearchPayload:
    """Parameters for a knowledge graph hybrid search.

    Attributes:
        query: Natural language search string.
        workspace_id: Workspace scope for the search.
        user_id: Optional user scope; surface personal nodes when set.
        node_types: Restrict search to these node types (None = all).
        limit: Maximum number of scored nodes to return.
        since: Optional lower bound on updated_at for temporal filtering.
    """

    query: str
    workspace_id: UUID
    user_id: UUID | None = None
    node_types: list[NodeType] | None = None
    limit: int = 10
    since: datetime | None = None


@dataclass
class GraphSearchResult:
    """Result from a knowledge graph search.

    Attributes:
        nodes: Ranked list of scored nodes (highest score first).
        edges: Edges between the returned nodes (intra-result sub-graph).
        query: Original query string.
        embedding_used: True when vector embedding contributed to ranking.
    """

    nodes: list[ScoredNode]
    edges: list[GraphEdge]
    query: str
    embedding_used: bool


class GraphSearchService:
    """Hybrid knowledge graph search.

    Executes vector + full-text hybrid search, merges user-scoped nodes,
    and re-ranks using a four-component score fusion:

        score = 0.5 * embedding + 0.2 * text + 0.2 * recency + 0.1 * edge_density

    Falls back to text-only search when no EmbeddingService is provided or
    when the embedding call fails.

    Example:
        svc = GraphSearchService(repo, embedding_service=EmbeddingService(cfg))
        result = await svc.execute(GraphSearchPayload(
            query="rate limiting design decision",
            workspace_id=workspace_id,
        ))
    """

    def __init__(
        self,
        knowledge_graph_repository: KnowledgeGraphRepository,
        embedding_service: EmbeddingService | None = None,
    ) -> None:
        """Initialize service.

        Args:
            knowledge_graph_repository: Repository for graph queries.
            embedding_service: Optional EmbeddingService for vector embedding.
        """
        self._repo = knowledge_graph_repository
        self._embedding = embedding_service

    async def execute(self, payload: GraphSearchPayload) -> GraphSearchResult:
        """Execute hybrid knowledge graph search.

        Embedding generation and user context fetch are independent and run
        concurrently via asyncio.gather when user_id is set.

        Args:
            payload: Search parameters.

        Returns:
            GraphSearchResult with ranked nodes and intra-result edges.
        """
        if payload.user_id is not None:
            embedding_coro = self._get_embedding(payload.query)
            (embedding, embedding_used), user_nodes = await asyncio.gather(
                embedding_coro,
                self._repo.get_user_context(
                    user_id=payload.user_id,
                    workspace_id=payload.workspace_id,
                    limit=payload.limit,
                ),
            )
        else:
            embedding, embedding_used = await self._get_embedding(payload.query)
            user_nodes = None

        # Primary hybrid search (includes edge-density scoring internally)
        scored_nodes = await self._repo.hybrid_search(
            query_embedding=embedding,
            query_text=payload.query,
            workspace_id=payload.workspace_id,
            node_types=payload.node_types,
            limit=payload.limit,
            since=payload.since,
        )

        # Merge pre-fetched user-scoped context nodes
        if user_nodes is not None:
            scored_nodes = _merge_user_context(scored_nodes, user_nodes)

        # Re-rank with full four-component formula
        scored_nodes = _rerank(scored_nodes)

        # Collect intra-result edges from the root result sub-graph
        edges = await self._collect_edges(scored_nodes, workspace_id=payload.workspace_id)

        logger.info(
            "GraphSearchService: query=%r workspace=%s nodes=%d embedding=%s",
            payload.query,
            payload.workspace_id,
            len(scored_nodes),
            embedding_used,
        )

        return GraphSearchResult(
            nodes=scored_nodes,
            edges=edges,
            query=payload.query,
            embedding_used=embedding_used,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _get_embedding(self, query: str) -> tuple[list[float] | None, bool]:
        """Generate a query embedding using the configured EmbeddingService.

        Args:
            query: Text to embed.

        Returns:
            Tuple of (embedding or None, embedding_used flag).
        """
        if self._embedding is None:
            return None, False
        result = await self._embedding.embed(query)
        return result, result is not None

    async def _collect_edges(
        self,
        scored_nodes: list[ScoredNode],
        workspace_id: UUID,
    ) -> list[GraphEdge]:
        """Collect edges between the result nodes.

        Issues a single SELECT WHERE source_id IN (...) AND target_id IN (...)
        instead of traversing from the top node only, so interconnected nodes
        anywhere in the result set are captured.

        Args:
            scored_nodes: Ranked result list.
            workspace_id: Optional workspace scope to enforce boundary.

        Returns:
            Edges where both endpoints appear in the result set.
        """
        if not scored_nodes:
            return []
        node_ids = [sn.node.id for sn in scored_nodes]
        try:
            return await self._repo.get_edges_between(node_ids, workspace_id=workspace_id)
        except Exception:
            logger.warning("get_edges_between failed — returning empty edges", exc_info=True)
            return []


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------


def _merge_user_context(
    scored_nodes: list[ScoredNode],
    user_nodes: list[GraphNode],
) -> list[ScoredNode]:
    """Merge pre-fetched user-scoped nodes into the result set.

    Nodes already present (by id) are not duplicated. Accepts an already-
    fetched list so callers can parallelize the DB fetch with embedding.

    Args:
        scored_nodes: Current result set.
        user_nodes: Pre-fetched user-context nodes from the repository.

    Returns:
        Updated result list including deduplicated user context nodes.
    """
    existing_ids = {sn.node.id for sn in scored_nodes}
    now = datetime.now(tz=UTC)

    for node in user_nodes:
        if node.id in existing_ids:
            continue
        recency = compute_recency_score(node.updated_at, now)
        scored_nodes.append(
            ScoredNode(
                node=node,
                score=GRAPH_RECENCY_WEIGHT * recency,
                embedding_score=0.0,
                text_score=0.0,
                recency_score=recency,
                edge_density_score=0.0,
            )
        )
        existing_ids.add(node.id)

    return scored_nodes


def _rerank(scored_nodes: list[ScoredNode]) -> list[ScoredNode]:
    """Re-rank nodes using four-component score fusion.

    Formula:
        score = 0.5 * embedding + 0.2 * text + 0.2 * recency + 0.1 * edge_density

    ScoredNode is a mutable dataclass; mutating `.score` in place avoids
    rebuilding N objects that were just created by enrich_edge_density.

    Args:
        scored_nodes: Nodes with all four component scores already populated.

    Returns:
        The same list, sorted by combined score descending.
    """
    for sn in scored_nodes:
        sn.score = (
            GRAPH_EMBEDDING_WEIGHT * sn.embedding_score
            + GRAPH_TEXT_WEIGHT * sn.text_score
            + GRAPH_RECENCY_WEIGHT * sn.recency_score
            + GRAPH_EDGE_DENSITY_WEIGHT * sn.edge_density_score
        )
    scored_nodes.sort(key=lambda s: s.score, reverse=True)
    return scored_nodes


__all__ = ["GraphSearchPayload", "GraphSearchResult", "GraphSearchService"]
