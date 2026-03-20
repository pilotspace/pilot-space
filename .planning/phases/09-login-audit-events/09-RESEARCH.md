# Phase 9: Login Audit Events - Research

**Researched:** 2026-03-09
**Domain:** Audit log instrumentation — auth path integration
**Confidence:** HIGH

## Summary

Phase 9 is a narrow, surgical gap-closure. The AuditLog infrastructure from Phase 2 is complete and production-ready. The SAML callback from Phase 8 provisions users and redirects to the frontend but never writes an audit entry. The base `auth.py` router handles OAuth/OIDC login initiation and has no server-side "login complete" hook because Supabase handles those flows client-side. The password-based login path does not exist in the backend — Supabase JS SDK handles email+password directly on the client. This means the only meaningful server-side "login success" event available to instrument is the SAML callback (`POST /auth/sso/saml/callback`).

The `write_audit_nonfatal()` helper in `audit_log_repository.py` is the established pattern for non-fatal audit writes across services. It swallows exceptions, accepts `actor_type=ActorType.USER` by default, and is already used in `WorkspaceMemberService`. The action convention in this codebase is dot-notation: `user.login` is the correct string. The `resource_type` for auth events should be `"user"` and `resource_id` should be the provisioned user's UUID.

A critical constraint: `auth_sso.py` is at **696 lines** as of Phase 8. Adding the import and call inline will push it to ~702 lines, breaching the 700-line hard limit. The plan must account for this — either by trimming existing comments or, preferably, by placing the audit write inside `_write_saml_login_audit()` as a private helper that keeps the diff minimal. One approach that stays within limits: consolidate the `logger.info("saml_login_success", ...)` block with the audit write call into a single helper, removing one standalone logger line and replacing it with the helper call.

**Primary recommendation:** Add `write_audit_nonfatal` call in `saml_callback()` immediately after `session.commit()` succeeds. No new files needed. No service-layer changes. Audit write must be non-fatal and after the commit. Test: mock `write_audit_nonfatal` and assert it is called with `action="user.login"`, correct `workspace_id`, `actor_id=UUID(user_info["user_id"])`, `resource_type="user"`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUDIT-01 | Every user action (create/update/delete on any resource) is recorded in an immutable audit log with actor, timestamp, and payload diff | Phase 2 delivered the AuditLog model, repository, and write_audit_nonfatal helper. Phase 9 extends coverage to the login event, which is a user action not currently recorded. The saml_callback router is the only server-side login completion point available for instrumentation. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `write_audit_nonfatal` | (project, Phase 2) | Non-fatal audit entry insertion | Established pattern — swallows all exceptions, prevents audit failures from blocking primary write paths. Used in WorkspaceMemberService. |
| `AuditLogRepository` | (project, Phase 2) | Direct DB insertion of audit rows | Standalone repository (not BaseRepository) — correct for immutable records |
| `ActorType.USER` | (project, Phase 2) | Actor classification | Login is a user action |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Request` (FastAPI/Starlette) | current | IP address extraction | `request.client.host` or `X-Forwarded-For` header already extracted via `_extract_ip()` in session_recording.py — same pattern applies here |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline `write_audit_nonfatal` call in router | Adding audit to `SsoService.provision_saml_user` | Service layer has no access to `workspace_id` as a scoping argument for non-fatal writes without adding `AuditLogRepository` to SsoService constructor — increases service coupling unnecessarily. Router already has workspace_id and session. Router-level write is simpler. |
| `write_audit_nonfatal` | `audit_repo.create()` directly | Direct create raises on failure and would need its own try/except — write_audit_nonfatal is the established wrapper |

**Installation:** No new packages. All tools are project-internal.

## Architecture Patterns

### Recommended Change Location

The audit write belongs in `saml_callback()` in `auth_sso.py`, after `session.commit()`. This is the only point where:
1. SAML assertion is verified
2. User is provisioned (or confirmed existing)
3. `user_info["user_id"]` is available as a UUID string
4. `workspace_id` is in scope
5. The `session` (connected to `AuditLogRepository`) is available

```
backend/src/pilot_space/
├── api/v1/routers/
│   └── auth_sso.py       # Add write_audit_nonfatal after session.commit() in saml_callback()
└── (no new files needed)

