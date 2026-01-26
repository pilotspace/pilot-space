/**
 * ClaudeCodePromptCard component tests.
 *
 * T141: Basic functionality tests for Claude Code prompt card.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeCodePromptCard } from '../claude-code-prompt-card';

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn(),
};

Object.assign(navigator, {
  clipboard: mockClipboard,
});

describe('ClaudeCodePromptCard', () => {
  const shortPrompt = 'This is a short prompt';
  const longPrompt = 'A'.repeat(500); // Long enough to trigger truncation

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the component with prompt text', () => {
    render(<ClaudeCodePromptCard prompt={shortPrompt} />);

    expect(screen.getByText('Claude Code Prompt')).toBeInTheDocument();
    expect(screen.getByText(shortPrompt)).toBeInTheDocument();
  });

  it('shows copy button', () => {
    render(<ClaudeCodePromptCard prompt={shortPrompt} />);

    const copyButton = screen.getByRole('button', { name: /copy/i });
    expect(copyButton).toBeInTheDocument();
  });

  it('copies prompt to clipboard when copy button clicked', async () => {
    mockClipboard.writeText.mockResolvedValue(undefined);

    render(<ClaudeCodePromptCard prompt={shortPrompt} />);

    const copyButton = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalledWith(shortPrompt);
    });

    expect(screen.getByText('Copied')).toBeInTheDocument();
  });

  it('truncates long prompts and shows expand button', () => {
    render(<ClaudeCodePromptCard prompt={longPrompt} />);

    // Should show truncated version
    const codeElement = screen.getByText(/^A+\.\.\./);
    expect(codeElement).toBeInTheDocument();

    // Should show expand button
    const expandButton = screen.getByText(/show full prompt/i);
    expect(expandButton).toBeInTheDocument();
  });

  it('expands prompt when expand button clicked', () => {
    render(<ClaudeCodePromptCard prompt={longPrompt} />);

    const expandButton = screen.getByText(/show full prompt/i);
    fireEvent.click(expandButton);

    // Should show full prompt
    const codeElement = screen.getByText(longPrompt);
    expect(codeElement).toBeInTheDocument();

    // Button should change to "Show less"
    const collapseButton = screen.getByText(/show less/i);
    expect(collapseButton).toBeInTheDocument();
  });

  it('does not show expand button for short prompts', () => {
    render(<ClaudeCodePromptCard prompt={shortPrompt} />);

    const expandButton = screen.queryByText(/show full prompt/i);
    expect(expandButton).not.toBeInTheDocument();
  });

  it('shows hint about pasting into Claude Code', () => {
    render(<ClaudeCodePromptCard prompt={shortPrompt} />);

    expect(screen.getByText(/paste this prompt into/i)).toBeInTheDocument();
    expect(screen.getByText('Claude Code')).toBeInTheDocument();
  });

  it('handles clipboard write errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockClipboard.writeText.mockRejectedValue(new Error('Clipboard error'));

    render(<ClaudeCodePromptCard prompt={shortPrompt} />);

    const copyButton = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to copy prompt:', expect.any(Error));
    });

    consoleErrorSpy.mockRestore();
  });
});
