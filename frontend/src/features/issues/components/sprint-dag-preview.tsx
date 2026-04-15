'use client';

/**
 * SprintDAGPreview - Topological execution order table for sprint batch implementation.
 *
 * Renders a plain HTML table (no ReactFlow, no Mermaid) showing the dependency
 * DAG in execution order. Accessible with caption and scope="col" headers.
 * Uses React.memo (NOT observer).
 *
 * Phase 76: Sprint Batch Implementation
 */
import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface DAGIssue {
  id: string;
  identifier: string;
  title: string;
  executionOrder: number;
  dependsOn: string[];
}

export interface SprintDAGPreviewProps {
  issues: DAGIssue[];
  parallelTracks?: number;
  hasCycle?: boolean;
  cycleIssues?: string[];
  onStart?: () => void;
  isStarting?: boolean;
}

export const SprintDAGPreview = React.memo(function SprintDAGPreview({
  issues,
  parallelTracks = 1,
  hasCycle = false,
  cycleIssues = [],
  onStart,
  isStarting = false,
}: SprintDAGPreviewProps) {
  // Group issues by execution order to detect parallel tracks
  const orderGroups = React.useMemo(() => {
    const groups = new Map<number, DAGIssue[]>();
    for (const issue of issues) {
      const order = issue.executionOrder;
      const existing = groups.get(order) ?? [];
      groups.set(order, [...existing, issue]);
    }
    return groups;
  }, [issues]);

  const sortedOrders = React.useMemo(
    () => Array.from(orderGroups.keys()).sort((a, b) => a - b),
    [orderGroups]
  );

  const issueCount = issues.length;

  return (
    <div className="flex flex-col gap-6 px-1">
      {/* Header */}
      <div>
        <h2 className="text-[16px] font-semibold leading-[1.3] text-foreground">Execution Plan</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {issueCount} {issueCount === 1 ? 'issue' : 'issues'} &middot; {parallelTracks}{' '}
          {parallelTracks === 1 ? 'parallel track' : 'parallel tracks'} &middot; max 3 concurrent
        </p>
      </div>

      {/* Cycle warning */}
      {hasCycle && cycleIssues.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <p className="font-semibold">Circular dependencies detected</p>
          <p className="mt-1 text-destructive/80">
            The following issues have circular dependencies and cannot be implemented:{' '}
            {cycleIssues.join(', ')}
          </p>
        </div>
      )}

      {/* DAG Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label="Sprint execution order">
          <caption className="sr-only">Sprint execution plan</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="w-16 py-2 pr-3 text-left font-semibold text-foreground">
                Order
              </th>
              <th scope="col" className="w-24 py-2 pr-3 text-left font-semibold text-foreground">
                Issue
              </th>
              <th scope="col" className="py-2 pr-3 text-left font-semibold text-foreground">
                Title
              </th>
              <th scope="col" className="w-40 py-2 pr-3 text-left font-semibold text-foreground">
                Depends On
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedOrders.map((order) => {
              const group = orderGroups.get(order) ?? [];
              return group.map((issue, index) => (
                <tr
                  key={issue.id}
                  className={cn(
                    'border-b border-border/50',
                    // Alternating row backgrounds: odd order groups use --muted
                    order % 2 !== 0 ? 'bg-muted/40' : 'bg-background'
                  )}
                >
                  {/* Order column: show order number only on first item of group,
                      subsequent items show "↳ parallel" */}
                  <td className="py-2 pr-3 align-top text-muted-foreground">
                    {index === 0 ? (
                      <span className="font-mono text-xs">{order + 1}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground/70">↳ parallel</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <span className="font-mono text-xs text-muted-foreground">
                      {issue.identifier}
                    </span>
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <span className="text-foreground">{issue.title}</span>
                  </td>
                  <td className="py-2 pr-3 align-top">
                    {issue.dependsOn.length > 0 ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {issue.dependsOn.join(', ')}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>
                </tr>
              ));
            })}

            {issues.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  No issues in this sprint. Add issues to a sprint before implementing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* CTA */}
      {onStart && (
        <div className="flex justify-end pt-2">
          <Button
            onClick={onStart}
            disabled={hasCycle || isStarting || issues.length === 0}
            className="min-h-[44px] px-6 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isStarting ? 'Starting...' : 'Start Implementation'}
          </Button>
        </div>
      )}
    </div>
  );
});

SprintDAGPreview.displayName = 'SprintDAGPreview';
