'use client';

/**
 * useGraphWorkflow — hook encapsulating ReactFlow nodes/edges state
 * with undo/redo history for the workflow graph editor.
 *
 * History tracks meaningful changes (not intermediate drag positions).
 * Max 50 history entries.
 */

import { useCallback, useRef, useState } from 'react';
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import type { WorkflowNodeData } from '@/features/skills/utils/graph-node-types';

// ── Types ───────────────────────────────────────────────────────────────────

interface HistoryEntry {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

export interface UseGraphWorkflowResult {
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node<WorkflowNodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onNodesChange: OnNodesChange<Node<WorkflowNodeData>>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  pushHistory: () => void;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useGraphWorkflow(
  initialNodes: Node<WorkflowNodeData>[] = [],
  initialEdges: Edge[] = []
): UseGraphWorkflowResult {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Undo/redo history
  const historyRef = useRef<HistoryEntry[]>([{ nodes: initialNodes, edges: initialEdges }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoRef = useRef(false);

  const pushHistory = useCallback(() => {
    if (isUndoRedoRef.current) return;

    setNodes((currentNodes) => {
      setEdges((currentEdges) => {
        const newEntry: HistoryEntry = {
          nodes: currentNodes.map((n) => ({ ...n })),
          edges: currentEdges.map((e) => ({ ...e })),
        };

        // Trim future entries if we branched from a past state
        const trimmed = historyRef.current.slice(0, historyIndex + 1);
        trimmed.push(newEntry);

        // Enforce max history
        if (trimmed.length > MAX_HISTORY) {
          trimmed.shift();
        }

        historyRef.current = trimmed;
        setHistoryIndex(trimmed.length - 1);

        return currentEdges; // no mutation
      });
      return currentNodes; // no mutation
    });
  }, [historyIndex, setNodes, setEdges]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    isUndoRedoRef.current = true;
    const newIndex = historyIndex - 1;
    const entry = historyRef.current[newIndex];
    if (!entry) return;
    setNodes(entry.nodes);
    setEdges(entry.edges);
    setHistoryIndex(newIndex);
    requestAnimationFrame(() => {
      isUndoRedoRef.current = false;
    });
  }, [historyIndex, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (historyIndex >= historyRef.current.length - 1) return;
    isUndoRedoRef.current = true;
    const newIndex = historyIndex + 1;
    const entry = historyRef.current[newIndex];
    if (!entry) return;
    setNodes(entry.nodes);
    setEdges(entry.edges);
    setHistoryIndex(newIndex);
    requestAnimationFrame(() => {
      isUndoRedoRef.current = false;
    });
  }, [historyIndex, setNodes, setEdges]);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      setEdges((eds) => addEdge({ ...connection, type: 'default' }, eds));
      // Push history after connection
      requestAnimationFrame(() => pushHistory());
    },
    [setEdges, pushHistory]
  );

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < historyRef.current.length - 1,
    pushHistory,
  };
}
