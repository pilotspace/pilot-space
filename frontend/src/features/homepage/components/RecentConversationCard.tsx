'use client';

/**
 * RecentConversationCard — Card for a recent AI conversation session.
 *
 * Shows title, last message preview, and relative timestamp.
 * On click, navigates to /chat?session={id} to resume the session.
 *
 * Styling per UI-SPEC:
 * - Width: 200px fixed, height 72px
 * - bg-card, border-border, rounded-[10px]
 * - Title: 14px/600, truncated 1 line
 * - Last message: 12px/400, text-muted-foreground, truncated 2 lines
 * - Timestamp: 12px/400, text-muted-foreground, right-aligned
 * - Hover: bg-secondary
 */

import { useCallback, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { SessionSummary } from '@/stores/ai/SessionListStore';

interface RecentConversationCardProps {
  session: SessionSummary;
  workspaceSlug: string;
}

/**
 * Format a date to a relative time string (e.g. "2h ago", "3d ago").
 */
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function RecentConversationCard({ session, workspaceSlug }: RecentConversationCardProps) {
  const router = useRouter();
  const displayTitle = session.title ?? 'Untitled conversation';
  const timestamp = formatRelativeTime(session.updatedAt);

  const navigate = useCallback(() => {
    router.push(`/${workspaceSlug}/chat?session=${session.sessionId}`);
  }, [router, workspaceSlug, session.sessionId]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate();
      }
    },
    [navigate]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={navigate}
      onKeyDown={handleKeyDown}
      aria-label={`Resume conversation: ${displayTitle}`}
      className="flex w-[200px] shrink-0 cursor-pointer flex-col justify-between rounded-[10px] border border-border bg-card p-3 transition-colors duration-150 ease-out hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ height: '72px' }}
    >
      {/* Title */}
      <p className="truncate text-sm font-semibold leading-5 text-foreground">{displayTitle}</p>

      {/* Footer: timestamp right-aligned */}
      <p className="truncate text-right text-xs font-normal leading-4 text-muted-foreground">
        {timestamp}
      </p>
    </div>
  );
}
