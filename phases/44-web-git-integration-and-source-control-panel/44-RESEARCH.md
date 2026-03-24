# Phase 44: Web Git Integration and Source Control Panel - Research

**Researched:** 2026-03-24
**Domain:** Git provider API integration (GitHub/GitLab), Source Control UI, Backend API proxy
**Confidence:** HIGH

## Summary

Phase 44 brings git operations to the web app via GitHub/GitLab provider APIs, proxied through the backend. The project already has a substantial `GitHubClient` in `backend/src/pilot_space/integrations/github/client.py` with httpx-based request handling, rate limiting, pagination, and error handling. The existing OAuth integration flow (stored encrypted access tokens per workspace) provides the token infrastructure. The frontend uses MobX for UI state and TanStack Query for server state, with an established `apiClient` pattern for all API calls.

The core technical challenge is implementing multi-file commits via the GitHub Git Data API (blobs -> tree -> commit -> ref update) and the GitLab Commits API (single POST with actions array). The SCM panel integrates into EditorLayout's existing left panel (currently a single `FileTree`), requiring a tab toggle mechanism. Diff rendering should use Monaco's built-in diff editor rather than a custom solution or external library.

**Primary recommendation:** Extend the existing `GitHubClient` with Git Data API methods (blobs, trees, commits, refs), create a parallel `GitLabClient` behind a shared `GitProvider` interface, proxy all calls through new backend endpoints, and build a MobX `GitWebStore` for the frontend SCM panel.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **GitHub** (primary) -- GitHub REST API v3 + GraphQL API v4 for PR creation
- **GitLab** (secondary) -- GitLab REST API v4
- OAuth tokens from Supabase Auth (GitHub/GitLab already configured as login providers)
- Token stored in user's Supabase auth session -- no separate OAuth flow needed
- Provider auto-detected from repository remote URL (github.com vs gitlab.com)
- Abstract git operations behind a `GitProvider` interface so both providers share the same UI
- Position: left sidebar tab alongside file tree (toggle between File Explorer and Source Control via icons)
- VS Code-style layout: staged changes section, unstaged changes section, commit message input
- Each file shows: status icon (M/A/D/R), filename, click to open diff
- Stage/unstage via checkbox click on individual files or "Stage All" / "Unstage All" buttons
- Diff viewer: inline diff in the editor area (reuse existing diff-viewer component pattern from Tauri Phase 36)
- Badge count on SCM tab icon showing number of changed files
- Stage individual files via GitHub/GitLab Contents API (file-level operations, not full tree SHA)
- Commit message: text input with conventional commit suggestion (optional)
- Commit creates a new commit on the current branch via provider API
- After commit: auto-refresh changed files list, clear commit message
- Multi-file commit: batch all staged files into a single commit (GitHub: create tree + commit, GitLab: commits API)
- Branch selector dropdown in SCM panel header (current branch shown)
- List branches via API (paginated, searchable)
- Switch branch: changes the "ref" context for all API calls (no actual checkout)
- Create branch: inline input in dropdown with base branch selector
- Delete branch: context menu on non-default branches (with confirmation)
- Inline form within SCM panel: title, description (markdown), base branch selector, head branch (current)
- "Create Pull Request" button
- After creation: show success toast with link, open PR URL in new tab
- Draft PR toggle checkbox
- No PR review/merge UI -- that's a separate phase
- Web-only feature -- Tauri desktop continues using its existing git2-rs + GitStore
- `isTauri()` guard: SCM panel only shows on web, Tauri shows its existing git UI
- API calls go through the backend proxy (not direct browser to GitHub, to avoid CORS and token exposure)
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

