# Notes Module - Pilot Space

_For project overview and frontend architecture, see main CLAUDE.md and `frontend/CLAUDE.md`_

## Overview

The **notes** module is the core of Pilot Space's Note-First workflow. It provides a sophisticated block-based editor (TipTap + ProseMirror) with 13 extensions, real-time AI assistance (ghost text), auto-save, margin annotations, and seamless integration with the issue extraction pipeline.

**File Path**: `frontend/src/features/notes/`

**Role**: Note Canvas is the home view default. Users start with a collaborative note canvas, not a form. AI acts as an embedded co-writing partner (ghost text, margin annotations, slash commands). Issues emerge naturally from refined thinking, pre-filled with context.

**Key Design Decisions**: DD-013 (Note-First workflow), DD-065 (MobX for UI state), DD-067 (Ghost text: 500ms/50 tokens/code-aware)

---

## Architecture Overview

### Component Tree

```
frontend/src/features/notes/
├── components/                              # UI components
│   ├── EditorToolbar.tsx                    # Top toolbar with AI toggles
│   ├── annotation-card.tsx                  # Annotation card display
│   ├── annotation-detail-popover.tsx        # Annotation detail panel
│   ├── margin-annotation-list.tsx           # List of margin annotations
│   └── README.md                            # Issue extraction UI docs
├── editor/                                  # TipTap editor core
│   ├── extensions/                          # 13 TipTap extensions
│   │   ├── BlockIdExtension.ts              # Block ID assignment/preservation
│   │   ├── GhostTextExtension.ts            # AI inline completions (500ms, 50 tokens)
│   │   ├── AnnotationMark.ts                # Annotation marks for highlighting
│   │   ├── MarginAnnotationExtension.ts     # Margin indicators (CSS Anchor)
│   │   ├── MarginAnnotationAutoTriggerExtension.ts # Auto-trigger AI annotations
│   │   ├── IssueLinkExtension.ts            # Issue link auto-detection + hover preview
│   │   ├── InlineIssueExtension.ts          # Inline [PS-42] badges with state colors
│   │   ├── CodeBlockExtension.ts            # Syntax-highlighted code blocks
│   │   ├── MentionExtension.ts              # @mentions for notes/issues/agents
│   │   ├── SlashCommandExtension.ts         # /slash commands for block types
│   │   ├── ParagraphSplitExtension.ts       # Visual block separation on Enter
│   │   ├── AIBlockProcessingExtension.ts    # AI processing visual indicator
│   │   ├── LineGutterExtension.ts           # Line numbers + heading fold/unfold
│   │   ├── createEditorExtensions.ts        # Factory function for extensions
│   │   ├── ghost-text-styles.ts             # GhostText CSS & styling
│   │   ├── ghost-text-widgets.ts            # GhostText widget rendering
│   │   ├── index.ts                         # Barrel export
│   │   └── MARKDOWN_USAGE.md                # Markdown ↔ TipTap JSON integration
│   ├── hooks/                               # Editor-specific hooks
│   │   ├── useContentUpdates.ts             # SSE content_update event handler
│   │   ├── useSelectionContext.ts           # Track user's cursor + selection
│   │   ├── useSelectionAIActions.ts         # AI actions on selected text
│   │   ├── contentUpdateHandlers.ts         # Handlers for 3 operation types
│   │   ├── config.ts                        # Editor default configuration
│   │   └── index.ts                         # Barrel export
│   ├── types.ts                             # TypeScript types for editor
│   ├── config.ts                            # Default config values
│   └── __tests__/                           # Editor integration tests
├── hooks/                                   # Module-level hooks
│   ├── useNote.ts                           # TanStack Query: fetch single note
│   ├── useNotes.ts                          # TanStack Query: fetch notes list
│   ├── useCreateNote.ts                     # TanStack Query mutation: create
│   ├── useUpdateNote.ts                     # TanStack Query mutation: update
│   ├── useDeleteNote.ts                     # TanStack Query mutation: delete
│   ├── useAutoSave.ts                       # Auto-save with 2s debounce + dirty state
│   ├── useIssueSyncListener.ts              # Real-time issue sync listener
│   └── index.ts                             # Barrel export
├── services/                                # Business logic services
│   └── ghostTextService.ts                  # SSE client for ghost text requests
├── components/README-margin-annotations.md  # Margin annotations design doc
└── components/index.ts                      # Component barrel export
```

