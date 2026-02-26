# ProjectContextHeader Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a slim GitHub-inspired project context header above the existing per-page header in both the issue detail and note detail pages, with project name link and nav tabs (Overview, Issues, Cycles).

**Architecture:** New self-contained `ProjectContextHeader` component fetches project data via `useProject` hook, renders `null` on missing/loading/error states, and is inserted as a sibling above `IssueNoteHeader` (issue page) and `InlineNoteHeader` (note page). Chat panel is untouched — zero layout changes to the right column.

**Tech Stack:** React 18, Next.js 14 App Router, TanStack Query v5 (`useProject`), Lucide icons, Tailwind CSS, shadcn/ui `Skeleton`, Vitest + Testing Library.

---

### Task 1: Create `ProjectContextHeader` component (TDD)

**Files:**
- Create: `frontend/src/components/editor/ProjectContextHeader.tsx`
- Create: `frontend/src/components/editor/__tests__/ProjectContextHeader.test.tsx`

---

**Step 1: Write the failing tests**

Create `frontend/src/components/editor/__tests__/ProjectContextHeader.test.tsx`:

```tsx
/**
 * Unit tests for ProjectContextHeader component.
 *
 * Tests: null states, loading skeleton, project name link,
 * nav tabs with correct hrefs, active tab highlight, open issue count.
 *
 * @module components/editor/__tests__/ProjectContextHeader.test
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useProject } from '@/features/projects/hooks';
import { ProjectContextHeader } from '../ProjectContextHeader';

vi.mock('@/features/projects/hooks', () => ({
  useProject: vi.fn(),
}));

const mockProject = {
  id: 'proj-1',
  name: 'Frontend',
  identifier: 'FE',
  workspaceId: 'ws-1',
  issueCount: 18,
  openIssueCount: 10,
  completedIssueCount: 8,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('ProjectContextHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('test_renders_null_when_projectId_empty', () => {
    (useProject as Mock).mockReturnValue({ data: undefined, isLoading: false });
    const { container } = render(
      <ProjectContextHeader projectId="" workspaceSlug="acme" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('test_renders_skeleton_while_loading', () => {
    (useProject as Mock).mockReturnValue({ data: undefined, isLoading: true });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.queryByText('Frontend')).not.toBeInTheDocument();
    // Container still renders (h-9 preserved — no layout shift)
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('test_renders_null_when_project_not_found', () => {
    (useProject as Mock).mockReturnValue({ data: null, isLoading: false });
    const { container } = render(
      <ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('test_renders_project_name_linking_to_project_root', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    const nameLink = screen.getByText('Frontend').closest('a');
    expect(nameLink).toHaveAttribute('href', '/acme/projects/proj-1');
  });

  it('test_renders_overview_tab_with_correct_href', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.getByRole('link', { name: /^overview$/i })).toHaveAttribute(
      'href',
      '/acme/projects/proj-1/overview'
    );
  });

  it('test_renders_issues_tab_with_correct_href', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.getByRole('link', { name: /issues/i })).toHaveAttribute(
      'href',
      '/acme/projects/proj-1/issues'
    );
  });

  it('test_renders_cycles_tab_with_correct_href', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.getByRole('link', { name: /^cycles$/i })).toHaveAttribute(
      'href',
      '/acme/projects/proj-1/cycles'
    );
  });

  it('test_active_tab_has_border_primary_class', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(
      <ProjectContextHeader projectId="proj-1" workspaceSlug="acme" activeTab="issues" />
    );
    const issuesLink = screen.getByRole('link', { name: /issues/i });
    expect(issuesLink.className).toContain('border-primary');
  });

  it('test_inactive_tabs_have_border_transparent_class', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(
      <ProjectContextHeader projectId="proj-1" workspaceSlug="acme" activeTab="issues" />
    );
    const overviewLink = screen.getByRole('link', { name: /^overview$/i });
    expect(overviewLink.className).toContain('border-transparent');
  });

  it('test_shows_open_issue_count_in_stats_area', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.getByText('10 open')).toBeInTheDocument();
  });

  it('test_hides_stats_when_zero_open_issues', () => {
    (useProject as Mock).mockReturnValue({
      data: { ...mockProject, openIssueCount: 0 },
      isLoading: false,
    });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    expect(screen.queryByText(/open/i)).not.toBeInTheDocument();
  });

  it('test_no_active_tab_when_activeTab_prop_omitted', () => {
    (useProject as Mock).mockReturnValue({ data: mockProject, isLoading: false });
    render(<ProjectContextHeader projectId="proj-1" workspaceSlug="acme" />);
    // All tabs get border-transparent (none active)
    const allTabLinks = screen.getAllByRole('link');
    // First link is project name, rest are tabs
    const tabLinks = allTabLinks.filter((l) =>
      ['/overview', '/issues', '/cycles'].some((s) => l.getAttribute('href')?.endsWith(s))
    );
    tabLinks.forEach((link) => {
      expect(link.className).toContain('border-transparent');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd frontend && pnpm test src/components/editor/__tests__/ProjectContextHeader.test.tsx
```

