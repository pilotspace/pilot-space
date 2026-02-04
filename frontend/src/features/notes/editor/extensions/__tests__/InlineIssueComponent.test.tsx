/**
 * Unit tests for InlineIssueComponent.
 *
 * Tests rainbow border animation class, type-specific classes,
 * done state styling, and hover card rendering.
 *
 * Uses mock NodeViewProps since InlineIssueComponent is a TipTap NodeView.
 *
 * @module features/notes/editor/extensions/__tests__/InlineIssueComponent.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { InlineIssueComponent } from '../InlineIssueComponent';
import type { NodeViewProps } from '@tiptap/react';
import type { InlineIssueAttributes } from '../InlineIssueExtension';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ workspaceSlug: 'test-workspace' }),
}));

// Mock NodeViewWrapper to render children
vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
    as?: string;
  }) => <span className={className}>{children}</span>,
}));

function createMockNodeViewProps(attrs: Partial<InlineIssueAttributes> = {}): NodeViewProps {
  const defaultAttrs: InlineIssueAttributes = {
    issueId: 'uuid-123',
    issueKey: 'PS-42',
    title: 'Test issue',
    type: 'task',
    state: 'todo',
    priority: 'medium',
    isNew: false,
    ...attrs,
  };

  return {
    node: {
      attrs: defaultAttrs,
      type: { name: 'inlineIssue' },
    },
    editor: {} as NodeViewProps['editor'],
    getPos: () => 0,
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    selected: false,
    extension: {} as NodeViewProps['extension'],
    HTMLAttributes: {},
    decorations: [] as unknown as NodeViewProps['decorations'],
  } as unknown as NodeViewProps;
}

describe('InlineIssueComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('test_renders_issue_key_and_title — displays issue key and title', () => {
    render(<InlineIssueComponent {...createMockNodeViewProps()} />);

    expect(screen.getByText('PS-42')).toBeInTheDocument();
    expect(screen.getByText('Test issue')).toBeInTheDocument();
  });

  it('test_inline_issue_node_class — applies inline-issue-node class', () => {
    const { container } = render(<InlineIssueComponent {...createMockNodeViewProps()} />);
    const node = container.querySelector('.inline-issue-node');
    expect(node).toBeInTheDocument();
  });

  it('test_rainbow_border_when_new — applies issue-rainbow-border class when isNew=true', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ isNew: true })} />
    );
    const node = container.querySelector('.inline-issue-node');
    expect(node).toHaveClass('issue-rainbow-border');
  });

  it('test_rainbow_removed_after_3s — removes issue-rainbow-border after 3s timeout', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ isNew: true })} />
    );
    const node = container.querySelector('.inline-issue-node');

    expect(node).toHaveClass('issue-rainbow-border');

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(node).not.toHaveClass('issue-rainbow-border');
  });

  it('test_no_rainbow_when_not_new — does not apply rainbow class when isNew=false', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ isNew: false })} />
    );
    const node = container.querySelector('.inline-issue-node');
    expect(node).not.toHaveClass('issue-rainbow-border');
  });

  it('test_type_bug_class — applies type-bug class for bug type', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ type: 'bug' })} />
    );
    const node = container.querySelector('.inline-issue-node');
    expect(node).toHaveClass('type-bug');
  });

  it('test_type_feature_class — applies type-feature class', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ type: 'feature' })} />
    );
    const node = container.querySelector('.inline-issue-node');
    expect(node).toHaveClass('type-feature');
  });

  it('test_type_improvement_class — applies type-improvement class', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ type: 'improvement' })} />
    );
    const node = container.querySelector('.inline-issue-node');
    expect(node).toHaveClass('type-improvement');
  });

  it('test_type_task_class — applies type-task class', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ type: 'task' })} />
    );
    const node = container.querySelector('.inline-issue-node');
    expect(node).toHaveClass('type-task');
  });

  it('test_done_state_classes — applies state-done and issue-done-border for done state', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ state: 'done' })} />
    );
    const node = container.querySelector('.inline-issue-node');
    expect(node).toHaveClass('state-done');
    expect(node).toHaveClass('issue-done-border');
  });

  it('test_done_state_line_through — done state applies line-through to title', () => {
    render(
      <InlineIssueComponent {...createMockNodeViewProps({ state: 'done', title: 'Completed' })} />
    );
    const title = screen.getByText('Completed');
    expect(title).toHaveClass('line-through');
  });

  it('test_done_state_checkmark — shows Check icon for done state', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ state: 'done' })} />
    );
    // Check icon renders as SVG with text-green-600 class
    const checkIcon = container.querySelector('.text-green-600');
    expect(checkIcon).toBeInTheDocument();
  });

  it('test_cancelled_state_opacity — applies opacity-60 for cancelled state', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ state: 'cancelled' })} />
    );
    const node = container.querySelector('.inline-issue-node');
    expect(node).toHaveClass('opacity-60');
  });

  it('test_combined_new_and_type — both rainbow and type classes applied together', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ isNew: true, type: 'bug' })} />
    );
    const node = container.querySelector('.inline-issue-node');
    expect(node).toHaveClass('issue-rainbow-border');
    expect(node).toHaveClass('type-bug');
  });

  it('test_focus_ring_class — includes focus-visible ring class', () => {
    const { container } = render(<InlineIssueComponent {...createMockNodeViewProps()} />);
    const node = container.querySelector('.inline-issue-node');
    expect(node).toHaveClass('focus-visible:ring-2');
  });

  it('test_data_issue_id_attribute — renders data-issue-id attribute', () => {
    const { container } = render(
      <InlineIssueComponent {...createMockNodeViewProps({ issueId: 'abc-123' })} />
    );
    const node = container.querySelector('[data-issue-id="abc-123"]');
    expect(node).toBeInTheDocument();
  });
});
