/**
 * GraphErrorState — calm-error block shown when catalog fetch fails or
 * the layout helper throws.
 *
 * Phase 92 Plan 02 Task 3.
 *
 * Copy is verbatim per UI-SPEC §Surface 4. "Switch to cards" is optional
 * (handler wiring lands in Plan 92-03).
 */
'use client';

import * as React from 'react';

export interface GraphErrorStateProps {
  /** Reload action — typically `catalog.refetch`. */
  onReload: () => void;
  /** Optional fallback action to leave the graph view altogether. */
  onSwitchToCards?: () => void;
}

export function GraphErrorState({
  onReload,
  onSwitchToCards,
}: GraphErrorStateProps): React.ReactElement {
  return (
    <div
      data-testid="skill-graph-error"
      className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <div className="text-[13px] font-semibold text-[var(--text-secondary,#525252)]">
        Couldn&apos;t lay out the graph.
      </div>
      <div className="max-w-md text-[13px] font-medium text-[var(--text-muted,#787872)]">
        Something went wrong while computing the skill graph. Try reloading.
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onReload}
          className="text-[13px] font-medium text-[var(--brand-primary,#29a386)] hover:underline focus-visible:outline-2 focus-visible:outline-[#29a386]"
        >
          Reload graph
        </button>
        {onSwitchToCards ? (
          <button
            type="button"
            onClick={onSwitchToCards}
            className="text-[13px] font-medium text-[var(--text-muted,#787872)] hover:underline focus-visible:outline-2 focus-visible:outline-[#29a386]"
          >
            Switch to cards
          </button>
        ) : null}
      </div>
    </div>
  );
}
