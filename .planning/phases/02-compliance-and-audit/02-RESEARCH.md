# Phase 2: Compliance & Audit - Research

**Researched:** 2026-03-08
**Domain:** Immutable audit logging, PostgreSQL triggers, pg_cron retention, admin export UI
**Confidence:** HIGH

## Summary

Phase 2 builds a workspace-wide compliance audit log that is separate from the existing `Activity` model (which is issue-scoped). The primary data store is a new `audit_log` table using `WorkspaceScopedModel`, with immutability enforced at the database layer via a PostgreSQL BEFORE trigger — not at the application layer. This approach satisfies SOC 2 requirements because application code cannot bypass a `RAISE EXCEPTION` trigger even with `service_role`.

AI action recording is already partially wired (the existing `AuditLogHook` in `hooks_lifecycle.py` logs to application logger and SSE queue, but writes nothing to the database). This phase upgrades that hook to write a proper `audit_log` row. For user/system mutations, the project has no SQLAlchemy event listener pattern established — the recommended approach is explicit service-layer calls, which is simpler to test and debug than opaque ORM listeners.

The retention mechanism uses pg_cron (already used in migration `032_add_digest_cron_job.py`) with a daily schedule. The admin UI follows the exact pattern established in Phase 1: plain React (no `observer()`), TanStack Query, Settings > Security layout. Export uses inline streaming via FastAPI `StreamingResponse` — no background job needed for compliance-scale ad hoc downloads.

**Primary recommendation:** Implement audit capture via explicit service-layer calls (not SQLAlchemy listeners), enforce immutability via PostgreSQL BEFORE trigger, schedule retention via pg_cron, and surface the UI at `/settings/audit` as a new settings sub-route.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Audit Table Architecture
- New `audit_log` table — separate from the existing `Activity` model. `Activity` is issue-scoped (non-nullable `issue_id` FK) and serves the per-issue timeline UI. `audit_log` is workspace-wide, covers all resource types, and is the compliance record.
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

#### Immutability Enforcement
- PostgreSQL BEFORE trigger on `audit_log` that `RAISE EXCEPTION` on any `UPDATE` or `DELETE` — cannot be bypassed by RLS grants or `service_role`. This is the primary enforcement mechanism.
- No `DELETE` or `UPDATE` endpoints exposed in the API for audit log entries — defense in depth.
- RLS: Read-only for `admin`/`owner` roles; no write policies on audit_log for any user-level role.

#### AI Action Capture Strategy
- Write separate `audit_log` entries for every AI action using the `ai_*` columns — do not augment `ai_cost_record`.
- `ai_cost_record` continues to serve its purpose (Phase 4 cost dashboard). The `audit_log` AI fields serve compliance. Both are written on the same AI event — different tables, different consumers.
- Implementation: New `AuditLogHook` in the AI SDK hooks lifecycle (`backend/src/pilot_space/ai/sdk/hooks.py`) — fires after each AI tool call/action completion, writes to `audit_log` with `actor_type=AI`, capturing input/output/model/tokens/rationale from the result.
- `actor_id` for AI entries is the user who triggered the AI action (the human-in-the-loop actor).

#### Data Retention Mechanism
- pg_cron (Supabase native extension) — a daily scheduled job, not pgmq. Retention is time-driven (schedule), not event-driven (queue).
- A migration creates the pg_cron job: purges `audit_log` rows where `created_at < NOW() - INTERVAL '1 day' * audit_retention_days` per workspace.
- New `audit_retention_days` field on `workspace_settings` (default: 90, admin-configurable via API — no UI in this phase, API-only is sufficient).
- Zero extra infrastructure: pg_cron is already available on the Supabase stack.

#### Admin UI — Placement, Filters, Export
- Location: Settings > Audit — new page at `/settings/audit`, added alongside the Phase 1 security pages (SSO, Roles, Security). Consistent placement for compliance officers.
- Filters (matching AUDIT-03): actor (user search autocomplete), action type (dropdown with all `action` values), resource type (dropdown), date range (start + end date pickers). All filters are optional and combinable.
- Export: Inline stream to browser — no background job needed.
  - If filtered result exceeds 10,000 rows, show a warning prompt before downloading.
  - Both JSON and CSV supported (AUDIT-04). Format selector toggle in the export UI.
- UI pattern: Read-only table, no edit/delete affordances. Follows Phase 1 settings page pattern: plain React (no `observer()`), TanStack Query for data fetching.
- Table columns: Timestamp, Actor, Action, Resource Type, Resource ID (truncated), IP Address. Row expansion reveals full payload diff and AI fields.

