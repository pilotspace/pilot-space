---
phase: quick-11
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/pilot_space/api/v1/routers/ai_configuration.py
  - backend/src/pilot_space/api/v1/routers/workspace_notes_ai.py
  - frontend/src/types/issue.ts
  - frontend/src/features/issues/components/source-notes-list.tsx
  - backend/tests/api/v1/test_ai_configuration_create.py
  - backend/tests/api/v1/test_create_extracted_issues_links.py
autonomous: true
must_haves:
  truths:
    - "POST /api/v1/ai/configurations with workspace_id as query param creates a configuration and returns 201"
    - "POST create-extracted-issues creates NoteIssueLink records with link_type=EXTRACTED for each created issue"
    - "Frontend NoteIssueLink type matches backend NoteLinkType enum values"
  artifacts:
    - path: "backend/src/pilot_space/api/v1/routers/ai_configuration.py"
      provides: "AI config endpoints with workspace_id as query param"
    - path: "backend/src/pilot_space/api/v1/routers/workspace_notes_ai.py"
      provides: "NoteIssueLink creation in create_extracted_issues"
    - path: "frontend/src/types/issue.ts"
      provides: "NoteIssueLink type aligned with backend"
    - path: "frontend/src/features/issues/components/source-notes-list.tsx"
      provides: "linkTypeConfig aligned with backend enum"
  key_links:
    - from: "frontend custom-provider-form.tsx"
      to: "POST /api/v1/ai/configurations"
      via: "apiClient.post with workspace_id query param"
      pattern: "params.*workspace_id"
    - from: "workspace_notes_ai.py create_extracted_issues"
      to: "NoteIssueLinkRepository"
      via: "session.add(NoteIssueLink(...))"
      pattern: "NoteIssueLink"
---

<objective>
Fix three bugs found during browser testing: AI configuration POST returning 500 (workspace_id not resolved from request body), create_extracted_issues not creating NoteIssueLink records, and frontend/backend link type enum mismatch.

Purpose: Unblock AI provider configuration and complete the note-to-issue extraction pipeline with proper traceability.
Output: Working AI config creation, NoteIssueLink records on issue extraction, consistent link types.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@backend/src/pilot_space/api/v1/routers/ai_configuration.py
@backend/src/pilot_space/api/v1/routers/workspace_notes_ai.py
@backend/src/pilot_space/api/v1/schemas/ai_configuration.py
@backend/src/pilot_space/infrastructure/database/models/note_issue_link.py
@backend/src/pilot_space/infrastructure/database/repositories/note_issue_link_repository.py
@frontend/src/types/issue.ts
@frontend/src/features/issues/components/source-notes-list.tsx
@frontend/src/features/settings/components/custom-provider-form.tsx

<interfaces>
<!-- Backend NoteIssueLink model -->
From backend/src/pilot_space/infrastructure/database/models/note_issue_link.py:
```python
class NoteLinkType(str, Enum):
    EXTRACTED = "extracted"
    REFERENCED = "referenced"
    RELATED = "related"
    INLINE = "inline"

class NoteIssueLink(WorkspaceScopedModel):
    __tablename__ = "note_issue_links"
    note_id: Mapped[uuid.UUID]   # FK to notes.id
    issue_id: Mapped[uuid.UUID]  # FK to issues.id
    link_type: Mapped[NoteLinkType]
    block_id: Mapped[str | None]
```

From backend/src/pilot_space/infrastructure/database/repositories/note_issue_link_repository.py:
```python
class NoteIssueLinkRepository(BaseRepository[NoteIssueLink]):
    def __init__(self, session: AsyncSession)
    async def find_existing(self, note_id, issue_id, link_type, workspace_id) -> NoteIssueLink | None
```

From backend/src/pilot_space/dependencies/auth.py:
```python
DbSession = Annotated[AsyncSession, Depends(get_session)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]
```

