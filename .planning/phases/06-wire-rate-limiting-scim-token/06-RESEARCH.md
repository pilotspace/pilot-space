# Phase 6: Wire Rate Limiting + SCIM Token - Research

**Researched:** 2026-03-09
**Domain:** FastAPI middleware registration + SCIM REST endpoint wiring
**Confidence:** HIGH

## Summary

Phase 6 is a pure wiring phase: both the `RateLimitMiddleware` and `ScimService.generate_scim_token()` are fully implemented — they just are not connected to the running application. The rate limiter (`backend/src/pilot_space/api/middleware/rate_limiter.py`) is defined and exported from the middleware `__init__.py` but never passed to `app.add_middleware()` in `main.py`. The SCIM token endpoint is noted as a pending todo in STATE.md: `generate_scim_token()` exists in `ScimService` but no router handler exposes `POST /workspaces/{slug}/settings/scim-token`.

The test infrastructure for both gaps already exists. `tests/security/test_rate_limiting.py` contains 30+ unit tests with a complete `mock_redis` fixture in `tests/security/conftest.py`. `tests/unit/routers/test_scim.py` tests `generate_scim_token` at the service level but has no endpoint test. New tests for Phase 6 are additive — the scaffolds are in place.

**Primary recommendation:** Register `RateLimitMiddleware` in `main.py` after `SessionRecordingMiddleware`, add `POST /workspaces/{slug}/settings/scim-token` to the SCIM router (or a new workspace settings router), wire `ScimService.generate_scim_token()` to it, then add the two focused unit tests required.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-07 (gap closure) | Admin can configure SCIM 2.0 to auto-provision/deprovision users from their IdP — specifically the token generation endpoint needed for admin setup | `ScimService.generate_scim_token()` fully implemented; needs only a `POST` route wired to it with `settings:manage` (OWNER-only) permission guard |
| TENANT-03 (rate limiting gap closure) | Admin can set per-workspace API rate limits and storage quotas, and requests exceeding those limits receive a 429 | `RateLimitMiddleware` fully implemented; needs `app.add_middleware()` registration in `main.py` with `redis_client` and `db_url` from the DI container/settings |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI `app.add_middleware()` | 0.x (project version) | Register ASGI middleware | Only mechanism for Starlette-based middleware |
| `starlette.middleware.base.BaseHTTPMiddleware` | (via FastAPI) | Rate limiter base class | Already in use — `RateLimitMiddleware` extends it |
| `redis.asyncio` | project version | Redis sliding window counters | Already wired in container; `create_redis_client()` factory exists |
| `pilot_space.config.get_settings()` | — | Database URL for middleware DB fallback | `lru_cache` singleton; used throughout |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `check_permission` from `infrastructure.database.permissions` | — | RBAC guard on SCIM token endpoint | Same pattern as `workspace_quota.py` OWNER-only endpoints |
| `SessionDep` from `dependencies.auth` | — | DB session injection for new endpoint | Required on every route using DI-provided services (CLAUDE.md Gotcha #1) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Adding SCIM token endpoint to existing `scim.py` router | Adding to `workspaces.py` or a new `workspace_scim_settings.py` router | Existing `scim.py` prefix is `/scim/v2/{workspace_slug}` — does not match the required path `/workspaces/{slug}/settings/scim-token`. A new handler must go in a different router with workspace JWT auth (not SCIM bearer auth). |

## Architecture Patterns

### Recommended Project Structure

No new files strictly required. Changes are:

```
backend/src/pilot_space/
├── main.py                                          # ADD app.add_middleware(RateLimitMiddleware, ...)
├── api/v1/routers/
│   └── scim.py                                     # ADD POST /workspaces/{slug}/settings/scim-token
│                                                   # (or new workspace_scim_settings.py if line count is concern)
tests/
├── security/
│   └── test_rate_limiting.py                       # ADD test: 429 when workspace RPM exceeded (end-to-end wiring check)
└── unit/routers/
    └── test_scim.py                                # ADD test: POST /settings/scim-token returns 200 + token
```

If `scim.py` would exceed 700 lines with the new endpoint, extract to `workspace_scim_settings.py` and register in `main.py` + `__init__.py`.

### Pattern 1: Middleware Registration in main.py

**What:** Register `RateLimitMiddleware` via `app.add_middleware()` with dependencies from the DI container. Because middleware is registered before lifespan completes, the lazy-init pattern (reading from `app.state.container` at dispatch time) is required.

**When to use:** Any Starlette `BaseHTTPMiddleware` that needs container singletons (redis, session_factory).

**Example (existing precedent — `SessionRecordingMiddleware`):**
```python
# Source: backend/src/pilot_space/api/v1/middleware/session_recording.py
# SessionRecordingMiddleware uses lazy-init for redis/session_factory from
# app.state.container — enables add_middleware at module load time before lifespan.
app.add_middleware(SessionRecordingMiddleware)
```

**For `RateLimitMiddleware`**, the constructor accepts `redis_client` directly:
```python
# Source: backend/src/pilot_space/api/middleware/rate_limiter.py lines 120-148
from pilot_space.api.middleware.rate_limiter import RateLimitMiddleware
from pilot_space.config import get_settings

settings = get_settings()
app.add_middleware(
    RateLimitMiddleware,
    redis_client=None,   # resolved at dispatch via lazy-init OR pass container singleton
    enabled=True,
    db_url=settings.database_url.get_secret_value(),
)
```

**Decision required by planner:** `RateLimitMiddleware.__init__` takes `redis_client` directly. The container `redis_client` singleton is available at module level via `get_container().redis_client()`. However, lifespan connects the client — the middleware must either (a) accept lazy-init like `SessionRecordingMiddleware` (read from `app.state.container` in `dispatch`) or (b) be registered inside the lifespan after connect. Option (a) is consistent with the established pattern in this codebase. If the planner uses option (b), the middleware registration must move inside the lifespan block.

**Simplest wiring (option b, inside lifespan after redis connect):**
```python
# After: await redis_client.connect()
from pilot_space.api.middleware.rate_limiter import RateLimitMiddleware
app.add_middleware(
    RateLimitMiddleware,
    redis_client=redis_client.client,  # the raw asyncio Redis client
    enabled=True,
    db_url=settings.database_url.get_secret_value(),
)
```

Research note: `add_middleware` inside lifespan is valid in Starlette — middleware stack is rebuilt on app startup.

### Pattern 2: SCIM Token Generation Endpoint

**What:** `POST /workspaces/{slug}/settings/scim-token` — OWNER-only endpoint that calls `ScimService.generate_scim_token()` and returns the raw token (shown once).

**When to use:** Admin needs to rotate or create initial SCIM bearer token from the settings UI.

**Auth:** This endpoint uses Supabase JWT + RBAC (`settings:manage` permission = OWNER only). It does NOT use SCIM bearer token auth. It must NOT be in a path that `is_public_route()` would match (`/api/v1/scim/v2/` prefix is bypassed by JWT middleware).

**Pattern reference from `workspace_quota.py`:**
```python
# Source: backend/src/pilot_space/api/v1/routers/workspace_quota.py lines 124-177
async def _resolve_workspace_and_check_permission(
    workspace_slug: str,
    current_user: CurrentUser,
    session: SessionDep,
) -> Workspace:
    ...
    allowed = await check_permission(
        db=session,
        user_id=current_user.id,
        workspace_id=workspace.id,
        permission="settings:manage",
    )
    if not allowed:
        raise HTTPException(status_code=403, ...)
    return workspace
```

**New endpoint skeleton:**
```python
@router.post(
    "/{workspace_slug}/settings/scim-token",
    summary="Generate SCIM bearer token",
    status_code=status.HTTP_200_OK,
)
async def generate_scim_token(
    workspace_slug: str,
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, str]:
    """Generate and store a new SCIM bearer token (OWNER only).

    Returns raw token once — not retrievable again.
    """
    workspace = await _resolve_workspace_and_check_permission(...)
    service = get_scim_service(session)
    raw_token = await service.generate_scim_token(
        workspace_id=workspace.id, db=session
    )
    await session.commit()
    return {"token": raw_token}
```

**Router placement:** If this goes in `scim.py`, a second router with prefix `/workspaces` must be defined and registered in `main.py` separately from the existing `scim_router`. Alternatively, a new `workspace_scim_settings.py` with its own router is cleaner.

### Anti-Patterns to Avoid

- **Registering middleware at module scope before lifespan:** `app.add_middleware()` calls that pass live Redis client references at import time will use `None` because the container has not connected yet. Use lazy-init or register inside lifespan.
- **Putting SCIM token endpoint inside `/api/v1/scim/v2/` prefix:** That path is bypassed by JWT middleware (`is_public_route()` in `auth_middleware.py` line 54). The token generation endpoint needs JWT auth, so it must live outside that prefix.
- **Missing `session: SessionDep` in new endpoint signature:** Required for every route using DI services — omitting it causes `RuntimeError: No session in current context` at first DB access (CLAUDE.md Gotcha #1).
- **Calling `generate_scim_token` without `await session.commit()`:** The service calls `flush()` not `commit()`. The router must commit the transaction explicitly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limit counting | Custom sliding window | Existing `RateLimitMiddleware._check_rate_limit()` | Already handles INCR + EXPIRE + per-workspace Redis keys |
| Token hash storage | Custom settings merger | `ScimService.generate_scim_token()` | Already merges into `workspace.settings` with `secrets.token_urlsafe(32)` + SHA-256 |
| Permission check | Ad-hoc role comparison | `check_permission()` from `infrastructure.database.permissions` | Handles custom roles + built-in roles with RBAC |
| Redis mock in tests | Manual mock setup | `mock_redis` fixture in `tests/security/conftest.py` | Full `incr`/`expire`/`get`/`set` simulation with call_counts dict |

**Key insight:** Both gaps are purely wiring. Zero new domain logic is needed.

## Common Pitfalls

### Pitfall 1: Middleware Registration Before Redis Connect
**What goes wrong:** `redis_client()` returns a `RedisClient` wrapper, but `wrapper.client` (the underlying `redis.asyncio.Redis`) is `None` until `await redis_client.connect()` runs in lifespan.
**Why it happens:** `app.add_middleware()` runs at module load time, before lifespan.
**How to avoid:** Register `RateLimitMiddleware` inside the lifespan handler after `await redis_client.connect()`, or implement lazy-init in the middleware's `dispatch()` reading from `request.app.state`.
**Warning signs:** `NoneType has no attribute 'incr'` error at first request; rate limiting silently disabled.

### Pitfall 2: SCIM Token Endpoint Under Public Route Prefix
**What goes wrong:** If the endpoint path starts with `/api/v1/scim/v2/`, `is_public_route()` in `auth_middleware.py` (line 54) bypasses JWT validation — any caller without a token can generate SCIM tokens.
**Why it happens:** SCIM provisioning endpoints use SCIM bearer token, not JWT, so their prefix is exempt.
**How to avoid:** Place the token generation endpoint under `/api/v1/workspaces/{slug}/settings/scim-token` — this is outside the exempt prefix.
**Warning signs:** No 401 when calling without Authorization header.

### Pitfall 3: Missing Transaction Commit on Token Generation
**What goes wrong:** `generate_scim_token()` calls `db.flush()` — changes are staged but not committed. If the router does not call `await session.commit()`, the token hash is lost on connection close.
**Why it happens:** Other read-heavy endpoints don't need commit; this pattern is easy to miss.
**How to avoid:** Add `await session.commit()` in the endpoint handler after `generate_scim_token` returns.
**Warning signs:** Token returned to client but next SCIM request fails with "Invalid SCIM bearer token".

### Pitfall 4: `get_scim_service` Uses `_get_supabase_admin_client()` Internally
**What goes wrong:** `get_scim_service(session)` in `scim.py` calls `_get_supabase_admin_client()` which calls `get_container()`. In unit tests without a wired container, this returns `None` — acceptable for `generate_scim_token` (it never touches the Supabase client) but causes confusing setup noise.
**How to avoid:** Test the token generation endpoint by mocking `ScimService.generate_scim_token` directly (patch), not by instantiating the full service chain.

### Pitfall 5: db_url SecretStr Unwrapping
**What goes wrong:** `settings.database_url` is a `SecretStr`. Passing it directly to `RateLimitMiddleware(db_url=settings.database_url)` passes the `SecretStr` object, not the string — `create_async_engine` will fail with a type error.
**How to avoid:** Use `settings.database_url.get_secret_value()`.

## Code Examples

### RateLimitMiddleware Constructor Signature
```python
# Source: backend/src/pilot_space/api/middleware/rate_limiter.py lines 120-148
class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app: object,
        redis_client: Redis | None = None,  # raw asyncio Redis, not the wrapper
        *,
        enabled: bool = True,
        db_url: str | None = None,          # optional — enables per-workspace DB lookup
    ) -> None: ...
```

### mock_redis Fixture (ready to use in new tests)
```python
# Source: backend/tests/security/conftest.py lines 359-403
@pytest.fixture
def mock_redis() -> AsyncMock:
    """Create mock Redis client for rate limiting tests."""
    redis = AsyncMock()
    call_counts: dict[str, int] = {}
    # Simulates INCR, EXPIRE, GET, SET, DELETE
    # Exposes redis._call_counts for assertions
    ...
    return redis
```

### check_permission Usage (OWNER-only settings endpoint)
```python
# Source: backend/src/pilot_space/api/v1/routers/workspace_quota.py lines 163-185
allowed = await check_permission(
    db=session,
    user_id=current_user.id,
    workspace_id=workspace.id,
    permission="settings:manage",  # OWNER only
)
if not allowed:
    raise HTTPException(status_code=403, detail="Owner permission required")
```

### generate_scim_token Service Method
```python
# Source: backend/src/pilot_space/application/services/scim_service.py lines 339-380
async def generate_scim_token(
    self,
    workspace_id: uuid.UUID,
    db: AsyncSession,
) -> str:
    # Returns raw 43-char URL-safe token; stores SHA-256 hash in workspace.settings
    # Raises ScimWorkspaceNotFoundError if workspace not found
    ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| RateLimitMiddleware defined but unregistered | Register via `app.add_middleware()` in main.py | Phase 6 | TENANT-03 rate limiting actually enforces |
| No SCIM token generation endpoint | `POST /workspaces/{slug}/settings/scim-token` | Phase 6 | AUTH-07 admin setup flow complete |

**Deprecated/outdated:**
- STATE.md pending todo: "POST /workspaces/{slug}/settings/scim-token admin endpoint not yet implemented" — Phase 6 closes this.

## Open Questions

1. **Middleware registration location: module scope vs. lifespan**
   - What we know: `SessionRecordingMiddleware` uses lazy-init (module scope registration, reads from `request.app.state` at dispatch time). `RateLimitMiddleware` takes `redis_client` as a constructor arg (not lazy).
   - What's unclear: Does the planner modify `RateLimitMiddleware` to accept lazy-init, or register it inside lifespan?
   - Recommendation: Register inside lifespan (after `await redis_client.connect()`) passing `redis_client.client` (the underlying raw `redis.asyncio.Redis` object). This is the simplest change that does not modify the middleware class.

2. **Router placement for SCIM token endpoint**
   - What we know: `scim.py` already has a `get_scim_service()` helper. Adding a second router to `scim.py` with `/workspaces` prefix is valid. Alternative: new `workspace_scim_settings.py`.
   - What's unclear: How close to 700 lines is `scim.py` currently?
   - Recommendation: Check `scim.py` line count; if under 600, add the endpoint there in a new router object. If near limit, create `workspace_scim_settings.py`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (project standard) |
| Config file | `backend/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `cd backend && uv run pytest tests/security/test_rate_limiting.py tests/unit/routers/test_scim.py -q` |
| Full suite command | `cd backend && uv run pytest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TENANT-03 (rate limit) | RateLimitMiddleware registered; returns 429 when workspace RPM exceeded | unit | `cd backend && uv run pytest tests/security/test_rate_limiting.py -q -k "test_workspace_rpm"` | ❌ Wave 0 (new test) |
| AUTH-07 (SCIM token endpoint) | POST /workspaces/{slug}/settings/scim-token returns 200 + token | unit | `cd backend && uv run pytest tests/unit/routers/test_scim.py -q -k "test_generate_scim_token_endpoint"` | ❌ Wave 0 (new test) |

Existing tests in `test_rate_limiting.py` cover the middleware logic in isolation — the new test specifically verifies the wiring (middleware is active and returns 429 through a real `TestClient`).

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/security/test_rate_limiting.py tests/unit/routers/test_scim.py -q`
- **Per wave merge:** `cd backend && make quality-gates-backend`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New test in `tests/security/test_rate_limiting.py`: wiring test — `test_rate_limit_middleware_registered_returns_429` — verifies `app.add_middleware(RateLimitMiddleware, ...)` is wired by making requests through `TestClient` with a mock Redis
- [ ] New test in `tests/unit/routers/test_scim.py`: `test_generate_scim_token_endpoint_returns_200_with_token` — verifies `POST /workspaces/{slug}/settings/scim-token` calls `generate_scim_token` and returns `{"token": ...}`

## Sources

### Primary (HIGH confidence)
- `backend/src/pilot_space/api/middleware/rate_limiter.py` — complete implementation; constructor signature, Redis key patterns, fail-open behavior
- `backend/src/pilot_space/application/services/scim_service.py` — `generate_scim_token()` full implementation
- `backend/src/pilot_space/main.py` — confirms `RateLimitMiddleware` never registered; all current middleware registrations visible
- `backend/src/pilot_space/api/v1/routers/scim.py` — `get_scim_service()` factory, `get_scim_workspace()` auth dependency; confirms no token generation endpoint
- `backend/src/pilot_space/api/middleware/auth_middleware.py` — `is_public_route()` confirms `/api/v1/scim/v2/` is JWT-exempt
- `backend/src/pilot_space/api/v1/routers/workspace_quota.py` — established pattern for OWNER-only settings endpoints with `check_permission`
- `backend/tests/security/conftest.py` — `mock_redis` fixture; ready for new rate limit wiring test
- `.planning/STATE.md` — pending todo confirming SCIM token endpoint gap

### Secondary (MEDIUM confidence)
- Starlette docs pattern: `add_middleware()` called inside lifespan is valid — confirmed by existing codebase use in `main.py` (queue creation, workers started inside lifespan)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture: HIGH — both implementation gaps directly confirmed by code inspection
- Pitfalls: HIGH — each pitfall directly derived from existing code patterns and CLAUDE.md gotchas

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable codebase; gap closure scope is narrow)
