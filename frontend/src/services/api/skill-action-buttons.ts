/**
 * Skill Action Buttons API client.
 * Admin CRUD + member read endpoints for workspace action buttons.
 * Source: Phase 17, SKBTN-01..04
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillActionButton {
  id: string;
  name: string;
  icon: string | null;
  binding_type: 'skill' | 'mcp_tool';
  binding_id: string | null;
  binding_metadata: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkillActionButtonCreate {
  name: string;
  icon?: string | null;
  binding_type: 'skill' | 'mcp_tool';
  binding_id?: string | null;
  binding_metadata?: Record<string, unknown>;
}

export interface SkillActionButtonUpdate {
  name?: string;
  icon?: string | null;
  binding_type?: 'skill' | 'mcp_tool';
  binding_id?: string | null;
  binding_metadata?: Record<string, unknown>;
  sort_order?: number;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Query key
// ---------------------------------------------------------------------------

export const ACTION_BUTTONS_KEY = 'action-buttons';

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const actionButtonsApi = {
  getButtons(workspaceId: string): Promise<SkillActionButton[]> {
    return apiClient.get<SkillActionButton[]>(`/workspaces/${workspaceId}/action-buttons`);
  },

  getAdminButtons(workspaceId: string): Promise<SkillActionButton[]> {
    return apiClient.get<SkillActionButton[]>(`/workspaces/${workspaceId}/action-buttons/admin`);
  },

  createButton(workspaceId: string, data: SkillActionButtonCreate): Promise<SkillActionButton> {
    return apiClient.post<SkillActionButton>(`/workspaces/${workspaceId}/action-buttons`, data);
  },

  updateButton(
    workspaceId: string,
    buttonId: string,
    data: SkillActionButtonUpdate
  ): Promise<SkillActionButton> {
    return apiClient.patch<SkillActionButton>(
      `/workspaces/${workspaceId}/action-buttons/${buttonId}`,
      data
    );
  },

  reorderButtons(workspaceId: string, buttonIds: string[]): Promise<void> {
    return apiClient.put(`/workspaces/${workspaceId}/action-buttons/reorder`, {
      button_ids: buttonIds,
    });
  },

  deleteButton(workspaceId: string, buttonId: string): Promise<void> {
    return apiClient.delete(`/workspaces/${workspaceId}/action-buttons/${buttonId}`);
  },
};

// ---------------------------------------------------------------------------
// TanStack Query Hooks
// ---------------------------------------------------------------------------

export function useActionButtons(workspaceId: string) {
  return useQuery({
    queryKey: [ACTION_BUTTONS_KEY, workspaceId],
    queryFn: () => actionButtonsApi.getButtons(workspaceId),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });
}

export function useAdminActionButtons(workspaceId: string) {
  return useQuery({
    queryKey: [ACTION_BUTTONS_KEY, 'admin', workspaceId],
    queryFn: () => actionButtonsApi.getAdminButtons(workspaceId),
    staleTime: 60_000,
    enabled: !!workspaceId,
  });
}

export function useCreateActionButton(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SkillActionButtonCreate) => actionButtonsApi.createButton(workspaceId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ACTION_BUTTONS_KEY] }),
  });
}

export function useUpdateActionButton(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ buttonId, data }: { buttonId: string; data: SkillActionButtonUpdate }) =>
      actionButtonsApi.updateButton(workspaceId, buttonId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ACTION_BUTTONS_KEY] }),
  });
}

export function useReorderActionButtons(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (buttonIds: string[]) => actionButtonsApi.reorderButtons(workspaceId, buttonIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ACTION_BUTTONS_KEY] }),
  });
}

export function useDeleteActionButton(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (buttonId: string) => actionButtonsApi.deleteButton(workspaceId, buttonId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ACTION_BUTTONS_KEY] }),
  });
}