backend/tests/unit/routers/
└── test_auth_sso.py       # Add test: saml_callback writes user.login audit entry
```

### Pattern 1: Non-Fatal Audit Write After Commit

**What:** Write an audit entry after the primary DB commit completes. Use `write_audit_nonfatal` so a DB audit failure never fails the login flow.

**When to use:** Any time an audit entry must accompany a primary write but must not block it.

**Example (existing pattern from workspace_member.py):**
```python
# Source: backend/src/pilot_space/application/services/workspace_member.py
await write_audit_nonfatal(
    self._audit_repo,
    workspace_id=payload.workspace_id,
    actor_id=payload.actor_id,
    action="member.role_changed",
    resource_type="member",
    resource_id=payload.target_user_id,
    payload={"before": {"role": old_role}, "after": {"role": payload.new_role}},
)
```

**Applied to saml_callback:**
```python
# After session.commit() in saml_callback():
audit_repo = AuditLogRepository(session)
await write_audit_nonfatal(
    audit_repo,
    workspace_id=workspace_id,
    actor_id=UUID(user_info["user_id"]),
    action="user.login",
    resource_type="user",
    resource_id=UUID(user_info["user_id"]),
    payload={"method": "saml", "is_new": user_info.get("is_new", False)},
    ip_address=request.client.host if request.client else None,
)
```

### Pattern 2: IP Address Extraction

**What:** Extract client IP for the `ip_address` field of the audit entry.

**When to use:** Any router-level audit write where the `Request` object is available.

**Example (existing pattern from session_recording.py):**
```python
# Source: backend/src/pilot_space/api/v1/middleware/session_recording.py
def _extract_ip(request: Request) -> str | None:
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None
```

The `saml_callback` handler already has `request: Request` in its signature. Prefer `X-Forwarded-For` for proxy deployments. The existing `_extract_ip` helper is in `session_recording.py` — either duplicate the 3-line logic inline (KISS) or import it. Inline is simpler given the 700-line constraint.

### 700-Line File Constraint

`auth_sso.py` is at 696 lines. Adding audit write code will breach the limit. The plan must account for this.

**Options (in order of preference):**
1. Add a private helper `_write_login_audit()` that accepts `(session, workspace_id, user_info, request)` and contains both the logger.info call and write_audit_nonfatal — net change: +6 lines for helper, -2 lines in saml_callback = net +4 lines → ~700 lines (tight but viable if existing comment lines are trimmed)
2. Remove the redundant `logger.info("saml_login_success", ...)` block that already logged the same information, and replace it with the audit write call — net neutral, stays under 700
3. Move the `_write_login_audit` helper to a new `_auth_sso_helpers.py` — only if options 1/2 cannot keep under 700

**The planner must choose one approach** and specify exactly which lines are added/removed to stay at or below 700 lines.

### Anti-Patterns to Avoid

- **Fatal audit write:** Never use `await audit_repo.create()` directly — exceptions from audit writes must not fail the login redirect
- **Audit before commit:** The audit write must be after `session.commit()` — writing audit before commit risks the commit failing while the audit entry exists, creating phantom audit records
- **Blocking the redirect on audit failure:** The `write_audit_nonfatal` wrapper must be called, not a try/except around `audit_repo.create()`
- **Using workspace_id as resource_id:** `resource_id` should be the user's UUID, not workspace UUID — login is a user-scoped action

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Non-fatal audit write | Custom try/except wrapper | `write_audit_nonfatal()` | Established pattern, handles None audit_repo, swallows all exceptions with warning log |
| IP extraction | Custom header parsing | Inline `X-Forwarded-For` or `request.client.host` | Already established in session_recording.py; 3 lines |
| Audit row creation | Direct SQLAlchemy insert | `AuditLogRepository.create()` via write_audit_nonfatal | Repository handles flush/refresh cycle |

**Key insight:** The entire feature is 6-10 lines of code. The main challenge is the 700-line file constraint, not implementation complexity.

## Common Pitfalls

### Pitfall 1: 700-Line File Breach
**What goes wrong:** Adding audit import + write call pushes auth_sso.py from 696 to 702+ lines, failing pre-commit check.
**Why it happens:** Pre-commit hook enforces 700-line limit. auth_sso.py grew to 696 lines during Phase 8.
**How to avoid:** Before writing any code, calculate exact line count impact. Remove or consolidate existing blocks to make room.
**Warning signs:** Pre-commit fails with "file exceeds 700 lines" error.

### Pitfall 2: Writing Audit Before Commit
**What goes wrong:** Audit entry persists even when the primary operation (session.commit()) fails afterward.
**Why it happens:** Incorrect ordering — audit write before commit.
**How to avoid:** Always place `write_audit_nonfatal` call after `await session.commit()` succeeds.
**Warning signs:** Test verifies ordering with mock call order assertions.

### Pitfall 3: Wrong resource_id
**What goes wrong:** Using `workspace_id` as `resource_id` for the login event.
**Why it happens:** `workspace_id` is the more prominent UUID in scope.
**How to avoid:** `resource_id` should be `UUID(user_info["user_id"])` — the user who logged in.

### Pitfall 4: UUID String vs UUID Object
**What goes wrong:** `user_info["user_id"]` is a string (from Supabase admin API). Passing it as string to `actor_id` parameter which expects `UUID | None`.
**Why it happens:** `provision_saml_user` returns `{"user_id": user_id, ...}` where `user_id = str(create_response.user.id)` — it's a string.
**How to avoid:** Wrap with `UUID(user_info["user_id"])` before passing.

### Pitfall 5: Password Login Path Doesn't Exist Server-Side
**What goes wrong:** Searching for a server-side password/email login endpoint to instrument.
**Why it happens:** Phase description mentions "SAML and password" paths but password login is Supabase client-side only.
**How to avoid:** Only instrument `saml_callback` in this phase. Password login goes directly to Supabase GoTrue — there is no backend endpoint to instrument.

## Code Examples

### write_audit_nonfatal Signature (from audit_log_repository.py)
```python
# Source: backend/src/pilot_space/infrastructure/database/repositories/audit_log_repository.py
async def write_audit_nonfatal(
    audit_repo: AuditLogRepository | None,
    *,
    workspace_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
    ip_address: str | None = None,
) -> None: ...
```

Note: `write_audit_nonfatal` always uses `ActorType.USER` — it does not accept `actor_type` as a parameter. This is correct for login events.

### Test Pattern (from test_audit_hook.py)
```python
# Source: backend/tests/audit/test_audit_hook.py
def _make_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    return session
```

For the test of `saml_callback` audit write, patch `write_audit_nonfatal` at the import path in `auth_sso` module:
```python
with patch("pilot_space.api.v1.routers.auth_sso.write_audit_nonfatal") as mock_audit:
    await saml_callback(...)
