'use client';

/**
 * GraphCanvasShell — shared ReactFlow rendering shell for knowledge graph canvases.
 *
 * Renders loading, forbidden, error, empty, and interactive states.
 * Shared by issue, project, and workspace knowledge graph components.
 */

import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { GraphDetailPanel } from './graph-detail-panel';
import { GraphEmptyState } from './graph-empty-state';
import { nodeTypes } from './graph-node-renderer';
import { minimapNodeColor } from '@/features/issues/utils/graph-shared';
import { ErrorBoundary } from '@/components/error-boundary';
import type { UseGraphCanvasResult } from '@/features/issues/hooks/use-graph-canvas';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GraphCanvasShellProps {
  canvas: UseGraphCanvasResult;
  isLoading: boolean;
  isError: boolean;
  onRefetch: () => void;
  /** Custom action for empty state (e.g., "Open AI Chat" for issue graph). */
  emptyStateAction?: () => void;
  /** Minimum zoom level. Default: 0.3. */
  minZoom?: number;
}

// ── Component ─────────────────────────────────────────────────────────────

export function GraphCanvasShell({
  canvas,
  isLoading,
  isError,
  onRefetch,
  emptyStateAction,
  minZoom = 0.3,
}: GraphCanvasShellProps) {
  const {
    nodeTypedNodes,
    flowEdges,
    selectedNode,
    setSelectedNode,
    handleNodeDoubleClick,
    isLayoutComputing,
    isForbidden,
  } = canvas;

  if (isLoading || isLayoutComputing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <GraphEmptyState variant="loading" height={400} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <GraphEmptyState
          variant={isForbidden ? 'forbidden' : 'error'}
          height={400}
          onRetry={isForbidden ? undefined : () => void onRefetch()}
        />
      </div>
    );
  }

  if (nodeTypedNodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <GraphEmptyState variant="empty" height={400} onOpenChat={emptyStateAction} />
      </div>
    );
  }

  return (
    <>
      {/* Graph canvas */}
      <div className="flex-1 min-h-0">
        <ErrorBoundary
          fallback={
            <GraphEmptyState variant="error" height={400} onRetry={() => void onRefetch()} />
          }
        >
          <ReactFlow
            nodes={nodeTypedNodes}
            edges={flowEdges as Edge[]}
            nodeTypes={nodeTypes}
            minZoom={minZoom}
            maxZoom={3}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            proOptions={{ hideAttribution: true }}
            onNodeDoubleClick={(_evt, node) => void handleNodeDoubleClick(node.id)}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={0.8}
              className="opacity-20"
            />
            <MiniMap
              position="bottom-right"
              className="!bottom-4 !right-4"
              nodeColor={minimapNodeColor}
            />
            <Controls position="bottom-left" className="!bottom-4 !left-4" />
          </ReactFlow>
        </ErrorBoundary>
      </div>

      {selectedNode && (
        <GraphDetailPanel
          node={selectedNode}
          onClose={() => setSelectedNode(null)}
          onExpand={handleNodeDoubleClick}
        />
      )}
    </>
  );
}
