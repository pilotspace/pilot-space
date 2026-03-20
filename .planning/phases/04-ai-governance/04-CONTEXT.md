# Phase 4: AI Governance - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Admins configure exactly which AI actions auto-execute vs. require approval (per role, per action type); every AI decision leaves a traceable audit record users can inspect for rationale; any AI-created or AI-modified artifact can be rolled back; AI features are hard-disabled if no BYOK key is configured; and cost is visible by model, feature, and time. This phase does NOT cover per-project policy overrides (deferred v2), AI cost budgeting with auto-disable, or LDAP/GitLab.

</domain>

<decisions>
## Implementation Decisions

### AIGOV-01: AI Policy Granularity (per role × per action type)

**Decision**: Upgrade from workspace-level `CONSERVATIVE/BALANCED/AUTONOMOUS` to a per-role × per-action-type policy matrix stored in a new DB table.

- **New table** `workspace_ai_policy`: `(workspace_id, role [WorkspaceRole enum: OWNER|ADMIN|MEMBER|GUEST], action_type [ActionType enum], requires_approval bool)` — one row per (workspace, role, action_type) combination; absence of a row = fall back to current hardcoded default
- **ALWAYS_REQUIRE actions remain hardcoded** (DELETE_*, MERGE_PR, BULK_DELETE) — non-configurable regardless of policy table; these never appear in the admin UI as toggleable
- **Owner role is always auto-execute for DEFAULT_REQUIRE actions** — hardcoded, non-configurable (owners are the trust root; cannot configure approval for themselves on their own workspace)
- **`ApprovalService.check_approval_required()`** gains a `user_role: WorkspaceRole` parameter; queries `workspace_ai_policy` table first, then falls back to current CONSERVATIVE/BALANCED/AUTONOMOUS level logic if no row exists
- **Admin UI**: Settings > AI Governance — a matrix table with action types as rows (grouped by category: Content Actions, Code Actions, Administrative Actions) and roles (Admin, Member, Guest) as columns. Each cell is a toggle: "Auto" | "Approval". Owner column is always "Auto" (greyed out, non-editable). ALWAYS_REQUIRE rows show "Always" locked in all cells.
- **Default state**: First deploy creates no rows in `workspace_ai_policy`; fallback behavior = current hardcoded behavior (backward compatible)

### AIGOV-02: Approval Queue UX

**Decision**: Dedicated page + sidebar badge; no full blocking of triggering user.

- **New route**: `/[workspaceSlug]/approvals` — dedicated page accessible from sidebar
- **Sidebar nav item**: "Approvals" with a badge showing count of pending items; visible to Owner/Admin only; badge hidden when count = 0
- **Triggering user experience**: When an action is queued (not blocked), the relevant UI element (e.g., extracted issue list in ExtractionReviewPanel) shows an inline "Awaiting approval" badge state — items are visible but not yet executable. A toast informs: "Your request has been sent for approval."
- **Reviewer experience on Approvals page**: Table with columns: Action type, Requested by (user avatar + name), AI agent, Context preview (first 100 chars of action payload), Time requested. Row expansion shows full action payload and AI rationale. Approve / Reject buttons in each row. Bulk approve/reject not in scope for v1.
- **After approval**: AI action executes immediately; triggering user and reviewer each receive a notification (existing notification system)
- **After rejection**: Action discarded; triggering user receives notification with reviewer's rejection reason (optional reason text field on the Reject dialog)
- **Expiration**: Existing `DEFAULT_EXPIRATION_HOURS = 24` behavior unchanged; expired requests auto-move to "Expired" status tab
- **No changes** to existing `AIApprovalRequest` model or `ApprovalRepository` — frontend page wires to existing `ai_approvals.py` endpoints

### AIGOV-03: AI Audit Trail (extends Phase 2 audit log UI)

**Decision**: Extend the existing audit settings page rather than build a new one.

- **Phase 2 already captures**: `ai_input`, `ai_output`, `ai_rationale`, `ai_model`, `ai_token_cost` in `audit_log` — no new backend capture needed
- **New UI additions to existing AuditSettingsPage**: Add `actor_type = AI` filter option in the Actor Type dropdown; when an AI row is expanded, show additional AI-specific fields: Model, Token cost, AI rationale text (if present)
- **Approval chain link**: AI audit rows that have an associated `AIApprovalRequest` show a "View approval" link in the expanded panel (fetches from `GET /approvals/{id}`)
- No new backend endpoints needed for AIGOV-03 — the existing audit log API already returns AI fields

### AIGOV-04: AI Artifact Rollback

**Decision**: Per-artifact rollback from the audit trail; reuses existing `payload.before` snapshot.

