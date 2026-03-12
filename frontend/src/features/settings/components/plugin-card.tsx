/**
 * PluginCard - Card for an installed plugin (grouped by repo).
 *
 * Shows repo name, skill count, active/partial/inactive badge,
 * update available badge, and toggle switch.
 */

'use client';

import { Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type { PluginGroup } from '@/stores/ai/PluginsStore';

interface PluginCardProps {
  group: PluginGroup;
  onToggle: (isActive: boolean) => void;
  onClick: () => void;
}

export function PluginCard({ group, onToggle, onClick }: PluginCardProps) {
  const allActive = group.activeCount === group.skillCount;
  const noneActive = group.activeCount === 0;
  const isPartial = !allActive && !noneActive;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`w-full cursor-pointer rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors duration-150 hover:border-muted-foreground/30 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${noneActive ? 'opacity-75' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`${group.repoName}, ${group.skillCount} skills, ${allActive ? 'active' : noneActive ? 'inactive' : 'partially active'}`}
      data-testid="plugin-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Package className="h-4.5 w-4.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="truncate text-sm font-medium text-foreground">{group.repoName}</span>
              {allActive && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0 h-5"
                  data-testid="badge-active"
                >
                  Active
                </Badge>
              )}
              {isPartial && (
                <Badge
                  variant="outline"
                  className="border-amber-500/20 bg-amber-500/10 text-amber-400 text-[10px] px-1.5 py-0 h-5"
                  data-testid="badge-partial"
                >
                  Partial
                </Badge>
              )}
              {group.hasUpdate && (
                <Badge
                  variant="outline"
                  className="border-amber-500/20 bg-amber-500/10 text-amber-400 text-[10px] px-1.5 py-0 h-5"
                  data-testid="badge-update"
                >
                  Update
                </Badge>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground font-mono">
              {group.repoOwner}/{group.repoName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {group.skillCount} skill{group.skillCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="shrink-0 pt-1">
          <Switch
            checked={!noneActive}
            onCheckedChange={(checked) => {
              onToggle(checked);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Toggle ${group.repoName}`}
          />
        </div>
      </div>
    </div>
  );
}
