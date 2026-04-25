/**
 * Tests for useSkillsViewQueryStringSync (Phase 92 Plan 03 Task 1).
 *
 * Mirrors the Phase 90 query-string-sync pattern:
 *   - mount-only hydration from `?view=`
 *   - whitelist guard (banana → cards, NO url update)
 *   - setMode writes via router.replace({ scroll: false })
 *   - setMode('cards') strips the param
 *   - URL changes propagate back to local state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/workspace/skills',
  useSearchParams: () => mockSearchParams,
}));

import { useSkillsViewQueryStringSync } from '../useSkillsViewQueryStringSync';

beforeEach(() => {
  mockReplace.mockReset();
  mockSearchParams = new URLSearchParams();
});

describe('useSkillsViewQueryStringSync', () => {
  it('defaults mode to "cards" when ?view= is absent', () => {
    const { result } = renderHook(() => useSkillsViewQueryStringSync());
    expect(result.current[0]).toBe('cards');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('hydrates mode to "graph" when ?view=graph is present on mount', () => {
    mockSearchParams = new URLSearchParams('view=graph');
    const { result } = renderHook(() => useSkillsViewQueryStringSync());
    expect(result.current[0]).toBe('graph');
    // Hydration must not write back to URL
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to "cards" for invalid ?view= values (whitelist defense)', () => {
    mockSearchParams = new URLSearchParams('view=banana');
    const { result } = renderHook(() => useSkillsViewQueryStringSync());
    expect(result.current[0]).toBe('cards');
    // Critical: must NOT write to URL on fallback (T-92-10 mitigation)
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('setMode("graph") calls router.replace with ?view=graph', () => {
    const { result } = renderHook(() => useSkillsViewQueryStringSync());
    act(() => {
      result.current[1]('graph');
    });
    expect(result.current[0]).toBe('graph');
    expect(mockReplace).toHaveBeenCalledWith(
      '/workspace/skills?view=graph',
      { scroll: false },
    );
  });

  it('setMode("cards") strips the view param from URL', () => {
    mockSearchParams = new URLSearchParams('view=graph');
    const { result } = renderHook(() => useSkillsViewQueryStringSync());
    expect(result.current[0]).toBe('graph');
    act(() => {
      result.current[1]('cards');
    });
    expect(result.current[0]).toBe('cards');
    expect(mockReplace).toHaveBeenCalledWith('/workspace/skills', {
      scroll: false,
    });
  });

  it('always passes { scroll: false } to router.replace', () => {
    const { result } = renderHook(() => useSkillsViewQueryStringSync());
    act(() => {
      result.current[1]('graph');
    });
    const lastCall = mockReplace.mock.calls.at(-1);
    expect(lastCall?.[1]).toEqual({ scroll: false });
  });

  it('reflects external URL change (search params flip) into local mode', () => {
    const { result, rerender } = renderHook(() =>
      useSkillsViewQueryStringSync(),
    );
    expect(result.current[0]).toBe('cards');
    // Simulate slash-command navigation: URL becomes ?view=graph
    mockSearchParams = new URLSearchParams('view=graph');
    rerender();
    expect(result.current[0]).toBe('graph');
  });

  it('does not write URL on banana fallback even after rerender', () => {
    mockSearchParams = new URLSearchParams('view=javascript:alert(1)');
    const { result, rerender } = renderHook(() =>
      useSkillsViewQueryStringSync(),
    );
    expect(result.current[0]).toBe('cards');
    rerender();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
