# Homepage Hub Module - Pilot Space

_For project overview and frontend architecture, see main CLAUDE.md and `frontend/CLAUDE.md`_

## Overview

The **homepage** module implements the **Homepage Hub** (US-19 / H047), the primary landing page of Pilot Space after workspace selection. It embodies the **Note-First workflow (DD-013)** by prominently featuring recent activity and quick AI chat, rather than a traditional dashboard.

### Key Characteristics

- **File Path**: `frontend/src/features/homepage`
- **Purpose**: Display workspace activity digest, AI suggestions, and quick chat interface
- **Status**: Production (MVP)

### Design Philosophy

**Note-First Workflow (DD-013)**: Notes are the home view default, not dashboards. The Homepage Hub provides:
1. **Compact ChatView** — Quick AI assistance without leaving home
2. **Activity Feed** — Recent notes and issues (Today, Yesterday, This Week)
3. **AI Digest Panel** — Intelligent suggestions (stale issues, missing docs, etc.)

---

## Routing Architecture

### URL Structure

```
/[workspaceSlug]                → WorkspaceHomePage (H047)
  ├─ /notes                      → NotesListPage (feature: notes)
  ├─ /issues                     → IssuesListPage (feature: issues)
  ├─ /chat                       → FullChatPage (feature: ai)
  ├─ /approvals                  → ApprovalsPage (feature: approvals)
  ├─ /costs                      → CostsPage (feature: costs)
  └─ /settings/*                 → SettingsPages (feature: settings)
```

**Entry Flow**:
1. User logs in → `/` (root page)
2. Root resolves workspace, redirects to `/{workspaceSlug}`
3. Workspace URL → `/app/(workspace)/[workspaceSlug]/page.tsx` renders **HomepageHub**

**No Redirect**: `/[workspaceSlug]` is the home page (NOT redirected to `/notes`). This maintains Note-First paradigm.

---

## Architecture Overview

### Three-Zone Layout (H047)

```
┌─────────────────────────────────────────────────────────┐
│          Zone 1: Compact ChatView (H035-H040)           │
│  Max-width 720px, centered. Collapsed: 48px input bar.  │
│  Expanded: Full chat panel with history + responses     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Zone 2: Activity Feed (H033, H034)  │  Zone 3: Digest  │
│  ──────────────────────────────────   │  Panel (H041,    │
│  Recent Notes & Issues grouped by     │  H046)           │
│  time (Today, Yesterday, This Week).  │  ────────────    │
│  Infinite scroll w/ 20-item pages.    │  AI suggestions: │
│  Day group headers with counts.       │  12 categories   │
│  Note & Issue cards with metadata.    │  Refresh button. │
│  Empty state: "Your workspace is      │  Dismissible.    │
│  quiet. Start a note to get going!"   │                  │
│                                       │                  │
└─────────────────────────────────────────────────────────┘

Desktop: 3-col with flex-[3] activity, flex-[2] digest
Mobile: Stacked vertically, compact chat at top/bottom
```

### Component Hierarchy

```
WorkspaceHomePage (wrapper, loads onboarding)
└── HomepageHub (H047, orchestrator)
    ├── CompactChatView (H035-H040, coordinator)
    │   ├── CompactChatInput (H035, collapsed 48px state)
    │   └── CompactChatPanel (H036-H039, expanded state)
    │       ├── CompactMessageList (H037, message history)
    │       └── CompactChatInput (in panel header)
    │
    ├── ActivityFeed (H033, infinite scroll container)
    │   ├── DayGroupHeader (H031, time bucket headers)
    │   ├── NoteActivityCard (H030, note item)
    │   └── IssueActivityCard (H029, issue item)
    │
    └── DigestPanel (H046, AI suggestions)
        ├── DigestSuggestionCard (H045, suggestion item)
        ├── DigestEmptyState (H044, empty variants)
        └── DigestSkeleton (loading state)
```

---

## Functionality Summary

### 1. Compact ChatView (Zone 1)

