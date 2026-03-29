"""Service layer for marketplace review operations.

Handles review creation/update (one-review-per-user upsert), rating
aggregation, paginated listing, and ownership-checked soft-delete.

Source: Phase 54, P54-03
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from pilot_space.domain.exceptions import ForbiddenError, NotFoundError, ValidationError
from pilot_space.infrastructure.database.repositories.skill_marketplace_listing_repository import (
    SkillMarketplaceListingRepository,
)
from pilot_space.infrastructure.database.repositories.skill_review_repository import (
    SkillReviewRepository,
)
from pilot_space.infrastructure.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from pilot_space.infrastructure.database.models.skill_review import SkillReview

logger = get_logger(__name__)


@dataclass
class ReviewPayload:
    """Input payload for creating or updating a review."""

    workspace_id: UUID
    listing_id: UUID
    user_id: UUID
    rating: int  # 1-5
    review_text: str | None = None


@dataclass
class ReviewListResult:
    """Paginated result for listing reviews."""

    items: list[SkillReview]
    total: int
    has_next: bool


class MarketplaceReviewService:
    """Service for marketplace review operations.

    Enforces one-review-per-user via upsert, recalculates listing
    avg_rating on every create/update/delete, and supports paginated
    review listing.

    Args:
        session: Request-scoped async database session.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._review_repo = SkillReviewRepository(session)
        self._listing_repo = SkillMarketplaceListingRepository(session)

    async def create_or_update(self, payload: ReviewPayload) -> SkillReview:
        """Create or update a review for a marketplace listing.

        If the user already has a review for this listing, the existing
        review is updated in-place. Otherwise a new review is created.
        In both cases, the listing avg_rating is recalculated.

        Args:
            payload: Review creation/update payload.

        Returns:
            Created or updated SkillReview.

        Raises:
            ValidationError: If rating is not between 1 and 5.
            NotFoundError: If the listing does not exist.
        """
        if not (1 <= payload.rating <= 5):
            raise ValidationError(
                f"Rating must be between 1 and 5, got {payload.rating}"
            )

        # Verify listing exists
        listing = await self._listing_repo.get_by_id(payload.listing_id)
        if listing is None:
            raise NotFoundError("Listing not found")

        # Check for existing review (upsert)
        existing = await self._review_repo.get_by_user_and_listing(
            payload.user_id, payload.listing_id
        )

        if existing is not None:
            existing.rating = payload.rating
            existing.review_text = payload.review_text
            review = await self._review_repo.update(existing)
            logger.info(
                "[Review] Updated review=%s listing=%s user=%s rating=%d",
                review.id,
                payload.listing_id,
                payload.user_id,
                payload.rating,
            )
        else:
            review = await self._review_repo.create(
                workspace_id=payload.workspace_id,
                listing_id=payload.listing_id,
                user_id=payload.user_id,
                rating=payload.rating,
                review_text=payload.review_text,
            )
            logger.info(
                "[Review] Created review=%s listing=%s user=%s rating=%d",
                review.id,
                payload.listing_id,
                payload.user_id,
                payload.rating,
            )

        # Recalculate and update listing avg_rating
        avg = await self._review_repo.get_avg_rating(payload.listing_id)
        await self._listing_repo.update_avg_rating(
            payload.listing_id, avg or 0.0
        )

        return review

    async def list_reviews(
        self,
        listing_id: UUID,
        limit: int = 20,
        offset: int = 0,
    ) -> ReviewListResult:
        """List reviews for a marketplace listing with pagination.

        Fetches limit+1 items to detect whether more pages exist.

        Args:
            listing_id: The listing UUID.
            limit: Maximum number of reviews to return.
            offset: Number of reviews to skip.

        Returns:
            ReviewListResult with items, total count, and has_next flag.
        """
        reviews = await self._review_repo.get_by_listing(
            listing_id, limit=limit + 1, offset=offset
        )
        items = list(reviews)
        has_next = len(items) > limit
        if has_next:
            items = items[:limit]

        return ReviewListResult(
            items=items,
            total=len(items),
            has_next=has_next,
        )

    async def delete_review(self, review_id: UUID, user_id: UUID) -> None:
        """Soft-delete a review, verifying ownership.

        Args:
            review_id: The review UUID.
            user_id: The requesting user UUID (must be review owner).

        Raises:
            NotFoundError: If review does not exist.
            ForbiddenError: If user does not own the review.
        """
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise NotFoundError("Review not found")

        if review.user_id != user_id:
            raise ForbiddenError("Cannot delete another user's review")

        review.soft_delete()
        await self._review_repo.update(review)

        # Recalculate avg_rating after deletion
        avg = await self._review_repo.get_avg_rating(review.listing_id)
        await self._listing_repo.update_avg_rating(
            review.listing_id, avg or 0.0
        )

        logger.info(
            "[Review] Deleted review=%s listing=%s user=%s",
            review_id,
            review.listing_id,
            user_id,
        )


__all__ = ["MarketplaceReviewService", "ReviewListResult", "ReviewPayload"]
