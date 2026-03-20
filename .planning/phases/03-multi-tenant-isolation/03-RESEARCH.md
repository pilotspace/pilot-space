# Phase 3: Multi-Tenant Isolation - Research

**Researched:** 2026-03-08
**Domain:** PostgreSQL RLS, Fernet envelope encryption, Redis rate limiting, FastAPI admin patterns
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Isolation Verification (TENANT-01):**
- Integration test suite (not unit tests): provision two isolated workspaces + two users in the test DB. Authenticate as user A, send requests to all major API endpoint groups using workspace B's IDs and workspace A's JWT. Assert every response is 403 or 404.
- Fix the RLS enum case bug first (STATE.md: UPPERCASE in policies vs. lowercase in some migrations).
- API endpoint audit: grep all routers for workspace-scoped queries that do not call `set_rls_context()`.
- AI MCP tool handlers (graph, issue, note servers) must also call `set_rls_context()`.
- Verification artifact: integration test file IS the evidence — must run against real PostgreSQL (`TEST_DATABASE_URL`). SQLite will not enforce RLS.

**Workspace Encryption (TENANT-02):**
- Envelope encryption, no external KMS.
- New table `workspace_encryption_key`: workspace_id (unique FK), encrypted_workspace_key (Fernet ciphertext), key_hint (last 8 chars), key_version (int), created_at, updated_at.
- Encrypted fields: `notes.body`, `issues.description`, `audit_log.ai_input`, `audit_log.ai_output`. NOT encrypted: IDs, timestamps, enums, titles.
- Verification endpoint: `POST /workspaces/{slug}/encryption/verify` — returns `{"verified": true, "key_version": 1}` only.
- Key rotation: `PUT /workspaces/{slug}/encryption/key` — re-encrypts all affected fields via pgmq background job, stores new key version.
- If no workspace key configured: fields stored in plaintext. Encryption is opt-in.
- Admin UI: Settings > Security > Encryption — status, key hint, key version, last rotated date.

**Rate Limits & Storage Quotas (TENANT-03):**
- New columns on `workspaces` table (not a separate table): `rate_limit_standard_rpm`, `rate_limit_ai_rpm`, `storage_quota_mb` (all nullable — NULL = system default).
- Rate limiter middleware reads per-workspace config via Redis cache (key: `ws_limits:{workspace_id}`, 60s TTL). Falls back to hardcoded defaults if Redis is unavailable.
- Storage quota tracking: incremental delta update on write. 80% threshold → `X-Storage-Warning: 0.80` header. 100% → HTTP 507 Insufficient Storage.
- Rate limit enforcement: hard 429, consistent with existing middleware.
- Admin UI: Settings > Workspace > Usage — bar charts for requests and storage. Owner can edit limits inline. New endpoint `GET/PATCH /workspaces/{slug}/settings/quota`.

**Super-Admin Operator Dashboard (TENANT-04):**
- Identity: `PILOT_SPACE_SUPER_ADMIN_TOKEN` env var (opaque bearer token). New `get_super_admin` FastAPI dependency — completely separate from Supabase JWT auth. No DB user flag.
- Backend routes: `/api/v1/admin/*` prefix. Uses service_role DB connection (bypasses RLS). New `admin_router.py`.
- Frontend route: `/admin` — outside `(workspace)/[workspaceSlug]` route group. New `(admin)/` route group. Simple standalone page, no workspace nav shell.
- Dashboard data (read-only): workspace table with member count, owner email, created date, last active, storage used, AI request count, rate limit violation count. Row expand: top 5 active members, recent AI actions, quota/rate limit config.
- No remediation actions in this phase.
- Access: token stored in sessionStorage (not localStorage — cleared on tab close).

### Claude's Discretion

- Exact field-level encryption: SQLAlchemy event listeners (`after_load`, `before_insert`, `before_update`) vs. explicit encrypt/decrypt in repository layer — choose approach that keeps 700-line limit without touching every existing repository.
- Background job design for key rotation: single pgmq task per workspace with cursor-based progress vs. chunked batch tasks.
- Storage usage calculation: materialized view vs. incremental delta columns.
- Admin dashboard refresh: manual refresh button (polling deferred per YAGNI).
- Super-admin auth token storage on frontend: sessionStorage recommended.

