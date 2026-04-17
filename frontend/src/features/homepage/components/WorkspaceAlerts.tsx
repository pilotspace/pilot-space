'use client';

/**
 * WorkspaceAlerts — Compact red-flag alerts row for the homepage.
 *
 * Shows up to 3 one-line alerts:
 * 1. Stale issues count (amber)
 * 2. Sprint health (contextual color)
 * 3. AI digest summary (muted)
 *
 * Each line is a single glanceable metric. Designed for "what's on fire" scanning.
 */

import { useMemo } from 'react';
import { AlertTriangle, Activity, Sparkles } from 'lucide-react';
import { useWorkspaceDigest } from '../hooks/useWorkspaceDigest';

interface WorkspaceAlertsProps {
  workspaceId: string;
}

export function WorkspaceAlerts({ workspaceId }: WorkspaceAlertsProps) {
  const { groups, suggestionCount, isLoading } = useWorkspaceDigest({
    workspaceId,
    enabled: !!workspaceId,
  });

  const alerts = useMemo(() => {
    if (groups.length === 0 && suggestionCount === 0) return [];

    const items: Array<{
      id: string;
      icon: typeof AlertTriangle;
      text: string;
      color: string;
      iconColor: string;
    }> = [];

    // Stale issues
    const staleGroup = groups.find((g) => g.category === 'stale_issues');
    if (staleGroup && staleGroup.items.length > 0) {
      const count = staleGroup.items.length;
      items.push({
        id: 'stale',
        icon: AlertTriangle,
        text: `${count} stale issue${count !== 1 ? 's' : ''} need${count === 1 ? 's' : ''} attention`,
        color: 'text-amber-700 dark:text-amber-400',
        iconColor: 'text-amber-500',
      });
    }

    // Cycle risk / sprint health
    const cycleGroup = groups.find((g) => g.category === 'cycle_risk');
    if (cycleGroup && cycleGroup.items.length > 0) {
      items.push({
        id: 'sprint',
        icon: Activity,
        text: 'Sprint at risk — review remaining items',
        color: 'text-orange-700 dark:text-orange-400',
        iconColor: 'text-orange-500',
      });
    }

    // Blocked dependencies
    const blockedGroup = groups.find((g) => g.category === 'blocked_dependencies');
    if (blockedGroup && blockedGroup.items.length > 0) {
      const count = blockedGroup.items.length;
      items.push({
        id: 'blocked',
        icon: AlertTriangle,
        text: `${count} item${count !== 1 ? 's' : ''} blocked by dependencies`,
        color: 'text-red-700 dark:text-red-400',
        iconColor: 'text-red-500',
      });
    }

    // AI digest summary (catch-all if nothing specific above)
    if (items.length === 0 && suggestionCount > 0) {
      items.push({
        id: 'digest',
        icon: Sparkles,
        text: `${suggestionCount} suggestion${suggestionCount !== 1 ? 's' : ''} from AI digest`,
        color: 'text-muted-foreground',
        iconColor: 'text-primary',
      });
    }

    return items.slice(0, 3);
  }, [groups, suggestionCount]);

  if (isLoading || alerts.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-1.5" role="status" aria-label="Workspace alerts">
      {alerts.map((alert) => (
        <div key={alert.id} className="flex items-center gap-1.5">
          <alert.icon className={`h-3 w-3 shrink-0 ${alert.iconColor}`} aria-hidden="true" />
          <span className={`text-xs ${alert.color}`}>{alert.text}</span>
        </div>
      ))}
    </div>
  );
}
