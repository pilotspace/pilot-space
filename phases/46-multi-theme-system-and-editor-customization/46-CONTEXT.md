# Phase 46: Multi-Theme System and Editor Customization - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated from roadmap and codebase analysis

<domain>
## Phase Boundary

Expand the Pilot Space theme into a full theme engine with light/dark/high-contrast modes, user-selectable accent colors, VS Code .tmTheme import for Monaco syntax highlighting, and per-workspace theme settings synced across devices.

</domain>

<decisions>
## Implementation Decisions

### Theme Modes
- Three built-in modes: Light (default), Dark, High Contrast
- Each mode defines a complete set of CSS custom properties (colors, shadows, borders)
- Mode stored in user preferences (synced to Supabase)
- System preference detection via `prefers-color-scheme` as default, user override persists
- Transition: 200ms crossfade when switching modes (matches editor crossfade timing)

### Accent Color System
- 8 preset accent colors: green (current default #29a386), blue, purple, orange, pink, red, teal, indigo
- User selects in Settings > Appearance
- Accent propagates to: active tab indicator, cursor color, links, buttons, focus rings, command palette highlight
- CSS custom property `--accent` updated at `:root` level
- Per-workspace accent: workspace admins can set a workspace-wide accent (overridable by user preference)

### Monaco Theme Import (.tmTheme)
- Users can upload VS Code `.tmTheme` or `.json` theme files
- Parser converts TextMate theme to Monaco `IStandaloneThemeData` format
- Uploaded themes appear in Settings > Appearance > Editor Theme dropdown
- Built-in themes: "Pilot Space Light", "Pilot Space Dark", "Pilot Space High Contrast"
- Max 10 custom themes per workspace (stored in Supabase Storage)
- Theme preview: live preview in a small Monaco editor within settings before applying

### Per-Workspace Settings Sync
- Theme preferences stored in `workspace_member_preferences` table (new)
- Fields: `theme_mode`, `accent_color`, `editor_theme_id`, `font_size`, `font_family`
- Synced on login and workspace switch
- Optimistic UI: apply immediately, sync in background
- Fallback: localStorage for offline, sync on reconnect

### Claude's Discretion
- Exact accent color hex values for the 8 presets
- .tmTheme parser implementation details (existing libraries vs custom)
- High contrast mode specific color choices
- Settings UI layout for theme picker
- Migration strategy from current single-theme to multi-theme

</decisions>

<canonical_refs>
## Canonical References

### Current Theme System
- `frontend/src/features/editor/themes/pilotSpaceTheme.ts` — Current Monaco theme (extend to multi-theme)
- `frontend/src/app/globals.css` — CSS custom properties (color tokens)
- `specs/001-pilot-space-mvp/ui-design-spec.md` — Design tokens v4.0
- `.impeccable.md` — Brand personality and color guidelines

### Settings
- `frontend/src/app/(workspace)/[workspaceSlug]/settings/` — Settings pages

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pilotSpaceTheme.ts` — Already defines light/dark themes. Extend with high-contrast + accent variants.
- `globals.css` — CSS custom properties at `:root`. Theme engine updates these dynamically.
- `next-themes` or similar — Check if already installed for dark mode support.

### Integration Points
- `pilotSpaceTheme.ts` — Multi-theme registry replacing single theme export
- `globals.css` — Dynamic CSS property injection for accent colors
- Settings page — New "Appearance" tab
- `useMonacoTheme.ts` — Hook that applies theme to Monaco (extend for user-selected themes)

</code_context>

<specifics>
## Specific Ideas

- Theme switching should feel instant — no page reload, CSS transitions only
- Accent colors should feel personal — "my workspace, my color"
- .tmTheme import targets power users who have favorite VS Code themes
- Settings preview shows live Monaco editor with the selected theme before committing

</specifics>

<deferred>
## Deferred Ideas

- Theme marketplace (community themes) — future
- Per-file theme overrides — unnecessary complexity
- Custom CSS injection — security risk, defer
- Font upload — stick to system fonts + Google Fonts CDN

</deferred>

---

*Phase: 46-multi-theme-system-and-editor-customization*
*Context gathered: 2026-03-24 via auto mode*
