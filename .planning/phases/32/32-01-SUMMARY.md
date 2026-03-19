---
phase: 32-oauth-refresh-flow
plan: "01"
subsystem: backend/mcp-oauth
tags: [mcp, oauth, database, migration, encryption]
dependency_graph:
  requires:
    - "091_add_mcp_transport_type (migration chain)"
    - "pilot_space.infrastructure.encryption.encrypt_api_key"
  provides:
    - "092_add_oauth_refresh_token migration"
    - "WorkspaceMcpServer.refresh_token_encrypted column"
    - "WorkspaceMcpServer.token_expires_at column"
    - "_exchange_oauth_code returns 3-tuple"
    - "mcp_oauth_callback persists refresh token + expiry"
  affects:
    - "backend/alembic/versions/092_add_oauth_refresh_token.py"
    - "backend/src/pilot_space/infrastructure/database/models/workspace_mcp_server.py"
    - "backend/src/pilot_space/api/v1/routers/workspace_mcp_servers.py"
    - "backend/src/pilot_space/api/v1/routers/_mcp_server_schemas.py"
    - "backend/tests/api/test_workspace_mcp_servers.py"
tech_stack:
  added: []
  patterns:
    - "TDD RED-GREEN: xfail stubs first, then implementation"
    - "Alembic nullable column additions with explicit down_revision chain"
    - "Module-level encrypt_api_key import for mock patchability"
key_files:
  created:
    - "backend/alembic/versions/092_add_oauth_refresh_token.py"
  modified:
    - "backend/src/pilot_space/infrastructure/database/models/workspace_mcp_server.py"
    - "backend/src/pilot_space/api/v1/routers/workspace_mcp_servers.py"
    - "backend/src/pilot_space/api/v1/routers/_mcp_server_schemas.py"
    - "backend/tests/api/test_workspace_mcp_servers.py"
decisions:
  - "Moved encrypt_api_key to module-level import so tests can patch workspace_mcp_servers.encrypt_api_key directly"
  - "token_expires_at added to WorkspaceMcpServerResponse schema for frontend token-refresh awareness"
  - "_exchange_oauth_code returns None (not tuple with None access_token) when access_token absent — preserves None sentinel for error path"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-19"
  tasks_completed: 3
  files_modified: 5
  files_created: 1
---

# Phase 32 Plan 01: OAuth Refresh Token Storage Summary

**One-liner:** Alembic migration 092 + ORM columns + `_exchange_oauth_code` returns `(access, refresh, expires_in)` tuple stored encrypted at OAuth callback time.

## What Was Built

### Task 1: TDD RED — Test stubs
Added four `@pytest.mark.xfail(strict=False)` tests to `test_workspace_mcp_servers.py`:
- `test_exchange_oauth_code_returns_tuple` — asserts 3-tuple `("tok", "ref", 3600)`
- `test_exchange_oauth_code_no_refresh_token` — asserts `("tok", None, None)`
- `test_mcp_oauth_callback_stores_refresh_token` — asserts callback sets `refresh_token_encrypted` and `token_expires_at`
- `test_list_response_includes_token_expires_at` — asserts `token_expires_at` field exists in response schema

### Task 2: Migration 092 + ORM model
- Created `092_add_oauth_refresh_token.py` with `down_revision = "091_add_mcp_transport_type"`
- Adds `refresh_token_encrypted String(1024) nullable` and `token_expires_at DateTime(timezone=True) nullable`
- Added matching `Mapped[str | None]` and `Mapped[datetime | None]` fields to `WorkspaceMcpServer`

### Task 3: Router expansion
- `_exchange_oauth_code` return type changed from `str | None` to `tuple[str, str | None, int | None] | None`
- `mcp_oauth_callback` unpacks 3-tuple; stores `refresh_token_encrypted = encrypt_api_key(refresh_token)` when present; sets `token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)` when present
- `encrypt_api_key` moved from inline local import to module-level import
- `WorkspaceMcpServerResponse` schema gains `token_expires_at: datetime | None = None`

## Verification Results

```
11 passed, 6 xfailed, 4 xpassed, 7 warnings
ruff: All checks passed
pyright: 0 errors, 0 warnings, 0 informations
alembic heads: 092_add_oauth_refresh_token (head)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed existing callback test mocks broken by new tuple return type**
- **Found during:** Task 3
- **Issue:** Two existing tests (`test_oauth_callback_redirect_includes_workspace_slug`, `test_oauth_callback_redirect_fallback_without_slug`) mocked `_exchange_oauth_code` returning a bare string `"test-access-token"`. After Task 3 made the function return a 3-tuple, the callback would crash trying to unpack a string.
- **Fix:** Updated both mocks to `return_value=("test-access-token", None, None)`. Also corrected `encrypt_api_key` patch target from `pilot_space.infrastructure.encryption.encrypt_api_key` to `pilot_space.api.v1.routers.workspace_mcp_servers.encrypt_api_key` (matching the module-level import location).
- **Files modified:** `backend/tests/api/test_workspace_mcp_servers.py`
- **Commit:** aeb4cb9c

**2. [Rule 2 - Missing field] Added token_expires_at to WorkspaceMcpServerResponse schema**
- **Found during:** Task 3 (test_list_response_includes_token_expires_at would fail without it)
- **Issue:** The response schema didn't expose `token_expires_at`, making the field invisible to API consumers and failing the test assertion.
- **Fix:** Added `token_expires_at: datetime | None = None` to `WorkspaceMcpServerResponse` in `_mcp_server_schemas.py`.
- **Files modified:** `backend/src/pilot_space/api/v1/routers/_mcp_server_schemas.py`
- **Commit:** aeb4cb9c

## Self-Check: PASSED
