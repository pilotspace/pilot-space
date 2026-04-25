/**
 * GraphEmptyState — calm-empty block shown when the catalog has zero skills.
 *
 * Phase 92 Plan 02 Task 3.
 *
 * Copy is verbatim per UI-SPEC §Surface 4. The "Switch to cards" affordance
 * is optional in v1 because the toggle wiring lands in Plan 92-03; when no
 * handler is supplied the link is hidden.
 */
'use client';

import * as React from 'react';

export interface GraphEmptyStateProps {
  /** When provided, renders the "Switch to cards" text-link button. */
  onSwitchToCards?: () => void;
}

export function GraphEmptyState({
  onSwitchToCards,
}: GraphEmptyStateProps): React.ReactElement {
  return (
    <div
      data-testid="skill-graph-empty"
      className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <div className="text-[13px] font-semibold text-[var(--text-secondary,#525252)]">
        No skills to graph yet.
      </div>
      <div className="max-w-md text-[13px] font-medium text-[var(--text-muted,#787872)]">
        Skills are defined in your backend templates. Once a skill exists, its
        references will appear here.
      </div>
      {onSwitchToCards ? (
        <button
          type="button"
          onClick={onSwitchToCards}
          className="mt-2 text-[13px] font-medium text-[var(--brand-primary,#29a386)] hover:underline focus-visible:outline-2 focus-visible:outline-[#29a386]"
        >
          Switch to cards
        </button>
      ) : null}
    </div>
  );
}
