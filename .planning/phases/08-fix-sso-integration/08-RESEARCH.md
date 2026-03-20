# Phase 8: Fix SSO Integration - Research

**Researched:** 2026-03-09
**Domain:** SSO integration gap closure — FastAPI query-param contract, Supabase admin JWT issuance, frontend hook URL construction
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | Admin can configure SAML 2.0 SSO with an external identity provider (Okta, Azure AD) | Backend already has saml_auth.py + SsoService. Bug: all config endpoints accept `workspace_id: UUID` but frontend sends `workspace_slug`. Fix: add `_resolve_workspace` slug-to-UUID lookup in auth_sso.py. |
| AUTH-02 | Admin can configure OIDC SSO with Google Workspace or compatible provider | Same root cause as AUTH-01 — OIDC config endpoints fail with 422 because frontend sends `workspace_slug` in query params. |
| AUTH-03 | Users can log in via SSO and receive workspace roles from identity provider claims | SAML callback returns `token_type: "saml_provisioned"` — not a real JWT. Frontend has no handler for this type. Fix: backend issues a Supabase magic link instead; frontend exchanges magic link token for a session using `supabase.auth.verifyOtp`. |
| AUTH-04 | Admin can force SSO-only login (disable password auth) for the workspace | Enforcement endpoint has same 422 bug (expects workspace_id UUID). After fix: enforcement flag set correctly. |
</phase_requirements>

## Summary

Phase 1 (01-identity-and-access) built all SSO infrastructure: `SamlAuthProvider`, `SsoService`, `auth_sso.py` router with 11 endpoints, and `SsoSettingsPage` frontend. Two runtime blockers prevent end-to-end SSO from working:

**Bug 1 — 422 on all admin SSO config endpoints.** Every endpoint in `auth_sso.py` that requires admin authentication accepts `workspace_id: UUID` as a query parameter. FastAPI's parameter binding means the entire body of the request must contain a valid UUID for `workspace_id`. The frontend hooks (`use-sso-settings.ts`) send `workspace_slug` (a human-readable string like `"my-org"`) instead. FastAPI rejects non-UUID strings with a 422 Unprocessable Entity. This affects `POST /auth/sso/saml/config`, `GET /auth/sso/saml/config`, `POST /auth/sso/oidc/config`, `GET /auth/sso/oidc/config`, `PATCH /auth/sso/enforcement`, `POST /auth/sso/role-mapping`, and `GET /auth/sso/role-mapping`.

**Bug 2 — SAML callback issues no Supabase JWT.** The `POST /auth/sso/saml/callback` endpoint currently returns `{"user_id": "...", "email": "...", "token_type": "saml_provisioned"}` — a placeholder comment in the code explicitly says "actual JWT is issued via Supabase magic link / admin signIn". The frontend (`use-sso-login.ts`) has no handler for `token_type: "saml_provisioned"` and no SAML callback route. The login loop is incomplete: after IdP validates the user, they land nowhere with a valid session.

**Primary recommendation:** Fix Bug 1 by adding `_resolve_workspace` slug-to-UUID helper in `auth_sso.py` (matching the pattern in `audit.py` and `ai_governance.py`), change all admin endpoint parameters from `workspace_id: UUID` to `workspace_slug: str`, and update frontend hooks to send `workspace_slug` consistently. Fix Bug 2 by calling `admin.generate_link(type="magiclink", email=email)` in `provision_saml_user` and returning the link URL — then add a frontend `/auth/saml-callback` page that calls `supabase.auth.verifyOtp({token_hash, type: "magiclink"})` to exchange it for a JWT session.

## Standard Stack

### Core (all already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| python3-saml | >=1.16.0 | SAML assertion validation | Already in pyproject.toml from Phase 1 |
| gotrue (supabase-py) | current | Supabase admin API — `generate_link`, `create_user` | Already wired in DI container |
| FastAPI | current | Router + parameter binding | Project standard |
| TanStack Query | current | Frontend API hooks | Project standard (settings pages) |

### Key APIs

**Backend — gotrue `AsyncGoTrueAdminAPI.generate_link`:**
```python
from gotrue.types import GenerateInviteOrMagiclinkParams

result = await admin.generate_link(
    GenerateInviteOrMagiclinkParams(
        type="magiclink",
        email=email,
        options={"redirect_to": f"{settings.frontend_url}/auth/saml-callback"},
    )
)
# result.properties.hashed_token — hash to send to frontend
# result.properties.verification_type == "magiclink"
```

