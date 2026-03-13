# RAG Test Coverage Audit Report

Generated: 2026-03-13

## Summary

- **Total modules**: 7
- **Total existing tests**: 97 (collected across 6 test files; no dedicated test file for `_graph_helpers.py`)
- **Overall coverage**: 71% statements / ~70% branches (weighted across all 7 modules)
- **Coverage threshold**: 80% (fail_under in pyproject.toml) — **FAILING**
- **Modules at/above 80%**: 3 of 7 (`markdown_chunker` 100%, `kg_populate_handler` 94%, `graph_search_service` 93%)
- **Modules below 80%**: 4 of 7 (`embedding_service` 73%, `_graph_helpers` 61%, `memory_embedding_handler` 56%, `knowledge_graph_repository` 55%)

### Coverage Measurement Note

`pytest --cov` with `numpy >= 2.x` triggers "cannot load module more than once per process" on macOS when coverage's C-tracer intercepts numpy's C extension init. Workaround: `PYTHONPATH=/tmp` with a `sitecustomize.py` that pre-imports numpy and pgvector before coverage starts. This workaround is required for any CI that runs these tests with `--cov`.

## Per-Module Coverage

| Module | Stmts | Miss | Branch | BrPart | Cover % | Missing Lines |
|--------|-------|------|--------|--------|---------|---------------|
| `embedding_service.py` | 59 | 18 | 8 | 0 | **73%** | 92-110, 137-150 |
| `kg_populate_handler.py` | 166 | 5 | 40 | 8 | **94%** | 162→167, 244→285, 270→285, 343→348, 374, 408→413, 438, 467, 477-478 |
| `graph_search_service.py` | 73 | 5 | 14 | 1 | **93%** | 185-186, 211-213 |
| `memory_embedding_handler.py` | 89 | 37 | 22 | 0 | **56%** | 51-65, 102-135, 204-211, 247-252 |
| `markdown_chunker.py` | 52 | 0 | 20 | 0 | **100%** | — |
| `knowledge_graph_repository.py` | 263 | 110 | 100 | 12 | **55%** | 69-72, 91-98, 101-113, 123, 159, 170, 204, 218, 234, 257-258, 289-331, 355, 380, 405, 484, 488-591, 602-615, 638-644, 650-660, 679-689 |
| `_graph_helpers.py` | 125 | 39 | 32 | 6 | **61%** | 54, 66, 92-103, 148, 191, 229-308, 356, 384-389 |
| **TOTAL** | **827** | **214** | **236** | **27** | **71%** | |

---

## Gap Analysis

### Critical Gaps

These are core pipeline paths that the tests never exercise. A silent regression here would not be caught.

#### C-1: `_embed_openai` method body (embedding_service.py:92-110)

**What it does**: The entire OpenAI embedding call — `asyncio.wait_for` around `openai.embeddings.create`, TimeoutError handler, and generic Exception handler.

**Why critical**: This is the PRIMARY embedding path for graph nodes. The 9 existing tests mock `_embed_openai` at the method level, so the actual OpenAI call, timeout guard, and error handling have 0% coverage. A regression in the timeout logic (e.g., wrong parameter order, swapped exception types) would be invisible.

**Missing tests to add** (in `test_embedding_service.py`, ~4 tests):
- OpenAI call returns success → embedding extracted correctly (`response.data[0].embedding`)
- `TimeoutError` raised → returns `None` (line 103-105)
- Generic `Exception` raised → returns `None`, logs warning (line 106-110)
- `asyncio.wait_for` timeout parameter matches `_OPENAI_WAIT_FOR_S` constant

#### C-2: `_ollama_embed_sync` function body (embedding_service.py:137-150)

**What it does**: The synchronous Ollama urllib call — JSON serialization, HTTP POST to `/api/embed`, response parsing, empty embeddings guard.

**Why critical**: This is the FALLBACK embedding path. If OpenAI is unavailable, the entire embedding pipeline depends on this function. The `embeddings` key extraction (`body.get("embeddings")`) and the `list(embeddings[0]) if embeddings else None` guard are untested.

**Missing tests to add** (in `test_embedding_service.py`, ~3 tests):
- Successful HTTP response with valid embeddings → returns 768-dim list
- Response with missing/empty `embeddings` key → returns `None`
- `urllib.request.urlopen` raises (network error) → `_embed_ollama` catches and returns `None`

#### C-3: `hybrid_search_pg` function (\_graph_helpers.py:229-308)

