'use client';

/**
 * CancelBatchButton - Destructive button to cancel an entire batch run.
 *
 * Requires confirmation via shadcn Dialog before sending the cancel request.
 * Uses React.memo (NOT observer).
 *
 * Phase 76: Sprint Batch Implementation
 */
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCancelBatchRun } from '../hooks/use-batch-run';

export interface CancelBatchButtonProps {
  batchRunId: string;
  workspaceSlug: string;
  onCancelled?: () => void;
}

export const CancelBatchButton = React.memo(function CancelBatchButton({
  batchRunId,
  workspaceSlug,
  onCancelled,
}: CancelBatchButtonProps) {
  const [open, setOpen] = React.useState(false);
  const cancelMutation = useCancelBatchRun(workspaceSlug);

  const handleConfirm = React.useCallback(() => {
    cancelMutation.mutate(batchRunId, {
      onSuccess: () => {
        setOpen(false);
        onCancelled?.();
      },
    });
  }, [cancelMutation, batchRunId, onCancelled]);

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label="Stop sprint implementation"
        className="min-h-[44px]"
      >
        Stop Implementation
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Sprint Implementation</DialogTitle>
            <DialogDescription>
              This will cancel all queued issues. In-progress issues will finish their current step.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={cancelMutation.isPending}>
              Keep Running
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={cancelMutation.isPending}
              className="min-h-[44px]"
            >
              {cancelMutation.isPending ? 'Stopping...' : 'Stop Implementation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

CancelBatchButton.displayName = 'CancelBatchButton';
