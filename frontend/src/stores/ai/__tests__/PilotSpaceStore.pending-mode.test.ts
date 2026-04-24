/**
 * Phase 88 Plan 04 — Task 3 RED #1.
 *
 * Adds `pendingMode` extension to PilotSpaceStore:
 *   - field: pendingMode: ChatMode | null
 *   - setPendingMode(mode): store the mode for the as-yet-unassigned session
 *   - getMode(null) returns pendingMode ?? 'plan' (regression-safe)
 *   - setSessionId(realId) (when transitioning null → realId AND pendingMode
 *     is set) migrates pendingMode → modeBySession[realId] then clears it.
 *
 * Use case: the launchpad navigates to /chat?prefill=...&mode=research with
 * NO sessionId yet. Plan 03 PilotSpaceActions.sendMessage reads
 * `getMode(this.store.sessionId)` at submit time — when sessionId is null
 * `getMode` returns 'plan'. We need a way to thread the homepage's chosen
 * mode into the very first send before the backend assigns a session_id.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

describe('PilotSpaceStore — pendingMode (Phase 88 Plan 04)', () => {
  let store: PilotSpaceStore;

  beforeEach(() => {
    store = new PilotSpaceStore(mockAIStore);
  });

  it('setPendingMode("research") then getMode(null) returns "research"', () => {
    store.setPendingMode('research');
    expect(store.getMode(null)).toBe('research');
    // pendingMode field is exposed on the store for inspection.
    expect(store.pendingMode).toBe('research');
  });

  it('setPendingMode then setSessionId(real) migrates pendingMode into modeBySession[real] and clears pendingMode', () => {
    store.setPendingMode('research');
    expect(store.pendingMode).toBe('research');
    expect(store.sessionId).toBeNull();

    store.setSessionId('sess-abc');

    expect(store.sessionId).toBe('sess-abc');
    expect(store.getMode('sess-abc')).toBe('research');
    expect(store.pendingMode).toBeNull();
  });

  it('getMode(null) with no pendingMode falls back to "plan" (regression guard)', () => {
    expect(store.pendingMode).toBeNull();
    expect(store.getMode(null)).toBe('plan');
  });

  it('explicit setMode after migration is preserved (does not get clobbered by future sends)', () => {
    store.setPendingMode('draft');
    store.setSessionId('sess-xyz');
    // After migration, the user changes mode mid-conversation:
    store.setMode('sess-xyz', 'act');
    expect(store.getMode('sess-xyz')).toBe('act');
    // pendingMode stays cleared.
    expect(store.pendingMode).toBeNull();
  });

  it('setSessionId(null) does NOT clobber pendingMode (regression: real → null transitions)', () => {
    // Simulate: user is mid-launchpad with pendingMode set, then resets.
    store.setPendingMode('research');
    store.setSessionId(null);
    // pendingMode survives the no-op transition.
    expect(store.pendingMode).toBe('research');
    expect(store.getMode(null)).toBe('research');
  });

  it('setPendingMode(null) clears the pendingMode (back to default)', () => {
    store.setPendingMode('act');
    expect(store.getMode(null)).toBe('act');
    store.setPendingMode(null);
    expect(store.pendingMode).toBeNull();
    expect(store.getMode(null)).toBe('plan');
  });
});
