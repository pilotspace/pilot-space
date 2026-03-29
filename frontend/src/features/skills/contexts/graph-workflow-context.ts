'use client';

/**
 * GraphWorkflowContext — React context bridge for MobX store access.
 *
 * CRITICAL CONSTRAINT: The ReactFlow canvas (GraphWorkflowInner) MUST NOT
 * be wrapped in observer(). MobX useSyncExternalStore + ReactFlow causes
 * nested flushSync error in React 19.
 *
 * This context allows observer() components INSIDE ReactFlow nodes
 * (e.g., custom node components) to read MobX state without the canvas
 * itself being an observer.
 *
 * Pattern: Same as IssueNoteContext for TipTap editor.
 */

import { createContext, useContext } from 'react';
import type { GraphWorkflowStore } from '@/features/skills/stores/GraphWorkflowStore';

export interface GraphWorkflowContextValue {
  /** MobX store for workflow editor state */
  store: GraphWorkflowStore;
  /** Callback to select/deselect a node */
  onNodeSelect: (id: string | null) => void;
}

export const GraphWorkflowContext = createContext<GraphWorkflowContextValue | null>(null);

export function useGraphWorkflowContext(): GraphWorkflowContextValue {
  const ctx = useContext(GraphWorkflowContext);
  if (!ctx) {
    throw new Error(
      'useGraphWorkflowContext must be used within GraphWorkflowContext.Provider'
    );
  }
  return ctx;
}
