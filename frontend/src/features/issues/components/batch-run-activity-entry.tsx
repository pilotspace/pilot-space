'use client';

/**
 * BatchRunActivityEntry - Activity entry variant for implementation events.
 *
 * Renders 3 implementation activity types:
 * - implementation_started
 * - pr_created (with clickable PR link)
 * - implementation_failed
 *
 * Uses React.memo (NOT observer). Same animation as ActivityEntry.
 *
 * Phase 76: Sprint Batch Implementation
 */
import * as React from 'react';
import { GitPullRequest, Play, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ImplementationActivityType =
  | 'implementation_started'
  | 'pr_created'
  | 'implementation_failed';

export interface BatchRunActivityEntryProps {
  activityType: ImplementationActivityType;
  /** ISO timestamp */
  createdAt: string;
  /** PR URL (for pr_created) */
  prUrl?: string | null;
  /** Error reason (for implementation_failed) */
  errorReason?: string | null;
  isLast?: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;

  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Extracts repo/pr-number display text from a full PR URL.
 * e.g. "https://github.com/org/pilot-space/pull/42" → "pilot-space#42"
 * Truncates to 40 chars.
 */
function formatPrDisplayText(prUrl: string): string {
  try {
    const url = new URL(prUrl);
    const parts = url.pathname.split('/');
    // pathname: /org/repo/pull/number
    const repo = parts[2] ?? '';
    const number = parts[4] ?? '';
    if (repo && number) {
      const display = `${repo}#${number}`;
      return display.length > 40 ? `${display.slice(0, 40)}…` : display;
    }
    // Fallback: return truncated raw URL
    return prUrl.length > 40 ? `${prUrl.slice(0, 40)}…` : prUrl;
  } catch {
    return prUrl.length > 40 ? `${prUrl.slice(0, 40)}…` : prUrl;
  }
}

interface AvatarConfig {
  wrapperClass: string;
  icon: React.ReactNode;
}

function resolveAvatar(activityType: ImplementationActivityType): AvatarConfig {
  switch (activityType) {
    case 'implementation_started':
      return {
        wrapperClass: 'bg-[hsl(var(--state-in-progress)/0.15)] text-[hsl(var(--state-in-progress))] border border-[hsl(var(--state-in-progress)/0.3)]',
        icon: <Play className="h-3.5 w-3.5" aria-hidden="true" />,
      };
    case 'pr_created':
      return {
        wrapperClass: 'bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.2)]',
        icon: <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />,
      };
    case 'implementation_failed':
      return {
        wrapperClass: 'bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))] border border-[hsl(var(--destructive)/0.2)]',
        icon: <XCircle className="h-3.5 w-3.5" aria-hidden="true" />,
      };
  }
}

export const BatchRunActivityEntry = React.memo(function BatchRunActivityEntry({
  activityType,
  createdAt,
  prUrl,
  errorReason,
  isLast = false,
}: BatchRunActivityEntryProps) {
  const avatar = resolveAvatar(activityType);
  const timeStr = formatRelativeTime(createdAt);

  return (
    <div
      className={cn(
        'relative flex gap-3',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1',
        'motion-safe:duration-200 motion-safe:ease-out'
      )}
    >
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-4 top-9 bottom-0 w-px bg-border" aria-hidden="true" />
      )}

      {/* Avatar */}
      <div
        className={cn(
          'relative z-10 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          avatar.wrapperClass
        )}
        aria-hidden="true"
      >
        {avatar.icon}
      </div>

      {/* Content */}
      <div className={cn('flex-1 min-w-0 pb-5', isLast && 'pb-0')}>
        <div className="flex items-start gap-2 min-h-[32px] flex-wrap">
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            {activityType === 'implementation_started' && (
              <p className="text-sm text-muted-foreground">Implementation started</p>
            )}

            {activityType === 'pr_created' && prUrl && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                PR created:{' '}
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={prUrl}
                  aria-label="View pull request (opens in new tab)"
                  className={cn(
                    'inline-block truncate max-w-[240px]',
                    'text-[12px] font-normal text-primary hover:underline hover:text-primary',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded'
                  )}
                  style={{ fontFamily: 'var(--font-geist-mono, monospace)' }}
                >
                  {formatPrDisplayText(prUrl)}
                </a>
              </p>
            )}

            {activityType === 'pr_created' && !prUrl && (
              <p className="text-sm text-muted-foreground">PR created</p>
            )}

            {activityType === 'implementation_failed' && (
              <p className="text-sm text-muted-foreground">
                Implementation failed{errorReason ? `: ${errorReason}` : ''}
              </p>
            )}
          </div>

          <time
            dateTime={createdAt}
            className="text-xs text-muted-foreground flex-shrink-0 ml-auto"
          >
            {timeStr}
          </time>
        </div>
      </div>
    </div>
  );
});

BatchRunActivityEntry.displayName = 'BatchRunActivityEntry';
