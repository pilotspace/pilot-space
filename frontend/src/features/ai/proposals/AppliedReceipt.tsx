/**
 * AppliedReceipt — post-apply receipt replacing an accepted
 * EditProposalCard. UI-SPEC §2.
 *
 * Exposes `onRevert(proposalId)` as the wiring seam for Phase 89 Plan 06
 * (see Plan 04 cross_plan_contracts). Revert is only interactive within
 * a 10-minute window from `decidedAt`; outside the window the link is
 * hidden entirely.
 *
 * The "View diff" action calls `onViewDiff(targetType, targetId)` — wire
 * to the peek drawer at call site.
 */

'use client';

import { memo, useMemo } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProposalEnvelope } from './types';

interface AppliedReceiptProps {
  envelope: ProposalEnvelope;
  linesChanged?: number | null;
  /** Plan 06 wiring seam — click handler for the Revert link. */
  onRevert?: (proposalId: string) => void;
  /** Click handler for the "View diff" link. */
  onViewDiff?: (artifactType: string, artifactId: string) => void;
  /** Clock override for tests (ms since epoch). Defaults to Date.now. */
  now?: number;
  className?: string;
}

const REVERT_WINDOW_MS = 10 * 60 * 1000;

function formatRelativeTime(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 60_000) return `${Math.floor(abs / 1000)}s ago`;
  if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}m ago`;
  if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}h ago`;
  return `${Math.floor(abs / 86_400_000)}d ago`;
}

export const AppliedReceipt = memo<AppliedReceiptProps>(function AppliedReceipt({
  envelope,
  linesChanged,
  onRevert,
  onViewDiff,
  now,
  className,
}) {
  const nowMs = now ?? Date.now();
  const decidedAtMs = envelope.decidedAt ? new Date(envelope.decidedAt).getTime() : nowMs;
  const elapsedMs = nowMs - decidedAtMs;
  const revertWindowOpen = elapsedMs <= REVERT_WINDOW_MS;

  const versionLabel = useMemo(() => {
    if (envelope.appliedVersion == null) return '';
    return `v${envelope.appliedVersion - 1} → v${envelope.appliedVersion}`;
  }, [envelope.appliedVersion]);

  const changeLabel = useMemo(() => {
    const unit = envelope.diffKind === 'fields' ? 'fields' : 'lines';
    if (linesChanged == null) return '';
    return `${linesChanged} ${unit} changed`;
  }, [envelope.diffKind, linesChanged]);

  const relative = formatRelativeTime(elapsedMs);

  const ariaLabel = `Applied: version ${envelope.appliedVersion ?? ''}, ${changeLabel || 'no change count'}, ${relative}`;

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      data-testid="applied-receipt"
      className={cn(
        'w-full max-w-[720px] rounded-[14px] min-h-12 px-4 py-3',
        'flex items-center gap-3 flex-wrap',
        className
      )}
      style={{ background: '#29a38612' }}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[#29a386] shrink-0"
      >
        <Check className="h-3 w-3 text-white" aria-hidden="true" />
      </span>
      <span
        data-testid="applied-badge"
        className="font-mono text-[10px] font-semibold tracking-wider uppercase text-[#1e7a63]"
      >
        Applied
      </span>
      <span className="text-xs text-[#4b5563] flex items-center gap-2 flex-wrap">
        {versionLabel && (
          <span className="font-mono text-[11px] font-semibold text-[#6b7280]" data-testid="version-delta">
            {versionLabel}
          </span>
        )}
        {changeLabel && (
          <>
            <span>·</span>
            <span className="font-mono text-[11px] font-semibold text-[#6b7280]" data-testid="lines-changed">
              {changeLabel}
            </span>
          </>
        )}
        <span>·</span>
        <span className="font-mono text-[11px] font-semibold text-[#6b7280]" data-testid="relative-time">
          {relative}
        </span>
      </span>
      <span className="flex-1" />
      <div className="flex items-center gap-3">
        {onViewDiff && (
          <button
            type="button"
            onClick={() => onViewDiff(envelope.targetArtifactType, envelope.targetArtifactId)}
            data-testid="view-diff-button"
            aria-label="View diff for this change"
            className="text-xs font-medium text-[#29a386] hover:underline"
          >
            View diff
          </button>
        )}
        {revertWindowOpen && onRevert && (
          <button
            type="button"
            onClick={() => onRevert(envelope.id)}
            data-testid="revert-button"
            aria-label={`Revert this change. Shortcut Command Z`}
            className="text-xs font-medium text-[#4b5563] hover:text-[#D9534F] inline-flex items-center gap-1"
          >
            <Undo2 className="h-3 w-3" aria-hidden="true" />
            <span>Revert</span>
            <kbd className="font-mono text-[10px] font-semibold bg-white/60 border border-[#e5e7eb] px-1 py-0.5 rounded">
              ⌘Z
            </kbd>
          </button>
        )}
      </div>
    </div>
  );
});

AppliedReceipt.displayName = 'AppliedReceipt';