### Deferred Ideas (OUT OF SCOPE)

- Remediation actions on admin dashboard (disable workspace, force-terminate sessions, reset encryption key)
- External KMS integration (AWS KMS, HashiCorp Vault)
- Storage quota notifications (email/webhook when approaching limit)
- Automated RLS regression suite in CI (nightly cross-workspace probe job)
- Per-project quota overrides
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TENANT-01 | Each workspace operates with complete data isolation — no cross-workspace data leakage at any API layer | RLS machinery verified; test infrastructure exists in `tests/security/`; MCP tool gap identified |
| TENANT-02 | Admin can configure workspace-level encryption for stored data (bring your own encryption key) | Envelope encryption via existing `EncryptionService`; `WorkspaceAPIKey` pattern to follow for new `workspace_encryption_key` table |
| TENANT-03 | Admin can set per-workspace API rate limits and storage quotas | `RateLimitMiddleware` extension point identified; Redis cache pattern established; quota columns on `workspaces` table |
| TENANT-04 | Super-admin (self-hosted operator) can view workspace health, usage metrics, and member activity across all workspaces | SCIM token pattern reusable for super-admin bearer token; service_role bypass pattern established; `/admin` route group design |
</phase_requirements>

## Summary

Phase 3 builds four distinct capabilities on a well-established foundation: PostgreSQL RLS for isolation, Fernet for encryption, Redis for rate limiting, and FastAPI bearer tokens for the admin dashboard. The project already has all underlying infrastructure — this phase wires it together, fixes known gaps, and adds the UI layer.

The most critical prerequisite is the RLS enum case bug documented in STATE.md: some `workspace_members` policies store `OWNER`/`ADMIN` in UPPERCASE while some migrations inserted lowercase values. This must be resolved before the TENANT-01 isolation tests can produce meaningful results. The existing `tests/security/` directory already has the scaffolding for the two-workspace cross-access test pattern.

The encryption approach (envelope encryption using existing `EncryptionService`) is straightforward and follows the established `WorkspaceAPIKey` model. The primary design decision delegated to Claude is whether to use SQLAlchemy event listeners for transparent encryption or explicit repository-layer calls — both are viable, but the event listener approach risks touching the ORM base and creating subtle bugs with async sessions.

**Primary recommendation:** Implement encryption explicitly in repository layer (not ORM events) to keep changes localized and testable. Fix RLS enum case first, then build the isolation test suite, then add encryption/quota/dashboard in parallel waves.

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| cryptography (Fernet) | installed | Symmetric encryption for workspace keys | Already used for BYOK AI keys (`EncryptionService`) |
| redis.asyncio | installed | Rate limit counters, workspace config cache | Already used in `RateLimitMiddleware` |
| SQLAlchemy async | installed | ORM, RLS context via `set_rls_context()` | Project standard |
| FastAPI | installed | HTTP layer, dependency injection | Project standard |

### Supporting (no new dependencies expected)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pgmq (via Supabase) | installed | Background key rotation job | When re-encrypting existing content on key rotation |
| Recharts | installed | Admin dashboard charts | Cost dashboard uses it already — follow `cost-dashboard-page.tsx` pattern |
| shadcn/ui Table | installed | Admin workspace table | Already used in sessions and audit log pages |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fernet envelope encryption | SQLAlchemy-utils EncryptedType | Project already has `EncryptionService`; avoid new library |
| Redis-cached workspace limits | DB query per request | Redis approach avoids hot-path DB reads |
| sessionStorage for admin token | Cookie (httpOnly) | sessionStorage simpler for standalone admin page; httpOnly cookie more secure but requires backend session endpoint |

