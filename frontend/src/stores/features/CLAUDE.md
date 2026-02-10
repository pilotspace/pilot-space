# Core Feature Stores

**File**: `frontend/src/stores/features/CLAUDE.md`
**Scope**: Domain-specific MobX stores (Auth, UI, Workspace, Note, Issue, Cycle)
**Parent**: [`../CLAUDE.md`](../CLAUDE.md) (MobX Stores Architecture)

---

## Overview

Core feature stores manage UI state for primary application domains. All follow the DD-065 rule: MobX for UI state only, TanStack Query for server state. These stores are initialized by RootStore and accessed via hooks.

---

## AuthStore

**File**: `frontend/src/stores/AuthStore.ts` (359 lines)

Manages Supabase authentication with session lifecycle.

**Observable Properties**:

```tsx
class AuthStore {
  user: AuthUser | null = null;
  session: Session | null = null;
  isLoading = true;
  error: string | null = null;

  get isAuthenticated(): boolean; // user !== null && session !== null
  get userDisplayName(): string; // name or email prefix
  get userInitials(): string; // 1-2 letter initials (e.g., "TD")
}
```

**Actions**:

```tsx
// Login/signup
async login(email: string, password: string): Promise<boolean>;
async loginWithOAuth(provider: 'github' | 'google'): Promise<void>;
async signup(email: string, password: string, name: string): Promise<boolean>;
async logout(): Promise<void>;

// Profile updates
async updateProfile(data: { name?: string; avatarUrl?: string }): Promise<boolean>;
async resetPassword(email: string): Promise<boolean>;
async refreshSession(): Promise<boolean>;

// Error handling
clearError(): void;
```

**Subscription Pattern**:

```tsx
private subscribeToAuthChanges(): void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    runInAction(() => {
      this.session = session;
      this.user = session ? this.mapSupabaseUser(session.user) : null;
    });
  });
  this.authSubscription = data.subscription;
}

dispose(): void {
  if (this.authSubscription) {
    this.authSubscription.unsubscribe();
  }
}
```

---

## UIStore

**File**: `frontend/src/stores/UIStore.ts` (282 lines)

UI layout state with localStorage persistence and theme management.

**Observable Properties**:

```tsx
class UIStore {
  // Layout
  sidebarCollapsed = false;
  sidebarWidth = 260; // Resizable (clamped 220-400px)
  marginPanelWidth = 200; // Annotations panel (clamped 150-350px)

  // Theme
  theme: Theme = 'system'; // 'light' | 'dark' | 'system'
  hydrated = false; // SSR-safe hydration flag

  // Modals & Overlays
  commandPaletteOpen = false;
  searchModalOpen = false;
  modals: Map<string, ModalState> = new Map();
  toasts: Toast[] = []; // Max 5 visible

  // Computed
  get activeToasts(): Toast[];
  get resolvedTheme(): 'light' | 'dark';
  get hasOpenModal(): boolean;
}
```

**Actions - Layout**:

```tsx
toggleSidebar(): void;
setSidebarCollapsed(collapsed: boolean): void;
setSidebarWidth(width: number): void;     // Clamped 220-400px
setMarginPanelWidth(width: number): void; // Clamped 150-350px
```

**Actions - Theme**:

```tsx
setTheme(theme: Theme): void;
// Reactions automatically: persist to localStorage, update DOM classList, trigger re-render
```

**Actions - Modals**:

```tsx
openModal(id: string, data?: unknown): void;
closeModal(id: string): void;
getModalState(id: string): ModalState | undefined;
isModalOpen(id: string): boolean;
closeAllModals(): void;
```

**Actions - Toasts**:

```tsx
showToast(toast: Omit<Toast, 'id'>): string;
dismissToast(id: string): void;
success(title: string, description?: string): string;
error(title: string, description?: string): string;  // Auto-dismiss 8s
warning(title: string, description?: string): string;
info(title: string, description?: string): string;
clearAllToasts(): void;
```

Uses MobX reactions to persist sidebar/theme to localStorage and sync resolvedTheme to DOM classList. Disposers cleaned up in dispose().

---

## WorkspaceStore

**File**: `frontend/src/stores/WorkspaceStore.ts` (200+ lines)

Current workspace and members state.

**Observable Properties**:

