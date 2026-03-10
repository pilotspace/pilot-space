/**
 * useRelatedSuggestions - TanStack Query hook for AI-generated related issue suggestions.
 *
 * Calls GET /workspaces/{id}/issues/{id}/related-suggestions and returns
 * semantically similar issues the AI has identified as potentially related.
 */

import { useQuery } from '@tanstack/react-query';
import { issuesApi } from '@/services/api';
import type { RelatedSuggestion } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const relatedSuggestionsKeys = {
  detail: (workspaceId: string, issueId: string) =>
    ['issues', workspaceId, issueId, 'related-suggestions'] as const,
};

export function useRelatedSuggestions(workspaceId: string, issueId: string) {
  return useQuery<RelatedSuggestion[]>({
    queryKey: relatedSuggestionsKeys.detail(workspaceId, issueId),
    queryFn: () => issuesApi.getRelatedSuggestions(workspaceId, issueId),
    enabled: UUID_RE.test(workspaceId) && UUID_RE.test(issueId),
    staleTime: 60_000,
  });
}
