---
phase: quick-260318-naw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/260318-naw-checkout-new-branch-then-investigate-to-/INVESTIGATION.md
autonomous: true
requirements: [INVESTIGATE-SETTINGS-MODAL]

must_haves:
  truths:
    - "A new feature branch exists checked out from main for settings modal migration work"
    - "Investigation document catalogues all 11+ settings pages with their complexity, dependencies, and state management"
    - "Investigation document proposes a concrete modal architecture (Dialog shell, sidebar nav, content panels) with rationale"
    - "Investigation document identifies migration risks, ordering, and a phased migration plan"
  artifacts:
    - path: ".planning/quick/260318-naw-checkout-new-branch-then-investigate-to-/INVESTIGATION.md"
      provides: "Complete migration investigation with findings, approach, and phased plan"
      min_lines: 200
  key_links:
    - from: "INVESTIGATION.md"
      to: "frontend/src/features/settings/"
      via: "References all settings pages, components, hooks"
      pattern: "settings-page\\.tsx|settings/components|settings/hooks"
---

<objective>
Investigate migrating pilot-space settings from 11 full-page routes under `/[workspaceSlug]/settings/*` into a single settings modal dialog, and produce a comprehensive investigation document.

Purpose: Settings pages currently occupy full-page routes with a layout sidebar, but the UX goal is to make settings accessible as an overlay modal (like Linear, Notion, or Vercel settings) so users stay in context. This investigation will map the full scope, identify risks, and produce a concrete migration plan.

Output: Feature branch + INVESTIGATION.md with complete findings
</objective>

<execution_context>
@/Users/tindang/workspaces/tind-repo/pilot-space/.claude/get-shit-done/workflows/execute-plan.md
@/Users/tindang/workspaces/tind-repo/pilot-space/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/app/(workspace)/[workspaceSlug]/settings/layout.tsx
@frontend/src/features/settings/README.md
@frontend/src/features/settings/index.ts
@frontend/src/components/ui/dialog.tsx
@frontend/src/components/layout/sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create feature branch and catalogue all settings pages</name>
  <files>.planning/quick/260318-naw-checkout-new-branch-then-investigate-to-/INVESTIGATION.md</files>
  <action>
1. Create and checkout a new branch `feat/settings-modal` from `main`.

2. Perform a deep audit of every settings page and produce a structured catalogue. For each of the 11+ settings pages in `frontend/src/features/settings/pages/`, document:
   - **Page name and route** (e.g., `workspace-general-page.tsx` at `/settings`)
   - **Line count** (already known: ranges from 121 to 692 lines)
   - **Complexity tier**: Simple (form with save), Medium (interactive lists/grids), Complex (multi-step, real-time, or large data tables)
   - **State management**: What MobX stores, TanStack Query hooks, and local state it uses
   - **Sub-components used**: Which components from `features/settings/components/` it imports
   - **External dependencies**: API calls, route params, beforeunload guards, etc.
   - **Modal-readiness score**: How much refactoring is needed to render inside a Dialog (1=drop-in, 2=minor tweaks, 3=significant rework)

3. Also audit the settings layout (`layout.tsx`) to understand:
   - The `settingsNavSections` config (sections, items, icons, href builders)
   - The mobile Sheet navigation pattern
   - The guest role redirect logic
   - The desktop sidebar + content area split

4. Audit how settings is triggered from the main sidebar (`sidebar.tsx`) — currently a `router.push` to `/settings`.

5. Check `frontend/src/features/settings/hooks/` — list each hook, what it fetches, and its cache/stale config.

6. Check `frontend/src/features/settings/components/` — identify which components use Dialog/Sheet internally (e.g., `delete-workspace-dialog.tsx`, `skill-generator-modal.tsx`, `plugin-detail-sheet.tsx`) since nested dialogs inside the settings modal need special handling.

Write all findings into the first sections of INVESTIGATION.md.
  </action>
  <verify>
    <automated>git branch --show-current | grep -q "feat/settings-modal" && test -f ".planning/quick/260318-naw-checkout-new-branch-then-investigate-to-/INVESTIGATION.md" && echo "PASS"</automated>
  </verify>
  <done>Feature branch created. INVESTIGATION.md contains a complete catalogue of all settings pages with complexity tiers, state management, sub-components, and modal-readiness scores.</done>
</task>

<task type="auto">
  <name>Task 2: Design modal architecture and produce phased migration plan</name>
  <files>.planning/quick/260318-naw-checkout-new-branch-then-investigate-to-/INVESTIGATION.md</files>
  <action>
Extend INVESTIGATION.md with the following sections:

**Section: Modal Architecture Proposal**

Design the settings modal shell. Address:
- **Container**: Use shadcn/ui `Dialog` with a large custom `DialogContent` (e.g., `max-w-4xl h-[80vh]` or similar). Compare with the existing `DialogContent` which defaults to `sm:max-w-lg` — the settings modal needs a much wider, taller variant.
- **Layout inside modal**: Left sidebar nav (reuse `settingsNavSections` config from current `layout.tsx`) + scrollable content area on the right. This mirrors the current full-page layout but inside a Dialog.
- **Navigation**: Instead of `Link` + Next.js routing, use local state (`activeSection: string`) to switch content panels. No URL changes when switching tabs inside the modal.
- **URL integration (optional)**: Whether to support `?settings=general` query param so direct links open the modal to a specific section. Evaluate trade-offs (adds complexity vs. shareable URLs).
- **Trigger mechanism**: Replace `router.push('/settings')` in `sidebar.tsx` with a `Dialog` open state. Could use a global settings modal context/store or a simple state in the layout.
- **Mobile behavior**: On small screens, the modal should be nearly full-screen. The sidebar nav collapses or becomes a dropdown/select.
- **Nested dialogs**: Settings pages that open their own Dialog (e.g., DeleteWorkspaceDialog, SkillGeneratorModal) need to work as nested dialogs. Radix Dialog supports this but verify z-index stacking.
- **Scroll management**: Each content panel scrolls independently. The modal itself should not scroll — only the content area.

