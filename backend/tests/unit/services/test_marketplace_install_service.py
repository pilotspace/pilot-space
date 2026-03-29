"""Unit tests for MarketplaceInstallService.

Tests install, idempotent re-install, update detection, and update application.

Source: Phase 054, P054-02
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from pilot_space.application.services.skill.marketplace_install_service import (
    InstallPayload,
    InstallResult,
    MarketplaceInstallService,
    UpdateCheckResult,
)
from pilot_space.domain.exceptions import NotFoundError


@pytest.fixture
def mock_session() -> AsyncMock:
    """Create a mock async session."""
    session = AsyncMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.add = MagicMock()
    return session


@pytest.fixture
def workspace_id():
    return uuid4()


@pytest.fixture
def user_id():
    return uuid4()


@pytest.fixture
def listing_id():
    return uuid4()


def _make_listing(listing_id, *, version="1.0.0", download_count=0):
    """Create a mock listing object."""
    listing = MagicMock()
    listing.id = listing_id
    listing.name = "Test Skill"
    listing.description = "A test skill"
    listing.icon = "Wand2"
    listing.category = "testing"
    listing.version = version
    listing.download_count = download_count
    listing.is_deleted = False
    return listing


def _make_version(listing_id, *, version="1.0.0"):
    """Create a mock skill version object."""
    sv = MagicMock()
    sv.listing_id = listing_id
    sv.version = version
    sv.skill_content = "# Test Skill\nContent for version " + version
    sv.graph_data = None
    return sv


def _make_template(template_id, workspace_id, listing_id, *, installed_version="1.0.0"):
    """Create a mock skill template object."""
    t = MagicMock()
    t.id = template_id
    t.name = "Test Skill"
    t.workspace_id = workspace_id
    t.marketplace_listing_id = listing_id
    t.installed_version = installed_version
    t.is_deleted = False
    t.skill_content = "# Test Skill\nContent"
    return t


class TestMarketplaceInstallService:
    """Tests for MarketplaceInstallService."""

    @pytest.mark.asyncio
    async def test_install_creates_template_from_listing(
        self, mock_session, workspace_id, user_id, listing_id
    ):
        """Install should create a SkillTemplate from the listing's latest version."""
        listing = _make_listing(listing_id)
        version = _make_version(listing_id, version="1.2.0")

        service = MarketplaceInstallService(session=mock_session)

        with (
            patch.object(
                service._listing_repo, "get_by_id", new_callable=AsyncMock, return_value=listing
            ),
            patch.object(
                service._version_repo,
                "get_latest_by_listing",
                new_callable=AsyncMock,
                return_value=version,
            ),
            patch.object(
                service._listing_repo,
                "increment_download_count",
                new_callable=AsyncMock,
                return_value=listing,
            ),
            patch.object(
                service, "_get_existing_install", new_callable=AsyncMock, return_value=None
            ),
        ):
            # Mock session.add and flush/refresh to capture the created template
            created_template = None

            def capture_add(obj):
                nonlocal created_template
                created_template = obj

            mock_session.add.side_effect = capture_add

            result = await service.install(
                InstallPayload(workspace_id=workspace_id, listing_id=listing_id, user_id=user_id)
            )

            assert isinstance(result, InstallResult)
            assert result.already_installed is False
            assert created_template is not None
            assert created_template.marketplace_listing_id == listing_id
            assert created_template.installed_version == "1.2.0"
            assert created_template.source == "marketplace"
            assert created_template.name == "Test Skill"
            service._listing_repo.increment_download_count.assert_awaited_once_with(listing_id)

    @pytest.mark.asyncio
    async def test_install_idempotent_returns_existing(
        self, mock_session, workspace_id, user_id, listing_id
    ):
        """Re-installing an already installed listing returns existing template."""
        listing = _make_listing(listing_id)
        existing = _make_template(uuid4(), workspace_id, listing_id)

        service = MarketplaceInstallService(session=mock_session)

        with (
            patch.object(
                service._listing_repo, "get_by_id", new_callable=AsyncMock, return_value=listing
            ),
            patch.object(
                service, "_get_existing_install", new_callable=AsyncMock, return_value=existing
            ),
        ):
            result = await service.install(
                InstallPayload(workspace_id=workspace_id, listing_id=listing_id, user_id=user_id)
            )

            assert isinstance(result, InstallResult)
            assert result.already_installed is True
            assert result.skill_template == existing

    @pytest.mark.asyncio
    async def test_install_increments_download_count(
        self, mock_session, workspace_id, user_id, listing_id
    ):
        """Install should increment the listing's download count."""
        listing = _make_listing(listing_id, download_count=5)
        version = _make_version(listing_id)

        service = MarketplaceInstallService(session=mock_session)

        with (
            patch.object(
                service._listing_repo, "get_by_id", new_callable=AsyncMock, return_value=listing
            ),
            patch.object(
                service._version_repo,
                "get_latest_by_listing",
                new_callable=AsyncMock,
                return_value=version,
            ),
            patch.object(
                service._listing_repo,
                "increment_download_count",
                new_callable=AsyncMock,
                return_value=listing,
            ),
            patch.object(
                service, "_get_existing_install", new_callable=AsyncMock, return_value=None
            ),
        ):
            await service.install(
                InstallPayload(workspace_id=workspace_id, listing_id=listing_id, user_id=user_id)
            )

            service._listing_repo.increment_download_count.assert_awaited_once_with(listing_id)

    @pytest.mark.asyncio
    async def test_install_not_found_raises(self, mock_session, workspace_id, user_id):
        """Install should raise NotFoundError if listing doesn't exist."""
        service = MarketplaceInstallService(session=mock_session)
        bad_id = uuid4()

        with patch.object(
            service._listing_repo, "get_by_id", new_callable=AsyncMock, return_value=None
        ):
            with pytest.raises(NotFoundError):
                await service.install(
                    InstallPayload(workspace_id=workspace_id, listing_id=bad_id, user_id=user_id)
                )

    @pytest.mark.asyncio
    async def test_install_no_versions_raises(
        self, mock_session, workspace_id, user_id, listing_id
    ):
        """Install should raise NotFoundError if listing has no versions."""
        listing = _make_listing(listing_id)
        service = MarketplaceInstallService(session=mock_session)

        with (
            patch.object(
                service._listing_repo, "get_by_id", new_callable=AsyncMock, return_value=listing
            ),
            patch.object(
                service, "_get_existing_install", new_callable=AsyncMock, return_value=None
            ),
            patch.object(
                service._version_repo,
                "get_latest_by_listing",
                new_callable=AsyncMock,
                return_value=None,
            ),
        ):
            with pytest.raises(NotFoundError, match="version"):
                await service.install(
                    InstallPayload(
                        workspace_id=workspace_id, listing_id=listing_id, user_id=user_id
                    )
                )

    @pytest.mark.asyncio
    async def test_check_updates_finds_outdated_templates(
        self, mock_session, workspace_id, listing_id
    ):
        """check_updates should return templates where installed_version < listing.version."""
        template = _make_template(uuid4(), workspace_id, listing_id, installed_version="1.0.0")
        listing = _make_listing(listing_id, version="2.0.0")

        service = MarketplaceInstallService(session=mock_session)

        # Mock the query for marketplace-installed templates
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [template]
        mock_session.execute.return_value = mock_result

        with patch.object(
            service._listing_repo, "get_by_id", new_callable=AsyncMock, return_value=listing
        ):
            results = await service.check_updates(workspace_id)

            assert len(results) == 1
            assert isinstance(results[0], UpdateCheckResult)
            assert results[0].installed_version == "1.0.0"
            assert results[0].available_version == "2.0.0"
            assert results[0].listing_id == listing_id

    @pytest.mark.asyncio
    async def test_check_updates_skips_current_templates(
        self, mock_session, workspace_id, listing_id
    ):
        """check_updates should skip templates already on latest version."""
        template = _make_template(uuid4(), workspace_id, listing_id, installed_version="2.0.0")
        listing = _make_listing(listing_id, version="2.0.0")

        service = MarketplaceInstallService(session=mock_session)

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [template]
        mock_session.execute.return_value = mock_result

        with patch.object(
            service._listing_repo, "get_by_id", new_callable=AsyncMock, return_value=listing
        ):
            results = await service.check_updates(workspace_id)

            assert len(results) == 0

    @pytest.mark.asyncio
    async def test_update_installed_updates_content_and_version(
        self, mock_session, workspace_id, listing_id
    ):
        """update_installed should update template content and version."""
        template_id = uuid4()
        template = _make_template(
            template_id, workspace_id, listing_id, installed_version="1.0.0"
        )
        new_version = _make_version(listing_id, version="2.0.0")

        service = MarketplaceInstallService(session=mock_session)

        with (
            patch.object(
                service._template_repo, "get_by_id", new_callable=AsyncMock, return_value=template
            ),
            patch.object(
                service._version_repo,
                "get_latest_by_listing",
                new_callable=AsyncMock,
                return_value=new_version,
            ),
        ):
            result = await service.update_installed(workspace_id, template_id)

            assert result.skill_content == new_version.skill_content
            assert result.installed_version == "2.0.0"
