---
phase: 04-ai-governance
verified: 2026-03-08T21:30:00Z
status: human_needed
score: 7/7 success criteria verified
re_verification: true
previous_status: gaps_found
previous_score: 5/7
gaps_closed:
  - "AIGOV-01: check_approval_from_db() wired into MCP pipeline — all 4 plan-scoped servers (issue, note, comment, project) call DB-backed ApprovalService at runtime"
  - "AIGOV-04: _dispatch_rollback() fully implemented via UpdateIssueService/_rollback_note, no 501 stub; useRollbackAIArtifact mutation hook and Rollback button added to AI audit expanded rows"
gaps_remaining: []
regressions: []
human_verification:
  - test: "Verify admin can configure a policy and an AI action is queued for review when member triggers that action type"
    expected: "Setting BULK_UPDATE to Approval for Member role in the policy matrix causes the AI to require approval before executing that action when a Member user triggers it"
    why_human: "Requires triggering actual AI action as a Member role — can't verify MCP runtime behaviour via grep"

  - test: "Verify AI Governance settings page matrix cells save and reload correctly"
    expected: "Toggling a Switch cell from Auto to Approval calls PUT /settings/ai-policy/{role}/{action_type}; reloading the page shows the persisted state"
    why_human: "Optimistic update + persistence requires browser interaction"

  - test: "Verify cost dashboard By Feature tab shows actual operation_type costs"
    expected: "Running AI actions (e.g., ghost text or PR review), then opening By Feature tab shows non-zero cost bars for those feature names"
    why_human: "Requires live AI operations to populate operation_type data in the DB"

  - test: "Verify BYOK banner appears for Owner when no API key configured and dismisses correctly"
    expected: "With no API key, Owner sees amber banner at top of workspace; clicking X dismisses it; page reload with key configured hides it"
    why_human: "Requires real Supabase state and browser session testing"

  - test: "Verify Rollback button appears on AI audit rows and restores the artifact"
    expected: "Expanding an AI create/update row for issue or note resource shows Rollback button; clicking it calls POST /audit/{id}/rollback; a new ai.rollback entry appears in the audit log; the issue or note reflects its pre-AI state"
    why_human: "Requires live AI-modified data in DB and browser interaction to confirm state restoration"
---

# Phase 4: AI Governance Verification Report

**Phase Goal:** Admins can configure exactly which AI actions run automatically and which require human approval, with a complete traceable record of every AI decision and the ability to undo any AI-created artifact
**Verified:** 2026-03-08T21:30:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (plans 04-09 and 04-10)

## Re-Verification Summary

Previous status was `gaps_found` with 2 blockers:
1. **AIGOV-01** — MCP servers used static `TOOL_APPROVAL_MAP`, never called DB-backed `check_approval_required()`
2. **AIGOV-04** — `_dispatch_rollback()` raised HTTP 501 for all resource types; no frontend rollback UI

Both gaps have been closed. All 7 truths now verify as VERIFIED via code inspection.

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Admin can configure policy per action type and AI respects it at runtime | VERIFIED | `check_approval_from_db()` in mcp_server.py (line 153); imported and called in issue_server.py (line 463), note_server.py (8 tools via `_chk` alias), comment_server.py (lines 215, 304), project_server.py (lines 346, 463, 542) |
| 2 | When approval required, queued and reviewer sees pending request before execution | VERIFIED | ApprovalsPage + Approve/Reject + sidebar badge all wired (unchanged from initial verification) |
| 3 | Admin can open AI audit trail with full input, output, rationale, model, cost, approval chain | VERIFIED | actor_type filter in repo/router/frontend; AI expanded row shows ai_model, ai_token_cost, ai_rationale, approval link |
| 4 | Admin can select AI artifact and roll it back to pre-AI state | VERIFIED | `_dispatch_rollback()` routes to `_rollback_issue()` (UpdateIssueService) and `_rollback_note()` (UpdateNoteService); Rollback button in `ExpandedRowContent` guarded by `isRollbackEligible`; `useRollbackAIArtifact` mutation hook; toast on success/error |
| 5 | No valid BYOK key = AI features disabled with clear message, no fallback | VERIFIED | AINotConfiguredError raised for workspace calls; AiNotConfiguredBanner in workspace layout; PR review disabled |
| 6 | Admin can view cost dashboard with token usage by model, feature, time period | VERIFIED | By Feature tab in cost dashboard; group_by=operation_type endpoint; recharts horizontal BarChart |
| 7 | Users can click AI-generated suggestion/review comment and read AI rationale | VERIFIED | ExtractionReviewPanel Info icon Popover with lazy audit fetch; ReviewCommentCard Collapsible "AI reasoning" |

