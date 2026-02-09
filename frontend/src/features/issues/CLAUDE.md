# Issues Module - Frontend Development Guide

_For project overview, see main `CLAUDE.md` at project root and `frontend/CLAUDE.md`_

## **Quick Reference**

### Module Location & Stats
- **Path**: `frontend/src/features/issues/`
- **Components**: 24 UI components (20+ specific + 4 AI context)
- **Hooks**: 15 TanStack Query + MobX hooks
- **Tests**: 22 test files (components + hooks + integration)
- **Lines of Code**: 70 LOC max per component (enforced)

### Critical Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| **Debounce MS** | 2000 | Auto-save delay for title/description |
| **AI Context Cache** | 5 minutes | Stale time for generated context |
| **Activity Page Size** | 50 | Offset pagination per request |
| **Save Status States** | idle\|saving\|saved\|error | Per-field UI feedback |
| **Issue Stale Time** | 30 seconds | Detail query cache time |

---

## **Module Overview**

### Purpose

The **issues** feature module enables:
1. **Issue CRUD**: View, create, edit, delete issues with inline editing
2. **Property Management**: State transitions, assign, set priority/cycle/labels/dates
3. **Activity Tracking**: Comments, edit history, infinite scroll timeline
4. **Sub-Issues**: Create and manage child issues linked to parents
5. **AI Context**: Generate aggregated context (related issues, docs, code, tasks)
6. **Keyboard Shortcuts**: Force save (Cmd/Ctrl+S), close sidebar (Escape)

### Issue State Machine

**Enforced at backend with RLS; frontend displays and enables transitions:**

```
Backlog ──→ Todo ──→ In Progress ──→ In Review ──→ Done
   ↑                                                    ↓
   └─────────────── Can Reopen (to Todo) ────────────┘

Any state → Cancelled (final, no reopen)
```

**State-Cycle Constraints:**
- **Backlog**: No cycle assignment (unscheduled)
- **Todo**: Cycle optional
- **In Progress**: Cycle required (active cycle only)
- **In Review**: Cycle required (active cycle only)
- **Done**: Archived with cycle completion metrics
- **Cancelled**: Removed from cycle immediately

---

## **Architecture Overview**

### Directory Structure

```
features/issues/
├── components/                      # 24 UI components
│   ├── issue-header.tsx            # T140: Navigation, AI badge, delete
│   ├── issue-title.tsx             # T028: Click-to-edit, 2s debounce
│   ├── issue-description-editor.tsx # T030: TipTap, 2s debounce
│   ├── issue-properties-panel.tsx   # Inline selectors (no modals)
│   ├── sub-issues-list.tsx         # Child issues + create form
│   ├── activity-timeline.tsx        # T037: Infinite scroll comments
│   ├── activity-entry.tsx           # Single activity item
│   ├── comment-input.tsx            # Comment submission
│   ├── ai-context-tab.tsx          # T211: Dynamic import, SSR=false
│   ├── ai-context-panel.tsx        # Context UI wrapper
│   ├── ai-context-streaming.tsx    # Loading phases
│   ├── context-summary-card.tsx    # AI summary
│   ├── related-issues-section.tsx  # Related items with badges
│   ├── related-docs-section.tsx    # Related documentation
│   ├── related-items-list.tsx      # Generic related items
│   ├── ai-tasks-section.tsx        # Task checklist
│   ├── prompt-block.tsx            # Claude Code prompt
│   ├── linked-prs-list.tsx         # GitHub PR links
│   ├── source-notes-list.tsx       # Source note links
│   ├── conversation-*.tsx          # 3 chat components (T215)
│   ├── index.ts                    # Barrel export (25 exports)
│   └── __tests__/                  # 22 integration tests
├── hooks/                          # 15 custom hooks
│   ├── use-issue-detail.ts         # T007: Query (30s stale)
│   ├── use-update-issue.ts         # T008: Mutation + optimistic
│   ├── use-activities.ts           # T009: InfiniteQuery (50/page)
│   ├── use-add-comment.ts          # T010: Mutation + invalidations
│   ├── use-save-status.ts          # MobX → UI feedback
│   ├── useAIContext.ts             # T211: Generate + regenerate
│   ├── useAIContextChat.ts         # T215: SSE streaming
│   ├── useExportContext.ts         # Export context as markdown
│   ├── use-workspace-members.ts    # T013b: Assignee options
│   ├── use-project-cycles.ts       # T013: Cycle options
│   ├── use-workspace-labels.ts     # T013c: Label options
│   ├── use-create-sub-issue.ts     # T013a: Create child
│   ├── use-issue-keyboard-shortcuts.ts # T045: Shortcuts
│   ├── use-copy-feedback.ts        # Toast feedback
│   ├── index.ts                    # Barrel export (14 exports)
│   └── __tests__/                  # 9 hook unit tests
├── editor/
│   └── create-issue-editor-extensions.ts  # TipTap extensions
└── CLAUDE.md                       # This file
```

