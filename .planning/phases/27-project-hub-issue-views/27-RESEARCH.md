# Phase 27: Project Hub & Issue Views - Research

**Researched:** 2026-03-13
**Domain:** Frontend — embedded issue views, per-project view persistence, Priority view, emoji icons on notes
**Confidence:** HIGH

## Summary

Phase 27 converts the project "overview" page into an embedded issue hub and adds emoji icon support to all pages (notes). All four requirements are purely frontend changes — no new backend models or migrations are needed.

**HUB-01/02** (Board/List/Table embedded in project page with per-project view persistence): `IssueViewsRoot` already renders Board/List/Table via the existing `IssueViewStore`. The project issues page at `[projectId]/issues/page.tsx` already uses it. The requirement says views appear _within the project page_ (the overview/hub), not in a separate `/issues` sub-route. The `IssueViewStore.viewMode` is stored globally under a single `STORAGE_KEY` — it must be scoped per-project for HUB-02 (view persists per project).

**HUB-03** (Priority swimlane view): There is no Priority view component today. The existing ListView groups by state; a new `PriorityView` component must group issues by `IssuePriority` (`urgent | high | medium | low | none`) in swimlanes. The board and list views use the same `IssueViewStore` group-collapse pattern. The `IssueViewStore` viewMode type must be extended from `'board' | 'list' | 'table'` to include `'priority'`.

**HUB-04** (Emoji icon on pages): The `Note` model and `NoteUpdate` schema have no `icon_emoji` field today. `Project` already has `icon: String(50)`. A new migration and backend schema addition are required: add `icon_emoji: String(10) | None` to `notes` table, expose in `NoteUpdate` and `PageTreeResponse`/`NoteDetailResponse`, and render the emoji in `ProjectPageTree` sidebar nodes and the page header in `[noteId]/page.tsx`.

**Primary recommendation:** Split into two plans — Plan 01: Hub page + Priority view + IssueViewStore per-project persistence; Plan 02: Emoji icon migration + backend schema + frontend render.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HUB-01 | User can view project issues as Board, List, or Table embedded within the project page | `IssueViewsRoot` component exists and accepts `projectId` prop; embed in a new ProjectHubPage replacing the redirect from `/projects/[id]` |
| HUB-02 | User can switch between issue views (Board/List/Table) via a toolbar within the project page, view persists per project | `IssueViewStore.viewMode` must be keyed per project (`STORAGE_KEY + ':' + projectId`); toolbar (`IssueToolbar`) already has view switcher |
| HUB-03 | User can view issues grouped by priority swimlanes (Priority view) | New `PriorityView` component, `viewMode` type extended to include `'priority'`, `IssueToolbar` VIEW_MODES extended with Priority icon |
| HUB-04 | User can set an emoji icon on any page, displayed in sidebar tree and page header | Requires new Alembic migration for `icon_emoji` column on `notes`, `NoteUpdate` schema, `PageTreeResponse` field, `ProjectPageTree` node rendering, page header rendering |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| MobX + mobx-react-lite | 6.x | Reactive view store updates | Project standard (pattern 45) |
| TanStack Query | 5.x | Server state for issues | Already wired in `IssueViewsRoot` |
| @dnd-kit/core | 6.x | Board drag-and-drop | Already used in `BoardView` |
| Next.js App Router | 14.x | Page routing | Project standard |
| shadcn/ui + Tailwind | latest | UI components | Project standard |
| Alembic | 1.x | DB migrations for `icon_emoji` | Project migration tool |
| SQLAlchemy async | 2.x | Backend ORM | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | latest | Icons (BarChart2 for Priority view) | View mode toolbar icon |
| motion/react | latest | Animated expand/collapse | Existing pattern in `ProjectPageTree` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-project localStorage key | URL state or React state | localStorage persists across sessions as required by HUB-02; URL state is ephemeral |
| Separate `/hub` route | Replace `/overview` or use existing `/projects/[id]/page.tsx` | Redirect already exists from `/projects/[id]` → `/overview`; cleanest approach is to make overview the hub OR add a hub route with the redirect pointing to it |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── features/issues/components/views/
│   ├── priority/          # NEW: PriorityView.tsx, PriorityGroup.tsx
│   ├── IssueViewsRoot.tsx # MODIFY: add 'priority' case
│   └── IssueToolbar.tsx   # MODIFY: add Priority to VIEW_MODES
├── stores/features/issues/
│   └── IssueViewStore.ts  # MODIFY: per-project storage key
└── app/(workspace)/[workspaceSlug]/projects/[projectId]/
    └── overview/page.tsx  # MODIFY: embed IssueViewsRoot
