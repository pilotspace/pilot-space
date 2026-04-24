"""Tests for ChatMode -> ProposalPolicy resolution (Phase 89 Plan 03 Task 1)."""

from __future__ import annotations

import pytest

from pilot_space.ai.proposals.mode_gating import (
    ProposalPolicy,
    resolve_proposal_policy,
)
from pilot_space.domain.proposal import ChatMode


@pytest.mark.parametrize("mode", list(ChatMode))
def test_read_tool_kind_bypasses_policy(mode):
    policy = resolve_proposal_policy(mode, tool_kind="read")
    assert policy.allow_creation is False
    assert policy.reject_with_reason is None


def test_act_mode_is_default_permissive():
    policy = resolve_proposal_policy(ChatMode.ACT, tool_kind="mutating")
    assert policy == ProposalPolicy(
        allow_creation=True,
        reject_with_reason=None,
        plan_preview_only=False,
        persist=True,
        accept_disabled=False,
    )


def test_plan_mode_disables_accept_and_marks_preview():
    policy = resolve_proposal_policy(ChatMode.PLAN, tool_kind="mutating")
    assert policy.allow_creation is True
    assert policy.plan_preview_only is True
    assert policy.accept_disabled is True
    assert policy.persist is True
    assert policy.reject_with_reason is None


def test_research_mode_rejects_with_reason():
    policy = resolve_proposal_policy(ChatMode.RESEARCH, tool_kind="mutating")
    assert policy.allow_creation is False
    assert policy.reject_with_reason == "Research mode is read-only"
    assert policy.accept_disabled is True


def test_draft_mode_skips_persistence():
    policy = resolve_proposal_policy(ChatMode.DRAFT, tool_kind="mutating")
    assert policy.allow_creation is True
    assert policy.persist is False
    assert policy.plan_preview_only is False
    assert policy.accept_disabled is False
    assert policy.reject_with_reason is None