```tsx
class WorkspaceStore {
  workspaces: Map<string, Workspace> = new Map();
  currentWorkspaceId: string | null = null;
  members: Map<string, WorkspaceMember[]> = new Map();
  isLoading = false;
  isSaving = false;
  error: string | null = null;

  get currentWorkspace(): Workspace | null;
  get workspaceList(): Workspace[]; // Sorted by name
  get currentMembers(): WorkspaceMember[];
  get memberCount(): number;
  get currentUserRole(): WorkspaceRole | null; // From AuthStore + members
  get isAdmin(): boolean; // role === 'admin' || 'owner'
  get isOwner(): boolean;
}
```

**Actions**:

```tsx
// CRUD
async loadWorkspaces(): Promise<void>;
async createWorkspace(data: CreateWorkspaceData): Promise<Workspace>;
async updateWorkspace(id: string, data: UpdateWorkspaceData): Promise<Workspace>;
async deleteWorkspace(id: string): Promise<void>;

// Members
async loadMembers(workspaceId: string): Promise<void>;
async inviteMember(workspaceId: string, data: InviteMemberData): Promise<WorkspaceMember>;
async removeMember(workspaceId: string, memberId: string): Promise<void>;
async updateMemberRole(workspaceId: string, memberId: string, role: WorkspaceRole): Promise<void>;

// Selection
setCurrentWorkspace(id: string): void;

// Lifecycle
reset(): void;
```

Cross-store: `setAuthStore()` wires AuthStore for `currentUserRole` computed.

---

## NoteStore

**File**: `frontend/src/stores/features/notes/NoteStore.ts` (300+ lines)

Note editor state with auto-save and dirty tracking (NOT server data).

**Observable Properties**:

```tsx
class NoteStore {
  notes: Map<string, Note> = new Map(); // Cache only (primary in TanStack Query)
  currentNoteId: string | null = null;
  isLoading = false;
  isSaving = false;
  error: string | null = null;

  // Auto-save tracking
  lastSavedAt: Date | null = null;
  private _originalContent: string | null = null;

  // Editor state
  ghostTextSuggestion: GhostTextSuggestion | null = null;
  isGhostTextLoading = false;

  // Annotations (per note)
  annotationsMap: Map<string, NoteAnnotation[]> = new Map();
  selectedAnnotationId: string | null = null;

  // Filters
  pinnedOnly = false;
  searchQuery = '';

  // Computed
  get currentNote(): Note | null;
  get notesList(): Note[];
  get filteredNotes(): Note[];
  get hasUnsavedChanges(): boolean;
}
```

Auto-save uses MobX reaction with 2s debounce on `currentNote?.content` changes. Tracks dirty state via `hasUnsavedChanges` computed comparing current vs `_originalContent`.

**Actions**:

```tsx
setCurrentNote(id: string): void;
async loadNote(id: string): Promise<void>;
async loadNotes(): Promise<void>;
private async saveCurrentNote(): Promise<void>;
setSearchQuery(query: string): void;
setPinnedOnly(pinned: boolean): void;

// Annotations
addAnnotation(noteId: string, annotation: NoteAnnotation): void;
updateAnnotation(noteId: string, annotationId: string, updates: Partial<NoteAnnotation>): void;
removeAnnotation(noteId: string, annotationId: string): void;
selectAnnotation(id: string | null): void;

reset(): void;
```

---

## IssueStore

**File**: `frontend/src/stores/features/issues/IssueStore.ts` (250+ lines)

Issue filtering, sorting, and AI suggestions (NOT server data).

**Observable Properties**:

```tsx
class IssueStore {
  issues: Map<string, Issue> = new Map(); // Cache only
  currentIssueId: string | null = null;
  isLoading = false;
  isSaving = false;
  error: string | null = null;

  // AI Context
  aiContext: AIContext | null = null;
  isLoadingAIContext = false;

  // AI Enhancement suggestions
  enhancementSuggestion: EnhancementSuggestion | null = null;
  isLoadingEnhancement = false;
  duplicateCheckResult: DuplicateCheckResult | null = null;
  isCheckingDuplicates = false;
  assigneeRecommendations: AssigneeRecommendation[] = [];

  // Filters & Sorting
  filters: IssueFilters = {};
  groupBy: GroupBy = 'state';
  sortBy: SortBy = 'updated';
  sortOrder: SortOrder = 'desc';
  searchQuery = '';
  viewMode: 'board' | 'list' | 'table' = 'board';

  // Per-field save status for inline editing
  saveStatus: Map<string, 'idle' | 'saving' | 'saved' | 'error'> = new Map();
}
```

