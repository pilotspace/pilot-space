/**
 * ArtifactPeekDrawer responsive tests — Phase 94 Plan 02 (MIG-03).
 *
 * Verifies that `useViewport.peekMode` drives the side ↔ bottom-sheet branch:
 *  - At peekMode='side', root carries data-peek-mode="side" + right-side classes
 *  - At peekMode='bottom-sheet', root carries data-peek-mode="bottom-sheet"
 *    + bottom-sheet classes (rounded-t, slide-from-bottom, full-width)
 *  - Close button works in both modes (preserves Phase 86 close behavior).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const closePeekMock = vi.fn();
const peekState = {
  peekId: 'abcdef123456xyz',
  peekType: 'NOTE' as const,
  focusId: null,
  focusType: null,
  view: 'split' as const,
  isPeekOpen: true,
  isFocusOpen: false,
  isSkillFilePeek: false,
  skillFile: null,
  openPeek: vi.fn(),
  closePeek: closePeekMock,
  openFocus: vi.fn(),
  closeFocus: vi.fn(),
  escalate: vi.fn(),
  demote: vi.fn(),
  setView: vi.fn(),
};

vi.mock('@/hooks/use-artifact-peek-state', () => ({
  useArtifactPeekState: () => peekState,
}));

vi.mock('@/hooks/use-artifact-query', () => ({
  useArtifactQuery: () => ({
    data: { type: 'NOTE', id: 'abcdef123456xyz', placeholder: true, lineage: null },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const viewportMock = vi.hoisted(() => ({
  current: {
    width: 1280,
    isXs: false,
    isSm: true,
    isMd: true,
    isLg: true,
    isXl: true,
    sidebarMode: 'full' as 'full' | 'rail' | 'drawer',
    peekMode: 'side' as 'side' | 'bottom-sheet',
    splitMode: 'panes' as 'panes' | 'tabs',
  },
}));

vi.mock('@/hooks/useViewport', () => ({
  useViewport: () => viewportMock.current,
}));

import { ArtifactPeekDrawer } from '../ArtifactPeekDrawer';

describe('ArtifactPeekDrawer — responsive (MIG-03)', () => {
  beforeEach(() => {
    closePeekMock.mockClear();
    viewportMock.current = {
      width: 1280,
      isXs: false,
      isSm: true,
      isMd: true,
      isLg: true,
      isXl: true,
      sidebarMode: 'full',
      peekMode: 'side',
      splitMode: 'panes',
    };
  });

  it('renders side variant at peekMode="side" (≥768)', () => {
    render(<ArtifactPeekDrawer />);
    const content = screen.getByTestId('peek-drawer-content');
    expect(content).toHaveAttribute('data-peek-mode', 'side');
    // Right-side variant uses right-0 + slide-in-from-right
    expect(content.className).toMatch(/right-0/);
    expect(content.className).toMatch(/slide-in-from-right/);
    expect(content.className).toMatch(/rounded-l-/);
  });

  it('renders bottom-sheet variant at peekMode="bottom-sheet" (<768)', () => {
    viewportMock.current = {
      ...viewportMock.current,
      width: 600,
      isMd: false,
      isLg: false,
      isXl: false,
      peekMode: 'bottom-sheet',
      sidebarMode: 'drawer',
      splitMode: 'tabs',
    };
    render(<ArtifactPeekDrawer />);
    const content = screen.getByTestId('peek-drawer-content');
    expect(content).toHaveAttribute('data-peek-mode', 'bottom-sheet');
    // Bottom-sheet uses bottom-0 + slide-in-from-bottom + rounded-t
    expect(content.className).toMatch(/bottom-0/);
    expect(content.className).toMatch(/slide-in-from-bottom/);
    expect(content.className).toMatch(/rounded-t-/);
    // Must NOT carry right-anchored width clamp
    expect(content.className).not.toMatch(/w-\[680px\]/);
  });

  it('close button still fires closePeek in bottom-sheet mode', () => {
    viewportMock.current = {
      ...viewportMock.current,
      width: 400,
      isXs: true,
      isSm: false,
      isMd: false,
      isLg: false,
      isXl: false,
      peekMode: 'bottom-sheet',
      sidebarMode: 'drawer',
      splitMode: 'tabs',
    };
    render(<ArtifactPeekDrawer />);
    fireEvent.click(screen.getByTestId('peek-drawer-close'));
    expect(closePeekMock).toHaveBeenCalledTimes(1);
  });
});