**States**:
- **Collapsed** (48px): Input bar with AI avatar, placeholder "What's on your mind?", `[/]` hint
- **Expanded** (400px): Chat history, input, send/abort buttons, minimize button

**Interactions**:
- Click input → Expand (200ms animation)
- Type message → Send via PilotSpaceStore
- ESC or outside → Collapse
- `[/]` → Focus input (if no other input focused)
- Mobile: Bottom sheet with backdrop overlay

### 2. Activity Feed (Zone 2)

**Grouping**: Today, Yesterday, This Week (only non-empty buckets)

**Infinite Scroll**:
- 20 items per page, cursor-based pagination
- IntersectionObserver on sentinel
- Max 200 rendered items (performance guard)

**Card Types**:
- **NoteActivityCard**: Title, project, word count, updated time, AI annotation preview
- **IssueActivityCard**: ID, title, state badge (with color), priority, assignee

**Empty State**: "Your workspace is quiet. Start a note to get going!"

**Query Config**: Stale time 30 seconds, GC 5 minutes, refetch on window focus

### 3. AI Digest Panel (Zone 3)

**Suggestion Categories** (12 total):
1. Stale Issues — Issues 14+ days without update
2. Missing Documentation — Features without ADRs/specs
3. Inconsistent Status — State machine violations
4. Blocked Dependencies — Blocking deps not resolved
5. Unassigned Work — Issues without assignees
6. Overdue Cycle Items — Past cycle end date
7. PR Review Pending — Open PRs awaiting review
8. Duplicate Candidates — Semantic similarity (70%+ match)
9. Note Refinement — Low clarity scores
10. Project Health — >30% stale issues
11. Knowledge Gaps — Common error patterns undocumented
12. Release Readiness — Pre-release checklist incomplete

**Features**:
- Relevance score (0-1), dismiss button, action link
- Refresh button (2s debounce)
- Empty state: "You're all caught up!"

**Query Config**: Stale time 5 minutes, GC 10 minutes, no refetch on focus

---

## Keyboard Shortcuts & Accessibility

### Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus chat input (if not typing) |
| `F6` | Cycle to next zone |
| `Shift+F6` | Cycle to prev zone |
| `Escape` | Close expanded chat |
| `Tab` | Focus trap in chat (when expanded) |

### ARIA Landmarks

```tsx
<section role="region" aria-label="Quick AI chat">
<section role="region" aria-label="Recent activity">
<section role="region" aria-label="AI workspace insights">
```

### Reduced Motion

All animations respect `prefers-reduced-motion: reduce` CSS media query.

---

## API Integration

### Endpoints

**Activity Feed**:
```
GET /api/v1/workspaces/{workspace_id}/homepage/activity
  Query: cursor?: string
  Response: {
    data: Record<'today'|'yesterday'|'this_week', ActivityCard[]>,
    meta: { total, cursor, has_more }
  }
```

**AI Digest**:
```
GET /api/v1/workspaces/{workspace_id}/homepage/digest
  Response: {
    data: {
      generated_at: ISO timestamp,
      suggestions: DigestSuggestion[]
    }
  }

POST /api/v1/workspaces/{workspace_id}/homepage/digest/refresh
  Response: { status: 'generating' | 'completed' | 'error' }

POST /api/v1/workspaces/{workspace_id}/homepage/digest/dismiss
  Body: {
    suggestion_id: string,
    category: DigestCategory,
    entity_id: string | null
  }
```

---

## Hooks API

### `useHomepageActivity(options)`

**Purpose**: Infinite query for activity feed.

**Options**:
- `workspaceId: string` — Workspace ID (required)
- `enabled?: boolean` — Enable query (default: true)

**Returns**: InfiniteQueryResult with pagination data.

---

### `useWorkspaceDigest(options)`

**Purpose**: Query for AI digest suggestions.

**Options**:
- `workspaceId: string` — Workspace ID (required)
- `enabled?: boolean` — Enable query (default: true)