### Key Stores (MobX)

**NoteStore** (`/stores/features/notes/NoteStore.ts`):
- Current note management (`currentNote`, `currentNoteId`)
- Auto-save state tracking (`isDirty`, `isSaving`, `lastSavedAt`)
- Annotations management (`currentAnnotations`, `annotationsByBlock`)
- Ghost text suggestions
- Dirty state + auto-save reaction (2s debounce using MobX reaction)

**PilotSpaceStore** (`/stores/ai/PilotSpaceStore.ts`):
- Centralized AI conversation state (unified orchestrator, not siloed agents)
- SSE connection management for streaming
- Content update queue (`pendingContentUpdates`)
- Approval request handling
- All AI interactions route through this store

**GhostTextStore** (`/stores/ai/GhostTextStore.ts`):
- Ghost text-specific state (enabled/disabled, loading, error)
- Current suggestion + position
- Independent of PilotSpaceStore for fast-path (<2.5s SLA)

---

## 13 TipTap Extensions Breakdown

| # | Extension | Purpose | Debounce | Config |
|----|-----------|---------|----------|--------|
| 1 | **BlockIdExtension** | Assign stable block IDs to all elements | - | `preserveOnPaste: true` |
| 2 | **GhostTextExtension** | AI text completions after 500ms pause | 500ms | `minChars: 10, maxTokens: 50` |
| 3 | **AnnotationMark** | Highlight text with annotation marks | - | CSS: `annotation-mark` |
| 4 | **MarginAnnotationExtension** | Render annotation indicators in margin | - | CSS Anchor Positioning |
| 5 | **MarginAnnotationAutoTriggerExtension** | Trigger AI annotations after pause | 2s | `minChars: 50, contextBlocks: 3` |
| 6 | **IssueLinkExtension** | Auto-detect `[PS-XX]` with preview | - | Regex: `/\[PS-\d+\]/g` |
| 7 | **InlineIssueExtension** | Inline issue references with state colors | - | Markdown: `[PS-99](issue:uuid)` |
| 8 | **CodeBlockExtension** | Syntax-highlighted code blocks | - | `showCopyButton: true` |
| 9 | **MentionExtension** | @mentions for users/notes (optional) | - | `trigger: '@', maxSuggestions: 10` |
| 10 | **SlashCommandExtension** | /slash commands for actions | - | From `slash-command-items.ts` |
| 11 | **ParagraphSplitExtension** | Visual block separation on Enter | - | `convertDoubleHardBreak: true` |
| 12 | **AIBlockProcessingExtension** | Visual indicator on AI processing | - | Reads `editor.storage.aiProcessing` |
| 13 | **LineGutterExtension** | Line numbers + heading fold/unfold | - | `foldableTypes: ['heading']` |

---

## Feature Deep Dives

### 1. Ghost Text (DD-067)

**SLA**: <2.5s total (500ms pause + 1.5s response + 500ms render)

**Service**: `ghostTextService.ts` (EventSource-based SSE)

**Features**:
- Auto-reconnect on failure (3 attempts, exponential backoff)
- Request cancellation support
- 5s timeout
- Text buffer accumulation
- Code-aware suggestions (Gemini Flash)

**Keyboard Shortcuts**:
- Tab = accept full suggestion
- Right Arrow (at end of line) = accept next word only
- Escape = dismiss

**Example Flow**:
```
User stops typing for 500ms
  → GhostTextExtension.onTrigger()
  → SSE POST to /api/v1/ai/ghost-text
  → Gemini Flash streams tokens
  → Decoration rendered (faded CSS)
  → User presses Tab/Right/Escape
```

### 2. Auto-Save (useAutoSave hook)

**Generic Hook**: Reusable across app (not note-specific)

**Flow**:
```
Content changed
  → isDirty = true
  → Debounce 2s
  → isSaving = true
  → onSave() with 3 retry attempts
  → lastSavedAt = now
  → Status = "saved" (2s)
  → Status = "idle"
```

**Retry Logic**: Exponential backoff (1s, 2s, 4s) with 30% jitter

**State**:
- `status`: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
- `isDirty`: boolean
- `isSaving`: boolean
- `lastSavedAt`: Date | null

