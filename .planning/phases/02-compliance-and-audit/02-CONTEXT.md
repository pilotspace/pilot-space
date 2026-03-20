# Phase 2: Compliance & Audit - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Every user and AI action leaves an immutable, queryable, exportable record that a compliance officer can use as evidence. This phase covers: audit log capture (all resources), AI action recording, admin filter/export UI, data retention configuration, and immutability enforcement. It does not cover AI governance policies (Phase 4) or encryption (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Audit Table Architecture
- **New `audit_log` table** — separate from the existing `Activity` model. `Activity` is issue-scoped (non-nullable `issue_id` FK) and serves the per-issue timeline UI. `audit_log` is workspace-wide, covers all resource types, and is the compliance record.
- `audit_log` uses `WorkspaceScopedModel` base class (automatic `workspace_id` FK + RLS)
- Schema fields beyond base model:
  - `actor_id` (UUID, nullable — NULL for system/AI-only actions)
  - `actor_type` (enum: `USER` | `SYSTEM` | `AI`)
  - `action` (string: dot-notation, e.g. `"issue.create"`, `"note.delete"`, `"member.role_changed"`, `"ai.pr_review"`)
  - `resource_type` (string: `"issue"`, `"note"`, `"cycle"`, `"member"`, `"workspace_setting"`, `"ai_action"`)
  - `resource_id` (UUID, nullable — NULL for workspace-level actions)
  - `payload` (JSONB: `{"before": {...}, "after": {...}}` diff of changed fields)
  - `ai_input` (JSONB, nullable — only populated for AI actor_type)
  - `ai_output` (JSONB, nullable — only populated for AI actor_type)
  - `ai_model` (string, nullable)
  - `ai_token_cost` (int, nullable — token count)
  - `ai_rationale` (text, nullable — AI's stated rationale for the action)
  - `ip_address` (string, nullable — from X-Forwarded-For / request context)

### Immutability Enforcement
- **PostgreSQL BEFORE trigger** on `audit_log` that `RAISE EXCEPTION` on any `UPDATE` or `DELETE` — cannot be bypassed by RLS grants or `service_role`. This is the primary enforcement mechanism.
- No `DELETE` or `UPDATE` endpoints exposed in the API for audit log entries — defense in depth.
- RLS: Read-only for `admin`/`owner` roles; no write policies on audit_log for any user-level role.

### AI Action Capture Strategy
- **Write separate `audit_log` entries for every AI action** using the `ai_*` columns — do not augment `ai_cost_record`.
- `ai_cost_record` continues to serve its purpose (Phase 4 cost dashboard). The `audit_log` AI fields serve compliance. Both are written on the same AI event — different tables, different consumers.
- Implementation: New `AuditLogHook` in the AI SDK hooks lifecycle (`backend/src/pilot_space/ai/sdk/hooks.py`) — fires after each AI tool call/action completion, writes to `audit_log` with `actor_type=AI`, capturing input/output/model/tokens/rationale from the result.
- `actor_id` for AI entries is the user who triggered the AI action (the human-in-the-loop actor).

### Data Retention Mechanism
- **pg_cron** (Supabase native extension) — a daily scheduled job, not pgmq. Retention is time-driven (schedule), not event-driven (queue).
- A migration creates the pg_cron job: purges `audit_log` rows where `created_at < NOW() - INTERVAL '1 day' * audit_retention_days` per workspace.
- New `audit_retention_days` field on `workspace_settings` (default: 90, admin-configurable via API — no UI in this phase, API-only is sufficient).
- Zero extra infrastructure: pg_cron is already available on the Supabase stack.

### Admin UI — Placement, Filters, Export
- **Location**: Settings > Audit — new page at `/settings/audit`, added alongside the Phase 1 security pages (SSO, Roles, Security). Consistent placement for compliance officers.
- **Filters** (matching AUDIT-03): actor (user search autocomplete), action type (dropdown with all `action` values), resource type (dropdown), date range (start + end date pickers). All filters are optional and combinable.
- **Export**: Inline stream to browser — no background job needed. Enterprise audit exports are ad-hoc compliance reviews, not bulk pipelines.
  - If filtered result exceeds 10,000 rows, show a warning prompt before downloading.
  - Both JSON and CSV supported (AUDIT-04). Format selector toggle in the export UI.
- **UI pattern**: Read-only table, no edit/delete affordances. Follows Phase 1 settings page pattern: plain React (no `observer()`), TanStack Query for data fetching.
- **Table columns**: Timestamp, Actor, Action, Resource Type, Resource ID (truncated), IP Address. Row expansion reveals full payload diff and AI fields.

### Claude's Discretion
- Exact `action` string vocabulary (the dot-notation list of all capturable events) — researcher will enumerate all events to instrument
- Whether `payload` diff is computed at the service layer or via SQLAlchemy event listeners (`after_update` etc.)
- Exact PostgreSQL trigger syntax and migration ordering relative to the table creation
- Pagination strategy for the audit log admin table (cursor-based vs. offset — cursor preferred for large tables)
- Whether to add a Meilisearch index for audit log full-text search (probably not needed; DB filtering sufficient for compliance use)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Activity` model (`infrastructure/database/models/activity.py`): Same `WorkspaceScopedModel` base, similar index pattern (`ix_*`). Audit log table follows same conventions — but is a NEW model, not an extension of Activity.
- `ai_cost_record.py`: Already captures `model`, `token_count`, `cost_usd` per AI action. Audit hook can reference same data source to avoid double-computing token costs.
- `ai/sdk/hooks.py` + `hooks_lifecycle.py`: Existing hook infrastructure. `AuditLogHook` slots in here without touching agent core code.
- `api/v1/schemas/export.py`: Export schema patterns already exist — reuse or extend for audit CSV/JSON export.
- `infrastructure/database/rls.py`: `get_workspace_rls_policy_sql()` template for new audit_log RLS policies.
- Settings pages at `frontend/src/features/settings/pages/`: `security-settings-page.tsx`, `sso-settings-page.tsx` show the pattern to follow for the new audit page.

### Established Patterns
- `WorkspaceScopedModel`: Base class for all workspace-scoped tables — use for `audit_log`.
- Settings pages: plain React (no `observer()`), TanStack Query for all data fetching — Phase 1 established this pattern for security pages.
- Backend router: new `audit.py` router file (700-line limit; dedicated file avoids crowding `workspaces.py`).
- Alembic: single-head required; new migration for `audit_log` table + pg_cron job setup.
- RLS UPPERCASE enum: policies use `'OWNER'`, `'ADMIN'` — same for audit_log read policy.

### Integration Points
- `main.py`: Register `audit_router` alongside Phase 1 new routers (`custom_roles_router`, `sessions_router`, `scim_router`)
- `ai/sdk/hooks.py`: Add `AuditLogHook` to the hook chain — fires on every AI action completion
- All application services that mutate resources (issues, notes, cycles, members, settings): need audit log write calls. Either via SQLAlchemy `after_insert`/`after_update` events or explicit service layer calls.
- `workspace_settings` model: add `audit_retention_days` integer field (migration required)
- Frontend settings nav: add "Audit" entry to settings sidebar navigation

</code_context>

<specifics>
## Specific Ideas

- The `action` field uses dot-notation resource.verb format (e.g., `"issue.create"`, `"member.role_changed"`, `"ai.pr_review"`) — makes filtering by action type clean and extensible.
- AI audit entries: `actor_id` is the user who triggered the AI (human actor), `actor_type=AI` — this lets compliance officers filter "what did user X trigger that caused AI actions" without losing the human accountability chain.
- Immutability is enforced at the DB layer (trigger), not just the application layer — matches compliance officer expectations for SOC 2 evidence.
- Payload diff format: `{"before": {field: value}, "after": {field: value}}` — only changed fields, not the full record. Keeps storage efficient.

</specifics>

<deferred>
## Deferred Ideas

- SOC 2 Type II evidence package auto-generation — AUDIT-V2-01, future milestone
- GDPR data subject export and deletion workflow — AUDIT-V2-02, future milestone
- Meilisearch full-text search on audit log — not needed for AUDIT-03 filter requirements; DB indexes sufficient
- Audit log webhooks (push audit events to external SIEM like Splunk) — not in scope; export covers compliance need

</deferred>

---

*Phase: 02-compliance-and-audit*
*Context gathered: 2026-03-08*
