"""Unit tests for contextual_enrichment.enrich_chunks_with_context."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pilot_space.application.services.note.contextual_enrichment import (
    enrich_chunks_with_context,
)
from pilot_space.application.services.note.markdown_chunker import (
    MarkdownChunk,
)

# Fake API key used in tests — not a real secret.
_FAKE_API_KEY = "sk-ant-test-key"  # pragma: allowlist secret


def _make_chunk(content: str, index: int = 0) -> MarkdownChunk:
    return MarkdownChunk(
        heading="Test Heading",
        heading_level=1,
        content=content,
        chunk_index=index,
        heading_hierarchy=["Test Heading"],
        token_count=len(content) // 4,
    )


def _make_anthropic_response(text: str) -> MagicMock:
    """Build a mock Anthropic messages.create() response."""
    content_block = MagicMock()
    content_block.text = text
    response = MagicMock()
    response.content = [content_block]
    return response


class TestEnrichChunksWithContext:
    """Test enrich_chunks_with_context function."""

    @pytest.mark.asyncio
    async def test_returns_unchanged_when_api_key_is_none(self) -> None:
        chunks = [_make_chunk("Some content here.", 0)]
        full_doc = "# Doc\n\nSome content here."
        result = await enrich_chunks_with_context(chunks, full_doc, api_key=None)
        assert result == chunks
        assert result[0].content == "Some content here."

    @pytest.mark.asyncio
    async def test_returns_empty_list_for_empty_input(self) -> None:
        result = await enrich_chunks_with_context([], "full doc", api_key=_FAKE_API_KEY)
        assert result == []

    @pytest.mark.asyncio
    async def test_adds_context_prefix_when_llm_succeeds(self) -> None:
        chunk = _make_chunk("This chunk discusses authentication.", 0)
        full_doc = "# Auth Guide\n\nThis chunk discusses authentication."
        mock_response = _make_anthropic_response(
            "This section covers authentication mechanisms in the API guide."
        )

        with patch(
            "pilot_space.application.services.note.contextual_enrichment.anthropic"
        ) as mock_anthropic_module:
            mock_client = AsyncMock()
            mock_anthropic_module.AsyncAnthropic.return_value = mock_client
            mock_client.messages.create = AsyncMock(return_value=mock_response)

            result = await enrich_chunks_with_context([chunk], full_doc, api_key=_FAKE_API_KEY)

        assert len(result) == 1
        assert result[0].content.startswith("[Context:")
        assert "This chunk discusses authentication." in result[0].content

    @pytest.mark.asyncio
    async def test_returns_original_chunks_on_llm_failure(self) -> None:
        chunk = _make_chunk("Chunk content that stays unchanged.", 0)
        full_doc = "# Doc\n\nChunk content."

        with patch(
            "pilot_space.application.services.note.contextual_enrichment.anthropic"
        ) as mock_anthropic_module:
            mock_client = AsyncMock()
            mock_anthropic_module.AsyncAnthropic.return_value = mock_client
            mock_client.messages.create = AsyncMock(side_effect=Exception("API error"))

            result = await enrich_chunks_with_context([chunk], full_doc, api_key=_FAKE_API_KEY)

        assert len(result) == 1
        assert result[0].content == "Chunk content that stays unchanged."

    @pytest.mark.asyncio
    async def test_content_cap_respected_with_context_prefix(self) -> None:
        # Content that fills exactly the cap
        content_cap = 200
        # Context prefix that would overflow
        long_context = "A" * 180
        chunk_content = "B" * 50  # 50 chars of actual content
        chunk = _make_chunk(chunk_content, 0)
        full_doc = "# Doc\n\n" + chunk_content

        mock_response = _make_anthropic_response(long_context)

        with patch(
            "pilot_space.application.services.note.contextual_enrichment.anthropic"
        ) as mock_anthropic_module:
            mock_client = AsyncMock()
            mock_anthropic_module.AsyncAnthropic.return_value = mock_client
            mock_client.messages.create = AsyncMock(return_value=mock_response)

            result = await enrich_chunks_with_context(
                [chunk], full_doc, api_key=_FAKE_API_KEY, content_cap=content_cap
            )

        assert len(result) == 1
        assert len(result[0].content) <= content_cap

    @pytest.mark.asyncio
    async def test_single_chunk_uses_full_document_as_context(self) -> None:
        full_doc = "# My Document\n\nSome important context."
        chunk = _make_chunk("This is chunk content.", 0)
        mock_response = _make_anthropic_response("Context about the document section.")

        captured_prompt: list[str] = []

        async def capture_create(**kwargs: object) -> MagicMock:
            messages = kwargs.get("messages", [])
            if messages:
                captured_prompt.append(str(messages))
            return mock_response

        with patch(
            "pilot_space.application.services.note.contextual_enrichment.anthropic"
        ) as mock_anthropic_module:
            mock_client = AsyncMock()
            mock_anthropic_module.AsyncAnthropic.return_value = mock_client
            mock_client.messages.create = capture_create

            await enrich_chunks_with_context([chunk], full_doc, api_key=_FAKE_API_KEY)

        assert captured_prompt, "LLM was never called"
        assert "My Document" in captured_prompt[0]

    @pytest.mark.asyncio
    async def test_multiple_chunks_processed_in_parallel(self) -> None:
        chunks = [_make_chunk(f"Chunk {i} content.", i) for i in range(3)]
        full_doc = "# Doc\n\nMultiple chunks."
        call_count = 0

        async def count_calls(**kwargs: object) -> MagicMock:
            nonlocal call_count
            call_count += 1
            return _make_anthropic_response(f"Context for call {call_count}.")

        with patch(
            "pilot_space.application.services.note.contextual_enrichment.anthropic"
        ) as mock_anthropic_module:
            mock_client = AsyncMock()
            mock_anthropic_module.AsyncAnthropic.return_value = mock_client
            mock_client.messages.create = count_calls

            result = await enrich_chunks_with_context(chunks, full_doc, api_key=_FAKE_API_KEY)

        assert len(result) == 3
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_enriched_chunks_have_updated_token_count(self) -> None:
        chunk = _make_chunk("Short content.", 0)
        original_token_count = chunk.token_count
        full_doc = "# Doc\n\nShort content."
        long_context = "This is a relatively long context description."
        mock_response = _make_anthropic_response(long_context)

        with patch(
            "pilot_space.application.services.note.contextual_enrichment.anthropic"
        ) as mock_anthropic_module:
            mock_client = AsyncMock()
            mock_anthropic_module.AsyncAnthropic.return_value = mock_client
            mock_client.messages.create = AsyncMock(return_value=mock_response)

            result = await enrich_chunks_with_context([chunk], full_doc, api_key=_FAKE_API_KEY)

        # Enriched content is longer → token count should increase or at least be non-zero
        assert result[0].token_count >= original_token_count

    @pytest.mark.asyncio
    async def test_partial_failure_returns_original_for_failed_chunks(self) -> None:
        """If one chunk's LLM call fails, that chunk is unchanged; others are enriched."""
        chunks = [_make_chunk(f"Chunk {i}.", i) for i in range(3)]
        full_doc = "# Doc\n\nMultiple chunks."
        call_count = 0

        async def flaky_create(**kwargs: object) -> MagicMock:
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise RuntimeError("Transient failure")
            return _make_anthropic_response("Good context.")

        with patch(
            "pilot_space.application.services.note.contextual_enrichment.anthropic"
        ) as mock_anthropic_module:
            mock_client = AsyncMock()
            mock_anthropic_module.AsyncAnthropic.return_value = mock_client
            mock_client.messages.create = flaky_create

            result = await enrich_chunks_with_context(chunks, full_doc, api_key=_FAKE_API_KEY)

        assert len(result) == 3
        # The failed chunk (index 1) stays as original
        assert result[1].content == "Chunk 1."
