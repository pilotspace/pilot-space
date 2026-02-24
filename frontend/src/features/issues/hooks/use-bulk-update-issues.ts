/**
 * useBulkUpdateIssues - TanStack Query mutation for bulk issue updates.
 *
 * Executes parallel updates via Promise.allSettled (no bulk API endpoint).
 * Applies optimistic patches to the list cache and rolls back on error.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { issuesApi } from '@/services/api';
import type { Issue, UpdateIssueData } from '@/types';
import { issuesListKeys } from './use-issues-list';

interface BulkUpdatePayload {
  issueIds: string[];
  data: UpdateIssueData;
}

interface BulkUpdateResult {
  succeeded: Issue[];
  failedCount: number;
}

/**
 * Build an optimistic patch for bulk updates.
 *
 * Only patches scalar fields that map directly between UpdateIssueData and Issue.
 * Relational fields require server-side resolution via onSettled invalidation.
 */
function buildBulkPatch(data: UpdateIssueData): Partial<Issue> {
  const patch: Partial<Issue> = {};

  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.assigneeId !== undefined) patch.assigneeId = data.assigneeId;
  if (data.cycleId !== undefined) patch.cycleId = data.cycleId;
  if (data.estimatePoints !== undefined) patch.estimatePoints = data.estimatePoints;
  if (data.startDate !== undefined) patch.startDate = data.startDate;
  if (data.targetDate !== undefined) patch.targetDate = data.targetDate;
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

  if (data.clearAssignee) {
    patch.assigneeId = undefined;
    patch.assignee = null;
  }
  if (data.clearCycle) patch.cycleId = undefined;
  if (data.clearEstimate) {
    patch.estimatePoints = undefined;
    patch.estimateHours = undefined;
  }
  if (data.clearStartDate) patch.startDate = undefined;
  if (data.clearTargetDate) patch.targetDate = undefined;

  return patch;
}

export function useBulkUpdateIssues(workspaceId: string, projectId?: string) {
  const queryClient = useQueryClient();
  const queryKey = issuesListKeys.filtered(workspaceId, projectId);

  return useMutation<BulkUpdateResult, Error, BulkUpdatePayload, { previousIssues?: Issue[] }>({
    mutationFn: async ({ issueIds, data }) => {
      const results = await Promise.allSettled(
        issueIds.map((id) => issuesApi.update(workspaceId, id, data))
      );

      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<Issue> => r.status === 'fulfilled')
        .map((r) => r.value);

      const failedCount = results.filter((r) => r.status === 'rejected').length;

      return { succeeded, failedCount };
    },

    onMutate: async ({ issueIds, data }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousIssues = queryClient.getQueryData<Issue[]>(queryKey);

      if (previousIssues) {
        const patch = buildBulkPatch(data);
        const now = new Date().toISOString();
        queryClient.setQueryData<Issue[]>(
          queryKey,
          previousIssues.map((issue) =>
            issueIds.includes(issue.id) ? { ...issue, ...patch, updatedAt: now } : issue
          )
        );
      }

      return { previousIssues };
    },

    onError: (_err, _payload, context) => {
      if (context?.previousIssues) {
        queryClient.setQueryData<Issue[]>(queryKey, context.previousIssues);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
