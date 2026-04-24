/**
 * LineageChip unit tests — Phase 86.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineageChip } from '../LineageChip';

// Next Link with href
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('LineageChip', () => {
  it('renders nothing when sourceChatId is missing', () => {
    const { container } = render(<LineageChip workspaceSlug="acme" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders brand-green pill with default label and icon', () => {
    render(
      <LineageChip
        workspaceSlug="acme"
        sourceChatId="chat-1"
        sourceMessageId="msg-2"
      />,
    );
    const chip = screen.getByTestId('lineage-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('From chat');
    expect(chip.getAttribute('href')).toBe('/acme/chat/chat-1#msg-msg-2');
  });

  it('omits the hash when sourceMessageId is absent', () => {
    render(<LineageChip workspaceSlug="acme" sourceChatId="chat-1" />);
    const chip = screen.getByTestId('lineage-chip');
    expect(chip.getAttribute('href')).toBe('/acme/chat/chat-1');
  });

  it('has role=link and an accessible name', () => {
    render(<LineageChip workspaceSlug="acme" sourceChatId="c" />);
    const chip = screen.getByRole('link');
    expect(chip).toHaveAccessibleName(/open origin chat/i);
  });
});
