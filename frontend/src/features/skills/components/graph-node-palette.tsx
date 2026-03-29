'use client';

/**
 * GraphNodePalette — left sidebar panel with draggable workflow node cards.
 *
 * Each card can be dragged onto the ReactFlow canvas. The drag event sets
 * 'application/workflowNodeType' in dataTransfer, which the canvas reads
 * in its onDrop handler to create the appropriate node.
 */

import type React from 'react';
import {
  MessageSquare,
  Sparkles,
  GitBranch,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { WorkflowNodeType, WORKFLOW_NODE_SPECS } from '@/features/skills/utils/graph-node-types';

// ── Icon Map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  MessageSquare,
  Sparkles,
  GitBranch,
  ArrowRightLeft,
  ArrowDownToLine,
  ArrowUpFromLine,
};

// ── Palette Items ───────────────────────────────────────────────────────────

const PALETTE_ITEMS = Object.values(WorkflowNodeType).map((type) => ({
  type,
  spec: WORKFLOW_NODE_SPECS[type],
}));

// ── Component ───────────────────────────────────────────────────────────────

export function GraphNodePalette() {
  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    nodeType: WorkflowNodeType
  ) => {
    event.dataTransfer.setData('application/workflowNodeType', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-56 border-r h-full bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-foreground">Nodes</h3>
      </div>

      {/* Node cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {PALETTE_ITEMS.map(({ type, spec }) => {
          const Icon = ICON_MAP[spec.icon] ?? MessageSquare;
          return (
            <div
              key={type}
              draggable
              onDragStart={(e) => handleDragStart(e, type)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors select-none"
              style={{
                borderLeftWidth: 3,
                borderLeftColor: spec.color,
              }}
            >
              <Icon
                width={16}
                height={16}
                style={{ color: spec.color }}
                strokeWidth={1.8}
                className="shrink-0"
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {spec.label}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {spec.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
