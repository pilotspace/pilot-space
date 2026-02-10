# AI Stores Architecture

**File**: `frontend/src/stores/ai/CLAUDE.md`
**Scope**: All 11 AI-related MobX stores under AIStore hub
**Parent**: [`../CLAUDE.md`](../CLAUDE.md) (MobX Stores Architecture)

---

## Overview

All AI-related state management is centralized under `AIStore` root. These stores manage UI state for AI features only (per DD-065). Server state (messages, sessions, costs) is managed by TanStack Query.

**Store Count**: 11 stores (1 root + 10 feature stores)

---

## AIStore (Root Hub)

**File**: `AIStore.ts` (85 lines)

Container and lifecycle manager for all AI feature stores.

```tsx
export class AIStore {
  ghostText: GhostTextStore;
  aiContext: AIContextStore;
  approval: ApprovalStore;
  settings: AISettingsStore;
  prReview: PRReviewStore;
  conversation: ConversationStore; // Deprecated
  cost: CostStore;
  marginAnnotation: MarginAnnotationStore;
  pilotSpace: PilotSpaceStore; // Unified agent

  isGloballyEnabled = true; // Master switch
  globalError: string | null = null;

  constructor() {
    makeAutoObservable(this);
    this.ghostText = new GhostTextStore(this);
    this.aiContext = new AIContextStore(this);
    // ... initialize all sub-stores
  }

  async loadWorkspaceSettings(workspaceId: string): Promise<void> {
    await this.settings.loadSettings(workspaceId);
    this.ghostText.setEnabled(this.settings.ghostTextEnabled);
    this.aiContext.setEnabled(this.settings.aiContextEnabled);
  }

  abortAllStreams(): void {
    this.ghostText.abort();
    this.aiContext.abort();
    this.prReview.abort();
    this.pilotSpace.abort();
  }

  reset(): void {
    // Reset all sub-stores
  }
}
```

---

## GhostTextStore

**File**: `GhostTextStore.ts` (155 lines)

Inline text suggestions with debouncing and caching (per DD-067: Gemini Flash, <2s).

**Observable Properties**:

```tsx
class GhostTextStore {
  suggestion = ''; // Suggested text
  isLoading = false;
  isEnabled = true;
  error: string | null = null;

  private abortController: AbortController | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private cache = new Map<string, string>(); // LRU cache (max 10 items)
}
```

**Actions**:

```tsx
requestSuggestion(
  noteId: string,
  context: string,     // Last 500 chars of note
  prefix: string,      // What user just typed (last 200 chars)
  workspaceId: string
): void;

clearSuggestion(): void;
abort(): void;         // Cancel in-flight request
setEnabled(enabled: boolean): void;
```

**Pattern**: Debounced + cached with LRU eviction. GhostTextExtension triggers after 500ms pause. Cache key includes noteId + context suffix + prefix suffix. Rate limit 429 handled silently.

---

## ApprovalStore

**File**: `ApprovalStore.ts` (150+ lines)

Human-in-the-loop approval workflow (DD-003).

**Observable Properties**:

```tsx
class ApprovalStore {
  requests: ApprovalRequest[] = [];
  pendingCount = 0;
  isLoading = false;
  error: string | null = null;
  selectedRequest: ApprovalRequest | null = null;
  filter: 'pending' | 'approved' | 'rejected' | 'expired' | undefined = 'pending';

  // Computed
  get groupedByAgent(): Record<string, ApprovalRequest[]>;
}
```

**Actions**:

```tsx
async loadPending(): Promise<void>;
async loadAll(status?: ApprovalStatus): Promise<void>;
async approveRequest(requestId: string): Promise<void>;
async rejectRequest(requestId: string, reason?: string): Promise<void>;
selectRequest(request: ApprovalRequest | null): void;
setFilter(filter: ApprovalFilter): void;
```

---

## AIContextStore

**File**: `AIContextStore.ts` (200+ lines)

Issue context aggregation with SSE streaming and structured sections.

**Observable Properties**:

```tsx
class AIContextStore {
  isLoading = false;
  isEnabled = true;
  error: string | null = null;
  currentIssueId: string | null = null;
  phases: AIContextPhase[] = []; // Legacy
  result: AIContextResult | null = null;
  sectionErrors: Map<string, string> = new Map();

  private client: SSEClient | null = null;
  private cache = new Map<string, AIContextResult>(); // Max 20 items
}
```

**Result Structure**:

```tsx
export interface AIContextResult {
  summary: ContextSummary | null; // Issue title + description
  relatedIssues: ContextRelatedIssue[]; // Blocking/blocked_by/relates
  relatedDocs: ContextRelatedDoc[]; // API docs, ADRs
  tasks: ContextTask[]; // Subtasks with estimates
  prompts: ContextPrompt[]; // Claude Code prompts
}
```

