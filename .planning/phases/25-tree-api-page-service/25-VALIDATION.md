---
phase: 25
slug: tree-api-page-service
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x + pytest-asyncio |
| **Config file** | `backend/pyproject.toml` (`[tool.pytest.ini_options]`) |
| **Quick run command** | `cd backend && uv run pytest tests/unit/services/test_move_page_service.py tests/unit/services/test_reorder_page_service.py -x -q` |
| **Full suite command** | `cd backend && uv run pytest --cov` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/unit/services/test_move_page_service.py tests/unit/services/test_reorder_page_service.py -x -q`
- **After every plan wave:** Run `cd backend && uv run pytest --cov`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | TREE-02 | unit | `uv run pytest tests/unit/services/test_move_page_service.py -x` | ❌ W0 | ⬜ pending |
| 25-01-02 | 01 | 1 | TREE-02 | unit | `uv run pytest tests/unit/services/test_move_page_service.py::test_move_exceeds_depth -x` | ❌ W0 | ⬜ pending |
| 25-01-03 | 01 | 1 | TREE-02 | unit | `uv run pytest tests/unit/services/test_move_page_service.py::test_move_cross_project -x` | ❌ W0 | ⬜ pending |
| 25-01-04 | 01 | 1 | TREE-02 | unit | `uv run pytest tests/unit/services/test_move_page_service.py::test_move_cascades_depth -x` | ❌ W0 | ⬜ pending |
| 25-02-01 | 02 | 1 | TREE-03 | unit | `uv run pytest tests/unit/services/test_reorder_page_service.py -x` | ❌ W0 | ⬜ pending |
| 25-02-02 | 02 | 1 | TREE-03 | unit | `uv run pytest tests/unit/services/test_reorder_page_service.py::test_reorder_prepend -x` | ❌ W0 | ⬜ pending |
| 25-02-03 | 02 | 1 | TREE-03 | unit | `uv run pytest tests/unit/services/test_reorder_page_service.py::test_reorder_append -x` | ❌ W0 | ⬜ pending |
| 25-02-04 | 02 | 1 | TREE-03 | unit | `uv run pytest tests/unit/services/test_reorder_page_service.py::test_reorder_gap_exhaustion -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/unit/services/test_move_page_service.py` — stubs for TREE-02
- [ ] `backend/tests/unit/services/test_reorder_page_service.py` — stubs for TREE-03
- [ ] `backend/tests/unit/services/conftest.py` — `notes` table DDL needs `parent_id`, `depth`, `position` columns

*Existing `conftest.py` creates SQLite tables via raw DDL. Must extend `_CREATE_TABLES_SQL` for tree columns.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
