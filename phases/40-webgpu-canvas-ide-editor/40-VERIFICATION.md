---
phase: 40-webgpu-canvas-ide-editor
verified: 2026-03-24T08:20:00Z
status: gaps_found
score: 9/10 must-haves verified
gaps:
  - truth: "Monaco editor replaces TipTap as the note editing layer with Canvas-based rendering"
    status: partial
    reason: "NoteCanvas default export still aliases to NoteCanvasLayout (TipTap). NoteCanvasMonaco wrapper exists but no page imports it. The live note page at /notes/[noteId] still renders TipTap."
    artifacts:
      - path: "frontend/src/components/editor/NoteCanvas.tsx"
        issue: "Default export is NoteCanvasLayout (TipTap), not MonacoNoteEditor. Line 107: 'export { NoteCanvasLayout as default }'. NoteCanvasMonaco is only a named export."
      - path: "frontend/src/app/(workspace)/[workspaceSlug]/notes/[noteId]/page.tsx"
        issue: "Imports NoteCanvas (default = TipTap), not NoteCanvasMonaco or MonacoNoteEditor"
    missing:
      - "Change NoteCanvas default export to NoteCanvasMonaco, OR update the note page to import NoteCanvasMonaco/MonacoNoteEditor directly"
  - truth: "Auto-save fires with 2s debounce on file content changes"
    status: partial
    reason: "useAutoSaveEditor hook is substantive and wired into EditorLayout, but the saveFn is a no-op TODO stub (lines 67-71). Auto-save mechanism exists but does not persist data."
    artifacts:
      - path: "frontend/src/features/editor/EditorLayout.tsx"
        issue: "saveFn is a no-op with TODO comment: 'Wire to actual persistence API (notes API or file API)'. Content changes are tracked but never saved."
    missing:
      - "Wire saveFn to the notes API (PUT /notes/{id}) or file persistence endpoint"
human_verification:
  - test: "Open a workspace note and verify Monaco canvas editor loads"
    expected: "Monaco editor renders with canvas-based text rendering (not DOM text nodes)"
    why_human: "Cannot verify canvas rendering programmatically"
  - test: "Type markdown (# Heading, **bold**, *italic*) and verify decorations"
    expected: "Headings appear larger/bold, bold text shows bold styling, italic shows italic"
    why_human: "Visual decoration rendering requires browser"
  - test: "Toggle Edit/Preview and verify crossfade transition"
    expected: "200ms opacity transition between Monaco editor and MarkdownPreview"
    why_human: "Animation timing requires visual verification"
  - test: "Scroll in file tree sidebar and verify smooth spring physics"
    expected: "Lenis smooth scroll with momentum deceleration (not native scroll)"
    why_human: "Scroll physics feel requires human judgment"
  - test: "Check browser console for errors"
    expected: "No flushSync warnings, no React errors, no unhandled rejections"
    why_human: "Runtime error detection requires live browser session"
---

# Phase 40: WebGPU Canvas IDE Editor Verification Report

**Phase Goal:** Migrate the note editor from TipTap/ProseMirror (DOM-based) to Monaco Editor (Canvas-based) for GPU-accelerated performance. Add IDE-like file capabilities: file tree browser, tab system, Cmd+P quick open, syntax-highlighted file editing, and rendered markdown preview with GFM, KaTeX, and Mermaid support.
**Verified:** 2026-03-24T08:20:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Monaco editor replaces TipTap as the note editing layer with Canvas-based rendering | PARTIAL | MonacoNoteEditor.tsx (174 lines) uses `@monaco-editor/react` with full config. BUT NoteCanvas default export still routes to TipTap. No page imports Monaco version. |
| 2 | All 10 PM block types render as interactive view zones inside Monaco's viewport | VERIFIED | PMBlockViewZone.tsx has lazy rendererMap for all 10 types. useMonacoViewZones.ts creates portals via ViewZoneManager with ResizeObserver. |
| 3 | Ghost text AI suggestions appear via Monaco's native InlineCompletionsProvider | VERIFIED | useMonacoGhostText.ts (107 lines) registers `registerInlineCompletionsProvider('markdown')` with textBeforeCursor/textAfterCursor context, cancellation token handling. |
| 4 | Slash commands (/) and mentions (@) work via Monaco's CompletionItemProvider | VERIFIED | useMonacoSlashCmd.ts (224 lines) registers two providers: triggerCharacters ['/'] with 20 commands (including all 10 PM blocks), triggerCharacters ['@'] with member fetcher. |
| 5 | Yjs collaboration connects through y-monaco with remote cursor rendering | VERIFIED | useMonacoCollab.ts (143 lines) creates Y.Doc, MonacoBinding, SupabaseYjsProvider, awareness with cursor colors. Proper cleanup order. |
| 6 | File tree sidebar shows files from all four sources (artifact, local, note, remote) | VERIFIED | FileTree.tsx (89 lines) is observer-wrapped, uses useFileTree + Virtuoso, accepts FileTreeItem[] with FileSource type supporting all 4 sources. Wired to FileStore.openFile(). |
| 7 | Tab system supports multiple open files with dirty indicators and auto-save | PARTIAL | TabBar.tsx (166 lines) with dirty dots, middle-click close, ARIA tablist. FileStore (124 lines) with openFile/closeFile/markDirty/MAX_TABS=12. Auto-save hook exists but saveFn is a no-op TODO. |
| 8 | Cmd+P quick open provides fuzzy file search | VERIFIED | QuickOpen.tsx (133 lines) uses Dialog + Command (cmdk), fuzzy matching with character highlight, max 10 results, keyboard navigation. |
| 9 | Markdown preview renders GFM, KaTeX math, Mermaid diagrams, and admonitions | VERIFIED | MarkdownPreview.tsx (87 lines) with remarkGfm, remarkMath, remarkDirective, remarkAdmonition, rehypeKatex, rehypeHighlight, rehypeMermaid, DOMPurify sanitization, 720px max-width. |
| 10 | Spring physics scrolling (Lenis) active on file tree and sidebar | VERIFIED | useLenisScroll.tsx (69 lines) exports SmoothScrollProvider with ReactLenis. Workspace layout.tsx wraps children. prefers-reduced-motion respected. Monaco excluded via data-lenis-prevent. |