### Claude's Discretion
- Exact `action` string vocabulary (the dot-notation list of all capturable events) — researcher will enumerate all events to instrument
- Whether `payload` diff is computed at the service layer or via SQLAlchemy event listeners (`after_update` etc.)
- Exact PostgreSQL trigger syntax and migration ordering relative to the table creation
- Pagination strategy for the audit log admin table (cursor-based vs. offset — cursor preferred for large tables)
- Whether to add a Meilisearch index for audit log full-text search (probably not needed; DB filtering sufficient for compliance use)

### Deferred Ideas (OUT OF SCOPE)
- SOC 2 Type II evidence package auto-generation — AUDIT-V2-01, future milestone
- GDPR data subject export and deletion workflow — AUDIT-V2-02, future milestone
- Meilisearch full-text search on audit log — not needed for AUDIT-03 filter requirements; DB indexes sufficient
- Audit log webhooks (push audit events to external SIEM like Splunk) — not in scope; export covers compliance need
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUDIT-01 | Every user action (create/update/delete on any resource) is recorded in an immutable audit log with actor, timestamp, and payload diff | `audit_log` table schema + service-layer write calls + PostgreSQL BEFORE trigger |
| AUDIT-02 | Every AI action is recorded in the audit log with input, output, model used, token cost, and AI rationale | Upgraded `AuditLogHook` in `hooks_lifecycle.py` writing to DB via `ai_*` columns |
| AUDIT-03 | Admin can query and filter the audit log by actor, action type, resource, and date range | Backend GET endpoint with filter params + composite indexes + cursor pagination |
| AUDIT-04 | Admin can export audit log as JSON or CSV for compliance review | FastAPI `StreamingResponse` with `text/csv` or `application/json` content type |
| AUDIT-05 | Admin can configure data retention policies (auto-purge data older than N days) | `audit_retention_days` on workspace settings + pg_cron daily purge job |
| AUDIT-06 | Audit log entries cannot be modified or deleted by any user, including workspace owners | PostgreSQL BEFORE trigger `RAISE EXCEPTION` on UPDATE/DELETE; no API write endpoints |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy async | 2.x (existing) | ORM for `audit_log` model | Already the project ORM |
| PostgreSQL BEFORE trigger | DB-native | Immutability enforcement | Cannot be bypassed by application code or service_role |
| pg_cron | Supabase-bundled | Scheduled retention purge | Already proven in migration 032; no extra infra |
| Alembic | existing | Migration for table + trigger + cron | Single-head chain: next revision after 064 |
| FastAPI `StreamingResponse` | existing | JSON/CSV export streaming | Used in ai_pr_review.py — proven pattern |
| TanStack Query | existing | Admin UI data fetching | Phase 1 pattern for settings pages |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `csv` (stdlib) | Python stdlib | CSV generation | Audit export CSV — no dependency needed |
| `io.StringIO` | Python stdlib | In-memory CSV buffer for streaming | Pairs with `StreamingResponse` generator |
| `json` (stdlib) | Python stdlib | JSON export streaming | Audit export JSON |
| `base64` | Python stdlib | Cursor encoding for pagination | Encode `(created_at, id)` tuple as opaque cursor |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Service-layer explicit audit calls | SQLAlchemy `event.listen(after_update)` | Listeners are invisible in service code, harder to test, firing order is non-deterministic with async sessions — service layer is transparent and testable |
| pg_cron daily purge | Application-level scheduled task (APScheduler) | pg_cron requires no application process, survives restarts, already in the Supabase stack |
| Inline `StreamingResponse` export | Background job + S3 download link | Background job adds complexity (job tracking, storage); compliance exports are low-frequency ad-hoc requests that fit inline streaming |
| Cursor pagination | Offset pagination | Audit log will grow large; offset pagination degrades with deep pages. Cursor on `(created_at DESC, id DESC)` is stable and performant |

**Installation:** No new dependencies required. All functionality uses existing libraries.

---

## Architecture Patterns

### Recommended Project Structure
```
backend/src/pilot_space/
├── infrastructure/database/models/
│   └── audit_log.py               # New AuditLog model (WorkspaceScopedModel)
├── api/v1/routers/
│   └── audit.py                   # New audit router (GET list, GET export)
├── api/v1/schemas/
│   └── audit.py                   # AuditLogResponse, AuditFilterParams, AuditExportParams
├── ai/sdk/
│   └── hooks_lifecycle.py         # Upgrade existing AuditLogHook to write DB rows
└── alembic/versions/
    └── 065_add_audit_log_table.py # Table + RLS + trigger + pg_cron + retention field

frontend/src/
├── app/(workspace)/[workspaceSlug]/settings/audit/
│   └── page.tsx                   # Route shell for /settings/audit
└── features/settings/
    ├── pages/
    │   └── audit-settings-page.tsx  # AuditSettingsPage (plain React, no observer)
    └── hooks/
        └── use-audit-log.ts         # TanStack Query hooks for audit log
```

