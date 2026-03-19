---
phase: 35-mcp-catalog
plan: 01
subsystem: backend
tags: [mcp, catalog, migrations, repository, api, fastapi, sqlalchemy]
dependency-graph:
  requires: [migrations/094_add_mcp_audit_index]
  provides: [GET /api/v1/mcp-catalog, mcp_catalog_entries table, catalog_entry_id FK on workspace_mcp_servers]
  affects: [workspace_mcp_servers table, WorkspaceMcpServerCreate schema, WorkspaceMcpServerResponse schema]
tech-stack:
  added: []
  patterns:
    - GlobalOrmModelPattern: BaseModel (not WorkspaceScopedModel) for non-workspace-scoped catalog
    - MigrationSeedPattern: Static seed data in upgrade() rather than SeedPluginsService
    - EnumReusePattern: create_type=False for existing PostgreSQL ENUM types
    - InlineRepositoryPattern: Repository instantiated inline in router (no DI container wiring)
key-files:
  created:
    - backend/alembic/versions/095_add_mcp_catalog_entries.py
    - backend/alembic/versions/096_add_catalog_fk_to_mcp_servers.py
    - backend/src/pilot_space/infrastructure/database/models/mcp_catalog_entry.py
    - backend/src/pilot_space/infrastructure/database/repositories/mcp_catalog_repository.py
    - backend/src/pilot_space/api/v1/routers/mcp_catalog.py
    - backend/tests/unit/api/test_mcp_catalog_router.py
  modified:
    - backend/src/pilot_space/infrastructure/database/models/workspace_mcp_server.py
    - backend/src/pilot_space/api/v1/routers/_mcp_server_schemas.py
    - backend/src/pilot_space/main.py
decisions:
  - "Global catalog table (BaseModel, no workspace_id) — same catalog for all workspaces, no RLS needed"
  - "Enum reuse with create_type=False — mcp_transport_type and mcp_auth_type already exist from migrations 091/093"
  - "Seed in migration 095 — Context7 (bearer/http) and GitHub (oauth2/http) as is_official=true entries"
  - "Inline repository in router — no DI container wiring (same pattern as mcp_usage.py)"
metrics:
  duration: "~30 minutes"
  completed: "2026-03-20"
  tasks_completed: 2
  files_created: 6
  files_modified: 3
  tests_added: 8
  tests_passed: 3837
---

# Phase 35 Plan 01: Backend MCP Catalog — Model + Migrations + API + Seeds Summary

**One-liner:** Global `mcp_catalog_entries` table seeded with Context7 (bearer/HTTP) and GitHub (OAuth2/HTTP) official entries, surfaced via `GET /api/v1/mcp-catalog` returning `{items, total}`.

## What Was Built

### Migrations (095 + 096)

Migration 095 creates the `mcp_catalog_entries` global table and seeds two official entries:
- **Context7** — `https://mcp.context7.com/mcp`, transport=http, auth=bearer, is_official=true, sort_order=0
- **GitHub** — `https://api.githubcopilot.com/mcp/`, transport=http, auth=oauth2, is_official=true, sort_order=1, OAuth URLs pre-filled

Migration 096 adds two nullable columns to `workspace_mcp_servers`:
- `catalog_entry_id UUID FK → mcp_catalog_entries(id) ON DELETE SET NULL`
- `installed_catalog_version VARCHAR(32)`

Both migrations use `create_type=False` on Enum columns to reuse existing PostgreSQL ENUM types from migrations 091/093.

**DB status:** Migration files structurally correct and chain verified (`alembic heads` = `096_add_catalog_fk_to_mcp_servers`). DB unreachable in current environment (Docker not running) — migrations will apply on next `alembic upgrade head`.

### ORM Model (McpCatalogEntry)

`McpCatalogEntry(BaseModel)` in `mcp_catalog_entry.py` — extends `BaseModel` directly (not `WorkspaceScopedModel`). Has no `workspace_id` column. All columns mirror migration 095. Uses `create_type=False` for both Enum columns.

### Repository (McpCatalogRepository)

`McpCatalogRepository` with `get_all_active()` (returns all non-deleted rows ordered by `sort_order`) and `get_by_id(entry_id)`. Follows the inline instantiation pattern (constructor takes `session: AsyncSession`).

### Router (GET /api/v1/mcp-catalog)

