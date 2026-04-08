"""Phase 70 Wave 0 — RED: PR review subagent emits pr_review_finding memory.

Contract:

    1. One pr_review_finding memory payload per review comment (not per
       PR). Each payload carries workspace_id, actor_user_id, repo,
       pr_number, file_path, line_number, and the comment body.
    2. Replaying the same PR review is idempotent — ``uq_graph_nodes_pr_review_finding``
       (migration 107) absorbs the duplicate and the subagent must not
       propagate the UniqueViolation as a job failure.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


async def test_subagent_emits_one_finding_per_review_comment() -> None:
    from pilot_space.ai.agents.subagents.pr_review_agent import PRReviewAgent  # noqa: F401

    with patch(
        "pilot_space.infrastructure.queue.supabase_queue.SupabaseQueueClient.enqueue",
        new_callable=AsyncMock,
    ) as mock_enqueue:
        pytest.fail(
            "Wave 1 contract: PRReviewAgent does not yet enqueue pr_review_finding memories"
        )
        _ = mock_enqueue


async def test_rerun_same_pr_is_idempotent_via_unique_index() -> None:
    from pilot_space.ai.agents.subagents.pr_review_agent import PRReviewAgent  # noqa: F401

    pytest.fail(
        "Wave 1 contract: PRReviewAgent replay dedup via uq_graph_nodes_pr_review_finding "
        "not yet implemented"
    )
