/**
 * graph-validation-engine — Validates workflow graphs for correctness.
 *
 * Detects:
 *   - Disconnected nodes (no incoming or outgoing edges)
 *   - Missing required connections (Input without outgoing, Output without incoming)
 *   - Circular dependencies via DFS (excluding Loop edges)
 *   - Type mismatches between connected handles
 *
 * Handle ID encoding: "{direction}:{dataType}:{branch?}"
 *   e.g. "input:any", "output:boolean:true", "output:text"
 */

import type { Node, Edge } from '@xyflow/react';
import { WorkflowNodeType, type WorkflowNodeData } from './graph-node-types';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ValidationError {
  type: 'disconnected' | 'missing_input' | 'missing_output' | 'cycle' | 'type_mismatch';
  nodeId: string;
  message: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the data type from a handle ID.
 * "output:text" -> "text", "input:any" -> "any", "output:boolean:true" -> "boolean"
 */
function parseHandleType(handleId: string): string {
  const parts = handleId.split(':');
  return parts[1] ?? 'any';
}

/**
 * Check if source type is compatible with target type.
 * 'any' is compatible with everything.
 */
function isTypeCompatible(sourceType: string, targetType: string): boolean {
  if (sourceType === 'any' || targetType === 'any') return true;
  return sourceType === targetType;
}

// ── Validation ─────────────────────────────────────────────────────────────

export function validateGraph(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[]
): ValidationError[] {
  if (nodes.length === 0) return [];

  const errors: ValidationError[] = [];

  // Build adjacency info
  const outgoing = new Map<string, Edge[]>();
  const incoming = new Map<string, Edge[]>();
  for (const node of nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of edges) {
    outgoing.get(edge.source)?.push(edge);
    incoming.get(edge.target)?.push(edge);
  }

  // ── 1. Disconnected nodes ──────────────────────────────────────────────
  for (const node of nodes) {
    const nodeType = node.data.nodeType;
    const hasOutgoing = (outgoing.get(node.id)?.length ?? 0) > 0;
    const hasIncoming = (incoming.get(node.id)?.length ?? 0) > 0;

    if (nodeType === WorkflowNodeType.Input) {
      // Input nodes only need outgoing edges
      if (!hasOutgoing) {
        errors.push({
          type: 'missing_output',
          nodeId: node.id,
          message: `Input node "${node.data.label}" has no outgoing connection`,
        });
      }
    } else if (nodeType === WorkflowNodeType.Output) {
      // Output nodes only need incoming edges
      if (!hasIncoming) {
        errors.push({
          type: 'missing_input',
          nodeId: node.id,
          message: `Output node "${node.data.label}" has no incoming connection`,
        });
      }
    } else {
      // All other nodes need at least one edge (incoming OR outgoing)
      if (!hasOutgoing && !hasIncoming) {
        errors.push({
          type: 'disconnected',
          nodeId: node.id,
          message: `Node "${node.data.label}" is disconnected`,
        });
      }
    }
  }

  // ── 2. Cycle detection via DFS (exclude loop edges) ────────────────────
  const nonLoopEdges = edges.filter((e) => e.type !== 'loop');
  const adjNonLoop = new Map<string, string[]>();
  for (const node of nodes) {
    adjNonLoop.set(node.id, []);
  }
  for (const edge of nonLoopEdges) {
    adjNonLoop.get(edge.source)?.push(edge.target);
  }

  // DFS coloring: 0=white(unvisited), 1=gray(in-stack), 2=black(done)
  const color = new Map<string, number>();
  for (const node of nodes) {
    color.set(node.id, 0);
  }

  const cycleNodes = new Set<string>();

  function dfs(nodeId: string): boolean {
    color.set(nodeId, 1); // gray
    for (const neighbor of adjNonLoop.get(nodeId) ?? []) {
      const c = color.get(neighbor) ?? 0;
      if (c === 1) {
        // Back edge found — cycle
        cycleNodes.add(neighbor);
        cycleNodes.add(nodeId);
        return true;
      }
      if (c === 0 && dfs(neighbor)) {
        cycleNodes.add(nodeId);
        return true;
      }
    }
    color.set(nodeId, 2); // black
    return false;
  }

  for (const node of nodes) {
    if (color.get(node.id) === 0) {
      dfs(node.id);
    }
  }

  for (const nodeId of cycleNodes) {
    errors.push({
      type: 'cycle',
      nodeId,
      message: `Node "${nodeId}" is part of a circular dependency`,
    });
  }

  // ── 3. Type mismatch detection ─────────────────────────────────────────
  for (const edge of edges) {
    const sourceHandle = edge.sourceHandle;
    const targetHandle = edge.targetHandle;
    if (!sourceHandle || !targetHandle) continue;

    const sourceType = parseHandleType(sourceHandle);
    const targetType = parseHandleType(targetHandle);

    if (!isTypeCompatible(sourceType, targetType)) {
      errors.push({
        type: 'type_mismatch',
        nodeId: edge.target,
        message: `Type mismatch: "${sourceType}" is not compatible with "${targetType}"`,
      });
    }
  }

  return errors;
}