**What it does**: The PostgreSQL-specific hybrid search combining pgvector cosine similarity with `ts_rank` full-text search. This is the production search path — `keyword_search` (SQLite LIKE) is test-only fallback.

**Why critical**: All hybrid search tests run against SQLite, meaning the actual production code path has 0% coverage. The SQL CTE, score fusion formula, `node_types` ANY filter injection, `since` parameter binding, and the post-query model hydration loop are all untested.

**Missing tests to add** (in a new `test_graph_helpers_pg.py` or integration test file, ~5 tests, requires PostgreSQL):
- Hybrid search with embedding returns scored nodes
- `node_types` filter applied correctly via ANY()
- `since` temporal filter excludes stale nodes
- Empty result set (no matching nodes) → returns `[]`
- Node missing from model_map (race condition) → skipped silently (line 289)

#### C-4: `_bulk_upsert_pg` method (knowledge_graph_repository.py:488-591)

**What it does**: PostgreSQL-specific batch upsert — batch SELECT to find existing keyed nodes, batch content-hash dedup, same-batch hash collision dedup, single flush for all changes.

**Why critical**: This is used in production for all KG population jobs. The SQLite fallback (serial upsert) has correct tests but `_bulk_upsert_pg` is entirely skipped. The `batch_hash_to_id` dedup logic (line 556-571) has never been exercised — duplicate hashes in the same batch would silently produce wrong results.

**Missing tests to add** (requires PostgreSQL, ~6 tests):
- Batch insert of new nodes with external_id
- Batch update of existing nodes by external_id
- Batch dedup: two nodes with same content_hash → one node created
- Same-batch hash collision: two NodeInputs with same content_hash → first wins
- Mixed keyed/unkeyed/hashed batch
- Empty keyed and empty hashed with only unhashed nodes

---

### High Priority Gaps

These cover error handling and fallback paths that protect against data loss or silent failures.

#### H-1: `upsert_node` IntegrityError recovery (knowledge_graph_repository.py:101-113)

**What it does**: Concurrent insert race condition recovery — if two workers try to insert the same content_hash simultaneously, the second one hits a UNIQUE constraint. The handler rolls back and re-queries to find the winner.

**Missing tests** (requires PostgreSQL for real UNIQUE constraint, ~2 tests):
- IntegrityError with `content_hash` set → rollback, re-query, return existing
- IntegrityError without `content_hash` → re-raise

#### H-2: `upsert_node` content_hash touch path (knowledge_graph_repository.py:91-98)

**What it does**: When a node with matching `content_hash` exists, `_touch_and_return` just updates `updated_at` instead of re-inserting. This is the correct "same content = just refresh" path for unkeyed nodes.

**Missing tests** (~2 tests, SQLite compatible):
- Content-hash matched node: second upsert touches `updated_at`, does not duplicate
- Content-hash matched node: returns same `id` as first upsert

#### H-3: `_touch_and_return` method (knowledge_graph_repository.py:69-72)

**What it does**: Updates `updated_at` and returns the domain object. Currently only called from the content_hash path, which is itself untested.

**Missing tests**: Covered by H-2 above.

#### H-4: `memory_embedding_handler.handle` method body (memory_embedding_handler.py:102-135)

**What it does**: The primary Gemini embedding workflow — fetch content from `memory_entries` or `constitution_rules`, call `_embed_text`, store result. This is the only handler method for legacy memory tables.

**Missing tests** (in `test_memory_embedding_handler.py`, ~5 tests):
- Valid payload for `memory_entries` table → success
- Valid payload for `constitution_rules` table → success
- Missing `entry_id` → returns `{"success": False}`
- Content not found in table → returns `{"success": False}`
- `_embed_text` returns `None` → returns `{"success": False}`

#### H-5: `_embed_text` Gemini function (memory_embedding_handler.py:51-65)

**What it does**: Gemini API call using `google.generativeai`, with generic Exception handler that logs and returns `None`.

**Missing tests** (~3 tests):
- `api_key=None` → returns `None` immediately (line 51-52)
- Successful Gemini call → returns 768-dim list
- Exception from `genai.embed_content` → returns `None`, logs warning

#### H-6: `_fetch_content` method (memory_embedding_handler.py:204-211)

**What it does**: Validates `table` against `_ALLOWED_TABLES` allowlist (injection protection), then SELECTs content from the validated table.

