/**
 * ListGroup component tests.
 *
 * Covers: header rendering, collapse toggle, issue count badge, aria attributes.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ListGroup } from '../list/ListGroup';
import { Circle } from 'lucide-react';
import type { Issue } from '@/types';

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="badge">{children}</span>
  ),
}));

vi.mock('../list/ListRow', () => ({
  ListRow: ({ issue }: { issue: Issue }) => <div data-testid={`row-${issue.id}`}>{issue.name}</div>,
}));

function makeIssue(id: string): Issue {
  return {
    id,
    identifier: `PS-${id}`,
    name: `Issue ${id}`,
    description: '',
    type: 'task',
    priority: 'medium',
    state: { id: 's1', name: 'Todo', color: '#3b82f6', group: 'unstarted' },
    assignee: null,
    assigneeId: undefined,
    labels: [],
    projectId: 'p1',
    workspaceId: 'w1',
    sequenceId: 1,
    reporterId: 'u1',
    reporter: { id: 'u1', displayName: 'Test', email: 'test@test.com' },
    project: { id: 'p1', name: 'Project', identifier: 'PS' },
    hasAiEnhancements: false,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    sortOrder: 0,
    subIssueCount: 0,
  } as Issue;
}

describe('ListGroup', () => {
  const issues = [makeIssue('1'), makeIssue('2'), makeIssue('3')];
  const defaultProps = {
    groupKey: 'todo',
    groupLabel: 'Todo',
    groupIcon: Circle,
    groupIconClass: 'text-blue-500',
    issues,
    isCollapsed: false,
    onToggleCollapse: vi.fn(),
    selectedIds: new Set<string>(),
    onToggleSelect: vi.fn(),
  };

  it('renders group label and issue count', () => {
    render(<ListGroup {...defaultProps} />);
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByTestId('badge')).toHaveTextContent('3');
  });

  it('renders all issue rows when expanded', () => {
    render(<ListGroup {...defaultProps} />);
    expect(screen.getByTestId('row-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-2')).toBeInTheDocument();
    expect(screen.getByTestId('row-3')).toBeInTheDocument();
  });

  it('calls onToggleCollapse when header clicked', () => {
    const onToggle = vi.fn();
    render(<ListGroup {...defaultProps} onToggleCollapse={onToggle} />);
    fireEvent.click(screen.getByRole('button', { name: /collapse todo/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('has aria-expanded=true when expanded', () => {
    render(<ListGroup {...defaultProps} isCollapsed={false} />);
    expect(screen.getByRole('button', { name: /collapse todo/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('has aria-expanded=false when collapsed', () => {
    render(<ListGroup {...defaultProps} isCollapsed={true} />);
    expect(screen.getByRole('button', { name: /expand todo/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('hides issue rows when collapsed via max-h-0', () => {
    const { container } = render(<ListGroup {...defaultProps} isCollapsed={true} />);
    const collapsibleDiv = container.querySelector('.max-h-0');
    expect(collapsibleDiv).toBeTruthy();
  });
});
