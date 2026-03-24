---
phase: 45-editor-plugin-api-and-custom-block-types
plan: 02
subsystem: ui
tags: [iframe, postMessage, sandbox, plugin-sdk, registry, tanstack-query]

requires:
  - phase: 42-command-palette-and-breadcrumb-navigation
    provides: ActionRegistry for plugin action registration
provides:
  - PluginSDKMethod union and METHOD_PERMISSIONS map for permission enforcement
  - PluginMessage/PluginResponse typed postMessage protocol
  - PluginSandbox iframe component with sandbox="allow-scripts"
  - PluginRegistry for tracking active plugin instances and registrations
  - usePluginLoader hook for fetching enabled plugins and lazy-loading bundles
affects: [45-03-PLAN, 45-04-PLAN, 45-05-PLAN]

tech-stack:
  added: []
  patterns: [iframe-sandbox-isolation, postMessage-typed-protocol, permission-gated-sdk, dom-customevent-bridge]

key-files:
  created:
    - frontend/src/features/plugins/sdk/plugin-sdk-types.ts
    - frontend/src/features/plugins/sandbox/message-protocol.ts
    - frontend/src/features/plugins/registry/PluginRegistry.ts
    - frontend/src/features/plugins/sandbox/PluginSandbox.tsx
    - frontend/src/features/plugins/hooks/usePluginLoader.ts
  modified: []

key-decisions:
  - "PluginRegistry is plain module-level Map, not MobX -- palette reads snapshot on open, no reactivity needed"
  - "PluginSandbox is plain React component (NOT observer) -- React 19 flushSync constraint"
  - "iframe sandbox='allow-scripts' only (no allow-same-origin, no allow-forms) -- maximum isolation"
  - "SDK proxy object built via srcdoc script, not injected -- avoids same-origin requirement"
  - "Plugin actions registered via ActionRegistry with plugin: prefixed IDs for namespace isolation"
  - "usePluginLoader uses TanStack Query dependent query pattern -- bundles fetched only after plugin list resolves"

patterns-established:
  - "iframe-sandbox-isolation: Plugins execute in sandboxed iframes with no host DOM access"
  - "postMessage-typed-protocol: All host-plugin communication via typed PluginMessage/PluginResponse"
  - "permission-gated-sdk: Every SDK method checked against manifest permissions before execution"
  - "dom-customevent-bridge: SDK calls dispatched as DOM CustomEvents for editor integration"

requirements-completed: [PLUG-02]

duration: 6min
completed: 2026-03-24
---

# Phase 45 Plan 02: Plugin Sandbox Runtime Summary

**Sandboxed iframe plugin execution engine with typed postMessage SDK, permission enforcement, and runtime PluginRegistry**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-24T14:27:06Z
- **Completed:** 2026-03-24T14:33:10Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- Built complete plugin SDK type system with 9 SDK methods mapped to 4 permission types
- Implemented sandboxed iframe component with srcdoc-based SDK proxy (zero DOM access to host)
- Created permission-enforcing message protocol that validates every SDK call before execution
- Built PluginRegistry tracking active instances, registered blocks, commands, and actions
- Implemented usePluginLoader hook with TanStack Query dependent query pattern for lazy bundle loading

## Task Commits

Each task was committed atomically:

1. **Task 1: Plugin SDK types, message protocol, and PluginRegistry** - `e7698b96` (feat)
2. **Task 2: PluginSandbox component and usePluginLoader hook** - `68b90b89` (feat)

## Files Created/Modified
- `frontend/src/features/plugins/sdk/plugin-sdk-types.ts` - SDK method types, permission map, message interfaces, type guards
- `frontend/src/features/plugins/sandbox/message-protocol.ts` - checkPermission, createMessageHandler, sendLifecycleEvent
- `frontend/src/features/plugins/registry/PluginRegistry.ts` - Plugin instance tracking, block/command/action registration
- `frontend/src/features/plugins/sandbox/PluginSandbox.tsx` - Hidden iframe with sandbox="allow-scripts", SDK handler wiring
- `frontend/src/features/plugins/hooks/usePluginLoader.ts` - TanStack Query hook for fetching enabled plugins and bundles

## Decisions Made
- PluginRegistry is plain module-level Map, not MobX -- consistent with ActionRegistry pattern from Phase 42
- PluginSandbox is plain React component (NOT observer) -- React 19 flushSync constraint
- iframe uses sandbox="allow-scripts" only (no allow-same-origin, no allow-forms) for maximum isolation
- SDK proxy built via srcdoc inline script to avoid same-origin requirement
- Plugin actions registered with "plugin:{pluginName}:{actionId}" prefix for namespace isolation
- usePluginLoader uses TanStack Query dependent query pattern with 5-minute staleTime

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-commit hook (prettier) reformatted files on first commit attempt -- re-staged and committed successfully
- useRef<HTMLIFrameElement>(undefined) incompatible with React 19 ref types -- changed to useRef(null)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Sandbox runtime complete, ready for Plan 03 (plugin manifest schema, install/enable backend)
- PluginRegistry provides aggregated view for Plan 04 (slash commands, block rendering integration)
- usePluginLoader ready for Plan 05 (editor integration, PluginHost component)

---
*Phase: 45-editor-plugin-api-and-custom-block-types*
*Completed: 2026-03-24*
