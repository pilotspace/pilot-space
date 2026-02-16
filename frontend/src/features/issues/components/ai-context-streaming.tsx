'use client';

/**
 * AIContextStreaming - Displays streaming progress for AI context generation.
 *
 * T133: Shows 5 phases with animated status icons:
 * - pending: circle outline
 * - in_progress: Loader2 spinning
 * - complete: Check icon
 */

import { observer } from 'mobx-react-lite';
import { Circle, Loader2, Check, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
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
// Phase Item — wrapped in observer to track in-place MobX mutations on
// phase.status and phase.content
// ============================================================================

interface PhaseItemProps {
  phase: AIContextPhase;
  index: number;
}

const PhaseItem = observer(function PhaseItem({ phase, index }: PhaseItemProps) {
  let Icon = Circle;
  let iconClassName = 'text-muted-foreground/40';
  let textClassName = 'text-muted-foreground';

  switch (phase.status) {
    case 'complete':
      Icon = Check;
      iconClassName = 'text-emerald-600 dark:text-emerald-400';
      textClassName = 'text-foreground';
      break;
    case 'in_progress':
      Icon = Loader2;
      iconClassName = 'text-ai motion-safe:animate-spin';
      textClassName = 'text-foreground font-medium';
      break;
  }

  return (
    <motion.div
      className="flex items-center gap-3"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.08, ease: 'easeOut' }}
    >
      <Icon className={cn('size-5 shrink-0', iconClassName)} />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm transition-all', textClassName)}>{phase.name}</p>
        {phase.content && phase.status === 'in_progress' && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{phase.content}</p>
        )}
      </div>
    </motion.div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const AIContextStreaming = observer(function AIContextStreaming({
  phases,
  className,
}: AIContextStreamingProps) {
  const completedCount = phases.filter((p) => p.status === 'complete').length;

  return (
    <div
      className={cn(
        'rounded-lg border border-ai/20 bg-gradient-to-br from-ai/5 to-ai/10 p-6',
        className
      )}
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <Sparkles className="size-5 text-ai animate-ai-pulse" aria-hidden="true" />
        <div className="flex-1">
          <h3 className="text-base font-medium">Generating AI Context</h3>
          <p className="text-xs text-muted-foreground">
            Step {completedCount} of {phases.length}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {phases.map((phase, index) => (
          <PhaseItem key={`${phase.name}-${index}`} phase={phase} index={index} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground pt-3 mt-3 border-t border-ai/10">
        Analyzing your issue, searching documentation, codebase, and related issues to provide
        comprehensive context.
      </p>
    </div>
  );
});

export default AIContextStreaming;