```

```
backend/src/pilot_space/
├── infrastructure/database/models/note.py   # ADD: icon_emoji column
├── api/v1/schemas/note.py                   # ADD: icon_emoji to NoteUpdate, PageTreeResponse, NoteDetailResponse
└── alembic/versions/
    └── 080_add_note_icon_emoji.py           # NEW migration
```

### Pattern 1: Per-Project IssueViewStore Persistence
**What:** `IssueViewStore` stores viewMode globally. For HUB-02, the view persists per project.
**When to use:** Whenever IssueViewsRoot is rendered with a `projectId` prop.

Current storage key: `pilot-space:issue-view-state` (single global object).

**Migration approach:** Change the persistence shape to nest viewMode per projectId:
```typescript
// Source: IssueViewStore.ts (existing pattern)
interface PersistedIssueViewState {
  viewMode: 'board' | 'list' | 'table' | 'priority';
  // ...
  projectViewModes: Record<string, 'board' | 'list' | 'table' | 'priority'>; // NEW
}

// In setViewMode, also write projectViewModes[currentProjectId] if projectId is set
// In IssueViewsRoot, pass projectId to issueViewStore so it can scope persistence
```

**Simpler alternative:** `IssueViewStore` exposes a `getViewModeForProject(projectId)` and `setViewModeForProject(projectId, mode)` that reads/writes from a separate `projectViewModes` map in localStorage. The global `viewMode` stays for the workspace-level issues page. IssueViewsRoot receives `projectId` and reads the project-scoped mode if available.

### Pattern 2: Priority View (Swimlanes)
**What:** Issues grouped into collapsible rows by priority: Urgent, High, Medium, Low, None.
**When to use:** When `viewMode === 'priority'` in `IssueViewsRoot`.
**Example:**
```typescript
// Mirror the ListView pattern — same ListGroup component can be reused with priority grouping
// Source: frontend/src/features/issues/components/views/list/ListView.tsx

const PRIORITY_GROUPS = [
  { key: 'urgent', label: 'Urgent', icon: AlertTriangle, iconClass: 'text-red-500' },
  { key: 'high',   label: 'High',   icon: ArrowUp,       iconClass: 'text-orange-500' },
  { key: 'medium', label: 'Medium', icon: Minus,         iconClass: 'text-yellow-500' },
  { key: 'low',    label: 'Low',    icon: ArrowDown,     iconClass: 'text-blue-400' },
  { key: 'none',   label: 'No Priority', icon: CircleDashed, iconClass: 'text-muted-foreground' },
];

