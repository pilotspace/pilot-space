---
phase: quick-06
plan: 01
subsystem: rag-test-coverage
tags: [audit, coverage, rag, embedding, knowledge-graph]
dependency_graph:
  requires: []
  provides: [RAG-AUDIT-01]
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/quick/6-audit-rag-test-coverage-and-validate-emb/6-AUDIT-REPORT.md
  modified: []
decisions:
  - Coverage measurement requires PYTHONPATH sitecustomize.py workaround due to numpy 2.4.2 + coverage.py incompatibility on macOS
  - All 97 existing tests pass; failures are coverage gaps, not test failures
metrics:
  duration: "~45 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase quick-06 Plan 01: RAG Test Coverage Audit Summary

RAG subsystem coverage measured at 71% overall (below 80% threshold), with 4 of 7 modules failing; audit report identifies ~42 new tests needed across 7 priorities to reach 90%+ coverage.

## What Was Done

### Task 1: Run targeted coverage measurement for all 7 RAG modules

Ran `pytest --cov` scoped to all 7 RAG source modules against the 6 existing test files (97 tests total). Discovered a blocking environment issue: `numpy 2.4.2` + `coverage.py 7.13.2` on macOS triggers "cannot load module more than once per process" when coverage's C-tracer intercepts numpy's C extension initialization during conftest.py loading. Resolved with a `sitecustomize.py` that pre-imports numpy and pgvector before coverage starts (`PYTHONPATH=/tmp`).

Coverage numbers captured:
- `markdown_chunker.py`: **100%** (52 stmts, 0 miss)
- `kg_populate_handler.py`: **94%** (166 stmts, 5 miss)
- `graph_search_service.py`: **93%** (73 stmts, 5 miss)
- `embedding_service.py`: **73%** (59 stmts, 18 miss)
- `_graph_helpers.py`: **61%** (125 stmts, 39 miss)
- `memory_embedding_handler.py`: **56%** (89 stmts, 37 miss)
- `knowledge_graph_repository.py`: **55%** (263 stmts, 110 miss)
- **Overall**: **71%** (827 stmts, 214 miss)

### Task 2: Analyze uncovered code paths and produce audit report

Read all 7 source files, cross-referenced each uncovered line range with actual code behavior, and classified 20 gaps across 4 severity tiers. Produced `6-AUDIT-REPORT.md` with:

- Per-module coverage table with missing line ranges
- 4 critical gaps (entire `_embed_openai` method, `_ollama_embed_sync`, `hybrid_search_pg`, `_bulk_upsert_pg` all at 0% coverage — these are the primary production code paths)
- 8 high priority gaps (error handlers, Gemini embedding, content_hash dedup paths)
- 12 medium priority gaps (point lookups, dim-mismatch validation, PostgreSQL CTE traversal)
- Actionable recommendations per gap: which test file, what to assert, estimated new test count
- 7-priority effort table: ~42 new tests, ~5.5 days to reach 90%+ overall

## Key Findings

1. **Production paths untested**: `hybrid_search_pg` (the production search path) and `_bulk_upsert_pg` (the production batch upsert) have 0% coverage because all tests use SQLite. Any regression here is invisible.

2. **Both embedding provider implementations untested**: `_embed_openai` body (lines 92-110) and `_ollama_embed_sync` (lines 137-150) are never called by tests — existing tests mock at the method level, not the implementation level.

3. **No dedicated test file for `_graph_helpers.py`**: All 61% coverage comes from indirect execution through repository tests. 8 direct unit tests would raise it to ~82%.

4. **Coverage infrastructure blocked in CI**: `numpy 2.4.2` + `coverage.py` incompatibility requires a workaround that is not currently documented or automated.

5. **`markdown_chunker.py` is at 100%**: The chunking logic is well-tested; the rest of the pipeline is not.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] numpy/coverage incompatibility blocked coverage measurement**
- **Found during**: Task 1
- **Issue**: `pytest --cov` triggered "ImportError: cannot load module more than once per process" via numpy C extension + coverage.py sys.settrace interaction. This affected all 7 test files, not just some.
- **Fix**: Created `/tmp/sitecustomize.py` with `import numpy; import pgvector` pre-loading. Used `PYTHONPATH=/tmp uv run pytest ...` to activate it before coverage tracing starts.
- **Files modified**: None (workaround was runtime-only; not committed to codebase)
- **Impact**: Coverage measurement succeeded for all 97 tests. The workaround is documented in `6-AUDIT-REPORT.md` under "Coverage Measurement Note" for future CI reference.

## Self-Check: PASSED

- `.planning/quick/6-audit-rag-test-coverage-and-validate-emb/6-AUDIT-REPORT.md` — FOUND
- Commit `987a0299` — FOUND (verified via `git log`)
- Report has 44 `##` section headings covering all required sections
- All 97 tests collected and passing (exit code 1 was only from coverage fail_under=80, not test failures)
