---
phase: 43-lsp-integration-and-code-intelligence
plan: 02
subsystem: ui
tags: [monaco, diagnostics, problems-panel, typescript, react]

requires:
  - phase: 43-01
    provides: "Diagnostic types, useDiagnostics hook, subscribeToDiagnostics"
provides:
  - "DiagnosticsPanel component with collapsible Problems panel UI"
  - "DiagnosticRow component with severity icons and click-to-navigate"
  - "EditorLayout integration with real-time diagnostic display"
affects: [43-03, editor-layout, code-intelligence]

tech-stack:
  added: []
  patterns: ["Collapsible bottom panel pattern in EditorLayout", "DOM CustomEvent bridge for diagnostic navigation"]

key-files:
  created:
    - frontend/src/features/editor/components/DiagnosticsPanel.tsx
    - frontend/src/features/editor/components/DiagnosticRow.tsx
  modified:
    - frontend/src/features/editor/EditorLayout.tsx

key-decisions:
  - "DiagnosticsPanel and DiagnosticRow are plain React components (NOT observer) -- no MobX state consumed"
  - "Cross-file diagnostic navigation falls back to console.warn -- openFile requires full OpenFile metadata not available from URI alone"
  - "Reuses existing symbol-outline:navigate CustomEvent with added uri field for line navigation"
  - "Panel starts collapsed by default for minimal visual impact"

patterns-established:
  - "Bottom panel pattern: component rendered below flex-1 editor div inside center flex column, shrinks editor when expanded"
  - "Severity icon mapping: CircleX (error/red), TriangleAlert (warning/amber), Info (blue), Lightbulb (hint/gray)"

requirements-completed: [LSP-04]

duration: 5min
completed: 2026-03-24
---

# Phase 43 Plan 02: Diagnostics Panel UI Summary

**VS Code-style Problems panel with severity filtering, badge counts, and click-to-navigate integrated below the Monaco editor**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-24T11:36:04Z
- **Completed:** 2026-03-24T11:41:01Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- DiagnosticsPanel: collapsible PROBLEMS panel with All/Errors/Warnings filter toggles and badge counts
- DiagnosticRow: compact rows with severity icons (CircleX, TriangleAlert, Info, Lightbulb), file:line, truncated message
- EditorLayout wired with useMonaco + useDiagnostics for real-time marker tracking
- Click-to-navigate dispatches symbol-outline:navigate event with uri and line

## Task Commits

Each task was committed atomically:

1. **Task 1: DiagnosticsPanel and DiagnosticRow components** - `1f1b3e67` (feat)
2. **Task 2: Wire DiagnosticsPanel into EditorLayout** - `c7abb76b` (feat)

## Files Created/Modified
- `frontend/src/features/editor/components/DiagnosticRow.tsx` - Single diagnostic entry with severity icon, file:line, message, click handler
- `frontend/src/features/editor/components/DiagnosticsPanel.tsx` - Collapsible Problems panel with filter toggles, badge counts, sorted list
- `frontend/src/features/editor/EditorLayout.tsx` - Added useMonaco, useDiagnostics, handleDiagnosticNavigate, renders DiagnosticsPanel below editor

## Decisions Made
- DiagnosticsPanel and DiagnosticRow are plain React components (NOT observer) -- no MobX observables consumed, avoids React 19 flushSync constraint
- Cross-file diagnostic navigation uses console.warn fallback -- FileStore.openFile requires full OpenFile metadata not derivable from a Monaco URI alone
- Reuses existing symbol-outline:navigate DOM event with added uri field for diagnostic line navigation
- Panel starts collapsed (isCollapsed: true) for non-intrusive default UX

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing type errors in MonacoFileEditor.tsx (unused imports from 43-01: registerLSPNavigateActions, usePythonLanguage) -- out of scope, not introduced by this plan
- Pre-existing type error in python-worker.ts (Monaco 0.55 vs 0.52 type mismatch) -- out of scope

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Problems panel fully functional with diagnostics from Plan 01's TypeScript IntelliSense
- Ready for Plan 03 (Go to Definition, Find References) which builds on the same Monaco + diagnostics foundation
- Cross-file diagnostic navigation can be enhanced once file store supports URI-based file lookup

## Self-Check: PASSED

All 3 files found. All 2 commit hashes verified.

---
*Phase: 43-lsp-integration-and-code-intelligence*
*Completed: 2026-03-24*