### 3. Margin Annotations

**Trigger**: 2s pause after editing 50+ characters in a block

**Data Flow**:
1. MarginAnnotationAutoTriggerExtension detects threshold
2. Sends context (block + 3 surrounding blocks) to backend
3. AI agent analyzes and returns annotations (SSE)
4. Frontend renders icons in margin (CSS Anchor Positioning)
5. User clicks to expand in annotation-detail-popover.tsx

**Types**: ambiguity, grammar, abbreviation, clarity

**Confidence Scale**: 0-1 (affects visual prominence)

### 4. Issue Extraction

**Endpoint**: `POST /api/v1/ai/notes/:noteId/extract-issues` (SSE streaming)

**Categorization**:
- **Explicit**: Clear actionable items (70%+ confidence)
- **Implicit**: Inferred from context (50-70%)
- **Related**: Loosely connected (30-50%)

**Approval Flow** (DD-003):
1. Backend streams extracted issues
2. Frontend IssueExtractionStore buffers
3. User selects issues to create
4. ApprovalModal shows (non-dismissable, 24h expiry)
5. On approve: Create issues + link via `NoteIssueLink` (EXTRACTED type)

### 5. Content Updates from AI

**Operation Types**:
1. **replace_block**: Replace entire block content
2. **append_blocks**: Insert new blocks after cursor
3. **insert_inline_issue**: Create inline issue reference

**Conflict Detection**: If user is editing the target block, retry later (exponential backoff)

**Handler**: `useContentUpdates()` hook + `contentUpdateHandlers.ts` module

---

## MobX State Patterns

### State Split (DD-065)

**Rule**: MobX = UI state only. TanStack Query = server state.

**Correct Pattern**:
```tsx
// MobX for UI
class NoteStore {
  @observable selectedBlockId: string | null = null;
  @observable isAnnotationDetailOpen = false;
  @observable isDirty = false;
}

// TanStack Query for server
function useNote(noteId: string) {
  return useQuery({
    queryKey: ['notes', noteId],
    queryFn: () => notesApi.get(noteId),
  });
}
```

**Wrong Pattern**:
```tsx
// ❌ Never store server data in MobX
class NoteStore {
  @observable note: Note | null = null;     // ❌ Use TanStack Query
  @observable notes: Note[] = [];           // ❌ Use TanStack Query
  @observable noteContent: JSONContent;     // ❌ Use TanStack Query
}
```

### Auto-Save Reaction

```tsx
class NoteStore {
  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });

    // When content changes, schedule auto-save
    this._disposers.push(
      reaction(
        () => this.currentNote?.content,
        () => {
          if (this.hasUnsavedChanges) {
            this._scheduleAutoSave();
          }
        },
        { delay: 2000 } // 2s debounce
      )
    );
  }

  private _scheduleAutoSave() {
    this.isSaving = true;
    // API call happens here
  }

  dispose() {
    this._disposers.forEach(dispose => dispose());
  }
}
```

### Component Pattern

All components using MobX must be wrapped with `observer()`:

```tsx
import { observer } from 'mobx-react-lite';
import { useStores } from '@/stores';

export const NoteList = observer(function NoteList() {
  const { notes } = useStores();

  return (
    <div>
      {notes.filteredNotes.map(note => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  );
});
```

---

## Integration with AI Features

### SSE Event Flow

All events from backend route through PilotSpaceStore:

```
Backend SSE Event
  → PilotSpaceStore.handleEvent()
  → Specific handler (content_update, approval_request, etc.)
  → Frontend action (useContentUpdates, ApprovalModal, etc.)
  → MobX update + UI render
```

**Event Types**:
- `message_start`: New assistant message started
- `text_delta`: Append to current message
- `tool_use`: AI is calling a tool
- `tool_result`: Tool execution result
- `content_update`: Apply TipTap modifications
- `approval_request`: Show approval modal
- `task_progress`: Update progress indicator
- `message_stop`: End of stream
- `error`: Error occurred

### Skill Integration

Skills (`.claude/skills/`) invoke MCP tools → operation payloads:

```
User types "/improve-writing"
  → SDK detects skill intent
  → Skill executes enhance_text MCP tool
  → MCP tool returns: { status: 'pending_apply', delta: {...} }
  → Backend transform_sdk_message() applies to editor
  → SSE content_update event → useContentUpdates()
  → Editor content updated + UI renders
```

