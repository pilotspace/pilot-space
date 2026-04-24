"""Edit Proposal intent-execution subsystem (Phase 89 Plan 03).

This package owns the mutation-side of the Edit Proposal pipeline:

* ``intent_executor`` — registry + dispatcher. One ``IntentExecutor`` instance
  is wired into ``ProposalBus`` via DI; on ``accept_proposal`` it looks up the
  handler by ``intent_tool`` name and calls it.
* ``intent_handlers/`` — the ONLY module where AI mutations are allowed to
  execute. The audit gate in ``tests/ai/test_no_unsupervised_writes.py``
  allow-lists this exact path; everywhere else in ``pilot_space.ai`` is
  forbidden from calling ``session.commit()`` / ``repo.create()`` / etc.
* ``diff_builders`` — shared helpers that turn ``(before, after)`` into the
  ``diff_payload`` shape the Plan 04 frontend renders.
* ``mode_gating`` — single decision point that maps ``ChatMode`` to a
  ``ProposalPolicy`` (accept_disabled / persist / plan_preview_only /
  reject_with_reason). Every AI tool shim calls
  ``resolve_proposal_policy(mode, tool_kind="mutating")``.

Import ``IntentExecutor`` from this package; it auto-imports every handler
module so their ``@register_intent`` decorators run at least once.
"""

from __future__ import annotations

from pilot_space.ai.proposals.diff_builders import (
    build_fields_diff,
    build_text_diff,
)
from pilot_space.ai.proposals.intent_executor import (
    IntentExecutor,
    IntentNotRegisteredError,
    register_intent,
)
from pilot_space.ai.proposals.mode_gating import (
    ProposalPolicy,
    resolve_proposal_policy,
)


def _ensure_handlers_imported() -> None:
    """Force-import handler modules so ``@register_intent`` decorators run.

    The registry is populated as a side-effect of importing the handler
    modules. This function is called at package import time so a caller
    merely doing ``from pilot_space.ai.proposals import IntentExecutor`` is
    guaranteed a populated registry.
    """

    from pilot_space.ai.proposals.intent_handlers import (
        decision,
        issue,
        note,
        spec,
    )

    # Reference the imports so pyright doesn't mark them unused.
    _ = (decision, issue, note, spec)


_ensure_handlers_imported()


__all__ = [
    "IntentExecutor",
    "IntentNotRegisteredError",
    "ProposalPolicy",
    "build_fields_diff",
    "build_text_diff",
    "register_intent",
    "resolve_proposal_policy",
]
