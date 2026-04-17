'use client';

/**
 * WorkspacePill — Centered workspace name pill for the homepage hero.
 * Shows green dot + workspace name + chevron.
 *
 * Design spec: rounded-full, border #e5e7eb, padding 5px 14px, gap 8px
 */

import { observer } from 'mobx-react-lite';
import { ChevronDown } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/RootStore';

export const WorkspacePill = observer(function WorkspacePill() {
  const workspaceStore = useWorkspaceStore();
  const name = workspaceStore.currentWorkspace?.name ?? 'Workspace';

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-1.5">
      {/* Green dot */}
      <span
        className="h-5 w-5 shrink-0 rounded-full bg-gradient-to-b from-primary to-[#1e7a63]"
        aria-hidden="true"
      />
      <span className="text-xs font-medium text-foreground">{name}</span>
      <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
    </div>
  );
});