### Component Tree (70/30 Layout)

```
IssueDetailPage
├── IssueHeader
├── Main Content (70%)
│   ├── IssueTitle (click-to-edit)
│   ├── IssueDescriptionEditor (TipTap)
│   ├── SubIssuesList
│   ├── ActivityTimeline (infinite scroll)
│   │   ├── CommentInput
│   │   └── ActivityEntry[] (50/page)
│   └── Tabs: "AI Context" | "Details" | "Linked"
└── Sidebar (30%) — Content varies by tab
    ├── "Details" tab → IssuePropertiesPanel
    │   ├── State selector (enforce machine)
    │   ├── Priority, Type, Assignee
    │   ├── Cycle (with constraints)
    │   ├── Labels, Estimate
    │   ├── Dates (start/target)
    │   ├── Reporter info
    │   ├── LinkedPRsList
    │   └── SourceNotesList
    ├── "AI Context" tab → AIContextTab (dynamic)
    │   ├── ContextSummaryCard
    │   ├── RelatedIssuesSection
    │   ├── RelatedDocsSection
    │   ├── AITasksSection
    │   ├── PromptBlock
    │   └── AIContextStreaming
    └── "Linked" tab → RelatedItemsList
```

---

## **Data Flow & Patterns**

### Issue Detail Query Flow

```
IssueDetailPage renders
  ↓
useIssueDetail(workspaceId, issueId)
  ↓
TanStack Query checks cache (30s stale)
  ↓
queryFn: issuesApi.get()
  ↓
Backend: GET /issues/{issueId} + RLS check
  ↓
Issue + relations + state color
  ↓
Cache updated → UI renders
```

### Optimistic Update Flow (2-step)

**Step 1: User edits (2s debounce)**
```
User types → setState(value)
  ↓
clearTimeout() + setTimeout(2s, save)
```

**Step 2: Mutation lifecycle**
```
useUpdateIssue().mutateAsync({ field: value })
  ↓
onMutate:
  - queryClient.cancelQueries()
  - snapshot = getQueryData()
  - setQueryData(patch optimistically)
  ↓ UI renders immediately
  ↓
Await server response
  ↓
onSuccess: setQueryData(server response)
onError: setQueryData(snapshot) — ROLLBACK
onSettled: invalidateQueries() — refetch
```

### Comment → Activity Flow

```
CommentInput: User types comment
  ↓
handleCommentSubmit() → useAddComment.mutate(content)
  ↓
issuesApi.addComment() → POST /issues/{issueId}/comments
  ↓
Backend creates comment + emits activity
  ↓
onSettled:
  - Invalidate activitiesKeys.all(issueId)
  - Invalidate issueDetailKeys.detail(issueId)
  ↓
useActivities() refetches page 1 (50 items)
  ↓
UI: Comment appears at top of timeline
```

### AI Context Generation Flow

```
AIContextTab mounts OR issueId changes
  ↓
contextStore.generateContext(issueId, workspaceId)
  ↓
useAIContext() — TanStack Query:
  ├─ Cache hit (5 min)? → return cached
  └─ Cache miss? → POST /issues/{issueId}/ai-context/generate
    ↓
Backend aggregates:
  - Related issues (semantic search)
  - Related notes (NoteIssueLink)
  - Code refs (dependency graph)
  - Tasks (decomposed from issue)
  - Claude Code prompt (pre-filled)
    ↓
Frontend AIContextTab renders sections:
  ├── ContextSummaryCard (1-2 sentence)
  ├── RelatedIssuesSection (BLOCKS/RELATES/BLOCKED_BY)
  ├── RelatedDocsSection
  ├── AITasksSection (checklist + completion)
  ├── PromptBlock (ready to copy → Claude Code)
  └── Copy buttons (All/Related/Tasks)
```

---

## **Hooks & Query Patterns**

### TanStack Query Hooks (Server State)

| Hook | Pattern | Purpose | Stale Time | Key Feature |
|------|---------|---------|-----------|---|
| `useIssueDetail` | Query | Single issue + relations | 30s | Enabled gating |
| `useUpdateIssue` | Mutation | PATCH issue | -- | Optimistic + rollback |
| `useActivities` | InfiniteQuery | Comments (offset) | -- | 50/page, sentinel |
| `useAddComment` | Mutation | POST comment | -- | Invalidates activities |
| `useCreateSubIssue` | Mutation | POST with parentId | -- | Invalidates parent |
| `useWorkspaceMembers` | Query | Assignee options | 60s | Enabled gating |
| `useWorkspaceLabels` | Query | Label options | 60s | Enabled gating |
| `useProjectCycles` | Query | Cycle options | 60s | Enabled gating |
| `useAIContext` | Query | Generated context | 5m | Generate/regenerate |
| `useAIContextChat` | -- | SSE streaming | -- | Message state |

