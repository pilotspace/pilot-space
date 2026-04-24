/**
 * ArtifactSplitModeToggle — Phase 86.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const setViewMock = vi.fn();
const peekStateRef = { current: { view: 'split' as 'split' | 'read' | 'chat' } };

vi.mock('@/hooks/use-artifact-peek-state', () => ({
  useArtifactPeekState: () => ({
    view: peekStateRef.current.view,
    setView: setViewMock,
    peekId: null,
    peekType: null,
    focusId: 'fid',
    focusType: 'NOTE',
    isPeekOpen: false,
    isFocusOpen: true,
    openPeek: vi.fn(),
    closePeek: vi.fn(),
    openFocus: vi.fn(),
    closeFocus: vi.fn(),
    escalate: vi.fn(),
    demote: vi.fn(),
  }),
}));

import { ArtifactSplitModeToggle } from '../ArtifactSplitModeToggle';

describe('ArtifactSplitModeToggle', () => {
  beforeEach(() => {
    setViewMock.mockClear();
    peekStateRef.current.view = 'split';
  });

  it('renders a radiogroup with 3 radios', () => {
    render(<ArtifactSplitModeToggle />);
    const group = screen.getByRole('radiogroup', { name: /artifact view mode/i });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('marks the active mode with aria-checked', () => {
    peekStateRef.current.view = 'read';
    render(<ArtifactSplitModeToggle />);
    const read = screen.getByRole('radio', { name: /read/i });
    expect(read).toHaveAttribute('aria-checked', 'true');
    const split = screen.getByRole('radio', { name: /split/i });
    expect(split).toHaveAttribute('aria-checked', 'false');
  });

  it('click calls setView with the corresponding mode', () => {
    render(<ArtifactSplitModeToggle />);
    fireEvent.click(screen.getByRole('radio', { name: /chat/i }));
    expect(setViewMock).toHaveBeenCalledWith('chat');
  });

  it('ArrowRight cycles view forward', () => {
    peekStateRef.current.view = 'split';
    render(<ArtifactSplitModeToggle />);
    const group = screen.getByRole('radiogroup');
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(setViewMock).toHaveBeenCalledWith('read');
  });

  it('ArrowLeft wraps to last mode', () => {
    peekStateRef.current.view = 'split';
    render(<ArtifactSplitModeToggle />);
    const group = screen.getByRole('radiogroup');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(setViewMock).toHaveBeenCalledWith('chat');
  });
});
