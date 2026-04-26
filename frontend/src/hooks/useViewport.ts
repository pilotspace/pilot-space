'use client';

/**
 * useViewport — Phase 94 Plan 02 (MIG-03)
 *
 * Returns the current viewport mode flags + derived component-mode hints.
 * Powers the responsive branches in:
 *   - sidebar.tsx       (full / rail / drawer)
 *   - ArtifactPeekDrawer.tsx (side / bottom-sheet)
 *   - ArtifactSplitModeToggle.tsx (panes / tabs)
 *
 * SSR-safe: returns desktop defaults on the server (sidebarMode='full',
 * peekMode='side', splitMode='panes'). On client mount, swaps to the actual
 * value from window.innerWidth and re-syncs on resize.
 *
 * Implementation notes:
 *   - Uses `useSyncExternalStore` for React 18+ external state semantics.
 *   - A single `resize` listener feeds all derived flags — cheaper than one
 *     matchMedia query per breakpoint, and React batches the state read.
 *   - Snapshot is referentially stable when `width` stays the same; we cache
 *     by width to avoid breaking `useSyncExternalStore`'s shallow-equality
 *     fallback (which would otherwise infinite-loop on every render).
 */

import { useSyncExternalStore } from 'react';

type SidebarMode = 'full' | 'rail' | 'drawer';
type PeekMode = 'side' | 'bottom-sheet';
type SplitMode = 'panes' | 'tabs';

export interface ViewportInfo {
  width: number;
  isXs: boolean;
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
  /** ≥1280 → 'full' | 768-1279 → 'rail' | <768 → 'drawer' */
  sidebarMode: SidebarMode;
  /** ≥768 → 'side' | <768 → 'bottom-sheet' */
  peekMode: PeekMode;
  /** ≥768 → 'panes' | <768 → 'tabs' */
  splitMode: SplitMode;
}

const SSR_DEFAULT: ViewportInfo = Object.freeze({
  width: 1280,
  isXs: false,
  isSm: true,
  isMd: true,
  isLg: true,
  isXl: true,
  sidebarMode: 'full',
  peekMode: 'side',
  splitMode: 'panes',
}) as ViewportInfo;

let cachedSnapshot: ViewportInfo = SSR_DEFAULT;

function computeFromWidth(w: number): ViewportInfo {
  const isXs = w < 425;
  const isSm = w >= 640;
  const isMd = w >= 768;
  const isLg = w >= 1024;
  const isXl = w >= 1280;
  const sidebarMode: SidebarMode = isXl ? 'full' : isMd ? 'rail' : 'drawer';
  const peekMode: PeekMode = isMd ? 'side' : 'bottom-sheet';
  const splitMode: SplitMode = isMd ? 'panes' : 'tabs';
  return { width: w, isXs, isSm, isMd, isLg, isXl, sidebarMode, peekMode, splitMode };
}

function getSnapshot(): ViewportInfo {
  if (typeof window === 'undefined') return SSR_DEFAULT;
  const w = window.innerWidth;
  if (cachedSnapshot.width === w) return cachedSnapshot;
  cachedSnapshot = computeFromWidth(w);
  return cachedSnapshot;
}

function getServerSnapshot(): ViewportInfo {
  return SSR_DEFAULT;
}

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('resize', cb, { passive: true });
  return () => window.removeEventListener('resize', cb);
}

export function useViewport(): ViewportInfo {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Exported for tests.
export const __testing__ = { computeFromWidth, SSR_DEFAULT };