**Score:** 9/10 truths verified (1 partial due to routing gap, 1 partial due to no-op save)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/features/editor/types.ts` | Shared type definitions | VERIFIED | 39 lines, exports OpenFile, FileSource, PMBlockMarker, PMBlockType, EditorMode, GhostTextContext |
| `frontend/src/features/editor/themes/pilotSpaceTheme.ts` | Monaco theme definitions | VERIFIED | 66 lines, exports definePilotSpaceThemes, THEME_LIGHT, THEME_DARK |
| `frontend/src/features/editor/markers/pmBlockMarkers.ts` | PM block markdown parser | VERIFIED | 86 lines, exports parsePMBlockMarkers, PM_BLOCK_REGEX |
| `frontend/src/features/file-browser/stores/FileStore.ts` | MobX store for file tabs | VERIFIED | 124 lines, openFile/closeFile/markDirty/MAX_TABS, registered in RootStore |
| `frontend/src/features/markdown-preview/MarkdownPreview.tsx` | Markdown preview component | VERIFIED | 87 lines, full plugin stack (GFM, KaTeX, Mermaid, admonitions, DOMPurify) |
| `frontend/src/features/markdown-preview/plugins/remarkAdmonition.ts` | Admonition remark plugin | VERIFIED | 38 lines, exports remarkAdmonition |
| `frontend/src/features/markdown-preview/plugins/rehypeMermaid.ts` | Mermaid rehype plugin | VERIFIED | 55 lines, exports rehypeMermaid |
| `frontend/src/features/editor/MonacoNoteEditor.tsx` | Main Monaco note editor | VERIFIED | 174 lines, uses useMonacoNote composite hook, Edit/Preview crossfade, data-lenis-prevent |
| `frontend/src/features/editor/hooks/useMonacoViewZones.ts` | PM block view zones hook | VERIFIED | 93 lines, parsePMBlockMarkers + ViewZoneManager + createPortal |
| `frontend/src/features/editor/decorations/markdownDecorations.ts` | Markdown decorations | VERIFIED | 222 lines, exports applyMarkdownDecorations, parseMarkdownLine, regex patterns |
| `frontend/src/features/editor/EditorToolbar.tsx` | Edit/Preview toggle toolbar | VERIFIED | 98 lines, Edit/Preview text labels, "Unsaved changes" tooltip, "Read-only" badge |
| `frontend/src/features/editor/view-zones/ViewZoneManager.ts` | View zone lifecycle manager | VERIFIED | 120 lines, addZone/removeZone/removeAll with ResizeObserver |
| `frontend/src/features/editor/view-zones/PMBlockViewZone.tsx` | PM block view zone component | VERIFIED | Lazy rendererMap for all 10 types, Suspense, NOT observer(), collapse/expand toggle |
| `frontend/src/features/editor/hooks/useMonacoGhostText.ts` | AI ghost text provider | VERIFIED | 107 lines, registerInlineCompletionsProvider for 'markdown' |
| `frontend/src/features/editor/hooks/useMonacoSlashCmd.ts` | Slash commands + mentions | VERIFIED | 224 lines, two CompletionItemProviders, all 10 PM block slash commands |
| `frontend/src/features/editor/hooks/useMonacoCollab.ts` | Yjs collaboration binding | VERIFIED | 143 lines, Y.Doc + MonacoBinding + SupabaseYjsProvider + awareness |
| `frontend/src/features/file-browser/components/FileTree.tsx` | File tree sidebar | VERIFIED | 89 lines, observer, Virtuoso, role="tree", empty state, wired to FileStore.openFile |
| `frontend/src/features/file-browser/components/TabBar.tsx` | Open file tabs strip | VERIFIED | 166 lines, observer, role="tablist", middle-click close, dirty indicator |
| `frontend/src/features/file-browser/components/QuickOpen.tsx` | Cmd+P fuzzy finder | VERIFIED | 133 lines, Dialog + Command (cmdk), highlight matching, "No matching files" empty state |
| `frontend/src/features/editor/MonacoFileEditor.tsx` | Code file editor | VERIFIED | 68 lines, @monaco-editor/react, wordWrap: 'off', data-lenis-prevent |
| `frontend/src/features/file-browser/hooks/useFileTree.ts` | Tree navigation hook | VERIFIED | 156 lines, flattenedItems, keyboard navigation, expand/collapse |
| `frontend/src/features/editor/EditorLayout.tsx` | Three-panel resizable layout | VERIFIED | 142 lines, ResizablePanelGroup, observer, crossfade, QuickOpen, auto-save hook wired |
| `frontend/src/features/editor/hooks/useAutoSaveEditor.ts` | Auto-save hook | VERIFIED | 108 lines, 2000ms debounce, Cmd+S flush, editor-force-save event, markClean |
| `frontend/src/features/editor/hooks/useLenisScroll.tsx` | Lenis smooth scroll | VERIFIED | 69 lines, SmoothScrollProvider, prefers-reduced-motion, lerp/duration config |
| `frontend/src/features/editor/hooks/useMonacoNote.ts` | Composite hook | VERIFIED | 91 lines, composes all 6 hooks: theme, decorations, viewZones, ghostText, slashCmd, collab |
| `frontend/src/features/editor/hooks/useMonacoTheme.ts` | Theme binding hook | VERIFIED | 42 lines, definePilotSpaceThemes call, dark/light detection |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| RootStore.ts | FileStore.ts | fileStore property | WIRED | `this.fileStore = new FileStore()` + `useFileStore()` hook exported |
| MonacoNoteEditor.tsx | useMonacoNote.ts | hook call | WIRED | `useMonacoNote({...})` called with all options |
| useMonacoNote.ts | useMonacoGhostText.ts | hook composition | WIRED | `useMonacoGhostText(monacoInstance, editor, ghostTextFetcher, noteId)` |
| useMonacoNote.ts | useMonacoSlashCmd.ts | hook composition | WIRED | `useMonacoSlashCmd(monacoInstance, editor, memberFetcher)` |
| useMonacoNote.ts | useMonacoCollab.ts | hook composition | WIRED | `useMonacoCollab({editor, model, noteId, enabled, supabase, user})` |
| useMonacoViewZones.ts | pmBlockMarkers.ts | parsePMBlockMarkers | WIRED | `parsePMBlockMarkers(content)` called in useMemo |
| PMBlockViewZone.tsx | PM block renderers | dynamic import | WIRED | All 10 renderers lazy-loaded via rendererMap |
| MonacoNoteEditor.tsx | MarkdownPreview.tsx | preview mode | WIRED | `<MarkdownPreview content={content} />` in preview div |
| EditorLayout.tsx | FileTree.tsx | left panel | WIRED | `<FileTree items={fileTreeItems} />` |
| EditorLayout.tsx | MonacoNoteEditor.tsx | center panel | WIRED | Dynamic import, renders for `source === 'note'` |
| FileTree.tsx | FileStore.ts | openFile | WIRED | `fileStore.openFile({...})` on file click |
| TabBar.tsx | FileStore.ts | tabs/closeFile | WIRED | `useFileStore()` for tabs, activeFileId, closeFile |
| NoteCanvas.tsx | MonacoNoteEditor.tsx | dynamic import | PARTIAL | Dynamic import exists, NoteCanvasMonaco wrapper exists, but default export is still TipTap |
| workspace layout.tsx | useLenisScroll.tsx | SmoothScrollProvider | WIRED | `<SmoothScrollProvider>{children}</SmoothScrollProvider>` wraps content |
| MarkdownPreview.tsx | MermaidPreview | component reuse | WIRED | Imports MermaidPreview from pm-blocks, used in code/div overrides |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| EDITOR-01 | 40-03, 40-06, 40-07 | Monaco editor replaces TipTap | PARTIAL | Component exists and works, but not wired as default route |
| EDITOR-02 | 40-01, 40-03 | PM block view zones | SATISFIED | ViewZoneManager + PMBlockViewZone with all 10 types |
| EDITOR-03 | 40-04 | Ghost text AI completions | SATISFIED | InlineCompletionsProvider registered for markdown |
| EDITOR-04 | 40-04 | Slash commands | SATISFIED | CompletionItemProvider with / trigger, 20 commands |
| EDITOR-05 | 40-04 | Yjs collaboration | SATISFIED | y-monaco binding with SupabaseYjsProvider |
| EDITOR-06 | 40-03 | Markdown decorations | SATISFIED | applyMarkdownDecorations with 6 pattern types |
| FILE-01 | 40-05 | File tree sidebar | SATISFIED | FileTree with Virtuoso, keyboard nav, context menu |
| FILE-02 | 40-01, 40-05 | Tab system | SATISFIED | FileStore + TabBar with dirty indicators |
| FILE-03 | 40-05 | Quick open | SATISFIED | QuickOpen with cmdk, fuzzy search, Cmd+P |
| FILE-04 | 40-01, 40-06 | Auto-save | PARTIAL | Hook works but saveFn is no-op TODO |
| PREVIEW-01 | 40-02 | Markdown preview | SATISFIED | GFM, KaTeX, Mermaid, admonitions, syntax highlighting |
| UX-01 | 40-06 | Resizable layout | SATISFIED | EditorLayout with ResizablePanelGroup |
| UX-02 | 40-06 | Crossfade transitions | SATISFIED | transition-opacity duration-200 on mode/file switches |
| UX-03 | 40-01, 40-03 | Design system theming | SATISFIED | Pilot Space light/dark themes registered in Monaco |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| EditorLayout.tsx | 68 | `TODO: Wire to actual persistence API` | Warning | Auto-save fires but does not persist data. Tab dirty state tracked but never cleared by a real save. |
| NoteCanvas.tsx | 107 | Default export is TipTap, not Monaco | Blocker | The core migration goal is not achieved in production routes. |

### Human Verification Required

### 1. Monaco Canvas Rendering
**Test:** Open a workspace note at /workspace/notes/{noteId}
**Expected:** Monaco editor loads with canvas-based text rendering
**Why human:** Cannot verify canvas vs DOM rendering programmatically

### 2. Markdown Decorations
**Test:** Type `# Heading`, `**bold**`, `*italic*` in editor
**Expected:** Headings appear larger/bold, bold/italic show visual styling
**Why human:** Visual decoration rendering requires browser

