"""Phase 70 Wave 0 — RED: kg_populate handler dedupes agent_turn replays.

Contract: replaying the same ``(workspace_id, session_id, turn_index)``
payload twice MUST result in exactly one ``graph_nodes`` row of type
``agent_turn``, via the ``uq_graph_nodes_agent_turn_cache`` partial
unique index (migration 106). The handler must swallow the unique
violation on retry, not propagate it as a job failure.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

pytestmark = pytest.mark.postgres


async def test_duplicate_turn_hits_unique_index_no_error(postgres_session) -> None:
    from pilot_space.infrastructure.queue.handlers.kg_populate_handler import (  # noqa: F401
        KgPopulateHandler,
    )

    workspace_id = uuid4()
    session_id = uuid4()
    actor_user_id = uuid4()
    payload = {
        "task_type": "kg_populate",
        "memory_type": "agent_turn",
        "workspace_id": str(workspace_id),
        "actor_user_id": str(actor_user_id),
        "session_id": str(session_id),
        "turn_index": 0,
        "user_text": "hi",
        "assistant_text": "hello",
    }

    # Wave 1 will: run the handler twice with `payload`, then assert
    # exactly 1 row in graph_nodes where node_type='agent_turn' and
    # properties->>'session_id' = str(session_id).
    pytest.fail(
        "Wave 1 contract: kg_populate handler does not yet handle memory_type=agent_turn"
    )
