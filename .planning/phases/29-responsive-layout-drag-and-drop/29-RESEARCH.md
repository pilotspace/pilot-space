# Phase 29: Responsive Layout & Drag-and-Drop - Research

**Researched:** 2026-03-13
**Domain:** Responsive layout (tablet breakpoint) + dnd-kit tree drag-and-drop
**Confidence:** HIGH

## Summary

Phase 29 completes the v1.0.0-alpha2 milestone. Two independent concerns: (1) tablet responsive
behavior for sidebar collapse and content area, (2) drag-and-drop reordering and re-parenting in
the sidebar page tree. The project already has the full infrastructure in place — both concerns are
primarily about wiring together existing pieces correctly.

**Responsive (UI-02, UI-03):** `useResponsive()` already treats 768–1024px (`isSmallScreen: true`)
as a collapsed sidebar that slides over as an overlay. The current logic is correct but the sidebar
page trees (`ProjectPageTree`, `PersonalPagesList`) are unconditionally hidden when `collapsed` is
true (see `sidebar.tsx` line 504: `{!collapsed && ...}`). On tablet, the overlay opens at full
260px width so trees ARE visible — but the content area itself has no tablet-specific layout
adjustments. Phase 29 work here is: (a) verify/fix the icon-rail mode is a proper 60px icon rail on
tablet (currently sidebar auto-collapses to overlay-only on mobile/tablet; there is no icon-rail
mode for 768–1024), and (b) add tablet-specific layout adjustments to content area pages.

**Drag-and-drop (UI-04):** `@dnd-kit/core ^6.3.1`, `@dnd-kit/sortable ^10.0.0`, and
`@dnd-kit/utilities ^3.2.2` are already installed. The project uses dnd-kit in `BoardView` (column
kanban drag) and `OutlineTree` already — so the team knows the API. Backend endpoints
`POST /{workspace_id}/notes/{note_id}/move` and `POST /{workspace_id}/notes/{note_id}/reorder`
exist and are tested. The frontend has no `movePage` or `reorderPage` methods in `notesApi` yet —
those need to be added. The `ProjectPageTree` component needs dnd-kit wrappers around its tree nodes.

**Primary recommendation:** Add `movePage`/`reorderPage` to `notesApi`, wrap `ProjectPageTree` in a
`DndContext` with `SortableContext`, handle `onDragEnd` to call the right backend endpoint (reorder
vs move based on `parentId` change), and refine the AppShell tablet breakpoint to show an icon-rail
at 768–1024px rather than forcing full overlay.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| UI-02 | Sidebar collapses to icon rail or overlay on tablet (768-1024px) | `useResponsive.isSmallScreen` covers 768–1024 as overlay; needs icon-rail option for tablet (distinct from mobile overlay) |
| UI-03 | Content area adapts layout for tablet viewport | `NoteCanvasLayout` already has responsive max-w classes; issue pages and hub pages need reduced margins/padding for md breakpoint |
| UI-04 | User can drag-and-drop pages in sidebar tree to reorder and re-parent | dnd-kit installed; backend move/reorder endpoints ready; `notesApi` missing move/reorder methods; `ProjectPageTree` needs DndContext wrapping |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.3.1 | DnD primitives: sensors, DndContext, DragOverlay | Already installed, used in BoardView |
| @dnd-kit/sortable | ^10.0.0 | useSortable hook + SortableContext for list/tree reordering | Already installed, used in DraggableCard |
| @dnd-kit/utilities | ^3.2.2 | CSS.Transform utility for transform strings | Already installed |
| motion/react | ^12.28.1 | Sidebar slide animation | Already used in app-shell.tsx |
| useResponsive | local hook | Breakpoint detection via useSyncExternalStore | Already used in sidebar and app-shell |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TanStack Query | ^5.90.19 | Cache invalidation after successful move/reorder | After drag-end API call succeeds, invalidate `projectPageTree` query |
| sonner | ^2.0.7 | Error toast on failed drag | Same pattern as BoardView |

