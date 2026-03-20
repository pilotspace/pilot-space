---
phase: quick-02
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/components/layout/app-shell.tsx
  - frontend/src/components/editor/PageBreadcrumb.tsx
  - frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx
  - frontend/src/stores/__tests__/UIStore.test.ts
  - backend/tests/unit/services/test_move_page_service.py
autonomous: true
requirements: []
must_haves:
  truths:
    - Tablet sidebar always renders at 60px regardless of persisted desktop state
    - PageBreadcrumb applies text-foreground only when there are no ancestors
    - Personal page emoji changes invalidate personal pages cache
    - UIStore test suite cleans up MobX reactions after each test
    - MovePageService test uses UUID objects matching production return type
  artifacts:
    - path: frontend/src/components/layout/app-shell.tsx
      provides: Tablet rail width fix
    - path: frontend/src/components/editor/PageBreadcrumb.tsx
      provides: Corrected conditional styling logic
    - path: frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx
      provides: Personal pages cache invalidation on emoji change
    - path: frontend/src/stores/__tests__/UIStore.test.ts
      provides: afterEach dispose hook to clean up MobX reactions
    - path: backend/tests/unit/services/test_move_page_service.py
      provides: UUID objects instead of str() in fake_desc
  key_links:
    - from: app-shell.tsx
      to: isTablet variable
      via: width expression in motion.aside animate prop
      pattern: "isTablet \\? 60"
    - from: handleEmojiChange
      to: personalPagesKeys.all
      via: queryClient.invalidateQueries in else branch
      pattern: "personalPagesKeys"
---

<objective>
Fix the remaining 5 code issues from PR #32 CodeRabbit review that were not addressed in Quick Task 01.

Purpose: Close out all outstanding CodeRabbit review feedback before merging PR #32.
Output: 5 targeted fixes across 5 files — 1 layout bug, 2 logic fixes, 1 test cleanup, 1 test type fix.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix tablet rail width, breadcrumb styling, and emoji cache invalidation</name>
  <files>
    frontend/src/components/layout/app-shell.tsx
    frontend/src/components/editor/PageBreadcrumb.tsx
    frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx
  </files>
  <action>
**Issue 9 — app-shell.tsx tablet rail width (line 90):**
Change the `animate` width expression from:
```
width: uiStore.sidebarCollapsed ? 60 : uiStore.sidebarWidth,
```
to:
```
width: isTablet ? 60 : uiStore.sidebarCollapsed ? 60 : uiStore.sidebarWidth,
```
`isTablet` is already defined in the component (used in the JSX condition above this block). This ensures persisted desktop state cannot reopen the full sidebar on tablet.

**Issue 10 — PageBreadcrumb.tsx conditional styling (line 39):**
Change:
```
!hasItems && 'text-foreground'
```
to:
```
ancestors.length === 0 && 'text-foreground'
```
The original guard `!hasItems` is always false when `projectName` is present because `hasItems = projectName || ancestors.length > 0`. The intent is to apply `text-foreground` when the project name is the only breadcrumb item (no ancestors), so `ancestors.length === 0` is the correct condition.

**Issue 11 — Personal pages cache invalidation on emoji change (lines 369-373):**
In `handleEmojiChange`, add an `else` branch to invalidate `personalPagesKeys.all` when `note?.projectId` is null/undefined. The current code only invalidates the project tree for project-scoped notes, leaving personal page sidebar icons stale.

First, add the import at the top of the file alongside the existing notes hooks imports:
```typescript
import { personalPagesKeys } from '@/features/notes/hooks/usePersonalPages';
```

Then update the invalidation block:
```typescript
if (note?.projectId) {
  void queryClient.invalidateQueries({
    queryKey: projectTreeKeys.tree(workspaceId, note.projectId),
  });
} else {
  void queryClient.invalidateQueries({
    queryKey: personalPagesKeys.all,
  });
}
```
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm type-check 2>&1 | tail -5</automated>
  </verify>
  <done>
    - app-shell.tsx animate width uses isTablet guard as first condition
    - PageBreadcrumb.tsx uses `ancestors.length === 0` for text-foreground class
    - note detail page imports personalPagesKeys and invalidates it in the else branch
    - pnpm type-check passes with no new errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix UIStore test leak and MovePageService test UUID type</name>
  <files>
    frontend/src/stores/__tests__/UIStore.test.ts
    backend/tests/unit/services/test_move_page_service.py
  </files>
  <action>
**Issue 12 — UIStore.test.ts leaked MobX reactions:**
Add an `afterEach` import alongside existing imports (`afterEach` from vitest), then add a cleanup hook after `beforeEach`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

After the `beforeEach` block, add:
```typescript
afterEach(() => {
  uiStore.dispose();
});
```

If any test creates additional UIStore instances (e.g., `const store2 = new UIStore()`), call `store2.dispose()` at the end of that test block. This prevents MobX reactions from leaking between test cases.

**Issue 13 — test_move_page_service.py UUID vs string (lines 162-164):**
Change `fake_desc` to use UUID objects directly, matching what the production repository returns:
```python
fake_desc: dict[str, Any] = {
    "id": child_id,          # was: str(child_id)
    "parent_id": note.id,    # was: str(note.id)
    "depth": 1,
    "position": 1000,
}
```
This aligns the test fixture with the actual return type from the repository layer (UUID, not str).
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm test -- --run UIStore 2>&1 | tail -10 && cd /Users/tindang/workspaces/tind-repo/pilot-space/backend && uv run pytest tests/unit/services/test_move_page_service.py -q 2>&1 | tail -10</automated>
  </verify>
  <done>
    - UIStore.test.ts imports afterEach and calls uiStore.dispose() in afterEach hook
    - test_move_page_service.py fake_desc uses UUID objects (child_id, note.id) not str()
    - All UIStore tests pass
    - All MovePageService tests pass
  </done>
</task>

</tasks>

<verification>
Run full frontend quality gates after both tasks:
```bash
cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm lint && pnpm type-check && pnpm test --run
```

Run backend pytest for affected test file:
```bash
cd /Users/tindang/workspaces/tind-repo/pilot-space/backend && uv run pytest tests/unit/services/test_move_page_service.py -v
```
</verification>

<success_criteria>
- All 5 issues fixed with targeted edits (no unrelated changes)
- pnpm lint, pnpm type-check, pnpm test --run all pass
- uv run pytest tests/unit/services/test_move_page_service.py passes
- No new TypeScript or Python type errors introduced
</success_criteria>

<output>
After completion, create `.planning/quick/2-review-all-comments-of-pr-32-then-fix-an/2-SUMMARY.md`
</output>
