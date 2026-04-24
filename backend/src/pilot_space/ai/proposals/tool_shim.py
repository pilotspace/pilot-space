"""Shared helpers for AI tool shims building proposals (Phase 89 Plan 03).

AI tool / MCP-server functions cannot import the container at top-level
without circular-import pain (container -> proposal_bus -> ... -> mcp
servers). This module offers:

* ``get_proposal_bus()`` — lazy container lookup; returns a bound
  ``ProposalBus`` tied to the current request-scoped session. Swappable
  via ``override_proposal_bus_factory`` in tests.
* ``build_proposal_identity(ctx)`` — extracts ``session_id`` /
  ``message_id`` from a ``ToolContext``, falling back to a fresh UUID so
  proposals always have a trace id (even when ToolContext wasn't
  fully populated, e.g. in older CLI paths).
* ``resolve_chat_mode(ctx)`` — maps the ``ToolContext.chat_mode`` string
  to a ``ChatMode`` enum with ``ACT`` as the safe default.

Tool shims call these, then use ``resolve_proposal_policy`` +
``bus.create_proposal`` to hand off to the proposal pipeline.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from pilot_space.domain.proposal import ChatMode

if TYPE_CHECKING:
    from pilot_space.ai.tools.mcp_server import ToolContext
    from pilot_space.application.services.proposal_bus import ProposalBus


# Module-level state held in a single-cell list to avoid the `global`
# statement (ruff PLW0603). Single-slot list is the standard trick.
_bus_factory_override: list[Callable[[], ProposalBus] | None] = [None]


def override_proposal_bus_factory(
    factory: Callable[[], ProposalBus] | None,
) -> None:
    """Test seam — swap the bus resolver (pass ``None`` to restore default)."""
    _bus_factory_override[0] = factory


def get_proposal_bus() -> ProposalBus:
    """Return a ``ProposalBus`` bound to the current request.

    Lazy import of the container avoids the
    ``container -> proposal_bus -> ... -> mcp servers -> tool_shim -> container``
    cycle that would blow up at module load.
    """
    override = _bus_factory_override[0]
    if override is not None:
        return override()

    from pilot_space.container.container import get_container

    container = get_container()
    return container.proposal_bus()  # type: ignore[no-any-return]


def build_proposal_identity(ctx: ToolContext) -> tuple[UUID, UUID]:
    """Return ``(session_id, message_id)`` UUIDs for the proposal row.

    ToolContext may carry them as strings (populated by the agent) or as
    ``None`` (older callers). We coerce strings to UUID and fall back to a
    fresh UUID so the proposals table always gets a non-null trace id.
    The fallback path is exercised by CLI / script tools that bypass the
    chat stream entirely.
    """
    session_id = _as_uuid(ctx.session_id) or uuid4()
    message_id = _as_uuid(ctx.message_id) or session_id
    return session_id, message_id


def resolve_chat_mode(ctx: ToolContext) -> ChatMode:
    """Safely map ``ctx.chat_mode`` string to a ``ChatMode`` enum."""
    try:
        return ChatMode(ctx.chat_mode)
    except (ValueError, KeyError):
        return ChatMode.ACT


def _as_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


__all__ = [
    "build_proposal_identity",
    "get_proposal_bus",
    "override_proposal_bus_factory",
    "resolve_chat_mode",
]
