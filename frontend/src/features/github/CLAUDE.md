# GitHub Integration Module - PR Review & Linking

_For project overview and frontend architecture, see main CLAUDE.md and `frontend/CLAUDE.md`_

## Overview

The **github** module implements GitHub integration for PR reviews, repository management, and issue-PR linking.

**File Path**: `frontend/src/features/github/`
**Purpose**: GitHub OAuth, PR linking, AI review integration
**Layer**: Feature module

---

## Module Structure

```
frontend/src/features/github/
├── pages/
│   └── github-settings-page.tsx   # GitHub OAuth + repo management
├── components/
│   ├── github-connect-button.tsx  # OAuth trigger
│   ├── repo-selector.tsx          # Repo list + sync toggle
│   ├── pr-link-card.tsx           # Link PR to issue
│   ├── pr-review-status.tsx       # Review status display
│   └── webhook-status.tsx         # Webhook connection status
├── hooks/
│   ├── useGitHubAuth.ts           # OAuth + token management
│   ├── useGitHubRepos.ts          # Fetch user repos
│   ├── useLinkPR.ts               # Link PR to issue mutation
│   └── usePRReview.ts             # Get PR review results
└── __tests__/                     # Integration + unit tests
```

---

## GitHub OAuth Flow

**Purpose**: Connect workspace to GitHub App.

**Flow**:
1. User clicks "Connect GitHub" button
2. OAuth popup → GitHub authorization
3. User grants permissions (repos:read, pull_requests:write, workflow:read)
4. Redirect → `/callback?code=...&state=...`
5. Backend exchange code for token + refresh
6. Store token in Supabase Vault (encrypted)
7. Refresh list of connected repos

**UI States**:
- **Not Connected**: Show "Connect GitHub" button
- **Connecting**: Loading spinner + "Authorizing..."
- **Connected**: Show repo list + sync status
- **Error**: Show error message + retry button

---

## Repository Management

**Features**:
- **List Repos**: Fetch repos user has access to
- **Sync Toggle**: Enable/disable repo for PR linking
- **Webhook Status**: Show if webhook is registered
- **Manual Refresh**: Trigger repo list refresh

**Sync Toggle Logic**:
```typescript
// When toggling repo on/off
await updateRepoSettings(repoId, { synced: newValue });

// If syncing ON:
//   - Check webhook exists, register if needed
//   - Start listening for PR events
// If syncing OFF:
//   - Unregister webhook (optional)
//   - Stop listening for PR events
```

---

## PR Linking

**Purpose**: Link GitHub PRs to Pilot Space issues.

**UI**: Issue detail page sidebar → "Linked PRs" section
```
🔗 PR Linking
├─ #123: Add user auth feature
├─ #124: Fix login bug
└─ [+ Link PR]
```

**Search**: User searches by repo:PR#
```
github-org/repo-name#123
→ Fetches PR from GitHub API
→ Shows PR title, description, status
→ User confirms link → Creates IssueGitHubPRLink record
```

---

## PR Review Integration

**Purpose**: AI-powered PR reviews via GitHub comments.

**Trigger**: Webhook from GitHub (PR opened/updated)

**Flow**:
1. GitHub webhook → `/webhooks/github` (backend)
2. Backend queues PR for review (pgmq)
3. PRReviewAgent (Claude Opus) analyzes PR
4. Agent generates comments by aspect (architecture, security, quality, docs)
5. Comments posted to GitHub PR
6. SSE notification sent to frontend
7. Frontend shows badge: "PR Review: 3 issues, 2 warnings"

**Severity Tags**:
- 🔴 **Critical**: Breaking changes, security issues
- 🟡 **Warning**: Code style, minor issues
- 🟢 **Info**: Documentation, suggestions

---

## State Management

### GitHubStore (MobX)

```typescript
isConnected: boolean
repos: GitHubRepository[]
isLoading: boolean
error: string | null
linkedPRs: Map<string, GitHubPR>  // By issue ID
```

**Actions**:
- `connectGitHub(token)`: Store token
- `disconnectGitHub()`: Clear token
- `loadRepos()`: Fetch repos
- `syncRepoSettings(repoId, settings)`: Update sync status
- `linkPR(issueId, prUrl)`: Create link
- `unlinkPR(issueId, prUrl)`: Remove link

---

## API Integration

### Endpoints

```
POST /github/oauth/authorize
  Response: { oauth_url: string }

GET /github/repos
  Response: GitHubRepository[]

PATCH /github/repos/{repoId}/settings
  Body: { synced: boolean }
  Response: GitHubRepository

POST /github/pr/link
  Body: { issue_id, pr_url }
  Response: IssueGitHubPRLink

GET /github/pr/{owner}/{repo}/{number}
  Response: GitHubPR

DELETE /github/pr/link/{linkId}
  Response: void
```

---

## Testing

### Critical Scenarios

- [ ] OAuth flow completes successfully
- [ ] Repos list loads + displays correctly
- [ ] Sync toggle enables/disables webhook
- [ ] Link PR by URL search
- [ ] PR review posts comments to GitHub
- [ ] PR status badge displays
- [ ] Disconnect removes token + clears state
- [ ] Error handling on auth failure

**Commands**:
```bash
pnpm test features/github
pnpm test --coverage features/github
```

---

## Quality Gates

```bash
pnpm lint && pnpm type-check && pnpm test
```

**Coverage**: >80%

---

## Related Documentation

- **DD-004**: MVP scope (GitHub + Slack only)
- **DD-011**: Provider routing
- `docs/architect/frontend-architecture.md`
- `docs/dev-pattern/45-pilot-space-patterns.md`

---

## Summary

GitHub module integrates PR reviews and linking:
- **OAuth**: Connect GitHub account
- **Repos**: List + sync management
- **PR Linking**: Link issues to PRs
- **PR Review**: AI analysis with GitHub comments
- **Status**: Webhook + review indicators

**Status**: Production
**Test Coverage**: Target >80%
