'use client';

/**
 * CancelIssueButton - Icon-only cancel button for a single batch run issue.
 *
 * Uses Radix Popover for inline confirmation (localized impact, lower friction
 * than a full Dialog). Uses React.memo (NOT observer).
 *
 * Phase 76: Sprint Batch Implementation
 */
import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCancelBatchRunIssue } from '../hooks/use-batch-run';

export interface CancelIssueButtonProps {
  batchRunId: string;
  issueId: string;
  issueIdentifier: string;
  workspaceSlug: string;
  onCancelled?: () => void;
}

export const CancelIssueButton = React.memo(function CancelIssueButton({
  batchRunId,
  issueId,
  issueIdentifier,
  workspaceSlug,
  onCancelled,
}: CancelIssueButtonProps) {
  const [open, setOpen] = React.useState(false);
  const cancelMutation = useCancelBatchRunIssue(workspaceSlug);

  const handleConfirm = React.useCallback(() => {
    cancelMutation.mutate(
      { batchRunId, issueId },
      {
        onSuccess: () => {
          setOpen(false);
          onCancelled?.();
        },
      }
    );
  }, [cancelMutation, batchRunId, issueId, onCancelled]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cancel implementation for ${issueIdentifier}`}
          className="inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring size-[44px] flex-shrink-0"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end" sideOffset={4}>
        <p className="text-sm text-foreground mb-3">
          Cancel {issueIdentifier}? This will not affect other issues.
        </p>
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Keep
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={cancelMutation.isPending}
            className="min-h-[44px]"
          >
            {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Issue'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
});

CancelIssueButton.displayName = 'CancelIssueButton';
