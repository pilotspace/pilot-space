# Phase 26: Sidebar Tree & Navigation - Research

**Researched:** 2026-03-12
**Domain:** Frontend — React/Next.js sidebar tree, TanStack Query, MobX, TipTap editor decoupling
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NAV-01 | User can expand a project in the sidebar to see its nested page tree (3 levels, expand/collapse toggles) | Backend `GET /workspaces/{id}/notes?project_id=...` returns flat list with parent_id+depth+position. Frontend must build tree from flat list and render expandable nodes. Expand state persists via UIStore localStorage. |
| NAV-02 | User can create a new child page inline from the sidebar by clicking "+" on a tree node | `POST /workspaces/{id}/notes` with `{ parent_id, project_id }` creates a child. Existing `useCreateNote` hook + TanStack Query mutation can be reused. Inline input stays visible after creation. |
| NAV-03 | User sees personal pages listed under "Notes" nav item in the sidebar | `GET /workspaces/{id}/notes` without `project_id` filter returns personal pages (owner_id=currentUser, project_id=NULL). New sidebar section replaces existing Pinned/Recent pattern. |
| NAV-04 | User sees breadcrumb navigation (parent > child > current) in the page header and can click any breadcrumb to navigate | Ancestors must be fetched. No dedicated ancestor endpoint exists in Phase 25 output — frontend must either traverse parent_id chain via individual GETs or backend needs a new `/notes/{id}/ancestors` endpoint. This is the key open question. |
</phase_requirements>

---

## Summary

Phase 26 is a pure-frontend phase with one targeted backend addition. Phases 24 and 25 delivered the data model (parent_id, depth, position on Note) and the move/reorder REST endpoints. Phase 26 consumes that API to show the tree in the sidebar.

The three main areas of work are: (1) sidebar tree rendering for project pages with expand/collapse and inline create, (2) personal pages section under the Notes nav item, and (3) breadcrumb navigation in the page header. A fourth necessary piece, called out explicitly in STATE.md, is decoupling the TipTap editor from issue-specific extensions so non-issue pages can open in the NoteCanvas without crashes.

The sidebar file is currently 671 lines. Adding tree components inline would push it over the 700-line pre-commit limit, requiring extraction of the tree sections into a dedicated component file.

**Primary recommendation:** Add a new `ProjectPageTree` component (extracted from sidebar), wire it via a new TanStack Query hook `useProjectPageTree`, persist expand state in UIStore localStorage, and add a `PageBreadcrumb` component to the note page header. The editor decoupling is a surgical change: the NoteCanvas already uses `createEditorExtensions` (no PropertyBlock), so the blocker is that the current `/notes/[noteId]/page.tsx` must open pages via NoteCanvas, not IssueEditorContent.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mobx-react-lite | ^4 | observer() wrapping for reactive UI | Project standard, already wired |
| @tanstack/react-query | ^5 | Server state for notes tree fetching | Project standard for all API data |
| motion/react | ^11 | AnimatePresence for expand/collapse | Already used in OutlineTree.tsx |
| lucide-react | latest | ChevronRight, ChevronDown, Plus icons | Project icon library |
| next/link | Next.js 14 | Breadcrumb and tree node navigation | Project standard |
| next/navigation | Next.js 14 | usePathname for active page detection | Already used in sidebar.tsx |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @radix-ui/react-tooltip | via shadcn | Tooltip on collapsed tree nodes | Sidebar already uses Tooltip |
| clsx/cn utility | via @/lib/utils | Conditional class merging | All components |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom tree from flat list | react-arborist | react-arborist adds ~50KB for a 3-level tree that can be hand-built in <100 lines; overkill |
| localStorage expand state | sessionStorage | localStorage persists across sessions (requirement); sessionStorage does not |
| TanStack Query for tree | NoteStore MobX | MobX stores hold UI state only per DD-065; server data belongs in TanStack Query |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Component Structure
```
frontend/src/
├── components/
│   └── layout/
│       ├── sidebar.tsx               # Modified: remove Pinned/Recent, add ProjectTree + PersonalPages sections
│       ├── ProjectPageTree.tsx       # New: tree node list for one project (extracted from sidebar)
│       └── PersonalPagesList.tsx     # New: flat list of personal pages (extracted from sidebar)
├── features/
│   └── notes/
│       └── hooks/
│           ├── useProjectPageTree.ts # New: TanStack Query hook fetching pages for a project
│           └── usePersonalPages.ts  # New: TanStack Query hook fetching personal pages
└── components/editor/
    └── PageBreadcrumb.tsx            # New: breadcrumb component for note header
```

