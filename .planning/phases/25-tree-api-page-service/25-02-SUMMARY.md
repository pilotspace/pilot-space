---
phase: 25-tree-api-page-service
plan: 02
subsystem: backend/services/note
tags: [tree, reorder-page, rest-api, endpoints, service, tdd]
dependency_graph:
  requires:
    - 25-01: MovePageService, NoteRepository tree methods, schemas, DI wiring
  provides:
    - ReorderPageService (TREE-03)
    - POST /{workspace_id}/notes/{note_id}/move endpoint (TREE-02 API)
    - POST /{workspace_id}/notes/{note_id}/reorder endpoint (TREE-03 API)
  affects:
    - backend/src/pilot_space/api/v1/routers/workspace_notes.py
    - backend/src/pilot_space/api/v1/routers/workspace_note_annotations.py (new)
    - backend/src/pilot_space/main.py
    - backend/src/pilot_space/api/v1/routers/__init__.py
tech_stack:
  added: []
  patterns:
    - frozen dataclass payload/result (CQRS-lite)
    - gap-based midpoint position arithmetic with re-sequence sentinel (-1)
    - TDD RED/GREEN cycle with MagicMock strategy
    - router extraction to keep files under 700-line limit
key_files:
  created:
    - backend/src/pilot_space/application/services/note/reorder_page_service.py
    - backend/tests/unit/services/test_reorder_page_service.py
    - backend/src/pilot_space/api/v1/routers/workspace_note_annotations.py
  modified:
    - backend/src/pilot_space/api/v1/routers/workspace_notes.py
    - backend/src/pilot_space/main.py
    - backend/src/pilot_space/api/v1/routers/__init__.py
decisions:
  - "Re-sequence sentinel -1 returned by _compute_insert_position avoids two-pass logic; single -1 check delegates cleanly to _resequence_siblings"
  - "Annotation endpoints extracted to workspace_note_annotations.py (Rule 3 auto-fix: 775-line file exceeded 700-line limit after tree endpoint additions)"
  - "workspace_note_annotations.py uses local _resolve_workspace_for_annotations returning UUID rather than the full Workspace object, keeping annotation sub-module self-contained"
metrics:
  duration_seconds: 416
  completed_date: "2026-03-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 3
requirements: [TREE-02, TREE-03]
---

# Phase 25 Plan 02: ReorderPageService and Tree Endpoints Summary

**One-liner:** Gap-based ReorderPageService with midpoint arithmetic and re-sequence fallback, wired to POST move/reorder endpoints returning PageTreeResponse.

## What Was Built

### ReorderPageService

Full implementation replacing the Plan 01 stub. Implements TREE-03.

Logic flow:
1. Fetch note — validate exists + workspace matches
2. Guard: personal pages (`project_id=None`) rejected with clear message
3. Fetch siblings via `_note_repo.get_siblings(note.parent_id, workspace_id, project_id, note.id)` (note excluded, position ASC)
4. Compute new position via `_compute_insert_position(siblings, insert_after_id)`:
   - No siblings: return 1000
   - `insert_after_id=None`: prepend (`max(1, first.position // 2)`)
   - Anchor is last sibling: append (`last.position + 1000`)
   - Midpoint collides with neighbor: return `-1` (gap-exhaustion sentinel)
   - Otherwise: return midpoint
5. If sentinel `-1`: call `_resequence_siblings` to build ordered list and assign 1000-gapped positions
6. Flush + refresh + return `ReorderPageResult(note=note)`

### REST Endpoints

Both endpoints added to `workspace_notes.py` between delete and pin operations:

- `POST /{workspace_id}/notes/{note_id}/move` — delegates to `MovePageService`, returns `PageTreeResponse`
- `POST /{workspace_id}/notes/{note_id}/reorder` — delegates to `ReorderPageService`, returns `PageTreeResponse`

Both include `session: SessionDep` in signature (CLAUDE.md gotcha: required to populate DI ContextVar).

### _note_to_tree_response helper

Added to `workspace_notes.py` — extends `_note_to_response` pattern with `parent_id`, `depth`, `position` fields.

### Annotation Router Extraction

`workspace_note_annotations.py` created with `annotations_router` containing the two annotation endpoints. Registered in `main.py` at `API_V1_PREFIX/workspaces` prefix. Imported + exported from `routers/__init__.py`.

## Test Results

```
16 passed in 0.04s
```

All 7 new reorder service tests + 9 existing move service tests pass:
- `test_reorder_insert_between` — 3 siblings at 1000, 2000, 3000; note placed at 1500
- `test_reorder_prepend` — insert_after_id=None; position = 500 (< 1000)
- `test_reorder_append` — insert after last sibling; position = 3000
- `test_reorder_gap_exhaustion` — positions 1000/1001 collision; re-sequence to 1000/2000/3000
- `test_reorder_no_siblings` — position = 1000
- `test_reorder_not_found` — missing note raises ValueError
- `test_reorder_personal_page` — project_id=None raises ValueError

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] workspace_notes.py exceeded 700-line limit after tree endpoint additions**
- **Found during:** Task 2 commit (pre-commit hook check-file-size failed: 775 lines)
- **Issue:** Adding two tree endpoints + `_note_to_tree_response` helper pushed the file to 775 lines, exceeding the project 700-line limit enforced by pre-commit hook
- **Fix:** Extracted annotation endpoints (GET + PATCH) to `workspace_note_annotations.py` with `annotations_router`. Registered in `main.py` and `routers/__init__.py`. Both files are now 643 and 190 lines respectively
- **Files modified:** `workspace_notes.py`, new `workspace_note_annotations.py`, `main.py`, `routers/__init__.py`
- **Commits:** `a86b0c25`

## Self-Check

- [x] `backend/src/pilot_space/application/services/note/reorder_page_service.py` exists (203 lines)
- [x] `backend/tests/unit/services/test_reorder_page_service.py` exists
- [x] `backend/src/pilot_space/api/v1/routers/workspace_note_annotations.py` exists
- [x] `backend/src/pilot_space/api/v1/routers/workspace_notes.py` modified (643 lines, under 700)
- [x] Commits de42a52c and a86b0c25 exist
- [x] pyright: 0 errors on all modified files
- [x] ruff: all checks passed
- [x] 16 tests pass

## Self-Check: PASSED
