---
phase: quick-9
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/pilot_space/application/services/note/markdown_chunker.py
  - backend/src/pilot_space/application/services/note/contextual_enrichment.py
  - backend/src/pilot_space/infrastructure/queue/handlers/kg_populate_handler.py
  - backend/src/pilot_space/ai/workers/memory_worker.py
  - backend/src/pilot_space/main.py
  - backend/tests/unit/services/test_markdown_chunker.py
  - backend/tests/unit/services/test_contextual_enrichment.py
autonomous: true
requirements: [CHUNK-01, CHUNK-02, CHUNK-03]

must_haves:
  truths:
    - "Fenced code blocks with internal blank lines are never split mid-block"
    - "Markdown tables are never split mid-row"
    - "Chunks can be enriched with LLM-generated context summaries before embedding"
    - "Contextual enrichment fails gracefully — chunks still created without enrichment"
    - "Content cap of 2000 chars per node is respected including any context prefix"
  artifacts:
    - path: "backend/src/pilot_space/application/services/note/markdown_chunker.py"
      provides: "Code block and table preservation in _sub_chunk_by_paragraphs"
      contains: "_merge_atomic_blocks"
    - path: "backend/src/pilot_space/application/services/note/contextual_enrichment.py"
      provides: "LLM-based chunk context generation"
      exports: ["enrich_chunks_with_context"]
    - path: "backend/tests/unit/services/test_markdown_chunker.py"
      provides: "Tests for code block and table preservation"
      contains: "TestCodeBlockPreservation"
    - path: "backend/tests/unit/services/test_contextual_enrichment.py"
      provides: "Tests for contextual enrichment"
      contains: "TestEnrichChunksWithContext"
  key_links:
    - from: "backend/src/pilot_space/application/services/note/markdown_chunker.py"
      to: "_sub_chunk_by_paragraphs"
      via: "_merge_atomic_blocks before paragraph iteration"
      pattern: "_merge_atomic_blocks"
    - from: "backend/src/pilot_space/infrastructure/queue/handlers/kg_populate_handler.py"
      to: "backend/src/pilot_space/application/services/note/contextual_enrichment.py"
      via: "enrich_chunks_with_context call after chunking"
      pattern: "enrich_chunks_with_context"
    - from: "backend/src/pilot_space/ai/workers/memory_worker.py"
      to: "backend/src/pilot_space/infrastructure/queue/handlers/kg_populate_handler.py"
      via: "anthropic_api_key passed through worker to handler"
      pattern: "anthropic_api_key"
---

<objective>
Enhance the markdown chunker with code block preservation, table preservation, and contextual retrieval enrichment.

Purpose: Prevent chunks from being split inside fenced code blocks or markdown tables (corrupting content), and enable LLM-generated context summaries per chunk for better retrieval quality.

Output: Updated chunker with atomic block detection, new contextual enrichment module, wired into the KG populate pipeline.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@backend/src/pilot_space/application/services/note/markdown_chunker.py
@backend/src/pilot_space/infrastructure/queue/handlers/kg_populate_handler.py
@backend/src/pilot_space/ai/workers/memory_worker.py
@backend/src/pilot_space/main.py
@backend/tests/unit/services/test_markdown_chunker.py
@backend/src/pilot_space/application/services/memory/graph_extraction_service.py

<interfaces>
<!-- From markdown_chunker.py — core function to modify -->
```python
def _sub_chunk_by_paragraphs(
    content: str,
    max_chars: int,
    overlap_chars: int,
) -> list[str]:
```

<!-- From markdown_chunker.py — chunk dataclass -->
```python
@dataclass(frozen=True, slots=True)
class MarkdownChunk:
    heading: str
    heading_level: int
    content: str
    chunk_index: int
    heading_hierarchy: list[str] = field(default_factory=list)
    token_count: int = 0
```

<!-- From kg_populate_handler.py — handler constructor -->
```python
class KgPopulateHandler:
    def __init__(
        self,
        session: AsyncSession,
        embedding_service: EmbeddingService,
        queue: SupabaseQueueClient | None,
    ) -> None:
```

<!-- From memory_worker.py — worker constructor -->
```python
class MemoryWorker:
    def __init__(
        self,
        queue: SupabaseQueueClient,
        session_factory: async_sessionmaker[AsyncSession],
        google_api_key: str | None = None,
        openai_api_key: str | None = None,
        ollama_base_url: str = "http://localhost:11434",
    ) -> None:
```

<!-- From memory_worker.py — KG dispatch (line 253-258) -->
```python
if task_type == TASK_KG_POPULATE:
    from pilot_space.infrastructure.queue.handlers.kg_populate_handler import (
        KgPopulateHandler,
    )
    handler = KgPopulateHandler(session, self._embedding_service, self.queue)
    return await handler.handle(payload)
```

<!-- From main.py — worker construction (lines 178-184) -->
```python
_google_secret = getattr(settings, "google_api_key", None)
_google_api_key: str | None = _google_secret.get_secret_value() if _google_secret else None
memory_worker = MemoryWorker(
    queue=queue_client,
    session_factory=session_factory,
    google_api_key=_google_api_key,
)
```

