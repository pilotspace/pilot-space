'use client';

/**
 * Review Aspect Card - Collapsible card showing findings for one review aspect.
 *
 * T145: Shows badge counts for critical/warning findings, collapsible list
 * of findings with severity colors, file + line references, and suggestions.
 *
 * @example
 * ```tsx
 * <ReviewAspectCard
 *   aspectName="security"
 *   findings={findings}
 *   defaultOpen
 * />
 * ```
 */

import * as React from 'react';
import {
  ChevronDown,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { ReviewFinding, FindingSeverity, ReviewAspectName } from '@/stores/ai';

// ============================================================================
// Types
// ============================================================================

export interface ReviewAspectCardProps {
  /** Aspect name */
  aspectName: ReviewAspectName;
  /** List of findings for this aspect */
  findings: ReviewFinding[];
  /** Whether card is open by default */
  defaultOpen?: boolean;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Configuration
// ============================================================================

interface AspectLabelConfig {
  label: string;
  color: string;
}

const aspectLabels: Record<ReviewAspectName, AspectLabelConfig> = {
  architecture: { label: 'Architecture', color: 'text-purple-600 dark:text-purple-400' },
  security: { label: 'Security', color: 'text-red-600 dark:text-red-400' },
  quality: { label: 'Code Quality', color: 'text-blue-600 dark:text-blue-400' },
  performance: { label: 'Performance', color: 'text-orange-600 dark:text-orange-400' },
  documentation: { label: 'Documentation', color: 'text-green-600 dark:text-green-400' },
};

interface SeverityConfig {
  icon: React.ElementType;
  label: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const severityConfig: Record<FindingSeverity, SeverityConfig> = {
  critical: {
    icon: AlertCircle,
    label: 'Critical',
    bgClass: 'bg-destructive',
    textClass: 'text-destructive-foreground',
    borderClass: 'border-l-destructive',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Warning',
    bgClass: 'bg-yellow-500/10',
    textClass: 'text-yellow-600 dark:text-yellow-400',
    borderClass: 'border-l-yellow-500',
  },
  info: {
    icon: Info,
    label: 'Info',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-600 dark:text-blue-400',
    borderClass: 'border-l-blue-500',
  },
  success: {
    icon: CheckCircle2,
    label: 'Success',
    bgClass: 'bg-green-500/10',
    textClass: 'text-green-600 dark:text-green-400',
    borderClass: 'border-l-green-500',
  },
};

// ============================================================================
// Finding Item Component
// ============================================================================

interface FindingItemProps {
  finding: ReviewFinding;
}

function FindingItem({ finding }: FindingItemProps) {
  const [showSuggestion, setShowSuggestion] = React.useState(false);
  const config = severityConfig[finding.severity];
  const Icon = config.icon;

  return (
    <div className={cn('rounded-lg border border-l-4 bg-card p-3 space-y-2', config.borderClass)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <Badge variant="outline" className={cn('gap-1', config.bgClass, config.textClass)}>
          <Icon className="size-3" />
          {config.label}
        </Badge>
        {finding.file && (
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {finding.file}
            {finding.line && `:${finding.line}`}
          </span>
        )}
      </div>

      {/* Message */}
      <p className="text-sm">{finding.message}</p>

      {/* Suggestion (collapsible) */}
      {finding.suggestion && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setShowSuggestion(!showSuggestion)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showSuggestion ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            View suggestion
          </button>
          {showSuggestion && (
            <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto font-mono">
              <code>{finding.suggestion}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ReviewAspectCard({
  aspectName,
  findings,
  defaultOpen = false,
  className,
}: ReviewAspectCardProps) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  const aspectLabel = aspectLabels[aspectName];

  // Count findings by severity
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;
  const successCount = findings.filter((f) => f.severity === 'success').length;

  // No findings - show success state
  if (findings.length === 0) {
    return (
      <div className={cn('rounded-lg border bg-card p-4', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
            <span className={cn('font-medium', aspectLabel.color)}>{aspectLabel.label}</span>
          </div>
          <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400">
            No issues
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger className="w-full rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronRight className="size-4 shrink-0" />
            )}
            <span className={cn('font-medium', aspectLabel.color)}>{aspectLabel.label}</span>
          </div>

          {/* Severity Counts */}
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="outline" className="bg-destructive text-destructive-foreground">
                {criticalCount} Critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge
                variant="outline"
                className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
              >
                {warningCount} Warning{warningCount !== 1 && 's'}
              </Badge>
            )}
            {infoCount > 0 && (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400">
                {infoCount} Info
              </Badge>
            )}
            {successCount > 0 && (
              <Badge
                variant="outline"
                className="bg-green-500/10 text-green-600 dark:text-green-400"
              >
                {successCount} Success
              </Badge>
            )}
            <Badge variant="secondary">{findings.length} total</Badge>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-3 space-y-2">
        {findings.map((finding, idx) => (
          <FindingItem key={idx} finding={finding} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default ReviewAspectCard;
