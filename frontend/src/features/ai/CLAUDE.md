# Frontend AI Module - PilotSpace Conversational Interface

_For project overview and frontend architecture, see main CLAUDE.md and `frontend/CLAUDE.md`_

## Overview

The `frontend/src/features/ai` module implements the complete conversational AI interface for PilotSpace. It provides a unified chat experience with skill invocation, task tracking, human-in-the-loop approvals, and context-aware execution.

**Module Purpose**: Deliver the end-user AI conversation interface, integrating PilotSpaceAgent orchestrator with MobX state management, SSE streaming, and approval workflows (DD-003, DD-066, DD-086).

**Layer**: Feature module (integrates Application layer services with UI presentation)

**Architecture Reference**:
- `docs/architect/pilotspace-agent-architecture.md`
- `docs/DESIGN_DECISIONS.md` (DD-003, DD-066, DD-086, DD-087, DD-088)

---

## Module Architecture

### Directory Structure

```
frontend/src/features/ai/
├── ChatView/                          # Main conversational interface (25+ components)
│   ├── ChatView.tsx                   # Top-level container, store integration
│   ├── ChatHeader.tsx                 # Title, status indicators
│   ├── ChatInput/                     # Message input and skill/agent selection
│   ├── MessageList/                   # Conversation display (virtualized)
│   ├── TaskPanel/                     # Long-running task tracking
│   ├── ApprovalOverlay/               # Human-in-the-loop approval UI (DD-003)
│   ├── SessionList/                   # Session management UI
│   └── __tests__/                     # ChatView component tests
├── components/                        # Sub-components (15+ files)
│   ├── UserMessage.tsx
│   ├── AssistantMessage.tsx
│   ├── StreamingContent.tsx           # Animated streaming indicator
│   ├── ThinkingBlock.tsx              # Extended thinking display
│   ├── ToolCallList.tsx               # Tool invocation details
│   ├── MarkdownContent.tsx            # Markdown rendering
│   └── __tests__/                     # Component tests
├── hooks/                             # AI-specific hooks
│   ├── useSkills.ts                   # Fetch available skills
│   └── index.ts
└── types/                             # TypeScript type definitions
    ├── conversation.ts                # ChatMessage, ToolCall types
    ├── events.ts                      # SSE event types
    └── skills.ts                      # Skill definitions
```

### Store Integration

The `ai` module depends on MobX stores in `frontend/src/stores/ai/`:

```
PilotSpaceStore (unified AI orchestrator)
├── messages: ChatMessage[]
├── tasks: Map<string, TaskState>
├── pendingApprovals: ApprovalRequest[]
├── noteContext, issueContext, projectContext
└── Actions: sendMessage(), approveAction(), setActiveSkill()
```

---

## Key Features

### 1. Conversational Interface (ChatView)

**Component Tree**:
```
ChatView (observer, store integration)
├── ChatHeader (title, status)
├── MessageList (virtualized, 1000+ messages)
│   ├── MessageGroup (role-based grouping)
│   └── Message types (User, Assistant, Tool, etc.)
├── TaskPanel (collapsible task tracker)
├── StreamingBanner (phase indicator)
├── ApprovalOverlay (destructive action approval)
└── ChatInput (message + menus)
```

**State Integration** (via PilotSpaceStore observer):
- **Streaming**: `store.isStreaming`, `store.streamContent`
- **Messages**: `store.messages` (ChatMessage[])
- **Tasks**: `store.tasks` (Map<string, TaskState>)
- **Approvals**: `store.pendingApprovals` (ApprovalRequest[])
- **Context**: `store.noteContext`, `store.issueContext`, `store.projectContext`

### 2. SSE Streaming & Real-Time Events (DD-066)

**Event Types** (17 total):