### MobX Hooks (UI State)

| Hook/Store | Purpose | Integration |
|------------|---------|-------------|
| `useSaveStatus(fieldName)` | Per-field save indicator | IssueStore.saveStatus Map |
| `IssueStore.aggregateSaveStatus` | Aggregate: saving > error > saved > idle | SaveStatus component |
| `AIContextStore.isLoading / phases / error` | Context generation state | AIContextTab loading UI |
| `useStore()` → `workspaceStore` | Workspace context | Query enabled gating |

### Query Key Patterns

```typescript
issueDetailKeys = {
  all: ['issues'],
  detail: (issueId) => ['issues', issueId]
}

activitiesKeys = {
  all: (issueId) => ['issues', issueId, 'activities']
}

workspaceMembersKeys = {
  all: (workspaceId) => ['workspaces', workspaceId, 'members']
}

aiContextKeys = {
  all: ['ai-context'],
  detail: (issueId) => ['ai-context', issueId],
  chat: (issueId) => ['ai-context', issueId, 'chat']
}
```

---

## **State Management**

### TanStack Query (Server State) — RULE: No API data in MobX

```typescript
// ✅ Correct
const { data: issue } = useIssueDetail(workspaceId, issueId);

// ❌ Wrong
@observable issue: Issue | null = null;  // Don't do this!
```

### MobX (UI State) — Non-persisted only

```typescript
class IssueStore {
  @observable saveStatus: Map<string, 'idle'|'saving'|'saved'|'error'> = new Map();

  @action setSaveStatus(field: string, status: SaveStatusState) {
    this.saveStatus.set(field, status);
    if (status === 'saved') {
      setTimeout(() => this.saveStatus.set(field, 'idle'), 2000);  // Auto-clear
    }
  }

  @computed
  get aggregateSaveStatus(): SaveStatusState {
    // Priority: saving > error > saved > idle
  }
}

class AIContextStore {
  @observable isLoading = false;
  @observable result: AIContextResult | null = null;
  @observable phases: GenerationPhase[] = [];

  @action
  async generateContext(issueId: string, workspaceId?: string) {
    // Handles dedup, cache invalidation on issueId change
  }
}
```

---

## **Quality Gates**

### Commands

```bash
cd frontend
pnpm lint && pnpm type-check && pnpm test
```

### Coverage Requirements

- `hooks/`: >90% (critical TanStack Query logic)
- `components/`: >80% (composition)
- Overall: >80% (module pass/fail)

### Test Files

22 test files covering:
- Component rendering + interactions
- Hook execution + state updates
- Infinite scroll + pagination
- Optimistic updates + rollback
- AI context generation
- Error handling + edge cases

---

## **Related Documentation**

### Design Decisions
- **DD-065**: State split (MobX for UI, TanStack Query for server data)
- **DD-086**: Centralized AI agent architecture
- **DD-003**: Human-in-the-loop approval (issue creation)

### Dev Patterns
- `docs/dev-pattern/45-pilot-space-patterns.md`: Project-specific patterns
- `docs/dev-pattern/21c-frontend-mobx-state.md`: MobX patterns
- `docs/dev-pattern/20-component.md`: Component guidelines

---

## **Implementation Checklist**

### When Adding a New Hook

- [ ] Define query keys hierarchically
- [ ] Use TanStack Query patterns (useQuery/useMutation/useInfiniteQuery)
- [ ] Set `staleTime` for queries (defaults: 30-60s)
- [ ] Add `enabled` gating for dependent queries
- [ ] Export from `hooks/index.ts`
- [ ] Create unit test with mocked API

### When Adding a New Component

- [ ] File <700 LOC
- [ ] Props have explicit TypeScript interfaces
- [ ] Wrap with `observer()` if consuming MobX
- [ ] WCAG 2.2 AA compliance
- [ ] Export from `components/index.ts`
- [ ] Create unit + integration tests

---

## **Troubleshooting**

| Problem | Cause | Solution |
|---------|-------|----------|
| Save status not showing | useSaveStatus not called consistently | Verify fieldName matches |
| Optimistic update doesn't rollback | onMutate doesn't return snapshot | Check snapshot capture + onError |
| AI Context takes >30s | Search timeouts | Check phases array |
| Infinite scroll not triggering | Sentinel not visible | Verify IntersectionObserver |
| State transition fails | Backend rejects (RLS?) | Check state machine + constraints |

---

**Document Version**: 1.0
**Last Updated**: 2026-02-09
