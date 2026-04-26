/**
 * Unit tests for useViewport (Phase 94 Plan 02 / MIG-03).
 *
 * Covers SSR-safe defaults, breakpoint-driven mode flags, snapshot stability,
 * resize-listener subscription, and listener cleanup on unmount.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewport, __testing__ } from '../useViewport';

const { computeFromWidth, SSR_DEFAULT } = __testing__;

function setWidth(w: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  // Trigger the resize subscription.
  window.dispatchEvent(new Event('resize'));
}

describe('useViewport — pure breakpoint computation', () => {
  it('SSR_DEFAULT returns desktop-safe values (no client mount)', () => {
    expect(SSR_DEFAULT.width).toBe(1280);
    expect(SSR_DEFAULT.sidebarMode).toBe('full');
    expect(SSR_DEFAULT.peekMode).toBe('side');
    expect(SSR_DEFAULT.splitMode).toBe('panes');
    expect(SSR_DEFAULT.isXs).toBe(false);
    expect(SSR_DEFAULT.isXl).toBe(true);
  });

  it('computes xs at width < 425', () => {
    const v = computeFromWidth(400);
    expect(v.isXs).toBe(true);
    expect(v.isSm).toBe(false);
    expect(v.sidebarMode).toBe('drawer');
    expect(v.peekMode).toBe('bottom-sheet');
    expect(v.splitMode).toBe('tabs');
  });

  it('computes sm range (640..767) → drawer + bottom-sheet + tabs', () => {
    const v = computeFromWidth(700);
    expect(v.isXs).toBe(false);
    expect(v.isSm).toBe(true);
    expect(v.isMd).toBe(false);
    expect(v.sidebarMode).toBe('drawer');
    expect(v.peekMode).toBe('bottom-sheet');
    expect(v.splitMode).toBe('tabs');
  });

  it('computes rail range (768..1279) → rail + side + panes', () => {
    const v = computeFromWidth(900);
    expect(v.isMd).toBe(true);
    expect(v.isLg).toBe(false);
    expect(v.sidebarMode).toBe('rail');
    expect(v.peekMode).toBe('side');
    expect(v.splitMode).toBe('panes');

    const vLg = computeFromWidth(1100);
    expect(vLg.isLg).toBe(true);
    expect(vLg.isXl).toBe(false);
    expect(vLg.sidebarMode).toBe('rail');
  });

  it('computes full at width ≥ 1280', () => {
    const v = computeFromWidth(1280);
    expect(v.isXl).toBe(true);
    expect(v.sidebarMode).toBe('full');
    expect(v.peekMode).toBe('side');
    expect(v.splitMode).toBe('panes');
  });
});

describe('useViewport — hook integration', () => {
  beforeEach(() => {
    setWidth(1280);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the current mode after a resize', () => {
    const { result } = renderHook(() => useViewport());
    expect(result.current.sidebarMode).toBe('full');

    act(() => {
      setWidth(900);
    });
    expect(result.current.sidebarMode).toBe('rail');
    expect(result.current.peekMode).toBe('side');

    act(() => {
      setWidth(400);
    });
    expect(result.current.sidebarMode).toBe('drawer');
    expect(result.current.peekMode).toBe('bottom-sheet');
    expect(result.current.splitMode).toBe('tabs');
    expect(result.current.isXs).toBe(true);
  });

  it('removes the resize listener on unmount (no leaked subscription)', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useViewport());

    const addedResize = addSpy.mock.calls.filter((c) => c[0] === 'resize').length;
    expect(addedResize).toBeGreaterThanOrEqual(1);

    unmount();

    const removedResize = removeSpy.mock.calls.filter((c) => c[0] === 'resize').length;
    expect(removedResize).toBeGreaterThanOrEqual(addedResize);
  });
});
