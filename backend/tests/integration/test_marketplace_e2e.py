"""Integration tests for marketplace publish -> install -> review E2E flow.

Service-layer integration tests exercising the full pipeline across
MarketplaceService, MarketplaceInstallService, and MarketplaceReviewService
with mocked DB session and repositories.

Phase 056, Plan 02, Task 2.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from pilot_space.application.services.skill.marketplace_install_service import (
    InstallPayload,
    MarketplaceInstallService,
)
from pilot_space.application.services.skill.marketplace_review_service import (
    MarketplaceReviewService,
    ReviewPayload,
)
from pilot_space.application.services.skill.marketplace_service import (
    CreateVersionPayload,
    MarketplaceService,
    PublishListingPayload,
    SearchPayload,
)
from pilot_space.domain.exceptions import ConflictError


# ── Mock Helpers ────────────────────────────────────────────────────────────


def _make_listing(**overrides) -> MagicMock:
    """Create a mock marketplace listing."""
    listing = MagicMock()
    listing.id = overrides.get("id", uuid4())
    listing.workspace_id = overrides.get("workspace_id", uuid4())
    listing.name = overrides.get("name", "Test Skill")
    listing.description = overrides.get("description", "A test skill")
    listing.author = overrides.get("author", "Alice")
    listing.category = overrides.get("category", "Development")
    listing.version = overrides.get("version", "1.0.0")
    listing.download_count = overrides.get("download_count", 0)
    listing.avg_rating = overrides.get("avg_rating", 0.0)
    listing.tags = overrides.get("tags", ["python"])
    listing.icon = overrides.get("icon", "Wand2")
    listing.is_deleted = False
    listing.long_description = overrides.get("long_description", None)
    listing.screenshots = overrides.get("screenshots", None)
    listing.graph_data = overrides.get("graph_data", None)
    return listing


def _make_version(**overrides) -> MagicMock:
    """Create a mock skill version."""
    version = MagicMock()
    version.id = overrides.get("id", uuid4())
    version.listing_id = overrides.get("listing_id", uuid4())
    version.version = overrides.get("version", "1.0.0")
    version.skill_content = overrides.get("skill_content", "# Skill content")
    version.changelog = overrides.get("changelog", "Initial release")
    version.graph_data = overrides.get("graph_data", None)
    return version


def _make_template(**overrides) -> MagicMock:
    """Create a mock skill template."""
    tpl = MagicMock()
    tpl.id = overrides.get("id", uuid4())
    tpl.workspace_id = overrides.get("workspace_id", uuid4())
    tpl.name = overrides.get("name", "Test Skill")
    tpl.description = overrides.get("description", "A test skill")
    tpl.skill_content = overrides.get("skill_content", "# Test Skill\nContent here")
    tpl.icon = overrides.get("icon", "Wand2")
    tpl.marketplace_listing_id = overrides.get("marketplace_listing_id", None)
    tpl.installed_version = overrides.get("installed_version", None)
    tpl.is_deleted = False
    return tpl


def _make_review(**overrides) -> MagicMock:
    """Create a mock skill review."""
    review = MagicMock()
    review.id = overrides.get("id", uuid4())
    review.listing_id = overrides.get("listing_id", uuid4())
    review.user_id = overrides.get("user_id", uuid4())
    review.rating = overrides.get("rating", 4)
    review.review_text = overrides.get("review_text", "Great skill!")
    return review


# ── Test 1: Publish then search finds by name ──────────────────────────────


@pytest.mark.asyncio
async def test_publish_then_search_finds_listing() -> None:
    """Publish a skill template as marketplace listing, then search finds it by name."""
    session = AsyncMock()
    workspace_id = uuid4()
    user_id = uuid4()
    template_id = uuid4()
    listing_id = uuid4()

    template = _make_template(id=template_id, workspace_id=workspace_id)
    listing = _make_listing(id=listing_id, workspace_id=workspace_id, name="Code Reviewer")
    version = _make_version(listing_id=listing_id)

    service = MarketplaceService(session)

    with (
        patch.object(service, "_template_repo") as mock_tpl_repo,
        patch.object(service, "_listing_repo") as mock_listing_repo,
        patch.object(service, "_version_repo") as mock_version_repo,
    ):
        # Publish
        mock_tpl_repo.get_by_id = AsyncMock(return_value=template)
        mock_listing_repo.create = AsyncMock(return_value=listing)
        mock_version_repo.create = AsyncMock(return_value=version)

        publish_payload = PublishListingPayload(
            workspace_id=workspace_id,
            skill_template_id=template_id,
            user_id=user_id,
            name="Code Reviewer",
            description="Reviews code",
            author="Alice",
            category="Development",
            version="1.0.0",
        )
        published = await service.publish_listing(publish_payload)
        assert published.name == "Code Reviewer"

        # Search by name
        mock_listing_repo.search = AsyncMock(return_value=[listing])

        search_payload = SearchPayload(query="Code Reviewer")
        search_result = await service.search(search_payload)

        assert len(search_result.items) == 1
        assert search_result.items[0].name == "Code Reviewer"


# ── Test 2: Install creates template with marketplace_listing_id ───────────


@pytest.mark.asyncio
async def test_install_creates_template_with_listing_id() -> None:
    """Install a published listing into a different workspace, creates
    skill_template with marketplace_listing_id set."""
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()

    publisher_ws = uuid4()
    installer_ws = uuid4()
    listing_id = uuid4()
    user_id = uuid4()

    listing = _make_listing(id=listing_id, workspace_id=publisher_ws, name="My Skill")
    latest_version = _make_version(listing_id=listing_id, version="1.0.0")

    service = MarketplaceInstallService(session)

    # Mock _get_existing_install to return None (not installed)
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    session.execute.return_value = mock_result

    with (
        patch.object(service, "_listing_repo") as mock_listing_repo,
        patch.object(service, "_version_repo") as mock_version_repo,
    ):
        mock_listing_repo.get_by_id = AsyncMock(return_value=listing)
        mock_version_repo.get_latest_by_listing = AsyncMock(return_value=latest_version)
        mock_listing_repo.increment_download_count = AsyncMock()

        install_payload = InstallPayload(
            workspace_id=installer_ws,
            listing_id=listing_id,
            user_id=user_id,
        )
        result = await service.install(install_payload)

    assert result.already_installed is False
    # Verify session.add was called with a SkillTemplate
    added_template = session.add.call_args[0][0]
    assert added_template.marketplace_listing_id == listing_id
    assert added_template.installed_version == "1.0.0"
    assert added_template.workspace_id == installer_ws


# ── Test 3: New version detected as update available ───────────────────────


@pytest.mark.asyncio
async def test_new_version_detected_as_update() -> None:
    """Publish new version (semver bump), installed workspace detects update available."""
    session = AsyncMock()
    workspace_id = uuid4()
    listing_id = uuid4()
    template_id = uuid4()

    # Listing at version 1.1.0, template installed at 1.0.0
    listing = _make_listing(id=listing_id, version="1.1.0")

    template = _make_template(
        id=template_id,
        workspace_id=workspace_id,
        marketplace_listing_id=listing_id,
        installed_version="1.0.0",
    )

    # Mock session.execute for the check_updates query
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [template]
    session.execute.return_value = mock_result

    service = MarketplaceInstallService(session)

    with patch.object(service, "_listing_repo") as mock_listing_repo:
        mock_listing_repo.get_by_id = AsyncMock(return_value=listing)

        updates = await service.check_updates(workspace_id)

    assert len(updates) == 1
    assert updates[0].template_id == template_id
    assert updates[0].installed_version == "1.0.0"
    assert updates[0].available_version == "1.1.0"


# ── Test 4: Submit review updates avg_rating ───────────────────────────────


@pytest.mark.asyncio
async def test_submit_review_updates_avg_rating() -> None:
    """Submit review for installed skill, avg_rating updates on listing."""
    session = AsyncMock()
    listing_id = uuid4()
    user_id = uuid4()
    workspace_id = uuid4()

    listing = _make_listing(id=listing_id, avg_rating=0.0)
    review = _make_review(listing_id=listing_id, user_id=user_id, rating=4)

    service = MarketplaceReviewService(session)

    with (
        patch.object(service, "_listing_repo") as mock_listing_repo,
        patch.object(service, "_review_repo") as mock_review_repo,
    ):
        mock_listing_repo.get_by_id = AsyncMock(return_value=listing)
        mock_review_repo.get_by_user_and_listing = AsyncMock(return_value=None)
        mock_review_repo.create = AsyncMock(return_value=review)
        mock_review_repo.get_avg_rating = AsyncMock(return_value=4.0)
        mock_listing_repo.update_avg_rating = AsyncMock()

        payload = ReviewPayload(
            workspace_id=workspace_id,
            listing_id=listing_id,
            user_id=user_id,
            rating=4,
            review_text="Solid skill!",
        )
        result = await service.create_or_update(payload)

    assert result is review
    mock_listing_repo.update_avg_rating.assert_awaited_once_with(listing_id, 4.0)


# ── Test 5: Duplicate review by same user updates existing (upsert) ────────


@pytest.mark.asyncio
async def test_duplicate_review_same_user_updates_existing() -> None:
    """Second review by same user_id updates the existing review (upsert behavior)."""
    session = AsyncMock()
    listing_id = uuid4()
    user_id = uuid4()
    workspace_id = uuid4()

    listing = _make_listing(id=listing_id)
    existing_review = _make_review(
        listing_id=listing_id, user_id=user_id, rating=3, review_text="OK"
    )

    service = MarketplaceReviewService(session)

    with (
        patch.object(service, "_listing_repo") as mock_listing_repo,
        patch.object(service, "_review_repo") as mock_review_repo,
    ):
        mock_listing_repo.get_by_id = AsyncMock(return_value=listing)
        mock_review_repo.get_by_user_and_listing = AsyncMock(return_value=existing_review)
        mock_review_repo.update = AsyncMock(return_value=existing_review)
        mock_review_repo.get_avg_rating = AsyncMock(return_value=5.0)
        mock_listing_repo.update_avg_rating = AsyncMock()

        payload = ReviewPayload(
            workspace_id=workspace_id,
            listing_id=listing_id,
            user_id=user_id,
            rating=5,
            review_text="Actually great!",
        )
        result = await service.create_or_update(payload)

    # Existing review was updated, not a new one created
    assert existing_review.rating == 5
    assert existing_review.review_text == "Actually great!"
    mock_review_repo.update.assert_awaited_once()


# ── Test 6: Search with category filter returns only matching ───────────────


@pytest.mark.asyncio
async def test_search_with_category_filter() -> None:
    """Search with category filter returns only matching listings."""
    session = AsyncMock()

    dev_listing = _make_listing(name="Dev Tool", category="Development")
    # Testing listing should NOT appear

    service = MarketplaceService(session)

    with patch.object(service, "_listing_repo") as mock_listing_repo:
        mock_listing_repo.get_by_category = AsyncMock(return_value=[dev_listing])

        search_payload = SearchPayload(category="Development")
        search_result = await service.search(search_payload)

    assert len(search_result.items) == 1
    assert search_result.items[0].category == "Development"
