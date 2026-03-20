# Phase 3: Multi-Tenant Isolation - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Workspace data isolation is verifiably tested at the API layer; workspace admins can upload their own encryption key that encrypts note/issue content; per-workspace rate limits and storage quotas are DB-configurable and enforced; and the self-hosted operator can view a cross-workspace health dashboard via a secure token. No real-time collaborative editing, no external KMS, no remediation actions on the admin dashboard.

</domain>

<decisions>
## Implementation Decisions

### Isolation Verification (TENANT-01)

- **Integration test suite (not unit tests)**: Provision two isolated workspaces + two users in the test DB. Authenticate as user A, send requests to all major API endpoint groups (issues, notes, cycles, members, audit log, AI sessions) using workspace B's IDs and workspace A's JWT. Assert every response is 403 or 404 — never 200 with workspace B data.
- **Fix the RLS enum case bug first**: STATE.md flags that RLS policies use UPPERCASE enum values but some migrations stored lowercase. Resolve this discrepancy before running isolation tests — otherwise false negatives hide real leaks.
- **API endpoint audit**: Grep all routers for workspace-scoped queries that do not call `set_rls_context()`. Any route that reads workspace data without RLS context is a confirmed leak. Fix before tests pass.
- **AI MCP tool RLS coverage**: MCP tool handlers that perform DB reads (graph tools, issue tools, note tools) must also call `set_rls_context()`. These run inside AI sessions and already have `user_id` + `workspace_id` available — verify coverage.
- **Verification artifact**: The integration test file itself IS the evidence for TENANT-01 — all tests must pass with a real PostgreSQL test DB (`TEST_DATABASE_URL`). SQLite will not exercise RLS.

### Workspace Encryption (TENANT-02)

- **Envelope encryption** — no external KMS required, no new infrastructure:
  1. Workspace admin generates or provides a 256-bit base64 key in the Settings UI
  2. Backend stores it encrypted with the system master `ENCRYPTION_KEY` Fernet key (same key already used for BYOK AI keys)
  3. When reading/writing content fields, the backend: (a) fetches workspace encryption key, (b) decrypts it with master key, (c) uses it to encrypt/decrypt the content field
- **New table** `workspace_encryption_key`: `workspace_id` (unique FK), `encrypted_workspace_key` (Fernet ciphertext of the workspace key), `key_hint` (nullable — last 8 chars of raw key for UI display), `key_version` (int, starts at 1 for rotation), `created_at`, `updated_at`
- **Encrypted field scope** — content fields only (not metadata):
  - `notes.body` (raw TipTap JSON stored as text)
  - `issues.description`
  - `audit_log.ai_input` and `audit_log.ai_output` (JSONB serialized to string before encryption)
  - NOT encrypted: IDs, timestamps, status enums, titles, actor references — metadata stays searchable
- **Verification endpoint**: `POST /workspaces/{slug}/encryption/verify` — decrypts a known sample record with the provided key, returns `{"verified": true}` or 422. No data returned, just confirmation.
- **Key rotation**: `PUT /workspaces/{slug}/encryption/key` — admin supplies new key, backend re-encrypts all affected fields in a background job (pgmq queue task), stores new key version. Old key retained in history for the duration of any in-progress rotation.
- **If no workspace key configured**: Fields stored in plaintext (same as today). Encryption is opt-in per workspace — operator can require it via config, but it is not mandatory.
- **Admin UI**: Settings > Security > Encryption — shows encryption status (enabled/disabled), key hint, key version, last rotated date. Enable/disable/rotate buttons. Consistent with Phase 1 security settings page pattern.

### Rate Limits & Storage Quotas (TENANT-03)

- **Configuration storage**: New columns on `workspaces` table (not a separate table — quota config is workspace-level metadata):
  - `rate_limit_standard_rpm` (int, nullable — NULL = system default 1000)
  - `rate_limit_ai_rpm` (int, nullable — NULL = system default 100)
  - `storage_quota_mb` (int, nullable — NULL = unlimited)
