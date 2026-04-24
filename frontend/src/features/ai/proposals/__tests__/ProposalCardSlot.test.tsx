import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StoreContext, RootStore } from '@/stores/RootStore';
import { ProposalCardSlot } from '../ProposalCardSlot';
import {
  mockTextProposal,
  mockAppliedProposal,
  mockRejectedProposal,
} from '../fixtures/proposals';

vi.mock('sonner', () => ({
  toast: { message: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

function renderSlot(ui: ReactNode, rootStore: RootStore) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...render(
      <StoreContext.Provider value={rootStore}>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </StoreContext.Provider>
    ),
    rootStore,
  };
}

describe('ProposalCardSlot (MessageList integration)', () => {
  let rootStore: RootStore;

  beforeEach(() => {
    rootStore = new RootStore();
    vi.clearAllMocks();
  });

  it('renders nothing when no proposals are keyed to the message', () => {
    renderSlot(<ProposalCardSlot messageId="no-proposals" />, rootStore);
    expect(screen.queryByTestId('proposal-card-slot')).not.toBeInTheDocument();
  });

  it('renders EditProposalCard when a pending proposal exists', () => {
    rootStore.proposals.upsertProposal(mockTextProposal({ id: 'p1', messageId: 'm-1' }));
    renderSlot(<ProposalCardSlot messageId="m-1" />, rootStore);
    expect(screen.getByTestId('proposal-card-slot')).toBeInTheDocument();
    expect(screen.getByTestId('edit-proposal-card')).toBeInTheDocument();
  });

  it('renders AppliedReceipt when the proposal status is applied', () => {
    rootStore.proposals.upsertProposal(
      mockAppliedProposal({ id: 'p1', messageId: 'm-1', appliedVersion: 3 })
    );
    renderSlot(<ProposalCardSlot messageId="m-1" />, rootStore);
    expect(screen.getByTestId('applied-receipt')).toBeInTheDocument();
  });

  it('renders RejectedPill when the proposal status is rejected', () => {
    rootStore.proposals.upsertProposal(
      mockRejectedProposal({ id: 'p1', messageId: 'm-1' })
    );
    renderSlot(<ProposalCardSlot messageId="m-1" />, rootStore);
    expect(screen.getByTestId('rejected-pill')).toBeInTheDocument();
  });

  it('swaps from card → receipt reactively when store status flips to applied', async () => {
    const p = mockTextProposal({ id: 'p1', messageId: 'm-1', appliedVersion: 0 });
    rootStore.proposals.upsertProposal(p);
    renderSlot(<ProposalCardSlot messageId="m-1" />, rootStore);

    expect(screen.getByTestId('edit-proposal-card')).toBeInTheDocument();

    act(() => {
      rootStore.proposals.applyAppliedEvent({
        proposalId: 'p1',
        appliedVersion: 1,
        linesChanged: 3,
        timestamp: new Date().toISOString(),
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('edit-proposal-card')).not.toBeInTheDocument();
      expect(screen.getByTestId('applied-receipt')).toBeInTheDocument();
    });
  });

  it('renders multiple proposals in chronological order', () => {
    rootStore.proposals.upsertProposal(
      mockTextProposal({ id: 'a', messageId: 'm-1', createdAt: '2026-04-24T10:00:00.000Z' })
    );
    rootStore.proposals.upsertProposal(
      mockTextProposal({ id: 'b', messageId: 'm-1', createdAt: '2026-04-24T10:00:10.000Z' })
    );
    renderSlot(<ProposalCardSlot messageId="m-1" />, rootStore);
    expect(screen.getAllByTestId('edit-proposal-card')).toHaveLength(2);
  });
});