### Pattern 1: PostgreSQL BEFORE Trigger for Immutability

**What:** A database trigger fires before any UPDATE or DELETE on `audit_log` and raises an exception, preventing the operation at the storage layer.

**When to use:** Any table that must be forensically immutable — evidence that survives application-level compromise.

**Example:**
```sql
-- Source: PostgreSQL documentation + 032_add_digest_cron_job.py migration pattern
CREATE OR REPLACE FUNCTION fn_audit_log_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RAISE EXCEPTION
        'audit_log is immutable: UPDATE and DELETE are not permitted (entry id=%)', OLD.id;
END;
$$;

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_immutable();
```

### Pattern 2: Service-Layer Audit Write (Explicit, Not Listener)

**What:** Each service method that mutates a resource calls `AuditLogRepository.create()` as the final step, passing a computed diff.

**When to use:** All user-triggered create/update/delete operations on: issues, notes, cycles, members, workspace settings, custom roles.

**Example:**
```python
# Service layer explicit audit call pattern (mirrors existing Activity writes)
async def update_issue(self, payload: UpdateIssuePayload) -> Issue:
    issue = await self._issue_repo.get_by_id(payload.issue_id)
    before = _extract_audit_fields(issue)

    issue = await self._issue_repo.update(issue, payload.changes)
    after = _extract_audit_fields(issue)

    await self._audit_repo.create(
        workspace_id=payload.workspace_id,
        actor_id=payload.actor_id,
        actor_type=ActorType.USER,
        action="issue.update",
        resource_type="issue",
        resource_id=payload.issue_id,
        payload={"before": before, "after": after},
        ip_address=payload.ip_address,
    )
    return issue
```

### Pattern 3: AuditLogHook — DB Write on AI Action Completion

**What:** Upgrade the existing `AuditLogHook` in `hooks_lifecycle.py` to accept a DB session factory and write a row on each `PostToolUse` event. The existing hook only logs to application logger.

**When to use:** Every AI tool execution (fires via `PostToolUse` SDK lifecycle event).

**Key constraint:** The hook is instantiated per-request in `PermissionAwareHookExecutor.to_sdk_hooks()`. The session factory can be passed at construction time, same pattern as `SessionRecordingMiddleware` (which uses lazy-init from `app.state.container`).

### Pattern 4: Cursor-Based Pagination for Audit List

**What:** Encode `(created_at, id)` as a base64 cursor. Filter: `created_at < cursor_ts OR (created_at = cursor_ts AND id < cursor_id)`. Matches existing `PaginatedResponse[T]` schema.

**Example:**
```python
# Cursor decode + WHERE clause (mirrors workspaces.py cursor pattern)
import base64, json
from sqlalchemy import select, and_, or_

def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    data = json.loads(base64.b64decode(cursor))
    return datetime.fromisoformat(data["ts"]), UUID(data["id"])

# Query with cursor
stmt = select(AuditLog).where(
    AuditLog.workspace_id == workspace_id,
    *filters,
).order_by(AuditLog.created_at.desc(), AuditLog.id.desc())

if cursor:
    ts, cid = decode_cursor(cursor)
    stmt = stmt.where(
        or_(
            AuditLog.created_at < ts,
            and_(AuditLog.created_at == ts, AuditLog.id < cid)
        )
    )
stmt = stmt.limit(page_size + 1)
```

### Pattern 5: Streaming CSV/JSON Export

**What:** FastAPI `StreamingResponse` with a generator that yields rows. Matches the existing `ai_pr_review.py` streaming pattern.

**Example:**
```python
# Source: ai_pr_review.py StreamingResponse pattern
import csv
import io
from fastapi.responses import StreamingResponse

async def _stream_csv(rows: list[AuditLog]):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=AUDIT_CSV_COLUMNS)
    writer.writeheader()
    yield buf.getvalue()
    buf.seek(0); buf.truncate()
    for row in rows:
        writer.writerow(_to_csv_dict(row))
        yield buf.getvalue()
        buf.seek(0); buf.truncate()

@router.get("/export")
async def export_audit_log(
    format: Literal["json", "csv"] = Query(default="json"),
    ...
) -> StreamingResponse:
    rows = await audit_repo.list_for_export(filters)
    if format == "csv":
        return StreamingResponse(
            _stream_csv(rows),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="audit-log.csv"'},
        )
    # JSON streaming
    ...
```