// Group logic (mirror getIssueState in ListView):
function getIssuePriority(issue: Issue): IssuePriority {
  return issue.priority ?? 'none';
}
```

`ListGroup` and `ListRow` can be reused verbatim — they are already generic enough (they take `issues: Issue[]` and the row component renders priority already).

### Pattern 3: Emoji Icon on Notes
**What:** `icon_emoji` field (single Unicode emoji, max 10 chars) on the `notes` table, nullable. Displayed before title in sidebar tree nodes and page header.
**When to use:** User clicks an emoji picker trigger on any page header or note title block.

**Backend flow:**
1. Add `icon_emoji: Mapped[str | None]` column to `Note` ORM model
2. Add migration `080_add_note_icon_emoji.py` (single ALTER TABLE + index, RLS policies unchanged)
3. Add `icon_emoji: str | None` to `NoteUpdate`, expose in `PageTreeResponse` and `NoteDetailResponse`
4. Expose in `UpdateNotePayload` in `update_note_service.py`

**Frontend flow:**
1. Add `iconEmoji?: string | null` to the `Note` TypeScript interface
2. Add `iconEmoji?: string | null` to `UpdateNoteData`
3. Render in `ProjectPageTree` TreeNode: replace `<FileText>` with emoji character when `node.iconEmoji` is set
4. Render in page header of `[noteId]/page.tsx`: show emoji before `<h1>` title
5. Emoji picker: use an inline `<button>` that opens a Radix Popover containing an emoji picker input or a curated emoji grid. For simplicity, a text input that accepts a single emoji character is sufficient for v1 (no full emoji picker library needed — avoid dependency bloat)

### Anti-Patterns to Avoid
- **Separate hub page route `/projects/[id]/hub`**: Unnecessary new route; the requirement says "embedded within the project page" — modifying the existing `/overview` page (or making `/projects/[id]` render the hub directly) is cleaner.
- **Global IssueViewStore viewMode for project-scoped views**: The current global `viewMode` will cause switching view in one project to affect all others. Must scope to projectId.
- **Installing a full emoji picker library** (emoji-mart, etc.): The requirement is basic — a text input for emoji is sufficient for v1. Do not add 40KB+ dependencies.
- **Adding `icon_emoji` to the `projects` table**: `Project` already has `icon: String(50)`. That's separate from `HUB-04` which requires emoji on pages (notes). Do not conflate them.
- **Putting Priority view in the backend**: Priority is already a field on `Issue`. The view is purely a frontend grouping — no new API calls needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Issue list in priority swimlanes | Custom grouped list | Reuse `ListGroup` + `ListRow` from ListView | Already handles collapse, bulk actions, state change |
| Board/List/Table in project hub | Duplicate component | Reuse `IssueViewsRoot` with `projectId` prop | Already handles filtering, loading, handlers |
| Emoji picker UI | Custom picker grid | Simple text `<input>` in Radix Popover | Sufficient for v1, zero dependency |
| View mode toggle buttons | New toolbar component | Extend `VIEW_MODES` array in existing `IssueToolbar` | Consistent UX with workspace issues page |

**Key insight:** Nearly all UI infrastructure for HUB-01/02/03 already exists. The work is wiring and scoping, not building.

## Common Pitfalls

### Pitfall 1: IssueViewStore Singleton Shares State
**What goes wrong:** `IssueViewsRoot` at `/projects/[id]/overview` and at `/issues` share the same `IssueViewStore` instance. Switching to Priority view in the project hub switches it for the workspace issues page too.
**Why it happens:** `IssueViewStore` is a singleton on `RootStore` with a single `viewMode` field.
**How to avoid:** Add `projectViewModes: Map<string, ViewMode>` to the store. `IssueViewsRoot` passes its `projectId` to `issueViewStore.getEffectiveViewMode(projectId)` and `setEffectiveViewMode(projectId, mode)`. The global `viewMode` remains for when `projectId` is undefined.
**Warning signs:** Switching view on project hub changes the view on workspace issues page.

### Pitfall 2: Alembic Migration Chain Broken
**What goes wrong:** New migration references wrong parent revision.
**Why it happens:** Known bug — three `022_*` files conflicted. Must verify head before writing `down_revision`.
**How to avoid:** `cd backend && alembic heads` before creating `080_add_note_icon_emoji.py`. Expected: single head `079_add_page_tree_columns`.
**Warning signs:** `alembic heads` shows multiple heads.

### Pitfall 3: NoteUpdate Missing icon_emoji breaks PATCH endpoint
**What goes wrong:** `icon_emoji` set by frontend but `NoteUpdate` schema does not include it → field silently dropped.
**Why it happens:** `update_data = note_data.model_dump(exclude_unset=True)` only passes declared fields.
**How to avoid:** Add `icon_emoji: str | None = Field(default=None, ...)` to `NoteUpdate` AND wire it in `UpdateNotePayload` in `update_note_service.py`.

### Pitfall 4: PageTreeResponse Missing icon_emoji
**What goes wrong:** Sidebar tree does not show emoji because the list endpoint returns `NoteResponse` (no `icon_emoji`), not `PageTreeResponse`.
**Why it happens:** `notesApi.list()` returns `NoteResponse` items; `PageTreeResponse` extends `NoteResponse` with tree fields.
**How to avoid:** Add `icon_emoji` to `NoteResponse` (not just `PageTreeResponse`) so it appears in all list responses used by the sidebar. Or ensure the list endpoint returns `PageTreeResponse` for tree calls. Simpler: add `icon_emoji` to `NoteResponse` directly since it's a display-only field.

### Pitfall 5: Priority View 'priority' not in IssueViewStore persistence shape
**What goes wrong:** After adding `'priority'` to `viewMode` type, old localStorage entries may have stale values causing hydration errors.
**Why it happens:** TypeScript type is updated but `loadFromStorage` has `state.viewMode ?? 'board'` which will silently default to `'board'` for unknown values — actually safe.
**How to avoid:** Verify the fallback default in `loadFromStorage` handles unknown values gracefully (it already does via `?? 'board'`).

### Pitfall 6: IssueToolbar 'priority' mode hidden on mobile
**What goes wrong:** The TABLE → LIST auto-switch on mobile (in `IssueViewsRoot`) only handles `table` mode, not `priority` mode.
**Why it happens:** Hard-coded `if viewMode === 'table'` check in the mobile media query handler.
**How to avoid:** Add `priority` to the mobile fallback: if `e.matches && (viewMode === 'table' || viewMode === 'priority')` → switch to `list`. Or leave priority as desktop-only (acceptable for v1).

## Code Examples

### Embed IssueViewsRoot in Project Hub (overview page)
```typescript
// Source: frontend/src/app/(workspace)/[workspaceSlug]/projects/[projectId]/overview/page.tsx
// Replace current stats+widgets layout with embedded issue views