**Missing tests** (~2 tests):
- Unknown table name → returns `None`, logs error (allowlist enforcement)
- Known table, row not found → returns `None`

#### H-7: `upsert_edge` source node not found (knowledge_graph_repository.py:159)

**What it does**: Raises `ValueError` if source node is deleted or missing.

**Missing tests** (~2 tests, SQLite compatible):
- Source node ID doesn't exist → `ValueError` raised
- Target node in different workspace → `ValueError` raised (line 170)

#### H-8: `_store_embedding` unknown table validation (memory_embedding_handler.py:247-252)

**What it does**: Second allowlist check inside `_store_embedding` — raises `ValueError` for unknown tables. This is defense-in-depth after `_fetch_content` already validated.

**Missing tests** (~1 test):
- Invalid table passed directly → `ValueError` raised

---

### Medium Priority Gaps

Edge cases and less-traveled paths that could cause incorrect behavior in non-standard inputs.

#### M-1: `node_model_to_domain` embedding dim mismatch (\_graph_helpers.py:92-103)

**What it does**: Validates that deserialized embeddings have exactly 768 dimensions. If they don't, logs a warning and discards the embedding (returns node without vector).

**Missing tests** (~2 tests in `test_knowledge_graph_repository.py`):
- Node with 1536-dim embedding (old dimension) stored → deserialized with `embedding=None`, warning logged
- Node with correct 768-dim embedding → deserialized correctly

#### M-2: `_get_neighbors_cte` (knowledge_graph_repository.py:274-331)

**What it does**: PostgreSQL recursive CTE traversal. The SQLite BFS path is tested; the production CTE path is not.

**Missing tests** (requires PostgreSQL, ~3 tests):
- Depth-1 neighbors via CTE
- Depth-2 multi-hop via CTE
- Edge type filter applied correctly

#### M-3: `get_node_by_id` and `find_node_by_external_id` (knowledge_graph_repository.py:636-660)

**What it does**: Point lookups by node ID or external ID, respecting `is_deleted=False`.

**Missing tests** (~4 tests, SQLite compatible):
- Existing active node → returns domain object
- Deleted node → returns `None`
- Node in wrong workspace → returns `None`
- Non-existent ID → returns `None`

#### M-4: `get_edges_between` (knowledge_graph_repository.py:679-689)

**What it does**: Fetch all edges where both endpoints are in a given node set. Used by `GraphSearchService._collect_edges`.

**Missing tests** (~2 tests, SQLite compatible):
- Empty `node_ids` → returns `[]`
- Two connected nodes → returns their edge

#### M-5: `_get_embedding` with None embedding service (graph_search_service.py:185-186)

**What it does**: Returns `(None, False)` when no EmbeddingService is configured.

**Missing tests** (~1 test — trivial but currently uncovered):
- Service initialized without `embedding_service` → `_get_embedding` returns `(None, False)`

#### M-6: `_collect_edges` exception handler (graph_search_service.py:211-213)

**What it does**: If `get_edges_between` raises, the exception is caught and `[]` is returned (graceful degradation).

**Missing tests** (~1 test):
- `repo.get_edges_between` raises → result has `edges=[]`, no exception propagated

#### M-7: `_handle_note` with no chunks (kg_populate_handler.py:244→285)

**What it does**: Branch when `chunk_markdown_by_headings` returns empty list — only parent NOTE node created, no chunk nodes or PARENT_OF edges.

**Missing tests** (~1 test):
- Note with no markdown headings → `chunks=0` in response, no chunk node upserts called

#### M-8: Cycle date range variants (kg_populate_handler.py:343→348, 374)

**What it does**: Three mutually exclusive date formatting paths: start+end, start only, neither.

**Missing tests** (~2 tests):
- Cycle with only `start_date` → content contains `[from {date}]`
- Cycle with neither date → no date range in content

#### M-9: `compute_recency_score` with explicit `now` parameter (\_graph_helpers.py:53-54)

**What it does**: The `now=None` default branch (always `datetime.now(UTC)`) vs explicit `now` parameter used in `_merge_user_context`. The explicit-`now` path is tested indirectly but `now=None` path isn't verified independently.

**Missing tests** (~1 test):
- Call with `now=None` → computes age relative to current time correctly

#### M-10: `enrich_edge_density` with empty `scored` list (\_graph_helpers.py:148)

**What it does**: Early return guard `if not scored: return scored`.

**Missing tests** (~1 test):
- Empty `scored` list → returns empty list without DB query

