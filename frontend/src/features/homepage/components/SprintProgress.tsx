'use client';

/**
 * SprintProgress — Active sprint progress rows wired to cyclesApi.
 *
 * Data flow:
 *   1. Fetch all projects via projectsApi.list()
 *   2. For each project, fetch active cycle via cyclesApi.getActive()
 *   3. Map Cycle.metrics → SprintItem rows
 *   4. Fall back to demo data if no active cycles exist
 *
 * Design spec (design.md §4.4):
 * - Rows: 16px radius, 1px border #e5e7eb, padding 16px 20px
 * - Top line: project dot (8px) + name (13px/600) + sprint badge (pill)
 *   + status badge (pill, status-colored)
 * - Progress bar: 4px radius, 6px height, fill = project color
 * - Stats: Inter 11px #9ca3af — "N of total issues · days remaining"
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/services/api/projects';
import { cyclesApi } from '@/services/api/cycles';
import type { Cycle } from '@/types';
import { useWorkspaceDigest } from '../hooks/useWorkspaceDigest';

// ── Project color rotation (stable per index) ────────────────────────

const PROJECT_COLORS = ['#29a386', '#e67e22', '#3b82f6', '#8b5cf6', '#d9534f'] as const;

// ── Sprint status derivation ──────────────────────────────────────────

interface SprintStatus {
  label: string;
  color: string;
  bg: string;
}

function deriveStatus(cycle: Cycle, daysRemaining: number): SprintStatus {
  const pct = cycle.metrics?.completionPercentage ?? 0;

  // Ahead: > 80% done with > 3 days left
  if (pct >= 80 && daysRemaining > 3) {
    return { label: 'Ahead', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' };
  }
  // At Risk: < 50% done with < 3 days left
  if (pct < 50 && daysRemaining <= 3) {
    return { label: 'At Risk', color: '#e67e22', bg: 'rgba(230,126,34,0.08)' };
  }
  // Default: On Track
  return { label: 'On Track', color: '#29a386', bg: 'rgba(41,163,134,0.08)' };
}

function getDaysRemaining(endDate?: string): number {
  if (!endDate) return 0;
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

// ── View model ────────────────────────────────────────────────────────

interface SprintItem {
  id: string;
  project: string;
  projectColor: string;
  sprint: string;
  completed: number;
  total: number;
  daysRemaining: number;
  status: SprintStatus;
}

// ── Demo fallback ─────────────────────────────────────────────────────

const DEMO_SPRINTS: SprintItem[] = [
  {
    id: 'demo-s1',
    project: 'Frontend Redesign',
    projectColor: '#29a386',
    sprint: 'Sprint 3',
    completed: 8,
    total: 11,
    daysRemaining: 3,
    status: { label: 'On Track', color: '#29a386', bg: 'rgba(41,163,134,0.08)' },
  },
  {
    id: 'demo-s2',
    project: 'Backend API',
    projectColor: '#e67e22',
    sprint: 'Sprint 5',
    completed: 5,
    total: 11,
    daysRemaining: 2,
    status: { label: 'At Risk', color: '#e67e22', bg: 'rgba(230,126,34,0.08)' },
  },
  {
    id: 'demo-s3',
    project: 'Mobile App',
    projectColor: '#3b82f6',
    sprint: 'Sprint 1',
    completed: 9,
    total: 10,
    daysRemaining: 5,
    status: { label: 'Ahead', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
  },
];

// ── Component ─────────────────────────────────────────────────────────

interface SprintProgressProps {
  workspaceSlug: string;
  workspaceId: string;
}

export function SprintProgress({ workspaceSlug, workspaceId }: SprintProgressProps) {
  // 0. Fetch workspace digest for health alerts
  const { groups } = useWorkspaceDigest({ workspaceId, enabled: !!workspaceId });

  const alerts = useMemo(() => {
    const items: Array<{ id: string; text: string; color: string }> = [];
    const stale = groups.find((g) => g.category === 'stale_issues');
    if (stale && stale.items.length > 0) {
      const n = stale.items.length;
      items.push({
        id: 'stale',
        text: `${n} stale issue${n !== 1 ? 's' : ''} need${n === 1 ? 's' : ''} attention`,
        color: '#d9853f',
      });
    }
    const blocked = groups.find((g) => g.category === 'blocked_dependencies');
    if (blocked && blocked.items.length > 0) {
      const n = blocked.items.length;
      items.push({
        id: 'blocked',
        text: `${n} item${n !== 1 ? 's' : ''} blocked by dependencies`,
        color: '#d9534f',
      });
    }
    return items;
  }, [groups]);

  // 1. Fetch projects
  const { data: projectsData } = useQuery({
    queryKey: ['homepage', 'projects', workspaceId],
    queryFn: () => projectsApi.list(workspaceId),
    enabled: !!workspaceId,
    staleTime: 120_000,
  });

  const projects = projectsData?.items ?? [];

  // 2. Fetch active cycle for each project (parallel queries)
  const cycleQueries = useQueries({
    queries: projects.slice(0, 5).map((project) => ({
      queryKey: ['homepage', 'active-cycle', workspaceId, project.id],
      queryFn: () => cyclesApi.getActive(workspaceId, project.id),
      enabled: !!workspaceId && projects.length > 0,
      staleTime: 60_000,
    })),
  });

  const isLoading = cycleQueries.some((q) => q.isLoading);

  // 3. Map Cycle → SprintItem
  const sprints: SprintItem[] = useMemo(() => {
    const items: SprintItem[] = [];

    for (let i = 0; i < cycleQueries.length; i++) {
      const cycle = cycleQueries[i]?.data as Cycle | null | undefined;
      if (!cycle || !cycle.metrics) continue;

      const project = projects[i];
      if (!project) continue;

      const daysRemaining = getDaysRemaining(cycle.endDate);
      const color = PROJECT_COLORS[i % PROJECT_COLORS.length]!;

      items.push({
        id: cycle.id,
        project: project.name,
        projectColor: color,
        sprint: cycle.name,
        completed: cycle.metrics.completedIssues,
        total: cycle.metrics.totalIssues,
        daysRemaining,
        status: deriveStatus(cycle, daysRemaining),
      });
    }

    return items;
  }, [cycleQueries, projects]);

  // 4. Use demo data when no real cycles
  const displaySprints = sprints.length > 0 ? sprints : DEMO_SPRINTS;

  if (isLoading) {
    return (
      <section aria-label="Sprint progress" className="py-4">
        <div className="flex items-center justify-between pb-2">
          <div className="h-5 w-36 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-[16px] bg-muted/40" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Sprint progress" className="py-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-base font-semibold text-foreground">Sprint progress</h2>
        <Link
          href={`/${workspaceSlug}/issues`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          View All
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {/* Health alerts — stale issues, blocked deps */}
      {alerts.length > 0 && (
        <div className="mb-3 flex flex-col gap-1.5">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center gap-2 rounded-[12px] px-3.5 py-2"
              style={{ backgroundColor: `${alert.color}08` }}
            >
              <AlertTriangle
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: alert.color }}
                strokeWidth={2}
                aria-hidden="true"
              />
              <span className="text-[11px] font-medium" style={{ color: alert.color }}>
                {alert.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Sprint rows — 12px gap */}
      <div className="flex flex-col gap-3">
        {displaySprints.map((sprint) => {
          const pct = sprint.total > 0 ? (sprint.completed / sprint.total) * 100 : 0;

          return (
            <div
              key={sprint.id}
              className="flex flex-col gap-2.5 rounded-[16px] border border-border bg-background px-5 py-4"
            >
              {/* Top line */}
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: sprint.projectColor }}
                  aria-hidden="true"
                />
                <span className="text-[13px] font-semibold text-foreground">
                  {sprint.project}
                </span>
                <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#6b7280] dark:bg-muted dark:text-muted-foreground">
                  {sprint.sprint}
                </span>
                <div className="flex-1" />
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                  style={{ color: sprint.status.color, backgroundColor: sprint.status.bg }}
                >
                  {sprint.status.label}
                </span>
              </div>

              {/* Progress bar */}
              <div
                className="h-1.5 w-full overflow-hidden rounded-[4px] bg-border"
                role="progressbar"
                aria-valuenow={sprint.completed}
                aria-valuemin={0}
                aria-valuemax={sprint.total}
                aria-label={`${sprint.project}: ${sprint.completed} of ${sprint.total} issues`}
              >
                <div
                  className="h-full rounded-[4px] transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: sprint.projectColor }}
                />
              </div>

              {/* Stats line */}
              <span className="text-[11px] text-muted-foreground">
                {sprint.completed} of {sprint.total} issues · {sprint.daysRemaining} day
                {sprint.daysRemaining !== 1 ? 's' : ''} remaining
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