### Pattern 1: Build Tree from Flat API Response

The backend `GET /workspaces/{id}/notes?project_id={id}` returns a flat paginated list. Each item has `parent_id`, `depth`, and `position`. The frontend builds the tree client-side.

**What:** Convert flat array of notes to a nested tree structure, sorted by position within each parent group.
**When to use:** Every time `useProjectPageTree` data arrives.
**Example:**
```typescript
// Source: local — pattern based on adjacency list traversal
interface PageTreeNode {
  id: string;
  title: string;
  parentId: string | null;
  depth: number;
  position: number;
  children: PageTreeNode[];
}

function buildTree(notes: Note[]): PageTreeNode[] {
  const map = new Map<string, PageTreeNode>();
  const roots: PageTreeNode[] = [];

  // First pass: create node map
  for (const note of notes) {
    map.set(note.id, { ...note, parentId: note.parentId ?? null, children: [] });
  }

  // Second pass: attach children to parents, sort by position
  for (const node of map.values()) {
    if (node.parentId === null) {
      roots.push(node);
    } else {
      const parent = map.get(node.parentId);
      parent?.children.push(node);
    }
  }

  // Sort all children by position
  function sortChildren(nodes: PageTreeNode[]): PageTreeNode[] {
    return nodes
      .sort((a, b) => a.position - b.position)
      .map(n => ({ ...n, children: sortChildren(n.children) }));
  }

  return sortChildren(roots);
}
```

### Pattern 2: Expand State Persisted in UIStore

The UIStore already persists `sidebarCollapsed` and `sidebarWidth` to localStorage via a MobX reaction. The same pattern applies to tree expand state.

**What:** Add `expandedNodes: Set<string>` to UIStore, persisted to localStorage key `pilot-space-ui`.
**When to use:** Any sidebar tree node the user expands or collapses.
**Example:**
```typescript
// Source: UIStore.ts pattern — extends existing persistence reaction
// In UIStore class:
expandedNodes: Set<string> = new Set<string>();

toggleNodeExpanded(nodeId: string) {
  if (this.expandedNodes.has(nodeId)) {
    this.expandedNodes.delete(nodeId);
  } else {
    this.expandedNodes.add(nodeId);
  }
}

isNodeExpanded(nodeId: string): boolean {
  return this.expandedNodes.has(nodeId);
}
// Serialization: Set → Array in persistence reaction, Array → Set on load
```

### Pattern 3: Inline Create on Tree Node

Clicking "+" on a tree node adds an input field inline, calls the create mutation on blur/Enter, then navigates to the new page.

**What:** Local `useState` tracks which node is in "inline create" mode. On create, use `useCreateNote` with `{ parent_id: nodeId, project_id }`.
**When to use:** User clicks "+" on any tree node.
**Example:**
```typescript
// Source: useCreateNote.ts pattern in frontend/src/features/notes/hooks/
const createNote = useCreateNote({
  workspaceId,
  onSuccess: (note) => {
    router.push(`/${workspaceSlug}/notes/${note.id}`);
    setInlineCreateParentId(null);
  },
});

const handleInlineCreate = (title: string, parentId: string) => {
  createNote.mutate({
    title,
    parentId,
    projectId,
  });
};
```

Note: The `NoteCreate` backend schema does NOT currently include `parent_id`. This must be added to the create flow. See "Open Questions" section.

### Pattern 4: Breadcrumb from Note Ancestors

A breadcrumb requires knowing the ancestor chain of the current page. Two approaches:

**Option A (preferred — no backend change):** When the sidebar tree data is already loaded for the project, look up ancestors locally by traversing the flat notes list by parent_id chain.

**Option B (fallback — requires backend):** Add `GET /workspaces/{id}/notes/{note_id}/ancestors` endpoint returning `[{id, title}]` from root to parent.

Given that sidebar already loads all notes for a project (flat list, max depth 3), Option A avoids a round-trip. The breadcrumb can derive ancestors from the TanStack Query cache.

```typescript
// Source: local derivation from flat notes cache
function getAncestors(noteId: string, allNotes: Note[]): Note[] {
  const byId = new Map(allNotes.map(n => [n.id, n]));
  const ancestors: Note[] = [];
  let current = byId.get(noteId);
  while (current?.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }
  return ancestors;
}
```

### Pattern 5: Editor Decoupling for Non-Issue Pages

The blocker identified in STATE.md: "TipTap editor coupled to issue property blocks — must decouple before non-issue pages open."