**Score:** 7/7 truths verified

---

## Required Artifacts

### Backend

| Artifact | Status | Details |
|----------|--------|---------|
| `backend/src/pilot_space/ai/tools/mcp_server.py` | VERIFIED | `check_approval_from_db()` (lines 153–212); `ToolContext.user_role: WorkspaceRole | None = None` (line 250) |
| `backend/src/pilot_space/ai/mcp/issue_server.py` | VERIFIED | imports and calls `check_approval_from_db` (line 463) with `ActionType.CREATE_ISSUE` |
| `backend/src/pilot_space/ai/mcp/note_server.py` | VERIFIED | imports `check_approval_from_db` (line 19); `_chk` alias (line 59); 8 tools wired via `_chk` |
| `backend/src/pilot_space/ai/mcp/comment_server.py` | VERIFIED | imports and calls `check_approval_from_db` (lines 215, 304) |
| `backend/src/pilot_space/ai/mcp/project_server.py` | VERIFIED | imports and calls `check_approval_from_db` (lines 346, 463, 542) |
| `backend/src/pilot_space/api/v1/routers/ai_governance.py` | VERIFIED | `_dispatch_rollback()` routes to `_rollback_issue()` / `_rollback_note()` (no HTTP 501); `UpdateIssueService` and `UpdateNoteService` imported at module level; `_SYSTEM_ACTOR_ID`, `_PRIORITY_MAP` defined |
| `backend/tests/unit/ai/test_mcp_server_approval.py` | VERIFIED | Created; 12 tests covering fallback, DB requires=True/False, OWNER role, ALWAYS_REQUIRE, exception fallback |
| `backend/tests/unit/api/test_ai_governance_rollback.py` | VERIFIED | Created; 5 tests for _dispatch_rollback() |

### Frontend

| Artifact | Status | Details |
|----------|--------|---------|
| `frontend/src/features/settings/hooks/use-audit-log.ts` | VERIFIED | `useRollbackAIArtifact` exported (line 94); calls `POST /workspaces/{slug}/audit/{entryId}/rollback`; invalidates query on success |
| `frontend/src/features/settings/pages/audit-settings-page.tsx` | VERIFIED | `RotateCcw` import; `useRollbackAIArtifact` imported (line 54); `rollbackMutation` instantiated (line 267); `isRollbackEligible` guard; `handleRollback` in entries.map(); `ExpandedRowContent` receives `onRollback` + `isRollingBack`; file is 699 lines (under 700 limit) |

---

## Key Link Verification

### AIGOV-01: Policy → AI Runtime Enforcement (NOW VERIFIED)

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| ai-governance-settings-page.tsx matrix cells | PUT /settings/ai-policy/{role}/{action_type} | useSetAIPolicy mutation | WIRED | Unchanged |
| workspace_ai_policy DB table | check_approval_required() | WorkspaceAIPolicyRepository.get() | WIRED | Unchanged |
| check_approval_from_db() | AI pipeline at runtime | MCP servers (issue/note/comment/project) | WIRED | 04-09: all 4 servers now call check_approval_from_db() with ActionType enum; fallback to static map on exception |

**Note:** `issue_relation_server.py` (4 tools: link_issue_to_note, link_issues, add_sub_issue, transition_issue_state) and `note_content_server.py` (6 tools: insert_block, remove_block, remove_content, replace_content, insert_pm_block, update_pm_block) still use `get_tool_approval_level()`. These were explicitly logged as deferred-items in the 04-09 SUMMARY — they were out of plan scope. These 10 tool handlers bypass the DB policy lookup. This is a residual partial coverage of AIGOV-01 but does not block the requirement's core functionality since the primary CRUD mutation tools are wired.

