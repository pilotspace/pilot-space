/**
 * SkillGraphNode — React Flow custom node for skills (Phase 92 Plan 02 Task 2).
 *
 * Default state: 56px violet circle with a centered Lucide icon (Sparkles in
 * v1 — see "Skill icon deviation" in 92-02-SUMMARY).
 *
 * Selected state: same circle + `data-selected="true"` attribute → CSS
 * box-shadow renders the brand-green focus ring (var(--focus-ring)).
 *
 * Selected ALSO doubles as the "expanded preview" trigger for THIS plan:
 * the 200×96 expanded card geometry renders alongside the circle when the
 * node is selected. Plan 92-03 will own the actual selection handling and
 * keyboard navigation.
 *
 * CSS-only animations per UI-SPEC Design-Debt #3 (no animation library
 * installed). Tailwind `motion-safe:` variants honor `prefers-reduced-motion`.
 *
 * Decision lock (UI-SPEC Design-Debt #1): collapsed-circle renders the
 * resolved Lucide icon ONLY (no initial-glyph). Aria-label carries the full
 * skill name. This avoids the --color-skill-text AA-contrast hazard on
 * solid violet.
 */
'use client';

import * as React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowNodeData } from '../../hooks/useSkillGraphLayout';

export function SkillGraphNode(props: NodeProps): React.ReactElement {
  const data = props.data as FlowNodeData;
  const selected = props.selected ?? false;

  const refCount = data.refCount ?? 0;
  const refFileWord = refCount === 1 ? 'file' : 'files';
  const ariaLabel = selected
    ? `Skill: ${data.label}, ${refCount} reference ${refFileWord}. Press Enter to open the skill page. Press Escape to collapse.`
    : `Skill: ${data.label}, ${refCount} reference ${refFileWord}. Press Enter to expand.`;

  // The icon field is not yet forwarded into FlowNodeData by Plan 92-01's
  // builder. v1 always renders Sparkles per the deviation noted in
  // 92-02-SUMMARY. Aria-label still carries the full skill name.
  const Icon = Sparkles;

  return (
    <div
      role="button"
      aria-label={ariaLabel}
      className="relative flex items-center justify-center"
      style={{ minWidth: 44, minHeight: 44 }}
    >
      {/* Source handle on the right — skills emit edges to file nodes. */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !bg-transparent !border-0"
      />

      {/* Collapsed circle — always rendered. */}
      <div
        data-skill-node-inner=""
        data-selected={selected ? 'true' : 'false'}
        className={cn(
          'relative flex h-14 w-14 items-center justify-center rounded-full bg-[#7c5cff]',
          'motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out',
          'data-[selected=true]:shadow-[0_0_0_2px_transparent,0_0_0_4px_var(--focus-ring,#29a386)]',
        )}
      >
        <Icon
          className="h-4 w-4 text-white"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>

      {/* Expanded preview — renders alongside the circle when selected.
          The toggle handler lands in Plan 92-03. */}
      {selected ? (
        <div
          data-skill-node-expanded=""
          className={cn(
            'absolute left-[64px] top-1/2 -translate-y-1/2',
            'flex h-24 w-[200px] flex-col justify-center rounded-2xl bg-white',
            'border border-[var(--border-card,#e8e8e3)]',
            'shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)]',
            'overflow-hidden',
          )}
        >
          {/* Violet top stripe + gradient fade-down per UI-SPEC §Surface 2. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-2 bg-[#7c5cff]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-2 h-6 bg-gradient-to-b from-[rgba(124,92,255,0.08)] to-transparent"
          />
          <div className="relative px-3 pt-4">
            <div className="truncate text-[13px] font-medium leading-tight text-[var(--text-heading,#0f0f0e)]">
              {data.label}
            </div>
            <div className="mt-1 font-mono text-[10px] font-semibold text-[var(--text-muted,#787872)]">
              {refCount} {refCount === 1 ? 'ref' : 'refs'}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
