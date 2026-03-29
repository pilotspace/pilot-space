/**
 * Skill Graphs API client.
 * CRUD operations for workspace-scoped skill graph persistence.
 * Source: Phase 52, P52-03
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillGraphCreate {
  skill_template_id: string;
  graph_json: Record<string, unknown>;
  node_count?: number;
  edge_count?: number;
}

export interface SkillGraphUpdate {
  graph_json: Record<string, unknown>;
  node_count: number;
  edge_count: number;
}

export interface SkillGraphResponse {
  id: string;
  workspace_id: string;
  skill_template_id: string;
  graph_json: Record<string, unknown>;
  node_count: number;
  edge_count: number;
  last_compiled_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export const skillGraphsApi = {
  createSkillGraph(
    workspaceId: string,
    data: SkillGraphCreate,
  ): Promise<SkillGraphResponse> {
    return apiClient.post<SkillGraphResponse>(
      `/workspaces/${workspaceId}/skill-graphs`,
      data,
    );
  },

  getSkillGraph(
    workspaceId: string,
    graphId: string,
  ): Promise<SkillGraphResponse> {
    return apiClient.get<SkillGraphResponse>(
      `/workspaces/${workspaceId}/skill-graphs/${graphId}`,
    );
  },

  getSkillGraphByTemplate(
    workspaceId: string,
    templateId: string,
  ): Promise<SkillGraphResponse> {
    return apiClient.get<SkillGraphResponse>(
      `/workspaces/${workspaceId}/skill-graphs/by-template/${templateId}`,
    );
  },

  updateSkillGraph(
    workspaceId: string,
    graphId: string,
    data: SkillGraphUpdate,
  ): Promise<SkillGraphResponse> {
    return apiClient.put<SkillGraphResponse>(
      `/workspaces/${workspaceId}/skill-graphs/${graphId}`,
      data,
    );
  },

  upsertSkillGraphByTemplate(
    workspaceId: string,
    templateId: string,
    data: SkillGraphUpdate,
  ): Promise<SkillGraphResponse> {
    return apiClient.put<SkillGraphResponse>(
      `/workspaces/${workspaceId}/skill-graphs/by-template/${templateId}`,
      data,
    );
  },
};
