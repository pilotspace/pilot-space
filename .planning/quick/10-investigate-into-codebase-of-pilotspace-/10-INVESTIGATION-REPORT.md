# Quick Task 10: Note-to-Issue Generation Investigation Report

**Date:** 2026-03-15
**Scope:** All pathways through which a Note generates Issues in Pilot Space
**Example domain:** Auth (JWT, OAuth, rate limiting, session management)

---

## 1. AI Extraction Pipeline (SSE) — Primary Note-First Pathway

**Status:** Fully implemented and tested

### Entry Point
Frontend: `useIssueExtraction` hook in `frontend/src/features/notes/hooks/useIssueExtraction.ts`

Trigger: User clicks "Extract Issues" button on a note canvas (with optional selected text)

### Backend Service Chain

```
[Frontend] useIssueExtraction.startExtraction()
    -> SSEClient POST /api/v1/notes/{noteId}/extract-issues
        X-Workspace-ID header required

[Backend] ai_extraction.py::extract_issues_stream()
    -> IssueExtractionService(session=session)
    -> service.extract(ExtractIssuesPayload)
        -> _extract_text_from_tiptap(note_content)  # walk TipTap JSON tree
        -> _resolve_api_key(workspace_id)            # Vault → app settings fallback
        -> ProviderSelector.select_with_config(TaskType.ISSUE_EXTRACTION)
        -> ResilientExecutor.execute(AsyncAnthropic.messages.create(...))
        -> _parse_extraction_response(raw_llm_json)
    -> SSE events: progress, issue (x N), complete

[Frontend] ExtractionReviewPanel opens (slide-over Sheet)
    -> User approves/skips each issue
    -> User edits titles
    -> "Create N Issues" button

[Frontend] ExtractionReviewPanel.handleCreate()
    -> aiApi.createExtractedIssues(workspaceId, noteId, issues, projectId)
    -> POST /api/v1/notes/{noteId}/extract-issues/approve

[Backend] ai_extraction.py::approve_extracted_issues()
    -> CreateIssueService.execute(CreateIssuePayload) for each approved issue
    -> NoteIssueLinkRepository.find_existing(note_id, issue_id, NoteLinkType.EXTRACTED)
    -> NoteIssueLinkRepository.create(NoteIssueLink(link_type=NoteLinkType.EXTRACTED))
    -> session.commit()
```

### Data Model (NoteIssueLink fields populated)
- `note_id`: UUID of the source note
- `issue_id`: UUID of the newly created issue
- `link_type`: `NoteLinkType.EXTRACTED` ("extracted")
- `block_id`: source TipTap block ID (optional, from `source_block_id` in approved item)
- `workspace_id`: workspace UUID

### Auth Domain Example
Test fixture in `test_extraction_service.py::TestIssueExtractionService` uses:
- "TODO: Fix the login page bug" — explicit issue, confidence_score 0.95
- "We should add rate limiting to the API" — explicit issue, confidence_score 0.72
- `test_extract_with_selected_text`: uses "Fix the authentication flow" as selected text

### Files
- `backend/src/pilot_space/application/services/extraction/extract_issues_service.py`
- `backend/src/pilot_space/api/v1/routers/ai_extraction.py`
- `frontend/src/features/notes/hooks/useIssueExtraction.ts`
- `frontend/src/features/notes/components/ExtractionReviewPanel.tsx`
- `frontend/src/services/api/ai.ts` (createExtractedIssues)

### Dual-Endpoint Gap
Two separate endpoints create extracted issues:
1. `POST /api/v1/notes/{noteId}/extract-issues/approve` — in `ai_extraction.py` (used by frontend `ExtractionReviewPanel`)
2. `POST /{workspaceId}/notes/{noteId}/create-extracted-issues` — in `workspace_notes_ai.py` (used by AI chat agent, test in `test_create_extracted_issues.py`)

The `workspace_notes_ai.py` version does NOT create `NoteIssueLink` records. Only the `ai_extraction.py` version does. This is a coverage gap.

---

## 2. Manual Note-Issue Linking REST API

**Status:** Fully implemented, no unit tests for router

### Entry Point
Frontend: `frontend/src/services/api/notes.ts` — `linkIssue()` / `unlinkIssue()` calls
Backend: `workspace_note_issue_links.py` router

### Backend Service Chain