- **New API endpoint**: `POST /workspaces/{slug}/audit/{entry_id}/rollback` — reads `audit_log.payload.before` and dispatches a write to the appropriate service (`IssueService`, `NoteService`, etc.) based on `resource_type`
- **Rollback-able**: Only entries where `actor_type = AI` AND (`action` ends in `.create` or `.update`) — AI-created and AI-modified artifacts only
- **Not rollback-able**: AI deletions (restoration of deleted data is complex and deferred to v2); user-initiated actions (non-AI entries)
- **Rollback creates a new audit entry**: `action = "ai.rollback"`, `actor_type = USER` (the admin who triggered rollback), `payload.before` = current state, `payload.after` = restored state — full traceability of rollback itself
- **UI**: "Rollback" button appears in audit row expansion only when the row is rollback-able. Clicking opens a confirmation dialog showing what will be restored. No batch rollback in v1.
- **Permission**: Owner and Admin only (same as audit log access)

### AIGOV-05: BYOK Strict Enforcement

**Decision**: Hard disable at the provider layer; env keys remain for system-only operations.

- **Remove fallback path** in `ProviderSelector` for workspace-scoped AI calls: if no valid `WorkspaceAPIKey` is found for the workspace, raise `AINotConfiguredError` (maps to HTTP 503 with error code `AI_BYOK_REQUIRED`)
- **Platform env keys** (`anthropic_api_key` in config.py) remain but are marked `_SYSTEM_ONLY` — used exclusively for: admin dashboard AI metrics aggregation, background system tasks. They are never injected into user-triggered AI request paths.
- **New status endpoint**: `GET /workspaces/{slug}/settings/ai-status` → `{"byok_configured": bool, "providers": ["anthropic"]}` — frontend polls this on workspace load
- **Frontend when `byok_configured: false`**:
  - `AiNotConfiguredBanner` at the top of the workspace layout (dismissable per session, re-shown on next load) — visible to Owner only; links to Settings > API Keys
  - All AI action triggers (ghost text, slash commands, PR review button) show `disabled` state with a tooltip: "AI not available — configure an API key in Settings"
  - Non-Owner members see no banner; AI controls are simply disabled without explanation (avoids confusing members with infra details)

### AIGOV-06: Cost Dashboard — "By Feature" Dimension

**Decision**: Add `operation_type` column to existing `AICostRecord`; extend existing frontend dashboard with a new tab.

- **New column** on `ai_cost_records`: `operation_type` (nullable string, values from `AIOperation` enum in `telemetry.py`: `ghost_text`, `pr_review`, `issue_extraction`, `issue_enhancement`, `conversation`, etc.)
- **Migration**: Add nullable column with no default — existing rows get NULL, new rows populated by `CostTracker.track()` call site
- **New API filter**: `GET /workspaces/{slug}/costs/summary?group_by=operation_type` — returns `by_feature: dict[str, float]`
- **Frontend**: New "By Feature" tab on existing `cost-dashboard-page.tsx` using existing `CostByAgentChart` component shape (bar chart, same Recharts + shadcn/ui pattern). No new chart component needed — reuse with different data key.
- **Fix CostTracker singleton bug** (flagged in STATE.md): `CostTracker` and `ApprovalService` singletons in DI container currently have `session=None` — cost records are silently dropped. Fix: make `CostTracker` a request-scoped `providers.Factory` (same as Phase 2 `AuditLogHook` pattern), not a singleton.

### AIGOV-07: AI Rationale Display

**Decision**: Context-appropriate display; no rationale for ghost text (latency); "Why?" expandable for everything else.

- **Issue extraction** (`ExtractionReviewPanel`): Each extracted issue card gets an "ⓘ" icon button that opens a Radix `Popover` with the `ai_rationale` text from the associated `audit_log` entry. Fetched lazily on icon click (not pre-loaded with the list).
- **PR review comments**: Each `ReviewComment` in the PR review tab renders an expandable "AI reasoning" disclosure section (using shadcn/ui `Collapsible`). The rationale is embedded in the review comment response from the backend (already in `ai_rationale` on the audit entry).
- **Approval queue items**: Rationale shown directly in the row expansion (always visible to reviewer — critical for making good approval decisions). No additional fetch needed (rationale stored in `AIApprovalRequest.context`).
- **Ghost text completions**: No rationale. Latency-critical; popovers on every ghost text suggestion would be disruptive UX.
- **Data source**: `audit_log.ai_rationale` fetched via `GET /workspaces/{slug}/audit?actor_type=AI&resource_id={id}` for on-demand rationale loading. No new backend endpoint needed.

### Claude's Discretion