Expected: FAIL — `Cannot find module '../ProjectContextHeader'`

---

**Step 3: Implement `ProjectContextHeader`**

Create `frontend/src/components/editor/ProjectContextHeader.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Folder } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useProject } from '@/features/projects/hooks';

export interface ProjectContextHeaderProps {
  /** Project ID — drives internal data fetch. Renders null if empty. */
  projectId: string;
  /** Workspace slug for building tab hrefs. */
  workspaceSlug: string;
  /** Highlights the matching tab with a primary underline. */
  activeTab?: 'overview' | 'issues' | 'cycles';
}

const TABS = [
  { id: 'overview' as const, label: 'Overview' },
  { id: 'issues' as const, label: 'Issues' },
  { id: 'cycles' as const, label: 'Cycles' },
];

export function ProjectContextHeader({
  projectId,
  workspaceSlug,
  activeTab,
}: ProjectContextHeaderProps) {
  const { data: project, isLoading } = useProject({
    projectId,
    enabled: !!projectId,
  });

  if (!projectId) return null;

  const baseUrl = `/${workspaceSlug}/projects/${projectId}`;

  if (isLoading) {
    return (
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-border bg-background px-4">
      {/* Project identity link */}
      <Link
        href={baseUrl}
        className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
      >
        <Folder className="size-3.5 shrink-0" />
        {project.name}
      </Link>

      <span className="mx-3 text-border/60 select-none">|</span>

      {/* Nav tabs */}
      <nav className="flex items-center" aria-label="Project navigation">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={`${baseUrl}/${tab.id}`}
            className={cn(
              'flex h-9 items-center gap-1 px-3 text-sm border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-primary text-foreground font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            {tab.id === 'issues' && project.openIssueCount > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {project.openIssueCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Open issue count — right side stats */}
      {project.openIssueCount > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {project.openIssueCount} open
        </span>
      )}
    </div>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
cd frontend && pnpm test src/components/editor/__tests__/ProjectContextHeader.test.tsx
```

Expected: All 11 tests PASS

**Step 5: Run type-check**

```bash
cd frontend && pnpm type-check
```

Expected: No new errors.

**Step 6: Commit**

```bash
cd frontend && git add src/components/editor/ProjectContextHeader.tsx src/components/editor/__tests__/ProjectContextHeader.test.tsx
git commit -m "feat(ui): add ProjectContextHeader component with nav tabs"
```

---

### Task 2: Integrate into issue detail page

**Files:**
- Modify: `frontend/src/app/(workspace)/[workspaceSlug]/issues/[issueId]/page.tsx`

---

**Step 1: Add import**

In `page.tsx`, find the imports block that includes `IssueNoteHeader`:

```tsx
import {
  IssueNoteHeader,
  IssueNoteLayout,
  IssuePropertiesPanel,
} from '@/features/issues/components';
```

Add `ProjectContextHeader` import directly after:

```tsx
import { ProjectContextHeader } from '@/components/editor/ProjectContextHeader';
```

**Step 2: Wrap header const**

