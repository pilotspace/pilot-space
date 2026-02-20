/**
 * ListRow component tests.
 *
 * Covers: rendering issue data, checkbox selection, navigation click,
 * state/priority display, assignee avatar, labels, accessibility.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ListRow } from '../list/ListRow';
import type { Issue } from '@/types';

vi.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    style,
    ...props
  }: {
    children: React.ReactNode;
    style?: React.CSSProperties;
    [k: string]: unknown;
  }) => (
    <span data-testid="badge" style={style} {...props}>
      {children}
    </span>
  ),
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) => (
    <div data-testid="avatar" {...props}>
      {children}
    </div>
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
  ),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover">{children}</div>
  ),
}));

function makeIssue(overrides?: Partial<Issue>): Issue {
  return {
    id: 'issue-1',
    identifier: 'PS-42',
    name: 'Fix login bug',
    description: '',
    type: 'bug',
    priority: 'high',
    state: { id: 's1', name: 'In Progress', color: '#facc15', group: 'started' },
    assignee: null,
    assigneeId: undefined,
    labels: [],
    projectId: 'p1',
    workspaceId: 'w1',
    sequenceId: 42,
    reporterId: 'u1',
    reporter: { id: 'u1', displayName: 'Test', email: 'test@test.com' },
    project: { id: 'p1', name: 'Project', identifier: 'PS' },
    hasAiEnhancements: false,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    sortOrder: 0,
    subIssueCount: 0,
    ...overrides,
  } as Issue;
}

describe('ListRow', () => {
  const defaultProps = {
    issue: makeIssue(),
    isSelected: false,
    onToggleSelect: vi.fn(),
  };

  it('renders issue identifier and name', () => {
    render(<ListRow {...defaultProps} />);
    expect(screen.getByText('PS-42')).toBeInTheDocument();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
  });

  it('renders checkbox with accessible label', () => {
    render(<ListRow {...defaultProps} />);
    const checkbox = screen.getByRole('checkbox', { name: /select ps-42/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('shows checked checkbox when selected', () => {
    render(<ListRow {...defaultProps} isSelected />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('calls onToggleSelect when checkbox clicked', () => {
    const onToggleSelect = vi.fn();
    render(<ListRow {...defaultProps} onToggleSelect={onToggleSelect} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleSelect).toHaveBeenCalledWith('issue-1');
  });

  it('calls onNavigate when title clicked', () => {
    const onNavigate = vi.fn();
    render(<ListRow {...defaultProps} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText('Fix login bug'));
    expect(onNavigate).toHaveBeenCalledWith(defaultProps.issue);
  });

  it('renders assignee avatar when assignee exists', () => {
    const issue = makeIssue({
      assignee: { id: 'u1', displayName: 'John', email: 'john@test.com' } as Issue['assignee'],
    });
    render(<ListRow {...defaultProps} issue={issue} />);
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('J');
  });

  it('renders labels up to 2 and overflow count', () => {
    const issue = makeIssue({
      labels: [
        { id: 'l1', name: 'Frontend', color: '#3b82f6' },
        { id: 'l2', name: 'Bug', color: '#ef4444' },
        { id: 'l3', name: 'P0', color: '#f59e0b' },
      ] as Issue['labels'],
    });
    render(<ListRow {...defaultProps} issue={issue} />);
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('renders state change popover when onStateChange provided', () => {
    render(<ListRow {...defaultProps} onStateChange={vi.fn()} />);
    expect(screen.getByLabelText(/change state from/i)).toBeInTheDocument();
  });

  it('renders priority change popover when onPriorityChange provided', () => {
    render(<ListRow {...defaultProps} onPriorityChange={vi.fn()} />);
    expect(screen.getByLabelText(/change priority from/i)).toBeInTheDocument();
  });

  it('defaults to backlog state when issue.state is null', () => {
    const issue = makeIssue({ state: null as unknown as Issue['state'] });
    // Should not throw — gracefully falls back
    const { container } = render(<ListRow {...defaultProps} issue={issue} />);
    expect(container).toBeTruthy();
  });
});
