"""Phase 70 Wave 0 — RED: PilotSpaceAgent emits agent_turn memory payloads.

Contract: on each completed ``_stream_impl`` turn, the orchestrator MUST
enqueue exactly one ``QueueName.AI_NORMAL`` job with:

    {
      "task_type": "kg_populate",
      "memory_type": "agent_turn",
      "workspace_id": <uuid>,
      "actor_user_id": <uuid>,
      "session_id": <uuid>,
      "turn_index": <int>,
      "user_text": <str>,
      "assistant_text": <str>,
    }

This is what feeds the agent_turn_cache partial unique index (migration
106) and the Wave 2 recall path. Currently no such enqueue exists.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


async def test_stream_completed_enqueues_agent_turn_payload() -> None:
    from pilot_space.ai.agents.pilotspace_agent import PilotSpaceAgent  # noqa: F401

    with patch(
        "pilot_space.infrastructure.queue.supabase_queue.SupabaseQueueClient.enqueue",
        new_callable=AsyncMock,
    ) as mock_enqueue:
        # Wave 1 will: instantiate PilotSpaceAgent, run _stream_impl to
        # completion against a mocked provider, then assert mock_enqueue
        # was called exactly once with the agent_turn payload shape.
        pytest.fail(
            "Wave 1 contract: PilotSpaceAgent does not yet enqueue agent_turn "
            "memory payloads on stream completion"
        )
        _ = mock_enqueue