### Deferred Ideas (OUT OF SCOPE)
- PR review/merge UI -- separate phase
- Merge conflict resolution in browser -- complex, defer
- Git blame/annotate -- separate feature
- Commit history viewer -- separate feature
- GitHub Actions / CI status display -- separate feature
- Multi-repo management -- separate feature
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| httpx | >=0.28.0 | Backend HTTP client for GitHub/GitLab API proxying | Already used by existing `GitHubClient` |
| FastAPI | >=0.115.0 | Backend API proxy router | Project standard |
| MobX | ^6.15.0 | Frontend `GitWebStore` for SCM panel state | Project standard (DD override from Zustand) |
| TanStack Query | ^5.90.19 | Server state caching for branches, file status | Project standard |
| Monaco Editor | ^0.55.1 | Inline diff viewer via `monaco.editor.createDiffEditor` | Already installed, built-in diff support |
| axios | ^1.7.0 | Frontend API calls via existing `apiClient` | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cmdk | ^1.1.1 | Branch selector searchable dropdown | Already used for other selectors (BranchSelector pattern from Phase 33) |
| @radix-ui/react-collapsible | ^1.1.12 | Staged/unstaged file sections | Already installed |
| @radix-ui/react-tabs | ^1.1.13 | File Explorer / SCM tab toggle | Already installed |
| @radix-ui/react-popover | ^1.1.15 | Branch selector dropdown | Already installed |
| sonner (toast) | existing | Success/error notifications for commits, PRs | Already used throughout |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Monaco diff editor | diff2html (3.4.56) or react-diff-viewer-continued (4.2.0) | Monaco is already loaded; external lib adds bundle weight for no benefit. Monaco diff editor provides syntax highlighting, minimap, and side-by-side/inline toggle natively |
| Custom diff parser | unified-diff parsing library | GitHub/GitLab APIs return structured file lists with patch strings; Monaco can consume these directly |

**Installation:**
No new packages needed. All required libraries are already installed.

## Architecture Patterns

### Recommended Project Structure

#### Backend
```
backend/src/pilot_space/
├── integrations/
│   ├── github/
│   │   ├── client.py              # EXISTING - extend with Git Data API methods
│   │   ├── models.py              # EXISTING - add GitTreeEntry, GitBlob, GitRef models
│   │   └── ...
│   └── gitlab/
│       ├── __init__.py            # NEW
│       ├── client.py              # NEW - GitLabClient parallel to GitHubClient
│       ├── models.py              # NEW - GitLab-specific data models
│       └── exceptions.py          # NEW - GitLab API errors
├── application/
│   └── services/
│       └── git_proxy.py           # NEW - GitProvider interface + provider resolution
├── api/v1/
│   ├── routers/
│   │   └── git_proxy.py           # NEW - /api/v1/git/... proxy endpoints
│   └── schemas/
│       └── git_proxy.py           # NEW - request/response schemas
```

#### Frontend
```
frontend/src/
├── features/
│   └── source-control/            # NEW feature module
│       ├── components/
│       │   ├── SourceControlPanel.tsx    # Main SCM panel (VS Code-style)
│       │   ├── ChangedFileList.tsx       # Staged/unstaged file sections
│       │   ├── ChangedFileItem.tsx       # Individual file row (status, name, checkbox)
│       │   ├── CommitPanel.tsx           # Commit message + button
│       │   ├── BranchSelector.tsx        # Branch dropdown (Popover+Command pattern)
│       │   ├── CreateBranchDialog.tsx    # Inline branch creation
│       │   ├── CreatePRForm.tsx          # PR creation inline form
│       │   └── DiffViewer.tsx            # Monaco diff editor wrapper
│       ├── hooks/
│       │   ├── useGitStatus.ts          # TanStack query for changed files
│       │   ├── useBranches.ts           # TanStack query for branch list
│       │   ├── useCommit.ts             # Mutation for committing
│       │   └── useCreatePR.ts           # Mutation for PR creation
│       └── types.ts                     # Shared types
├── stores/features/
│   └── git-web/
│       └── GitWebStore.ts               # NEW - MobX store for SCM UI state
```

### Pattern 1: GitProvider Interface (Backend)
**What:** Abstract interface for git operations that both GitHub and GitLab implement
**When to use:** All git proxy endpoints use this interface, never call provider clients directly

```python
# backend/src/pilot_space/application/services/git_proxy.py
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class ChangedFile:
    path: str
    status: str  # "modified", "added", "deleted", "renamed"
    additions: int
    deletions: int
    patch: str | None  # unified diff text

@dataclass
class BranchInfo:
    name: str
    sha: str
    is_default: bool
    is_protected: bool

class GitProvider(ABC):
    @abstractmethod
    async def get_changed_files(self, owner: str, repo: str, ref: str) -> list[ChangedFile]: ...

    @abstractmethod
    async def get_file_diff(self, owner: str, repo: str, ref: str, path: str) -> str: ...

    @abstractmethod
    async def create_commit(
        self, owner: str, repo: str, branch: str, message: str,
        files: list[FileChange],
    ) -> CommitResult: ...

    @abstractmethod
    async def list_branches(self, owner: str, repo: str, search: str | None = None) -> list[BranchInfo]: ...

    @abstractmethod
    async def create_branch(self, owner: str, repo: str, name: str, from_ref: str) -> BranchInfo: ...

    @abstractmethod
    async def delete_branch(self, owner: str, repo: str, name: str) -> None: ...

    @abstractmethod
    async def create_pull_request(
        self, owner: str, repo: str, title: str, body: str,
        head: str, base: str, draft: bool = False,
    ) -> PullRequestResult: ...
```