**Frontend — Supabase `verifyOtp`:**
```typescript
const { data, error } = await supabase.auth.verifyOtp({
  token_hash: tokenHash,   // from backend's generate_link response
  type: 'magiclink',
});
// data.session is the Supabase JWT session — store in authStore
```

### Slug-to-UUID Resolution Pattern (existing in project)

```python
# From audit.py — copy this exact pattern into auth_sso.py
async def _resolve_workspace(workspace_slug: str, session: AsyncSession) -> UUID:
    workspace_repo = WorkspaceRepository(session)
    try:
        as_uuid = UUID(workspace_slug)
        workspace = await workspace_repo.get_by_id_scalar(as_uuid)
    except ValueError:
        workspace = await workspace_repo.get_by_slug_scalar(workspace_slug)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace.id
```

## Architecture Patterns

### Bug 1 Fix — Backend Endpoint Signature Change

All admin SSO endpoints currently have `workspace_id: UUID` as a query parameter. Change to `workspace_slug: str`, add `_resolve_workspace` at the start of each handler, then pass the resolved UUID to `SsoService`.

**Before (broken):**
```python
@router.post("/saml/config")
async def configure_saml(
    workspace_id: UUID,   # FastAPI expects UUID; frontend sends slug string → 422
    body: SamlConfigRequest,
    session: SessionDep,
    _admin: UUID = require_workspace_admin,
) -> SamlConfigResponse:
```

**After (fixed):**
```python
@router.post("/saml/config")
async def configure_saml(
    workspace_slug: str,  # accept slug; resolve to UUID internally
    body: SamlConfigRequest,
    session: SessionDep,
) -> SamlConfigResponse:
    workspace_id = await _resolve_workspace(workspace_slug, session)
    # require_workspace_admin check embedded in _resolve_workspace or separate
```

**IMPORTANT — require_workspace_admin dependency change:** The current endpoints use `_admin: UUID = require_workspace_admin` as a FastAPI dependency that also expects `workspace_id: UUID`. After the signature change, this dependency must be invoked manually (passing the resolved UUID), or replaced with an inline permission check. The audit.py pattern uses `check_permission()` directly — use the same approach.

Looking at `audit.py`:
```python
from pilot_space.infrastructure.database.permissions import check_permission

workspace_id = await _resolve_workspace(workspace_slug, session)
await check_permission(session, current_user.user_id, workspace_id, "settings", "manage")
```

### Bug 1 Fix — Frontend Hook URL Change

**Before (broken — sends workspace_slug as query param named `workspace_slug`, backend expects `workspace_id`):**
```typescript
// use-sso-settings.ts
apiClient.get<SamlConfig | null>(`/auth/sso/saml/config?workspace_slug=${workspaceSlug}`)
```

**After (fixed — rename param to match updated backend):**
```typescript
// Backend now accepts ?workspace_slug= query param
apiClient.get<SamlConfig | null>(`/auth/sso/saml/config?workspace_slug=${workspaceSlug}`)
// POST/PUT/PATCH bodies: { workspace_slug: workspaceSlug, ...data }
```

The frontend hooks are already sending `workspace_slug` in URLs; the backend just needs to rename the parameter and add resolution. This means the frontend hooks are technically already correct in naming — the bug is that the backend parameter type is `UUID` not `str`.

### Bug 2 Fix — SAML Callback JWT Issuance

**Current broken flow:**
1. IdP POST → `POST /auth/sso/saml/callback`
2. Backend validates assertion, calls `provision_saml_user`, returns `{"token_type": "saml_provisioned"}`
3. Frontend: no handler for this token_type, user stuck

**Fixed flow:**
1. IdP POST → `POST /auth/sso/saml/callback`
2. Backend validates assertion, calls `provision_saml_user`
3. Backend calls `admin.generate_link(type="magiclink", email=email)` → gets `hashed_token`
4. Backend redirects to frontend `/auth/saml-callback?token_hash={hashed_token}&workspace_id={workspace_id}`
5. Frontend `/auth/saml-callback` page calls `supabase.auth.verifyOtp({token_hash, type: "magiclink"})`
6. Supabase issues real JWT session → user logged in

**Backend response change:**
```python
# Instead of returning JSON, redirect to frontend
from fastapi.responses import RedirectResponse

link_result = await admin.generate_link({
    "type": "magiclink",
    "email": email,
})
token_hash = link_result.properties.hashed_token

frontend_url = settings.frontend_url.rstrip("/")
return RedirectResponse(
    url=f"{frontend_url}/auth/saml-callback?token_hash={token_hash}&workspace_id={workspace_id}",
    status_code=302,
)
```

