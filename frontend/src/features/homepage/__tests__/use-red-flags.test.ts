/**
 * Phase 88 Plan 03 — Task 1: useRedFlags hook (RED).
 *
 * useRedFlags composes the existing homepage activity + digest queries and
 * returns at most 3 RedFlag items, ordered stale → sprint → digest.
 *
 * Per advisor pre-work decision (locked 2026-04-24):
 *  - Activity payload exposes neither `staleCount` nor `activeCycle.healthStatus`.
 *    Digest is the truth source for ALL three signals via DigestCategory:
 *      • `stale_issues`  → stale flag
 *      • `cycle_risk`    → sprint flag
 *      • anything else   → digest flag (highest relevanceScore)
 *  - useHomepageActivity is still called so `isLoading` / `isError` reflect
 *    both queries (matches must_haves.key_links pattern), but its `data` is
 *    not currently consumed.
 *
 * Hook signature is the **object form** (`useRedFlags({ workspaceId,
 * workspaceSlug })`) per Plan Task 1 §behavior final clause — slug is needed
 * for href construction.
 *
 * Module-boundary mocking (no QueryClientProvider) — matches the pattern
 * used by HomeComposer.test.tsx in Plan 02.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { DigestSuggestion } from '../types';

// ─── Mocks (must hoist before hook import) ──────────────────────────────────

type ActivityHookReturn = {
  isLoading: boolean;
  isError: boolean;
};
type DigestHookReturn = {
  suggestions: DigestSuggestion[];
  isLoading: boolean;
  isError: boolean;
};

const activityMock: ActivityHookReturn = { isLoading: false, isError: false };
const digestMock: DigestHookReturn = {
  suggestions: [],
  isLoading: false,
  isError: false,
};

vi.mock('../hooks/useHomepageActivity', () => ({
  useHomepageActivity: () => activityMock,
}));
vi.mock('../hooks/useWorkspaceDigest', () => ({
  useWorkspaceDigest: () => digestMock,
}));

import { useRedFlags } from '../hooks/use-red-flags';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSuggestion(
  overrides: Partial<DigestSuggestion> & { id: string; category: DigestSuggestion['category'] },
): DigestSuggestion {
  return {
    title: 'Sample',
    description: 'Sample description',
    entityId: null,
    entityType: null,
    entityIdentifier: null,
    projectId: null,
    projectName: null,
    actionType: null,
    actionLabel: null,
    actionUrl: null,
    relevanceScore: 0.5,
    ...overrides,
  };
}

function callHook() {
  return renderHook(() =>
    useRedFlags({ workspaceId: 'ws-1', workspaceSlug: 'workspace' }),
  ).result.current;
}

beforeEach(() => {
  activityMock.isLoading = false;
  activityMock.isError = false;
  digestMock.suggestions = [];
  digestMock.isLoading = false;
  digestMock.isError = false;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useRedFlags (Phase 88 Plan 03)', () => {
  describe('all-quiet', () => {
    it('returns flags: [] when both queries are empty', () => {
      const result = callHook();
      expect(result.flags).toEqual([]);
      expect(result.isLoading).toBe(false);
      expect(result.isError).toBe(false);
    });
  });

  describe('stale only', () => {
    it('emits a single stale flag with correct shape', () => {
      digestMock.suggestions = [
        makeSuggestion({ id: 's1', category: 'stale_issues' }),
        makeSuggestion({ id: 's2', category: 'stale_issues' }),
        makeSuggestion({ id: 's3', category: 'stale_issues' }),
      ];

      const result = callHook();
      expect(result.flags).toHaveLength(1);
      expect(result.flags[0]!.kind).toBe('stale');
      expect(result.flags[0]!.label).toBe('3 stale tasks');
      expect(result.flags[0]!.href).toBe('/workspace/tasks?filter=stale');
      expect(result.flags[0]!.ariaLabel).toBe('3 stale tasks. Open.');
    });

    it('uses singular "task" when count is 1', () => {
      digestMock.suggestions = [
        makeSuggestion({ id: 's1', category: 'stale_issues' }),
      ];
      const result = callHook();
      expect(result.flags[0]!.label).toBe('1 stale task');
      expect(result.flags[0]!.ariaLabel).toBe('1 stale task. Open.');
    });
  });

  describe('stale + sprint', () => {
    it('emits stale then sprint in order', () => {
      digestMock.suggestions = [
        makeSuggestion({
          id: 'c1',
          category: 'cycle_risk',
          title: 'Sprint Q2-W3 at risk',
        }),
        makeSuggestion({ id: 's1', category: 'stale_issues' }),
      ];

      const result = callHook();
      expect(result.flags.map((f) => f.kind)).toEqual(['stale', 'sprint']);
      expect(result.flags[1]!.label).toBe('Sprint Q2-W3 at risk');
      expect(result.flags[1]!.href).toBe('/workspace/projects');
      expect(result.flags[1]!.ariaLabel).toBe('Sprint Q2-W3 at risk. Open.');
    });
  });

  describe('all three', () => {
    it('emits stale → sprint → digest in order, capped at 3', () => {
      digestMock.suggestions = [
        // Out of order on purpose; hook must reorder.
        makeSuggestion({
          id: 'd1',
          category: 'unlinked_notes',
          title: 'Daily digest ready',
          relevanceScore: 0.9,
        }),
        makeSuggestion({
          id: 'd2',
          category: 'overdue_items',
          title: 'Lower-priority digest',
          relevanceScore: 0.4,
        }),
        makeSuggestion({
          id: 'c1',
          category: 'cycle_risk',
          title: 'Sprint at risk',
        }),
        makeSuggestion({ id: 's1', category: 'stale_issues' }),
        makeSuggestion({ id: 's2', category: 'stale_issues' }),
      ];

      const result = callHook();
      expect(result.flags).toHaveLength(3);
      expect(result.flags.map((f) => f.kind)).toEqual([
        'stale',
        'sprint',
        'digest',
      ]);
      // Stale: count = 2.
      expect(result.flags[0]!.label).toBe('2 stale tasks');
      // Digest: highest relevanceScore among non-stale/non-cycle_risk wins.
      expect(result.flags[2]!.label).toBe('Daily digest ready');
      expect(result.flags[2]!.href).toBe('/workspace/digest');
      expect(result.flags[2]!.ariaLabel).toBe('Daily digest ready. Open.');
    });
  });

  describe('digest endpoint errors', () => {
    it('returns no flags and isError reflects digest error', () => {
      digestMock.isError = true;
      digestMock.suggestions = [];

      const result = callHook();
      expect(result.flags).toEqual([]);
      expect(result.isError).toBe(true);
    });
  });

  describe('href values', () => {
    it('uses /{slug}/tasks?filter=stale for stale, /{slug}/projects for sprint, /{slug}/digest for digest', () => {
      digestMock.suggestions = [
        makeSuggestion({ id: 's1', category: 'stale_issues' }),
        makeSuggestion({ id: 'c1', category: 'cycle_risk', title: 'Sprint risk' }),
        makeSuggestion({
          id: 'd1',
          category: 'unlinked_notes',
          title: 'Digest item',
          relevanceScore: 0.8,
        }),
      ];

      const result = callHook();
      const byKind = Object.fromEntries(result.flags.map((f) => [f.kind, f.href]));
      expect(byKind.stale).toBe('/workspace/tasks?filter=stale');
      expect(byKind.sprint).toBe('/workspace/projects');
      expect(byKind.digest).toBe('/workspace/digest');
    });
  });

  describe('loading composition', () => {
    it('isLoading is true when either underlying query is loading', () => {
      activityMock.isLoading = true;
      expect(callHook().isLoading).toBe(true);

      activityMock.isLoading = false;
      digestMock.isLoading = true;
      expect(callHook().isLoading).toBe(true);
    });

    it('isError is true when either underlying query errors', () => {
      activityMock.isError = true;
      expect(callHook().isError).toBe(true);
    });
  });
});