### Pattern 2: GitHub Multi-File Commit (Git Data API)
**What:** Creating a commit with multiple file changes via GitHub's low-level Git Data API
**When to use:** Every commit operation on GitHub

The GitHub Contents API only supports single-file commits. For multi-file commits, the Git Data API workflow is:
1. **Get current ref** -- `GET /repos/{owner}/{repo}/git/refs/heads/{branch}` to get HEAD SHA
2. **Get current commit** -- `GET /repos/{owner}/{repo}/git/commits/{sha}` to get tree SHA
3. **Create blobs** -- `POST /repos/{owner}/{repo}/git/blobs` for each file (content + encoding)
4. **Create tree** -- `POST /repos/{owner}/{repo}/git/trees` with blob SHAs + base_tree
5. **Create commit** -- `POST /repos/{owner}/{repo}/git/commits` with tree SHA + parent SHA
6. **Update ref** -- `PATCH /repos/{owner}/{repo}/git/refs/heads/{branch}` to point to new commit

### Pattern 3: GitLab Multi-File Commit
**What:** GitLab's Commits API natively supports multi-file commits in a single POST
**When to use:** Every commit operation on GitLab

```
POST /api/v4/projects/:id/repository/commits
{
  "branch": "main",
  "commit_message": "feat: add new files",
  "actions": [
    { "action": "update", "file_path": "src/foo.ts", "content": "..." },
    { "action": "create", "file_path": "src/bar.ts", "content": "..." },
    { "action": "delete", "file_path": "src/old.ts" }
  ]
}
```

### Pattern 4: Virtual Branch Switching
**What:** Changing the active branch context without a local checkout
**When to use:** Branch switching in the SCM panel

Branch "switching" in the web context means changing the `ref` parameter used for all subsequent API calls. The `GitWebStore` holds `currentBranch: string` as observable state. When the user selects a different branch, the store updates this value and all TanStack Query hooks that depend on the branch ref automatically refetch.

### Pattern 5: Monaco Diff Editor for File Diffs
**What:** Using Monaco's built-in diff editor instead of a custom diff component
**When to use:** When user clicks a changed file to view its diff

```typescript
// Monaco provides a built-in diff editor
const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
  readOnly: true,
  renderSideBySide: true, // or false for inline
  enableSplitViewResizing: true,
  originalEditable: false,
});

diffEditor.setModel({
  original: monaco.editor.createModel(originalContent, language),
  modified: monaco.editor.createModel(modifiedContent, language),
});
```

### Pattern 6: Left Panel Tab Toggle
**What:** Adding SCM tab alongside existing FileTree in EditorLayout left panel
**When to use:** EditorLayout modification

The left panel currently renders `<FileTree>` directly. Add a Radix Tabs component to toggle between File Explorer and Source Control. The tab state lives in `GitWebStore` or a local `useState`. Badge count on the SCM tab shows changed file count.

### Anti-Patterns to Avoid
- **Direct browser-to-GitHub calls:** Always proxy through backend to avoid CORS and token exposure
- **Storing OAuth tokens in frontend:** Tokens stay encrypted in the database; backend decrypts per-request
- **Single-file commit loop:** Never loop Contents API for multi-file commits; use Git Data API (GitHub) or Commits API (GitLab) for atomic multi-file commits
- **Full repo tree fetch:** For "changed files", use the Compare API (`GET /repos/{owner}/{repo}/compare/{base}...{head}`) not a full tree listing
- **Rendering diffs with custom HTML:** Use Monaco's diff editor which already handles syntax highlighting, scrolling, and minimap

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Diff rendering | Custom diff parser + HTML renderer | Monaco `createDiffEditor` | Syntax highlighting, line gutter, minimap, side-by-side/inline toggle -- all built in |
| Unified diff parsing | Custom patch parser | GitHub/GitLab API `patch` field | APIs return structured file lists with unified diff patches |
| Branch search | Custom search/filter | cmdk Command component | Already used for branch selectors in Phase 33 |
| File status icons | Custom SVG icons | Lucide icons (already installed) with status-based coloring | M=orange, A=green, D=red, R=blue |
| Rate limit handling | Custom retry logic | Existing `GitHubClient._request` rate limit handling | Already checks X-RateLimit-Remaining headers and raises `GitHubRateLimitError` |
| Token management | Custom OAuth token store | Existing `IntegrationRepository` + `decrypt_api_key` | Encrypted storage, workspace-scoped, already working |