'use client';
import { IssueViewsRoot } from '@/features/issues/components/views/IssueViewsRoot';

export default function ProjectHubPage() {
  const params = useParams<{ workspaceSlug: string; projectId: string }>();
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-2xl font-semibold">Issues</h1>
      </div>
      <IssueViewsRoot
        workspaceSlug={params.workspaceSlug}
        projectId={params.projectId}
      />
    </div>
  );
}
```

### Per-Project View Mode in IssueViewStore
```typescript
// Source: frontend/src/stores/features/issues/IssueViewStore.ts

// Add to PersistedIssueViewState:
projectViewModes: Record<string, ViewMode>;

// New methods:
getEffectiveViewMode(projectId?: string): ViewMode {
  if (projectId && this.projectViewModes[projectId]) {
    return this.projectViewModes[projectId]!;
  }
  return this.viewMode;
}

setEffectiveViewMode(mode: ViewMode, projectId?: string): void {
  if (projectId) {
    this.projectViewModes[projectId] = mode;
  } else {
    this.viewMode = mode;
  }
}
```

### Priority View Grouping
```typescript
// Source: mirror of frontend/src/features/issues/components/views/list/ListView.tsx

import { ListGroup } from '../list/ListGroup';

const PRIORITY_GROUPS = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high',   label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low',    label: 'Low' },
  { key: 'none',   label: 'No Priority' },
] as const;

// Group issues by priority, render each group as a ListGroup
const groupedIssues = React.useMemo(() => {
  const groups: Record<string, Issue[]> = {};
  for (const g of PRIORITY_GROUPS) groups[g.key] = [];
  for (const issue of issues) {
    const key = issue.priority ?? 'none';
    groups[key]?.push(issue);
  }
  return groups;
}, [issues]);
```

### Migration for icon_emoji
```python
# Source: backend/alembic/versions/080_add_note_icon_emoji.py

revision = "080_add_note_icon_emoji"
down_revision = "079_add_page_tree_columns"

def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("icon_emoji", sa.String(10), nullable=True),
    )
    op.create_index("ix_notes_icon_emoji", "notes", ["icon_emoji"],
                    postgresql_where=text("icon_emoji IS NOT NULL"))

def downgrade() -> None:
    op.drop_index("ix_notes_icon_emoji", table_name="notes")
    op.drop_column("notes", "icon_emoji")
```

### Emoji Display in TreeNode
```typescript
// Source: frontend/src/components/layout/ProjectPageTree.tsx (TreeNode component)
// Replace <FileText> icon with emoji when available

