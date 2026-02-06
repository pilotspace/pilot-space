"""IssueLinkRepository for issue-to-issue relationship data access (AD-005).

Provides methods for creating, querying, and traversing issue link graphs.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any

from sqlalchemy import and_, or_, select

from pilot_space.infrastructure.database.models.issue_link import (
    IssueLink,
    IssueLinkType,
)
from pilot_space.infrastructure.database.repositories.base import BaseRepository

if TYPE_CHECKING:
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession


class IssueLinkRepository(BaseRepository[IssueLink]):
    """Repository for IssueLink entities.

    Extends BaseRepository with link-specific queries including
    BFS traversal for dependency chain resolution.
    """

    def __init__(self, session: AsyncSession) -> None:
        """Initialize IssueLinkRepository.

        Args:
            session: The async database session.
        """
        super().__init__(session, IssueLink)

    async def find_by_source(
        self,
        issue_id: UUID,
        workspace_id: UUID,
        *,
        link_type: IssueLinkType | None = None,
    ) -> Sequence[IssueLink]:
        """Get all links where issue is the source.

        Args:
            issue_id: Source issue UUID.
            workspace_id: Workspace UUID for RLS.
            link_type: Optional filter by link type.

        Returns:
            List of IssueLink records.
        """
        conditions = [
            IssueLink.source_issue_id == issue_id,
            IssueLink.workspace_id == workspace_id,
            IssueLink.is_deleted == False,  # noqa: E712
        ]
        if link_type is not None:
            conditions.append(IssueLink.link_type == link_type)

        query = select(IssueLink).where(and_(*conditions))
        result = await self.session.execute(query)
        return result.scalars().all()

    async def find_by_target(
        self,
        issue_id: UUID,
        workspace_id: UUID,
        *,
        link_type: IssueLinkType | None = None,
    ) -> Sequence[IssueLink]:
        """Get all links where issue is the target.

        Args:
            issue_id: Target issue UUID.
            workspace_id: Workspace UUID for RLS.
            link_type: Optional filter by link type.

        Returns:
            List of IssueLink records.
        """
        conditions = [
            IssueLink.target_issue_id == issue_id,
            IssueLink.workspace_id == workspace_id,
            IssueLink.is_deleted == False,  # noqa: E712
        ]
        if link_type is not None:
            conditions.append(IssueLink.link_type == link_type)

        query = select(IssueLink).where(and_(*conditions))
        result = await self.session.execute(query)
        return result.scalars().all()

    async def find_all_for_issue(
        self,
        issue_id: UUID,
        workspace_id: UUID,
    ) -> Sequence[IssueLink]:
        """Get all links where issue is source or target.

        Args:
            issue_id: Issue UUID.
            workspace_id: Workspace UUID for RLS.

        Returns:
            List of IssueLink records (both directions).
        """
        query = select(IssueLink).where(
            and_(
                IssueLink.workspace_id == workspace_id,
                IssueLink.is_deleted == False,  # noqa: E712
                or_(
                    IssueLink.source_issue_id == issue_id,
                    IssueLink.target_issue_id == issue_id,
                ),
            )
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def link_exists(
        self,
        source_id: UUID,
        target_id: UUID,
        link_type: IssueLinkType,
        workspace_id: UUID,
    ) -> bool:
        """Check if a specific link already exists.

        Args:
            source_id: Source issue UUID.
            target_id: Target issue UUID.
            link_type: Type of link.
            workspace_id: Workspace UUID for RLS.

        Returns:
            True if the link exists.
        """
        query = (
            select(IssueLink.id)
            .where(
                and_(
                    IssueLink.source_issue_id == source_id,
                    IssueLink.target_issue_id == target_id,
                    IssueLink.link_type == link_type,
                    IssueLink.workspace_id == workspace_id,
                    IssueLink.is_deleted == False,  # noqa: E712
                )
            )
            .limit(1)
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None

    async def find_dependency_chain(
        self,
        issue_id: UUID,
        workspace_id: UUID,
        *,
        max_depth: int = 10,
    ) -> list[dict[str, Any]]:
        """Traverse dependency chain using BFS with a single batch query.

        Fetches all BLOCKS/BLOCKED_BY links in the workspace upfront,
        then traverses the adjacency graph in-memory to avoid N+1 queries.

        Args:
            issue_id: Starting issue UUID.
            workspace_id: Workspace UUID for RLS.
            max_depth: Maximum traversal depth to prevent infinite loops.

        Returns:
            List of dicts with issue_id, link_type, direction, and depth.
        """
        # Single query: fetch all dependency links in workspace
        dep_types = (IssueLinkType.BLOCKS, IssueLinkType.BLOCKED_BY)
        query = select(IssueLink).where(
            and_(
                IssueLink.workspace_id == workspace_id,
                IssueLink.is_deleted == False,  # noqa: E712
                IssueLink.link_type.in_(dep_types),
            )
        )
        result = await self.session.execute(query)
        all_links: Sequence[IssueLink] = result.scalars().all()

        # Build bidirectional adjacency map in-memory
        adjacency: dict[UUID, list[tuple[UUID, str, str]]] = {}
        for link in all_links:
            # source → target (outgoing)
            adjacency.setdefault(link.source_issue_id, []).append(
                (link.target_issue_id, link.link_type.value, "outgoing")
            )
            # target → source (incoming)
            adjacency.setdefault(link.target_issue_id, []).append(
                (link.source_issue_id, link.link_type.value, "incoming")
            )

        # BFS traversal using in-memory adjacency map
        visited: set[UUID] = {issue_id}
        bfs_queue: deque[tuple[UUID, int]] = deque([(issue_id, 0)])
        chain: list[dict[str, Any]] = []

        while bfs_queue:
            current_id, depth = bfs_queue.popleft()
            if depth >= max_depth:
                continue

            for other_id, link_type_val, direction in adjacency.get(current_id, []):
                if other_id in visited:
                    continue

                visited.add(other_id)
                chain.append(
                    {
                        "issue_id": str(other_id),
                        "link_type": link_type_val,
                        "direction": direction,
                        "depth": depth + 1,
                    }
                )
                bfs_queue.append((other_id, depth + 1))

        return chain
