'use client';

/**
 * RecentWorkSection — "Recent artifacts" with 3 type-specific gradient cards.
 *
 * Design spec (design.md §4.2):
 * - Cards: 22px signature radius, clip, border 1px #e5e7eb
 * - Top: 110px gradient (type-specific), type badge (JetBrains Mono 10px/600),
 *   skeleton lines (type-tinted)
 * - Bottom: title 13px/500 + meta row (project badge 4px + timestamp mono 10px)
 * - Types: HTML (green #29a386), DOCX (blue #3b82f6), CODE (purple #8b5cf6)
 */

import { useMemo, useCallback, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useHomepageActivity } from '../hooks/useHomepageActivity';
import type { ActivityCard, ActivityCardNote, ActivityCardIssue } from '../types';

// ── Artifact type themes (design.md §1 Artifact Type Colors) ──────────

interface ArtifactTheme {
  label: string;
  gradientFrom: string;
  gradientTo: string;
  accent: string;
  badgeBg: string;
  skeletonStrong: string;
  skeletonLight: string;
}

const THEME_HTML: ArtifactTheme = {
  label: 'HTML',
  gradientFrom: '#f0fdf4',
  gradientTo: '#dcfce7',
  accent: '#29a386',
  badgeBg: 'rgba(41,163,134,0.12)',
  skeletonStrong: 'rgba(41,163,134,0.25)',
  skeletonLight: 'rgba(41,163,134,0.15)',
};

const THEME_DOCX: ArtifactTheme = {
  label: 'DOCX',
  gradientFrom: '#eff6ff',
  gradientTo: '#dbeafe',
  accent: '#3b82f6',
  badgeBg: 'rgba(59,130,246,0.12)',
  skeletonStrong: 'rgba(59,130,246,0.25)',
  skeletonLight: 'rgba(59,130,246,0.15)',
};

const THEME_CODE: ArtifactTheme = {
  label: 'CODE',
  gradientFrom: '#faf5ff',
  gradientTo: '#f3e8ff',
  accent: '#8b5cf6',
  badgeBg: 'rgba(139,92,246,0.12)',
  skeletonStrong: 'rgba(139,92,246,0.25)',
  skeletonLight: 'rgba(139,92,246,0.15)',
};

/** Rotate through all 3 artifact types for visual variety per design.md §4.2. */
const THEME_ROTATION = [THEME_HTML, THEME_DOCX, THEME_CODE] as const;

function getArtifactTheme(_card: ActivityCard, index: number): ArtifactTheme {
  return THEME_ROTATION[index % THEME_ROTATION.length]!;
}

function getProjectName(card: ActivityCard): string {
  if (card.type === 'note') return 'Notes';
  const issue = card as ActivityCardIssue;
  return issue.project?.name ?? 'Project';
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr);
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Single artifact card ──────────────────────────────────────────────

interface ArtifactCardProps {
  card: ActivityCard;
  index: number;
  workspaceSlug: string;
}

function ArtifactCard({ card, index, workspaceSlug }: ArtifactCardProps) {
  const router = useRouter();
  const theme = getArtifactTheme(card, index);
  const title =
    card.type === 'note'
      ? (card as ActivityCardNote).title
      : (card as ActivityCardIssue).title;
  const project = getProjectName(card);
  const timestamp = formatRelativeTime(card.updatedAt);

  const href =
    card.type === 'note'
      ? `/${workspaceSlug}/notes/${card.id}`
      : `/${workspaceSlug}/issues/${card.id}`;

  const navigate = useCallback(() => {
    router.push(href);
  }, [router, href]);

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
      aria-label={`Open ${title}`}
      className="flex flex-col overflow-hidden rounded-[22px] border border-border bg-background transition-shadow duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
    >
      {/* Colored top section — 110px gradient */}
      <div
        className="flex h-[110px] flex-col gap-2 px-5 py-4"
        style={{
          background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
        }}
      >
        {/* Type badge — JetBrains Mono 10px/600, 6px radius */}
        <span
          className="inline-block self-start rounded-[6px] px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.4px]"
          style={{ color: theme.accent, backgroundColor: theme.badgeBg }}
        >
          {theme.label}
        </span>

        {/* Skeleton lines — type-tinted placeholder bars */}
        <div
          className="mt-1 h-2 w-[70%] rounded-sm"
          style={{ backgroundColor: theme.skeletonStrong }}
        />
        <div
          className="h-1.5 w-[50%] rounded-sm"
          style={{ backgroundColor: theme.skeletonLight }}
        />
      </div>

      {/* Bottom section — title + meta row */}
      <div className="flex flex-col gap-1.5 px-5 py-3.5">
        <p className="truncate text-[13px] font-medium text-foreground">{title}</p>
        <div className="flex items-center gap-2">
          {/* Project badge — 4px radius */}
          <span
            className="inline-block rounded-[4px] px-2 py-0.5 text-[10px] font-medium"
            style={{
              color: theme.accent,
              backgroundColor: `${theme.accent}15`,
            }}
          >
            {project}
          </span>
          {/* Timestamp — mono */}
          <span className="font-mono text-[10px] text-muted-foreground">{timestamp}</span>
        </div>
      </div>
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────

interface RecentWorkSectionProps {
  workspaceSlug: string;
  workspaceId: string;
}

export function RecentWorkSection({ workspaceSlug, workspaceId }: RecentWorkSectionProps) {
  const { data: activityData, isLoading } = useHomepageActivity({
    workspaceId,
    enabled: !!workspaceId,
  });

  const recentItems = useMemo(() => {
    if (!activityData?.pages) return [];
    const items: ActivityCard[] = [];
    for (const page of activityData.pages) {
      for (const cards of Object.values(page.data)) {
        for (const card of cards) {
          items.push(card);
          if (items.length >= 3) return items;
        }
      }
    }
    return items;
  }, [activityData]);

  if (isLoading) {
    return (
      <section aria-label="Recent artifacts">
        <div className="flex items-center justify-between">
          <div className="h-5 w-36 animate-pulse rounded bg-muted" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[180px] animate-pulse rounded-[22px] bg-muted/40" />
          ))}
        </div>
      </section>
    );
  }

  if (recentItems.length === 0) return null;

  return (
    <section aria-label="Recent artifacts">
      {/* Header — design.md §4.2 */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Recent artifacts</h2>
        <Link
          href={`/${workspaceSlug}/notes`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          View all
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {/* Card grid — 16px gap */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recentItems.map((card, i) => (
          <ArtifactCard key={card.id} card={card} index={i} workspaceSlug={workspaceSlug} />
        ))}
      </div>
    </section>
  );
}
