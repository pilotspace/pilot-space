"""Proposal domain entity — AI-generated edit intent queued for human review.

Phase 89 Plan 01. The Proposal entity is the core envelope the Edit Proposal
pipeline passes end-to-end: AI tool builds a diff + intent -> ProposalBus
persists a Proposal row -> frontend renders a card -> user decides -> bus
executes the stored intent on accept.

This module is intentionally dependency-free (pure stdlib) so the entity is
easy to import from anywhere in the codebase without cycles.

Cross-plan frozen contracts (consumed by Plans 02-06):
    - ``ProposalStatus`` values (pending / applied / rejected / retried / errored)
    - ``DiffKind`` values (text / fields)
    - ``ArtifactType`` values (NOTE / ISSUE / SPEC / DECISION)
    - ``ChatMode`` values (plan / act / research / draft) — REV-89-01-A
    - ``Proposal`` field set — mirrored by Pydantic schemas in Plan 02
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID


class ProposalStatus(StrEnum):
    """Lifecycle state of a proposal."""

    PENDING = "pending"
    APPLIED = "applied"
    REJECTED = "rejected"
    RETRIED = "retried"
    ERRORED = "errored"


class DiffKind(StrEnum):
    """Renderer hint for the diff payload."""

    TEXT = "text"
    FIELDS = "fields"


class ArtifactType(StrEnum):
    """Tier-1 artifact types targeted by proposals."""

    NOTE = "NOTE"
    ISSUE = "ISSUE"
    SPEC = "SPEC"
    DECISION = "DECISION"


class ChatMode(StrEnum):
    """Chat-mode snapshot at proposal creation time (REV-89-01-A).

    Phase 87 introduced the mode concept; Phase 89 persists the mode alongside
    each proposal so the UI knows whether Accept is enabled, whether the
    proposal is preview-only, etc.
    """

    PLAN = "plan"
    ACT = "act"
    RESEARCH = "research"
    DRAFT = "draft"


@dataclass(frozen=True)
class ProposalIntentPayload:
    """The replay-able tool intent a ProposalBus.accept will execute.

    ``tool`` is the AI tool function name (e.g. ``update_issue``);
    ``args`` is the kwargs dict to pass to that tool's executor handler.
    """

    tool: str
    args: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Proposal:
    """Persisted AI edit-intent envelope.

    Mirrors the ``proposals`` table one-to-one. All fields frozen — mutations
    go through the repository / bus, which produce a new entity.
    """

    id: UUID
    workspace_id: UUID
    session_id: UUID
    message_id: UUID
    target_artifact_type: ArtifactType
    target_artifact_id: UUID
    intent_tool: str
    intent_args: dict[str, Any]
    diff_kind: DiffKind
    diff_payload: dict[str, Any]
    reasoning: str | None
    status: ProposalStatus
    applied_version: int | None
    decided_at: datetime | None
    decided_by: UUID | None
    created_at: datetime
    # REV-89-01-A: policy flags frozen at creation time
    mode: ChatMode
    accept_disabled: bool = False
    persist: bool = True
    plan_preview_only: bool = False


__all__ = [
    "ArtifactType",
    "ChatMode",
    "DiffKind",
    "Proposal",
    "ProposalIntentPayload",
    "ProposalStatus",
]
