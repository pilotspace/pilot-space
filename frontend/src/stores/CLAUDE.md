# MobX Stores Architecture

**File**: `frontend/src/stores/CLAUDE.md`
**Scope**: Complete MobX state management system
**Last Updated**: 2026-02-10

## Overview

This directory contains MobX stores that manage **UI state only** (per DD-065). Server state is managed exclusively by TanStack Query.

**Core Philosophy**:

- **MobX = UI State**: Local UI interactions, modals, theme, sidebar collapsed, etc.
- **TanStack Query = Server State**: Notes, issues, cycles, workspace members, etc.
- **Never mix**: Do not store API responses in MobX. Do not fetch in TanStack Query selectors.

**Store Hierarchy**:

```
RootStore
├── auth: AuthStore              (User authentication + metadata)
├── ui: UIStore                  (Theme, layout, modals, toasts)
├── workspace: WorkspaceStore    (Current workspace + members)
├── notifications: NotificationStore
├── notes: NoteStore             (Editor state, dirty tracking)
├── issues: IssueStore           (Issue filters, sorting, AI suggestions)
├── cycles: CycleStore           (Cycle selection, burndown state)
├── ai: AIStore                  (All AI-related stores)
│   ├── ghostText: GhostTextStore
│   ├── aiContext: AIContextStore
│   ├── approval: ApprovalStore
│   ├── settings: AISettingsStore
│   ├── prReview: PRReviewStore
│   ├── conversation: ConversationStore (Deprecated)
│   ├── cost: CostStore
│   ├── marginAnnotation: MarginAnnotationStore
│   └── pilotSpace: PilotSpaceStore (Unified agent orchestration)
├── onboarding: OnboardingStore  (First-time setup UI)
├── roleSkill: RoleSkillStore    (Role setup wizard UI)
└── homepage: HomepageUIStore    (Home page layout)
```

---

## Submodule Documentation

| Module              | Doc                                        | Covers                                                                                                                                                            |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI Stores** (11)  | [`ai/CLAUDE.md`](ai/CLAUDE.md)             | AIStore root, PilotSpaceStore, GhostTextStore, ApprovalStore, AIContextStore, MarginAnnotationStore, CostStore, AISettingsStore, PRReviewStore, ConversationStore |
| **Core Stores** (7) | [`features/CLAUDE.md`](features/CLAUDE.md) | AuthStore, UIStore, WorkspaceStore, NoteStore, IssueStore, CycleStore, NotificationStore                                                                          |

---

## RootStore

**File**: `frontend/src/stores/RootStore.ts`

Central hub that coordinates all stores with cross-store references.

### Structure

```tsx
export class RootStore {
  auth: AuthStore;
  ui: UIStore;
  workspace: WorkspaceStore;
  notifications: NotificationStore;
  notes: NoteStore;
  issues: IssueStore;
  cycles: CycleStore;
  ai: AIStore;
  onboarding: OnboardingStore;
  roleSkill: RoleSkillStore;
  homepage: HomepageUIStore;

  constructor() {
    this.auth = new AuthStore();
    this.ui = new UIStore();
    // ...
    this.workspace.setAuthStore(this.auth);
  }

  reset(): void {
    /* Reset all stores on logout */
  }
  dispose(): void {
    /* Clean up subscriptions */
  }
}
```

### Hooks

Use these hooks to access stores in components. **Always use hooks, never access `rootStore` directly**.

```tsx
const { noteStore } = useStore();
const noteStore = useNoteStore();
const { noteStore, issueStore, cycleStore } = useStore();
const root = useStores(); // Root store (rarely needed)
```

---

## NotificationStore (Brief)

**File**: `frontend/src/stores/NotificationStore.ts` (78 lines)

Simple notification inbox (independent of toast notifications). Manages `notifications[]` with `unreadCount`, `markAsRead()`, `markAllAsRead()`, `clearAll()`.

---

## AIStore Root Lifecycle

**File**: `frontend/src/stores/ai/AIStore.ts` (85 lines)

Container for all 11 AI feature stores. Provides `isGloballyEnabled` master switch, `loadWorkspaceSettings()` for feature flag initialization, `abortAllStreams()` for cleanup, and `reset()` for logout.

**Full AI store details**: See [`ai/CLAUDE.md`](ai/CLAUDE.md)

---

## MobX Patterns & Best Practices

**Core Pattern**: Use `makeAutoObservable(this)` to automatically track observables and actions.

```tsx
export class IssueStore {
  issues: Map<string, Issue> = new Map();
  selectedId: string | null = null;
  filters: IssueFilters = {};
  isLoading = false;

  constructor() {
    makeAutoObservable(this, { filteredIssues: computed });
  }

  get filteredIssues(): Issue[] {
    return Array.from(this.issues.values()).filter((i) => {
      if (this.filters.state && i.state !== this.filters.state) return false;
      if (this.filters.priority && i.priority !== this.filters.priority) return false;
      return true;
    });
  }

  setSelectedId(id: string | null): void {
    this.selectedId = id;
  }
}

export const IssueList = observer(function IssueList() {
  const { issueStore } = useStore();
  return (
    <ul>
      {issueStore.filteredIssues.map((i) => (
        <li key={i.id}>{i.title}</li>
      ))}
    </ul>
  );
});
```

**Key Patterns**:

- **makeAutoObservable**: Enable automatic tracking. Declare expensive computed properties in second arg.
- **Computed**: Auto-memoized, runs only if dependencies change (fast).
- **Reactions**: Side effects (auto-save, localStorage, fetches). Set up in constructor, store disposers, clean up in `dispose()`.
- **runInAction**: Wrap mutations after `await`. Required in strict mode.
- **observer()**: Wrap all components reading observables. Use named function expressions for stack traces.
- **autoBind: true**: Auto-bind methods so `onClick={store.action}` works without `() =>`.
- **Cross-store references**: RootStore wires stores in constructor (e.g., `workspace.setAuthStore(auth)`).
- **Cleanup**: Dispose reactions on logout via `dispose()` method.

---

## Integration with TanStack Query

**Golden Rule**: MobX = UI state (selectedId, filters, modals). TanStack Query = server state (notes, issues, cycles).

**Correct Pattern**:

- MobX stores: Visibility, selection, form inputs, editing mode
- TanStack hooks: useQuery for fetches, useMutation for updates with optimistic updates + rollback
- Never store API responses in MobX

**Anti-Pattern**:

```tsx
class BadStore {
  issue: Issue | null = null; // No caching, manual sync, no refetch
}

class GoodStore {
  selectedIssueId: string | null = null; // Only ID, let TanStack manage data
}
// Component: const { data: issue } = useQuery(['issues', selectedIssueId], ...)
```

---

## Common Gotchas & Solutions

| Issue                       | Problem                                                 | Solution                                                           |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Forgot `observer()`         | Component won't re-render on observable changes         | Wrap with `observer(function Name() {...})`                        |
| Missing `runInAction`       | Mutations after `await` trigger warnings in strict mode | Wrap post-async mutations: `runInAction(() => { this.data = x; })` |
| Storing API data            | No caching, manual sync, no refetch                     | Keep only IDs in MobX; store responses in TanStack Query           |
| Computed with unstable deps | Infinite loops or stale computed values                 | Ensure computed depends only on stable observables                 |
| Forgetting dispose          | Memory leaks from reaction subscriptions                | Store disposers, call in `dispose()` on logout                     |

---

## File Organization

```
frontend/src/stores/
├── RootStore.ts                 # Central hub + hooks
├── AuthStore.ts                 # Authentication
├── UIStore.ts                   # Layout & modals
├── WorkspaceStore.ts            # Workspace & members
├── NotificationStore.ts         # Notifications
├── OnboardingStore.ts           # First-time setup UI
├── RoleSkillStore.ts            # Role setup wizard UI
├── index.ts                     # Barrel exports
├── features/
│   ├── notes/
│   │   ├── NoteStore.ts         # Note editor state
│   │   └── index.ts
│   ├── issues/
│   │   ├── IssueStore.ts        # Issue filters & state
│   │   └── index.ts
│   ├── cycles/
│   │   ├── CycleStore.ts        # Cycle management
│   │   ├── cycle-store-types.ts
│   │   ├── cycle-store-actions.ts
│   │   └── index.ts
│   ├── CLAUDE.md                # Core stores docs
│   └── index.ts
└── ai/
    ├── AIStore.ts               # Root AI store
    ├── PilotSpaceStore.ts       # Unified agent orchestration
    ├── GhostTextStore.ts        # Inline suggestions
    ├── AIContextStore.ts        # Issue context aggregation
    ├── ApprovalStore.ts         # Human-in-the-loop approvals
    ├── ... (14 more files)
    ├── CLAUDE.md                # AI stores docs
    └── index.ts
```

---

## Quick Reference: When to Use Which Store

| Use Case                    | Store                           | Pattern                  |
| --------------------------- | ------------------------------- | ------------------------ |
| User authentication         | AuthStore                       | Supabase + subscriptions |
| Layout (sidebar, theme)     | UIStore                         | Reactions + localStorage |
| Current workspace selection | WorkspaceStore                  | Computed properties      |
| Note editor dirty state     | NoteStore                       | Auto-save + reactions    |
| Issue filters & sorting     | IssueStore                      | Computed filtering       |
| Cycle selection             | CycleStore                      | CRUD + state             |
| Inline text suggestions     | GhostTextStore                  | Debounced + cached       |
| Issue context               | AIContextStore                  | SSE streaming + cache    |
| Human-in-the-loop approvals | ApprovalStore + PilotSpaceStore | Queue + UI state         |
| AI conversations            | PilotSpaceStore                 | SSE + session mgmt       |
| Margin annotations          | MarginAnnotationStore           | Inline UI state          |
| Cost tracking               | CostStore                       | Read-only metrics        |

---

## Related Documentation

- **AI Stores (detailed)**: [`ai/CLAUDE.md`](ai/CLAUDE.md)
- **Core Stores (detailed)**: [`features/CLAUDE.md`](features/CLAUDE.md)
- **MobX Patterns**: `docs/dev-pattern/21c-frontend-mobx-state.md`
- **Frontend Architecture**: `docs/architect/frontend-architecture.md`
- **AI Agent Architecture**: `docs/architect/pilotspace-agent-architecture.md`
- **Design System**: `specs/001-pilot-space-mvp/ui-design-spec.md`
- **Data Model**: `specs/001-pilot-space-mvp/data-model.md`