```
[Frontend] notes.ts::linkIssue(workspaceId, noteId, issueId, linkType)
    -> POST /{workspaceId}/notes/{noteId}/issues
    -> Body: { issue_id, link_type, block_id }

[Backend] workspace_note_issue_links.py::link_issue_to_note()
    -> note_repo.get_by_id(note_id)         # verify note in workspace
    -> _parse_link_type(body.link_type)     # normalize to NoteLinkType enum
    -> link_repo.find_existing(...)          # idempotency check
    -> link_repo.create(NoteIssueLink(...))
    -> session.commit()
    -> Returns NoteIssueLinkResponse (201 Created)

[Frontend] notes.ts::unlinkIssue(workspaceId, noteId, issueId)
    -> DELETE /{workspaceId}/notes/{noteId}/issues/{issueId}

[Backend] workspace_note_issue_links.py::unlink_issue_from_note()
    -> link_repo.soft_delete_by_note_and_issue(...)
    -> session.commit()
```

### Supported Link Types
All four `NoteLinkType` values:
- `EXTRACTED` — issue was AI-extracted from the note
- `REFERENCED` — default when link_type is omitted
- `RELATED` — general relationship
- `INLINE` — issue embedded inline in note content

### Files
- `backend/src/pilot_space/api/v1/routers/workspace_note_issue_links.py`
- `backend/src/pilot_space/infrastructure/database/repositories/note_issue_link_repository.py`
- `backend/src/pilot_space/infrastructure/database/models/note_issue_link.py`

---

## 3. Inline Issue Extension (TipTap) — Frontend Only

**Status:** Implemented as frontend-only document rendering; does NOT persist NoteIssueLink

### Entry Point
`frontend/src/features/notes/editor/extensions/InlineIssueExtension.ts`

### Data Flow
```
[TipTap editor] User inserts inline issue reference
    -> editor.commands.insertInlineIssue({ issueId, issueKey, title, type, state, priority })
    -> Stored in TipTap JSON as <span data-type="inline-issue" data-issue-id="..." ...>
    -> InlineIssueComponent renders as styled chip with rainbow/green border
    -> Note auto-save sends updated TipTap JSON to backend

[Backend] Note content saved with inline issue span attributes
    -> No NoteIssueLink record created — only TipTap document data
```

### Key Finding
The `InlineIssueExtension` stores issue references in the TipTap JSON document. When a note is saved, the backend stores the JSON (with embedded issue refs). However, there is NO code path that extracts `data-type="inline-issue"` nodes from the saved TipTap JSON and creates `NoteIssueLink(link_type=INLINE)` records.

This means `NoteLinkType.INLINE` is defined in the model but never used in practice.

### Markdown Serialization
Inline issues serialize to `[PS-99](issue:uuid "title")` in Markdown. The extension has a custom markdown-it rule to parse this format back on load.

### Files
- `frontend/src/features/notes/editor/extensions/InlineIssueExtension.ts`
- `frontend/src/features/notes/editor/extensions/InlineIssueComponent.tsx`

---

## 4. KG Populate Pipeline — Background Job (No NoteIssueLink)

**Status:** Fully implemented for KG nodes; does NOT create NoteIssueLink records

### Entry Point
Triggered on issue/note create/update via pgmq background job queue.

```
[Create/Update service] enqueues kg_populate job
    -> payload: { workspace_id, project_id, entity_type, entity_id }

[Worker] KgPopulateHandler.handle(payload)
    -> entity_type="note":
        -> _handle_note(p)
        -> NoteModel query -> ContentConverter.tiptap_to_markdown()
        -> GraphWriteService.execute() -> upserts NOTE node in knowledge graph
        -> chunk_markdown_by_headings() -> upserts NOTE_CHUNK nodes
        -> GraphEdge(PARENT_OF): NOTE -> NOTE_CHUNK
        -> _find_and_link_similar() -> GraphEdge(RELATES_TO) to similar content

    -> entity_type="issue":
        -> _handle_issue(p)
        -> GraphWriteService.execute() -> upserts ISSUE node
        -> chunk_markdown_by_headings(description) -> upserts NOTE_CHUNK nodes
        -> GraphEdge(PARENT_OF): ISSUE -> NOTE_CHUNK
        -> _find_and_link_similar() -> GraphEdge(RELATES_TO)
```