**Returns**: QueryResult with digest data.

---

### `useCompactChat(workspaceId)`

**Purpose**: Bridge to PilotSpaceStore for chat context.

**Returns**:
- `messages`, `isStreaming`, `streamContent`, `error`
- `sendMessage(text)`, `abort()`

---

## Store: `HomepageUIStore`

**MobX store** for Homepage UI state.

**Properties**:
- `chatExpanded: boolean` — Is compact chat expanded
- `activeZone: HomepageZone` — Currently focused zone (for F6 cycling)

**Methods**:
- `expandChat()`, `collapseChat()`, `toggleChat()`
- `setActiveZone(zone)`
- `reset()`

---

## File Structure

```
frontend/src/features/homepage/
├── CLAUDE.md (this file)
├── index.ts (barrel export)
├── types.ts (24 type definitions)
├── constants.ts (static config)
│
├── stores/
│   └── HomepageUIStore.ts (MobX store)
│
├── api/
│   └── homepage-api.ts (typed API client)
│
├── hooks/
│   ├── useHomepageActivity.ts (infinite query)
│   ├── useWorkspaceDigest.ts (digest query)
│   ├── useCompactChat.ts (session bridge)
│   └── useDigestDismiss.ts (dismiss mutation)
│
├── components/
│   ├── HomepageHub.tsx (3-zone orchestrator, ~140 lines)
│   ├── CompactChatView/ (H035-H040)
│   ├── ActivityFeed/ (H033, H034)
│   └── DigestPanel/ (H045, H046)
│
└── __tests__/ (9 test files)
    ├── HomepageHub.test.tsx
    ├── CompactChatView.test.tsx
    ├── ActivityFeed.test.tsx
    └── DigestPanel.test.tsx
```

**Total Files**: 28 components, hooks, API, store, tests
**All <700 lines**: Well-sized components
**Test Coverage**: >80%

---

## Dependencies

### Direct

- `react` 18+, `next` 14+, `mobx` 6+, `@tanstack/react-query` 5+
- `recharts`, `lucide-react`, `tailwindcss`, `shadcn/ui`

### Internal

- `PilotSpaceStore` — Chat orchestration
- `WorkspaceStore` — Workspace context
- `RootStore` — DI container

---

## Quality Gates

### Pre-Submission Checklist

- [x] All components wrapped with `observer()` if accessing MobX
- [x] Query keys use factory pattern
- [x] No API data stored in MobX
- [x] Infinite scroll uses cursor pagination
- [x] Keyboard shortcuts tested
- [x] ARIA landmarks present
- [x] Reduced motion support
- [x] TypeScript strict mode
- [x] File sizes <700 lines
- [x] Unit tests >80%

---

## Related Documentation

- **DD-013**: Note-First workflow
- **DD-065**: MobX for UI + TanStack Query for server
- **DD-086**: Centralized PilotSpaceAgent
- `docs/architect/frontend-architecture.md`
- `docs/dev-pattern/45-pilot-space-patterns.md`
- **US-19**: Homepage Hub feature

---

## Summary

The **Homepage Hub** is Pilot Space's primary entry point, embodying Note-First philosophy:

- **Zone 1**: Compact ChatView (collapsed 48px, expands to 400px)
- **Zone 2**: Activity Feed (infinite scroll by time)
- **Zone 3**: AI Digest (12-category suggestions)

**Key Features**:
- Keyboard navigation (/, F6, Escape)
- WCAG 2.2 AA accessibility
- Responsive layout (desktop 3-col, mobile stacked)
- Real-time activity + digest insights

**Files**: 28 total
**Status**: Production (MVP)
**Test Coverage**: >80%

For modifications, start by reading this file, then examine the component you're changing. Run `pnpm lint && pnpm type-check && pnpm test` before committing.

**File Location**: `/Users/tindang/workspaces/tind-repo/pilot-space-2/frontend/src/features/homepage/CLAUDE.md`
