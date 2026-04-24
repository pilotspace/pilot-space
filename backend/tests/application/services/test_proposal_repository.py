"""Tests for ProposalRepository — CRUD round-trips for the proposals table.

Repository round-trip tests run against SQLite by default (db_session fixture)
via ``JSONBCompat`` fallback. PG-specific semantics (RLS, pgmq) are not
exercised here — those live in ``tests/migrations/test_111_proposals_round_trip.py``.

Contracts asserted:
    - ``create()`` persists a row with status=PENDING and returns a Proposal
      entity with id / created_at populated.
    - ``get_by_id(missing)`` returns None.
    - ``get_by_id(id)`` returns the Proposal.
    - ``list_by_session()`` returns proposals filtered by session_id, newest first.
    - ``update_status()`` mutates status / applied_version / decided_at / decided_by.
    - Domain entity shape: Proposal is a frozen dataclass with REV-89-01-A fields.
    - Enum coverage: ProposalStatus (5 values), DiffKind (2 values), ChatMode (4).
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from pilot_space.application.services.proposal_repository import ProposalRepository
from pilot_space.domain.proposal import (
    ArtifactType,
    ChatMode,
    DiffKind,
    Proposal,
    ProposalIntentPayload,
    ProposalStatus,
)


class TestDomainEntity:
    def test_proposal_status_enum_values(self) -> None:
        assert ProposalStatus.PENDING.value == "pending"
        assert ProposalStatus.APPLIED.value == "applied"
        assert ProposalStatus.REJECTED.value == "rejected"
        assert ProposalStatus.RETRIED.value == "retried"
        assert ProposalStatus.ERRORED.value == "errored"

    def test_diff_kind_enum_values(self) -> None:
        assert DiffKind.TEXT.value == "text"
        assert DiffKind.FIELDS.value == "fields"

    def test_artifact_type_enum_values(self) -> None:
        assert ArtifactType.NOTE.value == "NOTE"
        assert ArtifactType.ISSUE.value == "ISSUE"
        assert ArtifactType.SPEC.value == "SPEC"
        assert ArtifactType.DECISION.value == "DECISION"

    def test_chat_mode_enum_values(self) -> None:
        assert ChatMode.PLAN.value == "plan"
        assert ChatMode.ACT.value == "act"
        assert ChatMode.RESEARCH.value == "research"
        assert ChatMode.DRAFT.value == "draft"

    def test_proposal_is_frozen(self) -> None:
        p = Proposal(
            id=uuid4(),
            workspace_id=uuid4(),
            session_id=uuid4(),
            message_id=uuid4(),
            target_artifact_type=ArtifactType.ISSUE,
            target_artifact_id=uuid4(),
            intent_tool="update_issue",
            intent_args={"foo": "bar"},
            diff_kind=DiffKind.FIELDS,
            diff_payload={"priority": {"from": "low", "to": "high"}},
            reasoning="because",
            status=ProposalStatus.PENDING,
            applied_version=None,
            decided_at=None,
            decided_by=None,
            created_at=datetime.now(UTC),
            mode=ChatMode.ACT,
            accept_disabled=False,
            persist=True,
            plan_preview_only=False,
        )
        with pytest.raises(FrozenInstanceError):
            p.status = ProposalStatus.APPLIED  # type: ignore[misc]

    def test_intent_payload_is_frozen(self) -> None:
        ip = ProposalIntentPayload(tool="update_issue", args={"a": 1})
        assert ip.tool == "update_issue"
        assert ip.args == {"a": 1}
        with pytest.raises(FrozenInstanceError):
            ip.tool = "x"  # type: ignore[misc]


@pytest.mark.asyncio
class TestRepositoryRoundTrip:
    """Repository CRUD via db_session (SQLite by default)."""

    async def test_create_persists_pending_row(self, db_session: AsyncSession) -> None:
        repo = ProposalRepository(db_session)
        workspace_id = uuid4()
        session_id = uuid4()
        proposal = await repo.create(
            workspace_id=workspace_id,
            session_id=session_id,
            message_id=uuid4(),
            target_artifact_type=ArtifactType.ISSUE,
            target_artifact_id=uuid4(),
            intent_tool="update_issue",
            intent_args={"name": "new"},
            diff_kind=DiffKind.FIELDS,
            diff_payload={"name": {"from": "old", "to": "new"}},
            reasoning="user asked",
            mode=ChatMode.ACT,
        )
        assert proposal.status == ProposalStatus.PENDING
        assert proposal.id is not None
        assert proposal.created_at is not None
        assert proposal.workspace_id == workspace_id
        assert proposal.session_id == session_id
        assert proposal.mode == ChatMode.ACT
        assert proposal.accept_disabled is False
        assert proposal.persist is True
        assert proposal.plan_preview_only is False

    async def test_get_by_id_returns_entity_or_none(
        self, db_session: AsyncSession
    ) -> None:
        repo = ProposalRepository(db_session)
        assert await repo.get_by_id(uuid4()) is None

        proposal = await repo.create(
            workspace_id=uuid4(),
            session_id=uuid4(),
            message_id=uuid4(),
            target_artifact_type=ArtifactType.NOTE,
            target_artifact_id=uuid4(),
            intent_tool="update_note_content",
            intent_args={},
            diff_kind=DiffKind.TEXT,
            diff_payload={"before": "a", "after": "b"},
            reasoning=None,
            mode=ChatMode.ACT,
        )
        got = await repo.get_by_id(proposal.id)
        assert got is not None
        assert got.id == proposal.id
        assert got.target_artifact_type == ArtifactType.NOTE

    async def test_list_by_session_returns_newest_first(
        self, db_session: AsyncSession
    ) -> None:
        repo = ProposalRepository(db_session)
        session_id = uuid4()
        other_session = uuid4()

        p1 = await repo.create(
            workspace_id=uuid4(),
            session_id=session_id,
            message_id=uuid4(),
            target_artifact_type=ArtifactType.ISSUE,
            target_artifact_id=uuid4(),
            intent_tool="update_issue",
            intent_args={},
            diff_kind=DiffKind.FIELDS,
            diff_payload={},
            reasoning=None,
            mode=ChatMode.ACT,
        )
        p2 = await repo.create(
            workspace_id=uuid4(),
            session_id=session_id,
            message_id=uuid4(),
            target_artifact_type=ArtifactType.NOTE,
            target_artifact_id=uuid4(),
            intent_tool="update_note_content",
            intent_args={},
            diff_kind=DiffKind.TEXT,
            diff_payload={},
            reasoning=None,
            mode=ChatMode.ACT,
        )
        # Unrelated proposal in a different session — should not leak.
        await repo.create(
            workspace_id=uuid4(),
            session_id=other_session,
            message_id=uuid4(),
            target_artifact_type=ArtifactType.ISSUE,
            target_artifact_id=uuid4(),
            intent_tool="update_issue",
            intent_args={},
            diff_kind=DiffKind.FIELDS,
            diff_payload={},
            reasoning=None,
            mode=ChatMode.ACT,
        )

        rows = await repo.list_by_session(session_id)
        assert len(rows) == 2
        # Newest first — p2 created after p1.
        assert rows[0].id == p2.id
        assert rows[1].id == p1.id

    async def test_update_status_mutates_and_returns_entity(
        self, db_session: AsyncSession
    ) -> None:
        repo = ProposalRepository(db_session)
        decided_by = uuid4()
        proposal = await repo.create(
            workspace_id=uuid4(),
            session_id=uuid4(),
            message_id=uuid4(),
            target_artifact_type=ArtifactType.ISSUE,
            target_artifact_id=uuid4(),
            intent_tool="update_issue",
            intent_args={},
            diff_kind=DiffKind.FIELDS,
            diff_payload={},
            reasoning=None,
            mode=ChatMode.ACT,
        )
        decided_at = datetime.now(UTC)
        updated = await repo.update_status(
            proposal.id,
            status=ProposalStatus.APPLIED,
            decided_by=decided_by,
            decided_at=decided_at,
            applied_version=5,
        )
        assert updated.status == ProposalStatus.APPLIED
        assert updated.applied_version == 5
        assert updated.decided_by == decided_by
        assert updated.decided_at is not None

        # Round-trip persisted.
        reloaded = await repo.get_by_id(proposal.id)
        assert reloaded is not None
        assert reloaded.status == ProposalStatus.APPLIED
