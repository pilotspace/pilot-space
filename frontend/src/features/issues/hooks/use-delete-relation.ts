/**
 * useDeleteRelation - TanStack mutation hook to delete (unlink) an issue relation.
 *
 * Calls DELETE /workspaces/{id}/issues/{id}/relations/{linkId}
 * and invalidates the relations query on success.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { issuesApi } from '@/services/api';
import { issueRelationsKeys } from './use-issue-relations';

export function useDeleteRelation(workspaceId: string, issueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => issuesApi.deleteRelation(workspaceId, issueId, linkId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: issueRelationsKeys.detail(workspaceId, issueId),
      });
    },
  });
}