<!-- BYOK pattern from graph_extraction_service.py -->
```python
_EXTRACTION_MODEL = "claude-haiku-4-5-20251001"
# api_key: str | None → None means skip LLM call (BYOK graceful degradation)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Code block and table preservation in _sub_chunk_by_paragraphs</name>
  <files>
    backend/src/pilot_space/application/services/note/markdown_chunker.py
    backend/tests/unit/services/test_markdown_chunker.py
  </files>
  <behavior>
    - Test: Code block with internal blank lines stays atomic — `"```python\ndef foo():\n    pass\n\n\ndef bar():\n    pass\n```"` in a large section is never split across chunks
    - Test: Nested/indented code fences are handled (triple-backtick with language tag)
    - Test: Multiple code blocks in one section each stay atomic
    - Test: Markdown table (`| col | col |` rows) stays atomic — a 10-row table is never split mid-row
    - Test: Table with header separator (`|---|---|`) stays with the table
    - Test: Mixed content (text + code block + text + table + text) splits only at safe boundaries
    - Test: Content with no code blocks or tables behaves identically to current implementation
    - Test: A single code block larger than max_chars is kept as-is (not split)
  </behavior>
  <action>
    Add a `_merge_atomic_blocks(paragraphs: list[str]) -> list[str]` function in `markdown_chunker.py` that post-processes the `content.split("\n\n")` result to merge paragraphs that belong to the same atomic block.

    Algorithm for `_merge_atomic_blocks`:
    1. Iterate through the list of paragraphs produced by splitting on `\n\n`.
    2. Track state: `in_code_fence: bool = False`, `in_table: bool = False`.
    3. For code fences: a paragraph starting with ``` (optionally with language tag) toggles `in_code_fence`. While inside a fence, accumulate paragraphs into the current atomic block (rejoin with `\n\n`). When the closing ``` paragraph is found, close the block.
    4. For tables: a paragraph is a "table line" if it starts with `|` (after stripping whitespace). Consecutive table-line paragraphs are merged into one atomic block. A non-table paragraph breaks the table block.
    5. Return the merged list of paragraphs.

    Call `_merge_atomic_blocks` in `_sub_chunk_by_paragraphs` immediately after `paragraphs = content.split("\n\n")` and before the iteration loop.

    Edge cases:
    - A code fence that is never closed (no closing ```) — treat everything after the opening as part of the block (defensive).
    - A paragraph that contains ``` mid-line (not at start) is NOT a fence delimiter.
    - Detect fence openers: line starts with 3+ backticks (``` or `````), optionally followed by a language identifier.

    Add test class `TestCodeBlockPreservation` and `TestTablePreservation` to the test file with the behaviors listed above.
  </action>
  <verify>
    <automated>cd backend && uv run pytest tests/unit/services/test_markdown_chunker.py -x -v</automated>
  </verify>
  <done>
    - Code blocks with internal `\n\n` are never split across chunks
    - Markdown tables are never split mid-row
    - Existing tests all pass (no regression)
    - New test classes TestCodeBlockPreservation and TestTablePreservation pass
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Contextual enrichment module and KG pipeline wiring</name>
  <files>
    backend/src/pilot_space/application/services/note/contextual_enrichment.py
    backend/src/pilot_space/infrastructure/queue/handlers/kg_populate_handler.py
    backend/src/pilot_space/ai/workers/memory_worker.py
    backend/src/pilot_space/main.py
    backend/tests/unit/services/test_contextual_enrichment.py
  </files>
  <behavior>
    - Test: enrich_chunks_with_context returns chunks with context prefix when LLM succeeds
    - Test: enrich_chunks_with_context returns original chunks unchanged when api_key is None
    - Test: enrich_chunks_with_context returns original chunks unchanged when LLM call fails (graceful degradation)
    - Test: Context prefix + chunk content stays within 2000 char budget (truncates context if needed)
    - Test: Empty chunk list returns empty list
    - Test: Single chunk uses the full document as context for LLM prompt
  </behavior>
  <action>
    **Step 1: Create `contextual_enrichment.py`**

    New file at `backend/src/pilot_space/application/services/note/contextual_enrichment.py`.

    Follow the BYOK pattern from `graph_extraction_service.py`:
    - Accept `api_key: str | None` — if None, return chunks unchanged (no LLM call).
    - Use `anthropic.AsyncAnthropic(api_key=api_key)` directly (same pattern as graph_extraction_service).
    - Model: `claude-haiku-4-5-20251001` (same as `_EXTRACTION_MODEL` — cheapest, fastest for this task).
    - Max tokens per call: 150 (we only need 1-2 sentences per chunk).

    Function signature:
    ```python
    async def enrich_chunks_with_context(
        chunks: list[MarkdownChunk],
        full_document: str,
        api_key: str | None = None,
        content_cap: int = 2000,
    ) -> list[MarkdownChunk]:
    ```

    Implementation:
    1. If `api_key is None` or `not chunks`, return chunks unchanged.
    2. Build a prompt per chunk: "Here is the full document:\n\n{full_document[:4000]}\n\nHere is the chunk:\n\n{chunk.content[:1000]}\n\nProvide a brief 1-2 sentence context that situates this chunk within the full document. Only output the context, nothing else."
    3. Call `anthropic.AsyncAnthropic(api_key=api_key).messages.create(...)` for each chunk. Use `asyncio.gather(*tasks, return_exceptions=True)` for parallel calls.
    4. For each successful response, prepend the context to the chunk content: `f"[Context: {context_text}]\n\n{chunk.content}"`.
    5. If prepended content exceeds `content_cap`, truncate the context to fit.
    6. Return new `MarkdownChunk` instances (frozen dataclass — must create new ones) with enriched content and updated `token_count`.
    7. Wrap all LLM calls in try/except — on ANY failure, log warning and return the original chunk unchanged.
    8. Add a `_CONTEXT_ENRICHMENT_TIMEOUT_S = 15.0` constant. Use `asyncio.wait_for` on the gather call.

    **Step 2: Wire into KgPopulateHandler**

    In `kg_populate_handler.py`:
    1. Add `anthropic_api_key: str | None = None` parameter to `__init__`.
    2. Store as `self._anthropic_api_key`.
    3. In `_handle_note` and `_handle_issue`, after calling `chunk_markdown_by_headings()`, call `enrich_chunks_with_context(chunks, markdown, self._anthropic_api_key)`.
    4. Use the enriched chunks for creating `NodeInput` objects instead of the raw chunks.
    5. Wrap the enrichment call in try/except — on failure, use original chunks (non-fatal).

    **Step 3: Wire into MemoryWorker**

    In `memory_worker.py`:
    1. Add `anthropic_api_key: str | None = None` parameter to `__init__`.
    2. Store as `self._anthropic_api_key`.
    3. In `_dispatch` where `KgPopulateHandler` is constructed, pass it: `KgPopulateHandler(session, self._embedding_service, self.queue, anthropic_api_key=self._anthropic_api_key)`.

    **Step 4: Wire in main.py**

    In `main.py` where `MemoryWorker` is constructed:
    1. Extract `anthropic_api_key` from settings (same pattern as `_google_secret`):
       ```python
       _anthropic_secret = getattr(settings, "anthropic_api_key", None)
       _anthropic_api_key: str | None = _anthropic_secret.get_secret_value() if _anthropic_secret else None
       ```
    2. Pass `anthropic_api_key=_anthropic_api_key` to `MemoryWorker(...)`.

    **Step 5: Write tests**

    Create `backend/tests/unit/services/test_contextual_enrichment.py`:
    - Mock `anthropic.AsyncAnthropic` to avoid real API calls.
    - Test all behaviors listed above.
    - Use `pytest.mark.asyncio` for async tests.
    - Test the content cap truncation: if context + content > 2000 chars, context is trimmed.
  </action>
  <verify>
    <automated>cd backend && uv run pytest tests/unit/services/test_contextual_enrichment.py tests/unit/services/test_markdown_chunker.py -x -v</automated>
  </verify>
  <done>
    - `enrich_chunks_with_context` function exists and handles all BYOK/failure scenarios
    - KgPopulateHandler accepts and uses `anthropic_api_key` for chunk enrichment
    - MemoryWorker passes anthropic_api_key through to KgPopulateHandler
    - main.py extracts anthropic_api_key from settings and passes to MemoryWorker
    - All new tests pass with mocked Anthropic client
    - All existing chunker tests still pass
  </done>
</task>

</tasks>

<verification>
```bash
# All chunker + enrichment tests pass
cd backend && uv run pytest tests/unit/services/test_markdown_chunker.py tests/unit/services/test_contextual_enrichment.py -x -v

# Type checking passes
cd backend && uv run pyright src/pilot_space/application/services/note/markdown_chunker.py src/pilot_space/application/services/note/contextual_enrichment.py src/pilot_space/infrastructure/queue/handlers/kg_populate_handler.py src/pilot_space/ai/workers/memory_worker.py

# Lint passes
cd backend && uv run ruff check src/pilot_space/application/services/note/ src/pilot_space/infrastructure/queue/handlers/kg_populate_handler.py src/pilot_space/ai/workers/memory_worker.py
```
</verification>

<success_criteria>
1. Code blocks containing `\n\n` are never split — verified by TestCodeBlockPreservation tests
2. Markdown tables are never split — verified by TestTablePreservation tests
3. Contextual enrichment adds LLM context when API key is available — verified by TestEnrichChunksWithContext
4. Graceful degradation: no API key or LLM failure produces unchanged chunks — verified by tests
5. Content cap (2000 chars) is respected with context prefix — verified by tests
6. All existing chunker tests pass (no regression)
7. Quality gates pass: pyright + ruff + pytest
</success_criteria>

<output>
After completion, create `.planning/quick/9-enhance-chunker-with-contextual-retrieva/9-SUMMARY.md`
</output>
