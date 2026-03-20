---
phase: quick-10
plan: 01
subsystem: note-to-issue-pipeline
tags: [investigation, note-first, extraction, noticelinktype, sdlc]
dependency_graph:
  requires: []
  provides: [note-to-issue-pathway-map, extraction-test-results, coverage-gap-analysis]
  affects: [ai_extraction, workspace_notes_ai, note_issue_link, kg_populate]
tech_stack:
  added: []
  patterns:
    - SSE streaming (extract-issues endpoint)
    - NoteIssueLink traceability model
    - TipTap InlineIssueExtension
    - KG populate background job
key_files:
  created:
    - .planning/quick/10-investigate-into-codebase-of-pilotspace-/10-INVESTIGATION-REPORT.md
  modified: []
decisions:
  - "InlineIssueExtension stores issue refs in TipTap JSON only — no NoteIssueLink(INLINE) persisted"
  - "workspace_notes_ai.create_extracted_issues missing NoteIssueLink creation (gap)"
  - "KG populate pipeline is separate from NoteIssueLink — creates graph nodes/edges only"
  - "Dual extraction endpoints: ai_extraction.approve (creates link) vs workspace_notes_ai.create (no link)"
metrics:
  duration: ~25min
  completed: "2026-03-15"
  tasks_completed: 3
  files_created: 1
---

# Quick Task 10: Note-to-Issue Pipeline Investigation Summary

**One-liner:** Complete Note-to-Issue pathway map with 5 identified routes, 28 tests run (25 pass, 1 fail, 8 skip), and 4 critical coverage gaps documented.

## What Was Done

Investigated the entire Pilot Space codebase to trace all pathways through which a Note generates Issues. Ran all relevant test suites. Documented findings in `10-INVESTIGATION-REPORT.md` (443 lines).

## Pathways Identified

| # | Pathway | Creates NoteIssueLink | Link Type | Tests |
|---|---------|----------------------|-----------|-------|
| 1 | AI Extraction (SSE) + ExtractionReviewPanel | YES | EXTRACTED | 20 unit pass |
| 2 | Manual Link REST API | YES | REFERENCED/RELATED/INLINE | None |
| 3 | Inline Issue Extension (TipTap) | NO — doc only | INLINE (unused) | Component tests |
| 4 | AI Chat create-extracted-issues | NO — gap | — | 5 unit pass |
| 5 | KG Populate (background job) | NO — graph only | — | Separate suite |

## Test Results

| Suite | Pass | Skip | Fail |
|-------|------|------|------|
| Unit: IssueExtractionService | 20 | 0 | 0 |
| Unit: CreateExtractedIssues API | 5 | 0 | 0 |
| Integration: ExtractionEndpoint | 3 | 6 | 0 |
| E2E: IssueExtractionE2E | 0 | 8 | 1 |

**E2E failure root cause:** `test_extraction_creates_approval_request` sends `note_id` in request body but current `ExtractIssuesRequest` schema uses `note_id` as a path parameter only. Test always returns 422.

## Auth Domain SDLC Validation

All 7 SDLC stages validated using auth examples:
- Extract: "Fix JWT expiry bug", "Add rate limiting", "OAuth2 flow" — confidence 0.72–0.95
- Extraction service tests use "Fix the login page bug" and "Fix the authentication flow" as fixtures
- Full pipeline: NOTE -> EXTRACT (mocked LLM) -> REVIEW -> CREATE + LINK -> SPRINT -> TRACK

## Critical Findings

1. **Dual endpoint gap:** `workspace_notes_ai.create_extracted_issues` creates issues without `NoteIssueLink`. Only `ai_extraction.approve_extracted_issues` creates the traceability link.
2. **INLINE link type unused:** `NoteLinkType.INLINE` is defined in the model but no code path ever creates a link with this type. InlineIssueExtension only stores refs in TipTap JSON.
3. **Stale e2e test:** One e2e test has been broken since the API was refactored to use path params instead of body for `note_id`.
4. **Frontend-backend type mismatch:** `SourceNotesList` references `CREATED` link type but backend only has EXTRACTED/REFERENCED/RELATED/INLINE.
5. **No unit tests for NoteIssueLinkRepository or workspace_note_issue_links router.**

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] Investigation report exists: `.planning/quick/10-investigate-into-codebase-of-pilotspace-/10-INVESTIGATION-REPORT.md` (443 lines, exceeds 150 minimum)
- [x] All 5 pathway sections present
- [x] Test results documented with pass/fail counts
- [x] Auth domain examples validated (login, OAuth, rate limiting)
- [x] Local LLM compatibility assessed (Section 9)
- [x] Recommendations listed (Section 12)
- [x] No code changes made — investigation only