**Installation:** No new dependencies required.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/pilot_space/
├── api/v1/routers/
│   ├── admin.py               # NEW: /api/v1/admin/* super-admin routes
│   ├── workspace_encryption.py # NEW: /workspaces/{slug}/encryption/* routes
│   └── workspaces.py          # EXISTING: add quota PATCH endpoint
├── infrastructure/database/
│   ├── models/
│   │   └── workspace_encryption_key.py  # NEW: WorkspaceEncryptionKey model
│   ├── repositories/
│   │   └── workspace_encryption_repository.py  # NEW
│   └── workspace_encryption.py  # NEW: encrypt_content / decrypt_content helpers
├── dependencies/
│   └── admin.py               # NEW: get_super_admin dependency
└── alembic/versions/
    └── 066_workspace_encryption_and_quota.py  # NEW

frontend/src/
├── app/
│   ├── (admin)/               # NEW route group
│   │   └── admin/
│   │       ├── layout.tsx
│   │       └── page.tsx       # Super-admin dashboard
│   └── (workspace)/[workspaceSlug]/settings/
│       ├── encryption/        # NEW
│       │   └── page.tsx
│       └── usage/             # NEW
│           └── page.tsx
└── features/settings/pages/
    ├── encryption-settings-page.tsx  # NEW
    └── usage-settings-page.tsx       # NEW
```

### Pattern 1: Workspace Encryption Key Model (follow WorkspaceAPIKey)
**What:** New `WorkspaceEncryptionKey` model following the exact same structure as `WorkspaceAPIKey` — `Base + TimestampMixin + WorkspaceScopedMixin`, `UniqueConstraint("workspace_id")`.
**When to use:** Storing the workspace-specific Fernet key (encrypted with master key).
**Example:**
```python
# Source: backend/src/pilot_space/infrastructure/database/models/workspace_api_key.py
class WorkspaceEncryptionKey(Base, TimestampMixin, WorkspaceScopedMixin):
    __tablename__ = "workspace_encryption_keys"
    __table_args__ = (
        UniqueConstraint("workspace_id", name="uq_workspace_encryption_key_workspace"),
        {"schema": None},
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, server_default="gen_random_uuid()")
    encrypted_workspace_key: Mapped[str] = mapped_column(Text, nullable=False)
    key_hint: Mapped[str | None] = mapped_column(String(8), nullable=True)
    key_version: Mapped[int] = mapped_column(default=1, nullable=False)
```

### Pattern 2: Envelope Encryption in Repository Layer
**What:** Explicit `encrypt_content` / `decrypt_content` calls in write/read service methods, NOT SQLAlchemy event listeners.
**When to use:** Writing `notes.body`, `issues.description`, `audit_log.ai_input/ai_output` when a workspace encryption key is configured.
**Example:**
```python
# Source: backend/src/pilot_space/infrastructure/encryption.py (adapt pattern)
from pilot_space.infrastructure.database.workspace_encryption import (
    get_workspace_content_key,
    encrypt_content,
    decrypt_content,
)

# In note repository write path:
workspace_key = await get_workspace_content_key(session, workspace_id)
if workspace_key:
    note.body = encrypt_content(note.body, workspace_key)

# In note repository read path:
workspace_key = await get_workspace_content_key(session, workspace_id)
if workspace_key:
    note.body = decrypt_content(note.body, workspace_key)