**Actions**:

```tsx
async generateContext(issueId: string): Promise<void>;
  // Stream SSE from /api/v1/ai/context/{issueId}
  // Populate sections as they arrive

abort(): void;
setEnabled(enabled: boolean): void;
getContextForIssue(issueId: string): AIContextResult | null;  // Cached
```

---

## PilotSpaceStore (Unified Agent)

**File**: `PilotSpaceStore.ts` (581 lines)

Central orchestration for all user-facing AI conversations per DD-086. This is the largest and most critical AI store.

### Observable Properties

**Messages & Streaming**:

```tsx
messages: ChatMessage[] = []; // Full conversation history
streamingState: StreamingState = {
  isStreaming: false,
  streamContent: '', // Accumulated text delta
  currentMessageId: null,
  thinkingContent: '',
  isThinking: false,
  thinkingStartedAt: null,
  activeToolName: null,
  interrupted: false,
  wordCount: 0,
};
```

**Session Management**:

```tsx
sessionId: string | null = null;
sessionState: SessionState = {
  sessionId: null,
  isActive: false,
  createdAt: null,
  lastActivityAt: null,
};
forkSessionId: string | null = null; // For "what-if" branches
```

**Message Pagination (Scroll-Up Loading)**:

```tsx
totalMessages: number = 0;
hasMoreMessages: boolean = false;
isLoadingMoreMessages: boolean = false;
```

**Tasks & Approvals**:

```tsx
tasks = new Map<string, TaskState>();
pendingApprovals: ApprovalRequest[] = [];
pendingContentUpdates: ContentUpdateEvent['data'][] = [];
```

**Context**:

```tsx
noteContext: NoteContext | null = null; // Selected text/blocks
issueContext: IssueContext | null = null;
projectContext: { projectId: string; name?: string; slug?: string } | null = null;
workspaceId: string | null = null;
```

**Pending Operations**:

```tsx
activeSkill: { name: string; args?: string } | null = null;
mentionedAgents: string[] = [];
pendingAIBlockIds: string[] = [];
pendingNoteEndScroll = false;
```

**Skill Registry & Error**:

```tsx
skills: SkillDefinition[] = [];
error: string | null = null;
```

**Delegates**:

```tsx
private readonly streamHandler: PilotSpaceStreamHandler;
private readonly actions: PilotSpaceActions;
```

**Computed**:

```tsx
get isStreaming(): boolean;
get streamContent(): string;
get pendingToolCalls(): ToolCall[];
get hasUnresolvedApprovals(): boolean;
get activeTasks(): TaskState[]; // filter status === 'pending' || 'in_progress'
get completedTasks(): TaskState[]; // filter status === 'completed'
get conversationContext(): ConversationContext | null; // Composite context
get tokenBudgetPercent(): number; // (sessionState.totalTokens / 8000) * 100
```

### Type Interfaces

**TaskState**: `{ id, subject, status: 'pending' | 'in_progress' | 'completed' | 'failed', progress: 0-100%, description?, currentStep?, totalSteps?, estimatedSecondsRemaining?, agentName?, model?, createdAt, updatedAt }`

**ApprovalRequest**: `{ requestId, actionType, description, consequences?, affectedEntities: [{type, id, name, preview?}], urgency: 'low'|'medium'|'high', proposedContent?, expiresAt, confidenceTag?, createdAt }`

### Actions

**Message Management**:

```tsx
addMessage(message: ChatMessage): void;
prependMessages(messages: ChatMessage[]): void;  // Scroll-up loading
setMessagePaginationState(hasMore: boolean, total: number): void;
setIsLoadingMoreMessages(loading: boolean): void;
updateStreamingState(state: Partial<StreamingState>): void;
```

**Task Management**:

```tsx
addTask(taskId: string, update: Partial<Omit<TaskState, 'id'>>): void;
updateTaskStatus(taskId: string, status: TaskStatus): void;
removeTask(taskId: string): void;
```

**Approval Management**:

```tsx
addApproval(request: ApprovalRequest): void;
async approveRequest(requestId: string): Promise<void>;
async rejectRequest(requestId: string, reason?: string): Promise<void>;
async approveAction(id: string, modifications?: Record<string, unknown>): Promise<void>;
async rejectAction(id: string, reason: string): Promise<void>;
```

**Context Management**:

```tsx
setWorkspaceId(workspaceId: string | null): void;
setNoteContext(context: NoteContext | null): void;
setIssueContext(context: IssueContext | null): void;
setProjectContext(context: { projectId: string; name?: string; slug?: string } | null): void;
clearContext(): void;
setActiveSkill(skill: string, args?: string): void;
addMentionedAgent(agent: string): void;
```

**Delegated to PilotSpaceActions**:

```tsx
async sendMessage(content: string, metadata?: Partial<MessageMetadata>): Promise<void>;
  // Handles: session resumption, skill activation, context injection, token budget tracking (8K limit)

async submitQuestionAnswer(questionId: string, answer: string): Promise<void>;
abort(): void;
clearConversation(): void;
reset(): void; // Full reset (logout/workspace change)
```

### Buffering Patterns

**Tool Calls & Citations**: Events may arrive before `message_stop`. Store in `_pendingToolCalls[]` and `_pendingCitations[]`, then consume on `message_stop`.

**Content Updates**: Buffer up to 100 updates in `pendingContentUpdates[]`. FIFO overflow. Consume by noteId via `consumeContentUpdate(noteId)`.

---

## MarginAnnotationStore

**File**: `MarginAnnotationStore.ts`

Margin annotations (inline AI suggestions) per block.

```tsx
class MarginAnnotationStore {
  annotations: Map<string, NoteAnnotation[]> = new Map(); // noteId -> annotations
  isLoading = false;
  isEnabled = true;
  error: string | null = null;

  async generateAnnotations(noteId: string, content: string): Promise<void>;
  acceptAnnotation(noteId: string, annotationId: string): void;
  rejectAnnotation(noteId: string, annotationId: string): void;
  clearAnnotations(noteId: string): void;
}
```

---

## CostStore

**File**: `CostStore.ts`

Token usage and cost tracking.

```tsx
class CostStore {
  costs: AICost[] = [];
  isLoading = false;

  async loadCosts(workspaceId: string, dateRange: DateRange): Promise<void>;
  getCostByAgent(): Record<string, number>;
  getCostTrend(days: number): CostTrendData[];
  getTotalCost(dateRange?: DateRange): number;
}
```

---

## Other AI Stores

### AISettingsStore

**File**: `AISettingsStore.ts`

Workspace AI feature flags and provider configuration.

```tsx
class AISettingsStore {
  ghostTextEnabled = true;
  aiContextEnabled = true;
  prReviewEnabled = true;
  annotationsEnabled = true;
  isLoading = false;

  async loadSettings(workspaceId: string): Promise<void>;
  async updateSetting(key: string, value: boolean): Promise<void>;
}
```

### PRReviewStore

**File**: `PRReviewStore.ts`

PR review state (legacy, being migrated to PilotSpaceStore subagent model).

```tsx
class PRReviewStore {
  reviews: Map<string, PRReview> = new Map();
  isLoading = false;
  error: string | null = null;

  async requestReview(prId: string): Promise<void>;
  abort(): void;
}
```

### ConversationStore

**File**: `ConversationStore.ts` (Deprecated)

Legacy conversation store. Replaced by PilotSpaceStore. Kept for backward compatibility during migration.

---

## File Organization

```
frontend/src/stores/ai/
├── AIStore.ts                       # Root AI store (hub + lifecycle)
├── PilotSpaceStore.ts               # Unified agent orchestration (581 lines)
├── GhostTextStore.ts                # Inline suggestions (155 lines)
├── AIContextStore.ts                # Issue context aggregation (200+ lines)
├── ApprovalStore.ts                 # Human-in-the-loop approvals (150+ lines)
├── AISettingsStore.ts               # Feature flags
├── PRReviewStore.ts                 # PR review (legacy)
├── MarginAnnotationStore.ts         # Margin annotations
├── CostStore.ts                     # Cost tracking
├── ConversationStore.ts             # Legacy (deprecated)
├── SessionListStore.ts              # Session list
├── PilotSpaceStreamHandler.ts       # SSE stream handling
├── PilotSpaceActions.ts             # Async actions
├── PilotSpaceSSEParser.ts           # Event parsing
├── PilotSpaceToolCallHandler.ts     # Tool call processing
├── PilotSpaceApprovals.ts           # Approval delegation
├── types/
│   ├── conversation.ts              # ChatMessage, ToolCall, etc.
│   ├── events.ts                    # SSE event types
│   ├── skills.ts                    # Skill definitions
│   └── index.ts
├── __tests__/
│   └── *.test.ts                    # AI store tests
├── PILOTSPACE_STORE_USAGE.md        # Usage guide
├── CLAUDE.md                        # This file
└── index.ts
```

---

## Related Documentation

- **Parent Store Architecture**: [`../CLAUDE.md`](../CLAUDE.md)
- **AI Feature Module**: [`../../features/ai/CLAUDE.md`](../../features/ai/CLAUDE.md)
- **MobX Patterns**: `docs/dev-pattern/21c-frontend-mobx-state.md`
- **Agent Architecture**: `docs/architect/pilotspace-agent-architecture.md`
- **Design Decisions**: DD-003 (approvals), DD-065 (state split), DD-086 (centralized agent)
