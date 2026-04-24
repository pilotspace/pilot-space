import { describe, it, expect, beforeEach } from 'vitest';
import { PilotSpaceStreamHandler } from '../PilotSpaceStreamHandler';
import { PilotSpaceStore } from '../PilotSpaceStore';
import type { AIStore } from '../AIStore';
import { ProposalsStore } from '@/stores/proposals/proposalsStore';
import { mockTextProposal } from '@/features/ai/proposals/fixtures/proposals';

describe('PilotSpaceStreamHandler — Phase 89 proposal_* dispatch', () => {
  let store: PilotSpaceStore;
  let proposals: ProposalsStore;
  let handler: PilotSpaceStreamHandler;

  beforeEach(() => {
    store = new PilotSpaceStore({} as AIStore);
    proposals = new ProposalsStore();
    handler = new PilotSpaceStreamHandler(store, proposals);
  });

  it('dispatches proposal_request → proposalsStore.upsertProposal', () => {
    const envelope = mockTextProposal({ id: 'p1', messageId: 'm1' });
    handler.handleSSEEvent({
      type: 'proposal_request',
      data: { ...envelope, eventTimestamp: '2026-04-24T12:00:00.000Z' },
    } as never);

    const stored = proposals.getById('p1');
    expect(stored).toBeDefined();
    expect(stored?.messageId).toBe('m1');
    // eventTimestamp is stripped — store holds the pure envelope.
    expect((stored as unknown as Record<string, unknown>).eventTimestamp).toBeUndefined();
  });

  it('dispatches proposal_applied → applyAppliedEvent', () => {
    proposals.upsertProposal(mockTextProposal({ id: 'p1' }));
    handler.handleSSEEvent({
      type: 'proposal_applied',
      data: {
        proposalId: 'p1',
        appliedVersion: 5,
        linesChanged: 12,
        timestamp: '2026-04-24T12:00:05.000Z',
      },
    } as never);

    expect(proposals.getById('p1')?.status).toBe('applied');
    expect(proposals.getById('p1')?.appliedVersion).toBe(5);
    expect(proposals.getLinesChanged('p1')).toBe(12);
    expect(proposals.lastAppliedProposalId).toBe('p1');
  });

  it('dispatches proposal_rejected → applyRejectedEvent', () => {
    proposals.upsertProposal(mockTextProposal({ id: 'p1' }));
    handler.handleSSEEvent({
      type: 'proposal_rejected',
      data: {
        proposalId: 'p1',
        reason: 'not needed',
        timestamp: '2026-04-24T12:00:05.000Z',
      },
    } as never);

    expect(proposals.getById('p1')?.status).toBe('rejected');
  });

  it('dispatches proposal_retried → applyRetriedEvent', () => {
    proposals.upsertProposal(mockTextProposal({ id: 'p1' }));
    handler.handleSSEEvent({
      type: 'proposal_retried',
      data: {
        proposalId: 'p1',
        hint: 'try smaller scope',
        timestamp: '2026-04-24T12:00:05.000Z',
      },
    } as never);

    expect(proposals.getById('p1')?.status).toBe('retried');
  });

  it('gracefully ignores proposal events when proposalsStore is not wired', () => {
    const bareHandler = new PilotSpaceStreamHandler(store);
    expect(() => {
      bareHandler.handleSSEEvent({
        type: 'proposal_request',
        data: { ...mockTextProposal(), eventTimestamp: '2026-04-24T12:00:00.000Z' },
      } as never);
    }).not.toThrow();
  });

  it('setProposalsStore wires the store post-construction', () => {
    const bareHandler = new PilotSpaceStreamHandler(store);
    const lateStore = new ProposalsStore();
    bareHandler.setProposalsStore(lateStore);
    const envelope = mockTextProposal({ id: 'late' });
    bareHandler.handleSSEEvent({
      type: 'proposal_request',
      data: { ...envelope, eventTimestamp: '2026-04-24T12:00:00.000Z' },
    } as never);
    expect(lateStore.getById('late')).toBeDefined();
  });
});
