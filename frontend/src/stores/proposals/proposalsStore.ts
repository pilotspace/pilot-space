/**
 * ProposalsStore — client-side cache of in-flight Proposal envelopes.
 *
 * Keyed by `proposal.id`. The MessageList layer indexes lookups by
 * `messageId` via `getByMessageId(msgId)` (read-through filter).
 *
 * SSE handlers call the three `apply*Event` methods to mutate the stored
 * envelope status in response to the matching backend frames.
 */

import { makeAutoObservable, observable, runInAction } from 'mobx';
import type {
  ProposalAppliedEventData,
  ProposalEnvelope,
  ProposalRejectedEventData,
  ProposalRetriedEventData,
  ProposalRevertedEventData,
  ProposalStatus,
} from '@/features/ai/proposals/types';

export class ProposalsStore {
  /** id → envelope */
  proposals = observable.map<string, ProposalEnvelope>();
  /** Last-applied proposal id for ⌘Z revert targeting (Plan 06 seam). */
  lastAppliedProposalId: string | null = null;
  /** Bookkeeping: number of lines/fields changed, keyed by proposal id. */
  linesChangedByProposal = observable.map<string, number | null>();

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  upsertProposal(envelope: ProposalEnvelope): void {
    this.proposals.set(envelope.id, envelope);
  }

  remove(proposalId: string): void {
    this.proposals.delete(proposalId);
    this.linesChangedByProposal.delete(proposalId);
    if (this.lastAppliedProposalId === proposalId) {
      this.lastAppliedProposalId = null;
    }
  }

  reset(): void {
    this.proposals.clear();
    this.linesChangedByProposal.clear();
    this.lastAppliedProposalId = null;
  }

  // ----- read views ---------------------------------------------------------

  getByMessageId(messageId: string): ProposalEnvelope[] {
    const out: ProposalEnvelope[] = [];
    for (const p of this.proposals.values()) {
      if (p.messageId === messageId) out.push(p);
    }
    // Chronological by createdAt (ISO strings sort correctly).
    return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  pendingByMessageId(messageId: string): ProposalEnvelope[] {
    return this.getByMessageId(messageId).filter((p) => p.status === 'pending');
  }

  getById(proposalId: string): ProposalEnvelope | undefined {
    return this.proposals.get(proposalId);
  }

  getLinesChanged(proposalId: string): number | null {
    return this.linesChangedByProposal.get(proposalId) ?? null;
  }

  // ----- SSE event appliers -------------------------------------------------

  applyAppliedEvent(event: ProposalAppliedEventData): void {
    const existing = this.proposals.get(event.proposalId);
    if (!existing) return;
    runInAction(() => {
      this.proposals.set(event.proposalId, {
        ...existing,
        status: 'applied',
        appliedVersion: event.appliedVersion,
        decidedAt: event.timestamp,
      });
      this.linesChangedByProposal.set(event.proposalId, event.linesChanged);
      this.lastAppliedProposalId = event.proposalId;
    });
  }

  applyRejectedEvent(event: ProposalRejectedEventData): void {
    const existing = this.proposals.get(event.proposalId);
    if (!existing) return;
    runInAction(() => {
      this.proposals.set(event.proposalId, {
        ...existing,
        status: 'rejected',
        decidedAt: event.timestamp,
      });
    });
  }

  applyRetriedEvent(event: ProposalRetriedEventData): void {
    const existing = this.proposals.get(event.proposalId);
    if (!existing) return;
    runInAction(() => {
      this.proposals.set(event.proposalId, {
        ...existing,
        status: 'retried',
        decidedAt: event.timestamp,
      });
    });
  }

  /**
   * Phase 89 Plan 06 — apply the `proposal_reverted` SSE frame. Flips the
   * cached envelope to status='reverted' and rewrites `appliedVersion` to
   * the new (post-revert) version number so the RevertedPill can render
   * `v{newVersion} ← v{revertedFromVersion}` without a re-fetch.
   *
   * Also clears `lastAppliedProposalId` when it matches so the ⌘Z shortcut
   * doesn't re-target the same proposal. Authoritative per D-89-05-03.
   */
  applyRevertedEvent(event: ProposalRevertedEventData): void {
    const existing = this.proposals.get(event.proposalId);
    if (!existing) return;
    runInAction(() => {
      this.proposals.set(event.proposalId, {
        ...existing,
        status: 'reverted',
        appliedVersion: event.newVersionNumber,
      });
      if (this.lastAppliedProposalId === event.proposalId) {
        this.lastAppliedProposalId = null;
      }
    });
  }

  /**
   * Set a transient status directly (e.g. optimistic 'applied' before SSE
   * confirmation). Used by `useProposalActions` optimistic path.
   */
  setStatus(proposalId: string, status: ProposalStatus, decidedAt: string | null = null): void {
    const existing = this.proposals.get(proposalId);
    if (!existing) return;
    this.proposals.set(proposalId, {
      ...existing,
      status,
      decidedAt: decidedAt ?? existing.decidedAt,
    });
  }

  /** Evict non-pending proposals older than `cutoff`. Pending always stay. */
  removeOlderThan(cutoff: Date): void {
    const cutoffIso = cutoff.toISOString();
    const toDelete: string[] = [];
    for (const [id, p] of this.proposals.entries()) {
      if (p.status === 'pending') continue;
      const ref = p.decidedAt ?? p.createdAt;
      if (ref < cutoffIso) toDelete.push(id);
    }
    for (const id of toDelete) this.remove(id);
  }
}
