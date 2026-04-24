/**
 * ProposalCardSlot — MessageList integration point for proposals.
 *
 * Looks up any ProposalEnvelope(s) attached to an assistant message via
 * proposalsStore.getByMessageId(messageId) and renders the appropriate
 * state surface: EditProposalCard, AppliedReceipt, RejectedPill, or a
 * dimmed pending card for 'retried'.
 *
 * Wrapped in observer() so MobX store mutations re-render this slot
 * without re-rendering the whole AssistantMessage tree.
 */

'use client';

import { memo, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { useProposalsStore } from '@/stores/RootStore';
import { EditProposalCard } from './EditProposalCard';
import { AppliedReceipt } from './AppliedReceipt';
import { RejectedPill } from './RejectedPill';
import type { ProposalEnvelope } from './types';

interface ProposalCardSlotProps {
  messageId: string;
}

interface ProposalRendererProps {
  proposal: ProposalEnvelope;
  linesChanged: number | null;
  onRevert: (proposalId: string) => void;
  onViewDiff: (artifactType: string, artifactId: string) => void;
}

const ProposalRenderer = memo<ProposalRendererProps>(function ProposalRenderer({
  proposal,
  linesChanged,
  onRevert,
  onViewDiff,
}) {
  if (proposal.status === 'pending') {
    return (
      <EditProposalCard
        envelope={proposal}
        onOpenInEditor={(type, id) => onViewDiff(type, id)}
      />
    );
  }
  if (proposal.status === 'applied') {
    return (
      <AppliedReceipt
        envelope={proposal}
        linesChanged={linesChanged}
        onRevert={onRevert}
        onViewDiff={onViewDiff}
      />
    );
  }
  if (proposal.status === 'rejected') {
    return <RejectedPill envelope={proposal} variant="rejected" />;
  }
  if (proposal.status === 'retried') {
    return (
      <div className="opacity-60" aria-busy="true">
        <EditProposalCard envelope={proposal} />
      </div>
    );
  }
  if (proposal.status === 'errored') {
    return <RejectedPill envelope={proposal} variant="errored" />;
  }
  return null;
});

export const ProposalCardSlot = observer<ProposalCardSlotProps>(function ProposalCardSlot({
  messageId,
}) {
  const proposalsStore = useProposalsStore();
  const proposals = proposalsStore.getByMessageId(messageId);

  const onRevert = useCallback(
    (_proposalId: string) => {
      // Phase 89 Plan 06 seam: Plan 06 replaces this with the real revert
      // mutation. Until then the click surfaces a toast so users see the
      // button reacts without claiming work was done.
      toast.message('Revert is not yet available', {
        description: 'The revert mutation ships in Phase 89 Plan 06.',
      });
    },
    []
  );

  const onViewDiff = useCallback((artifactType: string, artifactId: string) => {
    // Opens the peek drawer for the target artifact.
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('peek', artifactId);
    url.searchParams.set('peekType', artifactType.toLowerCase());
    window.history.pushState({}, '', url.toString());
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  if (proposals.length === 0) return null;

  return (
    <div className="mt-3 space-y-3" data-testid="proposal-card-slot" data-message-id={messageId}>
      {proposals.map((p) => (
        <ProposalRenderer
          key={p.id}
          proposal={p}
          linesChanged={proposalsStore.getLinesChanged(p.id)}
          onRevert={onRevert}
          onViewDiff={onViewDiff}
        />
      ))}
    </div>
  );
});

ProposalCardSlot.displayName = 'ProposalCardSlot';
