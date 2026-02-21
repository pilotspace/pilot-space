/**
 * IssueNoteHeader component tests (T7).
 *
 * Verifies the Generate Plan button rendering, loading state,
 * conditional visibility, and click handler.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IssueNoteHeader, type IssueNoteHeaderProps } from '../issue-note-header';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('mobx-react-lite', () => ({
  observer: (component: React.FC) => component,
}));

vi.mock('@/stores', () => ({
  useIssueStore: () => ({
    aggregateSaveStatus: 'idle',
  }),
}));

vi.mock('@/lib/copy-context', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel,
    'aria-pressed': ariaPressed,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
    'aria-label'?: string;
    'aria-pressed'?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      {...rest}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/components/ui/save-status', () => ({
  SaveStatus: ({ status }: { status: string }) => <span data-testid="save-status">{status}</span>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild && React.isValidElement(children) ? children : <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div role="tooltip">{children}</div>
  ),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => <div onClick={onClick}>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild && React.isValidElement(children) ? children : <div>{children}</div>,
}));

// Mock CloneContextPanel — renders nothing (tested separately)
vi.mock('../clone-context-panel', () => ({
  CloneContextPanel: () => <div data-testid="clone-context-panel" />,
}));

vi.mock('lucide-react', () => ({
  ArrowLeft: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="arrow-left-icon" {...props} />
  ),
  Loader2: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="loader2-icon" {...props} />,
  MoreHorizontal: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="more-horizontal-icon" {...props} />
  ),
  Network: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="network-icon" {...props} />,
  Trash2: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="trash2-icon" {...props} />,
  ExternalLink: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="external-link-icon" {...props} />
  ),
  Sparkles: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="sparkles-icon" {...props} />
  ),
  MessageSquare: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="message-square-icon" {...props} />
  ),
  Link: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="link-icon" {...props} />,
  TerminalSquare: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="terminal-square-icon" {...props} />
  ),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IssueNoteHeader', () => {
  const defaultProps: IssueNoteHeaderProps = {
    identifier: 'PS-42',
    isChatOpen: false,
    onBack: vi.fn(),
    onToggleChat: vi.fn(),
    onCopyLink: vi.fn(),
    onDelete: vi.fn(),
    onExport: vi.fn().mockResolvedValue('exported'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderHeader(props: Partial<IssueNoteHeaderProps> = {}) {
    return render(<IssueNoteHeader {...defaultProps} {...props} />);
  }

  // -------------------------------------------------------------------------
  // Generate Plan button — conditional rendering
  // -------------------------------------------------------------------------

  it('renders Generate Plan button when onGeneratePlan is provided', () => {
    renderHeader({ onGeneratePlan: vi.fn().mockResolvedValue(undefined) });

    const button = screen.getByRole('button', {
      name: 'Generate implementation plan',
    });
    expect(button).toBeInTheDocument();
  });

  it('does not render Generate Plan button when onGeneratePlan is not provided', () => {
    renderHeader();

    expect(
      screen.queryByRole('button', { name: /generate implementation plan/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generating plan/i })).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Generate Plan button — loading state
  // -------------------------------------------------------------------------

  it('shows Loader2 spinner when isGeneratingPlan is true', () => {
    renderHeader({
      onGeneratePlan: vi.fn().mockResolvedValue(undefined),
      isGeneratingPlan: true,
    });

    const button = screen.getByRole('button', { name: 'Generating plan...' });
    expect(button).toBeDisabled();

    const spinner = button.querySelector('[data-testid="loader2-icon"]');
    expect(spinner).toBeInTheDocument();
  });

  it('shows Network icon when not generating plan', () => {
    renderHeader({
      onGeneratePlan: vi.fn().mockResolvedValue(undefined),
      isGeneratingPlan: false,
    });

    const button = screen.getByRole('button', {
      name: 'Generate implementation plan',
    });
    const networkIcon = button.querySelector('[data-testid="network-icon"]');
    expect(networkIcon).toBeInTheDocument();

    // Loader2 should not be present
    const spinner = button.querySelector('[data-testid="loader2-icon"]');
    expect(spinner).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Generate Plan button — click handler
  // -------------------------------------------------------------------------

  it('calls onGeneratePlan when button is clicked', async () => {
    const onGeneratePlan = vi.fn().mockResolvedValue(undefined);
    renderHeader({ onGeneratePlan });

    const button = screen.getByRole('button', {
      name: 'Generate implementation plan',
    });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onGeneratePlan).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call onGeneratePlan when button is disabled (generating)', () => {
    const onGeneratePlan = vi.fn().mockResolvedValue(undefined);
    renderHeader({ onGeneratePlan, isGeneratingPlan: true });

    const button = screen.getByRole('button', { name: 'Generating plan...' });
    fireEvent.click(button);

    expect(onGeneratePlan).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Basic rendering sanity checks
  // -------------------------------------------------------------------------

  it('renders identifier text', () => {
    renderHeader();
    expect(screen.getByText('PS-42')).toBeInTheDocument();
  });

  it('renders back button', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Back to issues' })).toBeInTheDocument();
  });

  it('renders chat toggle button', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Open AI chat' })).toBeInTheDocument();
  });
});