On investigation, the NoteCanvas ALREADY uses `createEditorExtensions` (not `createIssueNoteExtensions`). The NoteCanvas does NOT include `PropertyBlockNode`. The decoupling issue is actually that pages were navigating to the IssueDetailPage component rather than the NoteDetailPage. Opening `/notes/{id}` uses NoteDetailPage which renders NoteCanvas — this already works correctly.

The real risk: if a migrated note that previously had issue content (with `data-property-block` HTML) is loaded in NoteCanvas, TipTap will try to parse `<div data-property-block>` but `PropertyBlockNode` is NOT registered in `createEditorExtensions`. TipTap's schema will drop unknown nodes silently (default behavior: unknown nodes become paragraphs or are stripped). This is safe but may cause content loss on first open.

**Prevention:** Add a content sanitization step in NoteDetailPage that strips `data-property-block` divs from `note.content` before passing to NoteCanvas. This mirrors what `IssueEditorContent.saveDescription` already does on save.

### Anti-Patterns to Avoid
- **Storing tree server data in MobX NoteStore:** MobX = UI state only (DD-065). Use TanStack Query for tree data.
- **Fetching ancestors via sequential parent_id GETs:** N+1 problem. Derive from cached flat list instead.
- **Adding tree component code directly in sidebar.tsx:** Would push sidebar.tsx over 700-line limit. Extract to `ProjectPageTree.tsx`.
- **Using observer() on TipTap-containing components:** The IssueEditorContent rule applies — ReactNodeViewRenderer + useSyncExternalStore causes flushSync crash in React 19.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Expand/collapse animation | Custom CSS height transition | `motion/react` AnimatePresence (already used in OutlineTree.tsx) | Height animation requires JS measurement; framer handles gracefully |
| Tree-to-flat ID list for DnD | Custom recursive flattener | Copy pattern from OutlineTree.tsx `flattenedIds` | Already solved correctly in the codebase |
| localStorage persistence | Custom storage hook | Extend UIStore's existing MobX reaction | Pattern already established, avoids sync bugs |

---

## Common Pitfalls

### Pitfall 1: sidebar.tsx Exceeds 700-Line Limit
**What goes wrong:** Adding ProjectPageTree and PersonalPagesList sections inline pushes sidebar.tsx from 671 to 900+ lines, failing pre-commit hook.
**Why it happens:** Sidebar already has sections for workspace, navigation, notes (pinned/recent), user controls, collapse toggle — each substantial.
**How to avoid:** Extract `ProjectPageTree` and `PersonalPagesList` as separate component files. Import them into sidebar.tsx.
**Warning signs:** Adding more than ~30 lines of new code to sidebar.tsx.

### Pitfall 2: Set<string> Not MobX-Observable
**What goes wrong:** `expandedNodes: Set<string>` added to UIStore doesn't trigger re-renders when `.add()` or `.delete()` is called because MobX `makeAutoObservable` does not observe standard Set mutations.
**Why it happens:** MobX requires `ObservableSet` (via `observable.set(...)`) to track Set mutations.
**How to avoid:** Use `observable.set(new Set<string>())` or convert to `expandedNodes: Set<string> = observable.set(new Set())`.
**Warning signs:** Clicking expand doesn't visually toggle the tree node.

### Pitfall 3: parent_id Missing from NoteCreate Schema
**What goes wrong:** Creating a child page from the sidebar sends `{ title, project_id }` but the backend `NoteCreate` schema and `CreateNoteService` don't accept `parent_id`, so the new page is created at depth 0 (root), not as a child.
**Why it happens:** The current `NoteCreate` schema (lines 54-77 of note.py) has no `parent_id` field. CreateNoteService must be extended.
**How to avoid:** Add `parent_id: UUID | None = None` to `NoteCreate` schema + wire in `CreateNoteService` to set parent, depth, and position.
**Warning signs:** New pages always appear at the root of the tree.

### Pitfall 4: Tree Query Fetches All Notes Including Nested
**What goes wrong:** `GET /workspaces/{id}/notes?project_id=...` paginates by default to 20 items. A project with 30 pages misses deeper nodes.
**Why it happens:** The existing `list_workspace_notes` endpoint uses pagination. If page_size is not large enough, the tree is incomplete.
**How to avoid:** Set `page_size=100` (max allowed) for tree queries; document this as a known limit (max 100 pages in a project tree for this phase).
**Warning signs:** Breadcrumb traversal hits a `byId.get(parentId)` miss.

