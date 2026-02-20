/**
 * BulkActionsBar component tests.
 *
 * Covers: visibility, selection count, Escape to clear, button callbacks.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BulkActionsBar } from '../list/BulkActionsBar';

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    [k: string]: unknown;
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button onClick={onClick} role="menuitem">
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('BulkActionsBar', () => {
  const defaultProps = {
    selectedCount: 3,
    onChangeState: vi.fn(),
    onSetPriority: vi.fn(),
    onDelete: vi.fn(),
    onClearSelection: vi.fn(),
  };

  it('renders nothing when selectedCount is 0', () => {
    const { container } = render(<BulkActionsBar {...defaultProps} selectedCount={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows selection count with teal color', () => {
    render(<BulkActionsBar {...defaultProps} />);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('renders State, Priority, Delete buttons when handlers provided', () => {
    render(<BulkActionsBar {...defaultProps} />);
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('does not render State button when onChangeState not provided', () => {
    render(<BulkActionsBar {...defaultProps} onChangeState={undefined} />);
    expect(screen.queryByText('State')).not.toBeInTheDocument();
  });

  it('calls onClearSelection on Cancel click', () => {
    const onClear = vi.fn();
    render(<BulkActionsBar {...defaultProps} onClearSelection={onClear} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('calls onClearSelection on Escape key', () => {
    const onClear = vi.fn();
    render(<BulkActionsBar {...defaultProps} onClearSelection={onClear} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('renders state dropdown items', () => {
    render(<BulkActionsBar {...defaultProps} />);
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('calls onChangeState when state menu item clicked', () => {
    const onChangeState = vi.fn();
    render(<BulkActionsBar {...defaultProps} onChangeState={onChangeState} />);
    fireEvent.click(screen.getByText('Done'));
    expect(onChangeState).toHaveBeenCalledWith('done');
  });

  it('calls onDelete when Delete button clicked', () => {
    const onDelete = vi.fn();
    render(<BulkActionsBar {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