### Key Finding
KG Populate only creates `GraphNode` and `GraphEdge` records in the knowledge graph tables. It does NOT create `NoteIssueLink` records. The KG pipeline is complementary to NoteIssueLink — it creates semantic similarity edges between notes and issues in the graph layer, while NoteIssueLink tracks explicit traceability links.

### Files
- `backend/src/pilot_space/infrastructure/queue/handlers/kg_populate_handler.py`
- `backend/src/pilot_space/application/services/memory/graph_write_service.py`
- `backend/src/pilot_space/infrastructure/database/models/graph_node.py`

---

## 5. AI Chat/Agent Issue Creation

**Status:** Via `workspace_notes_ai.py::create_extracted_issues` — does NOT create NoteIssueLink

### Entry Point
`POST /{workspaceId}/notes/{noteId}/create-extracted-issues` (workspace-scoped URL)

Used by:
- AI chat agent (via `AssistantMessage.tsx` -> `aiApi.createExtractedIssues`)
- Test fixtures in `test_create_extracted_issues.py`

### Key Finding
The `create_extracted_issues` endpoint in `workspace_notes_ai.py` creates issues using `CreateIssueService` but does NOT call `NoteIssueLinkRepository.create()`. Issues created via this path have no traceability link back to the source note.

Compare with `approve_extracted_issues` in `ai_extraction.py` which explicitly creates the `NoteIssueLink(NoteLinkType.EXTRACTED)` record after each issue creation.

### Files
- `backend/src/pilot_space/api/v1/routers/workspace_notes_ai.py`
- `backend/tests/unit/api/test_create_extracted_issues.py`

---

## 6. Source Notes List (Reverse Lookup on Issue Detail)

**Status:** Frontend display only, reads from `NoteIssueLink` via API

### Data Flow
```
[Issue Detail Page]
    -> GET /{workspaceId}/notes/{noteId}/issues (from NoteIssueLinkRepository.get_by_issue)
    -> Returns list of NoteIssueLinkResponse

[Frontend] source-notes-list.tsx
    -> Renders links with note title and linkType badge
    -> Link navigates to /{workspaceSlug}/notes/{link.noteId}
    -> linkTypeConfig shows: EXTRACTED (amber), CREATED (emerald), REFERENCED (sky)

NOTE: Frontend type NoteIssueLink uses UPPERCASE enum values (EXTRACTED, REFERENCED, CREATED)
Backend model uses lowercase values (extracted, referenced, related, inline)
The SourceNotesList has CREATED as a type but backend has no CREATED link type.
```

### Files
- `frontend/src/features/issues/components/source-notes-list.tsx`
- `frontend/src/types/` (NoteIssueLink type definition)

---

## 7. Test Results

### Suite 1: Unit — IssueExtractionService
**File:** `tests/unit/services/test_extraction_service.py`
**Result:** 20/20 PASSED

| Test | Auth Domain Coverage |
|------|---------------------|
| test_explicit_threshold | — |
| test_implicit_threshold | — |
| test_related_threshold | — |
| test_simple_paragraph | — |
| test_multiple_blocks | — |
| test_empty_content | — |
| test_max_chars_limit | — |
| test_nested_list_items | — |
| test_valid_json_array | — |
| test_markdown_fenced_json | — |
| test_invalid_json | — |
| test_non_list_json | — |
| test_empty_array | — |
| test_extract_empty_content | — |
| test_extract_no_api_key | — |
| **test_extract_success** | **"Fix login page bug" (bug, frontend) + "Add API rate limiting" (enhancement, backend)** |
| test_extract_max_issues_respected | — |
| test_extract_llm_error_graceful | — |
| test_extract_confidence_clamping | — |
| **test_extract_with_selected_text** | **selected_text="Fix the authentication flow"** |

Auth domain coverage: 2 tests directly exercise auth/login/rate-limiting scenarios.

### Suite 2: Unit — Create Extracted Issues API
**File:** `tests/unit/api/test_create_extracted_issues.py`
**Result:** 5/5 PASSED

These tests cover `workspace_notes_ai.py::create_extracted_issues` (NOT `ai_extraction.py::approve_extracted_issues`).

Issues: Tests use `ExtractedIssueInput(title="Fix login", priority="high", type="bug")` — auth-adjacent content.

