"""Phase 70 Wave 0 — RED: memory recall backward-compat for legacy rows.

Contract: the recall path MUST return legacy ``graph_nodes`` rows that
predate the ``properties.kind`` discriminator. They should be treated
as ``kind='raw'`` by default so pre-Phase-70 data keeps flowing into
results.
"""

from __future__ import annotations

import pytest


async def test_legacy_rows_without_kind_still_returned_by_recall() -> None:
    from pilot_space.application.services.memory.memory_recall_service import (  # noqa: F401
        MemoryRecallService,
    )

    pytest.fail(
        "Wave 2 contract: MemoryRecallService does not yet treat missing "
        "properties.kind as 'raw' (legacy compat)"
    )