Find the `const header = (` block (~line 427) which currently reads:

```tsx
const header = (
  <IssueNoteHeader
    identifier={issue.identifier}
    ...
  />
);
```

Replace with:

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
    <IssueNoteHeader
      identifier={issue.identifier}
      issueTitle={issue.name}
      issueType={issue.type}
      aiGenerated={issue.aiGenerated ?? false}
      isChatOpen={isChatOpen}
      onBack={handleBack}
      onToggleChat={handleToggleChat}
      onCopyLink={handleCopyLink}
      onDelete={handleDeleteClick}
      onExport={handleExportContext}
      onGeneratePlan={handleGeneratePlan}
      isGeneratingPlan={isGeneratingPlan}
    />
  </>
);
```

**Step 3: Run type-check**

```bash
cd frontend && pnpm type-check
```

Expected: No errors.

**Step 4: Run lint**

```bash
cd frontend && pnpm lint
```

Expected: No new errors.

**Step 5: Commit**

```bash
git add frontend/src/app/'(workspace)'/\[workspaceSlug\]/issues/\[issueId\]/page.tsx
git commit -m "feat(issue-detail): add ProjectContextHeader above IssueNoteHeader"
```

---

### Task 3: Integrate into note detail (NoteCanvasLayout)

**Files:**
- Modify: `frontend/src/components/editor/NoteCanvasLayout.tsx`

---

**Step 1: Add import**

At the top of `NoteCanvasLayout.tsx`, add alongside the other local editor imports:

```tsx
import { ProjectContextHeader } from './ProjectContextHeader';
```

**Step 2: Insert header in editorContent**

Find the `editorContent` const (~line 171). It opens with:

```tsx
const editorContent = (
  <div className="flex flex-col min-w-0 overflow-hidden h-full">
    {/* Inline Note Header - Fixed at top, outside scrollable area */}
    {(title || createdAt) && (
      <InlineNoteHeader
```

Insert `ProjectContextHeader` as the first child, before the `InlineNoteHeader` conditional:

```tsx
const editorContent = (
  <div className="flex flex-col min-w-0 overflow-hidden h-full">
    {/* Project context header — shown only when note belongs to a project */}
    {projectId && (
      <ProjectContextHeader
        projectId={projectId}
        workspaceSlug={workspaceSlug}
      />
    )}

    {/* Inline Note Header - Fixed at top, outside scrollable area */}
    {(title || createdAt) && (
      <InlineNoteHeader
        title={title}
        ...rest unchanged...
      />
    )}
```

> Note: `projectId` and `workspaceSlug` are already destructured from `props` at the top of `NoteCanvasLayout`. No new prop needed.

**Step 3: Run type-check**

```bash
cd frontend && pnpm type-check
```

Expected: No errors.

**Step 4: Run full test suite**

```bash
cd frontend && pnpm test
```

Expected: All pre-existing passes still pass. New `ProjectContextHeader.test.tsx` passes.

**Step 5: Run lint**

```bash
cd frontend && pnpm lint
```

Expected: No new errors.

**Step 6: Commit**

```bash
git add frontend/src/components/editor/NoteCanvasLayout.tsx
git commit -m "feat(note-detail): add ProjectContextHeader above InlineNoteHeader"
```

---

### Task 4: Final quality gate + summary commit

**Step 1: Run all quality gates**

```bash
cd frontend && pnpm lint && pnpm type-check && pnpm test
```

Expected: All PASS.

**Step 2: Check file sizes**

```bash
wc -l frontend/src/components/editor/ProjectContextHeader.tsx \
        frontend/src/components/editor/NoteCanvasLayout.tsx \
        "frontend/src/app/(workspace)/[workspaceSlug]/issues/[issueId]/page.tsx"
```

Expected: All under 700 lines.

**Step 3: Done**

Three commits total:
1. `feat(ui): add ProjectContextHeader component with nav tabs`
2. `feat(issue-detail): add ProjectContextHeader above IssueNoteHeader`
3. `feat(note-detail): add ProjectContextHeader above InlineNoteHeader`
