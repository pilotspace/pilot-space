'use client';

/**
 * ActiveRoutines — Messenger-triggered background tasks.
 *
 * Design spec (design.md §4.3):
 * - Source circles: 34px, pill shape, saturated brand colors (Telegram/Claude/WhatsApp)
 * - Cards: 16px radius, 1px border #e5e7eb, 14px 16px padding
 * - Status badges: pill, colored bg, 10px/600 text
 * - Detail line: Inter 11px #9ca3af, inline metadata format
 * - Section header: "Active routines" + count badge + "View all →"
 */

import { type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Send,
  Sparkles,
  MessageCircle,
  Timer,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────

interface RoutineSource {
  color: string;
  icon: ReactNode;
}

interface RoutineStatus {
  label: string;
  color: string;
  bg: string;
  indicator: ReactNode;
}

interface RoutineItem {
  id: string;
  title: string;
  detail: string;
  source: RoutineSource;
  status: RoutineStatus;
}

// ── Demo data (replace with real API when backend supports routines) ──

const DEMO_ROUTINES: RoutineItem[] = [
  {
    id: 'r1',
    title: 'Deploy staging for PR #142',
    detail: '78% complete · Frontend v2 · via @tin · 4m ago',
    source: {
      color: '#229ED9',
      icon: <Send className="h-[15px] w-[15px] text-white" strokeWidth={1.5} />,
    },
    status: {
      label: 'Running',
      color: '#29a386',
      bg: 'rgba(41,163,134,0.08)',
      indicator: (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#29a386] opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#29a386]" />
        </span>
      ),
    },
  },
  {
    id: 'r2',
    title: 'Daily standup summary',
    detail: 'Next: Today 9:00 AM · All Projects · runs daily',
    source: {
      color: '#D97706',
      icon: <Sparkles className="h-[15px] w-[15px] text-white" strokeWidth={1.5} />,
    },
    status: {
      label: 'Scheduled',
      color: '#3b82f6',
      bg: 'rgba(59,130,246,0.08)',
      indicator: <Timer className="h-3 w-3" style={{ color: '#3b82f6' }} strokeWidth={1.5} />,
    },
  },
  {
    id: 'r3',
    title: 'Generate sprint report',
    detail: '3 artifacts generated · Backend API · via @sarah · 12m ago',
    source: {
      color: '#25D366',
      icon: <MessageCircle className="h-[15px] w-[15px] text-white" strokeWidth={1.5} />,
    },
    status: {
      label: 'Done',
      color: '#6b7280',
      bg: '#f3f4f6',
      indicator: <Check className="h-3 w-3" style={{ color: '#6b7280' }} strokeWidth={2} />,
    },
  },
];

// ── Component ─────────────────────────────────────────────────────────

interface ActiveRoutinesProps {
  workspaceSlug: string;
}

export function ActiveRoutines({ workspaceSlug }: ActiveRoutinesProps) {
  const routines = DEMO_ROUTINES;
  const runningCount = routines.filter((r) => r.status.label === 'Running').length;

  if (routines.length === 0) return null;

  return (
    <section aria-label="Active routines" className="py-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-foreground">Active routines</h2>
          {runningCount > 0 && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ color: '#29a386', backgroundColor: 'rgba(41,163,134,0.08)' }}
            >
              {runningCount} running
            </span>
          )}
        </div>
        <Link
          href={`/${workspaceSlug}/chat`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          View all
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {/* Routine cards — 12px gap */}
      <div className="flex flex-col gap-3">
        {routines.map((routine) => (
          <div
            key={routine.id}
            className="flex items-center gap-3 rounded-[16px] border border-border bg-background px-4 py-3.5"
          >
            {/* Source circle — 34px */}
            <div
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: routine.source.color }}
            >
              {routine.source.icon}
            </div>

            {/* Content */}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                {/* Title */}
                <span className="truncate text-[13px] font-semibold text-foreground">
                  {routine.title}
                </span>
                {/* Status badge */}
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5"
                  style={{ backgroundColor: routine.status.bg }}
                >
                  {routine.status.indicator}
                  <span
                    className="text-[10px] font-semibold"
                    style={{ color: routine.status.color }}
                  >
                    {routine.status.label}
                  </span>
                </span>
              </div>
              {/* Detail line — Inter 11px */}
              <span className="truncate text-[11px] text-muted-foreground">
                {routine.detail}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
