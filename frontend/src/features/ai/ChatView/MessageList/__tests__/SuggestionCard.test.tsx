/**
 * Unit tests for SuggestionCard component and isDestructiveAction utility.
 *
 * Tests inline suggestion card rendering, user interactions,
 * and destructive action classification per DD-003.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuggestionCard } from '../SuggestionCard';
import { isDestructiveAction } from '../../ChatView';
import type { ApprovalRequest } from '../../types';

function createMockApproval(overrides?: Partial<ApprovalRequest>): ApprovalRequest {
  return {
    id: 'approval-1',
    agentName: 'PilotSpaceAgent',
    actionType: 'extract_issues',
    status: 'pending',
    contextPreview: '3 issues detected in meeting notes',
    payload: { issues: [{ title: 'Issue 1' }] },
    createdAt: new Date('2026-01-26T10:00:00Z'),
    expiresAt: new Date('2026-01-27T10:00:00Z'),
    reasoning: 'Found actionable items in the note content',
    ...overrides,
  };
}

describe('SuggestionCard', () => {
  const mockOnApprove = vi.fn();
  const mockOnReject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Suggestion" badge label', () => {
    const approval = createMockApproval();
    render(
      <SuggestionCard approval={approval} onApprove={mockOnApprove} onReject={mockOnReject} />
    );

    expect(screen.getByText('Suggestion')).toBeInTheDocument();
  });

  it('renders approval.contextPreview as content', () => {
    const approval = createMockApproval({
      contextPreview: '3 issues detected in meeting notes',
    });
    render(
      <SuggestionCard approval={approval} onApprove={mockOnApprove} onReject={mockOnReject} />
    );

    expect(screen.getByText('3 issues detected in meeting notes')).toBeInTheDocument();
  });

  it('falls back to reasoning when contextPreview is empty', () => {
    const approval = createMockApproval({
      contextPreview: '',
      reasoning: 'Found actionable items in the note content',
    });
    render(
      <SuggestionCard approval={approval} onApprove={mockOnApprove} onReject={mockOnReject} />
    );

    expect(screen.getByText('Found actionable items in the note content')).toBeInTheDocument();
  });

  it('falls back to default text when both contextPreview and reasoning are empty', () => {
    const approval = createMockApproval({
      contextPreview: '',
      reasoning: '',
    });
    render(
      <SuggestionCard approval={approval} onApprove={mockOnApprove} onReject={mockOnReject} />
    );

    expect(screen.getByText('AI suggestion')).toBeInTheDocument();
  });

  it('calls onApprove with approval.id when Apply is clicked', async () => {
    const user = userEvent.setup();
    const approval = createMockApproval({ id: 'test-approval-42' });

    render(
      <SuggestionCard approval={approval} onApprove={mockOnApprove} onReject={mockOnReject} />
    );

    const applyButton = screen.getByTestId('suggestion-apply');
    await user.click(applyButton);

    expect(mockOnApprove).toHaveBeenCalledTimes(1);
    expect(mockOnApprove).toHaveBeenCalledWith('test-approval-42');
  });

  it('calls onReject with approval.id and "dismissed" when Dismiss is clicked', async () => {
    const user = userEvent.setup();
    const approval = createMockApproval({ id: 'test-approval-99' });

    render(
      <SuggestionCard approval={approval} onApprove={mockOnApprove} onReject={mockOnReject} />
    );

    const dismissButton = screen.getByTestId('suggestion-dismiss');
    await user.click(dismissButton);

    expect(mockOnReject).toHaveBeenCalledTimes(1);
    expect(mockOnReject).toHaveBeenCalledWith('test-approval-99', 'dismissed');
  });

  it('renders with the suggestion-card test id', () => {
    const approval = createMockApproval();
    render(
      <SuggestionCard approval={approval} onApprove={mockOnApprove} onReject={mockOnReject} />
    );

    expect(screen.getByTestId('suggestion-card')).toBeInTheDocument();
  });

  it('renders Apply and Dismiss buttons with accessible labels', () => {
    const approval = createMockApproval();
    render(
      <SuggestionCard approval={approval} onApprove={mockOnApprove} onReject={mockOnReject} />
    );

    expect(screen.getByRole('button', { name: /apply suggestion/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss suggestion/i })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const approval = createMockApproval();
    render(
      <SuggestionCard
        approval={approval}
        onApprove={mockOnApprove}
        onReject={mockOnReject}
        className="custom-class"
      />
    );

    expect(screen.getByTestId('suggestion-card')).toHaveClass('custom-class');
  });
});

describe('isDestructiveAction', () => {
  it('returns true for delete_issue', () => {
    expect(isDestructiveAction('delete_issue')).toBe(true);
  });

  it('returns true for merge_pr', () => {
    expect(isDestructiveAction('merge_pr')).toBe(true);
  });

  it('returns true for archive_workspace', () => {
    expect(isDestructiveAction('archive_workspace')).toBe(true);
  });

  it('returns true for delete_note', () => {
    expect(isDestructiveAction('delete_note')).toBe(true);
  });

  it('returns true for delete_comment', () => {
    expect(isDestructiveAction('delete_comment')).toBe(true);
  });

  it('returns false for extract_issues', () => {
    expect(isDestructiveAction('extract_issues')).toBe(false);
  });

  it('returns false for enhance_text', () => {
    expect(isDestructiveAction('enhance_text')).toBe(false);
  });

  it('returns false for create_issue', () => {
    expect(isDestructiveAction('create_issue')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isDestructiveAction('')).toBe(false);
  });

  it('returns false for unknown action types', () => {
    expect(isDestructiveAction('some_random_action')).toBe(false);
  });
});
