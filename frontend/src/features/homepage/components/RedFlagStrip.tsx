'use client';

/**
 * RedFlagStrip — Phase 88 Plan 03.
 *
 * Calm 0–3 banner strip for the launchpad. Each banner is a real <a href>
 * link (not a button) per UI-SPEC §4 a11y row — tab focuses, Enter
 * activates, browser handles middle-click + ⌘-click out of the box.
 *
 * Render contract:
 *   • flags = []  AND not loading  -> render null (vertical rhythm collapses)
 *   • isError                       -> render null (silent fail)
 *   • isLoading + no flags          -> single 32px skeleton banner
 *   • flags > 0                     -> N banners inside region landmark
 *
 * Per-kind visual contract (UI-SPEC §4 color table):
 *   stale  -> amber-500 accent, AlertTriangle icon, amber-50 bg
 *   sprint -> rose-500  accent, Activity icon,       rose-50  bg
 *   digest -> violet-500 accent, Sparkles icon,      violet-50 bg
 *
 * Motion: 200ms fade-in; honors prefers-reduced-motion.
 */

import Link from 'next/link';
import { Activity, AlertTriangle, ChevronRight, Sparkles } from 'lucide-react';
import type { ComponentType } from 'react';
import { useRedFlags, type RedFlag, type RedFlagKind } from '../hooks/use-red-flags';

interface RedFlagStripProps {
  workspaceId: string;
  workspaceSlug: string;
}

interface KindStyle {
  Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  accent: string;   // accent bar bg color
  bg: string;       // banner bg
  hoverBg: string;  // banner hover bg
  border: string;   // banner border
  iconColor: string;
}

const KIND_STYLES: Record<RedFlagKind, KindStyle> = {
  stale: {
    Icon: AlertTriangle,
    accent: 'bg-amber-500',
    bg: 'bg-amber-50',
    hoverBg: 'hover:bg-amber-100',
    border: 'border-amber-100',
    iconColor: 'text-amber-500',
  },
  sprint: {
    Icon: Activity,
    accent: 'bg-rose-500',
    bg: 'bg-rose-50',
    hoverBg: 'hover:bg-rose-100',
    border: 'border-rose-100',
    iconColor: 'text-rose-500',
  },
  digest: {
    Icon: Sparkles,
    accent: 'bg-violet-500',
    bg: 'bg-violet-50',
    hoverBg: 'hover:bg-violet-100',
    border: 'border-violet-100',
    iconColor: 'text-violet-500',
  },
};

function FlagBanner({ flag }: { flag: RedFlag }) {
  const style = KIND_STYLES[flag.kind];
  const { Icon } = style;

  return (
    <Link
      href={flag.href}
      aria-label={flag.ariaLabel}
      className={[
        'group relative flex h-8 w-full items-center gap-2 overflow-hidden',
        'rounded-xl border pl-4 pr-3',
        'text-[13px] font-medium leading-none',
        'text-[#1a1a2e] transition-colors duration-150',
        'motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#29a386] focus-visible:ring-offset-2',
        style.bg,
        style.hoverBg,
        style.border,
      ].join(' ')}
    >
      {/* 4px left accent bar */}
      <span
        data-flag-accent
        aria-hidden="true"
        className={['absolute left-0 top-0 h-full w-1 rounded-l-sm', style.accent].join(' ')}
      />
      <Icon
        aria-hidden="true"
        className={['h-3.5 w-3.5 shrink-0', style.iconColor].join(' ')}
      />
      <span className="flex-1 truncate">{flag.label}</span>
      <ChevronRight
        aria-hidden="true"
        className="h-3 w-3 shrink-0 text-[#9ca3af] group-hover:text-[#4b5563]"
      />
    </Link>
  );
}

function SkeletonBanner() {
  return (
    <div
      data-testid="red-flag-skeleton"
      aria-hidden="true"
      className={[
        'h-8 w-full rounded-xl bg-[#f3f4f6]',
        'animate-pulse motion-reduce:animate-none',
      ].join(' ')}
    />
  );
}

export function RedFlagStrip({ workspaceId, workspaceSlug }: RedFlagStripProps) {
  const { flags, isLoading, isError } = useRedFlags({ workspaceId, workspaceSlug });

  // Silent fail per UI-SPEC §4 error row.
  if (isError) return null;

  // Empty + idle -> render nothing so launchpad rhythm collapses.
  if (!isLoading && flags.length === 0) return null;

  return (
    <section
      role="region"
      aria-label="Workspace alerts"
      className={[
        'flex w-full flex-col gap-2',
        'animate-in fade-in duration-200',
        'motion-reduce:animate-none',
      ].join(' ')}
    >
      {isLoading && flags.length === 0 ? (
        <SkeletonBanner />
      ) : (
        flags.map((flag) => <FlagBanner key={flag.kind} flag={flag} />)
      )}
    </section>
  );
}
