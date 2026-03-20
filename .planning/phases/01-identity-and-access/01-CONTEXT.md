# Phase 1: Identity & Access - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Enterprise admins can replace email/password auth with their corporate identity provider (SAML 2.0 or OIDC), define custom workspace roles beyond the 4 fixed ones, view and force-terminate active sessions, and connect SCIM 2.0 for automated user provisioning/deprovisioning. Password auth, user data, and note/issue content are out of scope — this phase is purely identity plumbing.

</domain>

<decisions>
## Implementation Decisions

### SSO Provider Approach
- **OIDC** (OAuth2): Handled natively through Supabase GoTrue's built-in OAuth2/OIDC support. Covers Google Workspace, Azure AD (OIDC mode), and Okta (OIDC mode). No custom backend code needed for the happy path.
- **SAML 2.0**: Handled by our FastAPI backend using `python3-saml` (OneLogin library). Flow: SP-initiated SAML → IdP → POST assertion to `/api/v1/auth/saml/callback` → backend validates assertion → creates/updates Supabase user via admin API → returns Supabase JWT to frontend. Avoids requiring Supabase Enterprise tier.
- **Tested providers**: Okta, Azure AD, Google Workspace (all three must work end-to-end before phase complete)
- **SSO-only enforcement**: New `workspace_settings.sso_required` boolean. When true, email/password login is rejected at the backend auth middleware for members of that workspace.
- **Role claim mapping**: Admin configures `claim_key` (e.g., `groups`) and a mapping table `[{"claim_value": "eng-leads", "role": "admin"}]` stored as JSON in workspace settings. Unmapped claims default to `Member` role.

### Custom RBAC Model
- **New table**: `custom_role` (id, workspace_id, name, description, permissions JSONB, created_at)
- **Permissions format**: Array of `"resource:action"` strings, e.g. `["issues:read", "issues:write", "notes:read", "members:manage"]`
- **Resources in scope**: `issues`, `notes`, `cycles`, `members`, `settings`, `ai`, `integrations`
- **Actions**: `read`, `write`, `delete`, `manage` (manage = full control including sub-resource admin)
- **Assignment**: `workspace_member.custom_role_id` nullable FK to `custom_role`. If null, falls back to existing `WorkspaceRole` enum. Both coexist — custom roles are additive.
- **Admin UI**: New settings page at Settings > Roles — list roles with permissions, create/edit/delete custom roles, assign roles to members from the Members table
- **RLS impact**: `set_rls_context()` will receive custom role permissions and enforce them in the permission check layer (new `check_permission(user_id, workspace_id, resource, action)` function)

### Session Management
- **New table**: `workspace_session` (id, user_id, workspace_id, session_token_hash SHA-256, ip_address, user_agent, created_at, last_seen_at, revoked_at nullable)
- **Session recording**: Middleware records new sessions on first auth; updates `last_seen_at` on subsequent requests (max once per 60s to avoid write storms)
- **Admin UI**: Settings > Security > Sessions — table showing: member avatar/name, IP, browser/device (parsed from user-agent), last active, with "Terminate" button per row and "Terminate all" per user
- **Force-terminate**: Sets `revoked_at` on `workspace_session` + deletes Redis key + calls Supabase admin `auth.admin.signOut(userId)` for all-sessions termination

### SCIM 2.0 Provisioning
- **Endpoint prefix**: `/api/v1/scim/v2/` (separate namespace, no standard auth middleware — uses SCIM bearer token)
- **Scope**: Core User endpoints only — `GET /Users`, `GET /Users/{id}`, `POST /Users`, `PUT /Users/{id}`, `PATCH /Users/{id}`, `DELETE /Users/{id}`, `GET /ServiceProviderConfig`. No Groups endpoint in v1.
- **Auth**: Workspace admin generates a SCIM bearer token in Settings > Security > Directory Sync; stored in `workspace_settings.scim_token_hash`
- **Provisioning**: `POST /Users` → creates Supabase user + workspace_member with default role (or role from SCIM `roles` attribute)
- **Deprovisioning**: `DELETE /Users/{id}` → sets `workspace_member.is_active=false` + revokes sessions. Data (issues, notes) is NOT deleted. User cannot log in but data is preserved.
- **Update**: `PATCH /Users/{id}` (RFC 7644 PATCH ops: add/remove/replace) → syncs email, display name, active status

### Claude's Discretion
- Exact user-agent parsing library for session display (e.g., `ua-parser` Python, or manual regex)
- SAML metadata endpoint path and certificate rotation flow
- Exact Redis key schema for session revocation
- SCIM pagination implementation details (startIndex, count)
- Whether to show a "Connected via SSO" badge in the member list UI

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SupabaseAuth` (`infrastructure/auth/supabase_auth.py`): JWT validation, user lookup. SAML flow will create a new `SamlAuthProvider` alongside this.
- `WorkspaceMember` model (`models/workspace_member.py`): Has `WorkspaceRole` enum. Will add nullable `custom_role_id` FK and `is_active` boolean here.
- `set_rls_context()` (`infrastructure/database/rls.py`): Called before all workspace queries. New `check_permission()` function will live here or in a new `permissions.py` layer.
- Redis client (30-min TTL sessions): Session invalidation will leverage existing Redis client.
- Settings feature (`frontend/src/features/settings/`): Has pages, hooks, components structure. New pages (Roles, Security/Sessions, Directory Sync) follow same pattern.
- Auth router (`api/v1/routers/auth.py`): login, logout endpoints. SAML callback and OIDC config endpoints add here or in new `auth_sso.py` router.

### Established Patterns
- New tables follow `WorkspaceScopedModel` base class (automatic `workspace_id` FK + RLS).
- Alembic migration: new file per table; single head required before creating.
- DI container: new repositories registered as `providers.Factory` in `container.py`; new files added to `wiring_config.modules`.
- Settings pages: export from `features/settings/pages/index.ts` barrel.
- Backend file size: 700-line limit. SSO handler, SCIM router, and RBAC engine likely need separate files from auth.py.

### Integration Points
- `api/v1/routers/auth.py`: Add SAML callback route + `/auth/config` returns SSO status
- `api/v1/main.py` (router registration): Register new SCIM router under `/api/v1/scim/v2`
- `infrastructure/auth/supabase_auth.py`: SAML flow needs access to Supabase admin client to `createUser()` / `updateUser()`
- Frontend `(auth)/login/page.tsx`: Add "Continue with SSO" button when workspace has SSO configured
- `WorkspaceMember` model: add `custom_role_id` FK + `is_active` flag
- `AuthStore.ts` (MobX): exposes current user's effective permissions after login

</code_context>

<specifics>
## Specific Ideas

- SSO-only enforcement should produce a clear error at login: "This workspace requires SSO login. Use your [provider] account."
- Session table should show enough to distinguish "my laptop" from "unknown device" — parse browser + OS from user-agent
- Custom roles in the Members table should show the role name badge (same visual pattern as existing Owner/Admin/Member/Guest badges)
- SCIM deprovisioning must be safe-by-default: never delete data, only deactivate

</specifics>

<deferred>
## Deferred Ideas

- LDAP directory sync (on-premise) — AUTH-V2-01, future milestone
- FIDO2/WebAuthn hardware keys — AUTH-V2-02, future milestone
- IP allowlist per workspace — AUTH-V2-03, future milestone
- SCIM Groups endpoint — too complex for v1; schedule for audit/access review phase
- Per-project RBAC overrides — AIGOV-V2-01, future milestone

</deferred>

---

*Phase: 01-identity-and-access*
*Context gathered: 2026-03-07*
