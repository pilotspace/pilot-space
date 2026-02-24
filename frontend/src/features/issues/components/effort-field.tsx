'use client';

import { useCallback, useState, type ChangeEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EffortMode = 'points' | 'hours';

export interface EffortFieldProps {
  estimatePoints?: number;
  estimateHours?: number;
  onPointsChange: (points: number | undefined) => void;
  onHoursChange: (hours: number | undefined) => void;
  disabled?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIBONACCI_PRESETS = [1, 2, 3, 5, 8, 13] as const;

/** Determine initial mode: prefer whichever field has data, default points. */
function deriveInitialMode(_points?: number, hours?: number): EffortMode {
  if (hours != null && hours > 0) return 'hours';
  return 'points';
}

// ---------------------------------------------------------------------------
// EffortField
// ---------------------------------------------------------------------------

/**
 * Unified effort estimation field with a [Points | Hours] segmented toggle.
 *
 * - Points mode renders inline Fibonacci preset buttons (1, 2, 3, 5, 8, 13).
 * - Hours mode renders a numeric input (step 0.5, 0-9999.9).
 * - Designed to render inside a Popover (no nested popovers).
 */
export function EffortField({
  estimatePoints,
  estimateHours,
  onPointsChange,
  onHoursChange,
  disabled = false,
  className,
}: EffortFieldProps) {
  const [mode, setMode] = useState<EffortMode>(() =>
    deriveInitialMode(estimatePoints, estimateHours)
  );

  const handleHoursBlur = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === '') {
        onHoursChange(undefined);
        return;
      }
      const val = parseFloat(raw);
      if (isNaN(val)) return;
      const clamped = Math.min(9999.9, Math.max(0, val));
      const rounded = Math.round(clamped * 2) / 2;
      onHoursChange(rounded);
    },
    [onHoursChange]
  );

  return (
    <div className={cn('flex flex-col gap-3 w-full', className)}>
      {/* Segmented toggle */}
      <div
        className="inline-flex self-start rounded-lg border border-input bg-muted/50 p-0.5"
        role="radiogroup"
        aria-label="Effort estimation mode"
      >
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'points'}
          onClick={() => setMode('points')}
          disabled={disabled}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            mode === 'points'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Points
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'hours'}
          onClick={() => setMode('hours')}
          disabled={disabled}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            mode === 'hours'
              ? 'bg-background shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Hours
        </button>
      </div>

      {/* Active field */}
      {mode === 'points' ? (
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Story Points</div>
          <div className="flex flex-wrap gap-1.5">
            {FIBONACCI_PRESETS.map((points) => (
              <button
                key={points}
                type="button"
                onClick={() => onPointsChange(points)}
                disabled={disabled}
                className={cn(
                  'inline-flex h-8 w-10 items-center justify-center rounded-md text-sm font-medium transition-colors',
                  'hover:bg-accent hover:text-accent-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  estimatePoints === points
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/50 text-foreground'
                )}
                aria-label={`${points} point${points !== 1 ? 's' : ''}`}
                aria-pressed={estimatePoints === points}
              >
                {points}
              </button>
            ))}
          </div>
          {estimatePoints != null && (
            <button
              type="button"
              onClick={() => onPointsChange(undefined)}
              disabled={disabled}
              className={cn(
                'mt-2 flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors',
                'hover:bg-destructive/10 hover:text-destructive',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              )}
              aria-label="Clear estimate"
            >
              <X className="size-3" />
              Clear estimate
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <input
            key={estimateHours ?? 'empty'}
            type="number"
            min={0}
            max={9999.9}
            step={0.5}
            defaultValue={estimateHours != null && estimateHours > 0 ? estimateHours : ''}
            onBlur={handleHoursBlur}
            disabled={disabled}
            aria-label="Time estimate in hours"
            placeholder="Not set"
            className={cn(
              'h-8 w-full rounded-[10px] border border-input bg-background px-3 text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'text-foreground placeholder:text-muted-foreground'
            )}
          />
          <span className="shrink-0 text-xs text-muted-foreground">h</span>
        </div>
      )}
    </div>
  );
}
