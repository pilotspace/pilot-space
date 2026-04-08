"""Phase 70 Wave 0 — RED: summarize_note handler debounce + opt-in toggle.

Contract:

    1. The handler debounces bursts: enqueueing the same note id within
       the debounce window is absorbed to a single run (delayed enqueue
       via pgmq visibility timeout).
    2. When ``workspace_ai_settings.memory_summarizer_enabled=False``
       (the default in migration 107), the producer skips the enqueue
       entirely. Summarization is opt-in.
"""

from __future__ import annotations

import pytest


async def test_delayed_enqueue_deduplicates_bursts() -> None:
    from pilot_space.infrastructure.queue.handlers.summarize_note_handler import (  # noqa: F401
        SummarizeNoteHandler,
    )

    pytest.fail(
        "Wave 3 contract: summarize_note handler debounce not yet implemented"
    )


async def test_opt_in_toggle_off_skips_enqueue() -> None:
    from pilot_space.infrastructure.queue.handlers.summarize_note_handler import (  # noqa: F401
        SummarizeNoteHandler,
    )

    pytest.fail(
        "Wave 3 contract: memory_summarizer_enabled opt-in toggle not yet wired"
    )
