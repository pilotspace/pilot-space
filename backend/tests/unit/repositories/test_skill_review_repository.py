"""Unit tests for SkillReviewRepository.

Tests CRUD operations and rating aggregation.
Uses SQLite in-memory database via local fixtures.

Source: Phase 50, P50-03
"""

from __future__ import annotations

import uuid as _uuid_mod
from collections.abc import AsyncGenerator
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from pilot_space.infrastructure.database.models import User, Workspace
from pilot_space.infrastructure.database.models.skill_marketplace_listing import (
    SkillMarketplaceListing,
)
from pilot_space.infrastructure.database.repositories.skill_marketplace_listing_repository import (
    SkillMarketplaceListingRepository,
)
from pilot_space.infrastructure.database.repositories.skill_review_repository import (
    SkillReviewRepository,
)

pytestmark = pytest.mark.asyncio

# ---------------------------------------------------------------------------
# Local SQLite schema
# ---------------------------------------------------------------------------

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    avatar_url TEXT,
    default_sdlc_role TEXT,
    bio TEXT,
    ai_settings TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted BOOLEAN DEFAULT 0 NOT NULL,
    deleted_at DATETIME
);

CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    settings TEXT DEFAULT '{}',
    audit_retention_days INTEGER,
    rate_limit_standard_rpm INTEGER,
    rate_limit_ai_rpm INTEGER,
    storage_quota_mb INTEGER,
    storage_used_bytes INTEGER DEFAULT 0 NOT NULL,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted BOOLEAN DEFAULT 0 NOT NULL,
    deleted_at DATETIME
);

CREATE TABLE IF NOT EXISTS skill_marketplace_listings (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    long_description TEXT,
    author TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'Wand2',
    category TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    version TEXT NOT NULL,
    download_count INTEGER NOT NULL DEFAULT 0,
    avg_rating REAL,
    screenshots TEXT,
    graph_data TEXT,
    published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted BOOLEAN DEFAULT 0 NOT NULL,
    deleted_at DATETIME
);

