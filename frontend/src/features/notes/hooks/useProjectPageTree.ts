import { useQuery } from '@tanstack/react-query';
import { notesApi } from '@/services/api';
import { buildTree } from '@/lib/tree-utils';

export const projectTreeKeys = {
  all: ['notes', 'project-tree'] as const,
  tree: (workspaceId: string, projectId: string) =>
    [...projectTreeKeys.all, workspaceId, projectId] as const,
};

/**
 * TanStack Query hook for project page tree.
 *
 * Fetches all notes for a project and transforms them into a nested
 * tree structure using buildTree. Suitable for sidebar tree rendering.
 *
 * @param workspaceId Workspace slug or ID
 * @param projectId Project ID
 * @param enabled Whether to enable the query (default true)
 */
export function useProjectPageTree(workspaceId: string, projectId: string, enabled = true) {
  return useQuery({
    queryKey: projectTreeKeys.tree(workspaceId, projectId),
    queryFn: () => notesApi.list(workspaceId, { projectId }, 1, 100),
    enabled: enabled && !!workspaceId && !!projectId,
    staleTime: 1000 * 60 * 2, // 2 minutes
    select: (data) => buildTree(data.items),
  });
}
