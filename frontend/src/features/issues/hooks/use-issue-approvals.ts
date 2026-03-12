/**
 * useIssueApprovals - Extracts DD-003 approval flow logic from IssueDetailPage.
 *
 * Maps PilotSpace store pending approvals to a normalized shape,
 * filters by issueId, and detects destructive actions.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { isDestructiveAction } from '@/features/ai/ChatView/ChatView';

interface PendingApproval {
  requestId: string;
  actionType: string;
  description: string;
  consequences?: string;
  proposedContent?: unknown;
  createdAt: Date;
  expiresAt: Date;
  affectedEntities: Array<{ type: string; id: string }>;
}

interface PilotSpaceApprovalAPI {
  approveRequest: (id: string) => Promise<void>;
  rejectRequest: (id: string, reason: string) => Promise<void>;
  pendingApprovals?: PendingApproval[];
}

export interface NormalizedApproval {
  id: string;
  agentName: string;
  actionType: string;
  status: 'pending';
  contextPreview: string;
  payload: Record<string, unknown> | undefined;
  createdAt: Date;
  expiresAt: Date;
  reasoning: string | undefined;
}

export function useIssueApprovals(
  pilotSpace: PilotSpaceApprovalAPI,
  issueId: string,
  setIsChatOpen: (open: boolean) => void
) {
  const [destructiveModalOpen, setDestructiveModalOpen] = useState(false);

  const issueApprovals = useMemo<NormalizedApproval[]>(() => {
    return (
      pilotSpace.pendingApprovals
        ?.filter((r) => r.affectedEntities.some((e) => e.type === 'issue' && e.id === issueId))
        .map((r) => ({
          id: r.requestId,
          agentName: 'PilotSpace Agent',
          actionType: r.actionType,
          status: 'pending' as const,
          contextPreview: r.description,
          payload: r.proposedContent as Record<string, unknown> | undefined,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          reasoning: r.consequences,
        })) ?? []
    );
  }, [pilotSpace.pendingApprovals, issueId]);

  const destructiveApproval = useMemo(
    () => issueApprovals.find((a) => isDestructiveAction(a.actionType)) ?? null,
    [issueApprovals]
  );

  // Auto-open chat for non-destructive; modal for destructive.
  // Use ref + microtask to avoid synchronous setState inside useEffect (eslint react-hooks/set-state-in-effect).
  const prevApprovalCountRef = React.useRef(0);
  React.useEffect(() => {
    const prevCount = prevApprovalCountRef.current;
    prevApprovalCountRef.current = issueApprovals.length;
    if (issueApprovals.length === 0 || issueApprovals.length === prevCount) return;
    // Schedule state updates outside the effect synchronous phase
    queueMicrotask(() => {
      if (destructiveApproval) {
        setDestructiveModalOpen(true);
      } else {
        setIsChatOpen(true);
      }
    });
  }, [issueApprovals.length, destructiveApproval, setIsChatOpen]);

  const handleApproveAction = useCallback(
    async (id: string) => {
      await pilotSpace.approveRequest(id);
    },
    [pilotSpace]
  );

  const handleRejectAction = useCallback(
    async (id: string, reason: string) => {
      await pilotSpace.rejectRequest(id, reason);
    },
    [pilotSpace]
  );

  return {
    issueApprovals,
    destructiveApproval,
    destructiveModalOpen,
    setDestructiveModalOpen,
    handleApproveAction,
    handleRejectAction,
  };
}
