/**
 * Phase 89 Plan 06 — revert mutation + store dispatch tests (RED→GREEN).
 *
 * Asserts:
 *   1. `proposalApi.revertProposal(id)` posts and returns RevertResultEnvelope.
 *   2. `useRevertProposal()` optimistic flip to 'reverted' then applyRevertedEvent on success.
 *   3. 409 rollback restores prior envelope.
 *   4. `proposalsStore.applyRevertedEvent()` rewrites appliedVersion and clears
 *      lastAppliedProposalId when it matched.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { StoreContext, RootStore } from '@/stores/RootStore';
import { useRevertProposal } from '../useProposalActions';
import { mockAppliedProposal } from '../fixtures/proposals';
import * as proposalApiModule from '../proposalApi';
import type { RevertResultEnvelope, ProposalRevertedEventData } from '../types';

function makeWrapper(rootStore: RootStore) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(
      StoreContext.Provider,
      { value: rootStore },
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    );
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

function makeResult(proposalId: string, newVersion: number): RevertResultEnvelope {
  const proposal = mockAppliedProposal({ id: proposalId, appliedVersion: newVersion });
  return {
    proposal,
    newVersionNumber: newVersion,
    newHistoryEntry: {
      vN: newVersion,
      by: 'user',
      at: '2026-04-24T12:05:00.000Z',
      summary: `Reverted v${newVersion + 1} → v${newVersion}`,
      snapshot: {},
    },
  };
}

describe('useRevertProposal', () => {
  let rootStore: RootStore;

  beforeEach(() => {
    rootStore = new RootStore();
    vi.restoreAllMocks();
  });

  it('optimistically flips status to "reverted" then persists via applyRevertedEvent', async () => {
    const applied = mockAppliedProposal({ id: 'p-revert', appliedVersion: 5 });
    rootStore.proposals.upsertProposal(applied);
    rootStore.proposals.applyAppliedEvent({
      proposalId: 'p-revert',
      appliedVersion: 5,
      linesChanged: 3,
      timestamp: '2026-04-24T12:00:00.000Z',
    });
    expect(rootStore.proposals.lastAppliedProposalId).toBe('p-revert');

    const result = makeResult('p-revert', 4);
    vi.spyOn(proposalApiModule.proposalApi, 'revertProposal').mockResolvedValue(result);

    const { result: hook } = renderHook(() => useRevertProposal(), {
      wrapper: makeWrapper(rootStore),
    });

    act(() => {
      hook.current.mutate('p-revert');
    });

    // Optimistic flip (before server resolves).
    await waitFor(() => {
      expect(rootStore.proposals.getById('p-revert')?.status).toBe('reverted');
    });

    // After success — appliedVersion rewritten via applyRevertedEvent, lastAppliedProposalId cleared.
    await waitFor(() => {
      expect(rootStore.proposals.getById('p-revert')?.appliedVersion).toBe(4);
    });
    expect(rootStore.proposals.lastAppliedProposalId).toBeNull();
  });

  it('rolls back to prior envelope on 409 from backend', async () => {
    const applied = mockAppliedProposal({ id: 'p-409', appliedVersion: 2 });
    rootStore.proposals.upsertProposal(applied);

    vi.spyOn(proposalApiModule.proposalApi, 'revertProposal').mockRejectedValue(
      new Error('proposal_cannot_be_reverted')
    );

    const { result: hook } = renderHook(() => useRevertProposal(), {
      wrapper: makeWrapper(rootStore),
    });

    act(() => {
      hook.current.mutate('p-409');
    });

    await waitFor(() => {
      expect(hook.current.isError).toBe(true);
    });
    expect(rootStore.proposals.getById('p-409')?.status).toBe('applied');
    expect(rootStore.proposals.getById('p-409')?.appliedVersion).toBe(2);
  });

  it('calls proposalApi.revertProposal with the id', async () => {
    const applied = mockAppliedProposal({ id: 'p-call' });
    rootStore.proposals.upsertProposal(applied);
    const spy = vi
      .spyOn(proposalApiModule.proposalApi, 'revertProposal')
      .mockResolvedValue(makeResult('p-call', 1));

    const { result: hook } = renderHook(() => useRevertProposal(), {
      wrapper: makeWrapper(rootStore),
    });

    act(() => {
      hook.current.mutate('p-call');
    });

    await waitFor(() => expect(spy).toHaveBeenCalledWith('p-call'));
  });
});

describe('ProposalsStore.applyRevertedEvent', () => {
  it('flips status to reverted + rewrites appliedVersion + clears lastApplied when matching', () => {
    const store = new RootStore().proposals;
    const applied = mockAppliedProposal({ id: 'p1', appliedVersion: 7 });
    store.upsertProposal(applied);
    store.applyAppliedEvent({
      proposalId: 'p1',
      appliedVersion: 7,
      linesChanged: 2,
      timestamp: '2026-04-24T12:00:00.000Z',
    });
    expect(store.lastAppliedProposalId).toBe('p1');

    const evt: ProposalRevertedEventData = {
      proposalId: 'p1',
      newVersionNumber: 6,
      revertedFromVersion: 7,
      timestamp: '2026-04-24T12:05:00.000Z',
    };
    store.applyRevertedEvent(evt);

    expect(store.getById('p1')?.status).toBe('reverted');
    expect(store.getById('p1')?.appliedVersion).toBe(6);
    expect(store.lastAppliedProposalId).toBeNull();
  });

  it('is a no-op for unknown proposal ids', () => {
    const store = new RootStore().proposals;
    store.applyRevertedEvent({
      proposalId: 'does-not-exist',
      newVersionNumber: 1,
      revertedFromVersion: 2,
      timestamp: '2026-04-24T12:00:00.000Z',
    });
    expect(store.getById('does-not-exist')).toBeUndefined();
  });
});
