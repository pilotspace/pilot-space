/**
 * HomepageGreeting — Phase 88 Plan 02 Task 1
 *
 * Calm launchpad hero greeting per UI-SPEC §2:
 *  - <h1>, Fraunces 24 / 400 / tracking -1px (mapped to project `font-display`
 *    + `text-2xl font-normal tracking-tighter` utilities)
 *  - Hour bands (locked copy):
 *      0–11  → "Good morning, {firstName}."
 *      12–17 → "Good afternoon, {firstName}."
 *      18–23 → "Good evening, {firstName}."
 *  - firstName resolves from `authStore.userDisplayName` (first whitespace
 *    token), falling back to "there" when the displayName is the email-prefix
 *    fallback (i.e. user has not set a real name) — same heuristic as
 *    DailyBrief.tsx:133-136.
 *  - When user is null (auth still loading), render "Welcome." placeholder so
 *    the layout height stays stable.
 *  - 240ms fade-in on mount; suppressed under prefers-reduced-motion.
 *
 * NOTE: NOT wrapped in `observer()` — this component reads only synchronous
 * MobX getters at render time. Rerendering on hour change is not a concern
 * (page mount window is short; greeting refreshes on next navigation).
 *
 * @module features/homepage/components/HomepageGreeting
 */

import { useAuthStore } from '@/stores';
import { cn } from '@/lib/utils';

function capitalize(token: string): string {
  if (!token) return '';
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Derive a usable first-name token from an email local-part.
 *
 * `tin.dang` → `Tin`
 * `e2e-test` → `E2e`
 * `gabriel_o` → `Gabriel`
 * Empty / unsplittable → '' (caller falls back to "there").
 */
function firstNameFromEmailPrefix(emailPrefix: string): string {
  if (!emailPrefix) return '';
  const head = emailPrefix.split(/[._-]/).find((segment) => segment.length > 0);
  return head ? capitalize(head) : '';
}

function resolveFirstName(
  userDisplayName: string,
  emailPrefix: string,
): string {
  // When AuthStore.userDisplayName surfaces a real name (i.e. NOT the
  // email-prefix fallback it synthesizes when `user.name` is empty), use the
  // first whitespace-separated token.
  if (userDisplayName && userDisplayName !== emailPrefix) {
    const first = userDisplayName.trim().split(/\s+/)[0];
    if (first) return first;
  }
  // Otherwise derive a sensible first name from the email local-part so the
  // hero greeting still feels personal (e.g. "Hi E2e," instead of
  // "Hi there,") for accounts that signed up without setting a display name.
  const derived = firstNameFromEmailPrefix(emailPrefix);
  return derived || 'there';
}

export function HomepageGreeting() {
  const authStore = useAuthStore();
  const user = authStore.user;
  const userDisplayName = authStore.userDisplayName ?? '';
  const emailPrefix = user?.email?.split('@')[0] ?? '';

  // Loading variant — preserve a single-line h1 height so launchpad rhythm
  // does not jump when auth resolves.
  const isLoading = user === null;
  const firstName = resolveFirstName(userDisplayName, emailPrefix);
  const greeting = isLoading
    ? 'Welcome.'
    : `Hi ${firstName}, what's on your mind today?`;

  return (
    <h1
      className={cn(
        // Typography — UI-SPEC §2 (Fraunces 24/400, tight tracking).
        // Phase 94 Plan 02 (MIG-03): drop to Fraunces 20 (text-xl) at <640
        // so the hero greeting stays balanced on small viewports.
        'font-display text-xl sm:text-2xl font-normal tracking-tighter text-foreground',
        // Mount fade-in (240ms ease-out, no translate). Reduced-motion users
        // see the final state immediately.
        'animate-in fade-in duration-200 motion-reduce:animate-none',
      )}
    >
      {greeting}
    </h1>
  );
}
