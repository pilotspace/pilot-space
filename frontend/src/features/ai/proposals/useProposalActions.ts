/**
 * TanStack Query mutations for the Edit Proposal pipeline.
 *
 * Each mutation:
 *   - Runs the optimistic update on `proposalsStore` via `onMutate`
 *   - Rolls back on error via `onError` (returns prev envelope snapshot)
 *   - Writes the server response on success via `onSuccess`
 *
 * Optimistic strategy: flips the card visually to applied/rejected/retried
 * immediately. If the backend 500s, we restore the prior envelope and a
 * toast fires at the call site.
 */

import { useMutation } from '@tanstack/react-query';
import { useProposalsStore } from '@/stores/RootStore';
import { proposalApi } from './proposalApi';
import type { ProposalEnvelope, RevertResultEnvelope } from './types';

interface OptimisticContext {
  prev: ProposalEnvelope | undefined;
}

export function useAcceptProposal() {
  const proposalsStore = useProposalsStore();
  return useMutation<ProposalEnvelope, Error, string, OptimisticContext>({
    mutationFn: (id: string) => proposalApi.acceptProposal(id),
    onMutate: async (id) => {
      const prev = proposalsStore.getById(id);
      if (prev) {
        proposalsStore.setStatus(id, 'applied', new Date().toISOString());
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) proposalsStore.upsertProposal(ctx.prev);
    },
    onSuccess: (envelope) => {
      proposalsStore.upsertProposal(envelope);
    },
  });
}

interface RejectVars {
  id: string;
  reason?: string;
}

export function useRejectProposal() {
  const proposalsStore = useProposalsStore();
  return useMutation<ProposalEnvelope, Error, RejectVars, OptimisticContext>({
    mutationFn: (v) => proposalApi.rejectProposal(v.id, v.reason),
    onMutate: async (v) => {
      const prev = proposalsStore.getById(v.id);
      if (prev) {
        proposalsStore.setStatus(v.id, 'rejected', new Date().toISOString());
      }
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) proposalsStore.upsertProposal(ctx.prev);
    },
    onSuccess: (envelope) => {
      proposalsStore.upsertProposal(envelope);
    },
  });
}

interface RetryVars {
  id: string;
  hint?: string;
}

export function useRetryProposal() {
  const proposalsStore = useProposalsStore();
  return useMutation<ProposalEnvelope, Error, RetryVars, OptimisticContext>({
    mutationFn: (v) => proposalApi.retryProposal(v.id, v.hint),
    onMutate: async (v) => {
      const prev = proposalsStore.getById(v.id);
      if (prev) {
        proposalsStore.setStatus(v.id, 'retried', new Date().toISOString());
      }
      return { prev };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) proposalsStore.upsertProposal(ctx.prev);
    },
    onSuccess: (envelope) => {
      proposalsStore.upsertProposal(envelope);
    },
  });
}

/**
 * Phase 89 Plan 06 — revert an applied proposal.
 *
 * Optimistic: flips status='reverted' on `onMutate` so the UI swaps
 * AppliedReceipt → RevertedPill immediately. The SSE `proposal_reverted`
 * frame is authoritative — when it arrives the store's appliedVersion
 * is re-written via `applyRevertedEvent`. On a 409 from the backend (wrong
 * status or window expired), the prior envelope is restored and the
 * component surfaces the error via the toast raised at call site.
 */
export function useRevertProposal() {
  const proposalsStore = useProposalsStore();
  return useMutation<RevertResultEnvelope, Error, string, OptimisticContext>({
    mutationFn: (id: string) => proposalApi.revertProposal(id),
    onMutate: async (id) => {
      const prev = proposalsStore.getById(id);
      if (prev) {
        proposalsStore.setStatus(id, 'reverted', new Date().toISOString());
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) proposalsStore.upsertProposal(ctx.prev);
    },
    onSuccess: (result) => {
      // Mirror the SSE handler path so the outcome is identical whether the
      // server-side REST response or the SSE frame wins the race.
      proposalsStore.applyRevertedEvent({
        proposalId: result.proposal.id,
        newVersionNumber: result.newVersionNumber,
        revertedFromVersion: result.proposal.appliedVersion ?? result.newVersionNumber,
        timestamp: result.newHistoryEntry.at,
      });
    },
  });
}