| Event | Purpose | UI Effect |
|-------|---------|-----------|
| `message_start` | Begin assistant message | Show streaming indicator |
| `text_delta` | Stream text chunk | Append text, animate cursor |
| `tool_use` | Record tool invocation | Add tool card |
| `tool_result` | Store tool output | Update tool card |
| `task_progress` | Update task status | TaskPanel refresh |
| `approval_request` | Queue approval (DD-003) | Show modal/card |
| `message_stop` | Finalize message | Clear streaming state |

### 3. Skill & Agent Invocation (DD-087, DD-088)

**Skills** (Single-turn, slash commands):
- Defined in `.claude/skills/` (backend)
- Discovered via `useSkills()` hook
- Invoked via slash commands: `/extract-issues`, `/enhance-issue`

**Agents** (Multi-turn, @mentions):
- Subagents: `@pr-review`, `@ai-context`, `@doc-generator`

### 4. Human-in-the-Loop Approvals (DD-003)

**Categories**:

| Category | Examples | Approval Required |
|----------|----------|-------------------|
| **Non-destructive** | Add label, assign | No (auto-execute) |
| **Content creation** | Create issue, post comment | **Yes** (configurable) |
| **Destructive** | Delete issue, merge PR | **Always** (non-dismissable) |

**UI Separation**:
- Destructive → ApprovalOverlay (modal)
- Non-destructive → SuggestionCard (inline)

### 5. Task Tracking & Progress

**Task States**:
```typescript
interface TaskState {
  id: string;
  subject: string;              // 'Analyzing code'
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;             // 0-100
  description?: string;
  currentStep?: string;         // 'Step 2 of 5'
  estimatedSecondsRemaining?: number;
}
```

---

## Store Interface (PilotSpaceStore)

### Observable State

```typescript
class PilotSpaceStore {
  messages: ChatMessage[] = [];
  streamingState: StreamingState = {...};
  sessionId: string | null = null;
  tasks = new Map<string, TaskState>();
  pendingApprovals: ApprovalRequest[] = [];
  noteContext: NoteContext | null = null;
  issueContext: IssueContext | null = null;
  projectContext: ProjectContext | null = null;
}
```

### Actions

```typescript
sendMessage(content: string): Promise<void>
abort(): void
approveAction(id: string, modifications?: Record): Promise<void>
rejectAction(id: string, reason: string): Promise<void>
setNoteContext(ctx: NoteContext | null): void
```

### Computed

```typescript
@computed get isStreaming(): boolean
@computed get activeTasks(): TaskState[]
@computed get completedTasks(): TaskState[]
@computed get hasUnresolvedApprovals(): boolean
```

---

## Component Reference

### Top-Level Components

**ChatView** (`ChatView.tsx`):
- Main container, orchestrates layout
- Auto-resume sessions on context change
- Separate approvals into inline vs modal
- Handle message submit, abort

**MessageList** (`MessageList/MessageList.tsx`):
- Virtualized conversation display (Virtuoso)
- Scroll-to-bottom button
- Infinite scroll loading
- Message grouping by role

**ChatInput** (`ChatInput/ChatInput.tsx`):
- Auto-resizing textarea
- Slash command detection
- @mention detection
- Token budget indicator

**TaskPanel** (`TaskPanel/TaskPanel.tsx`):
- Collapsible panel tracking tasks
- Progress percentage display
- Tab view: active/completed

**ApprovalOverlay** (`ApprovalOverlay/ApprovalOverlay.tsx`):
- Floating badge + queue manager
- Destructive action approval (DD-003)
- Queue navigation + countdown timer

---

## API Integration

### Backend Endpoints

**Chat Streaming** (DD-066):
```
POST /api/v1/ai/chat
Body: {
  "message": "string",
  "context": { "note_id", "issue_id", "project_id" },
  "session_id": "string | null"
}

Response: SSE stream (17+ event types)
```

### SSE Client

**Custom SSEClient** (`frontend/src/lib/sse-client.ts`):
- Supports POST method (EventSource is GET-only)
- Auth headers (JWT from Supabase)
- Automatic reconnection (3 retries)

