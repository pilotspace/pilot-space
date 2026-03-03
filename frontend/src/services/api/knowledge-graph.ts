import { apiClient } from './client';
import type { GraphNodeType, GraphResponse, GraphQueryParams } from '@/types/knowledge-graph';

export const knowledgeGraphApi = {
  getIssueGraph(
    workspaceId: string,
    issueId: string,
    params?: GraphQueryParams
  ): Promise<GraphResponse> {
    const queryParams: Record<string, string | number | boolean | string[]> = {};

    if (params?.depth !== undefined) queryParams.depth = params.depth;
    if (params?.maxNodes !== undefined) queryParams.max_nodes = params.maxNodes;
    if (params?.includeGithub !== undefined) queryParams.include_github = params.includeGithub;
    if (params?.nodeTypes?.length) queryParams.node_types = params.nodeTypes;

    return apiClient.get<GraphResponse>(`/issues/${issueId}/knowledge-graph`, {
      params: queryParams,
      headers: { 'X-Workspace-Id': workspaceId },
    });
  },

  getNodeNeighbors(workspaceId: string, nodeId: string, depth?: number): Promise<GraphResponse> {
    const queryParams: Record<string, number> = {};
    if (depth !== undefined) queryParams.depth = depth;

    return apiClient.get<GraphResponse>(`/knowledge-graph/nodes/${nodeId}/neighbors`, {
      params: queryParams,
      headers: { 'X-Workspace-Id': workspaceId },
    });
  },

  searchGraph(
    workspaceId: string,
    query: string,
    nodeTypes?: GraphNodeType[]
  ): Promise<GraphResponse> {
    const queryParams: Record<string, string | string[]> = { query };
    if (nodeTypes?.length) queryParams.node_types = nodeTypes;

    return apiClient.get<GraphResponse>('/knowledge-graph/search', {
      params: queryParams,
      headers: { 'X-Workspace-Id': workspaceId },
    });
  },
};
