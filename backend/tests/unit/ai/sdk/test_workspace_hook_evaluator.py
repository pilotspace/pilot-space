"""Test scaffold for workspace hook evaluator (Plan 02).

Phase 83 -- placeholder tests for the hook evaluator that will be
implemented in Plan 02. These tests document the expected behavior
contracts for DD-003 defense-in-depth at evaluation time.
"""

from __future__ import annotations

import pytest


class TestWorkspaceHookEvaluator:
    """Evaluator behavior contracts -- implemented in Plan 02."""

    @pytest.mark.asyncio
    async def test_allow_all_hook_cannot_bypass_critical(self) -> None:
        """HOOK-05: allow-all hook on CRITICAL tool -> require_approval.

        Even if an admin creates a wildcard ``action=allow`` rule,
        the evaluator must override it to ``require_approval`` for
        tools classified as ``CRITICAL_REQUIRE_APPROVAL`` in
        ``ACTION_CLASSIFICATIONS``.
        """
        pytest.skip("Implemented in Plan 02")

    @pytest.mark.asyncio
    async def test_deny_hook_blocks_auto_tool(self) -> None:
        """Deny hook on AUTO_EXECUTE tool blocks execution.

        A workspace admin can deny tools that are normally auto-executed.
        The evaluator must respect the deny action regardless of the
        tool's default classification.
        """
        pytest.skip("Implemented in Plan 02")

    @pytest.mark.asyncio
    async def test_first_match_wins_by_priority(self) -> None:
        """Rules evaluated in priority order, first match wins.

        Given two rules with different priorities matching the same
        tool, the rule with the lower priority number (higher precedence)
        should determine the action.
        """
        pytest.skip("Implemented in Plan 02")
