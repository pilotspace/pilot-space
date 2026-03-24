# Phase 45: Editor Plugin API and Custom Block Types - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated from roadmap and codebase analysis

<domain>
## Phase Boundary

Design and ship a plugin API so teams can register custom PM block types, slash commands, and editor actions without forking the core. Includes plugin manifest format, sandboxed execution, a built-in plugin gallery, and 3 example plugins.

</domain>

<decisions>
## Implementation Decisions

### Plugin Manifest Format
- JSON manifest (`plugin.json`) per plugin:
  ```json
  {
    "name": "changelog",
    "version": "1.0.0",
    "displayName": "Changelog Generator",
    "description": "Generates release notes from git commits",
    "author": "Pilot Space",
    "entrypoint": "index.js",
    "permissions": ["editor:read", "editor:write", "git:read"],
    "blockTypes": [{ "type": "changelog", "label": "Changelog", "icon": "FileText" }],
    "slashCommands": [{ "trigger": "/changelog", "label": "Insert Changelog", "description": "Generate changelog from recent commits" }],
    "actions": [{ "id": "changelog.generate", "label": "Generate Changelog", "category": "Note", "shortcut": "" }]
  }
  ```
- Plugins are directories: `plugins/{name}/plugin.json` + `index.js` + optional assets
- Semantic versioning required (validated on upload)

### Sandbox Execution Model
- Plugins run in a hidden iframe with `sandbox="allow-scripts"` (no DOM access to host)
- Communication via `postMessage` typed message protocol between host and plugin iframe
- Host exposes a `PilotPluginSDK` API via postMessage:
  - `editor.getContent()` → returns current note content
  - `editor.insertBlock(type, data)` → inserts a PM block at cursor
  - `editor.replaceSelection(text)` → replaces selected text
  - `editor.registerBlockRenderer(type, htmlTemplate)` → registers custom block view
  - `commands.register(id, handler)` → registers a slash command handler
  - `actions.register(id, handler)` → registers a command palette action
  - `ui.showToast(message, type)` → shows a toast notification
  - `storage.get(key)` / `storage.set(key, value)` → per-plugin localStorage
- Permissions checked on each API call — plugin can only use APIs declared in manifest
- Plugin JS is loaded from workspace storage (Supabase Storage) via signed URL into iframe srcdoc
- No network access from plugin iframe (`sandbox` attribute blocks fetch/XHR)

### Plugin Gallery
- Settings page panel: "Plugins" tab under workspace settings
- Shows installed plugins with name, version, author, description, enable/disable toggle
- "Upload Plugin" button: accepts `.zip` file, validates manifest, stores in Supabase Storage
- Admin-only upload/delete. Members can enable/disable per workspace.
- No external marketplace — plugins are workspace-scoped uploads
- Plugin status: enabled/disabled per workspace (stored in DB, not localStorage)

### Plugin Lifecycle
- On workspace load: fetch enabled plugins list, lazy-load their iframes
- On plugin enable: create sandbox iframe, load plugin JS, call `onActivate()`
- On plugin disable: call `onDeactivate()`, destroy iframe
- On editor mount: register plugin's blockTypes, slashCommands, actions via their declared manifest entries
- Plugin errors caught and logged — never crash the host editor

### Example Plugins (3)
1. **Changelog** — Reads recent git commits (via `git:read` permission), generates a markdown changelog, inserts as a PM block. Slash command: `/changelog`.
2. **Standup** — Inserts a structured standup template block (Yesterday/Today/Blockers). Slash command: `/standup`. PM block type: `standup`.
3. **Retro** — Inserts a retrospective board block (What went well/What didn't/Action items). Slash command: `/retro`. PM block type: `retro`.

### Claude's Discretion
- PostMessage protocol serialization format (JSON-RPC vs custom)
- Plugin zip validation rules (max size, required files)
- iframe CSP configuration details
- Plugin storage quota per workspace
- Error boundary UI for failed plugin loads
- Plugin SDK TypeScript types package structure

</decisions>

<canonical_refs>
## Canonical References

### Editor Plugin Points
- `frontend/src/features/editor/markers/pmBlockMarkers.ts` — PM block parser (plugins register new types here)
- `frontend/src/features/editor/view-zones/PMBlockViewZone.tsx` — Block renderer (plugins provide custom renderers)
- `frontend/src/features/command-palette/registry/ActionRegistry.ts` — Action registration (plugins add actions)
- `frontend/src/features/command-palette/actions/` — Existing action modules (pattern for plugin actions)
- `frontend/src/features/editor/hooks/useMonacoSlashCmd.ts` — Slash command provider (plugins add commands)

### Settings
- `frontend/src/app/(workspace)/[workspaceSlug]/settings/` — Settings pages (gallery mounts here)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ActionRegistry` — Already supports `registerAction`/`unregisterAction`. Plugins call the same API.
- `pmBlockMarkers.ts` — `PMBlockType` union type. Plugin block types need dynamic registration (not hardcoded).
- `useMonacoSlashCmd.ts` — Slash commands are hardcoded. Need to make extensible for plugin commands.
- Supabase Storage — Already used for artifacts. Plugin zips stored the same way.

### Integration Points
- `PMBlockViewZone.tsx` — `rendererMap` needs to support dynamic renderers (currently hardcoded lazy imports)
- `useMonacoSlashCmd.ts` — Command list needs to be extensible (currently static array)
- `ActionRegistry` — Already extensible, just needs plugin-sourced registrations
- Workspace settings page — New "Plugins" tab

</code_context>

<specifics>
## Specific Ideas

- Plugin API should feel like VS Code extensions but simpler — no complex activation events, just manifest + JS
- Sandbox via iframe is safer than eval/Web Worker — prevents DOM manipulation and XSS
- Example plugins demonstrate all three extension points (blocks, commands, actions)
- Plugins should be dead simple to create — a developer with basic JS knowledge should be able to build one

</specifics>

<deferred>
## Deferred Ideas

- External plugin marketplace / registry — future
- Plugin auto-update mechanism — future
- Plugin-to-plugin communication — future
- Server-side plugin execution (for backend hooks) — separate architecture
- Plugin revenue sharing / paid plugins — business decision, not technical

</deferred>

---

*Phase: 45-editor-plugin-api-and-custom-block-types*
*Context gathered: 2026-03-24 via auto mode*
