---
phase: quick-10
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/10-investigate-into-codebase-of-pilotspace-/10-INVESTIGATION-REPORT.md
autonomous: true
requirements: [QUICK-10]

must_haves:
  truths:
    - "All Note-to-Issue pathways are identified and documented with code references"
    - "The extraction pipeline (Note -> AI extraction -> Issue creation -> NoteIssueLink) is traced end-to-end"
    - "All SDLC development cases are tested using auth as the example domain with local LLM mock"
    - "Existing test coverage gaps in the Note-to-Issue pipeline are identified"
  artifacts:
    - path: ".planning/quick/10-investigate-into-codebase-of-pilotspace-/10-INVESTIGATION-REPORT.md"
      provides: "Complete investigation report with code traces, test results, and findings"
      min_lines: 100
  key_links:
    - from: "backend/src/pilot_space/api/v1/routers/ai_extraction.py"
      to: "backend/src/pilot_space/application/services/extraction/extract_issues_service.py"
      via: "IssueExtractionService instantiation inside endpoint"
      pattern: "IssueExtractionService\\(session="
    - from: "backend/src/pilot_space/api/v1/routers/ai_extraction.py"
      to: "backend/src/pilot_space/infrastructure/database/models/note_issue_link.py"
      via: "NoteIssueLink creation in approve_extracted_issues"
      pattern: "NoteIssueLink\\("
    - from: "frontend/src/features/notes/hooks/useIssueExtraction.ts"
      to: "backend/src/pilot_space/api/v1/routers/ai_extraction.py"
      via: "SSE POST to /notes/{noteId}/extract-issues"
      pattern: "extract-issues"
---

<objective>
Investigate the Pilot Space codebase to identify and trace all Note-to-Issue generation pathways, then run the existing SDLC test cases (using auth as the example domain) with local LLM mocks to verify the full pipeline works.

Purpose: Understand how notes generate issues across backend/frontend, verify the pipeline with tests, and document findings for future development.
Output: Investigation report with code traces, test results, and identified gaps.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@backend/src/pilot_space/application/services/extraction/extract_issues_service.py
@backend/src/pilot_space/api/v1/routers/ai_extraction.py
@backend/src/pilot_space/infrastructure/database/models/note_issue_link.py
@backend/src/pilot_space/infrastructure/database/repositories/note_issue_link_repository.py
@backend/src/pilot_space/api/v1/routers/workspace_note_issue_links.py
@frontend/src/features/notes/hooks/useIssueExtraction.ts
@frontend/src/features/notes/components/ExtractionReviewPanel.tsx
@frontend/src/features/issues/components/source-notes-list.tsx
@backend/tests/unit/services/test_extraction_service.py
@backend/tests/manual/test_sdlc_flow.py
</context>

<tasks>