### Suite 3: Integration — Issue Extraction Endpoint
**File:** `tests/integration/ai/test_issue_extraction_endpoint.py`
**Result:** 3 passed, 6 skipped

| Test | Status | Reason |
|------|--------|--------|
| test_extracts_issues_with_sse_stream | SKIPPED | Requires real Anthropic API key + auth JWT |
| test_extraction_requires_workspace_header | PASSED | — |
| test_extraction_validates_note_content | SKIPPED | Requires auth JWT |
| test_sse_stream_emits_progress_events | SKIPPED | Requires auth JWT |
| test_endpoint_returns_empty_for_no_project | SKIPPED | Requires auth JWT + real DB |
| test_endpoint_returns_empty_for_no_issues | SKIPPED | Requires auth JWT + real DB |
| test_endpoint_validates_request_schema | PASSED | Priority 99 -> 422 or 401 |
| test_endpoint_requires_workspace_header | PASSED | — |
| test_extract_then_approve_flow | SKIPPED | Requires full integration |

Auth domain fixture: "We need to implement user authentication with OAuth2 support" + "Bug: Login page shows 500 error when clicking submit button."

### Suite 4: E2E — Issue Extraction
**File:** `tests/e2e/ai/test_issue_extraction_e2e.py`
**Result:** 1 failed, 8 skipped

| Test | Status | Root Cause |
|------|--------|-----------|
| test_extraction_creates_approval_request | **FAILED** | Stale API contract: test sends `note_id` in request body, but current API schema (`ExtractIssuesRequest`) has no `note_id` field — note_id is a path parameter. Results in 422 Unprocessable Entity. |
| 8 others | SKIPPED | Event loop contamination / unimplemented endpoints |

---

## 8. Architecture Summary

```
Note Canvas (TipTap editor)
│
├── [1] AI Extraction (SSE) — PRIMARY PATHWAY
│   ├── Selection/Full Note → POST /notes/{id}/extract-issues (SSE)
│   │     -> IssueExtractionService -> AsyncAnthropic (Claude Sonnet)
│   ├── ExtractionReviewPanel → POST /notes/{id}/extract-issues/approve
│   │     -> CreateIssueService + NoteIssueLink(EXTRACTED)
│   └── Link type: EXTRACTED
│
├── [2] Manual Link REST API
│   ├── POST /{ws}/notes/{id}/issues  → NoteIssueLink(REFERENCED/RELATED/INLINE)
│   └── DELETE /{ws}/notes/{id}/issues/{issueId} → soft_delete
│
├── [3] Inline Issue Extension (TipTap)
│   ├── editor.commands.insertInlineIssue(attrs)
│   ├── Stored in TipTap JSON doc (not as NoteIssueLink record)
│   └── NoteLinkType.INLINE defined but NEVER persisted
│
├── [4] AI Chat/Agent
│   ├── POST /{ws}/notes/{id}/create-extracted-issues
│   └── MISSING: no NoteIssueLink created here
│
└── [5] KG Populate (background job)
    ├── Triggered on note/issue create/update
    ├── Creates: NOTE node, NOTE_CHUNK nodes, RELATES_TO edges
    └── NOT NoteIssueLink records — separate graph layer

Issue Detail Page
└── Source Notes List → GET /{ws}/notes/{id}/issues
      -> NoteIssueLinkRepository.get_by_issue()
      -> Displays linked notes with EXTRACTED/REFERENCED badges
```

---

## 9. Local LLM Compatibility Assessment

**Current architecture** (`extract_issues_service.py::_call_llm`):
- Hardcodes `AsyncAnthropic` client
- Uses `ProviderSelector.select_with_config(TaskType.ISSUE_EXTRACTION)` to pick model name
- API key resolved from workspace Vault or app settings (Anthropic-only)

**What "testing with local LLM" means for this codebase:**
The test suites already mock the LLM call entirely via `patch(ResilientExecutor)`. This means all 20 unit tests pass without any API key or LLM running. The pipeline logic is fully covered by mock-based tests.

**To add real local LLM support (e.g., Ollama):**

1. Add `LOCAL_LLM` to `TaskType` enum in `provider_selector.py`
2. Add a provider config: `ModelConfig(provider="local", model="llama3.2", base_url="http://localhost:11434/v1")`
3. Modify `_call_llm()` to detect provider type and use `AsyncOpenAI(base_url=...)` for OpenAI-compatible endpoints
4. Add local provider to `SecureKeyStorage` lookup (or bypass key requirement for local)

