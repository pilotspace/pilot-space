---
phase: 25-tree-api-page-service
plan: 01
subsystem: backend/services/note
tags: [tree, move-page, repository, service, di, schemas]
dependency_graph:
  requires:
    - 24-01: Note model tree columns (parent_id, depth, position)
    - 24-02: Migration 079 tree columns + indexes
  provides:
    - MovePageService (TREE-02)
    - NoteRepository tree query methods
    - MovePageRequest / ReorderPageRequest / PageTreeResponse schemas
    - DI factory registrations for move_page_service + reorder_page_service
  affects:
    - backend/src/pilot_space/infrastructure/database/repositories/note_repository.py
    - backend/src/pilot_space/api/v1/schemas/note.py
    - backend/src/pilot_space/container/container.py
    - backend/src/pilot_space/api/v1/dependencies.py
tech_stack:
  added:
    - sqlalchemy.update bulk depth cascade pattern
    - WITH RECURSIVE CTE for descendant traversal
  patterns:
    - frozen dataclass payload/result (CQRS-lite)
    - MagicMock unit test strategy for ORM-heavy models
key_files:
  created:
    - backend/src/pilot_space/application/services/note/move_page_service.py
    - backend/src/pilot_space/application/services/note/reorder_page_service.py
    - backend/tests/unit/services/test_move_page_service.py
  modified:
    - backend/src/pilot_space/infrastructure/database/repositories/note_repository.py
    - backend/src/pilot_space/api/v1/schemas/note.py
    - backend/src/pilot_space/container/container.py
    - backend/src/pilot_space/api/v1/dependencies.py
    - backend/tests/unit/services/conftest.py
decisions:
  - "MagicMock strategy for Note service tests: avoids ORM eager-load join table explosion in SQLite"
  - "get_descendants mocked in unit tests: SQLite cannot run WITH RECURSIVE CTE"
  - "ReorderPageService stub registered in DI now to avoid re-touching container.py in Plan 02"
  - "Tail position gap-1000 strategy for moved pages (consistent with Phase 24 ROW_NUMBER*1000)"
metrics:
  duration_seconds: 551
  completed_date: "2026-03-12"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 5
requirements: [TREE-02]
---

# Phase 25 Plan 01: MovePageService and Tree Infrastructure Summary

**One-liner:** MovePageService with 3-level depth enforcement, descendant cascade, and same-project validation, backed by three new NoteRepository tree methods.

## What Was Built

### NoteRepository tree methods
- `get_children(parent_id)` — direct children ordered by position ASC
- `get_siblings(parent_id, workspace_id, project_id, exclude_note_id)` — siblings filtered by parent/workspace/project, ordered by position ASC
- `get_descendants(note_id)` — recursive CTE traversal (PostgreSQL `WITH RECURSIVE`); unit tests mock this method

### MovePageService
Implements TREE-02: re-parenting a note within a project tree.

Logic flow:
1. Fetch note — validate exists + workspace matches
2. Guard: personal pages (`project_id=None`) rejected
3. If new_parent_id given: fetch parent, validate same workspace + same project
4. Compute `new_depth = parent.depth + 1` (or 0 for root promotion)
5. Reject if `new_depth > 2`
6. Fetch descendants (mocked in tests), check `new_depth + max_offset > 2`
7. Compute tail position via `get_siblings` with gap-1000
8. Update `note.parent_id`, `note.depth`, `note.position` + flush
9. If descendants and `depth_delta != 0`: bulk `UPDATE notes SET depth = depth + delta WHERE id IN (...)`
10. Final flush + refresh + return `MovePageResult`

### Schemas
- `MovePageRequest(BaseSchema)` — `new_parent_id: UUID | None`
- `ReorderPageRequest(BaseSchema)` — `insert_after_id: UUID | None`
- `PageTreeResponse(NoteResponse)` — extends with `parent_id`, `depth`, `position`

### DI Wiring
- `Container.move_page_service` Factory (session + note_repository)
- `Container.reorder_page_service` Factory (stub, Plan 02 implements)
- `MovePageServiceDep`, `ReorderPageServiceDep` in `dependencies.py`

### Test conftest.py updates
Added DDL for: `notes`, `templates`, `note_annotations`, `threaded_discussions`, `note_issue_links`, `note_note_links`, `issues` tables plus missing columns in `users`, `workspaces`, `projects` (needed by existing test suites consuming the shared conftest).

## Test Results

```
9 passed in 0.04s
```

All 9 unit tests pass:
- `test_move_page_to_new_parent` — depth-0 under depth-0 yields depth=1
- `test_move_page_to_root` — depth-1 to root yields depth=0, delta=-1
- `test_move_cascades_depth_to_descendants` — bulk UPDATE called with delta
- `test_move_exceeds_depth_limit` — descendant pushes depth to 3, rejected
- `test_move_cross_project_rejected` — different project_id raises ValueError
- `test_move_personal_page_rejected` — project_id=None raises ValueError
- `test_move_note_not_found` — missing note raises ValueError
- `test_move_target_parent_not_found` — missing parent raises ValueError
- `test_move_note_to_deep_parent_exceeds_depth` — depth-2 parent rejects move

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SQLite conftest required additional table stubs**
- **Found during:** Task 2 test execution
- **Issue:** Note model has `selectin`-loaded relationships (annotations, discussions, issue_links) and `joined`-loaded relations (template, owner, project) that fire on any `get_by_id` call. SQLite conftest lacked these tables.
- **Fix:** Replaced SQLite-based fixture approach with full MagicMock strategy — `NoteRepository` is completely mocked, removing the dependency on SQLite table topology for service unit tests.
- **Files modified:** `tests/unit/services/test_move_page_service.py`

**2. [Rule 2 - Enhancement] conftest DDL updated for future test coverage**
- **Found during:** Task 1 schema expansion
- **Issue:** The service conftest lacked tables for several models that other existing tests might use. Missing `bio` column on users, `audit_retention_days` etc. on workspaces, `icon`/`settings` on projects.
- **Fix:** Updated all three base tables with missing columns; added stub DDL for note-related tables (`templates`, `note_annotations`, `threaded_discussions`, `note_issue_links`, `note_note_links`, `issues`). Also removed duplicate `ai_sessions` DDL that would have been caused by the ordering.
- **Files modified:** `tests/unit/services/conftest.py`

## Self-Check

- [x] `backend/src/pilot_space/application/services/note/move_page_service.py` exists
- [x] `backend/src/pilot_space/application/services/note/reorder_page_service.py` exists
- [x] `backend/tests/unit/services/test_move_page_service.py` exists (263 lines > 100)
- [x] Commits 84dbc0d8 and da2ebe37 exist in git log
- [x] pyright: 0 errors on all modified files
- [x] ruff: all checks passed

## Self-Check: PASSED