```

### Pattern 3: Super-Admin Bearer Token Dependency
**What:** `get_super_admin` FastAPI dependency checks `Authorization: Bearer <token>` against `PILOT_SPACE_SUPER_ADMIN_TOKEN` env var. Completely separate from Supabase JWT path.
**When to use:** All `/api/v1/admin/*` routes.
**Example:**
```python
# Source: pattern from backend/src/pilot_space/api/v1/routers/scim.py (SCIM bearer token)
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=True)

async def get_super_admin(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> None:
    settings = get_settings()
    expected = settings.pilot_space_super_admin_token
    if not expected or credentials.credentials != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")
```

### Pattern 4: Per-Workspace Rate Limit Cache
**What:** Rate limit middleware fetches per-workspace config from Redis cache (60s TTL) on cache miss, falls back to hardcoded defaults.
**When to use:** Inside `RateLimitMiddleware.dispatch()` before checking counters.
**Example:**
```python
# Extend existing RateLimitMiddleware in backend/src/pilot_space/api/middleware/rate_limiter.py
async def _get_workspace_limits(self, workspace_id: str) -> dict[str, int]:
    cache_key = f"ws_limits:{workspace_id}"
    cached = await self.redis.get(cache_key)
    if cached:
        return json.loads(cached)
    # Fetch from DB via service_role connection (no RLS context needed)
    limits = await self._fetch_from_db(workspace_id)
    await self.redis.set(cache_key, json.dumps(limits), ex=60)
    return limits
```

### Pattern 5: `/api/v1/admin/*` Router (SCIM pattern — no DI wiring needed)
**What:** Admin router instantiates DB session directly (SCIM pattern), uses service_role connection to bypass RLS.
**When to use:** All super-admin cross-workspace queries.
**Note:** Because `admin_router.py` does not use `@inject`, it does NOT need to be added to `wiring_config.modules` in `container.py`.

### Pattern 6: Frontend Admin Route Group
**What:** New `(admin)/` route group in `frontend/src/app/` — completely separate from `(workspace)/[workspaceSlug]/`. No workspace nav shell, no MobX workspace store dependency.
**When to use:** `/admin` page accessed by super-admin operator.
**Example:**
```
frontend/src/app/
├── (admin)/
│   └── admin/
│       ├── layout.tsx    # minimal layout, no sidebar
│       └── page.tsx      # AdminDashboardPage (plain React, TanStack Query)
```

### Anti-Patterns to Avoid
- **SQLAlchemy event listeners for encryption:** `after_load` fires on every SELECT even when no workspace key is configured. The async session context makes event listener callbacks complex. Use explicit repository-layer calls instead.
- **Storing workspace rate limits in a separate DB table:** Creates a hot-path DB read on every request. Use columns on the existing `workspaces` table with Redis caching.
- **Admin dashboard using Supabase JWT auth:** Admin token is a separate opaque bearer token. Do not integrate with Supabase auth flow or workspace membership.
- **Rate limit violation count via log scraping:** Structured log aggregation is complex. Use a Redis counter incremented in `_check_rate_limit()` when `current_count > limit`, keyed as `rl_violations:{workspace_id}:{day}`.
- **Running isolation tests against SQLite:** `SET LOCAL app.current_user_id` is a no-op in SQLite. Tests will pass falsely. Always require `TEST_DATABASE_URL` pointing to PostgreSQL.
- **MCP tool handlers without RLS context:** `issue_server.py` and `note_server.py` access DB directly but only `pilotspace_agent.py` calls `set_rls_context()`. The agent sets context before dispatching, so MCP handlers inherit it via the same session — but this must be verified, not assumed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Symmetric encryption | Custom AES implementation | `cryptography.Fernet` (already in project) | Fernet handles key validation, HMAC, padding correctly |
| Redis sliding window | Custom counter logic | Existing `RateLimitMiddleware._check_rate_limit()` | Already implements correct INCR + EXPIRE pattern |
| Workspace RLS isolation | Custom `workspace_id` filter in every query | `set_rls_context()` + PostgreSQL RLS policies | Missing one query = confirmed data leak |
| Workspace key caching | Per-request DB lookup for encryption key | Redis cache with 60s TTL | Encryption key lookup on every content read is a DB hot path |
| Admin token validation | JWT or session DB | Opaque env var comparison | Super-admin is a single operator token, not a user session |

**Key insight:** The entire isolation system is already built — phase 3 primarily adds tests that exercise it, fixes known enum bugs, and builds the opt-in encryption layer on top of the Fernet infrastructure that already exists.

## Common Pitfalls

### Pitfall 1: RLS Enum Case Mismatch (BLOCKER)
**What goes wrong:** Integration tests return false passes because `workspace_members.role` stores lowercase (`owner`, `admin`) but RLS policies filter on UPPERCASE (`'OWNER'`, `'ADMIN'`). Rows are invisible under the policy, causing data isolation to appear correct for the wrong reasons.
**Why it happens:** Migration `022_workspace_invitations.py` and others seeded enum values without normalizing case. The `WorkspaceRole` Python enum defaults to stored string, and SQLAlchemy may insert either case depending on how the enum was created.
**How to avoid:** Run migration `023_fix_invitation_rls_enum_case.py` as the template; apply the same UPDATE to `workspace_members.role` to ensure consistency. Then run `SELECT DISTINCT role FROM workspace_members` to verify all values are UPPERCASE before running TENANT-01 tests.
**Warning signs:** Isolation tests pass even when `TEST_DATABASE_URL` points to PostgreSQL and `set_rls_context()` is not called.

### Pitfall 2: MCP Tool Sessions and RLS Context
**What goes wrong:** MCP tool handlers (`issue_server.py`, `note_server.py`, `note_query_server.py`) perform DB reads inside AI sessions. `pilotspace_agent.py` calls `set_rls_context()` at line 289-291 on the session it creates. If a tool handler creates a NEW session (not using the agent's session), RLS context is lost.
**Why it happens:** Tool context passes a `db_session` through `tool_context.db_session`. If any tool handler opens a fresh session instead of using the injected one, the RLS variables are not set.
**How to avoid:** Verify all MCP tool handlers use the `tool_context.db_session` injected by the agent, never `async with session_factory() as session:`. Grep: `session_factory()` inside `ai/mcp/`.
**Warning signs:** A cross-workspace test that crafts an AI chat request with workspace B's IDs returns 200 with workspace A's data.

### Pitfall 3: Fernet Key Round-Trip for Workspace Encryption
**What goes wrong:** Admin uploads a base64 key. Backend stores it encrypted with master key (Fernet-of-Fernet). On retrieval, backend decrypts with master key, then uses inner key to decrypt content. If the inner key is not a valid Fernet key (not 32 bytes, not URL-safe base64), decryption raises `ValueError` silently treated as empty string.
**Why it happens:** Users may provide non-standard key formats (AES hex, random string).
**How to avoid:** Validate on upload: `Fernet(provided_key.encode())` — raises `ValueError` if invalid. Return 422 with message "Key must be a 32-byte URL-safe base64 string (use the Generate button)". Provide a "Generate Key" button in the UI that calls `Fernet.generate_key()` via backend endpoint.
**Warning signs:** Encrypted content decrypts to garbage bytes; `InvalidToken` exceptions in logs.

### Pitfall 4: Storage Quota Tracking Drift
**What goes wrong:** Delta-based storage tracking accumulates errors when records are deleted, updated (changing content length), or bulk-imported. The stored `storage_used_bytes` diverges from actual DB content length.
**Why it happens:** Update operations change `len(body)` by a non-zero delta, and if the delta calculation is off-by-one or missing for some operations (e.g., soft-delete vs. hard-delete), the counter drifts.
**How to avoid:** On each write, compute `new_len - old_len` and apply as signed delta. Provide a `/workspaces/{slug}/storage/recalculate` admin endpoint that runs a full recount from DB (SELECT SUM(LENGTH(body)) FROM notes WHERE workspace_id=...) — this is a maintenance endpoint, not on the hot path.
**Warning signs:** Storage bar shows 0 or negative values; quota enforcement blocks writes when actual usage is below limit.

### Pitfall 5: Super-Admin Token in Logs
**What goes wrong:** Token appears in access logs when `Authorization: Bearer <token>` header is logged by middleware or Uvicorn.
**Why it happens:** Default FastAPI/Starlette middleware logs raw headers on exceptions or debug mode.
**How to avoid:** Log the admin token as `"****"` in all structured log events. Ensure `PILOT_SPACE_SUPER_ADMIN_TOKEN` is not echoed in startup logs via `get_settings()` (use `SecretStr` type in Pydantic settings, same as `encryption_key`).
**Warning signs:** Token value visible in `uvicorn.access` log stream.

### Pitfall 6: `workspace_encryption_key` RLS Policy — Unique Scope
**What goes wrong:** The `workspace_encryption_key` table has RLS enabled but the workspace isolation policy allows any workspace member to read the encryption key. The encrypted key should only be readable by the backend service_role.
**Why it happens:** Using the standard `get_workspace_rls_policy_sql()` template grants all workspace members SELECT access. The workspace key should never be returned to a frontend user — only the backend reads it to decrypt content.
**How to avoid:** Write a custom RLS policy for `workspace_encryption_keys`: no SELECT for regular users; INSERT/UPDATE only for OWNER role; service_role bypass. The key itself is never exposed via API — only `key_hint` and `key_version` are returned.
**Warning signs:** `GET /workspaces/{slug}/encryption` returns `encrypted_workspace_key` field in response body.

## Code Examples

### Existing Encryption Service (reuse directly)
```python
# Source: backend/src/pilot_space/infrastructure/encryption.py
# No changes needed — workspace encryption uses the same service

from pilot_space.infrastructure.encryption import get_encryption_service

def store_workspace_key(raw_key: str) -> str:
    """Encrypt workspace key with master key for storage."""
    service = get_encryption_service()  # uses system ENCRYPTION_KEY
    return service.encrypt(raw_key)

def retrieve_workspace_key(encrypted_key: str) -> str:
    """Decrypt workspace key from storage."""
    service = get_encryption_service()
    return service.decrypt(encrypted_key)  # returns raw workspace key

def encrypt_content(content: str, workspace_key: str) -> str:
    """Encrypt content field with workspace key."""
    content_fernet = Fernet(workspace_key.encode())
    return content_fernet.encrypt(content.encode()).decode()
```

### Existing RLS Context (call this in every new router)
```python
# Source: backend/src/pilot_space/infrastructure/database/rls.py
await set_rls_context(session, user_id=current_user.user_id, workspace_id=workspace.id)
# Must be called BEFORE any SELECT on workspace-scoped tables
```

### Isolation Test Pattern (extend existing tests/security/)
```python
# Source: backend/tests/security/test_rls_policies.py — extend this pattern
@pytest.mark.skipif("sqlite" in _DB_URL, reason="RLS requires PostgreSQL")
async def test_cross_workspace_issue_access(populated_db, db_session):
    # User A authenticated, tries to read workspace B's issues
    await set_test_rls_context(db_session, populated_db.outsider.id, populated_db.workspace_a.id)
    result = await db_session.execute(
        select(Issue).where(Issue.workspace_id == populated_db.workspace_b.id)
    )
    assert result.scalars().all() == []  # Must be empty — RLS blocks cross-workspace access
```

### Rate Limit Middleware Extension
```python
# Source: backend/src/pilot_space/api/middleware/rate_limiter.py
# Current RATE_LIMIT_CONFIGS is the fallback. New method fetches per-workspace overrides.
async def _get_effective_limit(self, workspace_id: str, endpoint_type: str) -> int:
    cache_key = f"ws_limits:{workspace_id}"
    try:
        cached = await self.redis.get(cache_key)
        if cached:
            limits = json.loads(cached)
            return limits.get(f"{endpoint_type}_rpm", RATE_LIMIT_CONFIGS[endpoint_type].requests_per_minute)
    except Exception:
        pass
    return RATE_LIMIT_CONFIGS[endpoint_type].requests_per_minute
```

### Settings Page Pattern (plain React, no observer)
```typescript
// Source: frontend/src/features/settings/pages/security-settings-page.tsx
// All settings pages follow this: 'use client', plain React function, TanStack Query, no observer()
'use client';
import * as React from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function EncryptionSettingsPage() {
  const params = useParams();
  const workspaceSlug = params?.workspaceSlug as string;
  // useQuery / useMutation from TanStack Query
  // No MobX, no observer()
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `RATE_LIMIT_CONFIGS` dict | Per-workspace override columns with Redis cache | Phase 3 | Operators can tune per tenant without code deploy |
| No field-level encryption | Opt-in envelope encryption per workspace | Phase 3 | BYOK encryption without external KMS dependency |
| No cross-workspace admin view | `/admin` super-admin dashboard | Phase 3 | Self-hosted operators can monitor all tenants |
| RLS assumed correct | Integration-tested isolation proof | Phase 3 | TENANT-01 becomes verifiable artifact |

**Deprecated/outdated:**
- Hardcoded `RATE_LIMIT_CONFIGS["standard"]` and `RATE_LIMIT_CONFIGS["ai"]` as final authority: these become fallback defaults only after Phase 3.

## Open Questions

1. **MCP tool RLS session sharing**
   - What we know: `pilotspace_agent.py` calls `set_rls_context()` at line 289-291, then dispatches to MCP tool handlers via `tool_context.db_session`.
   - What's unclear: Whether all MCP tool handlers (`issue_server.py`, `note_server.py`, `note_query_server.py`) consistently use the injected `tool_context.db_session` or occasionally open a new session.
   - Recommendation: Grep `ai/mcp/` for `create_async_engine`, `async_sessionmaker`, `async with` session patterns. If any tool opens a fresh session, add `set_rls_context()` there.

2. **Workspace storage calculation — Supabase Storage sizes**
   - What we know: Context says to sum `LENGTH(notes.body) + LENGTH(issues.description) + Supabase Storage attachment sizes`.
   - What's unclear: Supabase Storage does not expose a native SQL-queryable size column; `storage.objects` has `metadata->>'size'` (JSONB) for object size. Query: `SELECT SUM((metadata->>'size')::bigint) FROM storage.objects WHERE bucket_id = workspace_slug`.
   - Recommendation: Use `storage.objects` JSONB metadata for attachment sizes. This requires the backend to access the `storage` schema, which is accessible via service_role connection.

3. **Migration 066 scope**
   - What we know: Current head is `065_add_audit_log_table`. CONTEXT.md specifies migration 066 covers: `workspace_encryption_key` table + workspace quota columns + RLS enum case fix.
   - What's unclear: Whether the RLS enum case fix should be a separate 066 migration (prerequisite) with quota/encryption as 067, or combined.
   - Recommendation: Split into two: 066 = RLS enum case fix only (prerequisite for TENANT-01 tests); 067 = workspace_encryption_key + quota columns + RLS for new tables.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio |
| Config file | `backend/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `cd backend && uv run pytest tests/security/ -q` |
| Full suite command | `cd backend && uv run pytest tests/ --cov` |
| RLS tests require | `TEST_DATABASE_URL=postgresql+asyncpg://... uv run pytest tests/security/test_isolation.py -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TENANT-01 | User A cannot read workspace B data via any API endpoint | integration (PostgreSQL) | `TEST_DATABASE_URL=<pg_url> uv run pytest tests/security/test_isolation.py -x` | ❌ Wave 0 |
| TENANT-01 | All routers that access workspace data call `set_rls_context()` | static audit (grep) | `grep -r "workspace_id" src/ --include="*.py" \| grep -v set_rls_context` | N/A — audit script |
| TENANT-02 | Workspace key stored encrypted with master key | unit | `uv run pytest tests/unit/test_workspace_encryption.py -x` | ❌ Wave 0 |
| TENANT-02 | Content field encrypted/decrypted correctly round-trip | unit | `uv run pytest tests/unit/test_workspace_encryption.py::test_content_round_trip -x` | ❌ Wave 0 |
| TENANT-02 | Verify endpoint returns `{"verified": true}` for valid key | unit | `uv run pytest tests/routers/test_workspace_encryption.py -x` | ❌ Wave 0 |
| TENANT-03 | Per-workspace rate limits loaded from Redis cache | unit | `uv run pytest tests/security/test_rate_limiting.py -x` | ✅ exists (extend) |
| TENANT-03 | Storage write blocked at 100% quota (HTTP 507) | unit | `uv run pytest tests/unit/test_storage_quota.py -x` | ❌ Wave 0 |
| TENANT-03 | Warning header `X-Storage-Warning: 0.80` at 80% threshold | unit | `uv run pytest tests/unit/test_storage_quota.py::test_warning_header -x` | ❌ Wave 0 |
| TENANT-04 | `/api/v1/admin/workspaces` requires valid super-admin token | unit | `uv run pytest tests/routers/test_admin.py -x` | ❌ Wave 0 |
| TENANT-04 | Invalid super-admin token returns 401 | unit | `uv run pytest tests/routers/test_admin.py::test_invalid_token -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/security/ tests/unit/ -q`
- **Per wave merge:** `cd backend && uv run pytest tests/ --cov`
- **Phase gate:** Full suite green + `TEST_DATABASE_URL` isolation tests passing before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/security/test_isolation.py` — TENANT-01 cross-workspace API probe (requires PostgreSQL)
- [ ] `tests/unit/test_workspace_encryption.py` — TENANT-02 encryption round-trip and key validation
- [ ] `tests/routers/test_workspace_encryption.py` — TENANT-02 API endpoint tests
- [ ] `tests/unit/test_storage_quota.py` — TENANT-03 quota enforcement (507, warning header)
- [ ] `tests/routers/test_admin.py` — TENANT-04 super-admin token auth and dashboard data

Existing files to extend:
- `tests/security/test_rate_limiting.py` — extend with per-workspace limit override tests
- `tests/security/test_rls_policies.py` — extend with audit_log and encryption_key isolation tests

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `backend/src/pilot_space/infrastructure/encryption.py` — verified Fernet API, `get_encryption_service()`, `encrypt_api_key()` / `decrypt_api_key()` patterns
- Direct codebase inspection: `backend/src/pilot_space/api/middleware/rate_limiter.py` — verified Redis sliding window implementation, `RATE_LIMIT_CONFIGS`, `_check_rate_limit()` extension point
- Direct codebase inspection: `backend/src/pilot_space/infrastructure/database/rls.py` — verified `set_rls_context()`, `get_workspace_rls_policy_sql()`, UPPERCASE enum values in policies
- Direct codebase inspection: `backend/src/pilot_space/infrastructure/database/models/workspace_api_key.py` — verified `WorkspaceScopedMixin` + `UniqueConstraint` + Fernet pattern
- Direct codebase inspection: `backend/src/pilot_space/infrastructure/database/base.py` — verified `WorkspaceScopedMixin`, `WorkspaceScopedModel`, `BaseModel`
- Direct codebase inspection: `backend/src/pilot_space/api/v1/routers/scim.py` — verified bearer token dependency pattern for non-JWT auth
- Direct codebase inspection: `backend/tests/security/conftest.py` + `test_rls_policies.py` — verified existing test infrastructure, two-workspace isolation pattern
- Direct codebase inspection: `backend/src/pilot_space/container/container.py` line 141-148 — verified `wiring_config.modules` list
- Direct codebase inspection: `frontend/src/features/settings/pages/security-settings-page.tsx` — verified settings page pattern (plain React, TanStack Query, no observer())
- `.planning/phases/03-multi-tenant-isolation/03-CONTEXT.md` — all locked decisions
- `.planning/STATE.md` — RLS enum case bug confirmed, migration chain current head is 065

### Secondary (MEDIUM confidence)
- `backend/src/pilot_space/ai/mcp/issue_server.py` grep — confirmed `set_rls_context` not called directly; relies on agent-level session setup
- `backend/src/pilot_space/ai/agents/pilotspace_agent.py` line 289-291 — verified agent sets RLS context on session before MCP dispatch

### Tertiary (LOW confidence)
- Supabase Storage `storage.objects` JSONB metadata size field — inferred from Supabase conventions, not directly verified in codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and used in production code; verified by direct file inspection
- Architecture: HIGH — patterns derived directly from existing working code (WorkspaceAPIKey, SCIM router, security-settings-page.tsx)
- Pitfalls: HIGH for enum bug and MCP RLS (confirmed via grep/inspection); MEDIUM for storage drift (inferred from delta tracking complexity)

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable domain; libraries not changing rapidly)
