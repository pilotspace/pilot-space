/**
 * useCreateRelation - TanStack mutation hook to create a RELATED issue link.
 *
 * Calls POST /workspaces/{id}/issues/{id}/relations with link_type='related'
 * and invalidates the relations query on success.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { issuesApi } from '@/services/api';
import { issueRelationsKeys } from './use-issue-relations';

export function useCreateRelation(workspaceId: string, issueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetIssueId: string) =>
      issuesApi.createRelation(workspaceId, issueId, targetIssueId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: issueRelationsKeys.detail(workspaceId, issueId),
      });
    },
    onError: () => {
      toast.error('Failed to link issue');
    },
  });
}
