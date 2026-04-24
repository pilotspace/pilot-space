import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StoreContext, RootStore } from '@/stores/RootStore';
import { RejectedPill } from '../RejectedPill';
import {
  mockRejectedProposal,
  mockTextProposal,
} from '../fixtures/proposals';
import * as proposalApiModule from '../proposalApi';

function renderPill(ui: ReactNode, rootStore: RootStore = new RootStore()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    rootStore,
    ...render(
      <StoreContext.Provider value={rootStore}>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </StoreContext.Provider>
    ),
  };
}

describe('RejectedPill', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the rejected variant with Try again CTA', () => {
    render(<></>);
    renderPill(<RejectedPill envelope={mockRejectedProposal()} />);
    const pill = screen.getByTestId('rejected-pill');
    expect(pill.getAttribute('data-variant')).toBe('rejected');
    expect(pill).toHaveTextContent('Rejected');
    expect(screen.getByTestId('try-again-button')).toBeInTheDocument();
  });

  it('uses neutral gray tokens on the default variant', () => {
    renderPill(<RejectedPill envelope={mockRejectedProposal()} />);
    const pill = screen.getByTestId('rejected-pill');
    expect(pill).toHaveClass('bg-[#f3f4f6]', 'text-[#6b7280]');
  });

  it('Try again click fires retry mutation for this proposal', async () => {
    const envelope = mockRejectedProposal({ id: 'p-retry' });
    const store = new RootStore();
    store.proposals.upsertProposal(envelope);
    const spy = vi
      .spyOn(proposalApiModule.proposalApi, 'retryProposal')
      .mockResolvedValue({ ...envelope, status: 'retried' });

    renderPill(<RejectedPill envelope={envelope} />, store);
    await userEvent.click(screen.getByTestId('try-again-button'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith('p-retry', undefined));
  });

  it('retried variant renders spinning icon + "Retrying…" copy', () => {
    renderPill(<RejectedPill envelope={mockTextProposal({ status: 'retried' })} />);
    const pill = screen.getByTestId('rejected-pill');
    expect(pill.getAttribute('data-variant')).toBe('retried');
    expect(pill).toHaveTextContent(/retrying/i);
  });

  it('errored variant uses destructive tokens + shows error text', () => {
    renderPill(
      <RejectedPill
        envelope={mockTextProposal({ status: 'errored' })}
        variant="errored"
        errorMessage="RLS denied"
      />
    );
    const pill = screen.getByTestId('rejected-pill');
    expect(pill.getAttribute('data-variant')).toBe('errored');
    expect(pill).toHaveClass('text-[#D9534F]');
    expect(pill).toHaveTextContent(/RLS denied/);
  });

  it('reverted variant renders "Reverted to v{N-1}" when appliedVersion present', () => {
    renderPill(
      <RejectedPill
        envelope={mockTextProposal({ appliedVersion: 5 })}
        variant="reverted"
      />
    );
    expect(screen.getByTestId('rejected-pill')).toHaveTextContent('Reverted to v4');
  });

  it('has role=status for screen readers', () => {
    renderPill(<RejectedPill envelope={mockRejectedProposal()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
