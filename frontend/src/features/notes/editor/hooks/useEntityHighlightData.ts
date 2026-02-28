/**
 * useEntityHighlightData - Provides project entity data for EntityHighlightExtension.
 *
 * Maps workspace projects to the `{ name, projectId }` format required
 * by the extension's `projectEntities` option.
 *
 * @module features/notes/editor/hooks/useEntityHighlightData
 */
import { useMemo } from 'react';
import { useProjects, selectAllProjects } from '@/features/projects/hooks/useProjects';

export function useEntityHighlightData(workspaceId: string | undefined) {
  const { data } = useProjects({ workspaceId: workspaceId ?? '', enabled: !!workspaceId });

  // M-3: Depend on `data` (stable TanStack Query cache object) not on
  // `projects` (new array ref every render from selectAllProjects).
  return useMemo(
    () => selectAllProjects(data).map((p) => ({ name: p.name, projectId: p.id })),
    [data]
  );
}