**Key insight:** The existing `GitHubClient` already handles auth headers, rate limiting, pagination, and error handling. The new git proxy endpoints only need to add Git Data API methods to this client and create a parallel GitLab client.

## Common Pitfalls

### Pitfall 1: GitHub Compare API 300-File Limit
**What goes wrong:** The Compare API only returns up to 300 changed files per page
**Why it happens:** GitHub limits `files` array in compare response
**How to avoid:** For repos with many changes, paginate or fall back to listing commits and aggregating file changes. Show a warning if >300 files changed.
**Warning signs:** Users report missing files in the changed file list

### Pitfall 2: GitHub Git Data API Tree Mode
**What goes wrong:** Creating a tree with incorrect `mode` values causes silent failures
**Why it happens:** Trees require specific mode strings: `100644` (file), `100755` (executable), `040000` (subdirectory)
**How to avoid:** Default to `100644` for all file blobs; preserve original mode from the base tree entry if updating an existing file
**Warning signs:** Committed files lose executable permission or become unreadable

### Pitfall 3: Base64 Encoding for Binary Files
**What goes wrong:** Binary file contents corrupted when committed
**Why it happens:** GitHub blob API requires base64 encoding for binary content; GitLab Commits API requires `encoding: "base64"` flag
**How to avoid:** Detect binary files (check MIME type or file extension) and encode accordingly
**Warning signs:** Images or compiled files appear corrupt after commit

### Pitfall 4: Stale Ref After Concurrent Commits
**What goes wrong:** `PATCH /git/refs/heads/{branch}` returns 422 because another commit was pushed between ref read and update
**Why it happens:** Race condition when multiple users commit to the same branch
**How to avoid:** Catch 422 errors on ref update, re-fetch current ref, and retry the tree+commit+ref sequence. GitHub supports `force: false` (default) which rejects non-fast-forward updates
**Warning signs:** "Update is not a fast forward" error from GitHub API

