"""Graph node expiration background job.

Soft-deletes stale, unpinned graph nodes that have not been updated
within the configured TTL window. Pinned nodes (properties.pinned=true)
are preserved regardless of age.

Triggered by the MemoryWorker on TASK_GRAPH_EXPIRATION task type.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)

DEFAULT_TTL_DAYS = 30


async def expire_stale_graph_nodes(
    session: AsyncSession,
    ttl_days: int = DEFAULT_TTL_DAYS,
) -> int:
    """Soft-delete unpinned graph nodes older than ttl_days.

    Nodes with ``properties.pinned = true`` are never expired.

    Args:
        session: Database session (caller responsible for commit).
        ttl_days: Age threshold in days. Nodes last updated before
            ``now - ttl_days`` are soft-deleted.

    Returns:
        Number of nodes soft-deleted.
    """
    from pilot_space.infrastructure.database.repositories.knowledge_graph_repository import (
        KnowledgeGraphRepository,
    )

    before = datetime.now(UTC) - timedelta(days=ttl_days)
    repo = KnowledgeGraphRepository(session)
    count = await repo.delete_expired_nodes(before)

    if count:
        logger.info("expire_stale_graph_nodes: soft-deleted %d nodes (ttl=%dd)", count, ttl_days)

    return count


__all__ = ["DEFAULT_TTL_DAYS", "expire_stale_graph_nodes"]
