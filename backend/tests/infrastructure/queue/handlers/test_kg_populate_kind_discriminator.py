"""Phase 70 Wave 0 — RED: kg_populate writes properties.kind discriminator.

Contract: new graph_nodes rows MUST carry a ``kind`` key in
``properties`` to discriminate raw-content nodes from cache-style memory
rows:

    - note_chunk rows          → properties.kind = 'raw'
    - agent_turn memory rows   → properties.kind = 'cache'

Legacy rows without ``kind`` are handled by the recall-path compat
test (test_memory_recall_kind_compat).
"""

from __future__ import annotations

import pytest


async def test_new_note_chunk_has_properties_kind_raw() -> None:
    from pilot_space.infrastructure.queue.handlers.kg_populate_handler import (  # noqa: F401
        KgPopulateHandler,
    )

    pytest.fail(
        "Wave 2 contract: kg_populate handler does not yet stamp properties.kind='raw' "
        "on note_chunk rows"
    )


async def test_memory_type_agent_turn_has_properties_kind_cache() -> None:
    from pilot_space.infrastructure.queue.handlers.kg_populate_handler import (  # noqa: F401
        KgPopulateHandler,
    )

    pytest.fail(
        "Wave 2 contract: kg_populate handler does not yet stamp properties.kind='cache' "
        "on agent_turn rows"
    )