### Pattern 6: pg_cron Retention Job (proven in migration 032)

**What:** A PostgreSQL function + pg_cron schedule that runs daily, deleting rows older than `workspace.audit_retention_days`.

**Example:**
```sql
-- Source: 032_add_digest_cron_job.py pattern (commented out but shows correct approach)
CREATE OR REPLACE FUNCTION fn_purge_audit_log_expired()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM audit_log al
    USING workspaces w
    WHERE al.workspace_id = w.id
      AND al.created_at < NOW() - (INTERVAL '1 day' * COALESCE(
          (w.settings->>'audit_retention_days')::int, 90
      ));
END;
$$;

SELECT cron.schedule(
    'daily_audit_log_purge',
    '0 2 * * *',      -- 2am UTC daily
    'SELECT fn_purge_audit_log_expired()'
);
```

### Anti-Patterns to Avoid

- **SQLAlchemy `event.listen(after_update)`:** No existing usage in the codebase. Adds invisible coupling, fires in ORM lifecycle order (not application order), difficult to pass request context (actor_id, ip_address) to listener. Use explicit service calls instead.
- **Exposing DELETE/UPDATE endpoints for audit_log:** Even for super-admin. The trigger already prevents it at DB level; exposing endpoints creates an attack surface.
- **Soft-delete on audit_log:** `AuditLog` must NOT inherit `SoftDeleteMixin`. Soft-delete would allow an `is_deleted=true` update, which the trigger must block. The model should override or omit soft delete fields entirely.
- **Storing full records in `before`/`after`:** Only changed fields in the diff. Large records (issue with 20 fields where 1 changed) would bloat JSONB storage rapidly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Immutability enforcement | Application-level check in DELETE endpoint | PostgreSQL BEFORE trigger | Application code can be bypassed; DB trigger cannot |
| Scheduled retention | Celery beat / APScheduler | pg_cron (already in Supabase stack) | Zero infra, survives restarts, proven in migration 032 |
| CSV generation | Manual string concatenation | Python `csv.DictWriter` + `io.StringIO` | Handles quoting, escaping, encoding edge cases |
| Pagination cursor encoding | Custom encoding | `base64.b64encode(json.dumps(...))` | Already the pattern; sufficient for opaque cursors |
| IP extraction | Custom header parsing | Reuse `_extract_ip()` from `session_recording.py` | Handles X-Forwarded-For chain correctly |

**Key insight:** The immutability enforcement and retention mechanism are solved problems at the PostgreSQL layer. Implementing them in application code creates false security and operational fragility.

---

## Common Pitfalls

### Pitfall 1: SoftDeleteMixin on AuditLog
**What goes wrong:** If `AuditLog` inherits `WorkspaceScopedModel` (which includes `SoftDeleteMixin`), calling `soft_delete()` would attempt `UPDATE audit_log SET is_deleted=true`, which the BEFORE trigger will block with an exception.
**Why it happens:** `WorkspaceScopedModel` -> `BaseModel` -> `SoftDeleteMixin`. The audit log doesn't semantically support deletion.
**How to avoid:** `AuditLog` must override `__abstract__ = True` convention and manually inherit only `Base`, `TimestampMixin`, `WorkspaceScopedMixin` — omitting `SoftDeleteMixin`. Alternatively, define it as `class AuditLog(Base, TimestampMixin, WorkspaceScopedMixin)` explicitly.
**Warning signs:** `_extract_ip` or service layer tests raising `IntegrityError` or `RuntimeError` unexpectedly on audit writes.

### Pitfall 2: Trigger Created Before Table
**What goes wrong:** Alembic migration creates the trigger function and trigger before `CREATE TABLE audit_log`, causing a migration failure.
**Why it happens:** `op.execute()` calls run in order; trigger creation references the table name.
**How to avoid:** In migration 065, order is: (1) CREATE TABLE, (2) CREATE FUNCTION, (3) CREATE TRIGGER, (4) RLS policies, (5) pg_cron job.

