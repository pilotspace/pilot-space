"""Phase 89 Plan 03: create_note_annotation routes through ProposalBus.

Asserts that:

* A valid invocation builds a Proposal with intent_tool="create_note_annotation",
  diff_kind=FIELDS, and intent_args mirroring the kwargs.
* ChatMode.RESEARCH rejects the call WITHOUT touching the bus.
* ChatMode.ACT passes `persist=True, accept_disabled=False, plan_preview_only=False`.
* ChatMode.PLAN passes `accept_disabled=True, plan_preview_only=True`.
* ChatMode.DRAFT passes `persist=False`.
* The tool does NOT perform any direct ORM write (signature check — relies on
  the audit gate for the structural guarantee).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from pilot_space.ai.proposals.tool_shim import override_proposal_bus_factory
from pilot_space.ai.tools.database_tools import create_note_annotation
from pilot_space.ai.tools.mcp_server import ToolContext
from pilot_space.domain.proposal import (
    ArtifactType,
    ChatMode,
    DiffKind,
    ProposalStatus,
)


def _mock_proposal(id_: UUID):
    proposal = MagicMock()
    proposal.id = id_
    proposal.status = ProposalStatus.PENDING
    return proposal


def _mock_session_with_note(note_id: UUID, workspace_id: UUID):
    """Minimal AsyncMock for session.execute(select(Note)) -> scalar_one_or_none."""
    session = MagicMock()

    class _NoteRow:
        def __init__(self):
            self.id = note_id
            self.workspace_id = workspace_id

    exec_result = MagicMock()
    exec_result.scalar_one_or_none = MagicMock(return_value=_NoteRow())
    session.execute = AsyncMock(return_value=exec_result)
    return session


@pytest.fixture
def bus_stub():
    created = MagicMock()
    created.create_proposal = AsyncMock(return_value=_mock_proposal(uuid4()))
    override_proposal_bus_factory(lambda: created)
    yield created
    override_proposal_bus_factory(None)


@pytest.fixture
def note_id():
    return uuid4()


@pytest.fixture
def workspace_id():
    return uuid4()


@pytest.fixture
def ctx(note_id, workspace_id):
    # chat_mode default "act" — ACT policy
    return ToolContext(
        db_session=_mock_session_with_note(note_id, workspace_id),
        workspace_id=str(workspace_id),
        user_id=str(uuid4()),
        session_id=str(uuid4()),
        message_id=str(uuid4()),
        chat_mode="act",
    )


@pytest.mark.asyncio
async def test_create_note_annotation_calls_bus_with_correct_intent(
    ctx, bus_stub, note_id, workspace_id
):
    result = await create_note_annotation(
        note_id=str(note_id),
        ctx=ctx,
        annotation_type="suggestion",
        content="Consider using async here",
        block_id="block-1",
        confidence=0.9,
    )

    assert result["status"] == "pending"
    assert "proposal_id" in result

    bus_stub.create_proposal.assert_awaited_once()
    kwargs = bus_stub.create_proposal.call_args.kwargs
    assert kwargs["intent_tool"] == "create_note_annotation"
    assert kwargs["target_artifact_type"] == ArtifactType.NOTE
    assert kwargs["target_artifact_id"] == note_id
    assert kwargs["diff_kind"] == DiffKind.FIELDS
    assert kwargs["workspace_id"] == workspace_id
    assert kwargs["intent_args"]["annotation_type"] == "suggestion"
    assert kwargs["intent_args"]["content"] == "Consider using async here"
    assert kwargs["intent_args"]["confidence"] == 0.9
    # ACT defaults
    assert kwargs["mode"] == ChatMode.ACT
    assert kwargs["persist"] is True
    assert kwargs["accept_disabled"] is False
    assert kwargs["plan_preview_only"] is False


@pytest.mark.asyncio
async def test_create_note_annotation_research_mode_rejects_without_bus(
    ctx, bus_stub, note_id
):
    ctx.chat_mode = "research"

    result = await create_note_annotation(
        note_id=str(note_id),
        ctx=ctx,
        annotation_type="suggestion",
        content="x",
    )

    assert result["created"] is False
    assert result["proposal_status"] == "errored"
    assert "read-only" in result["reason"].lower()
    bus_stub.create_proposal.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_note_annotation_plan_mode_marks_preview(ctx, bus_stub, note_id):
    ctx.chat_mode = "plan"

    await create_note_annotation(
        note_id=str(note_id),
        ctx=ctx,
        annotation_type="suggestion",
        content="x",
    )

    kwargs = bus_stub.create_proposal.call_args.kwargs
    assert kwargs["mode"] == ChatMode.PLAN
    assert kwargs["accept_disabled"] is True
    assert kwargs["plan_preview_only"] is True


@pytest.mark.asyncio
async def test_create_note_annotation_draft_mode_disables_persist(ctx, bus_stub, note_id):
    ctx.chat_mode = "draft"

    await create_note_annotation(
        note_id=str(note_id),
        ctx=ctx,
        annotation_type="suggestion",
        content="x",
    )

    kwargs = bus_stub.create_proposal.call_args.kwargs
    assert kwargs["mode"] == ChatMode.DRAFT
    assert kwargs["persist"] is False


@pytest.mark.asyncio
async def test_create_note_annotation_rejects_invalid_confidence(ctx, bus_stub, note_id):
    result = await create_note_annotation(
        note_id=str(note_id),
        ctx=ctx,
        annotation_type="suggestion",
        content="x",
        confidence=1.5,
    )
    assert result["created"] is False
    assert "Confidence" in result["error"]
    bus_stub.create_proposal.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_note_annotation_rejects_invalid_type(ctx, bus_stub, note_id):
    result = await create_note_annotation(
        note_id=str(note_id),
        ctx=ctx,
        annotation_type="bogus_type",
        content="x",
    )
    assert result["created"] is False
    assert "Invalid annotation_type" in result["error"]
    bus_stub.create_proposal.assert_not_awaited()