**Installation:** No new packages required. All dependencies are already in package.json.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── services/api/notes.ts         # Add movePage() and reorderPage()
├── features/notes/hooks/
│   ├── useMovePage.ts            # New TanStack mutation hook
│   └── useReorderPage.ts         # New TanStack mutation hook
├── components/layout/
│   ├── ProjectPageTree.tsx       # Add DndContext + drag handles
│   ├── DraggableTreeNode.tsx     # New: tree node with useSortable
│   └── app-shell.tsx             # Refine tablet breakpoint behavior
└── features/notes/hooks/
    └── useProjectPageTree.ts     # Existing — no changes needed
```

### Pattern 1: dnd-kit Tree Drag-and-Drop

**What:** Wrap `ProjectPageTree` content in a `DndContext` + flat `SortableContext`. Each tree node
gets `useSortable`. On `onDragEnd`, detect if `parentId` changed (re-parent → call `movePage`) or
stayed the same (reorder → call `reorderPage`).

**Key constraint:** dnd-kit's `SortableContext` works on a flat `items` array. For a tree, you need
to flatten the visible nodes into a sorted `items` array (use existing `flattenTree` from
`lib/tree-utils.ts`). The depth constraint (max depth 2, enforced backend) must also be checked
client-side to show a visual rejection cue during drag.

**Sensor setup (match BoardView pattern):**
```typescript
// Source: existing BoardView.tsx pattern
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
);
```

**Drag end logic:**
```typescript
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;

  const activeNode = findNode(active.id as string, treeNodes);
  const overNode  = findNode(over.id as string, treeNodes);
  if (!activeNode || !overNode) return;

  if (activeNode.parentId === overNode.parentId) {
    // Same parent → reorder (insert after overNode sibling)
    reorderPage.mutate({ noteId: activeNode.id, insertAfterId: overNode.id });
  } else {
    // Different parent → re-parent (move to overNode's parent)
    movePage.mutate({ noteId: activeNode.id, newParentId: overNode.parentId });
  }
};
```

**Depth limit visual enforcement:** During `onDragOver`, compute potential new depth and add a
CSS class to the drop target to indicate rejection (red border, not-allowed cursor) when
`activeNode.depth + maxSubtreeDepth > 2`.

### Pattern 2: Tablet Sidebar Behavior

**Current state:** `isSmallScreen = isMobile || isTablet` collapses sidebar to overlay for both
mobile (< 768px) and tablet (768–1024px). The requirement says "icon rail or overlay on tablet".

**Recommended approach:** Differentiate tablet from mobile in AppShell:
- **Mobile (< 768px):** overlay drawer (current behavior — keep)
- **Tablet (768–1024px):** icon rail at 60px width (same as desktop collapsed state, but auto-triggered)
- **Desktop (> 1024px):** full sidebar, user-controlled collapse

Implementation: use `useResponsive().isTablet` (already defined as 768–1024px) separately from
`isMobile`. When `isTablet`, auto-collapse to icon-rail (60px) rather than overlay. Remove the
hamburger topbar on tablet since icon rail is always visible.

```typescript
// In app-shell.tsx, replace isSmallScreen monolith:
const { isMobile, isTablet } = useResponsive();

// Auto-collapse on resize
useEffect(() => {
  if (isMobile) uiStore.setSidebarCollapsed(true);     // overlay
  else if (isTablet) uiStore.setSidebarCollapsed(true); // icon-rail at 60px
}, [isMobile, isTablet]);

// Render: overlay only on mobile; icon-rail on tablet/desktop
{isMobile ? (
  // AnimatePresence overlay (current pattern)
) : (
  // motion.aside with width: collapsed ? 60 : sidebarWidth
)}
```

The Sidebar component's `{!collapsed && ...}` blocks for page trees/sections already handle 60px
icon-rail correctly — they hide text content but show icon-only nav items with Tooltip labels.

### Pattern 3: Content Area Tablet Adaptation (UI-03)

**What:** At 768–1024px, reduce content area margins and make elements stack where they were
side-by-side.

**Where to apply:** Tailwind responsive prefixes on existing layout containers. The primary pages
to audit:
- `NoteCanvasLayout.tsx`: already has responsive max-w classes (`sm:max-w-[640px] md:max-w-[680px]`)
- Issue hub page (ProjectPageTree view, issue views toolbar)
- Settings pages sidebar/content split

**Approach:** Use Tailwind `md:` prefix for 768px+ adjustments and `lg:` for 1024px+. Since
sidebar is icon-rail at tablet, content area gains ~200px — ensure `min-w-0` flex children don't
overflow.

### Pattern 4: Backend API Client Methods

**Add to `notesApi` in `services/api/notes.ts`:**
```typescript
movePage(workspaceId: string, noteId: string, newParentId: string | null): Promise<Note> {
  return apiClient.post<Note>(`/workspaces/${workspaceId}/notes/${noteId}/move`, {
    new_parent_id: newParentId,
  });
},

