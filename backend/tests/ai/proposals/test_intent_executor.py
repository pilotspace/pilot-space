"""Tests for the intent registry + dispatcher (Phase 89 Plan 03 Task 1)."""

from __future__ import annotations

from uuid import uuid4

import pytest

from pilot_space.ai.proposals.intent_executor import (
    _REGISTRY,
    IntentExecutor,
    IntentNotRegisteredError,
    register_intent,
)
from pilot_space.application.services.proposal_bus import IntentExecutionOutcome
from pilot_space.domain.proposal import ArtifactType


@pytest.fixture(autouse=True)
def _preserve_registry():
    """Snapshot the registry so tests adding fake handlers don't pollute."""
    snapshot = dict(_REGISTRY)
    yield
    _REGISTRY.clear()
    _REGISTRY.update(snapshot)


@pytest.mark.asyncio
async def test_executor_dispatches_to_registered_handler():
    captured: dict[str, object] = {}

    @register_intent("__test_tool_dispatches")
    async def _handler(args, *, workspace_id, target_artifact_id):
        captured["args"] = args
        captured["workspace_id"] = workspace_id
        captured["target_artifact_id"] = target_artifact_id
        return IntentExecutionOutcome(applied_version=7, lines_changed=3)

    workspace_id = uuid4()
    target_id = uuid4()

    outcome = await IntentExecutor().execute(
        intent_tool="__test_tool_dispatches",
        intent_args={"foo": "bar"},
        workspace_id=workspace_id,
        target_artifact_type=ArtifactType.ISSUE,
        target_artifact_id=target_id,
    )

    assert outcome.applied_version == 7
    assert outcome.lines_changed == 3
    assert captured == {
        "args": {"foo": "bar"},
        "workspace_id": workspace_id,
        "target_artifact_id": target_id,
    }


@pytest.mark.asyncio
async def test_executor_raises_for_unknown_tool():
    with pytest.raises(IntentNotRegisteredError) as exc_info:
        await IntentExecutor().execute(
            intent_tool="__nonexistent_tool__",
            intent_args={},
            workspace_id=uuid4(),
            target_artifact_type=ArtifactType.ISSUE,
            target_artifact_id=uuid4(),
        )
    assert exc_info.value.error_code == "intent_not_registered"
    assert exc_info.value.http_status == 500


def test_double_registration_is_rejected():
    @register_intent("__test_tool_double")
    async def _first(args, *, workspace_id, target_artifact_id):
        return IntentExecutionOutcome(applied_version=1)

    with pytest.raises(RuntimeError, match="Intent already registered"):

        @register_intent("__test_tool_double")
        async def _second(args, *, workspace_id, target_artifact_id):
            return IntentExecutionOutcome(applied_version=1)


def test_registry_populated_after_package_import():
    import pilot_space.ai.proposals  # noqa: F401 — side-effect import

    # The four real handlers registered by intent_handlers/{note,issue}:
    assert "create_issue" in _REGISTRY
    assert "update_issue" in _REGISTRY
    assert "create_note" in _REGISTRY
    assert "create_note_annotation" in _REGISTRY
