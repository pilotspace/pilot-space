'use client';

/**
 * PR Review Streaming - Shows real-time progress for 5 review aspects.
 *
 * T144: Displays status icons per aspect with pending/in_progress/complete states.
 * Icons: Layout (architecture), Shield (security), Code (quality),
 * Zap (performance), FileText (documentation).
 *
 * @example
 * ```tsx
 * <PRReviewStreaming aspects={aspects} />
 * ```
 */

import * as React from 'react';
import { observer } from 'mobx-react-lite';
import { Layout, Shield, Code, Zap, FileText, Loader2, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewAspect, ReviewAspectName } from '@/stores/ai';

// ============================================================================
// Types
// ============================================================================

export interface PRReviewStreamingProps {
  /** List of review aspects with status */
  aspects: ReviewAspect[];
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Configuration
// ============================================================================

interface AspectConfig {
  icon: React.ElementType;
  label: string;
  description: string;
}

const aspectConfig: Record<ReviewAspectName, AspectConfig> = {
  architecture: {
    icon: Layout,
    label: 'Architecture',
    description: 'Patterns, separation of concerns',
  },
  security: {
    icon: Shield,
    label: 'Security',
    description: 'Vulnerabilities, OWASP top 10',
  },
  quality: {
    icon: Code,
    label: 'Code Quality',
    description: 'Readability, maintainability',
  },
  performance: {
    icon: Zap,
    label: 'Performance',
    description: 'Efficiency, bottlenecks',
  },
  documentation: {
    icon: FileText,
    label: 'Documentation',
    description: 'Comments, README updates',
  },
};

// ============================================================================
// Aspect Item Component
// ============================================================================

interface AspectItemProps {
  aspect: ReviewAspect;
}

function AspectItem({ aspect }: AspectItemProps) {
  const config = aspectConfig[aspect.name];
  const Icon = config.icon;

  // Determine status icon and styling
  const StatusIcon =
    aspect.status === 'complete'
      ? CheckCircle2
      : aspect.status === 'in_progress'
        ? Loader2
        : Circle;

  const statusColor =
    aspect.status === 'complete'
      ? 'text-green-600 dark:text-green-400'
      : aspect.status === 'in_progress'
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-muted-foreground';

  const isAnimating = aspect.status === 'in_progress';

  return (
    <div className="flex items-center gap-3 py-2">
      {/* Status Icon */}
      <div className={cn('shrink-0', statusColor)}>
        <StatusIcon className={cn('size-5', isAnimating && 'animate-spin')} />
      </div>

      {/* Aspect Icon */}
      <div className="shrink-0">
        <div
          className={cn(
            'size-9 rounded-lg flex items-center justify-center transition-colors',
            aspect.status === 'complete'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : aspect.status === 'in_progress'
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="size-5" />
        </div>
      </div>

      {/* Label & Description */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-sm font-medium',
            aspect.status === 'complete'
              ? 'text-foreground'
              : aspect.status === 'in_progress'
                ? 'text-foreground'
                : 'text-muted-foreground'
          )}
        >
          {config.label}
        </p>
        <p className="text-xs text-muted-foreground truncate">{config.description}</p>
      </div>

      {/* Status Label */}
      <div className="shrink-0">
        <span
          className={cn(
            'text-xs font-medium',
            aspect.status === 'complete'
              ? 'text-green-600 dark:text-green-400'
              : aspect.status === 'in_progress'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-muted-foreground'
          )}
        >
          {aspect.status === 'complete'
            ? 'Complete'
            : aspect.status === 'in_progress'
              ? 'Analyzing...'
              : 'Pending'}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export const PRReviewStreaming = observer(function PRReviewStreaming({
  aspects,
  className,
}: PRReviewStreamingProps) {
  return (
    <div className={cn('space-y-1', className)}>
      {aspects.map((aspect) => (
        <AspectItem key={aspect.name} aspect={aspect} />
      ))}
    </div>
  );
});

export default PRReviewStreaming;