### Pitfall 5: Active Note Not Highlighted in Tree
**What goes wrong:** The active page (current URL) is not visually highlighted in the sidebar tree.
**Why it happens:** Sidebar currently uses `pathname.startsWith(item.href)` for nav item active state, but individual tree node links need their own active check.
**How to avoid:** Pass `currentNoteId` (from useParams in sidebar or passed as prop) into `ProjectPageTree` and compare with each node's id.

---

## Code Examples

### useProjectPageTree Hook
```typescript
// Source: follows useNotes.ts pattern in frontend/src/features/notes/hooks/useNotes.ts
export const projectTreeKeys = {
  tree: (workspaceId: string, projectId: string) =>
    ['notes', 'project-tree', workspaceId, projectId] as const,
};

export function useProjectPageTree(workspaceId: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectTreeKeys.tree(workspaceId, projectId),
    queryFn: () => notesApi.list(workspaceId, { projectId }, 1, 100),
    enabled: enabled && !!workspaceId && !!projectId,
    staleTime: 1000 * 60 * 2, // 2 minutes
    select: (data) => buildTree(data.items),
  });
}
```

### NoteCreate with parent_id (Backend Schema)
```python
# Source: backend/src/pilot_space/api/v1/schemas/note.py — extend NoteCreate
class NoteCreate(BaseSchema):
    project_id: UUID | None = Field(default=None)
    parent_id: UUID | None = Field(default=None, description="Parent note ID for tree position")
    title: str = Field(min_length=1, max_length=255)
    content: TipTapContentSchema | None = Field(default=None)
    is_pinned: bool = Field(default=False)
```

### PageBreadcrumb Component
```typescript
// Source: follows Link-based navigation pattern, shadcn Breadcrumb if available
// frontend/src/components/editor/PageBreadcrumb.tsx
interface BreadcrumbItem {
  id: string;
  title: string;
  href: string;
}

export function PageBreadcrumb({ items, current }: { items: BreadcrumbItem[]; current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
      {items.map((item, i) => (
        <span key={item.id} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          <Link href={item.href} className="hover:text-foreground transition-colors truncate max-w-[120px]">
            {item.title}
          </Link>
        </span>
      ))}
      {items.length > 0 && <ChevronRight className="h-3 w-3" />}
      <span className="text-foreground font-medium truncate max-w-[160px]">{current}</span>
    </nav>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat notes list in sidebar (Pinned/Recent) | Project page trees (expand/collapse) | Phase 26 | Sidebar replaces old pattern |
| Notes had no hierarchy | Notes have parent_id/depth/position | Phase 24-25 | Tree rendering now viable |
| Single note canvas for personal notes | Personal pages under "Notes" nav | Phase 26 | NAV-03 |
| No breadcrumbs | PageBreadcrumb in note header | Phase 26 | NAV-04 |

**Deprecated/outdated after Phase 26:**
- `noteStore.pinnedNotes` and `noteStore.recentNotes` in sidebar: replaced by project tree + personal pages sections
- `noteStore.loadNotes()` call in sidebar: replaced by project-scoped TanStack Query hooks

---

## Open Questions

1. **parent_id in NoteCreate backend schema**
   - What we know: `NoteCreate` schema has no `parent_id` field. `CreateNoteService` sets `owner_id`, `project_id` but not `parent_id`.
   - What's unclear: Whether `CreateNoteService` also needs to auto-compute `depth` and `position` from parent (using `get_siblings` + gap arithmetic from Phase 25).
   - Recommendation: Yes — when `parent_id` is provided, service must set `depth = parent.depth + 1` and `position = max_sibling_position + 1000`. This is a backend task in Plan 01.

2. **Personal pages "tree" or flat list?**
   - What we know: Personal pages (`project_id=NULL`) don't participate in tree reordering (guard in ReorderPageService). They have `parent_id`, `depth`, `position` columns but Phase 25 blocks personal page reorder.
   - What's unclear: Whether NAV-03 requires showing personal pages as a flat list or a nested tree.
   - Recommendation: Show as flat list for now (no nesting for personal pages). Requirement says "listed under Notes nav item" — flat list is sufficient for NAV-03.

3. **Breadcrumb ancestor data source**
   - What we know: No dedicated `/ancestors` endpoint exists. The sidebar tree query loads all pages for a project (up to 100).
   - What's unclear: Personal page breadcrumbs — if personal pages aren't loaded in the tree query, ancestors can't be derived locally.
   - Recommendation: For project pages, derive ancestors from project tree query cache. For personal pages, breadcrumb = just the page title (no ancestors for now, depth is always 0 per Phase 25 guard).

4. **Projects list for sidebar tree sections**
   - What we know: The sidebar shows a "Projects" nav item but doesn't currently render expanded project tree sections.
   - What's unclear: Does each project in the workspace get a collapsible section in the sidebar, or only the "current" project?
   - Recommendation: Show all projects the user has access to, each with a collapsible section. Load project list from existing `projectsApi.list`. Each project section only fetches its pages when expanded (lazy loading via enabled flag).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.x |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && pnpm test --run src/components/layout/__tests__/ src/features/notes/hooks/__tests__/` |
