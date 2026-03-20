---
phase: quick-02
plan: "01"
subsystem: frontend-layout, frontend-editor, frontend-stores, backend-tests
tags: [bug-fix, test-cleanup, cache-invalidation, mobx, breadcrumb, sidebar]
dependency_graph:
  requires: [quick-01]
  provides: [PR #32 all CodeRabbit issues resolved]
  affects: [app-shell sidebar, PageBreadcrumb, note detail emoji handler, UIStore tests, MovePageService tests]
tech_stack:
  added: []
  patterns: [MobX dispose lifecycle, TanStack Query cache invalidation, personalPagesKeys]
key_files:
  modified:
    - frontend/src/components/layout/app-shell.tsx
    - frontend/src/components/editor/PageBreadcrumb.tsx
    - frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx
    - frontend/src/stores/__tests__/UIStore.test.ts
    - backend/tests/unit/services/test_move_page_service.py
decisions:
  - "Removed unused hasItems variable from PageBreadcrumb after replacing conditional — keeps component clean"
  - "Disposed freshStore in hydrate test inline (not via afterEach) since it is a locally-scoped instance"
metrics:
  duration: "~5 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  files_modified: 5
---

# Quick Task 2: Fix remaining 5 CodeRabbit review issues from PR #32

One-liner: 5 targeted fixes — tablet sidebar lockout, breadcrumb guard correctness, personal pages cache invalidation, MobX leak cleanup, and UUID type alignment in test fixture.

## Tasks Completed

### Task 1: Fix tablet rail width, breadcrumb styling, and emoji cache invalidation

**Commit:** `e6fbdace`

**Issue 9 — app-shell.tsx tablet rail width:**
Added `isTablet ? 60 :` as the first condition in the `animate` width expression. Without this guard, a persisted desktop `sidebarWidth` value (e.g., 260px) could override the tablet 60px icon-rail on next mount before the auto-collapse `useEffect` runs.

**Issue 10 — PageBreadcrumb.tsx conditional styling:**
Replaced `!hasItems && 'text-foreground'` with `ancestors.length === 0 && 'text-foreground'`. The original condition was always false when `projectName` is present because `hasItems = projectName || ancestors.length > 0`. The intent is to highlight the project name in foreground color only when it is the sole breadcrumb item (no ancestors). Also removed the now-unused `hasItems` variable (caught by `tsc --noEmit`).

**Issue 11 — Note detail page personal pages emoji cache:**
Added import for `personalPagesKeys` from `usePersonalPages` and an `else` branch in `handleEmojiChange` to call `queryClient.invalidateQueries({ queryKey: personalPagesKeys.all })` when `note?.projectId` is null. Previously only project-scoped notes invalidated their sidebar tree; personal page emojis stayed stale until the 2-minute `staleTime` expired.

### Task 2: Fix UIStore test leak and MovePageService test UUID type

**Commit:** `4d9b7b7a`

**Issue 12 — UIStore.test.ts MobX reaction leak:**
Added `afterEach` import from vitest and an `afterEach(() => { uiStore.dispose(); })` hook. Also added `freshStore.dispose()` inline at the end of the hydrate test (locally-scoped instance). Prevents MobX `autorun` reactions set up by UIStore from accumulating across test cases.

**Issue 13 — test_move_page_service.py UUID vs string:**
Changed `"id": str(child_id)` to `"id": child_id` and `"parent_id": str(note.id)` to `"parent_id": note.id` in the `fake_desc` dict of `test_move_cascades_depth_to_descendants`. The production `get_descendants` repository method returns UUID objects, so the test fixture must match.

## Verification

- `pnpm type-check`: passed (0 errors)
- `pnpm lint`: passed (0 errors, pre-existing warnings only)
- `pnpm vitest run src/stores/__tests__/UIStore.test.ts`: 6/6 passed
- `uv run pytest tests/unit/services/test_move_page_service.py -q`: 12/12 passed

## Deviations from Plan

**1. [Rule 1 - Bug] Removed unused `hasItems` variable in PageBreadcrumb.tsx**
- **Found during:** Task 1, tsc --noEmit post-edit check
- **Issue:** After replacing `!hasItems` with `ancestors.length === 0`, `hasItems` was declared but never read — TS6133 error
- **Fix:** Removed the `const hasItems = ...` line entirely
- **Files modified:** `frontend/src/components/editor/PageBreadcrumb.tsx`
- **Commit:** `e6fbdace`

## Self-Check: PASSED

Files exist:
- `frontend/src/components/layout/app-shell.tsx` — FOUND
- `frontend/src/components/editor/PageBreadcrumb.tsx` — FOUND
- `frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx` — FOUND
- `frontend/src/stores/__tests__/UIStore.test.ts` — FOUND
- `backend/tests/unit/services/test_move_page_service.py` — FOUND

Commits exist:
- `e6fbdace` — FOUND
- `4d9b7b7a` — FOUND
