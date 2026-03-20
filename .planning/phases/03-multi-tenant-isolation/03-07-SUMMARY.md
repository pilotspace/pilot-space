---
phase: 03-multi-tenant-isolation
plan: 07
subsystem: ui
tags: [admin, dashboard, tanstack-query, shadcn, next-app-router, sessionstorage, bearer-token]

# Dependency graph
requires:
  - phase: 03-multi-tenant-isolation
    plan: 04
    provides: "GET /api/v1/admin/workspaces and GET /api/v1/admin/workspaces/{slug} endpoints with bearer token auth"

provides:
  - /admin route group outside (workspace) — no workspace nav shell, no MobX
  - Token auth gate backed by sessionStorage (cleared on tab close)
  - Workspace health table: name/slug, members, owner, last_active, storage MB, AI actions, rate violations
  - Row expand: top 5 members, last 10 AI actions, quota config
  - Manual Refresh button (no polling)
  - Sign Out clears sessionStorage and returns to token form

affects:
  - Phase 04 and beyond that may add operator workflows

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "(admin) route group with minimal layout — inherits root layout html/body, adds no workspace context"
    - "Admin auth via sessionStorage.setItem('admin_token') — not localStorage; cleared on tab close"
    - "TanStack Query hooks with explicit token parameter — token changes trigger query key invalidation"
    - "Row expand pattern: expandedSlug state toggles detail row with colSpan={7}"
    - "WorkspaceDetailExpanded extracted to separate file — keeps main page under 700 lines"

key-files:
  created:
    - frontend/src/app/(admin)/admin/layout.tsx
    - frontend/src/app/(admin)/admin/page.tsx
    - frontend/src/features/admin/hooks/use-admin-workspaces.ts
    - frontend/src/features/admin/admin-dashboard-page.tsx
    - frontend/src/features/admin/workspace-detail-expanded.tsx
  modified: []

key-decisions:
  - "AdminLayout is a plain div wrapper — root layout already provides html/body; nesting html inside html would be invalid"
  - "Admin token passed as explicit hook parameter (not read inside hook) — token state change triggers query key change and re-fetch"
  - "WorkspaceDetailExpanded extracted to separate file — admin-dashboard-page.tsx at 326 lines, keeps both files under 700-line limit"
  - "AdminDashboardPage is plain React (no observer()) — no MobX; consistent with all settings pages pattern"
  - "retry: false on admin hooks — 401 should surface immediately, not retry 3 times"

patterns-established:
  - "Operator-only pages live in (admin) route group — separate from (workspace) group, inherits root providers"
  - "sessionStorage for ephemeral operator tokens — cleared on tab close, never persists to localStorage"

requirements-completed:
  - TENANT-04

# Metrics
duration: 18min
completed: 2026-03-08
---

# Phase 3 Plan 07: Operator Dashboard Frontend Summary

**Standalone /admin route with sessionStorage token gate, workspace health table with row expand, and TanStack Query hooks using Authorization: Bearer token**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-08T05:45:00Z
- **Completed:** 2026-03-08T06:03:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Operator dashboard at /admin renders completely outside the workspace nav shell — no MobX, no Supabase auth, no workspace context
- Token auth form stores to sessionStorage (tab-scoped, cleared on close); dashboard gate checks sessionStorage on render
- Workspace health table shows all 7 required columns with row expand revealing top 5 members, last 10 AI actions, and quota config via useAdminWorkspaceDetail

## Task Commits

Each task was committed atomically:

1. **Task 1: (admin) route group + TanStack Query hooks** - `af8f566b` (feat)
2. **Task 2: AdminDashboardPage — token form + workspace health table + row expand** - `8fc35c5f` (feat)

## Files Created/Modified

- `frontend/src/app/(admin)/admin/layout.tsx` — Minimal div wrapper layout; inherits root layout html/body
- `frontend/src/app/(admin)/admin/page.tsx` — Next.js route page renders AdminDashboardPage
- `frontend/src/features/admin/hooks/use-admin-workspaces.ts` — useAdminWorkspaces and useAdminWorkspaceDetail with Bearer token; retry: false; staleTime 60s
- `frontend/src/features/admin/admin-dashboard-page.tsx` — Token form + workspace health table + row expand (326 lines)
- `frontend/src/features/admin/workspace-detail-expanded.tsx` — Expanded detail panel: top members, recent AI actions, quota config (149 lines)

## Decisions Made

- AdminLayout is a plain div wrapper — root layout already provides html/body; the admin route group inherits from app/layout.tsx, so nesting html inside html would produce invalid HTML
- Admin token passed as explicit hook parameter (not read inside hook via sessionStorage.getItem) — when token state changes in component, the hook's queryKey changes and re-fetches automatically
- WorkspaceDetailExpanded extracted to a separate file — keeps admin-dashboard-page.tsx at 326 lines, well under the 700-line limit
- retry: false on both hooks — 401 auth failures should surface immediately to the user, not silently retry 3 times

## Deviations from Plan

None — plan executed exactly as written. The plan specified WorkspaceDetailExpanded could be extracted to a separate file if needed to stay under 700 lines; this was done proactively.

## Issues Encountered

- Pre-commit hook (prettier) reformatted files on first commit attempt — re-staged after formatting and committed successfully
- Pre-commit hook (eslint auto-fix) removed now-unnecessary eslint-disable comments on second commit attempt — re-staged after auto-fix and committed successfully

## User Setup Required

None — no external service configuration required. Admin token is the existing PILOT_SPACE_SUPER_ADMIN_TOKEN configured in backend/.env.

## Next Phase Readiness

- Phase 3 fully complete (7/7 plans done): RLS isolation, encryption, rate limiting, quota management, and operator dashboard all shipped
- Phase 4 (AI Governance) can begin — BYOK enforcement and CostTracker/ApprovalService fixes noted as blockers

---
*Phase: 03-multi-tenant-isolation*
*Completed: 2026-03-08*
