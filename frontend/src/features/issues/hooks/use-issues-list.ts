/**
 * useIssuesList - TanStack Query hook for fetching paginated issue lists.
 *
 * Supports optional project-scoped filtering via query key segmentation.
 */

import { useQuery } from '@tanstack/react-query';
import { issuesApi } from '@/services/api';
import type { Issue } from '@/types';

export const issuesListKeys = {
  all: (workspaceId: string) => ['issues', 'list', workspaceId] as const,
  filtered: (workspaceId: string, projectId?: string) =>
    projectId
      ? (['issues', 'list', workspaceId, projectId] as const)
      : (['issues', 'list', workspaceId] as const),
};

export function useIssuesList(workspaceId: string, projectId?: string) {
  return useQuery<Issue[]>({
    queryKey: issuesListKeys.filtered(workspaceId, projectId),
    queryFn: async () => {
      const response = await issuesApi.list(workspaceId, projectId ? { projectId } : undefined);
      return response.items;
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}