#### M-11: `keyword_search` with `node_types` and `since` filters (\_graph_helpers.py:188-191)

**What it does**: Adds `node_type.in_(...)` and `updated_at >= since` to the LIKE query.

**Missing tests** (~2 tests):
- Keyword search with `node_types` filter
- Keyword search with `since` temporal filter

#### M-12: `find_node_by_content_hash` (\_graph_helpers.py:384-389)

**What it does**: SELECT by `(workspace_id, content_hash)`. Called from `upsert_node` for unkeyed nodes.

**Missing tests**: Covered by H-2 tests above (same code path).

---

### Low Priority Gaps

Defensive code and logging paths unlikely to affect correctness.

#### L-1: `update_node_helper` embedding update branch (\_graph_helpers.py:356)

**What it does**: `if node.embedding is not None: model.embedding = node.embedding` — only updates the vector field when a new embedding is provided.

**Missing tests** (~1 test):
- Update node with `embedding=None` → existing embedding preserved in DB

#### L-2: `delete_expired_nodes` PostgreSQL bulk path (knowledge_graph_repository.py:602-615)

**What it does**: Raw SQL `UPDATE graph_nodes SET is_deleted=true ... WHERE COALESCE((properties->>'pinned')::boolean, false) = false`. The SQLite fallback (Python loop) is tested; the faster PG bulk path is not.

**Missing tests** (requires PostgreSQL, ~2 tests):
- Expired unpinned node → soft-deleted by bulk UPDATE
- Expired pinned node (JSONB `pinned=true`) → not soft-deleted

#### L-3: `_prioritize_nodes` model missing from map (knowledge_graph_repository.py:431-433)

**What it does**: Handles the case where a node_id in `node_ids` has no corresponding model (race condition / already deleted). Falls back to `datetime.min` for sort key.

**Missing tests** (~1 test — edge case only triggered in race conditions):
- node_id present in `node_ids` but absent from `models` → sort key falls back gracefully

---

## Recommendations

Prioritized by impact on production safety and effort to implement.

### Priority 1: Fix coverage infrastructure (0 tests, ~0.5 day)

Add the numpy/coverage workaround to `pyproject.toml` or a conftest plugin so CI can run `make quality-gates-backend` without the "cannot load module more than once" error. Without this, coverage measurement is blocked in CI.

**Recommended fix**: Add to `pyproject.toml` [tool.pytest.ini_options]:
```
COVERAGE_CORE=sysmon
```
or create `backend/tests/sitecustomize.py` with numpy pre-import.

### Priority 2: Cover `_embed_openai` and `_ollama_embed_sync` (~4 tests, 0.5 day)

File: `backend/tests/unit/services/test_embedding_service.py`

These are the actual provider implementations — the existing 9 tests all mock at the method level. Add:
1. Direct test of `_embed_openai` with a mock `AsyncOpenAI` client returning valid response
2. `_embed_openai` with `TimeoutError` → returns `None`
3. `_embed_openai` with generic `Exception` → returns `None`
4. `_ollama_embed_sync` via patched `urllib.request.urlopen` with valid response
5. `_ollama_embed_sync` with empty `embeddings` key → returns `None`

**Estimated coverage gain**: 73% → 95%+ for `embedding_service.py`

### Priority 3: Cover `MemoryEmbeddingJobHandler.handle` method (~7 tests, 0.5 day)

File: `backend/tests/unit/infrastructure/test_memory_embedding_handler.py`

The `handle` method for legacy memory/constitution embeddings (lines 102-135) has 0% coverage, and the `_embed_text` Gemini function (lines 51-65) is also uncovered. Current 7 tests only cover `handle_graph_node`.

Add:
1. `handle` with valid `memory_entries` payload → success
2. `handle` with valid `constitution_rules` payload → success
3. `handle` with missing `entry_id` → `{"success": False}`
4. `handle` when content not found → `{"success": False}`
5. `handle` when `_embed_text` returns `None` → `{"success": False}`
6. `_embed_text` with `api_key=None` → `None`
7. `_fetch_content` with unknown table → `None`, logs error

**Estimated coverage gain**: 56% → 85%+ for `memory_embedding_handler.py`

### Priority 4: Cover `upsert_node` content_hash and error paths (~4 tests, 0.5 day)

File: `backend/tests/unit/infrastructure/repositories/test_knowledge_graph_repository.py`

