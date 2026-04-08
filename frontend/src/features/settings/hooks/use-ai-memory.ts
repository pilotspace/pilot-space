/**
 * useAIMemory — TanStack Query hooks for AI long-term memory (Phase 69).
 *
 * Endpoints (all under /api/v1/workspaces/{workspaceId}/ai/memory):
 *   POST   /recall                    semantic recall (member)
 *   POST   /{memory_id}/pin           pin a memory (admin)
 *   DELETE /{memory_id}               forget / soft delete (admin)
 *   POST   /gdpr-forget-user          GDPR hard delete by user_id (admin)
 */

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiClient } from '@/services/api';

// ---- Types ----

export interface MemoryItem {
  id: string;
  type: string;
  score: number;
  content: string;
  source_id?: string | null;
  source_type?: string | null;
}

export interface MemoryRecallRequest {
  query: string;
  k?: number;
  types?: string[];
  min_score?: number;
}

export interface MemoryRecallResponse {
  items: MemoryItem[];
  cache_hit: boolean;
  elapsed_ms: number;
}

// ---- Hooks ----

export function useMemoryRecall(workspaceId: string | undefined) {
  return useMutation({
    mutationFn: (body: MemoryRecallRequest) =>
      apiClient.post<MemoryRecallResponse>(
        `/workspaces/${workspaceId}/ai/memory/recall`,
        body
      ),
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Memory recall failed');
    },
  });
}

export function usePinMemory(workspaceId: string | undefined) {
  return useMutation({
    mutationFn: (memoryId: string) =>
      apiClient.post<{ pinned: boolean }>(
        `/workspaces/${workspaceId}/ai/memory/${memoryId}/pin`,
        {}
      ),
    onSuccess: () => toast.success('Memory pinned'),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to pin memory'),
  });
}

export function useForgetMemory(workspaceId: string | undefined) {
  return useMutation({
    mutationFn: (memoryId: string) =>
      apiClient.delete<{ forgotten: boolean }>(
        `/workspaces/${workspaceId}/ai/memory/${memoryId}`
      ),
    onSuccess: () => toast.success('Memory forgotten'),
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to forget memory'),
  });
}

export function useGdprForgetUser(workspaceId: string | undefined) {
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.post<{ deleted: number }>(
        `/workspaces/${workspaceId}/ai/memory/gdpr-forget-user`,
        { user_id: userId }
      ),
    onSuccess: (data) =>
      toast.success(`Erased ${data?.deleted ?? 0} memories for user (GDPR)`),
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : 'GDPR forget failed'),
  });
}