### Pitfall 5: OAuth Token Scope Insufficient
**What goes wrong:** API calls return 403/404 for private repos
**Why it happens:** GitHub OAuth scope may not include `repo` (full repo access). The existing integration uses `repo read:user user:email` scope which should be sufficient, but users who connected before scope expansion may have stale tokens
**How to avoid:** Check API error responses for scope-related messages; provide "Reconnect GitHub" action if permissions are insufficient
**Warning signs:** Public repos work but private repos return 404 (GitHub returns 404, not 403, for repos you don't have access to)

### Pitfall 6: GitLab Project ID vs Path
**What goes wrong:** GitLab API expects URL-encoded project path (`owner%2Frepo`) or numeric project ID, not `owner/repo`
**Why it happens:** GitLab uses `/projects/:id` where `:id` can be numeric ID or URL-encoded path
**How to avoid:** URL-encode the `owner/repo` path when constructing GitLab API URLs
**Warning signs:** 404 errors on all GitLab API calls

### Pitfall 7: Large File Content in API Response
**What goes wrong:** Browser memory issues when diff includes large files
**Why it happens:** GitHub/GitLab APIs return full file content in compare/diff responses
**How to avoid:** Set size limits; skip diff display for files over a threshold (e.g., 1MB); show "File too large to display" placeholder
**Warning signs:** Browser tab freezes or crashes when viewing diffs

### Pitfall 8: isTauri() Guard for Platform Separation
**What goes wrong:** SCM panel code imported on Tauri desktop where it should not appear
**Why it happens:** Shared codebase between web and Tauri
**How to avoid:** Use the established `isTauri()` guard pattern; SCM panel component should be conditionally rendered. Tauri desktop continues using its existing git2-rs + GitStore
**Warning signs:** Duplicate git UIs on Tauri desktop

## Code Examples

### Backend: Extending GitHubClient with Git Data API

```python
# Add to backend/src/pilot_space/integrations/github/client.py

async def get_ref(self, owner: str, repo: str, branch: str) -> dict[str, Any]:
    """Get a git reference (branch HEAD)."""
    data = await self._request("GET", f"/repos/{owner}/{repo}/git/refs/heads/{branch}")
    if not isinstance(data, dict):
        raise GitHubAPIError("Unexpected response format")
    return data

async def create_blob(self, owner: str, repo: str, content: str, encoding: str = "utf-8") -> str:
    """Create a blob and return its SHA."""
    data = await self._request(
        "POST", f"/repos/{owner}/{repo}/git/blobs",
        json={"content": content, "encoding": encoding},
    )
    if not isinstance(data, dict):
        raise GitHubAPIError("Unexpected response format")
    return data["sha"]

async def create_tree(
    self, owner: str, repo: str, base_tree: str, tree_entries: list[dict[str, str]]
) -> str:
    """Create a tree and return its SHA."""
    data = await self._request(
        "POST", f"/repos/{owner}/{repo}/git/trees",
        json={"base_tree": base_tree, "tree": tree_entries},
    )
    if not isinstance(data, dict):
        raise GitHubAPIError("Unexpected response format")
    return data["sha"]

async def create_git_commit(
    self, owner: str, repo: str, message: str, tree_sha: str, parent_shas: list[str]
) -> str:
    """Create a commit and return its SHA."""
    data = await self._request(
        "POST", f"/repos/{owner}/{repo}/git/commits",
        json={"message": message, "tree": tree_sha, "parents": parent_shas},
    )
    if not isinstance(data, dict):
        raise GitHubAPIError("Unexpected response format")
    return data["sha"]

async def update_ref(self, owner: str, repo: str, branch: str, sha: str) -> None:
    """Update branch ref to point to a new commit."""
    await self._request(
        "PATCH", f"/repos/{owner}/{repo}/git/refs/heads/{branch}",
        json={"sha": sha, "force": False},
    )

async def compare_commits(
    self, owner: str, repo: str, base: str, head: str
) -> dict[str, Any]:
    """Compare two commits/branches and get changed files."""
    data = await self._request(
        "GET", f"/repos/{owner}/{repo}/compare/{base}...{head}",
    )
    if not isinstance(data, dict):
        raise GitHubAPIError("Unexpected response format")
    return data

async def get_file_content(
    self, owner: str, repo: str, path: str, ref: str
) -> dict[str, Any]:
    """Get file content at a specific ref."""
    data = await self._request(
        "GET", f"/repos/{owner}/{repo}/contents/{path}",
        params={"ref": ref},
    )
    if not isinstance(data, dict):
        raise GitHubAPIError("Unexpected response format")
    return data
```

### Backend: Git Proxy Router Pattern

```python
# backend/src/pilot_space/api/v1/routers/git_proxy.py
router = APIRouter(prefix="/git", tags=["git"])

@router.get("/repos/{owner}/{repo}/status")
async def get_repo_status(
    session: DbSession,
    current_user: CurrentUser,
    owner: str,
    repo: str,
    branch: str = Query(description="Branch name"),
    integration_id: UUID = Query(description="Integration ID"),
) -> GitStatusResponse:
    """Get changed files for a branch compared to its default branch."""
    provider = await _resolve_provider(session, integration_id)
    files = await provider.get_changed_files(owner, repo, branch)
    return GitStatusResponse(files=files, branch=branch)
```

### Frontend: GitWebStore (MobX)

```typescript
// frontend/src/stores/features/git-web/GitWebStore.ts
import { makeAutoObservable, runInAction } from 'mobx';

export interface ChangedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  staged: boolean;  // Client-side staging state
}

export class GitWebStore {
  currentBranch = '';
  currentRepo: { owner: string; repo: string; provider: 'github' | 'gitlab' } | null = null;
  integrationId: string | null = null;
  changedFiles: ChangedFile[] = [];
  commitMessage = '';
  selectedFilePath: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get stagedFiles(): ChangedFile[] {
    return this.changedFiles.filter((f) => f.staged);
  }

  get unstagedFiles(): ChangedFile[] {
    return this.changedFiles.filter((f) => !f.staged);
  }

  get changedFileCount(): number {
    return this.changedFiles.length;
  }

  stageFile(path: string): void {
    const file = this.changedFiles.find((f) => f.path === path);
    if (file) file.staged = true;
  }

  unstageFile(path: string): void {
    const file = this.changedFiles.find((f) => f.path === path);
    if (file) file.staged = false;
  }

  stageAll(): void {
    this.changedFiles.forEach((f) => (f.staged = true));
  }

  unstageAll(): void {
    this.changedFiles.forEach((f) => (f.staged = false));
  }

  setCommitMessage(message: string): void {
    this.commitMessage = message;
  }

  selectFile(path: string | null): void {
    this.selectedFilePath = path;
  }

  switchBranch(branch: string): void {
    this.currentBranch = branch;
    this.changedFiles = [];
    this.commitMessage = '';
    this.selectedFilePath = null;
  }
}
```

### Frontend: Monaco Diff Viewer Component

```typescript
// frontend/src/features/source-control/components/DiffViewer.tsx
import { useRef, useEffect, useState } from 'react';
import { useMonaco } from '@monaco-editor/react';

interface DiffViewerProps {
  originalContent: string;
  modifiedContent: string;
  language: string;
  filePath: string;
}

export function DiffViewer({ originalContent, modifiedContent, language, filePath }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const monaco = useMonaco();
  const [diffEditor, setDiffEditor] = useState<monaco.editor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    if (!monaco || !containerRef.current) return;

    const editor = monaco.editor.createDiffEditor(containerRef.current, {
      readOnly: true,
      renderSideBySide: false, // inline by default
      enableSplitViewResizing: true,
      originalEditable: false,
      minimap: { enabled: false },
    });

    setDiffEditor(editor);
    return () => editor.dispose();
  }, [monaco]);

  useEffect(() => {
    if (!diffEditor || !monaco) return;

    diffEditor.setModel({
      original: monaco.editor.createModel(originalContent, language),
      modified: monaco.editor.createModel(modifiedContent, language),
    });
  }, [diffEditor, monaco, originalContent, modifiedContent, language]);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GitHub Contents API single-file commits | Git Data API (blobs + trees + commits) | Always available | Enables atomic multi-file commits |
| Custom diff rendering (Phase 36 Tauri) | Monaco built-in diff editor | Monaco 0.20+ | No external diff library needed; syntax-highlighted diffs |
| Direct browser-to-provider API calls | Backend proxy pattern | Security best practice | Prevents token leakage, handles CORS, centralized rate limiting |
| GitHub API v3 only for PRs | GraphQL API v4 for richer PR data | GitHub GraphQL GA | Better query flexibility, but REST v3 sufficient for basic PR creation |

**Note on PR creation:** The CONTEXT.md mentions GraphQL API v4 for PR creation, but the REST API `POST /repos/{owner}/{repo}/pulls` is simpler and sufficient for basic PR creation with title, body, head, base, and draft flag. Use REST v3 unless there is a specific need for GraphQL features (e.g., auto-merge, project association).

**Deprecated/outdated:**
- GitHub Contents API `PUT /repos/{owner}/{repo}/contents/{path}` for commits: Still works but only supports single-file operations. Use Git Data API for multi-file.

## Open Questions

1. **"Changed files" definition for web (no working directory)**
   - What we know: In a local git repo, "changed files" means working directory vs HEAD. In a web context via API, there is no working directory.
   - What's unclear: The CONTEXT.md mentions "stage individual files via Contents API" but the web app has no local files to stage. The concept of "staging" is client-side bookkeeping of which files to include in the next commit.
   - Recommendation: "Changed files" should mean the diff between the branch HEAD and its merge-base with the default branch (similar to PR changed files view). "Staging" is a client-side selection of which changed files to include in the commit. The actual file content edits come from the Monaco editor (user edits a file, content is held in memory, then committed via API).

2. **File editing before commit**
   - What we know: Users need to edit file contents to create meaningful commits
   - What's unclear: Whether the existing `MonacoFileEditor` should be used for editing git-tracked files, or if the SCM panel is read-only diff-only
   - Recommendation: For Phase 44, focus on viewing diffs and committing content that was edited via the existing file editor. The flow is: user opens a file from the file tree, edits it in Monaco, then the SCM panel shows it as "modified" and allows staging+committing the edited content.

3. **Token scope verification**
   - What we know: Existing integration uses `repo read:user user:email` scope
   - What's unclear: Whether all existing connected integrations have sufficient scopes for Git Data API operations
   - Recommendation: Add a scope check on the first Git Data API call; if insufficient, show a "Reconnect" prompt. The Git Data API requires `repo` scope which is already requested.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (frontend) + pytest (backend) |
| Config file | `frontend/vitest.config.ts` / `backend/pyproject.toml` |
| Quick run command | `cd frontend && pnpm test -- --run` / `cd backend && uv run pytest tests/ -x -q` |
| Full suite command | `make quality-gates-frontend` / `make quality-gates-backend` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GIT-WEB-01 | Backend git proxy returns changed files | unit | `cd backend && uv run pytest tests/api/test_git_proxy.py -x` | No - Wave 0 |
| GIT-WEB-02 | GitHubClient Git Data API methods work | unit | `cd backend && uv run pytest tests/integrations/test_github_git_data.py -x` | No - Wave 0 |
| GIT-WEB-03 | GitLabClient commit/branch API methods work | unit | `cd backend && uv run pytest tests/integrations/test_gitlab_client.py -x` | No - Wave 0 |
| GIT-WEB-04 | GitProvider interface resolves correct provider | unit | `cd backend && uv run pytest tests/services/test_git_provider.py -x` | No - Wave 0 |
| GIT-WEB-05 | GitWebStore staging/unstaging works | unit | `cd frontend && pnpm test -- --run src/stores/features/git-web/GitWebStore.test.ts` | No - Wave 0 |
| GIT-WEB-06 | SCM panel renders changed files | unit | `cd frontend && pnpm test -- --run src/features/source-control/__tests__/SourceControlPanel.test.tsx` | No - Wave 0 |
| GIT-WEB-07 | Branch selector lists and switches branches | unit | `cd frontend && pnpm test -- --run src/features/source-control/__tests__/BranchSelector.test.tsx` | No - Wave 0 |
| GIT-WEB-08 | Multi-file commit via Git Data API | unit | `cd backend && uv run pytest tests/integrations/test_github_multi_commit.py -x` | No - Wave 0 |
| GIT-WEB-09 | PR creation form validation and submission | unit | `cd frontend && pnpm test -- --run src/features/source-control/__tests__/CreatePRForm.test.tsx` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && pnpm test -- --run && cd ../backend && uv run pytest tests/ -x -q`
- **Per wave merge:** `make quality-gates-frontend && make quality-gates-backend`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/integrations/test_github_git_data.py` -- GitHub Git Data API client methods
- [ ] `tests/integrations/test_gitlab_client.py` -- GitLab client methods
- [ ] `tests/api/test_git_proxy.py` -- Git proxy router endpoints
- [ ] `tests/services/test_git_provider.py` -- Provider interface resolution
- [ ] `src/stores/features/git-web/GitWebStore.test.ts` -- MobX store unit tests
- [ ] `src/features/source-control/__tests__/` -- Component tests

## Sources

### Primary (HIGH confidence)
- Existing `GitHubClient` at `backend/src/pilot_space/integrations/github/client.py` -- verified methods, patterns, error handling
- Existing `IntegrationRepository` + OAuth flow at `backend/src/pilot_space/api/v1/routers/integrations.py` -- verified token storage pattern
- Existing `apiClient` at `frontend/src/services/api/client.ts` -- verified request/response patterns
- Existing `EditorLayout` at `frontend/src/features/editor/EditorLayout.tsx` -- verified left panel structure
- [GitHub REST API - Git Trees](https://docs.github.com/en/rest/git/trees) -- tree creation
- [GitHub REST API - Git Commits](https://docs.github.com/en/rest/git/commits) -- commit creation
- [GitHub REST API - Comparing Commits](https://docs.github.com/en/rest/commits/commits) -- compare API
- [GitLab Commits API](https://docs.gitlab.com/api/commits/) -- multi-file commit support
- [GitLab Repository Files API](https://docs.gitlab.com/api/repository_files/) -- file content retrieval

### Secondary (MEDIUM confidence)
- [Multi-file commit via GitHub API](https://siddharthav.medium.com/push-multiple-files-under-a-single-commit-through-github-api-f1a5b0b283ae) -- verified workflow: blobs -> tree -> commit -> ref update
- [GitHub multi-file commit gist](https://gist.github.com/StephanHoyer/91d8175507fcae8fb31a) -- community-verified pattern

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and in use
- Architecture: HIGH -- extends existing patterns (GitHubClient, MobX stores, API proxy)
- Pitfalls: HIGH -- based on documented API limitations and existing codebase patterns
- Git Data API workflow: HIGH -- verified via official GitHub docs + multiple community sources

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable APIs, no fast-moving dependencies)
