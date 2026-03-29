/**
 * Edit Graph Workflow page -- load and edit an existing graph by ID.
 *
 * Route: /[workspaceSlug]/skills/graph/[graphId]
 */

'use client';

import { Suspense, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { Node, Edge } from '@xyflow/react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useStore } from '@/stores';
import {
  useSkillGraph,
  useSaveSkillGraph,
} from '@/features/skills/hooks/use-skill-graph-queries';
import type { WorkflowNodeData } from '@/features/skills/utils/graph-node-types';

const GraphWorkflowCanvas = dynamic(
  () =>
    import('@/features/skills/components/graph-workflow-canvas').then(
      (mod) => mod.GraphWorkflowCanvas,
    ),
  { ssr: false },
);

export default function EditGraphPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceSlug = params?.workspaceSlug as string;
  const graphId = params?.graphId as string;
  const { workspaceStore } = useStore();
  const currentWorkspace = workspaceStore.getWorkspaceBySlug(workspaceSlug);
  const workspaceId = currentWorkspace?.id || workspaceSlug;

  const { data: graph, isLoading, isError } = useSkillGraph(workspaceId, graphId);
  const saveMutation = useSaveSkillGraph(workspaceId);

  const handleSave = useCallback(
    (data: { nodes: Node<WorkflowNodeData>[]; edges: Edge[] }) => {
      if (!graphId) return;
      saveMutation.mutate(
        {
          graphId,
          data: {
            graph_json: { nodes: data.nodes, edges: data.edges },
            node_count: data.nodes.length,
            edge_count: data.edges.length,
          },
        },
        {
          onError: () => toast.error('Failed to save graph'),
        },
      );
    },
    [graphId, saveMutation],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (isError || !graph) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)]">
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => router.push(`/${workspaceSlug}/skills`)}
            aria-label="Back to skills"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-semibold">Graph not found</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <p className="text-sm text-muted-foreground mb-4">
            The graph workflow could not be found. It may have been deleted.
          </p>
          <Button
            variant="outline"
            onClick={() => router.push(`/${workspaceSlug}/skills`)}
          >
            Back to Skills
          </Button>
        </div>
      </div>
    );
  }

  const graphJson = graph.graph_json as {
    nodes?: Node<WorkflowNodeData>[];
    edges?: Edge[];
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b bg-background">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => router.push(`/${workspaceSlug}/skills`)}
          aria-label="Back to skills"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold truncate">
          Edit Graph
        </h1>
        <span className="text-xs text-muted-foreground">
          {graph.node_count} nodes, {graph.edge_count} edges
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          className="gap-1.5"
          disabled={saveMutation.isPending}
          onClick={() => handleSave({ nodes: graphJson.nodes ?? [], edges: graphJson.edges ?? [] })}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <GraphWorkflowCanvas
            graphId={graphId}
            initialNodes={graphJson.nodes}
            initialEdges={graphJson.edges}
            onSave={handleSave}
          />
        </Suspense>
      </div>
    </div>
  );
}
