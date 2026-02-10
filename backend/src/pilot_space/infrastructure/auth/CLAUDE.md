# Authentication, RLS & Encryption - Pilot Space Infrastructure

**For parent layer overview, see [infrastructure/CLAUDE.md](../../infrastructure/CLAUDE.md)**

---

## Overview

This module handles the three pillars of Pilot Space security: authentication (Supabase JWT validation), authorization (Row-Level Security at the database level), and encryption (Supabase Vault for API key storage). RLS is the core security boundary -- violations expose sensitive data across workspaces.

---

## RLS (Row-Level Security) - Core Security Boundary

**RLS violations expose sensitive data across workspaces.** Database-level enforcement prevents application-layer bypass. This is the primary security boundary for multi-tenant isolation.

### RLS Architecture (`rls.py`)

**Set RLS context at request start**:

```python
async def set_rls_context(
    session: AsyncSession,
    user_id: UUID,
    workspace_id: UUID | None = None,
) -> None:
    """Set PostgreSQL session variables for policies."""
    await session.execute(
        text(f"SET LOCAL app.current_user_id = '{user_id}'")
    )
    if workspace_id:
        await session.execute(
            text(f"SET LOCAL app.current_workspace_id = '{workspace_id}'")
        )

async def clear_rls_context(session: AsyncSession) -> None:
    """Reset session variables (called on cleanup)."""
    await session.execute(text("RESET app.current_user_id"))
    await session.execute(text("RESET app.current_workspace_id"))
```

### Middleware Integration

```python
@app.middleware("http")
async def rls_middleware(request: Request, call_next):
    """Set RLS context for all requests."""
    user_id = request.state.user_id  # From auth token
    workspace_id = request.path_params.get("workspace_id")

    async with get_db_session() as session:
        await set_rls_context(session, user_id, workspace_id)
        request.state.session = session
        return await call_next(request)
```

---

## RLS Policies

### Workspace Isolation (Generic Pattern)

Applied to all tables with `workspace_id` column:

```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;

CREATE POLICY "{table}_workspace_isolation"
ON {table}
FOR ALL
USING (
    workspace_id IN (
        SELECT wm.workspace_id
        FROM workspace_members wm
        WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
        AND wm.is_deleted = false
    )
);

-- Service role bypasses RLS (admin operations only, never user-facing)
CREATE POLICY "{table}_service_role"
ON {table}
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
```

### User Table (Self + Workspace Members)

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can see themselves
CREATE POLICY "users_self"
ON users
FOR SELECT
USING (
    id = current_setting('app.current_user_id', true)::uuid
);

-- Users can see workspace co-members
CREATE POLICY "users_workspace_members"
ON users
FOR SELECT
USING (
    id IN (
        SELECT wm.user_id FROM workspace_members wm
        WHERE wm.workspace_id IN (
            SELECT wm2.workspace_id FROM workspace_members wm2
            WHERE wm2.user_id = current_setting('app.current_user_id', true)::uuid
            AND wm2.is_deleted = false
        )
        AND wm.is_deleted = false
    )
);
```

### WorkspaceMembers (Read-Only for Members, Modify for Admins)

```sql
-- All members can read membership list
CREATE POLICY "workspace_members_read"
ON workspace_members
FOR SELECT
USING (
    workspace_id IN (
        SELECT wm.workspace_id FROM workspace_members wm
        WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
        AND wm.is_deleted = false
    )
);

-- Only owners/admins can modify membership
CREATE POLICY "workspace_members_admin"
ON workspace_members
FOR ALL
USING (
    workspace_id IN (
        SELECT wm.workspace_id FROM workspace_members wm
        WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
        AND wm.role IN ('OWNER', 'ADMIN')
        AND wm.is_deleted = false
    )
);
```

---

## RLS Verification Checklist

For every new feature or table:

- [ ] RLS policy created for every multi-tenant table
- [ ] Service layer validates workspace membership before mutations
- [ ] Repository queries scoped by `workspace_id` OR rely on RLS
- [ ] `set_rls_context()` called in middleware/request handler
- [ ] Integration tests verify cross-workspace isolation (create 2 workspaces, verify leakage prevented)
- [ ] No raw SQL queries without RLS enforcement

---

## Common RLS Pitfalls

```python
# BAD - No workspace scope (leaks data across workspaces)
select(Issue)  # Returns issues from ALL workspaces

# GOOD - Explicit scope + RLS backup
select(Issue).where(Issue.workspace_id == workspace_id)

# BAD - Trusts user input without verification
await repo.find_by_workspace(user_provided_workspace_id)

# GOOD - RLS context set, policies filter automatically
await set_rls_context(session, user_id, workspace_id)
# Now database enforces access control

# BAD - Service role query bypasses RLS
# (Intended only for admin operations, never user-facing queries)

