"""Phase 70 Wave 0 — RED: permission handler emits user_correction memory.

Contract: when a user DENIES a tool-use request from the Claude SDK
permission prompt, the handler MUST enqueue a ``user_correction`` memory
payload so the model learns from the refusal. When the workspace has
``memory_producer_user_correction_enabled=false``, the handler MUST
drop the enqueue silently.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


async def test_deny_enqueues_user_correction_payload() -> None:
    from pilot_space.ai.sdk.permission_handler import PermissionHandler  # noqa: F401

    with patch(
        "pilot_space.infrastructure.queue.supabase_queue.SupabaseQueueClient.enqueue",
        new_callable=AsyncMock,
    ) as mock_enqueue:
        pytest.fail(
            "Wave 1 contract: PermissionHandler.deny() does not yet emit user_correction"
        )
        _ = mock_enqueue


async def test_opt_out_flag_off_drops_enqueue() -> None:
    from pilot_space.ai.sdk.permission_handler import PermissionHandler  # noqa: F401

    # With workspace_ai_settings.memory_producer_user_correction_enabled=False
    # the enqueue must not happen.
    pytest.fail(
        "Wave 1 contract: user_correction opt-out toggle not yet wired into PermissionHandler"
    )