**Frontend — new `/auth/saml-callback/page.tsx`:**
```typescript
// Similar to existing /auth/callback/page.tsx
// Reads token_hash from URL params
// Calls supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
// On success: apply claims role if workspace_id in params, then redirect to /
// On error: redirect to /login?error=saml_failed
```

### Unauthenticated Endpoints (workspace_id stays as UUID)

The unauthenticated endpoints (`GET /auth/sso/status`, `GET /auth/sso/check-login`, `GET /auth/sso/saml/initiate`, `GET /auth/sso/saml/metadata`) are called from the login page via `useWorkspaceSsoStatus` which already sends `workspace_id` as a UUID query param. These work correctly and should NOT be changed.

`use-sso-login.ts` already sends `/auth/sso/status?workspace_id=${workspaceId}` and `/auth/sso/saml/initiate?workspace_id=${workspaceId}` — these are correct.

### Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SAML JWT issuance | Custom JWT minting | `admin.generate_link(type="magiclink")` | Supabase handles token signing, expiry, session creation |
| OTP verification | Custom token exchange | `supabase.auth.verifyOtp()` | Supabase SDK handles PKCE, secure token exchange |
| Slug→UUID resolution | Custom resolver | `WorkspaceRepository.get_by_slug_scalar()` | Already implemented, used by 4+ other routers |

## Common Pitfalls

### Pitfall 1: require_workspace_admin Dependency After Slug Change
**What goes wrong:** `require_workspace_admin(workspace_id: UUID, ...)` is a FastAPI dependency that reads `workspace_id` from the request. After changing endpoint signatures to `workspace_slug: str`, FastAPI cannot bind `workspace_id: UUID` in `require_workspace_admin` — it will get `None` or a 422 itself.
**How to avoid:** Replace `_admin: UUID = require_workspace_admin` with an inline permission check using `check_permission()` after `_resolve_workspace()`, matching the audit.py pattern. Do NOT use `Depends(require_workspace_admin)` on slug-based endpoints.

### Pitfall 2: generate_link Returns URL Not JWT
**What goes wrong:** `admin.generate_link()` returns a `hashed_token` (for the `token_hash` flow) and a full `action_link` URL. The `action_link` is NOT a JWT — it's a Supabase redirect URL. The backend should extract `hashed_token` from `result.properties.hashed_token` and pass it to the frontend, which then calls `verifyOtp`.
**How to avoid:** Do NOT return `result.action_link` directly as the session token. Return `result.properties.hashed_token` via redirect URL parameter.

### Pitfall 3: SAML Callback is IdP POST, Not Frontend Fetch
**What goes wrong:** The IdP does a server-side POST to `/auth/sso/saml/callback`. The backend cannot return JSON that the browser reads — it must issue a redirect. Using `return {...}` (JSON) means the browser sees raw JSON, not a session.
**How to avoid:** The `saml_callback` endpoint MUST return a `RedirectResponse`, not a JSON dict.

### Pitfall 4: Scope of Changes — Don't Break Unauthenticated Endpoints
**What goes wrong:** Changing all `workspace_id: UUID` to `workspace_slug: str` across all endpoints including the unauthenticated ones would break `useWorkspaceSsoStatus` (which correctly sends UUID) and `useSsoLogin` (which correctly sends UUID to initiate/metadata).
**How to avoid:** Only change the ADMIN-GATED endpoints: `/saml/config` (GET/POST), `/oidc/config` (GET/POST), `/enforcement` (PATCH), `/role-mapping` (GET/POST). Keep `workspace_id: UUID` on the unauthenticated endpoints.

### Pitfall 5: SsoService.configure_saml Still Takes UUID
**What goes wrong:** After changing the router signature, `SsoService` still expects `workspace_id: UUID`. That's correct — `SsoService` should use UUID internally. The router resolves slug → UUID, then passes UUID to service. Do NOT change `SsoService` method signatures.
**How to avoid:** Resolution happens only in the router layer. Service layer stays UUID-based.

### Pitfall 6: generate_link Async Admin Call in SsoService
**What goes wrong:** `provision_saml_user` currently uses the `supabase_admin_client` (`SupabaseAuth` instance) which wraps `gotrue.AsyncGoTrueAdminAPI`. The `generate_link` call must be `await admin.generate_link(...)` — forgetting `await` silently returns a coroutine.
**How to avoid:** Use `await` explicitly. `SsoService._admin_client.auth.admin` is the `AsyncGoTrueAdminAPI` instance.

