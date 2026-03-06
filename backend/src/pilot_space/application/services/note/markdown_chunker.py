"""Markdown heading-based text chunker for Knowledge Graph ingestion.

Splits a Markdown document into subsections at heading boundaries using the
markdown-it-py AST (token.map line ranges). Each chunk carries its heading
text, level, position, and raw markdown content for embedding.

Feature 016: Knowledge Graph — automated KG population from notes.
"""

from __future__ import annotations

from dataclasses import dataclass

from markdown_it import MarkdownIt

__all__ = ["MarkdownChunk", "chunk_markdown_by_headings"]

_MAX_CHUNKS = 20
_MD = MarkdownIt("commonmark")


@dataclass(frozen=True, slots=True)
class MarkdownChunk:
    """One heading-bounded section of a Markdown document.

    Attributes:
        heading:       Heading text (empty string for preamble before the first heading).
        heading_level: 0 for preamble, 1-6 for h1-h6.
        content:       Full raw Markdown for this section, including the heading line.
        chunk_index:   0-based position within the document.
    """

    heading: str
    heading_level: int
    content: str
    chunk_index: int


def chunk_markdown_by_headings(
    markdown: str,
    *,
    min_chunk_chars: int = 0,
) -> list[MarkdownChunk]:
    """Split a Markdown string into chunks at heading boundaries.

    Uses the markdown-it-py token stream so that headings inside fenced code
    blocks are never treated as section boundaries.

    Args:
        markdown:        Raw Markdown text.
        min_chunk_chars: Chunks whose body (non-heading lines) is shorter than
                         this are merged into the preceding chunk.  Defaults to
                         0 (no merging).  Pass 50 to skip nearly-empty sections.

    Returns:
        Ordered list of MarkdownChunk objects.  Empty list for empty input.
        A document with no headings returns a single chunk with heading="" and
        heading_level=0.
    """
    if not markdown.strip():
        return []

    lines = markdown.splitlines(keepends=True)
    tokens = _MD.parse(markdown)

    # Collect the start line of each *real* heading token (not inside code fences).
    # token.map = [start_line, end_line] in the source.
    boundaries: list[tuple[int, str, int]] = []  # (line_index, heading_text, level)
    for i, token in enumerate(tokens):
        if token.type == "heading_open" and token.map:
            level = int(token.tag[1])  # "h1" -> 1
            # Next token is the inline content of the heading
            inline_token = tokens[i + 1] if i + 1 < len(tokens) else None
            heading_text = inline_token.content if inline_token else ""
            boundaries.append((token.map[0], heading_text, level))

    if not boundaries:
        return [MarkdownChunk(heading="", heading_level=0, content=markdown, chunk_index=0)]

    # Build raw chunks by slicing source lines between boundaries
    raw_chunks: list[tuple[str, str, int]] = []  # (heading, content, level)

    # Preamble: text before the first heading
    first_boundary_line = boundaries[0][0]
    if first_boundary_line > 0:
        preamble = "".join(lines[:first_boundary_line])
        if preamble.strip():
            raw_chunks.append(("", preamble, 0))

    for idx, (start_line, heading_text, level) in enumerate(boundaries):
        end_line = boundaries[idx + 1][0] if idx + 1 < len(boundaries) else len(lines)
        content = "".join(lines[start_line:end_line])
        raw_chunks.append((heading_text, content, level))

    # Merge chunks whose body (non-heading lines) is below the threshold.
    # The preamble (level=0) is never merged away.
    def _body_length(content: str) -> int:
        """Length of content excluding the first heading line."""
        lines = content.splitlines()
        body = "\n".join(line for line in lines if not line.startswith("#")).strip()
        return len(body)

    merged: list[tuple[str, str, int]] = []
    for heading, content, level in raw_chunks:
        if (
            min_chunk_chars > 0
            and merged
            and level != 0
            and _body_length(content) < min_chunk_chars
        ):
            prev_heading, prev_content, prev_level = merged[-1]
            merged[-1] = (prev_heading, prev_content + content, prev_level)
        else:
            merged.append((heading, content, level))

    # Cap at _MAX_CHUNKS: merge all overflow into the last kept chunk
    if len(merged) > _MAX_CHUNKS:
        overflow = merged[_MAX_CHUNKS - 1 :]
        combined_content = "".join(c for _, c, _ in overflow)
        heading, _, level = merged[_MAX_CHUNKS - 1]
        merged = [*merged[: _MAX_CHUNKS - 1], (heading, combined_content, level)]

    return [
        MarkdownChunk(
            heading=heading,
            heading_level=level,
            content=content,
            chunk_index=i,
        )
        for i, (heading, content, level) in enumerate(merged)
    ]
