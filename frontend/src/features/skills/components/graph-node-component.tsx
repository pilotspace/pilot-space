'use client';

/**
 * Workflow Node Components — custom ReactFlow node renderers.
 *
 * Each of the 6 workflow node types has a dedicated component that renders:
 *   - Dark background card with type-specific border color
 *   - Lucide icon + label
 *   - Typed Handle components from WORKFLOW_NODE_SPECS
 *   - Selected state (thicker border + glow)
 *   - Validation error state (red border + dot indicator)
 *
 * Exports `workflowNodeTypes` map for ReactFlow's nodeTypes prop.
 */

import { memo } from 'react';
import { Handle, type NodeProps, type Node, type NodeTypes } from '@xyflow/react';
import {
  MessageSquare,
  Sparkles,
  GitBranch,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  WorkflowNodeType,
  WORKFLOW_NODE_SPECS,
  type WorkflowNodeData,
} from '@/features/skills/utils/graph-node-types';

// ── Icon Map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  MessageSquare,
  Sparkles,
  GitBranch,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
};

// ── Shared Node Renderer ────────────────────────────────────────────────────

type WorkflowFlowNode = Node<WorkflowNodeData>;

interface WorkflowNodeInternalProps {
  nodeType: WorkflowNodeType;
  data: WorkflowNodeData;
  selected?: boolean;
}

function WorkflowNodeInternal({ nodeType, data, selected }: WorkflowNodeInternalProps) {
  const spec = WORKFLOW_NODE_SPECS[nodeType];
  const Icon = ICON_MAP[spec.icon] ?? MessageSquare;
  const hasError = !!data.validationError;

  const borderColor = hasError ? '#ef4444' : selected ? spec.color : `${spec.color}66`;
  const borderWidth = selected ? 2 : 1.5;
  const boxShadow = selected
    ? `0 0 12px 2px ${spec.color}33`
    : hasError
      ? '0 0 8px 1px rgba(239, 68, 68, 0.25)'
      : 'none';

  return (
    <div
      className="relative flex items-center gap-2.5 px-3 py-2.5 min-w-[140px] max-w-[200px]"
      style={{
        backgroundColor: '#1a1a2e',
        borderRadius: 12,
        border: `${borderWidth}px solid ${borderColor}`,
        boxShadow,
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
      }}
    >
      {/* Handles */}
      {spec.handles.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type={handle.type}
          position={handle.position}
          style={{
            width: 10,
            height: 10,
            backgroundColor: handle.dataType === 'boolean'
              ? (handle.id.endsWith(':true') ? '#22c55e' : '#ef4444')
              : spec.color,
            border: '2px solid #1a1a2e',
            ...handle.style,
          }}
        />
      ))}

      {/* Icon */}
      <span
        className="shrink-0 flex items-center justify-center rounded-md"
        style={{
          width: 28,
          height: 28,
          backgroundColor: `${spec.color}22`,
        }}
      >
        <Icon width={16} height={16} style={{ color: spec.color }} strokeWidth={1.8} />
      </span>

      {/* Label */}
      <span
        className="text-sm font-medium truncate"
        style={{ color: '#e2e8f0' }}
      >
        {data.label}
      </span>

      {/* Validation error dot */}
      {hasError && (
        <span
          className="absolute -top-1 -right-1 size-2.5 rounded-full"
          style={{ backgroundColor: '#ef4444' }}
          title={data.validationError}
        />
      )}
    </div>
  );
}

// ── Per-Type Components ─────────────────────────────────────────────────────

const PromptNode = memo(function PromptNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  return <WorkflowNodeInternal nodeType={WorkflowNodeType.Prompt} data={data} selected={selected} />;
});

const SkillNode = memo(function SkillNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  return <WorkflowNodeInternal nodeType={WorkflowNodeType.Skill} data={data} selected={selected} />;
});

const ConditionNode = memo(function ConditionNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  return <WorkflowNodeInternal nodeType={WorkflowNodeType.Condition} data={data} selected={selected} />;
});

const TransformNode = memo(function TransformNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  return <WorkflowNodeInternal nodeType={WorkflowNodeType.Transform} data={data} selected={selected} />;
});

const InputNode = memo(function InputNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  return <WorkflowNodeInternal nodeType={WorkflowNodeType.Input} data={data} selected={selected} />;
});

const OutputNode = memo(function OutputNode({ data, selected }: NodeProps<WorkflowFlowNode>) {
  return <WorkflowNodeInternal nodeType={WorkflowNodeType.Output} data={data} selected={selected} />;
});

// ── nodeTypes map for ReactFlow ─────────────────────────────────────────────

export const workflowNodeTypes: NodeTypes = {
  [WorkflowNodeType.Prompt]: PromptNode as NodeTypes[string],
  [WorkflowNodeType.Skill]: SkillNode as NodeTypes[string],
  [WorkflowNodeType.Condition]: ConditionNode as NodeTypes[string],
  [WorkflowNodeType.Transform]: TransformNode as NodeTypes[string],
  [WorkflowNodeType.Input]: InputNode as NodeTypes[string],
  [WorkflowNodeType.Output]: OutputNode as NodeTypes[string],
};
