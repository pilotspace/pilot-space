/**
 * IssueReadOnly — compact summary render for an Issue in peek/focus.
 *
 * Title + state chip + priority chip + description preview. Full editing is
 * only available on the Issue detail page.
 */
'use client';

import type { Issue } from '@/types/issue';
import { cn } from '@/lib/utils';

export interface IssueReadOnlyProps {
  issue: Issue;
  className?: string;
}

const PRIORITY_LABEL: Record<number, string> = {
  0: 'No priority',
  1: 'Urgent',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

function priorityLabel(priority: unknown): string {
  if (typeof priority === 'number') return PRIORITY_LABEL[priority] ?? 'Priority';
  if (typeof priority === 'string') return priority;
  return 'Priority';
}

export function IssueReadOnly({ issue, className }: IssueReadOnlyProps) {
  const stateName = issue.state?.name ?? 'Unknown';
  const stateColor = issue.state?.color ?? '#94a3b8';
  const description = issue.description ?? '';
  return (
    <article className={cn('flex flex-col gap-3 px-5 py-4', className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-mono">{issue.identifier}</span>
      </div>
      <h1 className="text-xl font-semibold leading-tight">
        {issue.name ?? issue.title ?? 'Untitled issue'}
      </h1>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
          style={{ borderColor: stateColor, color: stateColor }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: stateColor }} />
          {stateName}
        </span>
        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {priorityLabel(issue.priority)}
        </span>
        {issue.labels?.slice(0, 4).map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
            style={{ borderColor: l.color ?? '#94a3b8', color: l.color ?? '#475569' }}
          >
            {l.name}
          </span>
        ))}
      </div>
      {description && (
        <p className="line-clamp-6 whitespace-pre-wrap text-sm text-foreground/80">
          {description}
        </p>
      )}
    </article>
  );
}
