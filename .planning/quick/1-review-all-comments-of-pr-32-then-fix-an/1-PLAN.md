---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/pilot_space/application/services/note/move_page_service.py
  - backend/src/pilot_space/application/services/note/update_note_service.py
  - backend/src/pilot_space/api/v1/routers/workspace_notes.py
  - backend/tests/unit/services/conftest.py
  - backend/tests/unit/services/test_move_page_service.py
  - backend/tests/unit/services/test_update_note_service.py
  - frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx
  - frontend/src/features/notes/hooks/useProjectPageTree.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Self-parenting and ancestor-descendant cycles are rejected with ValueError"
    - "icon_emoji is serialized in all note response builders"
    - "Move/reorder not-found errors return 404, validation errors return 422"
    - "Clearing icon_emoji (explicit null) is distinguishable from omitted field"
    - "SQLite test DDL includes icon_emoji column"
    - "sanitizeNoteContent is memoized to prevent unnecessary re-renders"
    - "Project tree fetches all pages, not just first 100"
    - "Tail-slot position computation uses row locking to prevent race conditions"
  artifacts:
    - path: "backend/src/pilot_space/application/services/note/move_page_service.py"
      provides: "Self-cycle guard and FOR UPDATE locking"
    - path: "backend/src/pilot_space/api/v1/routers/workspace_notes.py"
      provides: "icon_emoji in responses, 404 vs 422 error mapping"
    - path: "backend/src/pilot_space/application/services/note/update_note_service.py"
      provides: "UNSET sentinel for icon_emoji clear vs omit"
    - path: "frontend/src/features/notes/hooks/useProjectPageTree.ts"
      provides: "Paginated fetch for all project pages"
  key_links:
    - from: "workspace_notes.py move_page/reorder_page"
      to: "MovePageService ValueError messages"
      via: "message inspection for 404 vs 422"
      pattern: "not found.*404|validation.*422"
---

<objective>
Fix 8 code issues from PR #32 CodeRabbit review: self-parenting cycle (critical), icon_emoji serialization, error status codes, tail-slot race condition, emoji clear semantics, SQLite DDL, content memoization, and project tree pagination.

