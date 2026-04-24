"""ProposalRepository — CRUD for the ``proposals`` table (Phase 89 Plan 01).

The repository is request-scoped (bound to the current AsyncSession via the
DI Factory) and converts freely between ``ProposalModel`` (ORM) and
``Proposal`` (frozen domain entity). Writes use ``session.flush()`` only —
the caller (typically a ProposalBus method or a FastAPI dependency) owns the
outer transaction boundary.

Cross-plan contract: this is the only module Plan 02 (router) and Plan 03
(intent executor) should import to persist / read proposals. Do NOT query the
ProposalModel directly from service / router code.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from pilot_space.domain.proposal import (
    ArtifactType,
    ChatMode,
    DiffKind,
    Proposal,
    ProposalStatus,
)
from pilot_space.infrastructure.database.models.proposal import ProposalModel


class ProposalRepository:
    """Async CRUD repository for proposals.

    Methods return ``Proposal`` domain entities, never ORM rows — so callers
    cannot accidentally mutate persisted state outside the repository surface.
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        *,
        workspace_id: UUID,
        session_id: UUID,
        message_id: UUID,
        target_artifact_type: ArtifactType,
        target_artifact_id: UUID,
        intent_tool: str,
        intent_args: dict[str, Any],
        diff_kind: DiffKind,
        diff_payload: dict[str, Any],
        reasoning: str | None,
        mode: ChatMode,
        accept_disabled: bool = False,
        persist: bool = True,
        plan_preview_only: bool = False,
    ) -> Proposal:
        """Insert a new proposal with status=PENDING and return the entity."""
        now = datetime.now(UTC)
        row = ProposalModel(
            id=uuid4(),
            workspace_id=workspace_id,
            session_id=session_id,
            message_id=message_id,
            target_artifact_type=target_artifact_type.value,
            target_artifact_id=target_artifact_id,
            intent_tool=intent_tool,
            intent_args=intent_args,
            diff_kind=diff_kind.value,
            diff_payload=diff_payload,
            reasoning=reasoning,
            status=ProposalStatus.PENDING.value,
            applied_version=None,
            decided_at=None,
            decided_by=None,
            created_at=now,
            mode=mode.value,
            accept_disabled=accept_disabled,
            persist=persist,
            plan_preview_only=plan_preview_only,
        )
        self._session.add(row)
        await self._session.flush()
        await self._session.refresh(row)
        return row.to_entity()

    async def get_by_id(self, proposal_id: UUID) -> Proposal | None:
        """Return the proposal by id, or ``None`` if not found."""
        stmt = select(ProposalModel).where(ProposalModel.id == proposal_id)
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        return row.to_entity() if row is not None else None

    async def list_by_session(self, session_id: UUID) -> list[Proposal]:
        """Return proposals for a chat session, newest first."""
        stmt = (
            select(ProposalModel)
            .where(ProposalModel.session_id == session_id)
            .order_by(desc(ProposalModel.created_at))
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [r.to_entity() for r in rows]

    async def update_status(
        self,
        proposal_id: UUID,
        *,
        status: ProposalStatus,
        decided_by: UUID | None,
        decided_at: datetime,
        applied_version: int | None = None,
    ) -> Proposal:
        """Transition a proposal to a terminal status, return updated entity.

        Raises ``ValueError`` if the proposal does not exist — callers (the
        bus) should pre-check and raise ``ProposalNotFoundError`` to produce
        a 404 response.
        """
        stmt = select(ProposalModel).where(ProposalModel.id == proposal_id)
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        if row is None:
            msg = f"Proposal {proposal_id} not found"
            raise ValueError(msg)
        row.status = status.value
        row.decided_by = decided_by
        row.decided_at = decided_at
        row.applied_version = applied_version
        await self._session.flush()
        await self._session.refresh(row)
        return row.to_entity()


__all__ = ["ProposalRepository"]