Add:
1. `upsert_node` with `content_hash` match → `_touch_and_return` called, same ID returned
2. `upsert_node` with `content_hash` no match → new node inserted
3. `upsert_edge` with missing source node → `ValueError`
4. `upsert_edge` with target node in different workspace → `ValueError`

These are all SQLite-compatible.

**Estimated coverage gain**: 55% → 65%+ for `knowledge_graph_repository.py`

### Priority 5: Add tests for `get_node_by_id`, `find_node_by_external_id`, `get_edges_between` (~6 tests, 0.5 day)

File: `backend/tests/unit/infrastructure/repositories/test_knowledge_graph_repository.py`

These are simple point-lookup methods that are entirely untested (lines 636-689).

Add:
1. `get_node_by_id` → returns domain object
2. `get_node_by_id` for deleted node → `None`
3. `find_node_by_external_id` → returns domain object
4. `find_node_by_external_id` in wrong workspace → `None`
5. `get_edges_between` with empty list → `[]`
6. `get_edges_between` with connected nodes → returns edges

**Estimated coverage gain**: 55% → 70%+ for `knowledge_graph_repository.py`

### Priority 6: Create `test_graph_helpers.py` for direct unit tests (~8 tests, 1 day)

File: `backend/tests/unit/infrastructure/repositories/test_graph_helpers.py` (new)

Currently `_graph_helpers.py` has 61% coverage but NO dedicated test file — all coverage comes from indirect execution through `test_knowledge_graph_repository.py`. A dedicated file enables targeted testing of:

1. `compute_recency_score` — age 0 days → ~1.0, age 365 days → ~0.003
2. `node_model_to_domain` — embedding dim mismatch → `embedding=None` with warning
3. `edge_model_to_domain` — all fields mapped correctly
4. `enrich_edge_density` with empty `scored` → returns empty
5. `keyword_search` with `node_types` filter (SQLite)
6. `keyword_search` with `since` filter (SQLite)
7. `find_node_by_content_hash` — existing node found
8. `find_node_by_content_hash` — no match → `None`

**Estimated coverage gain**: 61% → 82%+ for `_graph_helpers.py`

### Priority 7: PostgreSQL integration tests for `hybrid_search_pg`, `_get_neighbors_cte`, `_bulk_upsert_pg` (~12 tests, 2 days)

File: `backend/tests/unit/infrastructure/repositories/test_kg_repo_pg.py` (new, marked `@pytest.mark.integration`)

These require `TEST_DATABASE_URL` pointing to PostgreSQL with pgvector extension. Key scenarios:

1. `hybrid_search_pg` with real embedding vector → scored results
2. `hybrid_search_pg` with `node_types` filter
3. `hybrid_search_pg` with `since` filter
4. `hybrid_search_pg` with no matches → `[]`
5. `_get_neighbors_cte` depth-1
6. `_get_neighbors_cte` depth-2 multi-hop
7. `_get_neighbors_cte` with edge_type filter
8. `_bulk_upsert_pg` — new nodes
9. `_bulk_upsert_pg` — updates existing by external_id
10. `_bulk_upsert_pg` — content_hash dedup within batch
11. `_bulk_upsert_pg` — same-batch hash collision (first wins)
12. `delete_expired_nodes` PG bulk path

**Estimated coverage gain**: Would bring `knowledge_graph_repository.py` from 55% to 90%+, `_graph_helpers.py` from 61% to 90%+

---

## Effort Summary

| Priority | Description | New Tests | Effort | Impact |
|----------|-------------|-----------|--------|--------|
| 1 | Fix coverage CI infrastructure | 0 | 0.5 day | Unblocks all measurement |
| 2 | `_embed_openai` + `_ollama_embed_sync` | ~5 | 0.5 day | +22% on embedding_service |
| 3 | `MemoryEmbeddingJobHandler.handle` + Gemini | ~7 | 0.5 day | +29% on memory_embedding_handler |
| 4 | `upsert_node` content_hash + error paths | ~4 | 0.5 day | +10% on kg_repository |
| 5 | Point lookups + `get_edges_between` | ~6 | 0.5 day | +15% on kg_repository |
| 6 | New `test_graph_helpers.py` | ~8 | 1 day | +21% on _graph_helpers |
| 7 | PostgreSQL integration tests | ~12 | 2 days | +35% on kg_repository, +30% on _graph_helpers |
| **Total** | | **~42 tests** | **~5.5 days** | **71% → ~90% overall** |