Purpose: Address all actionable review comments before merging PR #32.
Output: All 8 fixes applied with corresponding unit tests.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@backend/src/pilot_space/application/services/note/move_page_service.py
@backend/src/pilot_space/application/services/note/update_note_service.py
@backend/src/pilot_space/api/v1/routers/workspace_notes.py
@backend/src/pilot_space/api/v1/schemas/note.py
@backend/tests/unit/services/conftest.py
@frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx
@frontend/src/features/notes/hooks/useProjectPageTree.ts
@frontend/src/services/api/notes.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix backend issues (Issues 1-6) — cycle guard, icon_emoji, error codes, locking, clear semantics, DDL</name>
  <files>
    backend/src/pilot_space/application/services/note/move_page_service.py
    backend/src/pilot_space/application/services/note/update_note_service.py
    backend/src/pilot_space/api/v1/routers/workspace_notes.py
    backend/tests/unit/services/conftest.py
    backend/tests/unit/services/test_move_page_service.py
    backend/tests/unit/services/test_update_note_service.py
  </files>
  <behavior>
    - Test: move_page with new_parent_id == note.id raises ValueError("Cannot move a page to itself")
    - Test: move_page with new_parent_id in descendant IDs raises ValueError containing "cycle"
    - Test: icon_emoji=None explicitly (from sentinel) clears the field; omitted icon_emoji is no-op
    - Test: _note_to_response, _note_to_detail_response, _note_to_tree_response include icon_emoji
  </behavior>
  <action>
    **Issue 1 — Self-parenting guard (move_page_service.py):**
    After fetching the note (line ~92) and before resolving the target parent, add:
    ```python
    if payload.new_parent_id == note.id:
        msg = "Cannot move a page to itself"
        raise ValueError(msg)
    ```
    After getting descendants (line ~122), add ancestor-descendant cycle check:
    ```python
    descendant_ids = {d["id"] for d in descendants}
    if payload.new_parent_id in descendant_ids:
        msg = "Cannot move a page to one of its descendants (would create cycle)"
        raise ValueError(msg)
    ```

    **Issue 2 — icon_emoji in response builders (workspace_notes.py):**
    Add `icon_emoji=note.icon_emoji` to `_note_to_response()` (after `last_edited_by_id`).
    `_note_to_detail_response()` and `_note_to_tree_response()` already inherit from NoteResponse schema — but they build manually, so add the field to both as well.

    **Issue 3 — 404 vs 422 error mapping (workspace_notes.py):**
    In `move_page()` and `reorder_page()` exception handlers, inspect the ValueError message:
    ```python
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            status_code = status.HTTP_404_NOT_FOUND
        else:
            status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
        raise HTTPException(status_code=status_code, detail=msg) from e
    ```

    **Issue 4 — Tail-slot FOR UPDATE locking (move_page_service.py):**
    In `_compute_tail_position()`, use `select(...).with_for_update()` on the sibling query. This requires updating `note_repository.get_siblings()` to accept an optional `for_update=False` parameter, OR computing the position inline with a direct query. Preferred approach: add `for_update` param to `get_siblings()` and apply `.with_for_update()` when True. Call with `for_update=True` from `_compute_tail_position()`. Note: SQLite tests will skip locking (it's a no-op in SQLite), but PostgreSQL will serialize concurrent moves.

    **Issue 5 — Emoji clear semantics (update_note_service.py):**
    Use a sentinel pattern. In `UpdateNotePayload`, change `icon_emoji` field type from `str | None` to use a sentinel:
    ```python
    _UNSET = object()
    ```
    Change the dataclass field to: `icon_emoji: str | None | object = _UNSET`
    In `execute()`, replace the `is not None` check with:
    ```python
    if payload.icon_emoji is not _UNSET:
        if payload.icon_emoji is None or (isinstance(payload.icon_emoji, str) and not payload.icon_emoji.strip()):
            note.icon_emoji = None
        else:
            note.icon_emoji = payload.icon_emoji
        fields_updated.append("icon_emoji")
    ```
    In the router's `update_workspace_note()`, pass `icon_emoji` only when it's in `update_data` (already uses `exclude_unset`):
    ```python
    icon_emoji=update_data.get("icon_emoji", _UNSET),  # import _UNSET from service
    ```
    This distinguishes "field omitted" (_UNSET) from "field explicitly set to null" (None).

    **Issue 6 — SQLite test DDL (conftest.py):**
    Add `icon_emoji TEXT,` to the notes table CREATE TABLE statement, after line 127 (after `last_edited_by_id TEXT,`).
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/backend && uv run pytest tests/unit/services/test_move_page_service.py tests/unit/services/test_update_note_service.py -x -q</automated>
  </verify>
  <done>
    - Self-parenting (note.id == new_parent_id) raises ValueError
    - Descendant cycle (new_parent_id in descendants) raises ValueError
    - icon_emoji appears in all three response builders
    - Not-found errors return 404, validation errors return 422
    - Tail position uses FOR UPDATE locking
    - Clearing emoji (explicit null) works, omitting emoji is no-op
    - SQLite DDL includes icon_emoji column
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix frontend issues (Issues 7-8) — memoize sanitizeNoteContent, paginate project tree</name>
  <files>
    frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx
    frontend/src/features/notes/hooks/useProjectPageTree.ts
  </files>
  <action>
    **Issue 7 — Memoize sanitizeNoteContent (page.tsx line ~469):**
    The `sanitizeNoteContent(note.content)` call on line 469 creates a new object each render. Wrap it:
    ```tsx
    const sanitizedContent = useMemo(
      () => sanitizeNoteContent(note.content),
      [note.content]
    );
    ```
    Then pass `sanitizedContent` to `<NoteCanvas content={sanitizedContent} ...>` instead of the inline call.
    Also update the `contentRef.current` assignment on line 212 to use the memoized value or keep it as-is since it's in a useEffect that already depends on `note.content`.

    **Issue 8 — Paginate project tree fetch (useProjectPageTree.ts):**
    Replace the single `notesApi.list(workspaceId, { projectId }, 1, 100)` call with a loop that fetches all pages:
    ```typescript
    queryFn: async () => {
      const PAGE_SIZE = 100;
      let page = 1;
      let allItems: Note[] = [];
      let hasNext = true;

      while (hasNext) {
        const result = await notesApi.list(workspaceId, { projectId }, page, PAGE_SIZE);
        allItems = [...allItems, ...result.items];
        hasNext = result.hasNext;
        page++;
      }

      return { items: allItems, total: allItems.length, hasNext: false, hasPrev: false, pageSize: allItems.length };
    },
    ```
    Import the `Note` type if not already imported. Adjust the `PaginatedResponse` return shape to match what `select: (data) => buildTree(data.items)` expects.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm type-check && pnpm lint</automated>
  </verify>
  <done>
    - sanitizeNoteContent is wrapped in useMemo, NoteCanvas receives stable content reference
    - useProjectPageTree fetches all pages via pagination loop, not capped at 100
    - TypeScript compiles without errors
    - ESLint passes
  </done>
</task>

</tasks>

<verification>
- Backend: `cd backend && uv run pytest tests/unit/services/ -x -q` — all service tests pass
- Backend: `cd backend && uv run pyright && uv run ruff check` — type check and lint pass
- Frontend: `cd frontend && pnpm type-check && pnpm lint && pnpm test` — all checks pass
</verification>

<success_criteria>
All 8 PR #32 review issues resolved:
1. Self-parenting cycle rejected (Critical)
2. icon_emoji serialized in responses
3. Move/reorder 404 vs 422 status codes correct
4. Tail-slot position uses FOR UPDATE locking
5. Emoji clear (explicit null) distinguished from omit
6. SQLite test DDL includes icon_emoji
7. sanitizeNoteContent memoized
8. Project tree fetches all pages
</success_criteria>

<output>
After completion, create `.planning/quick/1-review-all-comments-of-pr-32-then-fix-an/1-SUMMARY.md`
</output>
