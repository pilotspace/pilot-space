---
phase: 04-ai-governance
plan: "06"
subsystem: ui
tags: [react, tanstack-query, recharts, shadcn-ui, audit-log, cost-dashboard, mobx]

# Dependency graph
requires:
  - phase: 04-ai-governance
    provides: audit log actor_type filter backend (AIGOV-03) and cost summary group_by=operation_type endpoint (AIGOV-06)

provides:
  - Audit settings page actor_type filter dropdown (AI/USER/SYSTEM)
  - AI-specific expanded row fields: approval request link in audit log
  - Cost dashboard By Feature tab with horizontal bar chart of operation_type costs

affects:
  - 04-07 (AI governance tests rely on these UI components)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lazy tab query: useQuery enabled only when activeTab matches, avoids fetching on mount
    - Sentinel _all_ pattern for Radix Select empty-string values (consistent with existing action/resource_type filters)
    - Horizontal BarChart from recharts for ranked breakdowns (sorted descending by cost)

key-files:
  created: []
  modified:
    - frontend/src/features/settings/hooks/use-audit-log.ts
    - frontend/src/features/settings/pages/audit-settings-page.tsx
    - frontend/src/features/costs/pages/cost-dashboard-page.tsx
    - frontend/src/services/api/ai.ts

key-decisions:
  - "AuditFilters.actor_type added as optional param — hook stays backward-compatible; no actor_type omits filter from query"
  - "approvalRequestId added to AuditLogEntry as string | null — optional field, approval link renders only when non-null"
  - "ExpandedRowContent gains workspaceSlug prop for approval link generation — avoids threading workspaceSlug through entry data"
  - "By Feature tab uses lazy useQuery (enabled: activeTab === 'by_feature') — avoids unnecessary API call on mount"
  - "Horizontal BarChart preferred over donut PieChart for feature costs — ranked list better communicates relative cost contribution across 5-10 operation_type buckets"
  - "featureChartData sorted descending by cost — highest-cost features visible without scrolling"

patterns-established:
  - "Tab lazy-fetch: useQuery with enabled: activeTab === tab_key for expensive per-tab queries"
  - "Sentinel _all_ for All-option Radix Select values (empty string not supported as Select value)"

requirements-completed:
  - AIGOV-03
  - AIGOV-06

# Metrics
duration: 18min
completed: 2026-03-08
---

# Phase 4 Plan 06: Audit Actor Type Filter + Cost By Feature Tab Summary

**actor_type filter on audit log (AI/USER/SYSTEM) and By Feature horizontal bar chart on cost dashboard using group_by=operation_type**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-08T10:35:00Z
- **Completed:** 2026-03-08T10:53:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Audit settings page: actor_type filter dropdown added to filter bar, `AuditFilters` and `buildAuditParams` updated, export also passes actor_type filter
- Audit settings page: `approvalRequestId` field added to `AuditLogEntry`; AI expanded row renders "View approval request" link when present
- Cost dashboard: By Agent / By Feature tabs wrap the charts section; feature tab lazy-fetches `group_by=operation_type` summary only when active
- Cost dashboard: horizontal BarChart renders operation_type cost breakdown sorted by cost descending with accessible color palette

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit settings page — actor_type filter + AI row expansion** - `bc2726a2` (feat)
2. **Task 2: Cost dashboard — By Feature tab** - `77cb0465` (feat)

**Plan metadata:** (this docs commit)

## Files Created/Modified
- `frontend/src/features/settings/hooks/use-audit-log.ts` - Added actor_type to AuditFilters, AuditLogEntry (approvalRequestId), buildAuditParams, export params
- `frontend/src/features/settings/pages/audit-settings-page.tsx` - selectedActorType state, Actor Type Select in filter bar (6-col grid), ExpandedRowContent approval link
- `frontend/src/features/costs/pages/cost-dashboard-page.tsx` - By Agent/By Feature Tabs, lazy useQuery for feature data, horizontal BarChart with Cell colors
- `frontend/src/services/api/ai.ts` - by_feature field on CostSummary type, optional groupBy param on getCostSummary

## Decisions Made
- Sentinel `_all_` used for "All types" in Actor Type Select — consistent with existing action and resource_type selects (Radix Select rejects empty string)
- `ExpandedRowContent` receives `workspaceSlug` as explicit prop rather than from context — component is locally-scoped, prop threading is minimal and explicit
- By Feature chart uses a horizontal `BarChart` (not a `PieChart`) — operation_type labels are long and ranked comparison reads better horizontally
- `featureChartData` sorted descending before render — most expensive feature is immediately visible without scrolling
- Lazy query enabled only when `activeTab === 'by_feature'` — avoids fetch on dashboard mount; aligns with YAGNI for infrequently-viewed tab

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Recharts `Tooltip` `formatter` and `labelFormatter` TypeScript signatures required `value: number | undefined` and `label: unknown` narrowing to satisfy `recharts@2.x` strict overloads — fixed inline, type-check passes cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All AIGOV-03 and AIGOV-06 frontend requirements met
- Plan 04-07 (AI governance tests) can proceed
- No blockers

---
*Phase: 04-ai-governance*
*Completed: 2026-03-08*