- **Rate limiter middleware** reads per-workspace config via Redis cache (key: `ws_limits:{workspace_id}`, 60s TTL). On cache miss, fetches from DB and populates. Falls back to hardcoded defaults if Redis is unavailable. No per-request DB query.
- **Storage quota tracking**: New `workspace_storage_usage` materialized view (or background-computed column) summing byte lengths of note body + issue description + Supabase Storage attachments per workspace. Recomputed on write (delta update, not full recount). Checked pre-write:
  - 80% threshold → non-blocking warning header `X-Storage-Warning: 0.80` in write responses
  - 100% threshold → hard block HTTP 507 Insufficient Storage
- **Rate limit enforcement**: Hard 429 (same as current behavior) — consistent with existing middleware, no behavior change, just config source changes.
- **Admin UI**: Settings > Workspace > Usage — shows current vs. limit bars for requests (RPM) and storage (MB). Owner can edit limit fields inline. Admins can view but not edit. New API endpoint `GET/PATCH /workspaces/{slug}/settings/quota`.

### Super-Admin Operator Dashboard (TENANT-04)

- **Super-admin identity**: `PILOT_SPACE_SUPER_ADMIN_TOKEN` environment variable (opaque bearer token, operator sets it at deployment time). Checked in a new `get_super_admin` FastAPI dependency — completely separate from Supabase JWT auth. No DB user flag, no special workspace membership.
- **Backend routes**: `/api/v1/admin/*` prefix — not under `/workspaces/{slug}/`. Uses `service_role` DB connection (bypasses RLS) to query across all workspaces. New `admin_router.py` file.
- **Frontend route**: `/admin` — outside of `(workspace)/[workspaceSlug]` route group. Simple standalone page, no workspace nav shell. Auth: Bearer token stored in session (not Supabase JWT).
- **Dashboard data** (read-only):
  - Workspace table: name, slug, member count, owner email, created date, last active (latest `audit_log.created_at`), storage used, AI request count (from `audit_log` where `actor_type = 'AI'`), rate limit violation count (from rate limiter logs)
  - Clicking a workspace row expands: top 5 most active members by action count, recent AI actions (last 10), current quota/rate limit config
- **No remediation actions in this phase** — force-terminate, disable workspace, reset keys are deferred. Dashboard is read-only.
- **Access pattern**: Operator opens `https://your-instance.com/admin`, enters token in a login form, session is stored as a cookie or sessionStorage token for the browser tab. Not integrated with Supabase Auth.

### Claude's Discretion

- Exact field-level encryption implementation: transparent column encrypt/decrypt in SQLAlchemy event listeners (`after_load`, `before_insert`, `before_update`) vs. explicit encrypt/decrypt calls in repository layer — choose the approach that keeps the 700-line file limit and doesn't require touching every existing repository.
- Background job design for key rotation: single pgmq task per workspace with cursor-based progress, or chunked batch tasks — choose based on `notes`/`issues` table size typical for small teams (few thousand rows at most).
- Storage usage calculation: materialized view vs. incremental delta columns — choose based on query complexity and whether Supabase Storage provides a native size API.
- Admin dashboard refresh strategy: polling interval vs. manual refresh button — choose manual refresh (YAGNI; polling adds complexity for a low-frequency operator view).
- Super-admin auth token storage on frontend: sessionStorage (cleared on tab close) is recommended over localStorage (persists indefinitely).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `EncryptionService` (`infrastructure/encryption.py`): Fernet-based encrypt/decrypt. Already used for BYOK AI keys. Workspace encryption will use the same service — workspace key is just another value encrypted by the system master key.
- `encrypt_api_key` / `decrypt_api_key` convenience functions in `encryption.py`: Pattern to follow for workspace content encryption helpers.
- `RateLimitMiddleware` (`api/middleware/rate_limiter.py`): Full Redis sliding window implementation. Needs `_get_workspace_rate_limits(workspace_id)` helper to replace hardcoded `RATE_LIMIT_CONFIGS` lookup.
- `RATE_LIMIT_CONFIGS` dict: Currently hardcoded defaults. Will become fallback defaults when per-workspace config is absent.
- `set_rls_context()` + `get_workspace_rls_policy_sql()` (`infrastructure/database/rls.py`): Core isolation machinery. Phase 3 tests this, doesn't change it (except fixing the enum case bug).
- `WorkspaceAPIKey` model: Pattern to follow for `workspace_encryption_key` table — same `WorkspaceScopedMixin`, `UniqueConstraint` on `workspace_id`, Fernet ciphertext column.
- `ai_cost_record.py`, `audit_log` (Phase 2): `audit_log` already has workspace-scoped query support — super-admin dashboard will query it without RLS (service_role connection).
- Settings pages in `frontend/src/features/settings/pages/`: `security-settings-page.tsx` is the pattern — plain React, TanStack Query. New Encryption and Quota pages follow this.
- `cost-dashboard-page.tsx` (`frontend/src/features/costs/`): Existing dashboard with charts and tables. Super-admin dashboard follows this visual pattern (Recharts + shadcn/ui Table).

