/**
 * accept-invite page tests — S011
 *
 * Covers:
 * - Shows loading spinner by default
 * - Shows error state when no invitation_id in URL
 * - Shows error state when acceptInvitation() rejects
 * - Redirects to workspace slug on success (no profile completion)
 * - Shows ProfileCompletionForm when requires_profile_completion is true
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn();
const mockSearchParamsGet = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => mockSearchParamsGet(key),
  }),
}));

const mockAcceptInvitation = vi.fn();

vi.mock('@/features/members/hooks/use-workspace-invitations', () => ({
  acceptInvitation: (...args: unknown[]) => mockAcceptInvitation(...args),
  useAcceptInvitation: vi.fn(),
}));

// Supabase: simulate SIGNED_IN via getSession by default
const mockOnAuthStateChange = vi.fn();
const mockGetSession = vi.fn();
const mockUnsubscribe = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock('@/features/auth/components/profile-completion-form', () => ({
  ProfileCompletionForm: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="profile-completion-form">
      <button onClick={onComplete}>Complete profile</button>
    </div>
  ),
}));

// Minimal motion/react mock for any animated wrappers
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import AcceptInvitePage from '../page';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulate Supabase returning an active session immediately via getSession. */
function mockActiveSession() {
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: 'tok', user: { id: 'user-1' } } },
    error: null,
  });
}

/** Simulate no active session and no auth state change event (triggers timeout path). */
function mockNoSession() {
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });
  mockGetSession.mockResolvedValue({
    data: { session: null },
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Default: invitation_id present
    mockSearchParamsGet.mockImplementation((key: string) =>
      key === 'invitation_id' ? 'inv-123' : null,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows loading spinner in initial processing state', () => {
    mockNoSession();

    render(<AcceptInvitePage />);

    expect(screen.getByText(/accepting your invitation/i)).toBeInTheDocument();
  });

  it('shows error state when invitation_id is missing', async () => {
    mockSearchParamsGet.mockReturnValue(null); // no invitation_id
    mockActiveSession();

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText(/invitation failed/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/missing invitation id/i)).toBeInTheDocument();
    });
  });

  it('shows error state when acceptInvitation() rejects', async () => {
    mockActiveSession();
    mockAcceptInvitation.mockRejectedValue(new Error('Invitation expired'));

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText(/invitation failed/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/invitation expired/i)).toBeInTheDocument();
    });
  });

  it('redirects to workspace slug when no profile completion required', async () => {
    mockActiveSession();
    mockAcceptInvitation.mockResolvedValue({
      workspace_slug: 'acme-corp',
      requires_profile_completion: false,
    });

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(mockAcceptInvitation).toHaveBeenCalledWith('inv-123');
    });
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/acme-corp');
    });
  });

  it('shows ProfileCompletionForm when requires_profile_completion is true', async () => {
    mockActiveSession();
    mockAcceptInvitation.mockResolvedValue({
      workspace_slug: 'acme-corp',
      requires_profile_completion: true,
    });

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-completion-form')).toBeInTheDocument();
    });
    expect(screen.getByText(/complete your profile/i)).toBeInTheDocument();
  });

  it('redirects to workspace after profile completion', async () => {
    mockActiveSession();
    mockAcceptInvitation.mockResolvedValue({
      workspace_slug: 'acme-corp',
      requires_profile_completion: true,
    });

    const { getByRole } = render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByTestId('profile-completion-form')).toBeInTheDocument();
    });

    // Simulate completing the form
    getByRole('button', { name: /complete profile/i }).click();

    expect(mockRouterPush).toHaveBeenCalledWith('/acme-corp');
  });

  it('redirects to login after error state timeout', async () => {
    mockSearchParamsGet.mockReturnValue(null);
    mockActiveSession();

    render(<AcceptInvitePage />);

    await waitFor(() => {
      expect(screen.getByText(/invitation failed/i)).toBeInTheDocument();
    });

    // Advance past the 3s redirect timer
    vi.advanceTimersByTime(3500);

    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.stringContaining('/login?error='),
    );
  });
});
