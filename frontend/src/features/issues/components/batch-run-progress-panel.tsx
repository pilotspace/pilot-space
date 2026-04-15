'use client';

/**
 * BatchRunProgressPanel - Sprint-level progress bar with per-issue status list.
 *
 * Real-time updates via SSE (useBatchRunStream). Shows completion percentage,
 * per-issue status badges, cancel controls, and PR links.
 * Uses React.memo (NOT observer).
 *
 * Phase 76: Sprint Batch Implementation
 */
import * as React from 'react';
import { ExternalLink, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBatchRun, type BatchRunIssue } from '../hooks/use-batch-run';
import { useBatchRunStream } from '../hooks/use-batch-run-stream';
import { ImplementationStatusBadge } from './implementation-status-badge';
import { CancelBatchButton } from './cancel-batch-button';
import { CancelIssueButton } from './cancel-issue-button';

const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * Format PR URL into "repo#number" display text.
 */
function formatPrLink(prUrl: string): string {
  try {
    const url = new URL(prUrl);
    const parts = url.pathname.split('/');
    const repo = parts[2] ?? '';
    const number = parts[4] ?? '';
    if (repo && number) return `${repo}#${number}`;
    return prUrl.length > 30 ? `${prUrl.slice(0, 30)}…` : prUrl;
  } catch {
    return prUrl.length > 30 ? `${prUrl.slice(0, 30)}…` : prUrl;
  }
}

interface IssueRowProps {
  item: BatchRunIssue;
  batchRunId: string;
  workspaceSlug: string;
}

const IssueRow = React.memo(function IssueRow({ item, batchRunId, workspaceSlug }: IssueRowProps) {
  const isActive = !isTerminal(item.status);

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
      {/* Identifier */}
      <span className="font-mono text-xs text-muted-foreground w-20 flex-shrink-0 truncate">
        {item.issueIdentifier ?? item.issueId.slice(0, 8)}
      </span>

      {/* Title */}
      <span className="flex-1 min-w-0 text-sm text-foreground truncate">
        {item.issueTitle ?? 'Issue'}
      </span>

      {/* Status Badge */}
      <ImplementationStatusBadge status={item.status} stage={item.currentStage} />

      {/* PR Link */}
      {item.prUrl && (
        <a
          href={item.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${item.issueIdentifier ?? item.issueId} pull request (opens in new tab)`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
        >
          {formatPrLink(item.prUrl)}
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      )}

      {/* Cancel button (only for non-terminal issues) */}
      {isActive && (
        <CancelIssueButton
          batchRunId={batchRunId}
          issueId={item.issueId}
          issueIdentifier={item.issueIdentifier ?? item.issueId}
          workspaceSlug={workspaceSlug}
        />
      )}
    </div>
  );
});

// ============================================================================

export interface BatchRunProgressPanelProps {
  batchRunId: string;
  workspaceSlug: string;
}

export const BatchRunProgressPanel = React.memo(function BatchRunProgressPanel({
  batchRunId,
  workspaceSlug,
}: BatchRunProgressPanelProps) {
  const { data: batchRun, isLoading } = useBatchRun(workspaceSlug, batchRunId);
  const { connectionError } = useBatchRunStream(batchRunId);

  const completionPct = React.useMemo(() => {
    if (!batchRun || batchRun.totalIssues === 0) return 0;
    return Math.round(
      ((batchRun.completedIssues + batchRun.failedIssues) / batchRun.totalIssues) * 100
    );
  }, [batchRun]);

  const isActive = batchRun?.status === 'running' || batchRun?.status === 'pending';

  if (isLoading) {
    return (
      <section
        aria-label="Implementation progress"
        className={cn(
          'rounded-lg border border-border bg-card p-6',
          'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-safe:ease-out'
        )}
      >
        <div className="h-4 w-32 bg-muted rounded animate-pulse mb-4" />
        <div className="h-2 w-full bg-muted rounded animate-pulse" />
      </section>
    );
  }

  if (!batchRun) return null;

  return (
    <section
      aria-label="Implementation progress"
      className={cn(
        'rounded-lg border border-border bg-card',
        'px-6 py-5',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 motion-safe:ease-out'
      )}
    >
      {/* Heading */}
      <h3 className="text-[16px] font-semibold leading-[1.3] text-foreground mb-4">
        Implementation
      </h3>

      {/* SSE connection error banner */}
      {connectionError && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          <AlertCircle className="size-4 flex-shrink-0" aria-hidden="true" />
          {connectionError}
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>
            {batchRun.completedIssues + batchRun.failedIssues} / {batchRun.totalIssues} issues
          </span>
          <span>{completionPct}%</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={completionPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Implementation progress"
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              batchRun.status === 'completed' ? 'bg-primary' : 'bg-primary/80'
            )}
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </div>

      {/* Per-issue status list */}
      {batchRun.items.length > 0 && (
        <div className="mb-4">
          {batchRun.items
            .sort((a, b) => a.executionOrder - b.executionOrder)
            .map((item) => (
              <IssueRow
                key={item.id}
                item={item}
                batchRunId={batchRunId}
                workspaceSlug={workspaceSlug}
              />
            ))}
        </div>
      )}

      {/* Cancel batch button (only when active) */}
      {isActive && (
        <div className="flex justify-end pt-2">
          <CancelBatchButton batchRunId={batchRunId} workspaceSlug={workspaceSlug} />
        </div>
      )}
    </section>
  );
});

BatchRunProgressPanel.displayName = 'BatchRunProgressPanel';