### Pitfall 7: Frontend verifyOtp Token Hash vs Token
**What goes wrong:** Supabase's `verifyOtp` has two modes: `{token, email, type}` (OTP code) and `{token_hash, type}` (hash-based, from `generate_link`). Using the wrong params returns "invalid or expired token" silently.
**How to avoid:** Use `{token_hash: ..., type: 'magiclink'}` — no `email` needed when using hash-based verification.

## Code Examples

### Backend — _resolve_workspace (copy from audit.py pattern)
```python
# Source: backend/src/pilot_space/api/v1/routers/audit.py:72
async def _resolve_workspace(workspace_slug: str, session: AsyncSession) -> UUID:
    workspace_repo = WorkspaceRepository(session)
    try:
        as_uuid = UUID(workspace_slug)
        workspace = await workspace_repo.get_by_id_scalar(as_uuid)
    except ValueError:
        workspace = await workspace_repo.get_by_slug_scalar(workspace_slug)
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace.id
```

### Backend — Admin Permission Check Pattern
```python
# Source: backend/src/pilot_space/api/v1/routers/audit.py (check_permission pattern)
from pilot_space.infrastructure.database.permissions import check_permission

workspace_id = await _resolve_workspace(workspace_slug, session)
await check_permission(session, current_user.user_id, workspace_id, "settings", "manage")
```

### Backend — generate_link in provision_saml_user
```python
# gotrue AsyncGoTrueAdminAPI.generate_link
# Source: verified from .venv/lib/python3.12/site-packages/gotrue/
link_result = await self._admin_client.auth.admin.generate_link({
    "type": "magiclink",
    "email": email,
    "options": {"redirect_to": f"{settings.frontend_url}/auth/saml-callback"},
})
token_hash = link_result.properties.hashed_token
```

### Backend — SAML Callback Redirect
```python
from fastapi.responses import RedirectResponse

return RedirectResponse(
    url=f"{settings.frontend_url}/auth/saml-callback"
        f"?token_hash={token_hash}&workspace_id={workspace_id}",
    status_code=302,
)
```

### Frontend — verifyOtp (saml-callback page)
```typescript
// Matches existing callback/page.tsx pattern
const tokenHash = searchParams.get('token_hash');
const workspaceId = searchParams.get('workspace_id');

const { data, error } = await supabase.auth.verifyOtp({
  token_hash: tokenHash!,
  type: 'magiclink',
});

if (data.session) {
  // Apply claims role if workspace_id present (same as callback/page.tsx)
  if (workspaceId) { /* ... */ }
  router.push('/');
}
```

### Frontend — Fixed hook URL construction
```typescript
// GET: ?workspace_slug= (backend now accepts slug, not UUID)
apiClient.get<SamlConfig | null>(`/auth/sso/saml/config?workspace_slug=${workspaceSlug}`)

// POST body: { workspace_slug: workspaceSlug, ...formData }
apiClient.post<SamlConfig>('/auth/sso/saml/config', {
  ...data,
  workspace_slug: workspaceSlug,
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| workspace_id UUID in query | workspace_slug string in URL path or query | Phase 1 established slug routing; auth_sso.py missed it | Fixes 422 on all SSO config endpoints |
| Return JSON from SAML callback | Redirect with token_hash | Auth best practice — browser must follow redirect | Enables real JWT session from SAML login |
| `action_link` magic link URL | `hashed_token` + `verifyOtp` | Supabase recommended pattern for server-generated links | Secure, no full URL exposure in redirect |

## Open Questions

1. **check_permission call signature in auth_sso.py**
   - What we know: `check_permission` is used in `audit.py` with `(session, user_id, workspace_id, resource, action)`. SSO config is a settings action.
   - What's unclear: The exact permission string for SSO config — is it `"settings:manage"` or `"settings:write"`?
   - Recommendation: Use `"settings"` + `"manage"` (OWNER+ADMIN only) consistent with audit retention policy. The `require_workspace_admin` check was equivalent to ADMIN+OWNER, so `check_permission` with `"settings", "manage"` is the right replacement.

2. **frontend_url in Settings**
   - What we know: `settings.backend_url` exists. The SAML callback redirect needs the frontend URL.
   - What's unclear: Is `frontend_url` already in `Settings`?
   - Recommendation: Check `config.py`. If not present, add `FRONTEND_URL` env var and `frontend_url: str` to Settings. Default to `http://localhost:3000` for dev.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (backend), Vitest (frontend) |
