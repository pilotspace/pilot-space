---
phase: 45-editor-plugin-api-and-custom-block-types
plan: 01
subsystem: api, database
tags: [fastapi, sqlalchemy, alembic, supabase-storage, plugin-system, typescript]

requires:
  - phase: 44-web-git-integration-and-source-control-panel
    provides: existing workspace infrastructure and router patterns
provides:
  - PluginManifest TypeScript type contract (frontend)
  - EditorPlugin SQLAlchemy model with JSONB manifest storage
  - Alembic migration 098 with RLS policies for editor_plugins table
  - EditorPluginRepository with workspace-scoped CRUD
  - EditorPluginService with manifest validation and Supabase Storage upload
  - CRUD router at /api/v1/workspaces/{workspace_id}/editor-plugins
affects: [45-02-plugin-sandbox-loader, 45-03-custom-block-types, 45-04-slash-commands, 45-05-settings-ui]

tech-stack:
  added: []
  patterns: [editor-plugin-manifest-schema, direct-instantiation-router-pattern]

key-files:
  created:
    - frontend/src/features/plugins/types.ts
    - backend/src/pilot_space/infrastructure/database/models/editor_plugin.py
    - backend/src/pilot_space/infrastructure/database/repositories/editor_plugin_repository.py
    - backend/src/pilot_space/application/services/editor_plugin/editor_plugin_service.py
    - backend/src/pilot_space/api/v1/routers/editor_plugins.py
    - backend/src/pilot_space/domain/editor_plugin.py
    - backend/alembic/versions/098_add_editor_plugins.py
  modified:
    - backend/src/pilot_space/infrastructure/database/models/__init__.py
    - backend/src/pilot_space/main.py

key-decisions:
  - "EditorPlugin is a separate model from existing WorkspacePlugin (Phase 19 GitHub skill plugins) to avoid schema collision"
  - "Uses direct instantiation pattern (no DI container) -- follows workspace_plugins router precedent"
  - "Partial unique index on (workspace_id, name) WHERE is_deleted=false allows plugin re-install after soft-delete"
  - "RLS: any workspace member can SELECT; only admins/owners can INSERT/UPDATE/DELETE"

patterns-established:
  - "Editor plugin manifest validation: name (lowercase alphanum+hyphens), version (semver), entrypoint (required)"
  - "Plugin bundle stored at plugins/{workspace_id}/{name}/{version}/{entrypoint} in editor-plugins bucket"

requirements-completed: [PLUG-01, PLUG-03]

duration: 11min
completed: 2026-03-24
---

# Phase 45 Plan 01: Plugin Type System and Backend API Summary

**PluginManifest TypeScript types, EditorPlugin SQLAlchemy model with Alembic migration, and CRUD REST API for workspace editor plugin management with Supabase Storage bundle upload**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-24T14:28:35Z
- **Completed:** 2026-03-24T14:39:26Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- PluginManifest is the single source of truth for plugin shape (shared frontend/backend contract)
- Backend can persist, query, toggle, and delete workspace editor plugins
- Plugin JS bundles stored in Supabase Storage under workspace-scoped paths
- CRUD API endpoints wired and accessible at /api/v1/workspaces/{workspace_id}/editor-plugins

## Task Commits

Each task was committed atomically:

1. **Task 1: Plugin type contracts and domain model + migration** - `d352d149` (feat)
2. **Task 2: Plugin repository, service, and CRUD router** - `c381a569` (feat)

## Files Created/Modified
- `frontend/src/features/plugins/types.ts` - PluginManifest, PluginPermission, PluginBlockType, PluginSlashCommand, PluginAction, PluginStatus, WorkspacePlugin types
- `backend/src/pilot_space/infrastructure/database/models/editor_plugin.py` - EditorPlugin SQLAlchemy model with JSONB manifest, workspace FK, soft-delete
- `backend/src/pilot_space/domain/editor_plugin.py` - Domain-layer re-export
- `backend/alembic/versions/098_add_editor_plugins.py` - Migration with table, partial unique index, RLS policies
- `backend/src/pilot_space/infrastructure/database/models/__init__.py` - Register EditorPlugin
- `backend/src/pilot_space/infrastructure/database/repositories/editor_plugin_repository.py` - Repository with list, get_enabled, get_by_name, create, update, hard_delete
- `backend/src/pilot_space/application/services/editor_plugin/editor_plugin_service.py` - Service with manifest validation, storage upload, plugin lifecycle
- `backend/src/pilot_space/api/v1/routers/editor_plugins.py` - CRUD router: GET, GET/enabled, POST (multipart), PATCH status, DELETE
- `backend/src/pilot_space/main.py` - Mount editor_plugins_router

## Decisions Made
- Created EditorPlugin as a separate entity from existing WorkspacePlugin (Phase 19 stores GitHub-sourced skill markdown; Phase 45 stores JS bundle editor plugins with manifest)
- Used direct instantiation pattern (not @inject DI) following workspace_plugins router precedent -- simpler for this use case
- Partial unique index on (workspace_id, name) WHERE is_deleted=false allows re-install after soft-delete
- Hard delete for plugin removal (not soft-delete) since bundles are also removed from storage
- 1MB max bundle size enforced at service layer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adapted file paths to actual project structure**
- **Found during:** Task 1 (domain model creation)
- **Issue:** Plan specified paths like `backend/src/pilot_space/domain/workspace_plugin.py` and `backend/src/pilot_space/routers/` but actual project uses `infrastructure/database/models/`, `infrastructure/database/repositories/`, `application/services/`, and `api/v1/routers/`
- **Fix:** Created files at correct project paths following existing patterns
- **Files modified:** All backend files created at proper paths
- **Verification:** pyright passes, ruff passes, alembic heads shows single head

**2. [Rule 3 - Blocking] Renamed entity to EditorPlugin to avoid collision**
- **Found during:** Task 1 (model creation)
- **Issue:** Plan used WorkspacePlugin name but that entity already exists from Phase 19 (GitHub-sourced skill plugins)
- **Fix:** Named the new entity EditorPlugin with table name editor_plugins
- **Files modified:** All backend files use EditorPlugin naming
- **Verification:** No name collision, both models coexist

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both deviations were necessary to integrate with the existing codebase. No scope creep.

## Issues Encountered
- Pre-commit hooks in sparse checkout worktree created duplicate commits due to planning files appearing as deleted; resolved by resetting to correct commits

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plugin type system and API layer complete -- ready for Plan 02 (Plugin Sandbox and Loader)
- PluginManifest types can be imported by sandbox/loader components
- EditorPlugin endpoints are mountable and accessible for the plugin settings UI

---
*Phase: 45-editor-plugin-api-and-custom-block-types*
*Completed: 2026-03-24*
