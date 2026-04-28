/**
 * HomepageGreeting tests.
 *
 * Shipped copy contract (post Phase 88 Plan 02 — Pencil v3 launchpad):
 *  - h1 element, Fraunces (asserted via `font-display` utility)
 *  - Authenticated copy: `Hi {firstName}, what's on your mind today?`
 *  - Loading copy (user === null): `Welcome.`
 *
 * firstName resolution:
 *  - If `userDisplayName` is a real name (i.e. NOT the email-prefix fallback
 *    that AuthStore.userDisplayName synthesizes when `user.name` is empty),
 *    use the first whitespace-separated token. e.g. "Tin Dang" → "Tin".
 *  - Otherwise derive a first name from the email local-part by splitting on
 *    `.`, `-`, `_` and capitalizing the first segment. e.g.
 *    `tin.dang@…` → `Tin`, `e2e-test@…` → `E2e`.
 *  - If derivation produces nothing usable, fall back to "there".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Mocks must be hoisted before component import.
vi.mock('mobx-react-lite', () => ({
  observer: (component: unknown) => component,
}));

// Settable mock surface for AuthStore.
const authMock: {
  user: { email: string; name: string } | null;
  userDisplayName: string;
} = {
  user: null,
  userDisplayName: '',
};

vi.mock('@/stores', () => ({
  useAuthStore: () => authMock,
}));

import { HomepageGreeting } from '../components/HomepageGreeting';

beforeEach(() => {
  authMock.user = null;
  authMock.userDisplayName = '';
  cleanup();
});

describe('HomepageGreeting', () => {
  describe('authenticated copy', () => {
    it('renders "Hi {firstName}, what\'s on your mind today?" using the first token of displayName', () => {
      authMock.user = { email: 'tin@pilot.space', name: 'Tin Dang' };
      authMock.userDisplayName = 'Tin Dang';
      render(<HomepageGreeting />);
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent("Hi Tin, what's on your mind today?");
    });
  });

  describe('firstName resolution', () => {
    it('uses first whitespace-separated token when a real displayName is set', () => {
      authMock.user = { email: 'tin.dang@pilot.space', name: 'Tin Dang' };
      authMock.userDisplayName = 'Tin Dang';
      render(<HomepageGreeting />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        "Hi Tin, what's on your mind today?"
      );
    });

    it('derives a name from the email local-part when displayName is the email-prefix fallback (dot-separated)', () => {
      // AuthStore.userDisplayName falls back to email-prefix when user.name is
      // empty. Surface a sensible first name instead of "there".
      authMock.user = { email: 'tin.dang@pilot.space', name: '' };
      authMock.userDisplayName = 'tin.dang';
      render(<HomepageGreeting />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        "Hi Tin, what's on your mind today?"
      );
    });

    it('derives a name from the email local-part with a hyphen separator', () => {
      authMock.user = { email: 'e2e-test@pilotspace.dev', name: '' };
      authMock.userDisplayName = 'e2e-test';
      render(<HomepageGreeting />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        "Hi E2e, what's on your mind today?"
      );
    });

    it('falls back to "there" when no usable first name can be derived', () => {
      // Empty email + empty displayName — nothing to capitalize.
      authMock.user = { email: '@pilotspace.dev', name: '' };
      authMock.userDisplayName = '';
      render(<HomepageGreeting />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        "Hi there, what's on your mind today?"
      );
    });
  });

  describe('loading state (no user)', () => {
    it('renders "Welcome." placeholder when user is null', () => {
      authMock.user = null;
      authMock.userDisplayName = '';
      render(<HomepageGreeting />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Welcome.'
      );
    });
  });

  describe('typography contract', () => {
    it('uses the font-display utility (Fraunces)', () => {
      authMock.user = { email: 'tin@pilot.space', name: 'Tin Dang' };
      authMock.userDisplayName = 'Tin Dang';
      render(<HomepageGreeting />);
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1.className).toMatch(/font-display/);
    });
  });
});