---

## Quality Gates

### Commands

```bash
cd frontend
pnpm lint && pnpm type-check && pnpm test
```

### Coverage Requirements

- `hooks/`: 90%+ (critical TanStack Query logic)
- `services/`: 85%+ (ghostTextService business logic)
- `editor/hooks/`: 85%+ (useContentUpdates complexity)
- `editor/extensions/`: 70%+ (TipTap is hard to test)
- Overall: >80% (project requirement)

### Test Files Included

- `editor/extensions/__tests__/BlockIdExtension.test.ts`
- `editor/extensions/__tests__/GhostTextExtension.test.ts`
- `editor/extensions/__tests__/InlineIssueComponent.test.tsx`
- `editor/hooks/__tests__/useContentUpdates.test.ts`
- `components/__tests__/margin-annotation-list.test.tsx`

---

## Related Documentation

### Design Decisions

- **DD-013**: Note-First workflow (home view default, issue extraction from notes)
- **DD-003**: Human-in-the-loop approval (issue creation requires approval)
- **DD-065**: State split (MobX for UI, TanStack Query for server data)
- **DD-067**: Ghost text (500ms pause, 50 tokens max, code-aware, Gemini Flash)
- **DD-086**: Centralized agent architecture (PilotSpaceAgent orchestrator)

### Dev Patterns

- `docs/dev-pattern/45-pilot-space-patterns.md`: Project-specific patterns (MobX override, RLS, etc.)
- `docs/dev-pattern/21c-frontend-mobx-state.md`: Detailed MobX patterns + anti-patterns
- `docs/dev-pattern/20-component.md`: Component patterns (observer, hooks, composition)
- `docs/dev-pattern/07-repository.md`: Repository pattern (TanStack Query implementation)

### Architecture Docs

- `docs/architect/frontend-architecture.md`: Feature-folder architecture overview
- `docs/architect/pilotspace-agent-architecture.md`: SSE events, approval flow, provider routing
- `docs/architect/feature-story-mapping.md`: Issue US-XX ↔ component mapping

### Specs

- `specs/001-pilot-space-mvp/ui-design-spec.md`: Color system, typography, component variants
- `specs/001-pilot-space-mvp/data-model.md`: Note, NoteAnnotation, NoteIssueLink entities

---

## Implementation Checklist

### When Adding TipTap Extension

- [ ] Extends `Extension` class from @tiptap/core
- [ ] Implements lifecycle: `addGlobalAttributes()`, `addCommands()`, `addProseMirrorPlugins()`
- [ ] Exports types + interfaces
- [ ] Exports CSS/styling separately (ghost-text-styles.ts pattern)
- [ ] Unit tests for plugin logic (decorations, commands, etc.)
- [ ] Documented in this CLAUDE.md (added to 13 extensions table)
- [ ] Added to `createEditorExtensions.ts` factory

### When Adding Hook

- [ ] TanStack Query hooks use proper caching keys (notesKeys pattern)
- [ ] MobX reactions use `makeAutoObservable` + disposers
- [ ] No blocking I/O in effects or callbacks
- [ ] Cleanup on unmount (subscriptions, timers, disposers)
- [ ] Export from `hooks/index.ts` barrel
- [ ] TypeScript interfaces for options + return
- [ ] JSDoc with @example block

### When Adding Component

- [ ] Wrap with `observer()` if consuming MobX stores
- [ ] Props interface explicit + documented
- [ ] WCAG 2.2 AA (keyboard nav, ARIA labels, focus trap if modal)
- [ ] File size <700 lines (split if needed)
- [ ] Export from `components/index.ts` barrel
- [ ] Tests in `__tests__/` subfolder

### When Integrating with AI

- [ ] Use PilotSpaceStore for all interactions (centralized)
- [ ] Content updates via `useContentUpdates()` hook
- [ ] Approval required for destructive actions (DD-003)
- [ ] SSE events mapped per architecture doc
- [ ] Error handling with toast notifications
- [ ] Retry logic for failed operations

---

## Common Patterns

### Fetch a Note

```tsx
const { data: note, isLoading, error } = useNote({
  workspaceId,
  noteId,
  enabled: !!noteId,
});

if (isLoading) return <NoteDetailSkeleton />;
if (error) return <ErrorBoundary error={error} />;
if (!note) return <NoteNotFound />;

return <NoteCanvas note={note} />;
```