# BAD - Missing RLS context in AI tools
# AI tools must call get_workspace_context() before any data access
```

### RLS in AI Context

Every MCP tool respects RLS with 3-layer enforcement:

1. **Context Layer**: `get_workspace_context()` retrieves current workspace from request
2. **Application Layer**: Explicit `workspace_id` filter in all repository calls
3. **Database Layer**: PostgreSQL RLS policies via session variables (`app.current_workspace_id`)

```python
async def issue_tool(issue_id: str) -> str:
    workspace_id = get_workspace_context()
    issue = await issue_repo.get(issue_id=UUID(issue_id), workspace_id=workspace_id)
    if not issue:
        raise PermissionError(f"Issue not found in workspace {workspace_id}")
```

---

## Authentication

### SupabaseAuthClient

**Location**: `infrastructure/auth/supabase_auth.py`

JWT validation (HS256/ES256 algorithms) with `TokenPayload` dataclass. Returns `user_id` (UUID), expiration check, metadata.

**Methods**:
- `verify_token(token: str) -> TokenPayload` - Validate JWT signature, expiration, extract user_id
- `get_user_by_id(user_id: UUID) -> User` - Fetch user via Supabase Admin API

**Used in**: `AuthMiddleware` for request validation. All endpoints require valid JWT except health checks and OAuth callbacks.

**Token Flow**:
1. Frontend sends JWT via `Authorization: Bearer <token>` header (REST) or cookie (SSE)
2. `AuthMiddleware` calls `verify_token()` to validate and extract `user_id`
3. `user_id` stored in `request.state.user_id` for downstream use
4. RLS middleware uses `user_id` to set PostgreSQL session variables
5. All subsequent queries scoped by user's workspace memberships

**Workspace Roles** (4 levels):

| Role | Read Own Data | Read Workspace | Modify Workspace | Manage Members | Delete Workspace |
|------|--------------|----------------|-------------------|----------------|------------------|
| owner | Yes | Yes | Yes | Yes | Yes |
| admin | Yes | Yes | Yes | Yes | No |
| member | Yes | Yes | Limited | No | No |
| guest | Yes | Read-only | No | No | No |

---

## Encryption & Vault

### EncryptionService

**Location**: `infrastructure/encryption.py`

Encrypt/decrypt via Supabase Vault (AES-256-GCM).

**Methods**:
- `encrypt_api_key(key: str, key_type: str) -> str` - Store encrypted key in Vault
- `decrypt_api_key(key_id: str) -> str` - Retrieve and decrypt on demand

**Key Types**: `github`, `slack`, `openai`, `anthropic`, `google`

**Storage**: `WorkspaceAPIKey` model stores `encrypted_key` reference with `workspace_id` scoping. Decrypt on-demand only; never cache decrypted keys in memory.

**BYOK Pattern** (Bring Your Own Key):
1. User provides API key via Settings UI
2. `EncryptionService.encrypt_api_key()` stores in Supabase Vault
3. `WorkspaceAPIKey` record created with vault reference + workspace_id
4. AI agents call `decrypt_api_key()` at request time
5. Key used for single request, then discarded (no in-memory cache)

**Security Guarantees**:
- AES-256-GCM encryption (authenticated encryption with associated data)
- Keys never logged or exposed in error messages
- Decryption only at point of use (not cached)
- Workspace-scoped: each workspace has independent key storage

---

## RLS Migration Pattern

When adding a new multi-tenant table, always include RLS policies in the migration:

```python
"""Add RLS policy for new_table."""
from alembic import op

def upgrade():
    op.execute("""
    ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
    ALTER TABLE new_table FORCE ROW LEVEL SECURITY;

    CREATE POLICY "new_table_workspace_isolation"
    ON new_table
    FOR ALL
    USING (
        workspace_id IN (
            SELECT wm.workspace_id FROM workspace_members wm
            WHERE wm.user_id = current_setting('app.current_user_id', true)::uuid
            AND wm.is_deleted = false
        )
    );
    """)

def downgrade():
    op.execute("DROP POLICY IF EXISTS new_table_workspace_isolation ON new_table")
    op.execute("ALTER TABLE new_table DISABLE ROW LEVEL SECURITY")
```

---

## Troubleshooting

**RLS Context Not Set**: Run `SELECT current_setting('app.current_user_id')` to verify. If NULL, the middleware did not set context for this request path.

**Cross-Workspace Data Leak**: Create integration tests with 2 workspaces. Insert data in workspace A, query from workspace B context. Verify zero results returned.

**Token Validation Failures**: Check JWT algorithm (HS256 vs ES256), token expiration, and Supabase project URL in environment variables.

**Vault Decryption Errors**: Verify Supabase Vault is accessible, encrypted reference is valid, and service role has vault access permissions.

---

## Related Documentation

- **Parent layer**: [infrastructure/CLAUDE.md](../../infrastructure/CLAUDE.md) (full infrastructure overview)
- **Database models**: [database/CLAUDE.md](../database/CLAUDE.md) (WorkspaceScopedMixin, model hierarchy)
- **AI Layer RLS**: [ai/mcp/CLAUDE.md](../../ai/mcp/CLAUDE.md) (RLS enforcement in MCP tools)
- **RLS patterns**: `docs/architect/rls-patterns.md` (architectural patterns)
- **Design decisions**: `docs/DESIGN_DECISIONS.md` (DD-060: Supabase, DD-061: Auth + RLS)
