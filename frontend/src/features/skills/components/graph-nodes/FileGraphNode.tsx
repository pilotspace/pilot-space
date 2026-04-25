/**
 * FileGraphNode — React Flow custom node for reference files
 * (Phase 92 Plan 02 Task 2).
 *
 * Default state: 40px neutral circle with a mime-resolved Lucide icon.
 *
 * Selected state: same circle + `data-selected="true"` attribute → CSS
 * box-shadow renders the brand-green focus ring. Selected also drives the
 * 220×88 expanded card geometry for THIS plan; Plan 92-03 will own the
 * selection / keyboard handler.
 *
 * Icon dispatch: extension-only (the catalog Skill[] payload exposes only
 * `path`, not mime). The mapping mirrors the Phase 91-04 SkillReferenceFiles
 * `iconForMime` helper but reads from extension exclusively.
 *
 * CSS-only animations per UI-SPEC Design-Debt #3.
 */
'use client';

import * as React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Code2,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Table,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowNodeData } from '../../hooks/useSkillGraphLayout';

/**
 * Render the mime-icon for a path directly as JSX. Extensions only —
 * the gallery Skill[] payload doesn't carry mime metadata.
 *
 * Order matters: image / csv / pdf are decided first because their
 * extensions are unambiguous. Source code extensions are then bucketed
 * into Code2; markdown / json / txt fall back to FileText.
 *
 * Renders JSX directly (rather than returning the component) so we don't
 * trip the react-hooks/static-components rule, which forbids creating a
 * component reference inside a render path.
 */
function renderIconForExtension(
  path: string,
  className: string,
): React.ReactElement {
  const props = {
    className,
    strokeWidth: 1.5,
    'aria-hidden': true as const,
  };
  if (/\.(png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(path)) {
    return <ImageIcon {...props} />;
  }
  if (/\.csv$/i.test(path)) return <Table {...props} />;
  if (
    /\.(py|ts|tsx|js|jsx|sql|sh|rb|go|rs|css|scss|yaml|yml|toml)$/i.test(path)
  ) {
    return <Code2 {...props} />;
  }
  if (/\.(pdf|md|mdx|html?|json|txt|markdown)$/i.test(path)) {
    return <FileText {...props} />;
  }
  return <FileIcon {...props} />;
}

function basename(path: string): string {
  const segments = path.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  return last ?? path;
}

/**
 * Build the "used by … and N other …" clause for the collapsed aria-label
 * per UI-SPEC §Surface 2. Singular / plural handled exhaustively:
 *  - 1 parent  → `used by alpha`
 *  - 2 parents → `used by alpha and 1 other skill`
 *  - 3+ parents → `used by alpha and {N-1} other skills`
 */
function parentClause(parents: readonly string[]): string {
  if (parents.length === 0) return 'used by an unknown skill';
  const first = parents[0];
  if (parents.length === 1) return `used by ${first}`;
  const rest = parents.length - 1;
  const word = rest === 1 ? 'skill' : 'skills';
  return `used by ${first} and ${rest} other ${word}`;
}

export function FileGraphNode(props: NodeProps): React.ReactElement {
  const data = props.data as FlowNodeData;
  const selected = props.selected ?? false;

  const path = data.path ?? data.label;
  const name = basename(path);
  const parents = data.parentSkillSlugs ?? [];

  const ariaLabel = selected
    ? `Reference file: ${path}. Press Enter to open in peek drawer. Press Escape to collapse.`
    : `Reference file: ${name}, ${parentClause(parents)}. Press Enter to expand.`;

  return (
    <div
      role="button"
      aria-label={ariaLabel}
      className="relative flex items-center justify-center"
      style={{ minWidth: 44, minHeight: 44 }}
    >
      {/* Target handle on the left — files only receive edges in v1. */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !bg-transparent !border-0"
      />

      {/* Collapsed circle. */}
      <div
        data-file-node-inner=""
        data-selected={selected ? 'true' : 'false'}
        className={cn(
          'relative flex h-10 w-10 items-center justify-center rounded-full',
          'bg-[var(--surface-input,#f1f1ef)]',
          'border border-[var(--border-card,#e8e8e3)]',
          'motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out',
          'data-[selected=true]:shadow-[0_0_0_2px_transparent,0_0_0_4px_var(--focus-ring,#29a386)]',
        )}
      >
        {renderIconForExtension(
          path,
          'h-4 w-4 text-[var(--text-secondary,#525252)]',
        )}
      </div>

      {/* Expanded preview. */}
      {selected ? (
        <div
          data-file-node-expanded=""
          className={cn(
            'absolute left-[48px] top-1/2 -translate-y-1/2',
            'flex h-[88px] w-[220px] flex-col justify-center rounded-[18px] bg-white',
            'border border-[var(--border-card,#e8e8e3)]',
            'shadow-[0_8px_24px_-8px_rgba(0,0,0,0.12)]',
            'px-3',
          )}
        >
          <div className="truncate text-[13px] font-medium leading-tight text-[var(--text-heading,#0f0f0e)]">
            {name}
          </div>
          <div className="mt-1 font-mono text-[10px] font-semibold text-[var(--text-muted,#787872)]">
            {parents.length > 0 ? `from ${parents[0]}` : 'reference file'}
          </div>
        </div>
      ) : null}
    </div>
  );
}