### Pitfall 3: RLS Blocks Service-Role Audit Writes
**What goes wrong:** The audit_log RLS workspace isolation policy checks workspace membership. Service-role writes (background jobs, AI hooks) may not have `app.current_user_id` set, causing RLS to filter out the INSERT.
**Why it happens:** `get_workspace_rls_policy_sql()` template requires `app.current_user_id` to be set. The service_role bypass policy handles admin operations, but only if the connection uses the `service_role` Postgres role.
**How to avoid:** The standard RLS template includes a `service_role` bypass policy (see `rls.py`). AI hook writes must either use `service_role` connection OR the audit_log insert policy must be more permissive than read (INSERT allowed for any workspace member, only SELECT restricted to ADMIN/OWNER).
**Warning signs:** Audit rows missing in DB for AI actions despite no application error.

### Pitfall 4: AuditLogHook Session Lifecycle
**What goes wrong:** The AI SDK `AuditLogHook` fires in a PostToolUse callback context that does not have the request-scoped SQLAlchemy session. Attempting to use `get_current_session()` raises `RuntimeError: No session in current context`.
**Why it happens:** Hook callbacks execute outside the FastAPI request lifecycle; the ContextVar is not set.
**How to avoid:** The hook must receive a session factory (not a session) at construction time, open a short-lived session per audit write, and close it immediately — same pattern as `_check_member_deprovisioned()` in `session_recording.py`.

### Pitfall 5: pg_cron Deletes Audit Rows (Trigger Conflict)
**What goes wrong:** The BEFORE trigger blocks all DELETEs, including the pg_cron purge job, making retention impossible.
**Why it happens:** The trigger is unconditional.
**How to avoid:** The trigger function must check caller identity using `current_user` or a session variable. The pg_cron function runs as `SECURITY DEFINER` under `postgres` superuser role, which bypasses the trigger via a role check:
```sql
IF current_user = 'postgres' OR current_user = 'service_role' THEN
    RETURN OLD;  -- Allow deletion
END IF;
RAISE EXCEPTION 'audit_log is immutable';
```
Alternatively, the trigger can check for a specific session variable set by the cron function: `SELECT set_config('app.audit_purge', 'true', true)`.

### Pitfall 6: Export Large Result Set OOM
**What goes wrong:** The export endpoint fetches all matching rows into memory before streaming.
**Why it happens:** Simple `await session.execute(select(...))` loads all results.
**How to avoid:** Use SQLAlchemy `yield_per()` or server-side cursors for large result sets. The 10,000-row warning prompt reduces risk, but the backend generator must not buffer all rows.

### Pitfall 7: Action Vocabulary Incompleteness at Instrumentation
**What goes wrong:** Services are instrumented for audit writes, but new service methods added later are not. Audit log silently misses events.
**Why it happens:** No enforcement mechanism ensures new service methods always write an audit row.
**How to avoid:** Document the action vocabulary exhaustively (see Action Vocabulary section below). Consider a decorator `@audit_action("issue.create")` in the future, but for this phase, explicit calls are sufficient.

---

## Code Examples

### AuditLog Model Skeleton
```python
# backend/src/pilot_space/infrastructure/database/models/audit_log.py
from __future__ import annotations
import uuid
from enum import Enum
from typing import Any
from sqlalchemy import Enum as SQLEnum, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from pilot_space.infrastructure.database.base import Base, TimestampMixin, WorkspaceScopedMixin
from pilot_space.infrastructure.database.types import JSONBCompat

class ActorType(str, Enum):
    USER = "USER"
    SYSTEM = "SYSTEM"
    AI = "AI"

class AuditLog(Base, TimestampMixin, WorkspaceScopedMixin):
    """Immutable workspace-wide compliance audit log.

    Do NOT inherit SoftDeleteMixin — the DB trigger blocks all DELETEs
    except those from the pg_cron purge function (SECURITY DEFINER).
    """
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_type: Mapped[ActorType] = mapped_column(
        SQLEnum(ActorType, name="actor_type_enum",
                values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONBCompat, nullable=True)
    ai_input: Mapped[dict[str, Any] | None] = mapped_column(JSONBCompat, nullable=True)
    ai_output: Mapped[dict[str, Any] | None] = mapped_column(JSONBCompat, nullable=True)
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ai_token_cost: Mapped[int | None] = mapped_column(nullable=True)
    ai_rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)

    __table_args__ = (
        Index("ix_audit_log_workspace_id", "workspace_id"),
        Index("ix_audit_log_actor_id", "actor_id"),
        Index("ix_audit_log_action", "action"),
        Index("ix_audit_log_resource_type", "resource_type"),
        Index("ix_audit_log_created_at", "created_at"),
        # Composite for filter + sort queries
        Index("ix_audit_log_workspace_created", "workspace_id", "created_at"),
        Index("ix_audit_log_workspace_actor", "workspace_id", "actor_id"),
    )
```