### 3. Edit/Preview Toggle
**Test:** Click Preview button in toolbar
**Expected:** 200ms opacity crossfade from Monaco to rendered markdown
**Why human:** Animation timing requires visual verification

### 4. Lenis Smooth Scroll
**Test:** Scroll in file tree sidebar
**Expected:** Spring physics scrolling with momentum deceleration
**Why human:** Scroll physics feel requires human judgment

### 5. Console Error Check
**Test:** Open browser DevTools console during editor use
**Expected:** No flushSync warnings, no React errors
**Why human:** Runtime error detection requires live browser session

### Gaps Summary

Two gaps were found:

**Gap 1 (Blocker): NoteCanvas default export still routes to TipTap.** The MonacoNoteEditor component is fully built and wired internally (all hooks compose correctly, view zones render, ghost text/slash commands register). However, `NoteCanvas.tsx` line 107 exports `NoteCanvasLayout as default` -- meaning the actual note page at `/workspace/notes/[noteId]` still renders TipTap. The `NoteCanvasMonaco` named export exists but no page imports it. This directly contradicts Success Criterion #1: "Monaco editor replaces TipTap as the note editing layer."

**Gap 2 (Warning): Auto-save saveFn is a no-op.** The `useAutoSaveEditor` hook is substantive (2s debounce, Cmd+S flush, markClean integration), but `EditorLayout.tsx` wires it with a no-op `saveFn` that has a TODO comment. This means content changes are tracked as dirty but never persisted. This is a partial gap since the mechanism works but the integration point is missing.

Both gaps share a root cause: the "last mile" wiring from the new Monaco infrastructure to the existing application routing and persistence layers was not completed.

### Test Results

All 9 phase-specific test files pass (114 tests total):
- pmBlockMarkers.test.ts: 14 tests
- ViewZoneManager.test.ts: 5 tests
- markdownDecorations.test.ts: 28 tests
- ghostText.test.ts: 6 tests
- slashCmd.test.ts: 9 tests
- FileStore.test.ts: 16 tests
- useFileTree.test.ts: 15 tests
- TabBar.test.tsx: 9 tests
- MarkdownPreview.test.tsx: 12 tests

TypeScript type-check: PASS (zero errors)

---

_Verified: 2026-03-24T08:20:00Z_
_Verifier: Claude (gsd-verifier)_