AI suggestion types: `EnhancementSuggestion`, `DuplicateCandidate`, `AssigneeRecommendation` (see types file for interfaces).

**Actions**:

```tsx
// Selection & Fetching
setCurrentIssue(id: string): void;
async loadIssues(filters?: IssueFilters): Promise<void>;
async loadIssueDetail(id: string): Promise<void>;

// Filtering & Sorting
setFilter(key: keyof IssueFilters, value: any): void;
setGroupBy(groupBy: GroupBy): void;
setSortBy(sortBy: SortBy, order?: SortOrder): void;
setSearchQuery(query: string): void;
setViewMode(mode: 'board' | 'list' | 'table'): void;

// AI Enhancement
async loadAIContext(issueId: string): Promise<void>;
async enhanceIssue(issueId: string, title: string, description?: string): Promise<void>;
async checkDuplicates(issueId: string): Promise<void>;
async getAssigneeRecommendations(issueId: string): Promise<void>;

// Inline editing with per-field status
async updateIssueField(issueId: string, field: string, value: any): Promise<void>;

reset(): void;
```

---

## CycleStore

**File**: `frontend/src/stores/features/cycles/CycleStore.ts` (300+ lines)

Sprint/cycle management with burndown and velocity tracking.

**Observable Properties**:

```tsx
class CycleStore {
  cycles: Map<string, Cycle> = new Map();
  currentCycleId: string | null = null;
  cycleIssues: Map<string, CycleIssue> = new Map();

  // Chart data
  burndownData: BurndownChartData | null = null;
  velocityData: VelocityChartData | null = null;

  // Loading states
  isLoading = false;
  isSaving = false;
  isLoadingIssues = false;
  isLoadingBurndown = false;
  isLoadingVelocity = false;
  error: string | null = null;

  // Filters & Pagination
  filters: CycleFilters = {};
  sortBy: SortBy = 'sequence';
  sortOrder: SortOrder = 'desc';
  currentProjectId: string | null = null;
  currentWorkspaceId: string | null = null;
  nextCursor: string | null = null;
  hasMore = false;

  // Computed
  get activeCycle(): Cycle | null;
  get cycleList(): Cycle[];
  get filteredCycles(): Cycle[];
}
```

**Actions**:

```tsx
// CRUD
async loadCycles(workspaceId: string, projectId: string): Promise<void>;
async createCycle(data: CreateCycleData): Promise<Cycle>;
async updateCycle(id: string, data: UpdateCycleData): Promise<Cycle>;
async deleteCycle(id: string): Promise<void>;
async rolloverCycle(cycleId: string, data: RolloverCycleData): Promise<RolloverCycleResult>;

// Selection
setCurrentCycle(id: string | null): void;

// Issues
async loadCycleIssues(cycleId: string): Promise<void>;
async assignIssueToCycle(issueId: string, cycleId: string): Promise<void>;
async removeIssueFromCycle(issueId: string): Promise<void>;

// Metrics
async loadBurndown(cycleId: string): Promise<void>;
async loadVelocity(projectId: string): Promise<void>;

// Filters
setFilter(key: keyof CycleFilters, value: any): void;
setSortBy(sortBy: SortBy, order?: SortOrder): void;

reset(): void;
```

---

## NotificationStore

**File**: `frontend/src/stores/NotificationStore.ts` (78 lines)

Simple notification inbox (independent of toast notifications).

```tsx
class NotificationStore {
  notifications: Notification[] = [];

  get unreadCount(): number;
  get unreadNotifications(): Notification[];
  get sortedNotifications(): Notification[];

  addNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'read'>): void;
  markAsRead(id: string): void;
  markAllAsRead(): void;
  removeNotification(id: string): void;
  clearAll(): void;
}
```

---

## Related Documentation

- **Parent Store Architecture**: [`../CLAUDE.md`](../CLAUDE.md)
- **AI Stores**: [`../ai/CLAUDE.md`](../ai/CLAUDE.md)
- **MobX Patterns**: `docs/dev-pattern/21c-frontend-mobx-state.md`
- **Design Decisions**: DD-065 (state split), DD-013 (Note-First)
