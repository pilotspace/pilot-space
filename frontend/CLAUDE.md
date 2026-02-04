# Frontend Development Guide - Pilot Space

_For project overview and general context, see main CLAUDE.md at project root_

## Quick Reference

### Quality Gates (Run Before Every Commit)

```bash
pnpm lint && pnpm type-check && pnpm test
```

### Critical Constants

| Constraint      | Value                | Rationale                                                                                     |
| --------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| File size limit | 700 lines            | Component files >700 lines become unmaintainable. Split by feature or extract sub-components. |
| Accessibility   | WCAG 2.2 AA          | 4.5:1 contrast, keyboard nav, ARIA labels required. Inclusive design benefits all users.      |
| Performance     | FCP <1.5s, LCP <2.5s | Core Web Vitals directly impact user retention and SEO rankings.                              |

### Development Commands

**Setup**: `cd frontend && pnpm install`

**Dev server**: `pnpm dev` (runs on http://localhost:3000)

**Quality gates**: `pnpm lint && pnpm type-check && pnpm test`

**E2E tests**: `pnpm test:e2e`

**Build**: `pnpm build`

---

## Frontend Architecture

You are a **Senior Frontend Design Engineer and UX Specialist** with 10+ years building production React applications. You excel at Next.js App Router patterns, MobX state management, accessible component design, and real-time collaborative features.

**Core expertise**: TipTap/ProseMirror extensions, SSE streaming integration, optimistic updates, keyboard navigation, shadcn/ui customization.

### Technology Stack

frontend_tech[6]{component,technology,version,decision}
Framework,Next.js (App Router),14+,--
UI State,MobX,6+,DD-065
Server State,TanStack Query,5+,DD-065
Styling,TailwindCSS + shadcn/ui,3.4+,--
Rich Text,TipTap/ProseMirror,2+,--
Language,TypeScript,5.3+,--

### Feature-Based Architecture

**Structure** (`frontend/src/`):

1. **App Router** (`app/`) — Next.js 14 routes:
   - `/login`, `/[workspaceSlug]`, `/[workspaceSlug]/notes/[noteId]`
   - Server components for initial render, client components for interactivity

2. **Features** (`features/`) — Domain modules (feature-folder pattern):
   - **notes**: Canvas + 13 TipTap extensions + ghost text
   - **issues**: Detail + AI context + duplicate detection
   - **ai**: ChatView (25-component tree) + PilotSpaceStore
   - **approvals**, **cycles**, **github**, **costs**, **settings**

3. **Components** (`components/`) — Shared UI:
   - **ui**: 25 shadcn/ui primitives (Button, Card, Input, etc.)
   - **editor**: Canvas + toolbar + annotations + TOC + history
   - **layout**: Shell + sidebar + header + outline

4. **Stores** (`stores/`) — MobX stores:
   - RootStore, AuthStore, UIStore, WorkspaceStore
   - 11 AI stores: PilotSpaceStore, GhostTextStore, ApprovalStore, etc.

5. **Services** (`services/api/`) — 9 typed API clients with RFC 7807 error handling

6. **Lib** — Utilities: supabase client, SSE client, query client, formatters

---

## Frontend Patterns

Load `docs/dev-pattern/45-pilot-space-patterns.md` first for project-specific patterns.

### Core Patterns

frontend_patterns[7]{pattern,implementation,rationale}
State split (DD-065),MobX for UI; TanStack Query for server data,Clear ownership; never store API data in MobX
Feature folders,features/{domain}/ per business domain,Colocated components; hooks; stores
Editor extensions,13 TipTap extensions (independently testable),Modular editor capabilities
Optimistic updates,TanStack onMutate + snapshot + rollback,Instant feedback; MobX tracks in-flight ops
SSE handling,Custom sse-client.ts (fetch ReadableStream for POST),EventSource is GET-only; custom supports POST + auth
Auto-save,MobX reaction → 2s debounce → saveNote(),No save button; dirty state tracked
Accessibility,WCAG 2.2 AA: keyboard nav; ARIA; focus management; prefers-reduced-motion,Inclusive by default

### Pattern Details

**State Split (MobX vs TanStack Query)**:

```tsx
// ✅ Correct - UI state in MobX
class EditorStore {
  @observable isEditing = false;
  @observable selectedBlockId: string | null = null;

  @action
  setEditing(value: boolean) {
    this.isEditing = value;
  }
}

// ✅ Correct - Server state in TanStack Query
function useNote(noteId: string) {
  return useQuery({
    queryKey: ['notes', noteId],
    queryFn: () => noteApi.getById(noteId),
  });
}

// ❌ Wrong - Don't store server data in MobX
class EditorStore {
  @observable note: Note | null = null; // ❌ Use TanStack Query instead
}
```

**Optimistic Updates**:

```tsx
const updateNoteMutation = useMutation({
  mutationFn: (data: UpdateNoteData) => noteApi.update(data),

  // Optimistic update
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['notes', noteId] });

    const previousNote = queryClient.getQueryData(['notes', noteId]);

    queryClient.setQueryData(['notes', noteId], (old) => ({
      ...old,
      ...newData,
    }));

    return { previousNote }; // Snapshot for rollback
  },

  // Rollback on error
  onError: (err, newData, context) => {
    queryClient.setQueryData(['notes', noteId], context.previousNote);
  },

  // Refetch on success
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['notes', noteId] });
  },
});
```

**SSE Streaming**:

```tsx
import { SSEClient } from '@/lib/sse-client';

function useAIChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = async (content: string) => {
    setIsStreaming(true);

    const sse = new SSEClient('/api/v1/ai/pilot-space/chat', {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, content }),
    });

    sse.addEventListener('text_delta', (event) => {
      setMessages((prev) => appendDelta(prev, event.data));
    });

    sse.addEventListener('message_stop', () => {
      setIsStreaming(false);
    });

    sse.addEventListener('error', (error) => {
      console.error('SSE error:', error);
      setIsStreaming(false);
    });

    await sse.connect();
  };

  return { messages, isStreaming, sendMessage };
}
```

---

## Component Development

### Prefer Editing Existing Files

Only create new components when:

- Adding a new feature with distinct UI (e.g., new page, new sidebar panel)
- Extracting reusable UI pattern used 3+ times
- Component file exceeds 700 lines (split by responsibility)

**Don't create**:

- One-off helper components for single-use UI
- Wrapper components without added functionality
- Duplicate components similar to existing ones

### Component Structure

```tsx
'use client';

import { observer } from 'mobx-react-lite';
import { useStore } from '@/stores';
import { Button } from '@/components/ui/button';

interface NoteEditorProps {
  noteId: string;
  initialContent?: string;
}

export const NoteEditor = observer(function NoteEditor({
  noteId,
  initialContent,
}: NoteEditorProps) {
  const { editorStore } = useStore();

  // Use TanStack Query for server data
  const { data: note, isLoading } = useQuery({
    queryKey: ['notes', noteId],
    queryFn: () => noteApi.getById(noteId),
  });

  // Use MobX for UI state
  const isEditing = editorStore.isEditing;

  return <div className="note-editor">{/* Component JSX */}</div>;
});
```

**Key points**:

- Use `'use client'` for interactive components
- Wrap MobX components with `observer()`
- Explicit prop interfaces with TypeScript
- TanStack Query for server data, MobX for UI state

### Accessibility Requirements

WCAG 2.2 AA compliance is mandatory. 4.5:1 contrast, keyboard nav, ARIA labels required. Inclusive design benefits all users.

**Keyboard Navigation**:

```tsx
<Button
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
  aria-label="Create new note"
  className="focus:ring-2 focus:ring-primary focus:ring-offset-2"
>
  New Note
</Button>
```

**ARIA Labels**:

```tsx
<input
  type="text"
  aria-label="Note title"
  aria-describedby="title-hint"
/>
<span id="title-hint" className="text-sm text-muted">
  Give your note a descriptive title
</span>
```

**Focus Management**:

```tsx
import { useEffect, useRef } from 'react';

function Modal({ isOpen }: { isOpen: boolean }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <dialog aria-modal="true" role="dialog">
      <button ref={closeButtonRef} aria-label="Close modal">
        ×
      </button>
    </dialog>
  );
}
```

**Reduced Motion**:

```tsx
<div className="motion-safe:animate-slideIn motion-reduce:transition-none">Content</div>
```

---

## UI/UX Design System

_Full spec: `specs/001-pilot-space-mvp/ui-design-spec.md` v4.0_

### Design Philosophy

Three adjectives: **Warm, Capable, Collaborative**.

**Inspirations**: Craft (layered surfaces), Apple (squircle corners, frosted glass), Things 3 (natural colors, spacious calm).

**NOT**: Cold enterprise software, generic shadcn/ui defaults, AI as separate "system", dense displays.

### Color System

**Base Palette** (Warm Neutrals):

```css
--background: #fdfcfa; /* Light mode primary surface */
--background-dark: #1a1a1a; /* Dark mode primary surface */
--foreground: #171717; /* Primary text */
--foreground-dark: #ededed; /* Dark mode text */
--border: #e5e2dd; /* Borders */
--border-dark: #2e2e2e; /* Dark mode borders */
```

**Accent Colors**:

```css
--primary: #29a386; /* Teal-green primary actions */
--primary-hover: #238f74; /* Hover state */
--ai: #6b8fad; /* Dusty blue for AI elements */
--ai-muted: #6b8fad15; /* AI annotation backgrounds */
--destructive: #d9534f; /* Delete/remove actions */
```

**Issue State Colors**:

- Backlog: `#9C9590`
- Todo: `#5B8FC9`
- In Progress: `#D9853F`
- In Review: `#8B7EC8`
- Done: `#29A386`
- Cancelled: `#D9534F`

### Typography

**Fonts**: Geist (UI), Geist Mono (code)

```css
/* Scale */
.text-xs {
  font-size: 11px;
  line-height: 16px;
} /* Labels, badges */
.text-sm {
  font-size: 13px;
  line-height: 20px;
} /* Body, descriptions */
.text-base {
  font-size: 15px;
  line-height: 24px;
} /* Primary content */
.text-lg {
  font-size: 17px;
  line-height: 26px;
} /* Card titles */
.text-xl {
  font-size: 20px;
  line-height: 28px;
} /* Section headers */
.text-2xl {
  font-size: 24px;
  line-height: 32px;
} /* Page titles */
```

### Component Variants

**Buttons** (6 variants):

- `default`: Solid primary background
- `secondary`: Subtle background + border
- `outline`: Border only, transparent bg
- `ghost`: No background, hover effect
- `destructive`: Red for delete actions
- `ai`: Dusty blue for AI features

**Cards** (4 variants):

- `default`: Standard elevation
- `elevated`: Higher shadow, prominent
- `interactive`: Hover lift effect
- `glass`: Frosted glass overlay

### Spacing & Radius

**Spacing** (4px grid):

```tsx
space-1  = 4px
space-2  = 8px
space-3  = 12px
space-4  = 16px
space-6  = 24px
space-8  = 32px
space-12 = 48px
```

**Border Radius** (squircle):

```tsx
rounded-sm  = 6px   // Inputs, badges
rounded     = 10px  // Buttons, cards
rounded-lg  = 14px  // Modals, panels
rounded-xl  = 18px  // Large cards
```

---

## TipTap Editor Extensions

### 13 Core Extensions

1. **BlockIdExtension**: Assign/preserve block IDs for AI tools
2. **GhostTextExtension**: Inline autocomplete (Tab/Right Arrow/Escape)
3. **AnnotationMarkExtension**: Margin annotation marks with CSS Anchor Positioning
4. **IssueBadgeExtension**: Inline `[PS-42]` badges with state colors
5. **IssueExtractionExtension**: Rainbow-bordered boxes for extracted issues
6. **CodeBlockExtension**: Syntax-highlighted code blocks
7. **MentionExtension**: @mentions for notes/issues/agents
8. **SlashCommandExtension**: /slash commands for block types
9. **CustomEnterExtension**: Preserve block IDs on Enter
10. **FloatingToolbarExtension**: Selection toolbar with AI actions
11. **HistoryExtension**: Undo/redo with 50-step limit
12. **CollaborationExtension**: (Phase 2) Yjs-based real-time collab
13. **TableOfContentsExtension**: Auto-generated TOC with scroll sync

### Extension Pattern

```tsx
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const BlockIdExtension = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'codeBlock'],
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-block-id'),
            renderHTML: (attributes) => ({
              'data-block-id': attributes.blockId,
            }),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockIdPlugin'),
        appendTransaction(transactions, oldState, newState) {
          // Auto-assign block IDs to new blocks
        },
      }),
    ];
  },
});
```

### Ghost Text Integration

```tsx
import { useGhostText } from '@/features/notes/hooks/useGhostText';

function NoteEditor({ noteId }: { noteId: string }) {
  const editor = useEditor({
    extensions: [GhostTextExtension],
  });

  const { suggestion, isLoading } = useGhostText(editor);

  useEffect(() => {
    if (suggestion && editor) {
      editor.commands.setGhostText(suggestion);
    }
  }, [suggestion, editor]);

  return <EditorContent editor={editor} />;
}
```

---

## AI Integration

### PilotSpaceStore (Unified AI State)

All AI interactions go through PilotSpaceStore, not siloed stores:

```tsx
class PilotSpaceStore {
  @observable currentSession: ChatSession | null = null;
  @observable messages: Message[] = [];
  @observable isStreaming = false;
  @observable activeApproval: Approval | null = null;

  @action
  async sendMessage(content: string) {
    this.isStreaming = true;

    const sse = new SSEClient('/api/v1/ai/pilot-space/chat', {
      method: 'POST',
      body: JSON.stringify({
        session_id: this.currentSession?.id,
        content,
      }),
    });

    sse.addEventListener('text_delta', (event) => {
      this.appendMessageDelta(event.data);
    });

    sse.addEventListener('approval_request', (event) => {
      this.activeApproval = JSON.parse(event.data);
    });

    sse.addEventListener('message_stop', () => {
      this.isStreaming = false;
    });

    await sse.connect();
  }

  @action
  private appendMessageDelta(delta: string) {
    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage?.role === 'assistant') {
      lastMessage.content += delta;
    } else {
      this.messages.push({ role: 'assistant', content: delta });
    }
  }
}
```

### SSE Event Mapping

_Per `docs/architect/pilotspace-agent-architecture.md` section 8_

SSE events from backend → Frontend store updates:

| SSE Event          | Store Update                 | UI Effect                       |
| ------------------ | ---------------------------- | ------------------------------- |
| `message_start`    | Create new assistant message | Show streaming indicator        |
| `text_delta`       | Append to current message    | Render with blinking cursor     |
| `tool_use`         | Add tool call to message     | Show tool details (expandable)  |
| `tool_result`      | Add tool result              | Update task panel               |
| `content_update`   | Apply TipTap JSON patch      | Editor content updates          |
| `approval_request` | Set activeApproval           | Modal overlay (non-dismissable) |
| `task_progress`    | Update task status           | Progress bar update             |
| `message_stop`     | Clear streaming state        | Hide spinner                    |
| `error`            | Set error state              | Toast notification              |

### Approval Flow

```tsx
function ApprovalModal() {
  const { pilotSpaceStore } = useStore();
  const approval = pilotSpaceStore.activeApproval;

  if (!approval) return null;

  return (
    <Modal open={!!approval} onOpenChange={() => {}}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Approval Required</ModalTitle>
        </ModalHeader>

        <div className="approval-content">
          <p>{approval.message}</p>

          {/* Content diff */}
          <DiffViewer original={approval.original} modified={approval.modified} />

          {/* 24h expiry countdown */}
          <CountdownTimer expiresAt={approval.expiresAt} />
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={() => pilotSpaceStore.rejectApproval(approval.id)}>
            Reject
          </Button>
          <Button onClick={() => pilotSpaceStore.approveApproval(approval.id)}>Approve</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
```

---

## Pre-Submission Checklist

Rate confidence (0-1) before submitting:

**State Management**:

- [ ] MobX (UI state) vs TanStack Query (server state) separation correct: \_\_\_
- [ ] No API data stored in MobX stores: \_\_\_
- [ ] Optimistic updates use snapshot + rollback pattern: \_\_\_

**Accessibility**:

- [ ] Keyboard navigation functional (Tab, Enter, Escape): \_\_\_
- [ ] ARIA labels present for interactive elements: \_\_\_
- [ ] Focus management correct (modals trap focus): \_\_\_
- [ ] Reduced motion support (`motion-reduce:`): \_\_\_

**Performance**:

- [ ] Dynamic imports for components >50KB gzipped: \_\_\_
- [ ] Virtual scroll used for lists >500 items: \_\_\_
- [ ] Images optimized (Next.js Image component): \_\_\_

**AI Integration** (if applicable):

- [ ] AI interactions through PilotSpaceStore (unified): \_\_\_
- [ ] SSE events mapped correctly per architecture doc: \_\_\_
- [ ] Approval flow implemented for destructive actions: \_\_\_

**Code Quality**:

- [ ] File stays under 700 lines: \_\_\_
- [ ] TypeScript strict mode passes: \_\_\_
- [ ] No console errors or warnings: \_\_\_

**If any score <0.9, refine implementation before submitting.**

---

## Common Patterns Reference

### Load Order for New Features

1. `docs/architect/feature-story-mapping.md` → Find US-XX and components
2. `docs/dev-pattern/45-pilot-space-patterns.md` → Project-specific overrides
3. Frontend-specific patterns → `docs/dev-pattern/20-component.md`, `21c-frontend-mobx-state.md`
4. UI/UX spec → `specs/001-pilot-space-mvp/ui-design-spec.md`

### Key Documentation

| Topic                 | Document                                          |
| --------------------- | ------------------------------------------------- |
| Frontend architecture | `docs/architect/frontend-architecture.md`         |
| Agent architecture    | `docs/architect/pilotspace-agent-architecture.md` |
| UI/UX specification   | `specs/001-pilot-space-mvp/ui-design-spec.md`     |
| MobX patterns         | `docs/dev-pattern/21c-frontend-mobx-state.md`     |

---

## Standards Summary

**Don't use**:

- API data in MobX stores (use TanStack Query)
- Inline styles (use Tailwind classes)
- Hardcoded colors (use CSS variables)
- Generic component names (use domain-specific names)

**Always use**:

- `'use client'` for interactive components
- `observer()` wrapper for MobX components
- Explicit TypeScript interfaces for props
- shadcn/ui as base, extend with variants
- WCAG 2.2 AA compliance (keyboard nav, ARIA)
- Conventional commits (feat/fix/refactor)
