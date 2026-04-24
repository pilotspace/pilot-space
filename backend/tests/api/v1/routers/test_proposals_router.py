"""Tests for the ``/api/v1/proposals`` router (Phase 89 Plan 02).

Contract:

1. ``POST /{id}/accept`` returns 200 + ProposalEnvelope and calls
   ``bus.accept_proposal(id, decided_by=user_id)``.
2. Domain exceptions (``ProposalNotFoundError`` 404,
   ``ProposalAlreadyDecidedError`` 409) propagate to the global handler
   which emits RFC 7807 ``application/problem+json``.
3. ``POST /{id}/reject`` passes the body reason through.
4. ``POST /{id}/retry`` passes the body hint through.
5. ``GET /?session_id=<uuid>`` returns the list + pending count.
6. All routes use ``""`` / ``"/{id}/accept"`` paths (no trailing slash
   that would cause a 307 redirect).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest
from dependency_injector import providers
from httpx import ASGITransport, AsyncClient

from pilot_space.application.services.proposal_bus import (
    ProposalAlreadyDecidedError,
    ProposalApplyResult,
    ProposalBus,
    ProposalNotFoundError,
)
from pilot_space.application.services.proposal_repository import ProposalRepository
from pilot_space.dependencies.auth import (
    get_current_user,
    get_current_user_id,
    get_session,
)
from pilot_space.dependencies.workspace import (
    get_current_workspace_id,
    require_header_workspace_member,
)
from pilot_space.domain.proposal import (
    ArtifactType,
    ChatMode,
    DiffKind,
    Proposal,
    ProposalStatus,
)

WORKSPACE_ID = UUID("11111111-1111-1111-1111-111111111111")
USER_ID = UUID("22222222-2222-2222-2222-222222222222")


def _make_proposal(**overrides: object) -> Proposal:
    base: dict[str, object] = {
        "id": uuid4(),
        "workspace_id": WORKSPACE_ID,
        "session_id": uuid4(),
        "message_id": uuid4(),
        "target_artifact_type": ArtifactType.ISSUE,
        "target_artifact_id": uuid4(),
        "intent_tool": "update_issue",
        "intent_args": {"title": "new"},
        "diff_kind": DiffKind.FIELDS,
        "diff_payload": {"fields": []},
        "reasoning": "reason",
        "status": ProposalStatus.PENDING,
        "applied_version": None,
        "decided_at": None,
        "decided_by": None,
        "created_at": datetime.now(UTC),
        "mode": ChatMode.ACT,
        "accept_disabled": False,
        "persist": True,
        "plan_preview_only": False,
    }
    base.update(overrides)
    return Proposal(**base)  # type: ignore[arg-type]


@pytest.fixture
def mock_bus() -> MagicMock:
    bus = MagicMock(spec=ProposalBus)
    bus.accept_proposal = AsyncMock()
    bus.reject_proposal = AsyncMock()
    bus.retry_proposal = AsyncMock()
    return bus


@pytest.fixture
def mock_repo() -> MagicMock:
    repo = MagicMock(spec=ProposalRepository)
    repo.list_by_session = AsyncMock()
    return repo


@pytest.fixture
async def client(
    mock_bus: MagicMock, mock_repo: MagicMock
) -> AsyncGenerator[AsyncClient, None]:
    """Test client with DI + auth overrides wired for the proposals router."""
    from pilot_space.container import get_container
    from pilot_space.main import app

    async def _noop_session() -> AsyncGenerator[Any, None]:
        yield MagicMock()

    user_stub = MagicMock()
    user_stub.user_id = USER_ID
    user_stub.sub = str(USER_ID)

    app.dependency_overrides[get_session] = _noop_session
    app.dependency_overrides[get_current_user] = lambda: user_stub
    app.dependency_overrides[get_current_user_id] = lambda: USER_ID
    app.dependency_overrides[require_header_workspace_member] = lambda: WORKSPACE_ID
    app.dependency_overrides[get_current_workspace_id] = lambda: WORKSPACE_ID

    # Override the container bus + repo factories for the request.
    container = get_container()
    # Wire modules explicitly (ASGITransport bypasses the startup lifespan).
    container.wire(modules=list(container.wiring_config.modules))
    container.proposal_bus.override(providers.Object(mock_bus))
    container.proposal_repository.override(providers.Object(mock_repo))

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(
            transport=transport,
            base_url="http://testserver",
            headers={"X-Workspace-Id": str(WORKSPACE_ID)},
        ) as ac:
            yield ac
    finally:
        container.proposal_bus.reset_override()
        container.proposal_repository.reset_override()
        app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Accept
# ---------------------------------------------------------------------------


class TestAccept:
    @pytest.mark.asyncio
    async def test_accept_returns_envelope_and_calls_bus(
        self, client: AsyncClient, mock_bus: MagicMock
    ) -> None:
        applied = _make_proposal(status=ProposalStatus.APPLIED, applied_version=2)
        mock_bus.accept_proposal.return_value = ProposalApplyResult(
            proposal=applied,
            applied_version=2,
            lines_changed=15,
        )

        res = await client.post(f"/api/v1/proposals/{applied.id}/accept")

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["id"] == str(applied.id)
        assert body["status"] == ProposalStatus.APPLIED.value
        assert body["appliedVersion"] == 2
        mock_bus.accept_proposal.assert_awaited_once_with(
            applied.id, decided_by=USER_ID
        )

    @pytest.mark.asyncio
    async def test_accept_not_found_returns_404_rfc7807(
        self, client: AsyncClient, mock_bus: MagicMock
    ) -> None:
        missing_id = uuid4()
        mock_bus.accept_proposal.side_effect = ProposalNotFoundError(
            f"Proposal {missing_id} not found"
        )

        res = await client.post(f"/api/v1/proposals/{missing_id}/accept")

        assert res.status_code == 404
        assert res.headers["content-type"].startswith("application/problem+json")
        body = res.json()
        assert body.get("error_code") == "proposal_not_found"

    @pytest.mark.asyncio
    async def test_accept_already_decided_returns_409_rfc7807(
        self, client: AsyncClient, mock_bus: MagicMock
    ) -> None:
        pid = uuid4()
        mock_bus.accept_proposal.side_effect = ProposalAlreadyDecidedError(
            f"Proposal {pid} already decided"
        )

        res = await client.post(f"/api/v1/proposals/{pid}/accept")

        assert res.status_code == 409
        assert res.headers["content-type"].startswith("application/problem+json")
        body = res.json()
        assert body.get("error_code") == "proposal_already_decided"


# ---------------------------------------------------------------------------
# Reject
# ---------------------------------------------------------------------------


class TestReject:
    @pytest.mark.asyncio
    async def test_reject_passes_reason_through(
        self, client: AsyncClient, mock_bus: MagicMock
    ) -> None:
        rejected = _make_proposal(status=ProposalStatus.REJECTED)
        mock_bus.reject_proposal.return_value = rejected

        res = await client.post(
            f"/api/v1/proposals/{rejected.id}/reject",
            json={"reason": "out of scope"},
        )

        assert res.status_code == 200, res.text
        assert res.json()["status"] == ProposalStatus.REJECTED.value
        mock_bus.reject_proposal.assert_awaited_once_with(
            rejected.id, decided_by=USER_ID, reason="out of scope"
        )

    @pytest.mark.asyncio
    async def test_reject_without_reason(
        self, client: AsyncClient, mock_bus: MagicMock
    ) -> None:
        rejected = _make_proposal(status=ProposalStatus.REJECTED)
        mock_bus.reject_proposal.return_value = rejected

        res = await client.post(
            f"/api/v1/proposals/{rejected.id}/reject", json={}
        )

        assert res.status_code == 200
        mock_bus.reject_proposal.assert_awaited_once_with(
            rejected.id, decided_by=USER_ID, reason=None
        )


# ---------------------------------------------------------------------------
# Retry
# ---------------------------------------------------------------------------


class TestRetry:
    @pytest.mark.asyncio
    async def test_retry_passes_hint_through(
        self, client: AsyncClient, mock_bus: MagicMock
    ) -> None:
        retried = _make_proposal(status=ProposalStatus.RETRIED)
        mock_bus.retry_proposal.return_value = retried

        res = await client.post(
            f"/api/v1/proposals/{retried.id}/retry",
            json={"hint": "smaller scope"},
        )

        assert res.status_code == 200, res.text
        assert res.json()["status"] == ProposalStatus.RETRIED.value
        mock_bus.retry_proposal.assert_awaited_once_with(
            retried.id, decided_by=USER_ID, hint="smaller scope"
        )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


class TestList:
    @pytest.mark.asyncio
    async def test_list_returns_proposals_and_pending_count(
        self, client: AsyncClient, mock_repo: MagicMock
    ) -> None:
        session_id = uuid4()
        pending = _make_proposal(status=ProposalStatus.PENDING, session_id=session_id)
        applied = _make_proposal(
            status=ProposalStatus.APPLIED,
            session_id=session_id,
            applied_version=1,
        )
        mock_repo.list_by_session.return_value = [pending, applied]

        res = await client.get(f"/api/v1/proposals?session_id={session_id}")

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["pendingCount"] == 1
        assert len(body["proposals"]) == 2
        mock_repo.list_by_session.assert_awaited_once_with(session_id)

    @pytest.mark.asyncio
    async def test_list_requires_session_id(
        self, client: AsyncClient
    ) -> None:
        res = await client.get("/api/v1/proposals")
        assert res.status_code == 422  # FastAPI missing-query validation

    @pytest.mark.asyncio
    async def test_list_uses_empty_string_not_slash(
        self, client: AsyncClient, mock_repo: MagicMock
    ) -> None:
        """Route is registered with ``""``, so GET /proposals (no slash) is 200.

        If the route were registered with ``"/"``, FastAPI would 307-redirect
        requests without a trailing slash — see ``feedback_fastapi_routing``
        in MEMORY.
        """
        mock_repo.list_by_session.return_value = []
        res = await client.get(f"/api/v1/proposals?session_id={uuid4()}")
        # Must not be a redirect.
        assert res.status_code != 307
        assert res.status_code == 200
