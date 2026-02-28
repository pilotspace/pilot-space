/**
 * Unit tests for IssueDraftPopover.
 *
 * Tests: pre-filled title/description, title truncation, defaults,
 * form interaction, submit payload, escape-to-close, character counter,
 * maxLength enforcement, and form stability on selectedText change.
 *
 * @module components/editor/__tests__/IssueDraftPopover.test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssueDraftPopover, type IssueDraftPopoverProps } from '../IssueDraftPopover';

const defaultProps: IssueDraftPopoverProps = {
  isOpen: true,
  onClose: vi.fn(),
  selectedText: 'Fix the login bug when users enter special characters.',
  blockIds: ['block-1', 'block-2'],
  noteId: 'note-abc',
  onSubmit: vi.fn().mockResolvedValue(undefined),
};

describe('IssueDraftPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('test_renders_with_prefilled_title_from_first_sentence', () => {
    render(<IssueDraftPopover {...defaultProps} />);
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    expect(titleInput.value).toBe('Fix the login bug when users enter special characters');
  });

  it('test_renders_with_prefilled_description_from_full_text', () => {
    render(<IssueDraftPopover {...defaultProps} />);
    const descInput = screen.getByLabelText('Description') as HTMLTextAreaElement;
    expect(descInput.value).toBe(defaultProps.selectedText);
  });

  it('test_truncates_title_at_80_chars', () => {
    const longText =
      'This is a very long sentence that should be truncated at exactly eighty characters to fit the title field properly. More text here.';
    render(<IssueDraftPopover {...defaultProps} selectedText={longText} />);
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    expect(titleInput.value.length).toBeLessThanOrEqual(80);
    expect(titleInput.value).toContain('…');
  });

  it('test_default_type_is_task', () => {
    render(<IssueDraftPopover {...defaultProps} />);
    expect(screen.getByText('Task')).toBeInTheDocument();
  });

  it('test_default_priority_is_medium', () => {
    render(<IssueDraftPopover {...defaultProps} />);
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('test_submit_calls_onSubmit_with_correct_payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<IssueDraftPopover {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByText('Create Issue'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Fix the login bug when users enter special characters',
          description: defaultProps.selectedText,
          issueType: 'task',
          priority: 'medium',
          blockIds: ['block-1', 'block-2'],
          noteId: 'note-abc',
        })
      );
    });
  });

  it('test_escape_key_calls_onClose', () => {
    const onClose = vi.fn();
    render(<IssueDraftPopover {...defaultProps} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('test_renders_nothing_when_not_open', () => {
    const { container } = render(<IssueDraftPopover {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('test_submit_button_disabled_when_title_empty', async () => {
    const user = userEvent.setup();
    render(<IssueDraftPopover {...defaultProps} />);
    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    expect(screen.getByText('Create Issue').closest('button')).toBeDisabled();
  });

  it('test_shows_loading_state_during_submission', async () => {
    // Create a promise that we can control
    let resolveSubmit: () => void;
    const pendingSubmit = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    const onSubmit = vi.fn().mockReturnValue(pendingSubmit);

    render(<IssueDraftPopover {...defaultProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText('Create Issue'));

    await waitFor(() => {
      expect(screen.getByText('Creating…')).toBeInTheDocument();
    });

    // Resolve the promise to clean up
    resolveSubmit!();
  });

  // H-9: character counter
  it('test_description_shows_character_counter', () => {
    render(<IssueDraftPopover {...defaultProps} />);
    const expectedCount = defaultProps.selectedText.length;
    expect(screen.getByText(`${expectedCount}/2000`)).toBeInTheDocument();
  });

  it('test_description_character_counter_updates_on_input', async () => {
    const user = userEvent.setup();
    render(<IssueDraftPopover {...defaultProps} />);
    const descInput = screen.getByLabelText('Description');
    await user.clear(descInput);
    await user.type(descInput, 'abc');
    expect(screen.getByText('3/2000')).toBeInTheDocument();
  });

  it('test_description_maxlength_is_2000', () => {
    render(<IssueDraftPopover {...defaultProps} />);
    const descInput = screen.getByLabelText('Description') as HTMLTextAreaElement;
    expect(descInput.maxLength).toBe(2000);
  });

  // M-5: form must NOT reset when selectedText prop changes while popover is open
  it('test_form_does_not_reset_on_selectedText_change_while_open', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<IssueDraftPopover {...defaultProps} />);

    // User edits the title after opening
    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'My custom title');

    // Simulate parent passing a new selectedText while popover is still open
    act(() => {
      rerender(<IssueDraftPopover {...defaultProps} selectedText="New selection text" />);
    });

    // Title should still be the user's edit, not re-initialized
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('My custom title');
  });
});
