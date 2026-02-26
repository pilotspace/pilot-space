/**
 * Unit tests for NoteMetadata component.
 *
 * Tests rendering of linked issue badges with state colors,
 * overflow handling, and empty-state null rendering.
 *
 * Project context (name, progress) is tested in ProjectContextHeader.test.tsx.
 *
 * @module components/editor/__tests__/NoteMetadata.test
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NoteMetadata } from '../NoteMetadata';
import type { LinkedIssueBrief, StateBrief, IssuePriority } from '@/types';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock Tooltip to render children without Radix portal
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

function makeStateBrief(overrides: Partial<StateBrief> = {}): StateBrief {
  return {
    id: 'state-1',
    name: 'Todo',
    color: '#5B8FC9',
    group: 'unstarted' as const,
    ...overrides,
  };
}

function makeIssue(overrides: Partial<LinkedIssueBrief> = {}): LinkedIssueBrief {
  return {
    id: `issue-${Math.random().toString(36).slice(2, 8)}`,
    identifier: 'PS-1',
    name: 'Test Issue',
    state: makeStateBrief(),
    priority: 'medium' as IssuePriority,
    ...overrides,
  };
}

describe('NoteMetadata', () => {
  it('returns null when no linkedIssues', () => {
    const { container } = render(<NoteMetadata linkedIssues={[]} workspaceSlug="my-ws" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders linked issues with state color dots and identifiers', () => {
    const issues = [
      makeIssue({
        id: 'i1',
        identifier: 'PS-10',
        state: makeStateBrief({ color: '#29A386', name: 'Done' }),
      }),
      makeIssue({
        id: 'i2',
        identifier: 'PS-11',
        state: makeStateBrief({ color: '#D9853F', name: 'In Progress' }),
      }),
    ];

    render(<NoteMetadata linkedIssues={issues} workspaceSlug="my-ws" />);

    expect(screen.getByTestId('note-metadata-issue-PS-10')).toBeInTheDocument();
    expect(screen.getByTestId('note-metadata-issue-PS-11')).toBeInTheDocument();
    expect(screen.getByText('PS-10')).toBeInTheDocument();
    expect(screen.getByText('PS-11')).toBeInTheDocument();
  });

  it('links issues to the correct workspace URL', () => {
    const issues = [makeIssue({ id: 'abc-123', identifier: 'PS-5' })];

    render(<NoteMetadata linkedIssues={issues} workspaceSlug="acme" />);

    const link = screen.getByTestId('note-metadata-issue-PS-5');
    expect(link).toHaveAttribute('href', '/acme/issues/abc-123');
  });

  it('shows "+N more" when more than 5 linked issues', () => {
    const issues = Array.from({ length: 8 }, (_, i) =>
      makeIssue({ id: `i${i}`, identifier: `PS-${i + 1}` })
    );

    render(<NoteMetadata linkedIssues={issues} workspaceSlug="my-ws" />);

    // 5 visible badges
    expect(screen.getByTestId('note-metadata-issue-PS-1')).toBeInTheDocument();
    expect(screen.getByTestId('note-metadata-issue-PS-5')).toBeInTheDocument();
    // 6th should NOT be rendered
    expect(screen.queryByTestId('note-metadata-issue-PS-6')).not.toBeInTheDocument();
    // Overflow indicator
    expect(screen.getByTestId('note-metadata-more')).toHaveTextContent('+3 more');
  });

  it('applies custom className', () => {
    const issues = [makeIssue()];

    render(<NoteMetadata linkedIssues={issues} workspaceSlug="ws" className="my-extra" />);

    const wrapper = screen.getByTestId('note-metadata');
    expect(wrapper.className).toContain('my-extra');
  });
});
