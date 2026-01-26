'use client';

/**
 * AIContextStreaming - Displays streaming progress for AI context generation.
 *
 * T133: Shows 5 phases with animated status icons:
 * - pending: circle outline
 * - in_progress: Loader2 spinning
 * - complete: Check icon
 *
 * @example
 * ```tsx
 * <AIContextStreaming phases={phases} />
 * ```
 */

import * as React from 'react';
import { observer } from 'mobx-react-lite';
import { Circle, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIContextPhase } from '@/stores/ai/AIContextStore';

// ============================================================================
// Types
// ============================================================================

export interface AIContextStreamingProps {
  /** Phase progress */
  phases: AIContextPhase[];
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Phase Item
// ============================================================================

interface PhaseItemProps {
  phase: AIContextPhase;
}

function PhaseItem({ phase }: PhaseItemProps) {
  const Icon = React.useMemo(() => {
    switch (phase.status) {
      case 'complete':
        return Check;
      case 'in_progress':
        return Loader2;
      default:
        return Circle;
    }
  }, [phase.status]);

  const iconClassName = React.useMemo(() => {
    switch (phase.status) {
      case 'complete':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'in_progress':
        return 'text-ai animate-spin';
      default:
        return 'text-muted-foreground/40';
    }
  }, [phase.status]);

  const textClassName = React.useMemo(() => {
    switch (phase.status) {
      case 'complete':
        return 'text-foreground';
      case 'in_progress':
        return 'text-foreground font-medium';
      default:
        return 'text-muted-foreground';
    }
  }, [phase.status]);

  return (
    <div className="flex items-center gap-3">
      <Icon className={cn('size-5 shrink-0', iconClassName)} />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm transition-all', textClassName)}>{phase.name}</p>
        {phase.content && phase.status === 'in_progress' && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{phase.content}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export const AIContextStreaming = observer(function AIContextStreaming({
  phases,
  className,
}: AIContextStreamingProps) {
  return (
    <div className={cn('space-y-4 p-6', className)}>
      <div className="flex items-center gap-2">
        <Loader2 className="size-5 text-ai animate-spin" />
        <h3 className="text-base font-medium">Generating AI Context</h3>
      </div>

      <div className="space-y-3">
        {phases.map((phase, index) => (
          <PhaseItem key={`${phase.name}-${index}`} phase={phase} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground pt-2">
        This may take a few moments. We are analyzing your issue, searching documentation, codebase,
        and related issues to provide comprehensive context.
      </p>
    </div>
  );
});

export default AIContextStreaming;