### Auto-Save

```tsx
const { status, isDirty, isSaving } = useAutoSave({
  data: editor.getJSON(),
  onSave: async (content) => {
    await notesApi.update(workspaceId, noteId, { content });
  },
  debounceMs: 2000,
  enabled: !!noteId,
});

return (
  <div className="text-xs text-muted-foreground">
    {status === 'saving' && 'Saving...'}
    {status === 'saved' && 'Saved'}
    {status === 'error' && 'Error saving'}
  </div>
);
```

### Listen for Content Updates

```tsx
export function NoteCanvas() {
  const editor = useEditor({ extensions });
  const { pilotSpaceStore } = useStores();

  const { processingBlockIds } = useContentUpdates(
    editor,
    pilotSpaceStore,
    noteId,
    workspaceId
  );

  return (
    <>
      <EditorContent editor={editor} />
      {processingBlockIds.map(blockId => (
        <AIProcessingIndicator key={blockId} blockId={blockId} />
      ))}
    </>
  );
}
```

### Ghost Text Setup

```tsx
const extensions = createEditorExtensions({
  ghostText: {
    enabled: true,
    debounceMs: 500,
    minChars: 10,
    onTrigger: async (context) => {
      const service = getGhostTextService();
      await service.requestCompletion(
        context,
        (chunk) => editor.commands.setGhostText(chunk),
        () => console.log('Done'),
        (err) => console.error(err)
      );
    },
    onAccept: (text, type) => {
      editor.commands.deleteGhostText();
      editor.commands.insertContent(
        type === 'full' ? text : text.split(/\s+/)[0] + ' '
      );
    },
  },
});
```

---

## Troubleshooting

### Ghost Text Not Showing

1. Check `GhostTextExtension` is in extension list
2. Verify 500ms pause (check DevTools timings)
3. Check SSE connection (Network tab → `/api/v1/ai/ghost-text`)
4. Verify `GhostTextStore.enabled = true`
5. Check `/api/v1/ai/ghost-text` endpoint is available

### Auto-Save Not Triggering

1. Verify `useAutoSave()` hook called with `enabled: true`
2. Check `onSave()` callback implemented
3. Verify dirty detection (compare before/after)
4. Check network tab for PUT to `/api/v1/notes/:id`
5. Verify 200 response from backend

### Annotations Not Rendering

1. Check `MarginAnnotationExtension` added
2. Verify annotations data passed to extension config
3. Check CSS Anchor Positioning browser support
4. Verify block IDs match in document + data
5. Check browser console for layout errors

### Content Updates Not Applying

1. Check SSE connection (DevTools Network tab)
2. Verify `useContentUpdates()` hook called
3. Check `contentUpdateHandlers.ts` operation type
4. Look for retry queue entries (conflict detection)
5. Check `editor.storage` for queued operations

---

## Quick Reference

| Feature | File | SLA | Debounce |
|---------|------|-----|----------|
| Ghost text | GhostTextExtension | <2.5s | 500ms |
| Auto-save | useAutoSave | 3-4s total | 2s |
| Annotations | MarginAnnotationAutoTriggerExtension | 2-3s | 2s |
| Content updates | useContentUpdates | Real-time | - |
| Issue extraction | `/api/v1/ai/notes/:id/extract-issues` | Streaming | - |
| Block IDs | BlockIdExtension | Immediate | - |

---

## Performance Notes

- **Extension Load**: 13 extensions on init, but most are lightweight
- **Editor Capacity**: TipTap handles 100k+ characters effectively
- **Decoration Limit**: Ghost text uses 1 decoration (not many)
- **Debounce Strategy**: Ghost 500ms (responsive), auto-save 2s (not aggressive), annotations 2s (stable)
- **Large Notes**: Consider pagination or virtualization for >50k characters

---

## Security Considerations

- **Block IDs**: Never exposed to users, stored as HTML data attributes
- **Content**: RLS-enforced at PostgreSQL level (workspace isolation)
- **AI Suggestions**: Never auto-accepted (DD-003 approval requirement)
- **Ghost Text**: Streamed from Gemini, not cached
- **User Actions**: Local state only, not persisted to backend