- Exact Alembic migration ordering for `workspace_ai_policy` table and `ai_cost_records.operation_type` column
- RLS policies on `workspace_ai_policy` (standard workspace isolation pattern)
- `ProviderSelector` internal refactor to thread workspace_id through key resolution (may require adding `workspace_id` parameter to `select()` method)
- Exact HTTP error shape for `AINotConfiguredError` (follow existing RFC 7807 `application/problem+json` pattern)
- Whether to use Radix `Tooltip` or `Popover` for rationale on PR review (Popover preferred — more content, needs to be dismissable)
- Sidebar "Approvals" nav item placement (after "Settings", before workspace-level items)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ApprovalService` (`ai/infrastructure/approval.py`): Classification logic (ALWAYS_REQUIRE/DEFAULT_REQUIRE/AUTO_EXECUTE), `create_approval_request()`, `check_approval_required()`. Phase 4 adds role parameter and DB policy lookup — does not replace the core logic.
- `ApprovalRepository` (`infrastructure/database/repositories/approval_repository.py`): Full CRUD for `AIApprovalRequest`. Frontend approval page wires directly to existing `ai_approvals.py` router endpoints.
- `AICostRecord` model (`infrastructure/database/models/ai_cost_record.py`): Add `operation_type` nullable column. `CostTracker` (`ai/infrastructure/cost_tracker.py`) writes to this model — add `operation_type` param to `track()` method.
- `CostDashboardPage` + `CostByAgentChart` + `CostTrendsChart` (`frontend/src/features/costs/`): Existing Recharts + shadcn/ui charts. "By Feature" tab reuses `CostByAgentChart` shape with `operation_type` as the grouping key.
- `audit_log` model (Phase 2): Already has `ai_rationale`, `ai_input`, `ai_output`, `ai_model`, `ai_token_cost`. No schema changes needed for AIGOV-03/07.
- `AuditSettingsPage` (`frontend/src/features/settings/pages/audit-settings-page.tsx`): Extend with AI actor type filter. Phase 2 pattern: plain React, TanStack Query.
- `EncryptionService` (`infrastructure/encryption.py`): Not changed, but `WorkspaceAPIKey` lookup pattern used in Phase 3 is the reference for how `ProviderSelector` should fetch workspace keys.
- `ExtractionReviewPanel` (frontend): Rationale "ⓘ" icon added here using Radix `Popover`.

### Established Patterns

- **Settings pages**: Plain React (no `observer()`), TanStack Query — follow for new AI Governance settings page and Approvals page.
- **Singleton → Factory fix**: Phase 2 `AuditLogHook` used `session_factory` for out-of-request writes. Phase 4 needs `CostTracker` to become a request-scoped `providers.Factory` in `container.py`.
- **700-line file limit**: `workspace_ai_policy` repository goes in its own file. Admin AI governance page follows feature folder structure under `features/settings/pages/`.
- **RLS on new tables**: `workspace_ai_policy` uses standard `get_workspace_rls_policy_sql()` template. Admin read = OWNER + ADMIN; write = OWNER only.
- **Error format**: RFC 7807 `application/problem+json` — `AINotConfiguredError` must follow this shape.

### Integration Points

- `ProviderSelector.select()` → add `workspace_id` parameter to thread key resolution
- `ApprovalService.check_approval_required()` → add `user_role: WorkspaceRole` parameter + DB policy lookup
- `container.py` → change `cost_tracker` from Singleton to Factory; add `workspace_ai_policy_repository` Factory
- `api/v1/main.py` → register new `ai_governance_router.py` for policy CRUD and rollback endpoint
- `frontend/src/app/(workspace)/[workspaceSlug]/approvals/` → new route for approval queue page
- Sidebar navigation → add "Approvals" item with badge (Owner/Admin only)
- `ai_costs.py` router → add `group_by=operation_type` query parameter to summary endpoint

</code_context>

<specifics>
## Specific Ideas

- User said "you decide all by transparent all in step by step" — full Claude discretion granted for all implementation details; decisions above are Claude's choices, made explicit for downstream agents
- The `CostTracker singleton → Factory` fix is flagged as a known bug in STATE.md ("silently drop cost/approval records") — Phase 4 is where this gets fixed
- The BYOK env fallback bug is also explicitly flagged in STATE.md as a "blocking requirement for AIGOV-05" — must be removed, not just deprecated
- `AiNotConfiguredBanner` should match the dismissable pattern of any existing workspace banners (check if one exists before creating new component)

</specifics>

<deferred>
## Deferred Ideas

- Per-project AI governance policy overrides (override workspace defaults at project level) — AIGOV-V2-01 already in v2 requirements
- AI cost budgeting with auto-disable when monthly budget is reached — AIGOV-V2-02 in v2 requirements
- Rollback of AI-deleted artifacts — restoration of deleted data adds complexity; deferred to v2
- Bulk approve/reject in the approval queue — YAGNI for v1; single-item workflow sufficient

</deferred>

---

*Phase: 04-ai-governance*
*Context gathered: 2026-03-08*