### Migration Structure (065)
```python
# Order within upgrade():
# 1. CREATE TABLE audit_log (all columns)
# 2. CREATE FUNCTION fn_audit_log_immutable() (SECURITY DEFINER, role check)
# 3. CREATE TRIGGER trg_audit_log_immutable BEFORE UPDATE OR DELETE
# 4. RLS: ENABLE + FORCE RLS
# 5. RLS: read-only SELECT policy for ADMIN/OWNER
# 6. RLS: INSERT policy for workspace members (audit writes)
# 7. RLS: service_role bypass
# 8. ALTER TABLE workspaces ADD COLUMN audit_retention_days INT DEFAULT 90
# 9. CREATE FUNCTION fn_purge_audit_log_expired() (SECURITY DEFINER)
# 10. SELECT cron.schedule('daily_audit_log_purge', '0 2 * * *', ...)
```

### RLS Policy for Audit Log (read-only admin)
```sql
-- INSERT: any workspace member can insert (service writes)
CREATE POLICY "audit_log_insert"
ON audit_log FOR INSERT
WITH CHECK (
    workspace_id IN (
        SELECT wm.workspace_id FROM workspace_members wm
        WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
        AND wm.is_deleted = false
    )
);

-- SELECT: only ADMIN and OWNER
CREATE POLICY "audit_log_read_admin"
ON audit_log FOR SELECT
USING (
    workspace_id IN (
        SELECT wm.workspace_id FROM workspace_members wm
        WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
        AND wm.role IN ('OWNER', 'ADMIN')
        AND wm.is_deleted = false
    )
);

-- No UPDATE policy, no DELETE policy (trigger enforces anyway)
-- service_role bypass
CREATE POLICY "audit_log_service_role"
ON audit_log FOR ALL TO service_role
USING (true) WITH CHECK (true);
```

---

## Action Vocabulary (Claude's Discretion — Enumerated)

The dot-notation `action` string follows `resource.verb` format. Complete list for Phase 2 instrumentation:

### Issue Actions
| Action | Trigger |
|--------|---------|
| `issue.create` | Issue created by user or AI |
| `issue.update` | Any field change (title, description, priority, etc.) |
| `issue.delete` | Soft delete |
| `issue.restore` | Restore from soft delete |
| `issue.state_changed` | State transition |
| `issue.assigned` | Assignee set |
| `issue.unassigned` | Assignee removed |
| `issue.label_added` | Label applied |
| `issue.label_removed` | Label removed |

### Note Actions
| Action | Trigger |
|--------|---------|
| `note.create` | Note created |
| `note.update` | Content saved (debounced auto-save) |
| `note.delete` | Soft delete |
| `note.restore` | Restore |

### Cycle Actions
| Action | Trigger |
|--------|---------|
| `cycle.create` | Cycle created |
| `cycle.update` | Name, dates, status changed |
| `cycle.delete` | Soft delete |
| `cycle.issue_added` | Issue added to cycle |
| `cycle.issue_removed` | Issue removed from cycle |

### Member Actions
| Action | Trigger |
|--------|---------|
| `member.invite` | Invitation sent |
| `member.joined` | Invitation accepted |
| `member.role_changed` | Role updated |
| `member.removed` | Member removed from workspace |
| `member.deprovisioned` | SCIM deactivation |
| `member.reprovisioned` | SCIM reactivation |

### Workspace/Settings Actions
| Action | Trigger |
|--------|---------|
| `workspace_setting.sso_configured` | SSO provider configured |
| `workspace_setting.sso_updated` | SSO settings changed |
| `workspace_setting.sso_force_enabled` | Force SSO enabled |
| `workspace_setting.retention_updated` | `audit_retention_days` changed |
| `custom_role.create` | Custom RBAC role created |
| `custom_role.update` | Role permissions changed |
| `custom_role.delete` | Role deleted |

### AI Actions
| Action | Trigger |
|--------|---------|
| `ai.pr_review` | PR review AI action |
| `ai.issue_enhance` | Issue enhancement |
| `ai.issue_extract` | Issues extracted from note |
| `ai.ghost_text` | Ghost text suggestion accepted |
| `ai.tool_call` | Any MCP tool call through the agent |
| `ai.approval_requested` | Human approval requested |
| `ai.approval_granted` | Human approved AI action |
| `ai.approval_rejected` | Human rejected AI action |

---

## Payload Diff Strategy (Claude's Discretion — Decided)

**Use service-layer explicit diff computation.** Not SQLAlchemy event listeners.