`mcp_catalog.py` — `APIRouter()` with single `GET ""` endpoint. Requires `CurrentUser` (auth gate only) and `DbSession`. Returns `McpCatalogListResponse(items=[McpCatalogEntryResponse...], total=N)`. Registered in `main.py` at `/api/v1/mcp-catalog`.

### Schema Extensions

`WorkspaceMcpServerCreate` now accepts:
- `catalog_entry_id: UUID | None = None`
- `installed_catalog_version: str | None = Field(default=None, max_length=32)`

`WorkspaceMcpServerResponse` now includes:
- `catalog_entry_id: str | None = None`
- `installed_catalog_version: str | None = None`

`WorkspaceMcpServer` ORM has two new mapped columns with FK to `mcp_catalog_entries`.

## Decisions Made

1. **Global catalog table (BaseModel)** — Catalog entries are identical for all workspaces. Using `WorkspaceScopedModel` would require seeding per-workspace and create redundant rows. `BaseModel` with no `workspace_id` is correct.

2. **Enum reuse with `create_type=False`** — `mcp_transport_type` and `mcp_auth_type` PostgreSQL ENUM types already exist from migrations 091/093. Creating them again would raise `type already exists` error.

3. **Seed in migration** — Context7 and GitHub are static, well-known entries. Seeding in `upgrade()` guarantees they exist before any catalog request is served. No external API calls needed.

4. **Inline repository instantiation** — `McpCatalogRepository(session=session)` created inline in the router handler. This matches the `mcp_usage.py` pattern and avoids DI container wiring for a simple read-only repository.

5. **Separate `mcp_catalog.py` router** — Keeps `workspace_mcp_servers.py` under the 700-line pre-commit limit. Global catalog endpoint has no workspace path parameter.

## Deviations from Plan

None — plan executed exactly as written, with one auto-fix:

### Auto-fixed Issues

**1. [Rule 1 - Bug] `datetime.now()` without timezone in tests**
- **Found during:** Pre-commit hook on Task 2 commit
- **Issue:** Test file used `datetime.now()` (no `tz` argument) — ruff DTZ005 violation
- **Fix:** Pre-commit hook applied `datetime.now(tz=UTC)` automatically; `from datetime import UTC` import added
- **Files modified:** `tests/unit/api/test_mcp_catalog_router.py`

## Test Results

| Test | Status | Coverage |
|------|--------|----------|
| `test_list_catalog_returns_200_with_items` | PASS | MCPC-01 |
| `test_list_catalog_response_shape` | PASS | MCPC-01 |
| `test_official_entries_names_match_seeds` | PASS | MCPC-04 |
| `test_workspace_mcp_server_create_accepts_catalog_fields` | PASS | MCPC-02 |
| `test_workspace_mcp_server_create_catalog_fields_are_optional` | PASS | MCPC-02 |
| `test_workspace_mcp_server_response_includes_catalog_fields` | PASS | MCPC-02 |
| `test_workspace_mcp_server_response_catalog_fields_default_none` | PASS | MCPC-02 |
| `test_list_catalog_empty_returns_empty_list` | PASS | edge case |

Full unit suite: **3837 passed, 41 skipped, 15 xfailed, 12 xpassed** — 0 failures.

## Quality Gates

- pyright: 0 errors, 0 warnings on all new/modified files
- ruff: all checks pass on all new/modified files
- pre-commit: all hooks pass
- alembic chain: single head at `096_add_catalog_fk_to_mcp_servers` (verified without DB)

## Self-Check: PASSED

- `/Users/tindang/workspaces/tind-repo/pilot-space-3/backend/alembic/versions/095_add_mcp_catalog_entries.py` — EXISTS
- `/Users/tindang/workspaces/tind-repo/pilot-space-3/backend/alembic/versions/096_add_catalog_fk_to_mcp_servers.py` — EXISTS
- `/Users/tindang/workspaces/tind-repo/pilot-space-3/backend/src/pilot_space/infrastructure/database/models/mcp_catalog_entry.py` — EXISTS
- `/Users/tindang/workspaces/tind-repo/pilot-space-3/backend/src/pilot_space/infrastructure/database/repositories/mcp_catalog_repository.py` — EXISTS
- `/Users/tindang/workspaces/tind-repo/pilot-space-3/backend/src/pilot_space/api/v1/routers/mcp_catalog.py` — EXISTS
- `/Users/tindang/workspaces/tind-repo/pilot-space-3/backend/tests/unit/api/test_mcp_catalog_router.py` — EXISTS
- Commit `92407179` — EXISTS (verified via `git log --oneline -1`)
