"""Contextual enrichment for markdown chunks using LLM-generated summaries.

Adds a brief context prefix to each chunk, situating it within the full
document. Improves retrieval quality by giving embedding models richer
per-chunk context (the "Contextual Retrieval" technique).

BYOK pattern: if api_key is None, chunks are returned unchanged without
making any API call. All LLM failures degrade gracefully — original chunks
are preserved on any exception.

Feature 016: Knowledge Graph — contextual retrieval enrichment.
"""

from __future__ import annotations

import asyncio
import logging

import anthropic

from pilot_space.application.services.note.markdown_chunker import (
    MarkdownChunk,
)

__all__ = ["enrich_chunks_with_context"]

logger = logging.getLogger(__name__)


def _estimate_tokens(text: str) -> int:
    """Estimate token count — 1 token ≈ 4 chars for English text."""
    return len(text) // 4


_CONTEXT_MODEL = "claude-haiku-4-5-20251001"
_MAX_CONTEXT_TOKENS = 150
_CONTEXT_ENRICHMENT_TIMEOUT_S = 15.0

_CONTEXT_PROMPT_TEMPLATE = """\
Here is the full document:

{full_document}

Here is the chunk:

{chunk_content}

Provide a brief 1-2 sentence context that situates this chunk within the full \
document. Only output the context, nothing else."""


async def _enrich_single_chunk(
    chunk: MarkdownChunk,
    full_document: str,
    client: anthropic.AsyncAnthropic,
    content_cap: int,
) -> MarkdownChunk:
    """Enrich a single chunk with an LLM-generated context prefix.

    Returns the original chunk unchanged on any LLM failure.
    """
    try:
        prompt = _CONTEXT_PROMPT_TEMPLATE.format(
            full_document=full_document[:4000],
            chunk_content=chunk.content[:1000],
        )
        response = await client.messages.create(
            model=_CONTEXT_MODEL,
            max_tokens=_MAX_CONTEXT_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        first_block = response.content[0]
        context_text = getattr(first_block, "text", "").strip()
        if not context_text:
            return chunk

        prefix = f"[Context: {context_text}]"
        separator = "\n\n"
        combined = f"{prefix}{separator}{chunk.content}"

        # Truncate context prefix if combined exceeds content_cap
        if len(combined) > content_cap:
            # Reserve space for separator and chunk content
            max_prefix_len = content_cap - len(separator) - len(chunk.content)
            if max_prefix_len <= len("[Context: ]"):
                # Not enough room for even a minimal prefix — return original
                return chunk
            truncated_context = context_text[: max_prefix_len - len("[Context: ]")]
            prefix = f"[Context: {truncated_context}]"
            combined = f"{prefix}{separator}{chunk.content}"
            combined = combined[:content_cap]

        return MarkdownChunk(
            heading=chunk.heading,
            heading_level=chunk.heading_level,
            content=combined,
            chunk_index=chunk.chunk_index,
            heading_hierarchy=chunk.heading_hierarchy,
            token_count=_estimate_tokens(combined),
        )

    except Exception:
        logger.warning(
            "contextual_enrichment: LLM call failed for chunk %d — returning original",
            chunk.chunk_index,
            exc_info=True,
        )
        return chunk


async def enrich_chunks_with_context(
    chunks: list[MarkdownChunk],
    full_document: str,
    api_key: str | None = None,
    content_cap: int = 2000,
) -> list[MarkdownChunk]:
    """Enrich chunks with LLM-generated context summaries.

    For each chunk, calls the Anthropic API to generate a 1-2 sentence
    context that situates the chunk within the full document. The context
    is prepended as ``[Context: ...]`` before the chunk content.

    Args:
        chunks:        Chunks to enrich (from chunk_markdown_by_headings).
        full_document: Full raw markdown for context generation.
        api_key:       Anthropic API key. If None, returns chunks unchanged.
        content_cap:   Maximum character length per enriched chunk (including
                       the context prefix). Defaults to 2000.

    Returns:
        List of MarkdownChunk objects. Unchanged if api_key is None, enriched
        with context prefix otherwise. Individual chunks that fail LLM calls
        are returned unchanged (graceful degradation).
    """
    if api_key is None or not chunks:
        return chunks

    client = anthropic.AsyncAnthropic(api_key=api_key)

    tasks = [_enrich_single_chunk(chunk, full_document, client, content_cap) for chunk in chunks]

    try:
        results = await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=True),
            timeout=_CONTEXT_ENRICHMENT_TIMEOUT_S,
        )
    except TimeoutError:
        logger.warning(
            "contextual_enrichment: timed out after %.1fs — returning original chunks",
            _CONTEXT_ENRICHMENT_TIMEOUT_S,
        )
        return chunks

    enriched: list[MarkdownChunk] = []
    for i, result in enumerate(results):
        if isinstance(result, BaseException):
            logger.warning(
                "contextual_enrichment: chunk %d raised exception — returning original: %s",
                i,
                result,
            )
            enriched.append(chunks[i])
        else:
            enriched.append(result)

    return enriched