---

## Quality Gates & Testing

### Test Commands

```bash
pnpm test -- frontend/src/features/ai
pnpm test -- --watch frontend/src/features/ai
pnpm test -- --coverage frontend/src/features/ai
```

### Test Scenarios

- [ ] Send message and receive response
- [ ] Streaming content updates in real-time
- [ ] Slash command triggers SkillMenu
- [ ] @mention triggers AgentMenu
- [ ] Task added → auto-opens panel
- [ ] Non-destructive approval shows inline
- [ ] Destructive approval shows modal
- [ ] Context badges appear/disappear
- [ ] Auto-resume on context change
- [ ] Network error → error message displayed
- [ ] Abort button stops streaming

### Pre-Submission Checklist

**State Management**:
- [ ] MobX `observer()` wrapper on all store-reading components
- [ ] No API data stored in MobX
- [ ] Approval flow properly separated

**Streaming**:
- [ ] SSE event handlers tested
- [ ] Streaming state cleared on abort
- [ ] Error messages displayed

**Performance**:
- [ ] MessageList virtualized for 1000+ messages
- [ ] No N+1 skill fetches
- [ ] Debounced input for menus

**Accessibility** (WCAG 2.2 AA):
- [ ] Keyboard navigation: Tab, Enter, Escape
- [ ] ARIA labels on buttons
- [ ] Focus management in modals
- [ ] Reduced motion support

---

## Common Patterns

### Pattern 1: Observe Store & Render

```tsx
import { observer } from 'mobx-react-lite';

export const ChatMessages = observer(function ChatMessages() {
  const { pilotSpace } = useAIStore();

  return (
    <div>
      {pilotSpace.messages.map(msg => (
        <Message key={msg.id} message={msg} />
      ))}
      {pilotSpace.isStreaming && <StreamingIndicator />}
    </div>
  );
});
```

### Pattern 2: Send Message with Context

```tsx
const handleSend = async (text: string) => {
  await store.sendMessage(text);
};
```

### Pattern 3: Approval Response

```tsx
const handleApprove = async (id: string) => {
  await store.approveAction(id);
};
```

---

## Related Documentation

### Core Architecture
- `docs/architect/pilotspace-agent-architecture.md` — Agent orchestrator
- `docs/architect/frontend-architecture.md` — Frontend layer

### Design Decisions
- **DD-003**: Human-in-the-loop approval
- **DD-066**: SSE for AI streaming
- **DD-086**: Centralized agent with skills + subagents

### Patterns
- `docs/dev-pattern/45-pilot-space-patterns.md` — Project-specific overrides
- `docs/dev-pattern/21c-frontend-mobx-state.md` — MobX patterns

---

## Quick Reference

### Store Access

```typescript
import { usePilotSpaceStore } from '@/stores/ai';

export const MyComponent = observer(() => {
  const { pilotSpace } = usePilotSpaceStore();
});
```

### Common Operations

```typescript
// Send message
await store.sendMessage('Extract issues from this note');

// Set context
store.setNoteContext({ noteId, selectedText });

// Approve action
await store.approveAction('request-123');

// Abort streaming
store.abort();
```

---

## Troubleshooting

### Messages not appearing
1. Check `store.messages` in DevTools
2. Verify `message_start` SSE event received
3. Ensure `observer()` wrapper on component

### Approval modal not showing
1. Check `store.pendingApprovals`
2. Verify `approval_request` SSE event received
3. Check approval type (destructive vs non-destructive)

### Context not retained on session resume
1. Check `store.noteContext` after resume
2. Verify `SessionListStore.resumeSessionForContext()` called

### SSE connection dropping
1. Check network tab for SSE requests
2. Monitor auto-reconnect (3 retries)
3. Verify auth token in Authorization header

---

**Document Version**: 1.0
**Last Updated**: 2026-02-09
