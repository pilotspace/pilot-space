# Phase 44: Web Git Integration and Source Control Panel - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning
**Source:** Auto-generated from roadmap and VS Code comparison

<domain>
## Phase Boundary

Bring git operations to the web app via GitHub/GitLab API. Users can view changed files, stage/unstage, commit, switch branches, and create PRs — all without leaving the browser. No local git clone required — operates entirely through provider APIs. Tauri desktop continues using its existing git2-rs layer.

</domain>

<decisions>
## Implementation Decisions

### Git Provider Integration
- **GitHub** (primary) — GitHub REST API v3 + GraphQL API v4 for PR creation
- **GitLab** (secondary) — GitLab REST API v4
- OAuth tokens from Supabase Auth (GitHub/GitLab already configured as login providers)
- Token stored in user's Supabase auth session — no separate OAuth flow needed
- Provider auto-detected from repository remote URL (github.com vs gitlab.com)
- Abstract git operations behind a `GitProvider` interface so both providers share the same UI

### Source Control Panel
- Position: left sidebar tab alongside file tree (toggle between File Explorer and Source Control via icons)
- VS Code-style layout: staged changes section, unstaged changes section, commit message input
- Each file shows: status icon (M/A/D/R), filename, click to open diff
- Stage/unstage via checkbox click on individual files or "Stage All" / "Unstage All" buttons
- Diff viewer: inline diff in the editor area (reuse existing diff-viewer component pattern from Tauri Phase 36)
- Badge count on SCM tab icon showing number of changed files

### Commit Workflow
- Stage individual files via GitHub/GitLab Contents API (file-level operations, not full tree SHA)
- Commit message: text input with conventional commit suggestion (optional)
- Commit creates a new commit on the current branch via provider API
- After commit: auto-refresh changed files list, clear commit message
- Multi-file commit: batch all staged files into a single commit (GitHub: create tree + commit, GitLab: commits API)

### Branch Management
- Branch selector dropdown in SCM panel header (current branch shown)
- List branches via API (paginated, searchable)
- Switch branch: changes the "ref" context for all API calls (no actual checkout)
- Create branch: inline input in dropdown with base branch selector
- Delete branch: context menu on non-default branches (with confirmation)

### PR Creation
- Inline form within SCM panel: title, description (markdown), base branch selector, head branch (current)
- "Create Pull Request" button
- After creation: show success toast with link, open PR URL in new tab
- Draft PR toggle checkbox
- No PR review/merge UI — that's a separate phase

### Platform Strategy
- Web-only feature — Tauri desktop continues using its existing git2-rs + GitStore
- `isTauri()` guard: SCM panel only shows on web, Tauri shows its existing git UI
- API calls go through the backend proxy (not direct browser→GitHub, to avoid CORS and token exposure)

### Backend API Proxy
- New backend endpoints that proxy to GitHub/GitLab APIs
- Authenticates with the user's OAuth token from Supabase session
- Routes: `/api/v1/git/repos/{owner}/{repo}/...` (status, diff, stage, commit, branches, pulls)
- Rate limit awareness: GitHub API has 5000 req/hour, GitLab 2000 req/min

### Claude's Discretion
- Exact API proxy endpoint structure
- Diff rendering approach (reuse Phase 36 DiffViewer or new component)
- Branch list pagination strategy
- Commit validation (message required, staged files required)
- Error handling for API rate limits and token expiration

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Git Infrastructure (Tauri)
- `tauri-app/tauri-app/src-tauri/src/commands/git.rs` — Tauri git2-rs commands (reference for feature parity)
- `tauri-app/tauri-app/frontend/src/stores/features/git/GitStore.ts` — MobX git store (reference for state model)
- `tauri-app/tauri-app/frontend/src/features/git/components/diff-viewer.tsx` — Diff viewer component
- `tauri-app/tauri-app/frontend/src/features/git/components/git-status-panel.tsx` — Git status panel

### Editor Foundation
- `frontend/src/features/editor/EditorLayout.tsx` — Three-panel layout (SCM tab integrates in left panel)
- `frontend/src/features/file-browser/components/FileTree.tsx` — File tree (SCM is a sibling tab)
- `frontend/src/features/file-browser/stores/FileStore.ts` — File store (diff opens files here)

### Auth
- `frontend/src/stores/AuthStore.ts` — Supabase auth with OAuth tokens

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `diff-viewer.tsx` — Tauri's diff viewer with virtualized rendering. May need adaptation for web (fetch diff via API instead of git2-rs).
- `GitStore.ts` — Tauri's MobX git store pattern. Web version needs similar observable state.
- `FileStore` — For opening diff results in the editor.
- `apiClient` from `services/api/client.ts` — Existing API client pattern for backend proxy calls.

### Established Patterns
- MobX stores for UI state (`stores/features/`)
- TanStack Query for server state (API responses)
- `observer()` components reading MobX stores
- `isTauri()` guard for platform-conditional UI

### Integration Points
- `EditorLayout.tsx` left panel — Add tab toggle between FileTree and SCM panel
- Backend `main.py` — Mount new git proxy router
- `AuthStore` — Extract GitHub/GitLab OAuth tokens for API calls

</code_context>

<specifics>
## Specific Ideas

- SCM panel should feel like VS Code's Source Control view — changed files, staging, commit message
- Users should be able to commit directly from the browser without any desktop app
- The git proxy prevents token leakage and handles CORS — browser never calls GitHub/GitLab directly
- Branch switching is "virtual" — changes API context without any local checkout

</specifics>

<deferred>
## Deferred Ideas

- PR review/merge UI — separate phase
- Merge conflict resolution in browser — complex, defer
- Git blame/annotate — separate feature
- Commit history viewer — separate feature
- GitHub Actions / CI status display — separate feature
- Multi-repo management — separate feature

</deferred>

---

*Phase: 44-web-git-integration-and-source-control-panel*
*Context gathered: 2026-03-24 via auto mode*