**Reasoning:**
1. No existing SQLAlchemy event listener pattern in codebase — introducing one is a new pattern with no established conventions.
2. Service layer already has before/after state available at update time.
3. `ip_address` and `actor_id` are request-context values not available to ORM listeners.
4. Async SQLAlchemy sessions make listener timing non-obvious with `after_flush` vs `after_commit`.

**Diff format:**
```python
def compute_diff(before: dict, after: dict) -> dict:
    """Only include changed fields in diff."""
    changed_fields = {k for k in after if after[k] != before.get(k)}
    return {
        "before": {k: before.get(k) for k in changed_fields},
        "after": {k: after[k] for k in changed_fields},
    }
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Application-layer audit (deletable) | PostgreSQL BEFORE trigger | Evidence survives application compromise |
| Cron via Celery Beat | pg_cron (DB-native) | No separate process, Supabase-native |
| Full-row audit storage | Changed-fields-only diff | Storage efficiency, faster queries |
| Offset pagination for logs | Cursor pagination on `(created_at, id)` | Stable under concurrent inserts, performant on large tables |

**Deprecated/outdated:**
- `AuditLogHook` in `hooks_lifecycle.py`: Current implementation only logs to application logger. This phase upgrades it to write to the database.
- The existing `Activity` model: Remains unchanged for per-issue timeline. Do NOT extend it for workspace-wide compliance.

---

## Open Questions

1. **pg_cron + trigger DELETE conflict**
   - What we know: The BEFORE trigger blocks all DELETEs. The pg_cron purge function runs as `SECURITY DEFINER`.
   - What's unclear: In Supabase's self-hosted setup, what role does `SECURITY DEFINER` use? Is it `postgres` superuser?
   - Recommendation: Add a session variable check in the trigger (`current_setting('app.audit_purge', true) = 'true'`) set by the purge function before executing DELETE. This is application-controlled and works regardless of the execution role.

2. **Note auto-save audit frequency**
   - What we know: Notes have a 2s debounce auto-save. That could create very high audit volume (1 row per save per active user).
   - What's unclear: Whether each debounced save should create an audit row, or only explicit Cmd+S saves.
   - Recommendation: Audit `note.update` on every successful save to the database (post-debounce). This is the compliance expectation — every persisted change. Rate can be reduced in v2 via change-coalescing.

3. **workspace.settings vs dedicated column for audit_retention_days**
   - What we know: `workspace.settings` is a JSONB column. The CONTEXT.md says to add `audit_retention_days` to `workspace_settings`.
   - What's unclear: Whether this is a new column on `workspaces` table or stored in the existing `settings` JSONB.
   - Recommendation: Add as a typed column `audit_retention_days INTEGER DEFAULT 90` on the `workspaces` table (not in JSONB). Typed columns are queryable by pg_cron and validated at the DB level.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (backend), Vitest (frontend) |
| Config file | `backend/pyproject.toml` (pytest section), `frontend/vitest.config.ts` |
| Quick run command | `cd backend && uv run pytest tests/unit/api/ -q` |
| Full suite command | `make quality-gates-backend` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIT-01 | Service writes audit row on issue create/update/delete | unit | `uv run pytest tests/unit/services/test_audit_log.py -x` | Wave 0 |
| AUDIT-01 | Audit row has correct actor_id, action, payload diff | unit | `uv run pytest tests/unit/services/test_audit_log.py::test_issue_create_audit_row -x` | Wave 0 |
| AUDIT-02 | AI hook writes audit row with ai_* columns | unit | `uv run pytest tests/unit/ai/test_audit_log_hook.py -x` | Wave 0 |
| AUDIT-03 | GET /audit filters by actor, action, resource_type, date | unit | `uv run pytest tests/unit/api/test_audit_router.py -x` | Wave 0 |
| AUDIT-03 | Cursor pagination returns correct next_cursor | unit | `uv run pytest tests/unit/api/test_audit_router.py::test_cursor_pagination -x` | Wave 0 |
| AUDIT-04 | Export endpoint returns valid CSV with correct headers | unit | `uv run pytest tests/unit/api/test_audit_router.py::test_export_csv -x` | Wave 0 |
| AUDIT-04 | Export endpoint returns valid JSON | unit | `uv run pytest tests/unit/api/test_audit_router.py::test_export_json -x` | Wave 0 |
| AUDIT-05 | PATCH retention days updates workspace column | unit | `uv run pytest tests/unit/api/test_audit_router.py::test_update_retention -x` | Wave 0 |
| AUDIT-06 | Direct UPDATE on audit_log raises exception | integration | `uv run pytest tests/integration/test_audit_immutability.py -x` | Wave 0 |
| AUDIT-06 | Direct DELETE on audit_log raises exception | integration | `uv run pytest tests/integration/test_audit_immutability.py::test_delete_blocked -x` | Wave 0 |
| AUDIT-06 | No DELETE/UPDATE endpoint exists in audit router | unit | `uv run pytest tests/unit/api/test_audit_router.py::test_no_write_endpoints -x` | Wave 0 |
| Frontend | AuditSettingsPage renders filter controls | unit | `cd frontend && pnpm test audit-settings-page` | Wave 0 |

**Note on AUDIT-06 integration tests:** These require PostgreSQL (`TEST_DATABASE_URL`) — the trigger does not exist in SQLite. Mark with `@pytest.mark.integration` and skip in SQLite CI mode.

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/unit/api/test_audit_router.py tests/unit/services/test_audit_log.py -q`
- **Per wave merge:** `make quality-gates-backend && make quality-gates-frontend`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/services/test_audit_log.py` — covers AUDIT-01 service-layer writes
- [ ] `tests/unit/ai/test_audit_log_hook.py` — covers AUDIT-02 AI hook DB writes
- [ ] `tests/unit/api/test_audit_router.py` — covers AUDIT-03, AUDIT-04, AUDIT-05, AUDIT-06 (no-endpoint check)
- [ ] `tests/integration/test_audit_immutability.py` — covers AUDIT-06 trigger enforcement (PostgreSQL required)
- [ ] `frontend/src/features/settings/pages/__tests__/audit-settings-page.test.tsx` — covers frontend filter/export UI

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `backend/src/pilot_space/infrastructure/database/base.py` — `WorkspaceScopedModel`, `SoftDeleteMixin` composition
- Codebase inspection: `backend/src/pilot_space/ai/sdk/hooks_lifecycle.py` — existing `AuditLogHook` (logger-only, no DB writes)
- Codebase inspection: `backend/src/pilot_space/ai/sdk/hooks.py` — `PermissionAwareHookExecutor`, hook composition pattern
- Codebase inspection: `backend/alembic/versions/032_add_digest_cron_job.py` — pg_cron pattern and correct SQL syntax
- Codebase inspection: `backend/alembic/versions/064_add_sso_rbac_session_tables.py` — current migration head, RLS pattern
- Codebase inspection: `backend/src/pilot_space/infrastructure/database/rls.py` — `get_workspace_rls_policy_sql()` template
- Codebase inspection: `backend/src/pilot_space/api/v1/routers/workspaces.py` — cursor pagination pattern in use
- Codebase inspection: `backend/src/pilot_space/api/v1/schemas/base.py` — `PaginatedResponse[T]`, cursor fields
- Codebase inspection: `backend/src/pilot_space/api/v1/middleware/session_recording.py` — `_extract_ip()` for IP extraction, session-factory pattern for out-of-request DB access
- Codebase inspection: `frontend/src/app/(workspace)/[workspaceSlug]/settings/layout.tsx` — settings nav, existing sub-routes (`security`, `sso`, `roles`)
- Codebase inspection: `frontend/src/features/settings/pages/security-settings-page.tsx` — Phase 1 pattern for plain React + TanStack Query settings pages

### Secondary (MEDIUM confidence)
- PostgreSQL documentation: BEFORE trigger semantics — `RAISE EXCEPTION` blocks the operation for all roles including superuser when trigger is on the table (trigger owner check for SECURITY DEFINER bypass)
- Supabase documentation: pg_cron is bundled in Supabase self-hosted via `supabase/postgres` image; `cron.schedule()` SQL API is correct

### Tertiary (LOW confidence — flag for validation)
- SECURITY DEFINER trigger role behavior in Supabase: whether `current_user` inside trigger body reflects the `service_role` Postgres role or the `postgres` superuser when called via pg_cron. Validate in integration test before relying on role-check approach; prefer session-variable approach as fallback.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing project dependencies, no new installs
- Architecture: HIGH — all patterns are verifiable in existing codebase (cursor pagination, StreamingResponse, session_recording middleware, hooks_lifecycle)
- Pitfalls: HIGH for SoftDeleteMixin/trigger conflict, pg_cron syntax (verified in migration 032); MEDIUM for trigger/service_role interaction (needs integration test validation)
- Action vocabulary: HIGH — enumerated from existing service method inventory

**Research date:** 2026-03-08
**Valid until:** 2026-06-08 (stable libraries; pg_cron API is stable)