reorderPage(workspaceId: string, noteId: string, insertAfterId: string | null): Promise<Note> {
  return apiClient.post<Note>(`/workspaces/${workspaceId}/notes/${noteId}/reorder`, {
    insert_after_id: insertAfterId,
  });
},
```

Backend endpoints:
- `POST /workspaces/{id}/notes/{note_id}/move` — body: `{ new_parent_id: UUID | null }`
- `POST /workspaces/{id}/notes/{note_id}/reorder` — body: `{ insert_after_id: UUID | null }`
- Both return `PageTreeResponse` (NoteResponse + parent_id, depth, position)
- Both raise 422 on depth violation or cross-project move

### Pattern 5: TanStack Query Cache Invalidation After Drag

```typescript
// In useMovePage.ts / useReorderPage.ts
onSuccess: () => {
  // Invalidate the project page tree query to re-fetch sorted/re-parented tree
  queryClient.invalidateQueries({ queryKey: ['projectPageTree', workspaceId, projectId] });
},
onError: () => {
  toast.error('Failed to move page');
  // Optimistic rollback: invalidate to re-fetch original state
  queryClient.invalidateQueries({ queryKey: ['projectPageTree', workspaceId, projectId] });
},
```

### Anti-Patterns to Avoid

- **Re-implementing tree DnD from scratch:** dnd-kit `useSortable` handles pointer, touch, and keyboard sensors correctly. Do not use raw HTML5 DnD API.
- **Using `arrayMove` from dnd-kit/sortable for tree nodes:** `arrayMove` is for flat lists. Tree reordering goes through the backend reorder endpoint — do not do client-side position arithmetic.
- **Passing `data-*` attributes to carry parentId through dnd-kit:** Use `data` field in `useSortable({ id, data: { parentId, depth } })` instead.
- **Triggering drag on click/link activation:** Set `activationConstraint: { distance: 8 }` on `PointerSensor` — this prevents accidental drags when clicking tree node links.
- **Nesting DndContext:** Do not nest the tree DndContext inside the BoardView DndContext. They are in different parts of the component tree so there is no risk, but confirm via component hierarchy before coding.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Touch drag support | Custom touch handlers | `TouchSensor` from @dnd-kit/core | TouchSensor handles scroll lock, delay, tolerance |
| Keyboard accessibility for drag | Custom keyboard nav | `KeyboardSensor` + `sortableKeyboardCoordinates` | Built-in, ARIA-correct |
| Drag overlay (ghost element) | Custom portal + position tracking | `DragOverlay` from @dnd-kit/core | Handles z-index, pointer events, smooth position |
| Breakpoint detection | `window.addEventListener('resize')` | `useMediaQuery` (existing hook, useSyncExternalStore) | SSR-safe, deduped, reactive |
| Position arithmetic | Client-side gap resequencing | Backend `reorderPage` endpoint | Gap-based algorithm with resequence logic lives in `ReorderPageService` |

## Common Pitfalls

### Pitfall 1: DnD Conflict with Link Clicks in Tree Nodes
**What goes wrong:** Every click on a tree node link fires a drag start, navigating AND dragging.
**Why it happens:** PointerSensor fires on `pointerdown` with no distance threshold by default.
**How to avoid:** `useSensor(PointerSensor, { activationConstraint: { distance: 8 } })` — drag only activates after 8px movement.
**Warning signs:** Clicking a tree node link triggers `onDragStart`.

### Pitfall 2: isSmallScreen Conflates Tablet and Mobile
**What goes wrong:** Both mobile and tablet get overlay behavior, but the requirement asks for icon-rail on tablet (768–1024px).
**Why it happens:** `isSmallScreen = isMobile || isTablet` in `useResponsive`. AppShell uses `isSmallScreen` for the overlay decision.
**How to avoid:** Destructure `{ isMobile, isTablet }` separately. Use `isMobile` for overlay; use `isTablet` for icon-rail auto-collapse.
**Warning signs:** iPad viewport shows overlay drawer instead of icon-rail.

### Pitfall 3: SortableContext items Array Must Match Rendered Nodes
**What goes wrong:** Nodes rendered in JSX differ from `items` array, causing dnd-kit warnings and broken drag behavior.
**Why it happens:** Tree is nested (recursive children) but `SortableContext` needs a flat array.
**How to avoid:** Pass `flattenTree(treeNodes).map(n => n.id)` as the `items` prop to `SortableContext`. Every rendered `useSortable` id must be in this array.
**Warning signs:** Console warning "Draggable item with id X is not present in sortable items".

### Pitfall 4: Re-parenting Depth Enforcement Client-Side
**What goes wrong:** User drags a root node (depth 0) with children onto a depth-2 node. Backend rejects with 422, tree snaps back, poor UX.
**Why it happens:** No client-side depth check before calling the API.
**How to avoid:** During `onDragOver`, compute `newDepth = targetParentDepth + 1 + activeSubtreeHeight`. If `newDepth > 2`, set `canDrop = false` and show visual rejection. The depth limit is 3 levels (depth 0, 1, 2 — per TREE-01 requirement).
**Warning signs:** 422 errors appear in network tab after drop.

### Pitfall 5: Optimistic Updates on Tree Drag Cause Position Desync
**What goes wrong:** Optimistically reorder tree locally but server assigns different positions (gap resequence), causing a flicker when server response arrives.
**Why it happens:** Position values are opaque integers managed by `ReorderPageService`. Client doesn't know the new position value.
**How to avoid:** Do NOT do optimistic tree reordering. Call API immediately on drag end (fast enough — position endpoint is a single DB write), then invalidate the query. The tree re-renders from server state.
**Warning signs:** Tree items jump after successful drop.

### Pitfall 6: Sidebar Page Trees Hidden in Icon-Rail Mode
**What goes wrong:** In icon-rail (collapsed) mode, `sidebar.tsx` line 504 has `{!collapsed && ...}` which hides all page trees. On tablet, tree DnD would be invisible in icon-rail mode.
**Why it happens:** Collapsed sidebar hides text/tree content by design.
**How to avoid:** This is correct behavior. DnD is only possible when sidebar is expanded (full or overlay). Icon-rail mode is navigation-only. No change needed — document this as a known design decision.
**Warning signs:** Users cannot drag in icon-rail mode (expected behavior, not a bug).

## Code Examples

### Adding API methods to notesApi

```typescript
// Source: backend schema note.py MovePageRequest / ReorderPageRequest
// Add to frontend/src/services/api/notes.ts:

movePage(workspaceId: string, noteId: string, newParentId: string | null): Promise<Note> {
  return apiClient.post<Note>(`/workspaces/${workspaceId}/notes/${noteId}/move`, {
    new_parent_id: newParentId,
  });
},

reorderPage(workspaceId: string, noteId: string, insertAfterId: string | null): Promise<Note> {
  return apiClient.post<Note>(`/workspaces/${workspaceId}/notes/${noteId}/reorder`, {
    insert_after_id: insertAfterId,
  });
},
```

### useSortable in TreeNode with data payload

```typescript
// Source: @dnd-kit/sortable useSortable API
function DraggableTreeNode({ node, ...props }: TreeNodeProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    data: {
      parentId: node.parentId,
      depth: node.depth,
      type: 'tree-node',
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* drag handle */}
      <button {...listeners} {...attributes} aria-label="drag to reorder" className="...">
        <GripVertical className="h-3 w-3" />
      </button>
      {/* existing node content */}
    </div>
  );
}
```

### DndContext wrapper in ProjectPageTree

```typescript
// Source: existing BoardView.tsx DndContext pattern
const flatItems = flattenTree(treeNodes).map(n => n.id);

return (
  <DndContext
    sensors={sensors}
    collisionDetection={closestCenter}
    onDragStart={handleDragStart}
    onDragEnd={handleDragEnd}
  >
    <SortableContext items={flatItems} strategy={verticalListSortingStrategy}>
      <div className="space-y-px">
        {treeNodes.map((node) => (
          <DraggableTreeNode key={node.id} node={node} ... />
        ))}
      </div>
    </SortableContext>
    <DragOverlay>
      {activeNode ? <TreeNodeOverlay node={activeNode} /> : null}
    </DragOverlay>
  </DndContext>
);
```

### AppShell tablet breakpoint differentiation

```typescript
// Source: existing app-shell.tsx + useResponsive hook
const { isMobile, isTablet } = useResponsive();

