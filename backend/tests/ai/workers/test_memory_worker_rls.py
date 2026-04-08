"""Phase 70 Wave 0 — RED: MemoryWorker RLS isolation (real PostgreSQL).

Pins the contract that:

    1. ``MemoryWorker._process`` MUST restore RLS context from the job
       payload's ``workspace_id`` + ``actor_user_id`` before touching any
       workspace-scoped table, so rows written for workspace A are
       invisible from a workspace-B-scoped session.
    2. Payloads missing ``actor_user_id`` fail closed (exception, NOT a
       bypass) — the job is dead-lettered rather than processed with the
       calling (worker) identity.
    3. Graph-expiration / artifact-cleanup tasks on the RLS-bypass
       allowlist skip RLS context setup entirely (these are tenant-wide
       maintenance jobs; see ``memory_worker._RLS_BYPASS_TASKS``).

All three tests are currently RED: the allowlist symbol does not exist
yet, and the worker has no RLS-context restoration path.
"""

from __future__ import annotations

from uuid import uuid4

import pytest

pytestmark = pytest.mark.postgres


async def test_worker_sets_rls_context_workspace_a_cannot_read_workspace_b(postgres_session) -> None:
    from pilot_space.ai.workers.memory_worker import MemoryWorker  # noqa: F401

    workspace_a = uuid4()
    workspace_b = uuid4()
    actor_a = uuid4()

    # Wave 1 will: seed both workspaces, run MemoryWorker._process with a
    # kg_populate job scoped to workspace_a, then open a workspace_b-RLS
    # session and assert the A node is invisible.
    pytest.fail(
        "Wave 1 contract: MemoryWorker must set RLS context from payload "
        "workspace_id before _process — not yet implemented"
    )


async def test_missing_actor_user_id_fails_closed(postgres_session) -> None:
    from pilot_space.ai.workers.memory_worker import MemoryWorker  # noqa: F401

    payload = {"task_type": "kg_populate", "workspace_id": str(uuid4())}
    # No actor_user_id → worker must raise / dead-letter, not silently
    # process with the worker's ambient (superuser-ish) identity.
    pytest.fail(
        "Wave 1 contract: MemoryWorker must reject AI_NORMAL payloads "
        "lacking actor_user_id — currently no guard exists"
    )


async def test_graph_expiration_bypass_allowlist_skips_rls(postgres_session) -> None:
    from pilot_space.ai.workers.memory_worker import (  # noqa: F401
        _RLS_BYPASS_TASKS,
        MemoryWorker,
    )

    # Expected: TASK_GRAPH_EXPIRATION and TASK_ARTIFACT_CLEANUP appear in
    # _RLS_BYPASS_TASKS so the worker skips set_rls_context() for them.
    pytest.fail(
        "Wave 1 contract: _RLS_BYPASS_TASKS allowlist not yet defined in memory_worker"
    )
