/**
 * ArtifactPeekDrawer — Phase 86.
 *
 * Covers: opens when URL has ?peek=, close button fires closePeek,
 * header renders type badge + short ID, LineageChip hidden when absent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const closePeekMock = vi.fn();
const escalateMock = vi.fn();
const peekState = {
  peekId: 'abcdef123456xyz',
  peekType: 'NOTE' as const,
  focusId: null,
  focusType: null,
  view: 'split' as const,
  isPeekOpen: true,
  isFocusOpen: false,
  openPeek: vi.fn(),
  closePeek: closePeekMock,
  openFocus: vi.fn(),
  closeFocus: vi.fn(),
  escalate: escalateMock,
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

import { ArtifactPeekDrawer } from '../ArtifactPeekDrawer';

describe('ArtifactPeekDrawer', () => {
  beforeEach(() => {
    closePeekMock.mockClear();
    escalateMock.mockClear();
  });

  it('renders content when URL indicates peek open', () => {
    render(<ArtifactPeekDrawer />);
    expect(screen.getByTestId('peek-drawer-content')).toBeInTheDocument();
  });

  it('renders header with short-form ID and type badge', () => {
    render(<ArtifactPeekDrawer />);
    const idBtn = screen.getByTestId('peek-drawer-id');
    expect(idBtn).toHaveTextContent(/abcd…/);
    // Type badge exists (uppercase label from artifactLabel)
    expect(screen.getAllByText(/NOTE|PAGE/i).length).toBeGreaterThan(0);
  });

  it('does not render lineage chip when lineage is null', () => {
    render(<ArtifactPeekDrawer />);
    expect(screen.queryByTestId('lineage-chip')).toBeNull();
  });

  it('close button triggers closePeek', () => {
    render(<ArtifactPeekDrawer />);
    fireEvent.click(screen.getByTestId('peek-drawer-close'));
    expect(closePeekMock).toHaveBeenCalledTimes(1);
  });

  it('expand button triggers escalate', () => {
    render(<ArtifactPeekDrawer />);
    fireEvent.click(screen.getByTestId('peek-drawer-expand'));
    expect(escalateMock).toHaveBeenCalledTimes(1);
  });
});