// Auto-collapse: overlay on mobile, icon-rail on tablet
useEffect(() => {
  if (isMobile || isTablet) {
    uiStore.setSidebarCollapsed(true);
  }
}, [isMobile, isTablet]);

// Render: overlay drawer only on mobile
{isMobile ? (
  <AnimatePresence>
    {sidebarOpen && (
      <motion.aside className="fixed inset-y-0 left-0 z-50 flex w-[260px] ...">
        <Sidebar />
      </motion.aside>
    )}
  </AnimatePresence>
) : (
  <motion.aside
    animate={{ width: uiStore.sidebarCollapsed ? 60 : uiStore.sidebarWidth }}
    className="relative flex h-full flex-col border-r ..."
  >
    <Sidebar />
  </motion.aside>
)}

{/* Hamburger only on mobile (not tablet — icon-rail is always visible) */}
{isMobile && !sidebarOpen && (
  <div className="flex h-10 items-center ...">
    <Button onClick={() => uiStore.setSidebarCollapsed(false)} ...>
      <Menu />
    </Button>
  </div>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| HTML5 native DnD API | @dnd-kit (pointer/touch/keyboard sensors) | ~2021 | Accessible, touch-friendly, SSR-compatible |
| react-beautiful-dnd | @dnd-kit | 2022 (rbd deprecated) | dnd-kit is the current standard |
| Client-side tree position arithmetic | Backend gap-based reordering via API | Phase 25 | No client-side position math needed |

**Deprecated/outdated:**
- `react-beautiful-dnd`: No longer maintained. Not installed in this project.
- `react-dnd`: Old, complex API. Not installed in this project.

## Open Questions

1. **Icon-rail on tablet vs overlay on tablet**
   - What we know: The requirement says "icon rail or overlay on tablet" — both are acceptable
   - What's unclear: UX preference between the two for 768–1024px
   - Recommendation: Use icon-rail (60px) for tablet since it is already implemented for desktop collapsed state and doesn't obscure content. If UX testing shows issues, overlay is a one-line change.

2. **DnD for PersonalPagesList**
   - What we know: UI-04 says "drag a page in the sidebar tree" — PersonalPagesList is a flat list of personal pages
   - What's unclear: Does "sidebar tree" include personal pages or only project page trees?
   - Recommendation: Include PersonalPagesList drag-to-reorder since the backend `ReorderPageService` supports personal pages (they have position fields). Re-parenting doesn't apply (personal pages are flat — depth 0 only). Scope to reorder-only for personal pages.

3. **Content area tablet adaptation specifics**
   - What we know: `NoteCanvasLayout` already has `md:max-w-[680px]` breakpoint classes
   - What's unclear: Which other pages (issues list, board, settings) need explicit tablet adjustments
   - Recommendation: Audit by running at 900px viewport. Priority pages: issue hub embedded views (board column min-width may require horizontal scroll on tablet), settings layout (two-column nav+content may stack).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.1.0 + @testing-library/react ^16.2.0 |
| Config file | `frontend/vitest.config.ts` |
| Quick run command | `cd frontend && pnpm test -- --run --reporter=verbose src/components/layout src/features/notes/hooks/useMovePage src/features/notes/hooks/useReorderPage src/services/api` |
| Full suite command | `cd frontend && pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-02 | Sidebar collapses to icon rail on tablet (768–1024px) | unit | `pnpm test -- --run src/components/layout/__tests__/app-shell.test.tsx` | ❌ Wave 0 |
| UI-02 | Sidebar shows as overlay on mobile (< 768px) | unit | same file | ❌ Wave 0 |
| UI-03 | Content area renders with tablet breakpoint classes | unit/smoke | `pnpm test -- --run src/components/editor/__tests__/NoteCanvasLayout.test.tsx` | ❌ Wave 0 |
| UI-04 | `notesApi.movePage` sends correct request body | unit | `pnpm test -- --run src/services/api/__tests__/notes.test.ts` | ❌ Wave 0 (notes.test.ts may exist) |
| UI-04 | `notesApi.reorderPage` sends correct request body | unit | same file | ❌ Wave 0 |
| UI-04 | `useMovePage` invalidates projectPageTree cache on success | unit | `pnpm test -- --run src/features/notes/hooks/__tests__/useMovePage.test.tsx` | ❌ Wave 0 |
| UI-04 | `useReorderPage` invalidates projectPageTree cache on success | unit | same file pattern | ❌ Wave 0 |
| UI-04 | ProjectPageTree renders DndContext with flattened items | unit | `pnpm test -- --run src/components/layout/__tests__/ProjectPageTree.test.tsx` | ✅ (exists, needs DnD assertions) |
| UI-04 | Drag end with same parentId calls reorderPage not movePage | unit | `pnpm test -- --run src/components/layout/__tests__/ProjectPageTree.test.tsx` | ✅ (needs new test case) |
| UI-04 | Drag end with different parentId calls movePage not reorderPage | unit | same | ✅ (needs new test case) |

### Sampling Rate
- **Per task commit:** `cd frontend && pnpm test -- --run src/components/layout src/features/notes/hooks`
- **Per wave merge:** `cd frontend && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/components/layout/__tests__/app-shell.test.tsx` — covers UI-02 (tablet icon-rail vs mobile overlay breakpoint behavior)
- [ ] `frontend/src/features/notes/hooks/__tests__/useMovePage.test.tsx` — covers UI-04 move mutation + cache invalidation
- [ ] `frontend/src/features/notes/hooks/__tests__/useReorderPage.test.tsx` — covers UI-04 reorder mutation + cache invalidation
- [ ] Check whether `frontend/src/services/api/__tests__/notes.test.ts` exists; if not, create it for movePage/reorderPage API method tests

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `frontend/src/components/layout/app-shell.tsx` — existing responsive behavior
- Codebase inspection: `frontend/src/hooks/useMediaQuery.ts` — `useResponsive()` with `isMobile`, `isTablet`, `isSmallScreen`
- Codebase inspection: `frontend/src/components/layout/sidebar.tsx` — collapsed state rendering, icon-rail at 60px
- Codebase inspection: `frontend/src/features/issues/components/views/board/BoardView.tsx` — existing dnd-kit sensor/DndContext/DragOverlay pattern
- Codebase inspection: `frontend/src/features/issues/components/views/board/DraggableCard.tsx` — useSortable with overlay
- Codebase inspection: `frontend/package.json` — confirms @dnd-kit/core ^6.3.1, @dnd-kit/sortable ^10.0.0, @dnd-kit/utilities ^3.2.2
- Codebase inspection: `backend/src/pilot_space/api/v1/routers/workspace_notes.py` — move_page and reorder_page endpoints
- Codebase inspection: `backend/src/pilot_space/api/v1/schemas/note.py` — MovePageRequest (new_parent_id), ReorderPageRequest (insert_after_id)
- Codebase inspection: `frontend/src/lib/tree-utils.ts` — flattenTree, buildTree utilities

### Secondary (MEDIUM confidence)
- dnd-kit documentation (verified against installed versions): `useSortable` data field for carrying custom metadata through drag events; `SortableContext` requires flat items array matching rendered ids

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and used in-project
- Architecture: HIGH — backend endpoints fully implemented, existing patterns to follow
- Pitfalls: HIGH — identified from direct code inspection + dnd-kit known constraints

**Research date:** 2026-03-13
**Valid until:** 2026-04-12 (stable libraries, 30-day validity)
