"""ChatMode -> ProposalPolicy resolver (Phase 89 Plan 03, Phase 87 gate).

Single decision point. Every AI tool shim calls
``resolve_proposal_policy(mode, tool_kind="mutating")`` and respects the
returned policy:

* ``allow_creation=False`` -> tool returns an errored stub WITHOUT calling
  the bus. Used by RESEARCH mode.
* ``reject_with_reason`` -> user-facing explanation appended to the errored
  stub so the agent can surface it.
* ``plan_preview_only`` -> proposal is created but the frontend renders it
  as a preview-only badge (no accept/reject UI). PLAN mode.
* ``accept_disabled`` -> proposal exists but Accept button is greyed out.
  PLAN mode pairs with this.
* ``persist`` -> False for DRAFT mode so the bus can skip DB persistence
  (transient proposals the frontend still renders via SSE).

Read tools bypass entirely — they don't mutate and don't need proposals.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from pilot_space.domain.proposal import ChatMode

ToolKind = Literal["mutating", "read"]


@dataclass(frozen=True)
class ProposalPolicy:
    """Flags the AI tool shim passes on to ``ProposalBus.create_proposal``.

    Defaults match ChatMode.ACT — the common case.
    """

    allow_creation: bool = True
    reject_with_reason: str | None = None
    plan_preview_only: bool = False
    persist: bool = True
    accept_disabled: bool = False


_READ_POLICY = ProposalPolicy(
    allow_creation=False,  # reads never create proposals
    reject_with_reason=None,
    plan_preview_only=False,
    persist=True,
    accept_disabled=False,
)


def resolve_proposal_policy(mode: ChatMode, *, tool_kind: ToolKind) -> ProposalPolicy:
    """Return the policy flags a shim should apply for ``(mode, tool_kind)``.

    Read tools: allow_creation=False (policy is not applied — caller should
    short-circuit). Included for symmetry / future-proofing.

    Mutating tools:
      * ACT      -> full flow, all flags default.
      * PLAN     -> create proposal, accept_disabled=True, plan_preview_only=True.
      * RESEARCH -> REJECT (allow_creation=False, reason set).
      * DRAFT    -> create proposal, persist=False (bus must honour the flag).
    """
    if tool_kind == "read":
        return _READ_POLICY

    match mode:
        case ChatMode.ACT:
            return ProposalPolicy()
        case ChatMode.PLAN:
            return ProposalPolicy(
                allow_creation=True,
                reject_with_reason=None,
                plan_preview_only=True,
                persist=True,
                accept_disabled=True,
            )
        case ChatMode.RESEARCH:
            return ProposalPolicy(
                allow_creation=False,
                reject_with_reason="Research mode is read-only",
                plan_preview_only=False,
                persist=True,
                accept_disabled=True,
            )
        case ChatMode.DRAFT:
            return ProposalPolicy(
                allow_creation=True,
                reject_with_reason=None,
                plan_preview_only=False,
                persist=False,
                accept_disabled=False,
            )
    # Defensive fallback — unreachable for current StrEnum.
    return ProposalPolicy()  # pragma: no cover


__all__ = ["ProposalPolicy", "ToolKind", "resolve_proposal_policy"]
