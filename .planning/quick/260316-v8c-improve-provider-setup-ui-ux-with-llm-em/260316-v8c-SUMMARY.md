---
phase: quick
plan: 260316-v8c
subsystem: ui
tags: [react, mobx, shadcn, select, ai-settings]

provides:
  - "Dropdown-based AI provider selection UI replacing expandable accordion rows"
  - "ProviderSection component with Select dropdown + StatusBadge"
  - "ProviderConfigForm component with inline config fields and save logic"
affects: [ai-settings, provider-setup]

tech-stack:
  added: []
  patterns: [dropdown-provider-selection, service-type-scoped-config]

key-files:
  created:
    - frontend/src/features/settings/components/provider-section.tsx
    - frontend/src/features/settings/components/provider-config-form.tsx
  modified:
    - frontend/src/features/settings/pages/ai-settings-page.tsx

key-decisions:
  - "StatusBadge exported from provider-section.tsx for potential reuse"
  - "Ollama model placeholders split by service type: nomic-embed-text-v2-moe (embedding), qwen2.5 (llm)"

requirements-completed: [provider-dropdown-ui, default-embedding-model, validate-ai-features]

duration: 3min
completed: 2026-03-16
---

# Quick Task 260316-v8c: Improve Provider Setup UI/UX Summary

**Dropdown-based AI provider selection with per-service-type config forms and Ollama model defaults**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T15:33:52Z
- **Completed:** 2026-03-16T15:36:44Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced expandable accordion provider rows with dropdown Select-based UI
- Each service section (Embedding/LLM) shows a single dropdown to pick active provider
- Config fields render inline below the dropdown for the selected provider
- Ollama embedding placeholder set to nomic-embed-text-v2-moe, LLM to qwen2.5
- StatusBadge shows connection status next to the dropdown

## Task Commits

1. **Task 1: Create ProviderSection and ProviderConfigForm** - `71fa6235` (feat)
2. **Task 2: Rewire AISettingsPage to use dropdown-based ProviderSection** - `34d7e3cd` (refactor)

## Files Created/Modified
- `frontend/src/features/settings/components/provider-section.tsx` - Dropdown-based provider selection with StatusBadge, wraps ProviderConfigForm
- `frontend/src/features/settings/components/provider-config-form.tsx` - Inline config form with fields, validation, and save logic
- `frontend/src/features/settings/pages/ai-settings-page.tsx` - Simplified to use two ProviderSection components

## Decisions Made
- StatusBadge logic extracted as exported function from provider-section.tsx (same visual as provider-row.tsx)
- ProviderConfigForm resets fields via useEffect when provider or status changes
- provider-row.tsx kept for reference but no longer imported

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

---
*Phase: quick*
*Completed: 2026-03-16*
