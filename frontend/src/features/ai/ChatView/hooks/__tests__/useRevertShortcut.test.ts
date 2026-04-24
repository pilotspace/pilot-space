/**
 * Phase 89 Plan 06 — useRevertShortcut tests.
 *
 * Covers:
 *   - ⌘Z / Ctrl+Z within 10-min window fires revertProposal
 *   - Outside 10-min window → no-op
 *   - Shift+⌘Z → no fire (preserves browser redo)
 *   - Focus in textarea/input/contenteditable → no fire
 *   - Multiple applied proposals → most-recent wins
 *   - No applied proposals → no fire
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { StoreContext, RootStore } from '@/stores/RootStore';
import { useRevertShortcut } from '../useRevertShortcut';
import { mockAppliedProposal } from '@/features/ai/proposals/fixtures/proposals';
import * as proposalApiModule from '@/features/ai/proposals/proposalApi';
import type { RevertResultEnvelope } from '@/features/ai/proposals/types';

const SYSTEM_NOW = new Date('2026-04-24T12:00:00.000Z').getTime();

function mountHook(rootStore: RootStore) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(
      StoreContext.Provider,
      { value: rootStore },
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    );
  const r = renderHook(() => useRevertShortcut(), { wrapper });
  // Ensure useEffect has attached the keydown listener before the test fires.
  act(() => {
    // Flush any pending effects.
  });
  return r;
}

function dispatchKey(opts: {
  key?: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  target?: EventTarget | null;
}): KeyboardEvent {
  const evt = new KeyboardEvent('keydown', {
    key: opts.key ?? 'z',
    metaKey: opts.meta ?? false,
    ctrlKey: opts.ctrl ?? false,
    shiftKey: opts.shift ?? false,
    bubbles: true,
    cancelable: true,
  });
  // Target spoofing — KeyboardEvent's target is readonly; override the getter.
  if (opts.target !== undefined) {
    Object.defineProperty(evt, 'target', {
      value: opts.target,
      configurable: true,
    });
  }
  window.dispatchEvent(evt);
  return evt;
}

function makeRevertResult(id: string, newVersion: number): RevertResultEnvelope {
  return {
    proposal: mockAppliedProposal({ id, appliedVersion: newVersion }),
    newVersionNumber: newVersion,
    newHistoryEntry: {
      vN: newVersion,
      by: 'user',
      at: new Date(SYSTEM_NOW).toISOString(),
      summary: `Reverted v${newVersion + 1} → v${newVersion}`,
      snapshot: {},
    },
  };
}

describe('useRevertShortcut', () => {
  beforeEach(() => {
    // Pin Date.now() to SYSTEM_NOW so decidedAt arithmetic is deterministic.
    // Use a direct stub instead of vi.useFakeTimers() — fake timers trip up
    // TanStack Query's internal scheduling and prevent the mutation from
    // reaching the mocked mutationFn.
    vi.setSystemTime(SYSTEM_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('⌘Z within 10 minutes fires revertProposal on the most-recent applied proposal', async () => {
    const store = new RootStore();
    const applied = mockAppliedProposal({
      id: 'p-recent',
      decidedAt: new Date(SYSTEM_NOW - 2 * 60_000).toISOString(),
      appliedVersion: 5,
    });
    store.proposals.upsertProposal(applied);

    const spy = vi
      .spyOn(proposalApiModule.proposalApi, 'revertProposal')
      .mockResolvedValue(makeRevertResult('p-recent', 4));

    mountHook(store);

    act(() => {
      dispatchKey({ meta: true });
    });

    await waitFor(() => expect(spy).toHaveBeenCalledWith('p-recent'));
  });

  it('Ctrl+Z on linux/windows also fires', async () => {
    const store = new RootStore();
    const applied = mockAppliedProposal({
      id: 'p-ctrl',
      decidedAt: new Date(SYSTEM_NOW - 1 * 60_000).toISOString(),
    });
    store.proposals.upsertProposal(applied);

    const spy = vi
      .spyOn(proposalApiModule.proposalApi, 'revertProposal')
      .mockResolvedValue(makeRevertResult('p-ctrl', 1));

    mountHook(store);

    act(() => {
      dispatchKey({ ctrl: true });
    });

    await waitFor(() => expect(spy).toHaveBeenCalledWith('p-ctrl'));
  });

  it('outside the 10-minute window → no-op', () => {
    const store = new RootStore();
    const stale = mockAppliedProposal({
      id: 'p-stale',
      decidedAt: new Date(SYSTEM_NOW - 11 * 60_000).toISOString(),
    });
    store.proposals.upsertProposal(stale);

    const spy = vi.spyOn(proposalApiModule.proposalApi, 'revertProposal');

    mountHook(store);

    act(() => {
      dispatchKey({ meta: true });
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('Shift+⌘Z (redo) does NOT fire', () => {
    const store = new RootStore();
    const applied = mockAppliedProposal({
      id: 'p-redo',
      decidedAt: new Date(SYSTEM_NOW - 60_000).toISOString(),
    });
    store.proposals.upsertProposal(applied);

    const spy = vi.spyOn(proposalApiModule.proposalApi, 'revertProposal');

    mountHook(store);

    act(() => {
      dispatchKey({ meta: true, shift: true });
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('focus inside a textarea → no fire (preserves editor undo)', () => {
    const store = new RootStore();
    const applied = mockAppliedProposal({
      id: 'p-editor',
      decidedAt: new Date(SYSTEM_NOW - 60_000).toISOString(),
    });
    store.proposals.upsertProposal(applied);

    const spy = vi.spyOn(proposalApiModule.proposalApi, 'revertProposal');

    mountHook(store);

    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    try {
      act(() => {
        dispatchKey({ meta: true, target: ta });
      });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(ta);
    }
  });

  it('focus inside a contenteditable → no fire', () => {
    const store = new RootStore();
    const applied = mockAppliedProposal({
      id: 'p-ce',
      decidedAt: new Date(SYSTEM_NOW - 60_000).toISOString(),
    });
    store.proposals.upsertProposal(applied);

    const spy = vi.spyOn(proposalApiModule.proposalApi, 'revertProposal');

    mountHook(store);

    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    try {
      act(() => {
        dispatchKey({ meta: true, target: div });
      });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      document.body.removeChild(div);
    }
  });

  it('no applied proposals → no fire', () => {
    const store = new RootStore();
    const spy = vi.spyOn(proposalApiModule.proposalApi, 'revertProposal');
    mountHook(store);

    act(() => {
      dispatchKey({ meta: true });
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('picks the most-recent applied proposal when multiple are in-window', async () => {
    const store = new RootStore();
    const older = mockAppliedProposal({
      id: 'p-old',
      decidedAt: new Date(SYSTEM_NOW - 5 * 60_000).toISOString(),
    });
    const newer = mockAppliedProposal({
      id: 'p-new',
      decidedAt: new Date(SYSTEM_NOW - 30_000).toISOString(),
    });
    store.proposals.upsertProposal(older);
    store.proposals.upsertProposal(newer);

    const spy = vi
      .spyOn(proposalApiModule.proposalApi, 'revertProposal')
      .mockResolvedValue(makeRevertResult('p-new', 1));

    mountHook(store);

    act(() => {
      dispatchKey({ meta: true });
    });

    await waitFor(() => expect(spy).toHaveBeenCalledWith('p-new'));
  });

  it('skips reverted proposals and targets the next applied in-window', async () => {
    const store = new RootStore();
    const reverted = mockAppliedProposal({
      id: 'p-gone',
      decidedAt: new Date(SYSTEM_NOW - 30_000).toISOString(),
    });
    reverted.status = 'reverted';
    const applied = mockAppliedProposal({
      id: 'p-live',
      decidedAt: new Date(SYSTEM_NOW - 2 * 60_000).toISOString(),
    });
    store.proposals.upsertProposal(reverted);
    store.proposals.upsertProposal(applied);

    const spy = vi
      .spyOn(proposalApiModule.proposalApi, 'revertProposal')
      .mockResolvedValue(makeRevertResult('p-live', 1));

    mountHook(store);

    act(() => {
      dispatchKey({ meta: true });
    });

    await waitFor(() => expect(spy).toHaveBeenCalledWith('p-live'));
  });
});
