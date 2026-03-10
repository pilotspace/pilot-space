/**
 * useDismissSuggestion - TanStack mutation hook to dismiss a related issue suggestion.
 *
 * Calls POST /workspaces/{id}/issues/{id}/related-suggestions/{targetId}/dismiss
 * and invalidates the suggestions query on success.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { issuesApi } from '@/services/api';
import { relatedSuggestionsKeys } from './use-related-suggestions';

export function useDismissSuggestion(workspaceId: string, issueId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetIssueId: string) =>
      issuesApi.dismissSuggestion(workspaceId, issueId, targetIssueId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: relatedSuggestionsKeys.detail(workspaceId, issueId),
      });
    },
  });
}