| Full suite command | `cd frontend && pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NAV-01 | `buildTree()` converts flat list to nested structure sorted by position | unit | `pnpm test --run src/components/layout/__tests__/ProjectPageTree.test.tsx` | Wave 0 |
| NAV-01 | Expand/collapse toggles persist via UIStore.expandedNodes | unit | `pnpm test --run src/stores/__tests__/UIStore.test.ts` | Wave 0 |
| NAV-02 | Inline create calls `useCreateNote` with parent_id and navigates on success | unit | `pnpm test --run src/components/layout/__tests__/ProjectPageTree.test.tsx` | Wave 0 |
| NAV-03 | Personal pages section renders notes with project_id=null | unit | `pnpm test --run src/components/layout/__tests__/PersonalPagesList.test.tsx` | Wave 0 |
| NAV-04 | `getAncestors()` returns correct ancestor chain from flat notes list | unit | `pnpm test --run src/components/editor/__tests__/PageBreadcrumb.test.tsx` | Wave 0 |
| NAV-01–04 | Sidebar renders projects with tree sections (integration smoke) | unit | `pnpm test --run src/components/layout/__tests__/sidebar-navigation.test.tsx` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `cd frontend && pnpm test --run src/components/layout/__tests__/ src/features/notes/hooks/__tests__/`
- **Per wave merge:** `cd frontend && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/components/layout/__tests__/ProjectPageTree.test.tsx` — covers NAV-01, NAV-02
- [ ] `frontend/src/components/layout/__tests__/PersonalPagesList.test.tsx` — covers NAV-03
- [ ] `frontend/src/components/editor/__tests__/PageBreadcrumb.test.tsx` — covers NAV-04
- [ ] `frontend/src/features/notes/hooks/__tests__/useProjectPageTree.test.ts` — covers hook behavior
- [ ] `backend/tests/unit/services/test_create_note_service_tree.py` — covers parent_id in NoteCreate

---

## Sources

### Primary (HIGH confidence)
- Code inspection of `frontend/src/components/layout/sidebar.tsx` (671 lines) — confirms sidebar is near limit
- Code inspection of `frontend/src/components/navigation/OutlineTree.tsx` — existing tree pattern with AnimatePresence
- Code inspection of `frontend/src/features/issues/components/issue-editor-content.tsx` — confirms NOT observer() pattern
- Code inspection of `frontend/src/features/issues/editor/create-issue-note-extensions.ts` — confirms PropertyBlock is issue-only
- Code inspection of `frontend/src/components/editor/NoteCanvasEditor.tsx` — uses `createEditorExtensions` not `createIssueNoteExtensions`
- Code inspection of `backend/src/pilot_space/api/v1/schemas/note.py` — confirms NoteCreate has no parent_id
- Code inspection of `backend/src/pilot_space/api/v1/routers/workspace_notes.py` — confirms list endpoint has project_id filter
- Code inspection of `backend/src/pilot_space/infrastructure/database/repositories/note_repository.py` — confirms `get_children`, `get_siblings`, `get_descendants` exist
- Code inspection of `frontend/src/stores/UIStore.ts` — localStorage persistence pattern confirmed
- Phase 25 SUMMARY.md — confirms POST move/reorder endpoints, PageTreeResponse schema

### Secondary (MEDIUM confidence)
- STATE.md concern: "TipTap editor coupled to issue property blocks" — investigation showed coupling is weaker than described; risk is unknown nodes in HTML content being stripped by TipTap schema, not a crash
- STATE.md concern: "Sidebar is 671 lines — needs extraction" — confirmed by wc, pre-commit enforces 700-line limit

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all patterns verified in existing code
- Architecture: HIGH — verified against actual file sizes, API contracts, and existing patterns
- Pitfalls: HIGH — four of five pitfalls verified directly in code (schema missing parent_id, UIStore Set issue, sidebar line count, pagination limit)
- Open Questions: MEDIUM — backend NoteCreate extension is confirmed missing; breadcrumb strategy is a design choice not yet validated

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable architecture, 30-day window)
