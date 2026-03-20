---
phase: 03-multi-tenant-isolation
plan: "06"
subsystem: frontend-settings
tags: [usage, quota, storage, rate-limits, tanstack-query, settings-ui]
dependency_graph:
  requires: [03-03]
  provides: [TENANT-03-frontend]
  affects: [frontend/src/features/settings, frontend/src/app/settings/usage]
tech_stack:
  added: []
  patterns: [TanStack Query useQuery/useMutation, plain React settings page, shadcn/ui Progress]
key_files:
  created:
    - frontend/src/features/settings/hooks/use-workspace-quota.ts
    - frontend/src/features/settings/pages/usage-settings-page.tsx
    - frontend/src/app/(workspace)/[workspaceSlug]/settings/usage/page.tsx
  modified:
    - frontend/src/features/settings/pages/index.ts
    - frontend/src/app/(workspace)/[workspaceSlug]/settings/layout.tsx
decisions:
  - "UsageSettingsPage is plain React (no observer()) — consistent with all settings pages; TanStack Query handles all data"
  - "Storage bar uses conditional Tailwind class on progress-indicator slot at 80%/100% thresholds (amber/destructive)"
  - "OwnerQuotaForm destructures quota to primitive deps for useEffect sync instead of object reference — avoids stale closure on refresh"
  - "Null quota fields: empty input submits as null to API (reverts to system default); non-empty integer sets custom limit"
metrics:
  duration_minutes: 4
  completed_date: "2026-03-08"
  tasks_completed: 2
  files_changed: 5
---

# Phase 3 Plan 6: Usage Settings UI Summary

**One-liner:** Storage and rate-limit quota display with shadcn/ui Progress bars, owner-editable inputs, and TanStack Query hooks for GET/PATCH /workspaces/{slug}/settings/quota.

## What Was Built

### Task 1: TanStack Query Hooks (commit f5bf09fb)

`frontend/src/features/settings/hooks/use-workspace-quota.ts`

- `QuotaStatus` interface: `rate_limit_standard_rpm | null`, `rate_limit_ai_rpm | null`, `storage_quota_mb | null`, `storage_used_bytes`, `storage_used_mb`
- `useWorkspaceQuota(workspaceSlug)`: GET with 30s staleTime, query key `['workspace', slug, 'quota']`
- `useUpdateWorkspaceQuota(workspaceSlug)`: PATCH mutation with cache invalidation on success

### Task 2: Page Component, Route, Nav Entry (commit c270c041)

`frontend/src/features/settings/pages/usage-settings-page.tsx`

- Plain React (no observer()), TanStack Query for all data
- Storage Card: `StorageBar` with `shadcn/ui Progress`, color-coded at 80%/100% via CSS slot class override
- NULL `storage_quota_mb` displays as "Unlimited"
- OWNER sees `OwnerQuotaForm`: three number inputs (storage MB, standard RPM, AI RPM), empty = null, Save on submit, toast on success, inline error on failure
- Non-OWNER sees `RateLimitReadOnly`: definition list with current values, null shown as system default
- Loading: `Skeleton` placeholders; error: `Alert` destructive

`frontend/src/app/(workspace)/[workspaceSlug]/settings/usage/page.tsx` — Next.js route wrapper

`frontend/src/features/settings/pages/index.ts` — added `UsageSettingsPage` export

`frontend/src/app/(workspace)/[workspaceSlug]/settings/layout.tsx` — added "Usage" nav entry with `BarChart3` icon in Workspace section

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- TypeScript: clean (tsc --noEmit passes)
- Lint: 0 errors, 22 pre-existing warnings (none in new files)
- Line count: 326 lines (under 700 limit)
- Route exists: `settings/usage/page.tsx` confirmed
- Both commits passed all pre-commit hooks (eslint, typescript, prettier, file-size)

## Self-Check: PASSED

Files exist:
- FOUND: frontend/src/features/settings/hooks/use-workspace-quota.ts
- FOUND: frontend/src/features/settings/pages/usage-settings-page.tsx
- FOUND: frontend/src/app/(workspace)/[workspaceSlug]/settings/usage/page.tsx

Commits exist:
- FOUND: f5bf09fb — feat(03-06): add TanStack Query hooks for workspace quota
- FOUND: c270c041 — feat(03-06): add UsageSettingsPage with quota bars and owner edit controls
