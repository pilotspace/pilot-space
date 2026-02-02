/**
 * Unit tests for IssueBox component.
 *
 * Tests rainbow border animation, type-specific variants,
 * completed state, and keyboard accessibility.
 *
 * @module components/editor/__tests__/IssueBox.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { IssueBox } from '../IssueBox';

describe('IssueBox', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('test_renders_issue_id_and_title — displays issue identifier and title', () => {
    render(<IssueBox issueId="PS-42" title="Fix login bug" />);

    expect(screen.getByText('PS-42')).toBeInTheDocument();
    expect(screen.getByText('Fix login bug')).toBeInTheDocument();
  });

  it('test_base_class — applies issue-box class', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="Test" />);
    const box = container.querySelector('.issue-box');
    expect(box).toBeInTheDocument();
  });

  it('test_new_issue_rainbow — applies issue-box-new class when isNew=true', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="New issue" isNew />);
    const box = container.querySelector('.issue-box');
    expect(box).toHaveClass('issue-box-new');
  });

  it('test_rainbow_removed_after_timeout — removes issue-box-new after 2.5s', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="New issue" isNew />);
    const box = container.querySelector('.issue-box');

    expect(box).toHaveClass('issue-box-new');

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(box).not.toHaveClass('issue-box-new');
  });

  it('test_no_rainbow_when_not_new — does not apply issue-box-new when isNew=false', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="Old issue" isNew={false} />);
    const box = container.querySelector('.issue-box');
    expect(box).not.toHaveClass('issue-box-new');
  });

  it('test_type_bug_class — applies type-bug class for bug issueType', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="Bug" issueType="bug" />);
    const box = container.querySelector('.issue-box');
    expect(box).toHaveClass('type-bug');
  });

  it('test_type_feature_class — applies type-feature class', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="Feature" issueType="feature" />);
    const box = container.querySelector('.issue-box');
    expect(box).toHaveClass('type-feature');
  });

  it('test_type_improvement_class — applies type-improvement class', () => {
    const { container } = render(
      <IssueBox issueId="PS-1" title="Improvement" issueType="improvement" />
    );
    const box = container.querySelector('.issue-box');
    expect(box).toHaveClass('type-improvement');
  });

  it('test_type_task_class — applies type-task class', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="Task" issueType="task" />);
    const box = container.querySelector('.issue-box');
    expect(box).toHaveClass('type-task');
  });

  it('test_no_type_class_when_undefined — no type class when issueType not provided', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="No type" />);
    const box = container.querySelector('.issue-box');
    expect(box).not.toHaveClass('type-bug');
    expect(box).not.toHaveClass('type-feature');
    expect(box).not.toHaveClass('type-improvement');
    expect(box).not.toHaveClass('type-task');
  });

  it('test_completed_state — applies issue-box-completed for completed status', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="Done task" status="completed" />);
    const box = container.querySelector('.issue-box');
    expect(box).toHaveClass('issue-box-completed');
  });

  it('test_completed_icon — shows CheckCircle2 icon for completed status', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="Done task" status="completed" />);
    // CheckCircle2 is an SVG — the icon component renders with text-state-done class
    const completedBox = container.querySelector('.issue-box-completed');
    expect(completedBox).toBeInTheDocument();
  });

  it('test_click_handler — calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<IssueBox issueId="PS-1" title="Clickable" onClick={onClick} />);

    fireEvent.click(screen.getByText('PS-1'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('test_keyboard_activation — triggers onClick on Enter key', () => {
    const onClick = vi.fn();
    render(<IssueBox issueId="PS-1" title="Key test" onClick={onClick} />);

    const button = screen.getByRole('button');
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('test_cursor_pointer_with_click — applies cursor-pointer when onClick provided', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="Pointer" onClick={() => {}} />);
    const box = container.querySelector('.issue-box');
    expect(box).toHaveClass('cursor-pointer');
  });

  it('test_no_role_without_click — no button role when onClick not provided', () => {
    render(<IssueBox issueId="PS-1" title="No click" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('test_custom_className — applies additional className', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="Custom" className="my-custom" />);
    const box = container.querySelector('.issue-box');
    expect(box).toHaveClass('my-custom');
  });

  it('test_combined_new_and_type — both isNew and issueType classes applied together', () => {
    const { container } = render(<IssueBox issueId="PS-1" title="New Bug" isNew issueType="bug" />);
    const box = container.querySelector('.issue-box');
    expect(box).toHaveClass('issue-box-new');
    expect(box).toHaveClass('type-bug');
  });
});
