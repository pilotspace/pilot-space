"""Unit tests for markdown_chunker.chunk_markdown_by_headings."""

from __future__ import annotations

import pytest

from pilot_space.application.services.note.markdown_chunker import (
    MarkdownChunk,
    chunk_markdown_by_headings,
)


class TestEmptyInput:
    def test_empty_string_returns_empty_list(self) -> None:
        assert chunk_markdown_by_headings("") == []

    def test_whitespace_only_returns_empty_list(self) -> None:
        assert chunk_markdown_by_headings("   \n\n  ") == []


class TestNoHeadings:
    def test_plain_text_returns_single_chunk(self) -> None:
        md = "Just a paragraph.\n\nAnd another one."
        chunks = chunk_markdown_by_headings(md)
        assert len(chunks) == 1
        assert chunks[0].heading == ""
        assert chunks[0].heading_level == 0
        assert chunks[0].chunk_index == 0
        assert "Just a paragraph." in chunks[0].content

    def test_single_chunk_index_is_zero(self) -> None:
        chunks = chunk_markdown_by_headings("No headings here.")
        assert chunks[0].chunk_index == 0


class TestHeadingSplitting:
    def test_h1_creates_two_chunks(self) -> None:
        md = "# Title\n\nFirst section content.\n"
        chunks = chunk_markdown_by_headings(md)
        assert len(chunks) == 1
        assert chunks[0].heading == "Title"
        assert chunks[0].heading_level == 1

    def test_h1_then_h2(self) -> None:
        md = "# Introduction\n\nIntro text.\n\n## Details\n\nDetail text.\n"
        chunks = chunk_markdown_by_headings(md)
        assert len(chunks) == 2
        assert chunks[0].heading == "Introduction"
        assert chunks[0].heading_level == 1
        assert chunks[1].heading == "Details"
        assert chunks[1].heading_level == 2

    def test_chunk_indices_are_sequential(self) -> None:
        md = "# A\n\ntext\n\n# B\n\ntext\n\n# C\n\ntext\n"
        chunks = chunk_markdown_by_headings(md)
        assert [c.chunk_index for c in chunks] == [0, 1, 2]

    def test_content_includes_heading_line(self) -> None:
        md = "# My Section\n\nBody text here.\n"
        chunks = chunk_markdown_by_headings(md)
        assert "# My Section" in chunks[0].content
        assert "Body text here." in chunks[0].content

    def test_mixed_levels(self) -> None:
        md = "# Top\n\nIntro.\n\n## Sub\n\nSub content.\n\n### Deep\n\nDeep content.\n"
        chunks = chunk_markdown_by_headings(md)
        assert len(chunks) == 3
        assert chunks[0].heading_level == 1
        assert chunks[1].heading_level == 2
        assert chunks[2].heading_level == 3


class TestPreamble:
    def test_text_before_first_heading_becomes_preamble(self) -> None:
        md = "Intro text before any heading.\n\n# First Section\n\nContent.\n"
        chunks = chunk_markdown_by_headings(md)
        assert len(chunks) == 2
        assert chunks[0].heading == ""
        assert chunks[0].heading_level == 0
        assert "Intro text before any heading." in chunks[0].content
        assert chunks[1].heading == "First Section"

    def test_whitespace_only_preamble_is_skipped(self) -> None:
        md = "\n\n# First\n\nContent.\n"
        chunks = chunk_markdown_by_headings(md)
        # preamble is whitespace-only, skipped
        assert len(chunks) == 1
        assert chunks[0].heading == "First"


class TestCodeFenceProtection:
    def test_heading_inside_code_fence_not_a_boundary(self) -> None:
        md = "# Real Heading\n\n```\n# Not a heading\n## Also not\n```\n\nParagraph.\n"
        chunks = chunk_markdown_by_headings(md)
        # Only the real heading creates a boundary
        assert len(chunks) == 1
        assert chunks[0].heading == "Real Heading"
        assert "# Not a heading" in chunks[0].content

    def test_multiple_real_headings_with_code_fences(self) -> None:
        md = "# Section A\n\n```python\n# comment\n```\n\n# Section B\n\nReal content.\n"
        chunks = chunk_markdown_by_headings(md)
        assert len(chunks) == 2
        assert chunks[0].heading == "Section A"
        assert chunks[1].heading == "Section B"


class TestSmallChunkMerging:
    def test_small_chunk_merged_with_predecessor(self) -> None:
        # "## Tiny\n\nHi.\n" has body "Hi." = 3 chars < 50 → merged
        md = "# Main Section\n\nLots of content here that is definitely long enough.\n\n## Tiny\n\nHi.\n"
        chunks = chunk_markdown_by_headings(md, min_chunk_chars=50)
        assert len(chunks) == 1
        assert chunks[0].heading == "Main Section"
        assert "Hi." in chunks[0].content

    def test_chunk_above_body_threshold_not_merged(self) -> None:
        md = (
            "# Section A\n\nContent for section A.\n\n"
            "# Section B\n\nContent for section B which is long enough.\n"
        )
        # body of each section is > 10 chars → no merging
        chunks = chunk_markdown_by_headings(md, min_chunk_chars=10)
        assert len(chunks) == 2

    def test_no_merging_by_default(self) -> None:
        # Default min_chunk_chars=0 → no merging regardless of body size
        md = "# A\n\nTiny.\n\n# B\n\nAlso tiny.\n"
        chunks = chunk_markdown_by_headings(md)
        assert len(chunks) == 2

    def test_preamble_never_merged_away(self) -> None:
        # Preamble (level=0) is always kept even with aggressive min_chunk_chars
        md = "Intro.\n\n# Section\n\nBody content here that is long enough to stand alone.\n"
        chunks = chunk_markdown_by_headings(md, min_chunk_chars=5)
        assert len(chunks) == 2
        assert chunks[0].heading == ""
        assert chunks[1].heading == "Section"


class TestChunkCap:
    def test_chunks_capped_at_20(self) -> None:
        sections = "\n".join(f"# Section {i}\n\nContent for section {i}.\n" for i in range(25))
        chunks = chunk_markdown_by_headings(sections, min_chunk_chars=1)
        assert len(chunks) == 20

    def test_overflow_merged_into_last_chunk(self) -> None:
        sections = "\n".join(f"# Section {i}\n\nContent {i}.\n" for i in range(22))
        chunks = chunk_markdown_by_headings(sections, min_chunk_chars=1)
        assert len(chunks) == 20
        # Last chunk should contain content from sections 19, 20, 21
        last = chunks[-1].content
        assert "Content 19" in last
        assert "Content 20" in last
        assert "Content 21" in last


class TestReturnType:
    def test_returns_markdown_chunk_instances(self) -> None:
        md = "# Title\n\nBody.\n"
        chunks = chunk_markdown_by_headings(md)
        assert all(isinstance(c, MarkdownChunk) for c in chunks)

    def test_chunks_are_frozen(self) -> None:
        md = "# Title\n\nBody.\n"
        chunk = chunk_markdown_by_headings(md)[0]
        with pytest.raises((AttributeError, TypeError)):
            chunk.heading = "new"  # type: ignore[misc]