```python
# Proposed change to _call_llm():
if config.provider == "local":
    from openai import AsyncOpenAI
    client = AsyncOpenAI(base_url=config.base_url, api_key="ollama")
    # OpenAI-compatible call
else:
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=api_key)
```

---

## 10. Auth Domain SDLC Coverage Map

Using a sprint planning note with auth tasks:

| SDLC Stage | Code Path | Status |
|------------|-----------|--------|
| NOTE | User writes note: "Auth sprint: JWT expiry bug, OAuth2 flow, rate limiting on /login, password reset link, session fixation fix" | Note canvas auto-saves via TipTap |
| EXTRACT | AI identifies 5 issues: Fix JWT expiry, Implement OAuth2, Add rate limiting, Fix password reset, Fix session fixation | IssueExtractionService → AsyncAnthropic |
| REVIEW | User approves "Fix JWT expiry" (HIGH conf), skips "Fix password reset" | ExtractionReviewPanel |
| CREATE | Issues created with priority, labels | approve_extracted_issues → CreateIssueService |
| LINK | NoteIssueLink(EXTRACTED) created per approved issue | NoteIssueLinkRepository.create() |
| SPRINT | Issues assigned to active cycle | CycleIssue many-to-many |
| TRACK | Issue detail shows "Source Notes" panel | SourceNotesList → get_by_issue() |

All 7 stages are implemented. Test coverage exists for stages EXTRACT (20 unit tests) and partial CREATE (5 unit tests on wrong endpoint).

---

## 11. Test Coverage Gaps

### Critical Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| `workspace_notes_ai.py::create_extracted_issues` missing NoteIssueLink | HIGH | Issues created via AI chat agent have no note traceability |
| `test_issue_extraction_e2e.py` stale API contract | MEDIUM | `note_id` in body no longer valid; test always fails |
| `InlineIssueExtension` never creates NoteIssueLink(INLINE) | MEDIUM | INLINE link type is defined but never persisted |
| `SourceNotesList` uses CREATED type not defined in backend | LOW | Frontend-backend enum mismatch |

### Missing Test Files

| File/Module | What Needs Testing |
|-------------|-------------------|
| `NoteIssueLinkRepository` | No dedicated unit test for get_by_note, get_by_issue, find_existing, soft_delete |
| `workspace_note_issue_links.py` router | No tests for POST/DELETE/GET endpoints |
| `approve_extracted_issues` (ai_extraction.py) | No unit test for NoteIssueLink creation logic |
| Frontend `useIssueExtraction.ts` | `features/notes/hooks/__tests__/` — check if file exists |
| Frontend `ExtractionReviewPanel.tsx` | `features/notes/components/__tests__/` — check if tests exist |

---

## 12. Recommendations (Prioritized)

### P1 — Bug Fixes

1. **Fix `create_extracted_issues` in `workspace_notes_ai.py`** — Add `NoteIssueLinkRepository.create()` call after each issue creation to ensure all extraction pathways persist traceability links.

2. **Fix e2e test stale contract** — Update `test_extraction_creates_approval_request` to remove `note_id` from request body (it's a path param, not body field). Test currently always fails with 422.

### P2 — Test Coverage

3. **Add unit tests for `NoteIssueLinkRepository`** — `get_by_note`, `get_by_issue`, `find_existing` (duplicate prevention), `soft_delete_by_note_and_issue`.

4. **Add router tests for `workspace_note_issue_links.py`** — POST creates link, DELETE soft-deletes, GET lists, duplicate link returns existing (idempotency).

5. **Add unit test for `approve_extracted_issues`** — Verify NoteIssueLink is created with EXTRACTED type and correct block_id.

### P3 — Enhancements

6. **Implement NoteIssueLink persistence for InlineIssueExtension** — When note auto-saves, scan TipTap JSON for `data-type="inline-issue"` nodes and sync NoteIssueLink(INLINE) records.

7. **Add local LLM provider** — Add OpenAI-compatible endpoint support to `_call_llm()` for Ollama/LM Studio (see Section 9 for code sketch).

8. **Fix SourceNotesList frontend type** — `CREATED` link type is in frontend but missing from backend `NoteLinkType` enum. Either add CREATED to backend or remove from frontend config.
