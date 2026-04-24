/**
 * Unit tests for PilotSpaceStore conversation mode extension (Phase 87 — Plan 01).
 *
 * Covers:
 * - getMode default → "plan" when modeBySession empty
 * - setMode → getMode round-trip
 * - per-session isolation
 * - getMode(null) safe path
 * - MobX observability via autorun
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { autorun } from 'mobx';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  },
}));

vi.mock('@/lib/sse-client', () => ({
  SSEClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn(),
  })),
}));

import { PilotSpaceStore } from '../PilotSpaceStore';
import type { AIStore } from '../AIStore';

const mockAIStore = {} as AIStore;

describe('PilotSpaceStore - conversation mode', () => {
  let store: PilotSpaceStore;

  beforeEach(() => {
    store = new PilotSpaceStore(mockAIStore);
  });

  it('getMode returns "plan" by default for an unknown session', () => {
    expect(store.getMode('session-A')).toBe('plan');
  });

  it('setMode then getMode round-trips for the same session', () => {
    store.setMode('session-A', 'act');
    expect(store.getMode('session-A')).toBe('act');
  });

  it('setMode for one session does not affect another (per-session isolation)', () => {
    store.setMode('session-A', 'research');
    expect(store.getMode('session-A')).toBe('research');
    expect(store.getMode('session-B')).toBe('plan');
  });

  it('getMode(null) returns "plan" without throwing', () => {
    expect(() => store.getMode(null)).not.toThrow();
    expect(store.getMode(null)).toBe('plan');
  });

  it('setMode is observable — autorun fires when mode changes', () => {
    const observed: string[] = [];
    const dispose = autorun(() => {
      observed.push(store.getMode('session-A'));
    });

    expect(observed).toEqual(['plan']);
    store.setMode('session-A', 'draft');
    expect(observed).toEqual(['plan', 'draft']);
    store.setMode('session-A', 'act');
    expect(observed).toEqual(['plan', 'draft', 'act']);

    dispose();
  });
});
