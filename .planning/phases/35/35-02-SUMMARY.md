---
phase: 35-mcp-catalog
plan: 02
subsystem: frontend/settings/mcp-catalog
tags: [mcp, catalog, mobx, react, tiptap, settings, browse, install]
dependency_graph:
  requires:
    - 35-01 (backend MCP catalog API — GET /mcp-catalog endpoint + migrations + seeds)
  provides:
    - Frontend MCP catalog tab with browsable entries and one-click install
    - MCPCatalogStore (MobX) with loadCatalog(), hasUpdate(), isInstalled()
    - mcpCatalogApi.list() typed API client
    - MCPCatalogCard component with install state and update badge
    - MCPCatalogTabContent observer with transport filter chips
    - Tabs UI in MCPServersSettingsPage (Registered Servers + Catalog)
  affects:
    - frontend/src/stores/ai/MCPServersStore.ts (extended MCPServer + MCPServerRegisterRequest)
    - frontend/src/stores/ai/AIStore.ts (added mcpCatalog store)
    - frontend/src/features/settings/pages/mcp-servers-settings-page.tsx (tabs)
tech_stack:
  added:
    - shadcn/ui Tabs component for settings page tabbing
  patterns:
    - MobX observer + plain component split (MCPCatalogTabContent observer, MCPCatalogCard plain)
    - TDD RED/GREEN/REFACTOR for both store and UI layers
    - Utility functions hasUpdate() and isInstalled() exported alongside the store class
key_files:
  created:
    - frontend/src/services/api/mcp-catalog.ts
    - frontend/src/stores/ai/MCPCatalogStore.ts
    - frontend/src/features/settings/components/mcp-catalog-card.tsx
    - frontend/src/features/settings/components/mcp-catalog-tab-content.tsx
    - frontend/src/stores/ai/__tests__/MCPCatalogStore.test.ts
    - frontend/src/features/settings/components/__tests__/mcp-catalog-card.test.tsx
    - frontend/src/features/settings/components/__tests__/mcp-catalog-tab-content.test.tsx
  modified:
    - frontend/src/stores/ai/MCPServersStore.ts
    - frontend/src/stores/ai/AIStore.ts
    - frontend/src/stores/ai/index.ts
    - frontend/src/features/settings/pages/mcp-servers-settings-page.tsx
decisions:
  - "MCPCatalogCard is plain (not observer) to keep it test-friendly and free of MobX coupling"
  - "hasUpdate and isInstalled implemented as standalone exported utility functions alongside MCPCatalogStore class"
  - "Update Available badge shown on Catalog tab card only, not on existing MCPServerCard (avoids modifying complex existing component)"
  - "useStore() mock uses 'as unknown as ReturnType<typeof useStore>' for test isolation without requiring full store shape"
metrics:
  duration: "12 minutes"
  completed_date: "2026-03-20"
  tasks_completed: 2
  tasks_total: 2
  files_created: 7
  files_modified: 4
  tests_added: 28
  test_files_added: 3
requirements:
  - MCPC-01
  - MCPC-02
  - MCPC-03
---

# Phase 35 Plan 02: Frontend MCP Catalog UI Summary

**One-liner:** Browsable MCP catalog tab with one-click install, filter chips, and update-available badge detection using MobX store + plain/observer component split.

## What Was Built

### API Client (`frontend/src/services/api/mcp-catalog.ts`)
- `McpCatalogEntry` interface matching backend `McpCatalogEntryResponse` shape
- `McpCatalogListResponse` interface
- `mcpCatalogApi.list()` — calls `GET /mcp-catalog`, returns typed list

### MCPCatalogStore (`frontend/src/stores/ai/MCPCatalogStore.ts`)
- MobX store with `entries[]`, `isLoading`, `error`
- `loadCatalog()` async method with proper `runInAction` pattern
- `reset()` for AIStore.reset() integration
- Exported utility functions:
  - `hasUpdate(entry, server)` — true when `installed_catalog_version` differs from `catalog_version`
  - `isInstalled(entry, servers)` — true when any server has matching `catalog_entry_id`

### Type Extensions (`frontend/src/stores/ai/MCPServersStore.ts`)
- `MCPServer`: added `catalog_entry_id?: string | null` and `installed_catalog_version?: string | null`
- `MCPServerRegisterRequest`: added `catalog_entry_id?`, `installed_catalog_version?`, `transport_type?`

### MCPCatalogCard (`frontend/src/features/settings/components/mcp-catalog-card.tsx`)
- Plain component (no observer, no MobX) receiving all data as props
- Name, description, transport badge (HTTP/SSE), auth badge (Bearer/OAuth2)
- Blue "Official" badge for `is_official=true` entries
- Green "Installed" badge + disabled button when `isInstalled=true`
- Amber "Update Available" badge when `hasUpdate=true`
- "Install" button calls `onInstall(entry)` — disabled when already installed

### MCPCatalogTabContent (`frontend/src/features/settings/components/mcp-catalog-tab-content.tsx`)
- Observer component reading `useStore().ai.mcpCatalog`
- Calls `catalogStore.loadCatalog()` on mount
- Filter chips: All / HTTP / SSE (inline buttons, no separate component)
- Loading skeleton while `catalogStore.isLoading`
- Error alert when `catalogStore.error` and entries empty
- Empty state message when no entries match filter
- Computes `isInstalled` and `hasUpdate` per entry from `installedServers` prop

### Tabs Integration (`frontend/src/features/settings/pages/mcp-servers-settings-page.tsx`)
- shadcn/ui `Tabs` wrapping existing content
- "Registered Servers" tab: all existing form + server list + info alert
- "Catalog" tab: `MCPCatalogTabContent` with `workspaceId`, `installedServers`, `onInstall`
- `handleInstallFromCatalog(entry)` pre-fills `registerServer()` with catalog fields
- Success toast: "Server installed — add your auth token to activate it."
- Tab switches back to "registered" after successful install

## Test Coverage

| File | Tests | Status |
|------|-------|--------|
| `MCPCatalogStore.test.ts` | 12 | Passed |
| `mcp-catalog-card.test.tsx` | 9 | Passed |
| `mcp-catalog-tab-content.test.tsx` | 7 | Passed |
| `MCPServersStore.test.ts` (existing) | 7 | Still Passed |
| `mcp-server-card.test.tsx` (existing) | 8 | Still Passed |

**Total new tests: 28. All pass.**

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Notes

- `pnpm test --run` shows 52 pre-existing failures unrelated to this plan (workspace-switcher, editor components, etc.) — confirmed by checking baseline before changes
- Prettier formatting applied by pre-commit hook on both commits — rerun was handled automatically

## Self-Check: PASSED

All created files found on disk. Both task commits verified:
- `2abb5cf1` — Task 1: API client + MCPCatalogStore + type extensions
- `7021a8f2` — Task 2: MCPCatalogCard + MCPCatalogTabContent + tab integration
