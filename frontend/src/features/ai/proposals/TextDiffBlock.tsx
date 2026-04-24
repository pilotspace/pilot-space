/**
 * TextDiffBlock — renders a unified-diff (hunk array) payload from the
 * backend Proposal `diff_payload`. UI-SPEC §4.
 *
 * Framework diff convention (NOT brand tokens) — scoped to diff renderers:
 *   delete:  bg #fecaca  text #dc2626  role=deletion
 *   insert:  bg #bbf7d0  text #16a34a  role=insertion
 *   equal:   bg transparent  text default  (no role)
 *
 * CONTEXT.md says "Fraunces 14" for diff body — UI-SPEC §4.3 overrides:
 * Fraunces is the project display serif reserved for hero greeting; the
 * code/diff role is JetBrains Mono 13/400 leading-1.5.
 */

import { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { TextDiffHunk, TextDiffPayload } from './types';

interface TextDiffBlockProps {
  payload: TextDiffPayload;
  className?: string;
}

interface DiffLine {
  op: 'equal' | 'insert' | 'delete';
  text: string;
}

/** Split hunks into per-line rows while preserving op. */
function hunksToLines(hunks: TextDiffHunk[]): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const h of hunks) {
    const parts = h.text.split('\n');
    // If the text ended with '\n', the last split segment is '' — drop it so
    // we don't render an empty trailing row.
    const lastIsEmpty = parts.length > 0 && parts[parts.length - 1] === '';
    const slice = lastIsEmpty ? parts.slice(0, -1) : parts;
    for (const p of slice) lines.push({ op: h.op, text: p });
  }
  return lines;
}

function countByOp(lines: DiffLine[], op: DiffLine['op']): number {
  return lines.reduce((n, l) => n + (l.op === op ? 1 : 0), 0);
}

export const TextDiffBlock = memo<TextDiffBlockProps>(function TextDiffBlock({
  payload,
  className,
}) {
  const lines = useMemo(() => hunksToLines(payload.hunks), [payload.hunks]);

  if (lines.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg border border-[#e5e7eb] bg-white px-3 py-4',
          'font-mono text-[13px] leading-[1.5] text-[#9ca3af] italic',
          className
        )}
        data-testid="text-diff-empty"
      >
        No textual changes
      </div>
    );
  }

  const added = countByOp(lines, 'insert');
  const removed = countByOp(lines, 'delete');

  return (
    <div
      role="region"
      aria-label={`Text diff preview, ${added} lines added, ${removed} lines removed`}
      className={cn(
        'rounded-lg border border-[#e5e7eb] bg-white overflow-x-auto',
        'font-mono text-[13px] leading-[1.5]',
        'max-h-[320px] overflow-y-auto',
        className
      )}
      data-testid="text-diff-block"
    >
      {lines.map((line, i) => {
        if (line.op === 'delete') {
          return (
            <del
              key={i}
              role="deletion"
              aria-label={`Removed: ${line.text}`}
              className="block bg-[#fecaca] text-[#dc2626] px-2 py-0.5 no-underline"
            >
              <span aria-hidden="true" className="font-semibold pr-2">
                −
              </span>
              {line.text || ' '}
            </del>
          );
        }
        if (line.op === 'insert') {
          return (
            <ins
              key={i}
              role="insertion"
              aria-label={`Added: ${line.text}`}
              className="block bg-[#bbf7d0] text-[#16a34a] px-2 py-0.5 no-underline"
            >
              <span aria-hidden="true" className="font-semibold pr-2">
                +
              </span>
              {line.text || ' '}
            </ins>
          );
        }
        return (
          <div key={i} className="block px-2 py-0.5 text-foreground">
            <span aria-hidden="true" className="pr-2 opacity-0">
              ·
            </span>
            {line.text || ' '}
          </div>
        );
      })}
    </div>
  );
});

TextDiffBlock.displayName = 'TextDiffBlock';
