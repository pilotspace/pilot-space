"""Phase 70 Wave 0 — RED: workspace_ai_settings producer toggles wiring.

Contract: PATCHing ``workspace_ai_settings`` to set
``memory_producer_agent_turn_enabled=False`` MUST cause the
PilotSpaceAgent producer to drop subsequent agent_turn enqueues for
that workspace. Verifies the toggle is actually read at enqueue time
(not cached indefinitely).
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


async def test_patch_settings_then_producer_drops_when_disabled() -> None:
    from pilot_space.application.services.workspace_ai_settings_service import (  # noqa: F401
        WorkspaceAISettingsService,
    )

    with patch(
        "pilot_space.infrastructure.queue.supabase_queue.SupabaseQueueClient.enqueue",
        new_callable=AsyncMock,
    ) as mock_enqueue:
        pytest.fail(
            "Wave 1 contract: producer does not yet gate on "
            "workspace_ai_settings.memory_producer_agent_turn_enabled"
        )
        _ = mock_enqueue