CREATE TABLE IF NOT EXISTS skill_reviews (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    listing_id TEXT NOT NULL REFERENCES skill_marketplace_listings(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL,
    review_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_deleted BOOLEAN DEFAULT 0 NOT NULL,
    deleted_at DATETIME
);
"""


def _register_sqlite_fns(dbapi_conn: Any, connection_record: Any) -> None:
    dbapi_conn.create_function("gen_random_uuid", 0, lambda: str(_uuid_mod.uuid4()))


@pytest.fixture
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False,
    )
    event.listen(engine.sync_engine, "connect", _register_sqlite_fns)
    async with engine.begin() as conn:
        for stmt in _SCHEMA_SQL.strip().split(";"):
            cleaned = stmt.strip()
            if cleaned:
                await conn.execute(text(cleaned))
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )
    async with factory() as session, session.begin():
        yield session


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
async def workspace(db_session: AsyncSession) -> Workspace:
    ws = Workspace(
        id=uuid4(),
        name="Test Workspace",
        slug="test-review-ws",
        owner_id=uuid4(),
    )
    db_session.add(ws)
    await db_session.flush()
    return ws


@pytest.fixture
async def user_a(db_session: AsyncSession) -> User:
    u = User(id=uuid4(), email="user-a@example.com")
    db_session.add(u)
    await db_session.flush()
    return u


@pytest.fixture
async def user_b(db_session: AsyncSession) -> User:
    u = User(id=uuid4(), email="user-b@example.com")
    db_session.add(u)
    await db_session.flush()
    return u


@pytest.fixture
async def listing(
    db_session: AsyncSession,
    workspace: Workspace,
) -> SkillMarketplaceListing:
    repo = SkillMarketplaceListingRepository(db_session)
    return await repo.create(
        workspace_id=workspace.id,
        name="Review Target",
        description="A skill to review",
        author="Author",
        category="testing",
        version="1.0.0",
    )


@pytest.fixture
async def repo(db_session: AsyncSession) -> SkillReviewRepository:
    return SkillReviewRepository(db_session)


# ============================================================================
# Tests
# ============================================================================


class TestCreateReview:
    """Tests for create()."""

    async def test_create_review(
        self,
        repo: SkillReviewRepository,
        workspace: Workspace,
        listing: SkillMarketplaceListing,
        user_a: User,
    ) -> None:
        """Create a review and verify all fields."""
        review = await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_a.id,
            rating=4,
            review_text="Great skill!",
        )

        assert review.id is not None
        assert review.listing_id == listing.id
        assert review.user_id == user_a.id
        assert review.rating == 4
        assert review.review_text == "Great skill!"
        assert review.is_deleted is False

    async def test_create_without_text(
        self,
        repo: SkillReviewRepository,
        workspace: Workspace,
        listing: SkillMarketplaceListing,
        user_a: User,
    ) -> None:
        """Create a rating-only review (no text)."""
        review = await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_a.id,
            rating=5,
        )

        assert review.review_text is None
        assert review.rating == 5


class TestGetByListing:
    """Tests for get_by_listing()."""

    async def test_get_reviews_by_listing(
        self,
        repo: SkillReviewRepository,
        workspace: Workspace,
        listing: SkillMarketplaceListing,
        user_a: User,
        user_b: User,
    ) -> None:
        """2 reviews for same listing, verifies listing filter."""
        await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_a.id,
            rating=3,
        )
        await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_b.id,
            rating=5,
        )

        reviews = await repo.get_by_listing(listing.id)
        assert len(reviews) == 2

    async def test_excludes_deleted_reviews(
        self,
        db_session: AsyncSession,
        repo: SkillReviewRepository,
        workspace: Workspace,
        listing: SkillMarketplaceListing,
        user_a: User,
    ) -> None:
        """Soft-deleted reviews excluded from listing results."""
        review = await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_a.id,
            rating=4,
        )
        review.is_deleted = True
        await db_session.flush()

        reviews = await repo.get_by_listing(listing.id)
        assert len(reviews) == 0


class TestGetByUserAndListing:
    """Tests for get_by_user_and_listing()."""

    async def test_get_by_user_and_listing(
        self,
        repo: SkillReviewRepository,
        workspace: Workspace,
        listing: SkillMarketplaceListing,
        user_a: User,
    ) -> None:
        """Verifies unique lookup by user + listing."""
        await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_a.id,
            rating=4,
            review_text="My review",
        )

        found = await repo.get_by_user_and_listing(user_a.id, listing.id)
        assert found is not None
        assert found.rating == 4
        assert found.review_text == "My review"

    async def test_returns_none_for_no_review(
        self,
        repo: SkillReviewRepository,
        listing: SkillMarketplaceListing,
        user_a: User,
    ) -> None:
        """Returns None when user has no review for listing."""
        found = await repo.get_by_user_and_listing(user_a.id, listing.id)
        assert found is None


class TestGetAvgRating:
    """Tests for get_avg_rating()."""

    async def test_get_avg_rating(
        self,
        repo: SkillReviewRepository,
        workspace: Workspace,
        listing: SkillMarketplaceListing,
        user_a: User,
        user_b: User,
    ) -> None:
        """2 reviews with ratings 3 and 5, avg should be 4.0."""
        await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_a.id,
            rating=3,
        )
        await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_b.id,
            rating=5,
        )

        result = await repo.get_avg_rating(listing.id)
        assert result == 4.0

    async def test_avg_rating_none_for_no_reviews(
        self,
        repo: SkillReviewRepository,
        listing: SkillMarketplaceListing,
    ) -> None:
        """Returns None when no reviews exist."""
        result = await repo.get_avg_rating(listing.id)
        assert result is None

    async def test_avg_excludes_deleted(
        self,
        db_session: AsyncSession,
        repo: SkillReviewRepository,
        workspace: Workspace,
        listing: SkillMarketplaceListing,
        user_a: User,
        user_b: User,
    ) -> None:
        """Soft-deleted reviews excluded from average calculation."""
        r1 = await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_a.id,
            rating=1,
        )
        await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_b.id,
            rating=5,
        )
        # Soft-delete the rating=1 review
        r1.is_deleted = True
        await db_session.flush()

        result = await repo.get_avg_rating(listing.id)
        assert result == 5.0


class TestUpdateReview:
    """Tests for update()."""

    async def test_update_review_text(
        self,
        repo: SkillReviewRepository,
        workspace: Workspace,
        listing: SkillMarketplaceListing,
        user_a: User,
    ) -> None:
        """Update review text and verify persistence."""
        review = await repo.create(
            workspace_id=workspace.id,
            listing_id=listing.id,
            user_id=user_a.id,
            rating=3,
            review_text="Original text",
        )

        review.review_text = "Updated text"
        review.rating = 4
        updated = await repo.update(review)

        assert updated.review_text == "Updated text"
        assert updated.rating == 4
