/**
 * graph-node-types — Type system for workflow graph nodes.
 *
 * Defines the 6 workflow node types (Prompt, Skill, Condition, Transform,
 * Input, Output), their visual specs (icons, colors, handle positions),
 * and a factory function for creating new nodes.
 *
 * Handle ID encoding: `{direction}:{dataType}:{branch?}`
 *   e.g. "input:any", "output:boolean:true", "output:text"
 */

import { Position, type Node } from '@xyflow/react';
import type React from 'react';

// ── Enums & Interfaces ──────────────────────────────────────────────────────

export enum WorkflowNodeType {
  Prompt = 'prompt',
  Skill = 'skill',
  Condition = 'condition',
  Transform = 'transform',
  Input = 'input',
  Output = 'output',
}

export interface WorkflowNodeData extends Record<string, unknown> {
  nodeType: WorkflowNodeType;
  label: string;
  config: Record<string, unknown>;
  validationError?: string;
}

export interface HandleSpec {
  id: string;
  type: 'source' | 'target';
  position: Position;
  dataType: 'text' | 'boolean' | 'any';
  label?: string;
  style?: React.CSSProperties;
}

export interface WorkflowNodeSpec {
  label: string;
  icon: string;
  description: string;
  color: string;
  bgColor: string;
  handles: HandleSpec[];
}

// ── Node Specs ──────────────────────────────────────────────────────────────

export const WORKFLOW_NODE_SPECS: Record<WorkflowNodeType, WorkflowNodeSpec> = {
  [WorkflowNodeType.Prompt]: {
    label: 'Prompt',
    icon: 'MessageSquare',
    description: 'Send a prompt to an LLM',
    color: '#3b82f6',
    bgColor: '#1e3a5f',
    handles: [
      { id: 'input:any', type: 'target', position: Position.Left, dataType: 'any' },
      { id: 'output:text', type: 'source', position: Position.Right, dataType: 'text' },
    ],
  },
  [WorkflowNodeType.Skill]: {
    label: 'Skill',
    icon: 'Sparkles',
    description: 'Execute a saved skill',
    color: '#22c55e',
    bgColor: '#1a3a2e',
    handles: [
      { id: 'input:any', type: 'target', position: Position.Left, dataType: 'any' },
      { id: 'output:text', type: 'source', position: Position.Right, dataType: 'text' },
    ],
  },
  [WorkflowNodeType.Condition]: {
    label: 'Condition',
    icon: 'GitBranch',
    description: 'Branch based on a condition',
    color: '#eab308',
    bgColor: '#3a3520',
    handles: [
      { id: 'input:any', type: 'target', position: Position.Left, dataType: 'any' },
      {
        id: 'output:boolean:true',
        type: 'source',
        position: Position.Right,
        dataType: 'boolean',
        label: 'True',
        style: { top: '30%' },
      },
      {
        id: 'output:boolean:false',
        type: 'source',
        position: Position.Right,
        dataType: 'boolean',
        label: 'False',
        style: { top: '70%' },
      },
    ],
  },
  [WorkflowNodeType.Transform]: {
    label: 'Transform',
    icon: 'ArrowRightLeft',
    description: 'Transform data between steps',
    color: '#a855f7',
    bgColor: '#2e1f3a',
    handles: [
      { id: 'input:any', type: 'target', position: Position.Left, dataType: 'any' },
      { id: 'output:text', type: 'source', position: Position.Right, dataType: 'text' },
    ],
  },
  [WorkflowNodeType.Input]: {
    label: 'Input',
    icon: 'ArrowDownToLine',
    description: 'Workflow entry point',
    color: '#06b6d4',
    bgColor: '#1a2e3a',
    handles: [
      { id: 'output:any', type: 'source', position: Position.Right, dataType: 'any' },
    ],
  },
  [WorkflowNodeType.Output]: {
    label: 'Output',
    icon: 'ArrowUpFromLine',
    description: 'Workflow exit point',
    color: '#f97316',
    bgColor: '#3a2a1a',
    handles: [
      { id: 'input:any', type: 'target', position: Position.Left, dataType: 'any' },
    ],
  },
};

// ── Factory ─────────────────────────────────────────────────────────────────

export function createWorkflowNode(
  type: WorkflowNodeType,
  position: { x: number; y: number }
): Node<WorkflowNodeData> {
  const spec = WORKFLOW_NODE_SPECS[type];
  return {
    id: crypto.randomUUID(),
    type: type,
    position,
    data: {
      nodeType: type,
      label: spec.label,
      config: {},
    },
  };
}