<!-- AI config route registration (actual registered paths confirmed via FastAPI route inspection) -->
Routes are at /api/v1/ai/configurations (not nested under /workspaces/{workspace_id}).
`workspace_id: UUID` is resolved as a QUERY parameter, not path parameter.
Frontend sends workspace_id in POST body but backend expects it as query param.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Fix AI config workspace_id resolution and NoteIssueLink creation in create_extracted_issues</name>
  <files>
    backend/src/pilot_space/api/v1/routers/ai_configuration.py
    backend/src/pilot_space/api/v1/routers/workspace_notes_ai.py
    frontend/src/features/settings/components/custom-provider-form.tsx
    backend/tests/api/v1/test_ai_configuration_workspace_id.py
    backend/tests/api/v1/test_create_extracted_issues_links.py
  </files>
  <behavior>
    - Test: POST /ai/configurations with workspace_id as query param + valid body returns 201
    - Test: POST /ai/configurations without workspace_id query param returns 422
    - Test: create_extracted_issues creates NoteIssueLink with link_type=EXTRACTED for each issue
    - Test: create_extracted_issues sets block_id from source_block_id when provided
    - Test: create_extracted_issues sets block_id=None when source_block_id not provided
  </behavior>
  <action>
  **Issue 1 fix — AI config workspace_id:**
  The root cause is that the frontend (`custom-provider-form.tsx`) sends `workspace_id` inside the POST body, but the backend function signature has `workspace_id: UUID` as a bare parameter (not in path, not in Pydantic model), so FastAPI treats it as a query parameter.

  Fix the FRONTEND to send `workspace_id` as a query parameter instead of in the body:
  - In `custom-provider-form.tsx`, change the POST call from:
    ```ts
    await apiClient.post('/ai/configurations', { provider: 'custom', workspace_id: workspaceId, ... })
    ```
    to:
    ```ts
    await apiClient.post('/ai/configurations', { provider: 'custom', ... }, { params: { workspace_id: workspaceId } })
    ```
  - This aligns with how `loadModels` already sends workspace_id (as `params: { workspace_id: workspaceId }`).

  **Issue 2 fix — NoteIssueLink creation in create_extracted_issues:**
  In `workspace_notes_ai.py`, after `result = await create_issue_service.execute(payload)` and `created_ids.append(str(result.issue.id))`:
  1. Import `NoteIssueLink` and `NoteLinkType` from `pilot_space.infrastructure.database.models.note_issue_link`
  2. After each issue creation inside the loop, create a NoteIssueLink:
     ```python
     link = NoteIssueLink(
         note_id=note_id,
         issue_id=result.issue.id,
         link_type=NoteLinkType.EXTRACTED,
         block_id=extracted.source_block_id,
         workspace_id=workspace.id,
     )
     session.add(link)
     ```
  3. The existing `await session.commit()` after the loop will persist both issues and links.

  Write tests:
  - `test_ai_configuration_workspace_id.py`: Unit test that the endpoint function signature expects workspace_id as a non-body param. Can verify by importing the endpoint and checking FastAPI parameter resolution.
  - `test_create_extracted_issues_links.py`: Test that after calling create_extracted_issues, NoteIssueLink records exist with correct note_id, issue_id, link_type=EXTRACTED, and block_id.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/backend && uv run pytest tests/api/v1/test_ai_configuration_workspace_id.py tests/api/v1/test_create_extracted_issues_links.py -x -v 2>&1 | tail -20</automated>
  </verify>
  <done>
    - Frontend sends workspace_id as query param for AI config POST
    - create_extracted_issues creates NoteIssueLink(EXTRACTED) for each created issue with correct note_id, issue_id, workspace_id, and optional block_id
    - Tests pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Align frontend NoteIssueLink type with backend NoteLinkType enum</name>
  <files>
    frontend/src/types/issue.ts
    frontend/src/features/issues/components/source-notes-list.tsx
  </files>
  <action>
  **Issue 3 fix — Frontend/backend link type mismatch:**

  Backend `NoteLinkType` has: `EXTRACTED`, `REFERENCED`, `RELATED`, `INLINE` (values are lowercase strings: "extracted", "referenced", "related", "inline").
  Frontend `NoteIssueLink.linkType` has: `'CREATED' | 'EXTRACTED' | 'REFERENCED'` — `CREATED` does not exist in backend.

  1. In `frontend/src/types/issue.ts` line 165, update the `linkType` union:
     ```ts
     linkType: 'extracted' | 'referenced' | 'related' | 'inline';
     ```
     Use **lowercase** to match the actual string values from the backend enum (NoteLinkType values are lowercase: "extracted", "referenced", "related", "inline").

  2. In `frontend/src/features/issues/components/source-notes-list.tsx`:
     - Update `linkTypeConfig` keys to lowercase to match the new type:
       ```ts
       const linkTypeConfig: Record<NoteIssueLink['linkType'], { label: string; className: string }> = {
         extracted: { label: 'Extracted', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
         referenced: { label: 'Referenced', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300' },
         related: { label: 'Related', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
         inline: { label: 'Inline', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
       };
       ```
     - Remove the `CREATED` entry (doesn't exist in backend).
     - Add `related` and `inline` entries for completeness.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/frontend && pnpm type-check 2>&1 | tail -10</automated>
  </verify>
  <done>
    - Frontend NoteIssueLink.linkType uses lowercase values matching backend NoteLinkType enum exactly
    - No TypeScript errors
    - source-notes-list.tsx handles all four backend link types
  </done>
</task>

<task type="auto">
  <name>Task 3: Run quality gates on both backend and frontend</name>
  <files></files>
  <action>
  Run full quality gates to ensure no regressions:
  1. `cd backend && uv run ruff check` — lint
  2. `cd backend && uv run pyright` — type check
  3. `cd backend && uv run pytest --tb=short -q` — all tests
  4. `cd frontend && pnpm lint` — ESLint
  5. `cd frontend && pnpm type-check` — TypeScript
  6. `cd frontend && pnpm test` — Vitest

  Fix any issues that arise from the changes in Tasks 1-2.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space && make quality-gates-backend 2>&1 | tail -5 && make quality-gates-frontend 2>&1 | tail -5</automated>
  </verify>
  <done>All quality gates pass with zero errors.</done>
</task>

</tasks>

<verification>
1. Backend: `cd backend && uv run pytest -x -v` passes
2. Frontend: `cd frontend && pnpm type-check && pnpm test` passes
3. AI config POST with workspace_id query param returns 201 (manual test with curl if server running)
4. NoteIssueLink records created when extracting issues from notes
</verification>

<success_criteria>
- AI configuration POST endpoint accepts workspace_id as query parameter and creates config successfully
- create_extracted_issues creates NoteIssueLink(EXTRACTED) for each issue, linking back to the source note
- Frontend NoteIssueLink type uses lowercase values matching backend NoteLinkType exactly
- All quality gates pass
</success_criteria>

<output>
After completion, create `.planning/quick/11-fix-all-issues-found-in-browser-testing-/11-SUMMARY.md`
</output>
