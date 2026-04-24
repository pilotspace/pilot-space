/**
 * ArtifactSplitModeToggle — segmented Split / Read / Chat control.
 *
 * Mounted as a floating top-center overlay when focus is open.
 * Active mode styled brand-green; arrow keys cycle.
 *
 * See `.planning/phases/86-peek-drawer-split-pane-lineage/86-UI-SPEC.md` §4.
 */
'use client';

import * as React from 'react';
import { BookOpen, Columns2, MessageSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  useArtifactPeekState,
  type ArtifactPeekView,
} from '@/hooks/use-artifact-peek-state';
import { cn } from '@/lib/utils';

interface ModeDef {
  key: ArtifactPeekView;
  label: string;
  Icon: LucideIcon;
}

const MODES: ModeDef[] = [
  { key: 'split', label: 'Split', Icon: Columns2 },
  { key: 'read', label: 'Read', Icon: BookOpen },
  { key: 'chat', label: 'Chat', Icon: MessageSquare },
];

export interface ArtifactSplitModeToggleProps {
  className?: string;
}

export function ArtifactSplitModeToggle({ className }: ArtifactSplitModeToggleProps) {
  const { view, setView } = useArtifactPeekState();
  const activeIndex = React.useMemo(
    () => Math.max(0, MODES.findIndex((m) => m.key === view)),
    [view],
  );
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? 1 : -1;
      const next = (activeIndex + delta + MODES.length) % MODES.length;
      const nextMode = MODES[next];
      if (!nextMode) return;
      setView(nextMode.key);
      // Move focus to the newly-active button on next frame
      window.requestAnimationFrame(() => {
        refs.current[next]?.focus();
      });
    },
    [activeIndex, setView],
  );

  return (
    <div
      role="radiogroup"
      aria-label="Artifact view mode"
      onKeyDown={handleKeyDown}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-border bg-background/95 p-1 shadow-sm backdrop-blur-sm',
        className,
      )}
      data-testid="split-mode-toggle"
    >
      {MODES.map((mode, idx) => {
        const isActive = mode.key === view;
        return (
          <button
            key={mode.key}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setView(mode.key)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-[#29a386] text-white shadow-sm'
                : 'text-foreground/70 hover:bg-muted hover:text-foreground',
            )}
          >
            <mode.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}
