# Design: ProjectContextHeader

**Date**: 2026-02-26
**Status**: Approved
**Scope**: Frontend only — 1 new component, 2 modified files

---

## Problem

The issue detail page and note detail page have no visible project context. A user opening `PS-42` or a note has no quick way to navigate to the parent project's Issues, Overview, or Cycles without going back to the sidebar. Inspired by GitHub's repository header pattern.

---

## Solution

Add a slim `h-9` (36px) `ProjectContextHeader` bar **above** the existing per-page header in the editor column. Chat panel stays full height on the right — untouched.

```
┌──────────────────────────────────────────────────────────┐
│  📁 Frontend  │  Overview  Issues ①  Cycles  │  10 open │  ← new
├──────────────────────────────────────────────────────────┤
│  ← PS-42 [Feature]              [Chat] [⋯]              │  ← existing
├──────────────────────────────────────────────────────────┤
│  editor content                                          │
└──────────────────────────────────────────────────────────┘
                                   ┌──────────────────┐
                                   │  ChatView        │
                                   │  (full height)   │
                                   └──────────────────┘
```

---

## Component: `ProjectContextHeader`

**File**: `frontend/src/components/editor/ProjectContextHeader.tsx`
**Estimated size**: ~90 lines

### Props

```typescript
interface ProjectContextHeaderProps {
  projectId: string        // drives internal useProject fetch
  workspaceSlug: string    // for tab hrefs
  activeTab?: 'overview' | 'issues' | 'cycles'
}
```

### Visual anatomy

| Zone | Content |
|------|---------|
| Left | `<Folder>` icon + project name → link to `/[slug]/projects/[id]` |
| Middle | Tab links: `Overview`, `Issues` (with open count badge), `Cycles` |
| Right | `{openIssueCount} open` in `text-xs text-muted-foreground` |

**Active tab**: `border-b-2 border-primary text-foreground`
**Inactive tab**: `text-muted-foreground hover:text-foreground`
**Height**: `h-9`, `border-b border-border`, `bg-background`

### Tab routes

```
Overview → /{workspaceSlug}/projects/{projectId}/overview
Issues   → /{workspaceSlug}/projects/{projectId}/issues
Cycles   → /{workspaceSlug}/projects/{projectId}/cycles
```

All three routes confirmed present in the app router.

### Data fetching

Internally calls `useProject({ projectId })` — already cached at 2-min stale / 15-min GC.
`Project` type provides: `name`, `icon?`, `openIssueCount`.

### States

| State | Behavior |
|-------|----------|
| Loading | 3 skeleton spans, same `h-9` height — no layout shift |
| Error / no project | Returns `null` — silent, no broken UI |
| `projectId` empty | `useProject` disabled, returns `null` |
| `icon` undefined | Falls back to `<Folder>` lucide icon |

---

## Integration

### Issue detail page

**File**: `frontend/src/app/(workspace)/[workspaceSlug]/issues/[issueId]/page.tsx`

Wrap existing `header` const to prepend `ProjectContextHeader`:

```tsx
const header = (
  <>
    {issue.projectId && (
      <ProjectContextHeader
        projectId={issue.projectId}
        workspaceSlug={workspaceSlug}
        activeTab="issues"
      />
    )}
    <IssueNoteHeader ... />
  </>
);
```

`issue.project` is already loaded from `useIssueDetail` — no extra network cost for name/identifier.

### Note detail page

**File**: `frontend/src/components/editor/NoteCanvasLayout.tsx`

Insert above `InlineNoteHeader` inside `editorContent`:

```tsx
{projectId && (
  <ProjectContextHeader
    projectId={projectId}
    workspaceSlug={workspaceSlug}
    // no activeTab — no project-scoped notes route exists
  />
)}
<InlineNoteHeader ... />
```

---

## Scope summary

| Action | File | Lines delta |
|--------|------|-------------|
| Create | `frontend/src/components/editor/ProjectContextHeader.tsx` | +~90 |
| Modify | `frontend/src/app/(workspace)/[workspaceSlug]/issues/[issueId]/page.tsx` | +~10 |
| Modify | `frontend/src/components/editor/NoteCanvasLayout.tsx` | +~8 |

**No changes to**: chat panel, `IssueNoteLayout`, `IssueNoteHeader`, API endpoints, DB schema, hooks.

---

## Constraints respected

- File size: all files stay well under 700 lines
- YAGNI: no stats beyond `openIssueCount` (already on `Project` type)
- KISS: self-contained fetch, minimal props, renders `null` on all error paths
- Chat layout: zero changes — full height preserved