mock_audit.assert_awaited_once()
call_kwargs = mock_audit.call_args.kwargs
assert call_kwargs["action"] == "user.login"
assert call_kwargs["resource_type"] == "user"
assert call_kwargs["workspace_id"] == workspace_id
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No login events in audit log | `user.login` written via write_audit_nonfatal in saml_callback | Phase 9 | Closes AUDIT-01 coverage gap for auth paths |
| Direct try/except around audit writes | `write_audit_nonfatal` wrapper | Phase 2 | Eliminates boilerplate, ensures non-fatal behavior uniformly |

**Deprecated/outdated:**
- None applicable — all infrastructure is current (Phase 2, Phase 8).

## Open Questions

1. **Password login audit coverage**
   - What we know: The base `auth.py` router only handles OAuth login URL construction and profile management. Password-based login goes directly from the browser to Supabase GoTrue — the backend never sees a "login succeeded" event for password auth.
   - What's unclear: Whether compliance requires capturing OIDC-based logins (Google Workspace) in addition to SAML. OIDC login completes entirely in Supabase; there is no backend callback.
   - Recommendation: Document in plan that Phase 9 only instruments SAML callbacks (the only server-side login completion point). Password and OIDC login events are Supabase-side and not auditable from the backend without a Supabase webhook. Mark as known gap in AUDIT-01 coverage note.

2. **Payload schema for login events**
   - What we know: Existing audit entries use `{"before": {...}, "after": {...}}` diff format. A login event has no "before" state.
   - What's unclear: Whether a non-diff payload is acceptable in the existing schema.
   - Recommendation: Use `payload={"method": "saml", "is_new": user_info.get("is_new", False)}` — this is an event payload not a diff. The `payload` column is JSONB with no schema constraint; non-diff payloads are already supported (AI audit entries use custom payloads).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio |
| Config file | `backend/pyproject.toml` |
| Quick run command | `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -x -q` |
| Full suite command | `make quality-gates-backend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUDIT-01 | `saml_callback` writes `user.login` audit entry via `write_audit_nonfatal` after successful user provision | unit | `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -x -q` | ❌ Wave 0 (new test needed in existing file) |
| AUDIT-01 | `write_audit_nonfatal` is called with correct `action`, `workspace_id`, `actor_id`, `resource_type` | unit | `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -x -q` | ❌ Wave 0 |
| AUDIT-01 | Audit failure does not break SAML login redirect | unit | `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -x -q` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -x -q`
- **Per wave merge:** `make quality-gates-backend`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New test functions in `tests/unit/routers/test_auth_sso.py` — covers AUDIT-01 login audit write

*(Existing test file exists. New test functions are needed, not a new file.)*

## Sources

### Primary (HIGH confidence)
- Direct code reading: `backend/src/pilot_space/api/v1/routers/auth_sso.py` — saml_callback implementation, line count (696)
- Direct code reading: `backend/src/pilot_space/infrastructure/database/repositories/audit_log_repository.py` — write_audit_nonfatal signature and behavior
- Direct code reading: `backend/src/pilot_space/application/services/workspace_member.py` — established write_audit_nonfatal usage pattern
- Direct code reading: `backend/src/pilot_space/api/v1/middleware/session_recording.py` — _extract_ip pattern
- Direct code reading: `backend/tests/unit/routers/test_auth_sso.py` — existing test patterns for auth_sso router

### Secondary (MEDIUM confidence)
- STATE.md decisions log — confirms write_audit_nonfatal is the non-fatal audit write pattern for all service-layer writes
- REQUIREMENTS.md — AUDIT-01 requires "every user action" including login events

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all code is in the codebase, no external dependencies
- Architecture: HIGH — exact insertion point is clear from reading auth_sso.py saml_callback
- Pitfalls: HIGH — 700-line constraint is measurable (696 lines confirmed), UUID string conversion is verifiable from sso_service.py return value

**Research date:** 2026-03-09
**Valid until:** Until auth_sso.py is modified again (stable for this phase)
