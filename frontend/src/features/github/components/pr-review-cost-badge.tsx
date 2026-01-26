'use client';

/**
 * PR Review Cost Badge - Displays token usage and estimated cost.
 *
 * T146: Shows cost badge with tooltip containing input/output token counts.
 * Format: <$0.01 for small amounts, $X.XX for larger amounts.
 *
 * @example
 * ```tsx
 * <PRReviewCostBadge tokenUsage={tokenUsage} />
 * ```
 */

import { Coins } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { TokenUsage } from '@/stores/ai';

// ============================================================================
// Types
// ============================================================================

export interface PRReviewCostBadgeProps {
  /** Token usage data */
  tokenUsage: TokenUsage;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format cost with proper precision.
 * - < $0.01: show as "<$0.01"
 * - >= $0.01: show as "$X.XX"
 */
function formatCost(cost: number): string {
  if (cost < 0.01) {
    return '<$0.01';
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count with thousands separator.
 */
function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

// ============================================================================
// Component
// ============================================================================

export function PRReviewCostBadge({ tokenUsage, className }: PRReviewCostBadgeProps) {
  const { inputTokens, outputTokens, estimatedCostUsd } = tokenUsage;
  const totalTokens = inputTokens + outputTokens;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={className}>
            <Coins className="size-3 mr-1" />
            {formatCost(estimatedCostUsd)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="space-y-1">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-6 text-xs">
              <span className="text-muted-foreground">Input tokens:</span>
              <span className="font-mono font-medium">{formatTokens(inputTokens)}</span>
            </div>
            <div className="flex items-center justify-between gap-6 text-xs">
              <span className="text-muted-foreground">Output tokens:</span>
              <span className="font-mono font-medium">{formatTokens(outputTokens)}</span>
            </div>
            <div className="flex items-center justify-between gap-6 text-xs pt-1 border-t">
              <span className="text-muted-foreground">Total tokens:</span>
              <span className="font-mono font-medium">{formatTokens(totalTokens)}</span>
            </div>
            <div className="flex items-center justify-between gap-6 text-xs pt-1 border-t font-semibold">
              <span>Estimated cost:</span>
              <span className="font-mono">${estimatedCostUsd.toFixed(4)}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default PRReviewCostBadge;
