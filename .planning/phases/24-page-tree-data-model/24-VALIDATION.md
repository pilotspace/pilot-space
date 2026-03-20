---
phase: 24
slug: page-tree-data-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x + pytest-asyncio |
| **Config file** | `backend/pyproject.toml` ([tool.pytest.ini_options]) |
| **Quick run command** | `cd backend && uv run pytest tests/unit/ -q` |
| **Full suite command** | `cd backend && uv run pytest --cov -q` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && uv run pytest tests/unit/ -q`
- **After every plan wave:** Run `cd backend && uv run pytest --cov -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | TREE-01 | unit | `cd backend && uv run pytest tests/unit/models/test_note_tree.py -x` | Wave 0 | pending |
| 24-01-02 | 01 | 1 | TREE-01 | unit | `cd backend && uv run pytest tests/unit/models/test_note_tree.py -x` | Wave 0 | pending |
| 24-01-03 | 01 | 1 | TREE-04 | unit | `cd backend && uv run pytest tests/unit/models/test_note_tree.py -x` | Wave 0 | pending |
| 24-01-04 | 01 | 1 | TREE-05 | unit | `cd backend && uv run pytest tests/unit/models/test_note_tree.py -x` | Wave 0 | pending |
| 24-01-05 | 01 | 1 | TREE-05 | integration | `cd backend && uv run alembic heads` | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/unit/models/test_note_tree.py` — stubs for TREE-01, TREE-04, TREE-05 model-level assertions
- [ ] `backend/tests/factories.py` — update NoteFactory with `parent_id=None`, `depth=0`, `position=0`

*Existing infrastructure covers framework and conftest needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Alembic migration 079 produces single head | TREE-05 | CLI verification | Run `cd backend && uv run alembic heads` and confirm single head |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
