/**
 * SuggestionCard - Inline suggestion card for non-destructive AI approvals
 *
 * Renders within the chat message stream instead of blocking modal overlay.
 * Per DD-003: non-destructive suggestions appear inline, destructive actions
 * still use ApprovalOverlay modal.
 */

'use client';

import { memo } from 'react';
import { Lightbulb } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ApprovalRequest } from '../types';

interface SuggestionCardProps {
  approval: ApprovalRequest;
  onApprove: (id: string, modifications?: Record<string, unknown>) => void;
  onReject: (id: string, reason: string) => void;
  className?: string;
}

export const SuggestionCard = memo<SuggestionCardProps>(
  ({ approval, onApprove, onReject, className }) => {
    return (
      <div
        data-testid="suggestion-card"
        role="region"
        aria-label={`AI suggestion: ${approval.actionType}`}
        className={cn(
          'mx-4 my-3 rounded-lg border p-4',
          'border-amber-200 bg-amber-50',
          'dark:border-amber-800 dark:bg-amber-950/30',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-0 text-xs">
            Suggestion
          </Badge>
        </div>

        {/* Content */}
        <p className="text-sm text-foreground leading-relaxed mb-3">
          {approval.contextPreview || approval.reasoning || 'AI suggestion'}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => onApprove(approval.id)}
            data-testid="suggestion-apply"
            aria-label="Apply suggestion"
          >
            Apply
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReject(approval.id, 'dismissed')}
            data-testid="suggestion-dismiss"
            aria-label="Dismiss suggestion"
          >
            Dismiss
          </Button>
        </div>
      </div>
    );
  }
);

SuggestionCard.displayName = 'SuggestionCard';
