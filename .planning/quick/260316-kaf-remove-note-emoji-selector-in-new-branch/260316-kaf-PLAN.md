---
phase: quick
plan: 260316-kaf
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx
  - frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/__tests__/page-breadcrumb-integration.test.tsx
autonomous: true
requirements: [QUICK-260316-kaf]
must_haves:
  truths:
    - "Note detail page renders without emoji picker UI"
    - "Existing breadcrumb, content sanitization, and auto-save behavior unchanged"
    - "Tests pass without emoji-related mocks"
  artifacts:
    - path: "frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx"
      provides: "Note detail page without emoji selector"
  key_links:
    - from: "page.tsx"
      to: "NoteCanvas"
      via: "props pass-through"
      pattern: "NoteCanvas"
---

<objective>
Remove the note emoji selector (icon picker popover) from the note detail page.

Purpose: Clean up the emoji selector UI that is no longer wanted on note pages.
Output: Note detail page without emoji picker, all related state/handlers/imports removed.
</objective>

<execution_context>
@/Users/tindang/workspaces/tind-repo/pilot-space/.claude/get-shit-done/workflows/execute-plan.md
@/Users/tindang/workspaces/tind-repo/pilot-space/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx
@frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/__tests__/page-breadcrumb-integration.test.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create branch and remove emoji selector from note detail page</name>
  <files>frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx</files>
  <action>
1. Create a new branch from main: `git checkout -b feat/remove-note-emoji-selector`

2. In `page.tsx`, remove all emoji-related code:

   **Imports to remove:**
   - `SmilePlus` from lucide-react (line 12) — keep `FileX` and `ArrowLeft`
   - `Input` from `@/components/ui/input` (line 15) — only used by emoji picker
   - `Popover, PopoverContent, PopoverTrigger` from `@/components/ui/popover` (line 16) — only used by emoji picker
   - `useQueryClient` from `@tanstack/react-query` (line 10) — only used in `handleEmojiChange`
   - `personalPagesKeys` from `@/features/notes/hooks/usePersonalPages` (line 23) — only used in `handleEmojiChange`

   **State to remove (lines 148-150):**
   - `const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);`
   - `const [emojiInput, setEmojiInput] = useState('');`

   **Variable to remove (line 146):**
   - `const queryClient = useQueryClient();`

   **Handler to remove (lines 366-383):**
   - The entire `handleEmojiChange` callback

   **JSX to remove (lines 417-472):**
   - The entire `{/* Emoji picker */}` div block containing the Popover

3. Verify remaining imports: `projectTreeKeys` stays (used by breadcrumb tree query on line 168). `useState` stays (used by other state). `useCallback` stays.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm type-check && pnpm lint</automated>
  </verify>
  <done>Note detail page compiles without emoji picker. No SmilePlus icon, no Popover, no emoji state/handler.</done>
</task>

<task type="auto">
  <name>Task 2: Update tests to remove emoji-related mocks</name>
  <files>frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/__tests__/page-breadcrumb-integration.test.tsx</files>
  <action>
1. In the test file, remove the `useQueryClient` mock block (lines 75-86) since the component no longer uses `useQueryClient`. The comment on line 74 says "required since we added emoji picker" — confirming it is only needed for emoji.

2. Run the existing tests to confirm they still pass. All 5 tests (Test 3-7) test breadcrumb and content sanitization — none test emoji functionality, so they should pass unchanged.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm vitest run src/app/\(workspace\)/\[workspaceSlug\]/notes/\[noteId\]/__tests__/page-breadcrumb-integration.test.tsx</automated>
  </verify>
  <done>All 5 existing tests pass. No emoji-related mock code remains in the test file.</done>
</task>

</tasks>

<verification>
- `pnpm type-check` passes (no missing imports or unused variables)
- `pnpm lint` passes (no lint errors)
- Breadcrumb integration tests pass (5/5)
- No references to `SmilePlus`, `emojiPopoverOpen`, `emojiInput`, `handleEmojiChange`, or `Popover` remain in page.tsx
</verification>

<success_criteria>
- Note detail page renders without emoji picker UI
- All type-checking and linting pass
- Existing breadcrumb and content sanitization tests pass
- Change is on a new branch `feat/remove-note-emoji-selector`
</success_criteria>

<output>
After completion, create `.planning/quick/260316-kaf-remove-note-emoji-selector-in-new-branch/260316-kaf-SUMMARY.md`
</output>
