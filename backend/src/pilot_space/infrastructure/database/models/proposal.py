"""SQLAlchemy model for the ``proposals`` table (Phase 89 Plan 01).

The ``proposals`` table stores AI-generated edit intent envelopes queued for
human review. Unlike most domain tables, this one is append-mostly — rows are
inserted on tool call, then updated once (to decided status). No soft delete,
no updated_at — the lifecycle is status transitions + decided_at.

This is NOT a WorkspaceScopedModel / BaseModel subclass because the schema
(migration 111) intentionally omits ``is_deleted`` / ``updated_at`` /
``deleted_at``. Using Base directly keeps the mapped columns aligned to the
actual table.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from pilot_space.domain.proposal import (
    ArtifactType,
    ChatMode,
    DiffKind,
    Proposal,
    ProposalStatus,
)
from pilot_space.infrastructure.database.base import Base
from pilot_space.infrastructure.database.types import JSONBCompat


class ProposalModel(Base):
    """ORM row for the proposals table."""

    __tablename__ = "proposals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )

    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )

    target_artifact_type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
    )

    target_artifact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )

    intent_tool: Mapped[str] = mapped_column(String(128), nullable=False)

    intent_args: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat,
        nullable=False,
    )

    diff_kind: Mapped[str] = mapped_column(String(16), nullable=False)

    diff_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONBCompat,
        nullable=False,
    )

    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=ProposalStatus.PENDING.value,
        server_default="pending",
    )

    applied_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    decided_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # REV-89-01-A — policy flags captured at proposal creation time
    mode: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=ChatMode.ACT.value,
        server_default="act",
    )

    accept_disabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    persist: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    plan_preview_only: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'applied', 'rejected', 'retried', 'errored')",
            name="ck_proposals_status",
        ),
        CheckConstraint(
            "mode IN ('plan', 'act', 'research', 'draft')",
            name="ck_proposals_mode",
        ),
        Index("idx_proposals_session_status", "session_id", "status"),
        Index(
            "idx_proposals_workspace_target",
            "workspace_id",
            "target_artifact_type",
            "target_artifact_id",
        ),
    )

    def to_entity(self) -> Proposal:
        """Convert ORM row to frozen domain entity."""
        return Proposal(
            id=self.id,
            workspace_id=self.workspace_id,
            session_id=self.session_id,
            message_id=self.message_id,
            target_artifact_type=ArtifactType(self.target_artifact_type),
            target_artifact_id=self.target_artifact_id,
            intent_tool=self.intent_tool,
            intent_args=dict(self.intent_args or {}),
            diff_kind=DiffKind(self.diff_kind),
            diff_payload=dict(self.diff_payload or {}),
            reasoning=self.reasoning,
            status=ProposalStatus(self.status),
            applied_version=self.applied_version,
            decided_at=self.decided_at,
            decided_by=self.decided_by,
            created_at=self.created_at,
            mode=ChatMode(self.mode),
            accept_disabled=self.accept_disabled,
            persist=self.persist,
            plan_preview_only=self.plan_preview_only,
        )

    @classmethod
    def from_entity(cls, proposal: Proposal) -> ProposalModel:
        """Build an ORM row from a domain entity (inverse of ``to_entity``)."""
        return cls(
            id=proposal.id,
            workspace_id=proposal.workspace_id,
            session_id=proposal.session_id,
            message_id=proposal.message_id,
            target_artifact_type=proposal.target_artifact_type.value,
            target_artifact_id=proposal.target_artifact_id,
            intent_tool=proposal.intent_tool,
            intent_args=proposal.intent_args,
            diff_kind=proposal.diff_kind.value,
            diff_payload=proposal.diff_payload,
            reasoning=proposal.reasoning,
            status=proposal.status.value,
            applied_version=proposal.applied_version,
            decided_at=proposal.decided_at,
            decided_by=proposal.decided_by,
            created_at=proposal.created_at,
            mode=proposal.mode.value,
            accept_disabled=proposal.accept_disabled,
            persist=proposal.persist,
            plan_preview_only=proposal.plan_preview_only,
        )

    def __repr__(self) -> str:
        return (
            f"<ProposalModel(id={self.id}, status={self.status}, "
            f"target={self.target_artifact_type}:{self.target_artifact_id})>"
        )


__all__ = ["ProposalModel"]
