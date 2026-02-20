'use client';

import { useParams } from 'next/navigation';
import { IssueViewsRoot } from '@/features/issues/components/views/IssueViewsRoot';

/**
 * Workspace-level Issues page — renders the tri-view issue management system.
 * Shows all issues across projects in the workspace.
 */
export default function IssuesPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-2xl font-semibold">Issues</h1>
        <p className="text-sm text-muted-foreground">All projects</p>
      </div>
      <IssueViewsRoot workspaceSlug={workspaceSlug} />
    </div>
  );
}
