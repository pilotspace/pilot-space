/**
 * VersionHistoryChip — compact pill mounted in the ArtifactPeekDrawer
 * header showing the current version number and a split AI/user authoring
 * count. Clicking opens a flyover popover listing every entry newest-first.
 *
 * Phase 89 Plan 06 — consumes `versionNumber` + `versionHistory` fields
 * now emitted by GET /issues/{id} (Plan 05). The flyover is read-only;
 * deep diff viewing is deferred to a future phase per 89-UI-SPEC §Out-of-scope.
 *
 * Accessibility:
 *   - Chip button has aria-label with the full "v{N} — A AI edits, B user edits" string.
 *   - Popover content is role="dialog" with aria-label so screen readers
 *     announce the purpose on open.
 *   - Esc closes, Tab navigation loops inside the popover (Radix default).
 */
'use client';

import * as React from 'react';
import { History } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { VersionHistoryEntry } from '@/features/ai/proposals/types';

export interface VersionHistoryChipProps {
  /** Current version number. Defaults to 1 when versionHistory is empty. */
  versionNumber: number;
  /**
   * Append-only history, oldest-first (backend-canonical order). The chip
   * reverses internally for the flyover so the newest entry is at the top.
   */
  versionHistory: VersionHistoryEntry[];
  className?: string;
}

function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const ms = Math.max(0, nowMs - then);
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function VersionHistoryChip({
  versionNumber,
  versionHistory,
  className,
}: VersionHistoryChipProps): React.JSX.Element {
  const aiCount = versionHistory.filter((h) => h.by === 'ai').length;
  const userCount = versionHistory.filter((h) => h.by === 'user').length;
  const isEmpty = versionHistory.length === 0;

  const label = isEmpty
    ? `v${versionNumber} · just created`
    : `v${versionNumber} · ${aiCount} AI · ${userCount} you`;

  const ariaLabel = isEmpty
    ? `Version ${versionNumber}, just created`
    : `Version ${versionNumber}. ${aiCount} edit${aiCount === 1 ? '' : 's'} by AI, ${userCount} edit${userCount === 1 ? '' : 's'} by you. Click to open history.`;

  // Newest first in the flyover. Backend returns oldest-first.
  const ordered = React.useMemo(() => [...versionHistory].reverse(), [versionHistory]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="version-history-chip"
          aria-label={ariaLabel}
          className={cn(
            'inline-flex items-center gap-1.5 h-6 px-2 rounded-full',
            'border border-border bg-muted/40 text-muted-foreground',
            'font-mono text-[11px] font-medium leading-none',
            'hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
        >
          <History className="h-3 w-3" aria-hidden="true" />
          <span data-testid="version-history-chip-label">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        role="dialog"
        aria-label="Version history"
        data-testid="version-history-popover"
        className="w-80 p-0"
      >
        <div className="px-3 py-2 border-b border-border">
          <p className="text-xs font-semibold text-foreground">Version history</p>
          <p className="text-[11px] text-muted-foreground">
            {isEmpty
              ? 'No edits yet — this is the original.'
              : `${versionHistory.length} entr${versionHistory.length === 1 ? 'y' : 'ies'}, newest first.`}
          </p>
        </div>
        {isEmpty ? null : (
          <ul
            data-testid="version-history-list"
            className="max-h-72 overflow-y-auto py-1"
          >
            {ordered.map((entry) => (
              <li
                key={`${entry.vN}-${entry.at}`}
                data-testid="version-history-entry"
                className="px-3 py-2 text-xs flex items-start gap-2 hover:bg-muted/50"
              >
                <span
                  className={cn(
                    'mt-0.5 inline-flex items-center justify-center h-5 w-10 shrink-0 rounded-full text-[10px] font-mono font-semibold',
                    entry.by === 'ai'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-foreground'
                  )}
                  aria-hidden="true"
                >
                  v{entry.vN}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground">
                    <span className="font-medium">
                      {entry.by === 'ai' ? 'AI' : 'You'}
                    </span>
                    <span className="text-muted-foreground">
                      {' · '}
                      {formatRelativeTime(entry.at)}
                    </span>
                  </p>
                  <p className="text-muted-foreground truncate" title={entry.summary}>
                    {entry.summary}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