{node.iconEmoji ? (
  <span className="shrink-0 w-3 text-center text-xs leading-none">{node.iconEmoji}</span>
) : (
  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate `/issues` route for project issues | Embed `IssueViewsRoot` in project hub page | Phase 27 | Project hub becomes primary issue entry point |
| Global viewMode in IssueViewStore | Per-project viewMode map + global fallback | Phase 27 | Each project remembers its own view preference |
| `FileText` icon on all page tree nodes | Emoji icon when `iconEmoji` set, `FileText` fallback | Phase 27 | Visual identity for pages |

**Deprecated/outdated:**
- `[projectId]/overview/page.tsx` current content (stats widgets + active cycle + recent issues cards): Replaced entirely by the embedded `IssueViewsRoot` hub. The old overview content is removed — not worth preserving at this phase.

## Open Questions

1. **Should the overview page be the hub, or should a new route be added?**
   - What we know: `/projects/[id]` redirects to `/overview`. `ProjectSidebar` nav item "Overview" links to `/overview`.
   - What's unclear: Does the planner want to rename "Overview" → "Issues" in the `ProjectSidebar` nav, or keep the route as `/overview` and replace its content?
   - Recommendation: Keep the route segment as `/overview` (no URL breaking change), rename the nav label from "Overview" to "Issues" in `ProjectSidebar.NAV_ITEMS`, replace the overview page content with `IssueViewsRoot`. The separate `/issues` sub-route already exists for direct link access — it can remain as-is or be made to redirect to overview.

2. **Should the old stats/cycle/recent-issues widgets be preserved anywhere?**
   - What we know: Requirements only mention embedded issue views. No stats requirement in Phase 27.
   - What's unclear: Whether the overview stats should move elsewhere.
   - Recommendation: Remove the old overview content in Phase 27. Stats can be added back in Phase 28 or later if needed.

3. **Emoji picker UX: text input vs. curated grid?**
   - What we know: Requirement says "set an emoji icon" — implementation details are at Claude's discretion.
   - Recommendation: Text input in a Radix Popover for v1. No external emoji picker library. User types or pastes an emoji character. Validation: trim to first grapheme cluster.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (frontend) + pytest (backend) |
| Config file | `frontend/vite.config.ts` / `backend/pyproject.toml` |
| Quick run command (frontend) | `cd frontend && pnpm test -- --reporter=verbose` |
| Quick run command (backend) | `cd backend && uv run pytest tests/ -x -q` |
| Full suite command | `make quality-gates-frontend && make quality-gates-backend` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HUB-01 | IssueViewsRoot renders within project overview page | unit | `cd frontend && pnpm test -- src/app/\\(workspace\\)/\\[workspaceSlug\\]/projects/\\[projectId\\]/overview` | ❌ Wave 0 |
| HUB-02 | Per-project viewMode persistence in IssueViewStore | unit | `cd frontend && pnpm test -- IssueViewStore` | ❌ Wave 0 (extend existing store tests) |
| HUB-03 | PriorityView groups issues by priority | unit | `cd frontend && pnpm test -- PriorityView` | ❌ Wave 0 |
| HUB-04 | NoteUpdate accepts icon_emoji, migration adds column | unit (backend) | `cd backend && uv run pytest tests/unit/ -k "icon_emoji" -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && pnpm test -- --reporter=dot` (frontend) or `cd backend && uv run pytest tests/unit/ -x -q` (backend)
- **Per wave merge:** `make quality-gates-frontend && make quality-gates-backend`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/stores/features/issues/__tests__/IssueViewStore.test.ts` — extend with per-project viewMode tests (file may exist, needs new test cases)
- [ ] `frontend/src/features/issues/components/views/priority/__tests__/PriorityView.test.tsx` — covers HUB-03
- [ ] `backend/tests/unit/schemas/test_note_icon_emoji.py` — covers HUB-04 schema validation
- [ ] `backend/tests/unit/migrations/test_080_migration.py` — optional; migration validated by `alembic check`

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `IssueViewsRoot.tsx`, `IssueViewStore.ts`, `IssueToolbar.tsx`, `ListView.tsx`, `BoardView.tsx`, `ProjectPageTree.tsx`, `sidebar.tsx` — feature surface and integration points
- Direct inspection of `note.py` (ORM), `note.py` (schema), `project.py` (ORM) — confirms `icon_emoji` field does not exist on Note, `icon` field exists on Project
- Direct inspection of `079_add_page_tree_columns.py` — confirms migration chain, next revision is `079_*`

### Secondary (MEDIUM confidence)
- Code inspection of `update_note_service.py`, `workspace_notes.py` router — confirms PATCH endpoint flow for Note updates

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use
- Architecture: HIGH — IssueViewsRoot and ListView patterns verified from source
- Pitfalls: HIGH — identified from direct code inspection of IssueViewStore, migration chain, and schema gaps
- Priority view grouping: HIGH — pattern mirrors ListView exactly

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable codebase, no fast-moving dependencies)