<task type="auto">
  <name>Task 1: Trace all Note-to-Issue generation pathways in the codebase</name>
  <files>
    .planning/quick/10-investigate-into-codebase-of-pilotspace-/10-INVESTIGATION-REPORT.md
  </files>
  <action>
    Systematically investigate and document every pathway through which a Note generates Issues in Pilot Space. Search the entire codebase (backend + frontend) for all code that creates NoteIssueLink records or triggers issue creation from note content.

    Pathways to trace (known from initial investigation):

    1. **AI Extraction Pipeline (SSE)** — The primary Note-First pathway:
       - Frontend: `useIssueExtraction` hook -> SSE POST to `/notes/{noteId}/extract-issues`
       - Backend: `ai_extraction.py::extract_issues_stream` -> `IssueExtractionService.extract()` -> Claude Sonnet LLM call
       - Approval: `ai_extraction.py::approve_extracted_issues` -> `CreateIssueService.execute()` + `NoteIssueLinkRepository.create()` with `NoteLinkType.EXTRACTED`
       - Frontend review: `ExtractionReviewPanel` -> `aiApi.createExtractedIssues()`

    2. **Manual Note-Issue Linking** — REST API for explicit linking:
       - Backend: `workspace_note_issue_links.py` — POST/DELETE/GET for `NoteIssueLink` records
       - Link types: EXTRACTED, REFERENCED, RELATED, INLINE

    3. **Inline Issue Extension (TipTap)** — Issues embedded in note editor:
       - Frontend: `InlineIssueExtension.ts` — TipTap extension for inline issue references
       - Check if this creates NoteIssueLink with `NoteLinkType.INLINE`

    4. **KG Populate Pipeline** — Background job for knowledge graph:
       - Backend: `kg_populate_handler.py` — creates graph nodes from notes/issues
       - Check if it creates NoteIssueLink records or only graph edges

    5. **AI Chat/Agent Issue Creation** — Issues created via conversational agent:
       - Backend: `note_server.py` MCP tool, `pilotspace_note_helpers.py`
       - Check if agent-created issues get linked back to source notes

    For each pathway, document:
    - Entry point (frontend trigger or API call)
    - Backend service chain (router -> service -> repository)
    - Data model (NoteIssueLink fields populated)
    - Link type used (EXTRACTED/REFERENCED/RELATED/INLINE)
    - Whether it uses local LLM or remote API
    - Test coverage status (which tests exist, which are missing)

    Also investigate:
    - `source-notes-list.tsx` — how it queries and displays linked notes on issue detail page
    - `issue-note-context.ts` — how the issue detail page loads note context
    - Frontend `services/api/notes.ts` — linkIssue/unlinkIssue API calls
    - `workspace_notes_ai.py` — check for additional AI-powered note-to-issue endpoints

    Write all findings to the investigation report file.
  </action>
  <verify>
    The investigation report exists and contains at least 5 sections covering:
    (1) AI Extraction Pipeline trace, (2) Manual Linking API trace, (3) Inline Issue Extension trace,
    (4) KG Populate trace, (5) Test coverage summary.
    Verify: `wc -l .planning/quick/10-investigate-into-codebase-of-pilotspace-/10-INVESTIGATION-REPORT.md` shows >= 100 lines.
  </verify>
  <done>
    All Note-to-Issue pathways are documented with exact file paths, function names, and data flow diagrams.
    Each pathway has its link type, entry points, and test coverage status identified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Run all existing SDLC test cases with local LLM mocks (auth domain)</name>
  <files>
    .planning/quick/10-investigate-into-codebase-of-pilotspace-/10-INVESTIGATION-REPORT.md
  </files>
  <action>
    Run all existing tests related to the Note-to-Issue pipeline and SDLC flow, using the auth domain as the example scenario. These tests already use mocked LLM calls (no real API key needed).

    Test suites to run:

    1. **Unit: Extraction Service** — `cd backend && uv run pytest tests/unit/services/test_extraction_service.py -v`
       Tests: confidence tagging, TipTap text extraction, LLM response parsing, full extraction with mocked LLM, error resilience, selected text handling, max issues limit, confidence clamping.

    2. **Unit: Create Extracted Issues API** — `cd backend && uv run pytest tests/unit/api/test_create_extracted_issues.py -v`
       Tests: endpoint creates issues from extraction results, validates input, handles edge cases.

    3. **Unit: Extract and Persist** — `cd backend && uv run pytest tests/unit/ai/test_extract_and_persist.py -v`
       Tests: AI-side extraction and persistence logic.

    4. **Integration: Issue Extraction Endpoint** — `cd backend && uv run pytest tests/integration/ai/test_issue_extraction_endpoint.py -v`
       Tests: SSE streaming endpoint integration.

    5. **E2E: Issue Extraction** — `cd backend && uv run pytest tests/e2e/ai/test_issue_extraction_e2e.py -v`
       Tests: End-to-end extraction flow.

    6. **Frontend: Extraction Hook** — `cd frontend && pnpm test -- --run features/notes/hooks/__tests__/useIssueExtraction.test.ts`
       Tests: SSE client connection, issue collection, auto-approve flow.

    7. **Frontend: Extraction Review Panel** — `cd frontend && pnpm test -- --run features/notes/components/__tests__/ExtractionReviewPanel.test.tsx`
       Tests: Review panel rendering, approve/skip toggle, issue creation.

    8. **Frontend: Source Notes List** — `cd frontend && pnpm test -- --run features/issues/components/__tests__/source-notes-list.test.tsx`
       Tests: Linked notes display on issue detail page.

    For each test suite, record:
    - Pass/fail count
    - Any failures with error messages
    - Whether the test uses auth-domain examples (JWT, login, OAuth scenarios in test fixtures)
    - Coverage of the Note-to-Issue pipeline stages

    Append test results to the investigation report under a "Test Results" section.
    Note which SDLC stages are covered: Note Creation -> AI Extraction -> Review -> Issue Creation -> Note-Issue Linking -> Issue Display.
  </action>
  <verify>
    <automated>cd /Users/tindang/workspaces/tind-repo/pilot-space/backend && uv run pytest tests/unit/services/test_extraction_service.py tests/unit/api/test_create_extracted_issues.py -v --tb=short 2>&1 | tail -20</automated>
  </verify>
  <done>
    All existing test suites have been run. Results are documented in the investigation report with pass/fail counts.
    The auth-domain example is validated through the extraction service tests (which use auth-related note content like "Fix the login page bug", "Fix authentication flow").
    Any test failures are documented with root cause analysis.
  </done>