**Section: Key Technical Challenges**

Document these specific risks:
1. **`useParams` dependency**: Many pages use `useParams()` to get `workspaceSlug`. In a modal, these params still exist (modal renders within the workspace layout). Confirm this works.
2. **`usePathname` in layout**: Current layout uses `pathname` for active nav highlighting. Modal approach replaces this with local state — need to strip pathname logic.
3. **`observer()` wrapping**: Most pages are MobX observers. These work fine inside Dialogs. Confirm no TipTap-like `flushSync` issues (settings pages do not use TipTap, so this should be safe).
4. **`beforeunload` guards**: Several pages add `beforeunload` listeners for unsaved changes. In modal context, closing the modal should trigger an "unsaved changes" confirmation instead. Need to intercept Dialog close.
5. **Page-level data fetching**: Pages fetch data on mount via `useEffect`. Confirm they handle re-mount correctly when modal opens/closes (TanStack Query staleness handles this, but MobX store loads may duplicate).
6. **Route-based code splitting**: Next.js currently code-splits each settings page at the route level. Moving to a modal means all settings page components load when the modal mounts (or use React.lazy for the content panels).
7. **Deep links**: Currently users can bookmark `/settings/ai-providers`. After migration, this URL either (a) opens the modal automatically, (b) redirects, or (c) is removed. Recommend option (a) with a catch-all route that opens the modal.

**Section: Migration Approach**

Propose the concrete approach:
- **Strategy**: "Strangler Fig" — build the modal alongside existing routes, migrate one page at a time, remove old routes last.
- **Shared components**: Settings page components in `features/settings/pages/` are already separated from route files (`app/.../settings/*/page.tsx` are thin wrappers). This is ideal — the modal can import the same page components directly.
- **New files needed**: List the new files (e.g., `SettingsModal.tsx`, `SettingsModalProvider.tsx`, updated `sidebar.tsx`).

**Section: Phased Migration Plan**

Break the migration into 3-4 phases with clear scope:

Phase 1 — Modal Shell + Simple Pages (3-4 plans):
- Build `SettingsModal` component with Dialog + sidebar nav + content switching
- Create `SettingsModalProvider` (context for open/close/activeSection state)
- Migrate "drop-in" pages first: General, Profile, AI Providers (simplest, most-used)
- Wire sidebar to open modal instead of navigating

Phase 2 — Medium Complexity Pages (2-3 plans):
- Migrate MCP Servers, Encryption, Usage, AI Governance
- Handle nested dialog patterns (e.g., MCP server form uses its own dialogs)
- Add unsaved-changes guard on modal close

Phase 3 — Complex Pages (2-3 plans):
- Migrate Roles (574 lines, permission grid), SSO (639 lines, multi-step config), Audit (692 lines, data table with filters/export)
- These may need content-area scroll optimization for large data tables
- Add lazy loading for complex panels

Phase 4 — Cleanup (1 plan):
- Remove old route files and layout
- Add deep-link catch-all route that auto-opens modal
- Update any tests referencing old routes
- Update README/docs

For each phase, list estimated plan count and key files touched.

**Section: Alternative Approaches Considered**

Briefly document why other approaches were rejected:
- **Sheet (side drawer)**: Too narrow for settings with wide forms/tables. Dialog is better for this content density.
- **Full-page modal (no sidebar)**: Loses the quick-switch navigation between sections. Sidebar is essential for 11+ sections.
- **Tabs instead of sidebar**: Works for 3-5 sections, not for 11+. Sidebar scales better.
- **Keep as routes, just restyle**: Does not achieve the "stay in context" UX goal.
  </action>
  <verify>
    <automated>grep -c "^##" ".planning/quick/260318-naw-checkout-new-branch-then-investigate-to-/INVESTIGATION.md" | awk '{if ($1 >= 6) print "PASS"; else print "FAIL: need at least 6 sections"}'</automated>
  </verify>
  <done>INVESTIGATION.md contains: (1) complete settings page catalogue, (2) modal architecture proposal with Dialog shell + sidebar + content panels, (3) technical challenges with mitigations, (4) strangler-fig migration approach, (5) 4-phase migration plan with plan counts, (6) alternatives considered. Document is at least 200 lines and actionable for implementation planning.</done>
</task>

</tasks>

<verification>
- Feature branch `feat/settings-modal` exists and is checked out
- INVESTIGATION.md is comprehensive (200+ lines, 6+ sections)
- Every settings page is catalogued with complexity tier and modal-readiness score
- Migration plan has concrete phases with file lists
- No code changes beyond the investigation document and branch creation
</verification>

<success_criteria>
- Branch `feat/settings-modal` created from main
- INVESTIGATION.md written with all sections: catalogue, architecture, challenges, approach, phased plan, alternatives
- Each of the 11+ settings pages assessed for modal migration complexity
- Phased migration plan is actionable — could be fed directly into `/gsd:plan-phase` for implementation
</success_criteria>

<output>
After completion, create `.planning/quick/260318-naw-checkout-new-branch-then-investigate-to-/260318-naw-SUMMARY.md`
</output>