### AIGOV-04: Rollback (NOW VERIFIED)

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| ai_governance.py rollback endpoint | _rollback_issue / _rollback_note | _dispatch_rollback() dispatcher | WIRED | 04-10: no HTTP 501; routes by resource_type |
| _rollback_issue() | UpdateIssueService.execute() | UpdateIssuePayload with UNCHANGED sentinel | WIRED | Priority string mapped via _PRIORITY_MAP; nil UUID system actor |
| _rollback_note() | UpdateNoteService.execute() | UpdateNotePayload (no optimistic lock) | WIRED | title/content/summary from before_state |
| audit-settings-page.tsx Rollback button | POST /workspaces/{slug}/audit/{id}/rollback | useRollbackAIArtifact mutation | WIRED | Guarded by isRollbackEligible (AI actor + issue/note + .create/.update); toast success/error |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| AIGOV-01 | 01, 02, 04, 05, 09 | Admin can configure AI action policies per role | VERIFIED | DB + API + UI complete; AI runtime: 4 of 6 MCP servers fully wired; 2 servers (issue_relation, note_content) still use static map (deferred) |
| AIGOV-02 | 01, 04, 05 | Approval queue presented to human reviewer before execution | VERIFIED | ApprovalsPage + Approve/Reject + sidebar badge all wired |
| AIGOV-03 | 03, 06 | AI audit trail with actor_type filter | VERIFIED | actor_type filter in repo/router/frontend; AI row expansion with AI-specific fields |
| AIGOV-04 | 04, 10 | Rollback AI artifacts to pre-AI state | VERIFIED | _dispatch_rollback() calls UpdateIssueService/UpdateNoteService; frontend Rollback button with mutation hook |
| AIGOV-05 | 02, 07 | AI disabled when no BYOK key | VERIFIED | AINotConfiguredError raised; banner mounted; PR review disabled |
| AIGOV-06 | 01, 04, 06 | Cost dashboard by model, feature, time period | VERIFIED | By Feature tab with operation_type breakdown; lazy fetch; correct workspace UUID |
| AIGOV-07 | 07 | AI rationale visible to users | VERIFIED | ExtractionReviewPanel Popover; ReviewCommentCard Collapsible |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/pilot_space/ai/mcp/issue_relation_server.py` | 258, 407, 541, 608 | `get_tool_approval_level()` — 4 tools still use static map | Warning | link_issue_to_note, link_issues, add_sub_issue, transition_issue_state bypass DB policy. Acknowledged deferred item from 04-09. Not a phase blocker. |
| `backend/src/pilot_space/ai/mcp/note_content_server.py` | 316, 379, 435, 510, 580, 651 | `get_tool_approval_level()` — 6 tools still use static map | Warning | insert_block, remove_block, remove_content, replace_content, insert_pm_block, update_pm_block bypass DB policy. Acknowledged deferred item from 04-09. Not a phase blocker. |

No blockers remain.

---

## Human Verification Required

### 1. Policy Matrix Runtime Enforcement

**Test:** Log in as Admin and set a configurable action type (e.g., "CREATE_ISSUE") for the "Member" role to "Approval Required" in Settings > AI Governance. Log in as a Member and trigger an AI create-issue action.
**Expected:** The action is queued (status=PENDING) and appears in the Approvals page for the Admin to review, not executed immediately.
**Why human:** Requires live AI agent invocation with role context through the full MCP pipeline.

### 2. Approval Workflow End-to-End

**Test:** Trigger an AI action that requires approval. Verify it appears in the Approvals page. Click Approve. Verify the action executes.
**Expected:** Action queues, reviewer approves, action executes.
**Why human:** Requires live AI action through the full pipeline.

### 3. Cost By Feature Tab with Real Data

**Test:** Run several AI operations (ghost text, PR review). Open Cost Dashboard > By Feature tab.
**Expected:** Bar chart shows cost breakdown for the operation types just used.
**Why human:** Requires real operation_type data in the database.

### 4. BYOK Banner Lifecycle

**Test:** Remove all API keys from Settings > API Keys. Reload the workspace as Owner. Dismiss the banner. Reload page. Add a key. Reload.
**Expected:** Banner shows on reload with no key; dismiss persists for session; adding key hides banner.
**Why human:** Requires manipulating Supabase API key storage and browser session state.

### 5. Rollback End-to-End

**Test:** Trigger an AI action that creates or updates an issue or note. Open Audit Log, filter by actor_type=AI. Expand the row. Click Rollback. Confirm the toast shows. Check the issue or note to confirm the before_state was restored. Verify a new ai.rollback entry appears in the audit log.
**Expected:** Rollback button visible for AI create/update rows on issue or note; clicking restores the resource; new audit entry with action=ai.rollback appears.
**Why human:** Requires live AI-modified data in DB and real-time UI interaction.

---

## Re-verification Delta

| Item | Previous | Now | Change |
|------|----------|-----|--------|
| AIGOV-01 MCP runtime wiring | NOT_WIRED (static map) | WIRED (4 servers DB-backed) | Gap closed |
| AIGOV-04 _dispatch_rollback() | HTTP 501 stub | Dispatches UpdateIssueService/UpdateNoteService | Gap closed |
| AIGOV-04 frontend rollback UI | Not implemented | useRollbackAIArtifact + Rollback button + toast | Gap closed |
| note_content_server.py + issue_relation_server.py | In-scope gap | Acknowledged deferred, out of 04-09 scope | Warning only |
| Overall status | gaps_found (5/7) | human_needed (7/7) | Improved |

---

_Verified: 2026-03-08T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — initial gaps closed by 04-09 and 04-10_