### Established Patterns

- **WorkspaceScopedMixin**: Use for `workspace_encryption_key` table (same workspace FK + RLS).
- **Settings pages**: Plain React (no `observer()`), TanStack Query, new page exported from `features/settings/pages/index.ts`.
- **Service role bypass**: Admin and operator operations use `service_role` connection — established by SCIM (Phase 1).
- **Migration**: Single head required; run `alembic heads` before creating new migration. New columns on `workspaces` table go in a new migration (not edit existing ones).
- **700-line file limit**: `admin_router.py` must be its own file. Encryption helpers in `infrastructure/encryption.py` (already exists) or a new `workspace_encryption.py` if the file grows.
- **DI container wiring**: New `admin_router.py` using `@inject` must be added to `wiring_config.modules` in `container.py`.

### Integration Points

- `workspaces` table model: Add `rate_limit_standard_rpm`, `rate_limit_ai_rpm`, `storage_quota_mb` columns (new migration).
- `RateLimitMiddleware.__init__`: Accept a `workspace_repo` or Redis-based cache fetcher for per-workspace limits.
- `api/v1/main.py`: Register `admin_router` under `/api/v1/admin` (no workspace slug prefix).
- `frontend/src/app/`: Add `/admin` route outside `(workspace)/[workspaceSlug]/` — new route group `(admin)/`.
- Alembic migration chain: Current head is 065 (audit log). New migrations: 066 (workspace_encryption_key table + workspace quota columns), 067 (anything further).

</code_context>

<specifics>
## Specific Ideas

- Isolation tests MUST use a real PostgreSQL test instance (`TEST_DATABASE_URL`). SQLite test mode will not enforce RLS policies and will produce false passes — the testing rules in `.claude/rules/testing.md` explicitly call this out.
- The RLS enum case bug fix (STATE.md concern) is a prerequisite to isolation tests passing — schedule it as the first task in the phase.
- Super-admin token should be logged as `"****"` in structured access logs — never logged in plaintext.
- Encryption verification endpoint: returns only `{"verified": true, "key_version": 1}` — no decrypted content. This is the UX proof that the user's key works.
- Rate limit violation count on the admin dashboard is derived from existing rate limiter logs (`logger.warning("Rate limit exceeded", ...)`) — aggregate from structured log stream, or from a new lightweight counter in Redis per workspace.

</specifics>

<deferred>
## Deferred Ideas

- Remediation actions on admin dashboard (disable workspace, force-terminate sessions, reset encryption key) — future phase
- External KMS integration (AWS KMS, HashiCorp Vault) for workspace key storage — BYOK-v2, future milestone
- Storage quota notifications (email/webhook to admin when approaching limit) — future phase
- Automated RLS regression suite in CI (nightly cross-workspace probe job) — operational readiness, Phase 5
- Per-project quota overrides (projects within a workspace with own limits) — out of scope

</deferred>

---

*Phase: 03-multi-tenant-isolation*
*Context gathered: 2026-03-08*