| Config file | backend/pyproject.toml, frontend/vitest.config.ts |
| Quick run command | `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py -q` |
| Full suite command | `cd backend && uv run pytest tests/unit/ -q && cd ../frontend && pnpm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | `configure_saml` endpoint accepts workspace_slug, resolves to UUID | unit | `pytest tests/unit/routers/test_auth_sso.py -k "saml_config"` | ✅ extend existing |
| AUTH-01 | `configure_saml` with slug returns 200 (not 422) | unit | `pytest tests/unit/routers/test_auth_sso.py -k "slug"` | ❌ Wave 0 |
| AUTH-01 | SAML callback redirects with token_hash | unit | `pytest tests/unit/routers/test_auth_sso.py -k "callback_redirect"` | ❌ Wave 0 |
| AUTH-02 | `configure_oidc` endpoint accepts workspace_slug | unit | `pytest tests/unit/routers/test_auth_sso.py -k "oidc_slug"` | ❌ Wave 0 |
| AUTH-03 | `provision_saml_user` calls `generate_link` and returns token_hash | unit | `pytest tests/unit/services/test_sso_service.py -k "provision"` | ✅ extend existing |
| AUTH-04 | `set_sso_enforcement` endpoint accepts workspace_slug | unit | `pytest tests/unit/routers/test_auth_sso.py -k "enforcement_slug"` | ❌ Wave 0 |
| AUTH-01/02/03/04 | Frontend saml-callback page calls verifyOtp with token_hash | unit | `cd frontend && pnpm test -- --run src/app/\\(auth\\)/saml-callback` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/unit/routers/test_auth_sso.py tests/unit/services/test_sso_service.py -q`
- **Per wave merge:** `cd backend && uv run pytest tests/unit/ -q && cd ../frontend && pnpm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/unit/routers/test_auth_sso.py` — extend with slug-based endpoint tests (configure_saml with slug, configure_oidc with slug, enforcement with slug, callback redirect)
- [ ] `backend/tests/unit/services/test_sso_service.py` — extend with `provision_saml_user` calling `generate_link` mock
- [ ] `frontend/src/app/(auth)/saml-callback/page.tsx` — new page (test file needed alongside)
- [ ] Check `backend/src/pilot_space/config.py` for `frontend_url` field

## Sources

### Primary (HIGH confidence)
- `backend/src/pilot_space/api/v1/routers/auth_sso.py` — all 11 endpoints, parameter types, current SAML callback response
- `backend/src/pilot_space/application/services/sso_service.py` — `provision_saml_user` implementation, admin API calls
- `backend/src/pilot_space/api/v1/routers/audit.py:72` — `_resolve_workspace` pattern (slug→UUID)
- `frontend/src/features/settings/hooks/use-sso-settings.ts` — all 7 hooks, URL construction with `workspace_slug=`
- `frontend/src/features/auth/hooks/use-sso-login.ts` — `useWorkspaceSsoStatus`, `useSsoLogin` (correct UUID usage)
- `frontend/src/app/(auth)/callback/page.tsx` — existing OIDC callback pattern (verifyOtp reference)
- `backend/.venv/lib/python3.12/site-packages/gotrue/types.py` — `GenerateInviteOrMagiclinkParams`, `GenerateLinkParams`
- `backend/tests/unit/routers/test_auth_sso.py` — 11 existing passing tests

### Secondary (MEDIUM confidence)
- Supabase auth-js `GoTrueAdminApi.ts` — `generateLink` method signature verified in `frontend/node_modules`
- `.planning/phases/01-identity-and-access/01-02-SUMMARY.md` — Phase 1 decisions, JSONB merge pattern

## Metadata

**Confidence breakdown:**
- Bug 1 (422 fix): HIGH — source code confirms `workspace_id: UUID` parameter, frontend sends `workspace_slug=` string; slug-to-UUID pattern confirmed from 4 other routers
- Bug 2 (JWT issuance): HIGH — code comment in `saml_callback` explicitly states "actual JWT is issued via Supabase magic link / admin signIn"; `generate_link` method verified in gotrue package
- Architecture: HIGH — copied from existing `audit.py`/`ai_governance.py` patterns
- Test approach: HIGH — extends existing 33-test suite

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable codebase, no external API changes)
