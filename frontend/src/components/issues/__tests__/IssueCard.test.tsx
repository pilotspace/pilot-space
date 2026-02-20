/**
 * IssueCard component tests.
 *
 * Covers: bug fixes (issue.name, getInitials safety, TooltipProvider consolidation),
 * density prop (comfortable/compact/minimal), interaction handlers, and accessibility.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { IssueCard } from '../IssueCard';
import type { Issue } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('mobx-react-lite', () => ({
  observer: (component: unknown) => component,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-provider">{children}</div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent) => void;
    [key: string]: unknown;
  }) => (
    <button data-testid="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="avatar" className={className}>
      {children}
    </span>
  ),
  AvatarImage: ({ alt }: { alt?: string; src?: string }) => (
    <img data-testid="avatar-image" alt={alt} />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
  ),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createIssue(overrides?: Partial<Issue>): Issue {
  return {
    id: 'issue-1',
    identifier: 'PS-42',
    name: 'Fix authentication bug',
    description: 'Users cannot log in with SSO',
    state: { id: 'state-1', name: 'In Progress', color: '#29A386', group: 'started' },
    priority: 'high',
    type: 'bug',
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    sequenceId: 42,
    sortOrder: 0,
    reporterId: 'user-1',
    reporter: { id: 'user-1', email: 'reporter@test.com', displayName: 'Reporter' },
    labels: [],
    subIssueCount: 0,
    project: { id: 'proj-1', name: 'Pilot Space', identifier: 'PS' },
    hasAiEnhancements: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-15T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Bug Fix #1: issue.name used instead of issue.title
// ---------------------------------------------------------------------------

describe('Bug Fix: issue.name instead of issue.title', () => {
  it('renders issue.name in comfortable density aria-label', () => {
    const issue = createIssue({ name: 'My Issue Name' });
    const { container } = render(<IssueCard issue={issue} onClick={vi.fn()} />);
    const card = container.querySelector('[aria-label]') as HTMLElement;
    expect(card.getAttribute('aria-label')).toBe('Issue PS-42: My Issue Name');
  });

  it('renders issue.name in the title heading for comfortable density', () => {
    const issue = createIssue({ name: 'My Issue Name' });
    render(<IssueCard issue={issue} />);
    expect(screen.getByText('My Issue Name')).toBeDefined();
  });

  it('renders issue.name in compact density', () => {
    const issue = createIssue({ name: 'Compact Title' });
    const { container } = render(<IssueCard issue={issue} density="compact" />);
    expect(screen.getByText('Compact Title')).toBeDefined();
    const card = container.querySelector('[aria-label]') as HTMLElement;
    expect(card.getAttribute('aria-label')).toBe('Issue PS-42: Compact Title');
  });

  it('renders issue.name in minimal density', () => {
    const issue = createIssue({ name: 'Minimal Title' });
    const { container } = render(<IssueCard issue={issue} density="minimal" onClick={vi.fn()} />);
    expect(screen.getByText('Minimal Title')).toBeDefined();
    const card = container.firstElementChild as HTMLElement;
    expect(card.getAttribute('aria-label')).toBe('Issue PS-42: Minimal Title');
  });
});

// ---------------------------------------------------------------------------
// Bug Fix #2: getInitials safety
// ---------------------------------------------------------------------------

describe('Bug Fix: getInitials safety with empty strings', () => {
  it('handles assignee with normal display name', () => {
    const issue = createIssue({
      assignee: { id: 'u-1', email: 'a@b.com', displayName: 'John Doe' },
    });
    render(<IssueCard issue={issue} />);
    expect(screen.getByText('JD')).toBeDefined();
  });

  it('handles assignee with single-word name', () => {
    const issue = createIssue({
      assignee: { id: 'u-1', email: 'a@b.com', displayName: 'Admin' },
    });
    render(<IssueCard issue={issue} />);
    expect(screen.getByText('A')).toBeDefined();
  });

  it('handles assignee falling back to email', () => {
    const issue = createIssue({
      assignee: { id: 'u-1', email: 'alice@example.com', displayName: null },
    });
    render(<IssueCard issue={issue} />);
    // email "alice@example.com" split by space gives one word starting with 'a'
    expect(screen.getByText('A')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Bug Fix #3: TooltipProvider consolidation
// ---------------------------------------------------------------------------

describe('Bug Fix: TooltipProvider consolidation', () => {
  it('renders at most one TooltipProvider in comfortable density', () => {
    const issue = createIssue({
      aiGenerated: true,
      assignee: { id: 'u-1', email: 'a@b.com', displayName: 'User One' },
      targetDate: '2025-03-01',
    });
    render(<IssueCard issue={issue} onClick={vi.fn()} onOpenIssue={vi.fn()} />);
    const providers = screen.getAllByTestId('tooltip-provider');
    expect(providers.length).toBe(1);
  });

  it('renders at most one TooltipProvider in compact density', () => {
    const issue = createIssue({
      assignee: { id: 'u-1', email: 'a@b.com', displayName: 'User One' },
    });
    render(<IssueCard issue={issue} density="compact" />);
    const providers = screen.getAllByTestId('tooltip-provider');
    expect(providers.length).toBe(1);
  });

  it('renders zero TooltipProviders in minimal density', () => {
    const issue = createIssue();
    render(<IssueCard issue={issue} density="minimal" />);
    expect(screen.queryAllByTestId('tooltip-provider').length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Density: comfortable (default)
// ---------------------------------------------------------------------------

describe('Density: comfortable (default)', () => {
  it('renders description', () => {
    const issue = createIssue({ description: 'Some description text' });
    render(<IssueCard issue={issue} />);
    expect(screen.getByText('Some description text')).toBeDefined();
  });

  it('renders labels', () => {
    const issue = createIssue({
      labels: [
        { id: 'l-1', name: 'Frontend', color: '#ff0000' },
        { id: 'l-2', name: 'Backend', color: '#00ff00' },
      ],
    });
    render(<IssueCard issue={issue} />);
    expect(screen.getByText('Frontend')).toBeDefined();
    expect(screen.getByText('Backend')).toBeDefined();
  });

  it('shows +N badge when more than 3 labels', () => {
    const issue = createIssue({
      labels: [
        { id: 'l-1', name: 'A', color: '#f00' },
        { id: 'l-2', name: 'B', color: '#0f0' },
        { id: 'l-3', name: 'C', color: '#00f' },
        { id: 'l-4', name: 'D', color: '#fff' },
      ],
    });
    render(<IssueCard issue={issue} />);
    expect(screen.getByText('+1')).toBeDefined();
  });

  it('shows identifier', () => {
    const issue = createIssue({ identifier: 'PS-99' });
    render(<IssueCard issue={issue} />);
    expect(screen.getByText('PS-99')).toBeDefined();
  });

  it('renders the open issue button when onOpenIssue is provided', () => {
    const onOpen = vi.fn();
    render(<IssueCard issue={createIssue()} onOpenIssue={onOpen} onClick={vi.fn()} />);
    const buttons = screen.getAllByTestId('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Density: compact
// ---------------------------------------------------------------------------

describe('Density: compact', () => {
  it('does not render description', () => {
    const issue = createIssue({ description: 'Hidden description' });
    render(<IssueCard issue={issue} density="compact" />);
    expect(screen.queryByText('Hidden description')).toBeNull();
  });

  it('does not render labels', () => {
    const issue = createIssue({
      labels: [{ id: 'l-1', name: 'Frontend', color: '#ff0000' }],
    });
    render(<IssueCard issue={issue} density="compact" />);
    expect(screen.queryByText('Frontend')).toBeNull();
  });

  it('renders identifier and name on the header row', () => {
    const issue = createIssue({ identifier: 'PS-10', name: 'Compact Issue' });
    render(<IssueCard issue={issue} density="compact" />);
    expect(screen.getByText('PS-10')).toBeDefined();
    expect(screen.getByText('Compact Issue')).toBeDefined();
  });

  it('renders AI badge when aiGenerated', () => {
    const issue = createIssue({ aiGenerated: true });
    render(<IssueCard issue={issue} density="compact" />);
    // The Sparkles icon is rendered as an SVG — check the ai class container
    const { container } = render(<IssueCard issue={issue} density="compact" />);
    const aiSpan = container.querySelector('.text-ai');
    expect(aiSpan).not.toBeNull();
  });

  it('uses p-1.5 padding', () => {
    const issue = createIssue();
    const { container } = render(<IssueCard issue={issue} density="compact" />);
    const card = container.querySelector('[aria-label]') as HTMLElement;
    expect(card.className).toContain('p-1.5');
  });

  it('backward-compatible compact prop maps to compact density', () => {
    const issue = createIssue({ description: 'Should be hidden' });
    render(<IssueCard issue={issue} compact />);
    expect(screen.queryByText('Should be hidden')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Density: minimal
// ---------------------------------------------------------------------------

describe('Density: minimal', () => {
  it('renders only priority dot, identifier, and name', () => {
    const issue = createIssue({ identifier: 'PS-7', name: 'Minimal Issue' });
    render(<IssueCard issue={issue} density="minimal" />);
    expect(screen.getByText('PS-7')).toBeDefined();
    expect(screen.getByText('Minimal Issue')).toBeDefined();
  });

  it('does not render description', () => {
    const issue = createIssue({ description: 'Invisible' });
    render(<IssueCard issue={issue} density="minimal" />);
    expect(screen.queryByText('Invisible')).toBeNull();
  });

  it('does not render labels', () => {
    const issue = createIssue({
      labels: [{ id: 'l-1', name: 'Hidden', color: '#000' }],
    });
    render(<IssueCard issue={issue} density="minimal" />);
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('does not render assignee avatar', () => {
    const issue = createIssue({
      assignee: { id: 'u-1', email: 'a@b.com', displayName: 'Person' },
    });
    render(<IssueCard issue={issue} density="minimal" />);
    expect(screen.queryByTestId('avatar')).toBeNull();
  });

  it('uses px-2 py-1 padding', () => {
    const issue = createIssue();
    const { container } = render(<IssueCard issue={issue} density="minimal" />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain('px-2');
    expect(card.className).toContain('py-1');
  });
});

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

describe('Interactions', () => {
  /** Helper: find the actual card element (skipping TooltipProvider wrapper). */
  function findCard(container: HTMLElement): HTMLElement {
    return container.querySelector('[aria-label]') as HTMLElement;
  }

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn();
    const issue = createIssue();
    const { container } = render(<IssueCard issue={issue} onClick={onClick} />);
    fireEvent.click(findCard(container));
    expect(onClick).toHaveBeenCalledWith(issue);
  });

  it('calls onClick on Enter keydown', () => {
    const onClick = vi.fn();
    const issue = createIssue();
    const { container } = render(<IssueCard issue={issue} onClick={onClick} />);
    fireEvent.keyDown(findCard(container), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledWith(issue);
  });

  it('calls onClick on Space keydown', () => {
    const onClick = vi.fn();
    const issue = createIssue();
    const { container } = render(<IssueCard issue={issue} onClick={onClick} />);
    fireEvent.keyDown(findCard(container), { key: ' ' });
    expect(onClick).toHaveBeenCalledWith(issue);
  });

  it('sets draggable when onDragStart is provided', () => {
    const issue = createIssue();
    const { container } = render(<IssueCard issue={issue} onDragStart={vi.fn()} />);
    const card = findCard(container);
    expect(card.getAttribute('draggable')).toBe('true');
  });

  it('applies isDragging style', () => {
    const issue = createIssue();
    const { container } = render(<IssueCard issue={issue} isDragging onClick={vi.fn()} />);
    const card = findCard(container);
    expect(card.className).toContain('opacity-50');
  });

  it('sets role=button and tabIndex=0 when onClick provided', () => {
    const issue = createIssue();
    const { container } = render(<IssueCard issue={issue} onClick={vi.fn()} />);
    const card = findCard(container);
    expect(card.getAttribute('role')).toBe('button');
    expect(card.getAttribute('tabindex')).toBe('0');
  });

  it('does not set role or tabIndex without onClick', () => {
    const issue = createIssue();
    const { container } = render(<IssueCard issue={issue} />);
    const card = findCard(container);
    expect(card.getAttribute('role')).toBeNull();
    expect(card.getAttribute('tabindex')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// density prop takes precedence over deprecated compact prop
// ---------------------------------------------------------------------------

describe('density prop precedence over compact prop', () => {
  it('density prop overrides compact prop', () => {
    const issue = createIssue({ description: 'Shown in comfortable' });
    render(<IssueCard issue={issue} compact density="comfortable" />);
    // comfortable shows description even though compact=true
    expect(screen.getByText('Shown in comfortable')).toBeDefined();
  });
});
