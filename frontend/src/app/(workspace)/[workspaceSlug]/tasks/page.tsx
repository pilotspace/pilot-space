'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { IssueViewsRoot } from '@/features/issues/components/views/IssueViewsRoot';
import { useIssueViewStore } from '@/stores/RootStore';

/**
 * Workspace-level Tasks page (user-visible alias for /issues).
 * Internal identifiers (IssueViewsRoot, issues feature module) preserved.
 * See .planning/PROJECT.md → "Out of Scope — Task/Topic Rename Cascade".
 */
export default function TasksPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const searchParams = useSearchParams();
  const issueViewStore = useIssueViewStore();

  useEffect(() => {
    const filter = searchParams?.get('filter');
    if (filter === 'stale') {
      issueViewStore.setFilterStates(['Backlog', 'Todo']);
    }
  }, [searchParams, issueViewStore]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-4 sm:px-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Tasks</h1>
        <p className="text-sm text-muted-foreground">All projects</p>
      </div>
      <IssueViewsRoot workspaceSlug={workspaceSlug} />
    </div>
  );
}
