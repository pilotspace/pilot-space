"""Unit tests for expire_stale_graph_nodes job function."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest

from pilot_space.infrastructure.jobs.expire_graph_nodes import (
    DEFAULT_TTL_DAYS,
    expire_stale_graph_nodes,
)

pytestmark = pytest.mark.asyncio

_REPO_PATCH = "pilot_space.infrastructure.database.repositories.knowledge_graph_repository.KnowledgeGraphRepository"


def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.commit = AsyncMock()
    return session


class TestExpireStaleGraphNodes:
    """Tests for expire_stale_graph_nodes()."""

    async def test_delegates_to_repository(self) -> None:
        session = _make_session()
        with patch(_REPO_PATCH) as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.delete_expired_nodes = AsyncMock(return_value=5)

            count = await expire_stale_graph_nodes(session)

        assert count == 5
        MockRepo.assert_called_once_with(session)
        mock_repo.delete_expired_nodes.assert_awaited_once()

    async def test_uses_default_ttl(self) -> None:
        session = _make_session()
        with patch(_REPO_PATCH) as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.delete_expired_nodes = AsyncMock(return_value=0)

            await expire_stale_graph_nodes(session)

        call_args = mock_repo.delete_expired_nodes.call_args
        before: datetime = call_args.args[0]
        # Should be approximately now - DEFAULT_TTL_DAYS
        expected_min = datetime.now(UTC) - timedelta(days=DEFAULT_TTL_DAYS + 1)
        expected_max = datetime.now(UTC) - timedelta(days=DEFAULT_TTL_DAYS - 1)
        assert expected_min <= before <= expected_max

    async def test_custom_ttl(self) -> None:
        session = _make_session()
        with patch(_REPO_PATCH) as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.delete_expired_nodes = AsyncMock(return_value=0)

            await expire_stale_graph_nodes(session, ttl_days=7)

        call_args = mock_repo.delete_expired_nodes.call_args
        before: datetime = call_args.args[0]
        expected_min = datetime.now(UTC) - timedelta(days=8)
        expected_max = datetime.now(UTC) - timedelta(days=6)
        assert expected_min <= before <= expected_max

    async def test_returns_zero_when_nothing_expired(self) -> None:
        session = _make_session()
        with patch(_REPO_PATCH) as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.delete_expired_nodes = AsyncMock(return_value=0)

            count = await expire_stale_graph_nodes(session)

        assert count == 0

    async def test_does_not_commit_session(self) -> None:
        """Caller (MemoryWorker) is responsible for commit, not the job function."""
        session = _make_session()
        with patch(_REPO_PATCH) as MockRepo:
            mock_repo = MockRepo.return_value
            mock_repo.delete_expired_nodes = AsyncMock(return_value=3)

            await expire_stale_graph_nodes(session)

        session.commit.assert_not_called()
