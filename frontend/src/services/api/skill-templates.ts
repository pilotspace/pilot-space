/**
 * Skill Templates API client.
 * Admin CRUD + member browse for skill templates.
 * Source: Phase 20, P20-09, P20-10
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  skill_content: string;
  icon: string;
  sort_order: number;
  source: 'built_in' | 'workspace' | 'custom';
  role_type: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillTemplateCreate {
  name: string;
  description: string;
  skill_content: string;
  icon?: string;
  sort_order?: number;
  role_type?: string;
}

export interface SkillTemplateUpdate {
  name?: string;
  description?: string;
  skill_content?: string;
  icon?: string;
  sort_order?: number;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const skillTemplatesApi = {
  getTemplates(workspaceSlug: string): Promise<SkillTemplate[]> {
    return apiClient.get<SkillTemplate[]>(`/workspaces/${workspaceSlug}/skill-templates`);
  },

  createTemplate(workspaceSlug: string, data: SkillTemplateCreate): Promise<SkillTemplate> {
    return apiClient.post<SkillTemplate>(`/workspaces/${workspaceSlug}/skill-templates`, data);
  },

  updateTemplate(
    workspaceSlug: string,
    id: string,
    data: SkillTemplateUpdate
  ): Promise<SkillTemplate> {
    return apiClient.patch<SkillTemplate>(
      `/workspaces/${workspaceSlug}/skill-templates/${id}`,
      data
    );
  },

  deleteTemplate(workspaceSlug: string, id: string): Promise<void> {
    return apiClient.delete(`/workspaces/${workspaceSlug}/skill-templates/${id}`);
  },
};

// ---------------------------------------------------------------------------
// TanStack Query Hooks
// ---------------------------------------------------------------------------

export function useSkillTemplates(workspaceSlug: string) {
  return useQuery({
    queryKey: ['skill-templates', workspaceSlug],
    queryFn: () => skillTemplatesApi.getTemplates(workspaceSlug),
    staleTime: 60_000,
    enabled: !!workspaceSlug,
  });
}

export function useCreateSkillTemplate(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SkillTemplateCreate) =>
      skillTemplatesApi.createTemplate(workspaceSlug, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skill-templates', workspaceSlug] }),
  });
}

export function useUpdateSkillTemplate(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SkillTemplateUpdate }) =>
      skillTemplatesApi.updateTemplate(workspaceSlug, id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skill-templates', workspaceSlug] }),
  });
}

export function useDeleteSkillTemplate(workspaceSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => skillTemplatesApi.deleteTemplate(workspaceSlug, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['skill-templates', workspaceSlug] }),
  });
}
