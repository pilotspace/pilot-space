"""Phase 70 Wave 0 — RED: AI memory telemetry admin endpoint.

Contract:

    1. ``GET /api/v1/ai/memory/telemetry`` (admin) returns cache hit
       rate and per-producer counters (agent_turn, user_correction,
       pr_review_finding, summarizer).
    2. Non-admin members get 403.
    3. Route is registered with ``""`` (empty string), NOT ``"/"`` — a
       trailing slash causes 307 redirects that leak the backend port
       through the Next.js proxy (see MEMORY.md / FastAPI routing note).
"""

from __future__ import annotations

import pytest


async def test_admin_get_returns_hit_rate_and_producer_counters() -> None:
    pytest.fail(
        "Wave 4 contract: GET /ai/memory/telemetry endpoint does not yet exist"
    )


async def test_non_admin_gets_403() -> None:
    pytest.fail(
        "Wave 4 contract: /ai/memory/telemetry admin gate not yet enforced"
    )


async def test_root_path_has_no_trailing_slash_no_307() -> None:
    # Route MUST be declared as @router.get("") not @router.get("/"); see
    # backend MEMORY.md FastAPI routing note.
    pytest.fail(
        "Wave 4 contract: /ai/memory/telemetry route not yet registered; "
        "ensure no trailing-slash 307 leak"
    )
