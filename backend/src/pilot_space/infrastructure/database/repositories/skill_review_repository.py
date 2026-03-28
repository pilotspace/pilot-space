"""Repository for SkillReview entities.

Provides workspace-scoped CRUD operations for skill reviews and ratings.
Primary query patterns:
- get_by_listing: reviews for a listing (newest first)
- get_by_user_and_listing: unique review lookup (one review per user per listing)
- get_avg_rating: aggregate average rating for a listing

Source: Phase 50, P50-03
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import and_, func, select

from pilot_space.infrastructure.database.models.skill_review import SkillReview
from pilot_space.infrastructure.database.repositories.base import BaseRepository

if TYPE_CHECKING:
    from collections.abc import Sequence
    from uuid import UUID

    from sqlalchemy.ext.asyncio import AsyncSession


class SkillReviewRepository(BaseRepository[SkillReview]):
    """Repository for SkillReview entities.

    All write operations use flush() (no commit) -- callers own transaction
    boundaries via the session context.
    """

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SkillReview)

    async def create(  # type: ignore[override]
        self,
        *,
        workspace_id: UUID,
        listing_id: UUID,
        user_id: UUID,
        rating: int,
        review_text: str | None = None,
    ) -> SkillReview:
        """Create a new skill review.

        Args:
            workspace_id: Owning workspace UUID.
            listing_id: The reviewed marketplace listing UUID.
            user_id: The reviewing user UUID.
            rating: Integer rating from 1 to 5.
            review_text: Optional text review content.

        Returns:
            Newly created SkillReview.
        """
        review = SkillReview(
            workspace_id=workspace_id,
            listing_id=listing_id,
            user_id=user_id,
            rating=rating,
            review_text=review_text,
        )
        self.session.add(review)
        await self.session.flush()
        await self.session.refresh(review)
        return review

    async def get_by_listing(
        self,
        listing_id: UUID,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[SkillReview]:
        """Get all reviews for a listing, newest first.

        Args:
            listing_id: The listing UUID.
            limit: Maximum number of rows to return.
            offset: Number of rows to skip for pagination.

        Returns:
            Reviews for the listing, ordered by created_at descending.
        """
        query = (
            select(SkillReview)
            .where(
                and_(
                    SkillReview.listing_id == listing_id,
                    SkillReview.is_deleted == False,  # noqa: E712
                )
            )
            .order_by(SkillReview.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_by_user_and_listing(
        self,
        user_id: UUID,
        listing_id: UUID,
    ) -> SkillReview | None:
        """Get a user's review for a specific listing.

        Args:
            user_id: The reviewing user UUID.
            listing_id: The listing UUID.

        Returns:
            The user's review, or None if not found.
        """
        query = select(SkillReview).where(
            and_(
                SkillReview.user_id == user_id,
                SkillReview.listing_id == listing_id,
                SkillReview.is_deleted == False,  # noqa: E712
            )
        )
        result = await self.session.execute(query)
        return result.scalars().first()

    async def get_avg_rating(
        self,
        listing_id: UUID,
    ) -> float | None:
        """Get the average rating for a listing.

        Args:
            listing_id: The listing UUID.

        Returns:
            Average rating as float, or None if no reviews exist.
        """
        query = select(func.avg(SkillReview.rating)).where(
            and_(
                SkillReview.listing_id == listing_id,
                SkillReview.is_deleted == False,  # noqa: E712
            )
        )
        result = await self.session.execute(query)
        avg = result.scalar()
        return float(avg) if avg is not None else None

    async def update(  # type: ignore[override]
        self,
        review: SkillReview,
    ) -> SkillReview:
        """Update a skill review.

        Args:
            review: The review to update (already modified in-memory).

        Returns:
            Updated SkillReview.
        """
        await self.session.flush()
        await self.session.refresh(review)
        return review


__all__ = ["SkillReviewRepository"]
