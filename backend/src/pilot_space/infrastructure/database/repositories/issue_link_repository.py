"""IssueLinkRepository for issue-to-issue relationship data access (AD-005).

Provides methods for creating, querying, and traversing issue link graphs.
"""

from __future__ import annotations

from collections import deque
from typing import TYPE_CHECKING, Any

from sqlalchemy import and_, or_, select

from pilot_space.infrastructure.database.models.issue_link import (
    IssueLink,
    IssueLinkType,
)
from pilot_space.infrastructure.database.repositories.base import BaseRepository

if TYPE_CHECKING:
    from collections.abc import Sequence
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
        """Traverse dependency chain using BFS.

        Follows BLOCKS/BLOCKED_BY links to build a dependency graph
        starting from the given issue.

        Args:
            issue_id: Starting issue UUID.
            workspace_id: Workspace UUID for RLS.
            max_depth: Maximum traversal depth to prevent infinite loops.

        Returns:
            List of dicts with issue_id, link_type, and depth for each node.
        """
        visited: set[UUID] = {issue_id}
        queue: deque[tuple[UUID, int]] = deque([(issue_id, 0)])
        chain: list[dict[str, Any]] = []

        while queue:
            current_id, depth = queue.popleft()
            if depth >= max_depth:
                continue

            links = await self.find_all_for_issue(current_id, workspace_id)
            for link in links:
                # Determine the "other" issue in this link
                if link.source_issue_id == current_id:
                    other_id = link.target_issue_id
                    direction = "outgoing"
                else:
                    other_id = link.source_issue_id
                    direction = "incoming"

                if other_id in visited:
                    continue

                # Only follow blocks/blocked_by for dependency chains
                if link.link_type not in (
                    IssueLinkType.BLOCKS,
                    IssueLinkType.BLOCKED_BY,
                ):
                    continue

                visited.add(other_id)
                chain.append(
                    {
                        "issue_id": str(other_id),
                        "link_type": link.link_type.value,
                        "direction": direction,
                        "depth": depth + 1,
                    }
                )
                queue.append((other_id, depth + 1))

        return chain