</task>

<task type="auto">
  <name>Task 3: Document findings, gaps, and recommendations</name>
  <files>
    .planning/quick/10-investigate-into-codebase-of-pilotspace-/10-INVESTIGATION-REPORT.md
  </files>
  <action>
    Consolidate all findings into the final investigation report. Add sections for:

    1. **Architecture Summary** — Visual text diagram of the full Note-to-Issue data flow:
       ```
       Note Canvas (TipTap) -> Selection/Full Note -> AI Extraction (SSE) -> Review Panel -> Issue Creation + NoteIssueLink
       Note Canvas -> Inline Issue Extension -> NoteIssueLink (INLINE)
       Note Canvas -> Manual Link API -> NoteIssueLink (REFERENCED/RELATED)
       Issue Detail Page -> Source Notes List -> NoteIssueLink query (reverse lookup)
       ```

    2. **Local LLM Compatibility** — Assess how the extraction service could work with a local LLM:
       - Current: hardcoded `AsyncAnthropic` client in `extract_issues_service.py`
       - ProviderSelector routes ISSUE_EXTRACTION to Sonnet
       - To use local LLM: would need to add a local provider to ProviderSelector or modify `_call_llm()` to support OpenAI-compatible local endpoints (e.g., Ollama, LM Studio)
       - Note: tests already mock the LLM call entirely, so "testing with local LLM" means the mock-based tests already cover the pipeline logic

    3. **Auth Domain SDLC Coverage** — Map the auth example through each SDLC stage:
       - NOTE: Sprint planning note with auth tasks (JWT, OAuth, rate limiting, password reset, session bug)
       - EXTRACT: AI identifies 5 issues from auth note content
       - REVIEW: User approves/skips extracted issues
       - CREATE: Issues created with priority, labels, NoteIssueLink(EXTRACTED)
       - SPRINT: Issues assigned to cycle/sprint
       - TRACK: Issue detail shows source notes via SourceNotesList

    4. **Test Coverage Gaps** — Identify what is NOT tested:
       - NoteIssueLinkRepository unit tests (does repo have its own test file?)
       - workspace_note_issue_links.py router tests (POST/DELETE/GET endpoints)
       - InlineIssueExtension link creation (does it persist NoteIssueLink?)
       - KG populate creating vs consuming NoteIssueLinks
       - Frontend useIssueSyncListener hook

    5. **Recommendations** — Prioritized list of improvements:
       - Add local LLM provider support (OpenAI-compatible endpoint in ProviderSelector)
       - Add unit tests for NoteIssueLinkRepository
       - Add router tests for workspace_note_issue_links endpoints
       - Verify InlineIssueExtension persists NoteIssueLink records
  </action>
  <verify>
    The investigation report is complete with all 5 sections.
    `wc -l .planning/quick/10-investigate-into-codebase-of-pilotspace-/10-INVESTIGATION-REPORT.md` shows >= 150 lines.
  </verify>
  <done>
    Complete investigation report with architecture diagram, all 5+ Note-to-Issue pathways traced, test results documented, local LLM compatibility assessed, auth-domain SDLC coverage mapped, and actionable recommendations listed.
  </done>
</task>

</tasks>

<verification>
- Investigation report exists with >= 150 lines
- All identified Note-to-Issue pathways have file paths and function names
- Test results section shows pass/fail counts for each test suite
- Recommendations section lists prioritized improvements
</verification>

<success_criteria>
- Every Note-to-Issue pathway in the codebase is identified with exact code references
- All existing extraction/SDLC tests run successfully (or failures are documented with root cause)
- The auth domain is used as the example throughout (JWT, OAuth, rate limiting, session management)
- Local LLM compatibility is assessed with specific code changes needed
- Test coverage gaps are identified with specific files/functions that need tests
</success_criteria>

<output>
After completion, create `.planning/quick/10-investigate-into-codebase-of-pilotspace-/10-SUMMARY.md`
</output>
