/**
 * PluginCard - Card component for displaying a plugin with status badge.
 *
 * Phase 19 Plan 04: Shows plugin name, description, status badge (Installed/Update Available),
 * and Install/Update action button. Click opens detail sheet.
 */

'use client';

import { Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { InstalledPlugin, AvailablePlugin } from '@/stores/ai/PluginsStore';

interface PluginCardProps {
  plugin: InstalledPlugin | AvailablePlugin;
  isInstalled: boolean;
  isInstalling?: boolean;
  onInstall?: () => void;
  onUpdate?: () => void;
  onClick?: () => void;
}

function isInstalledPlugin(plugin: InstalledPlugin | AvailablePlugin): plugin is InstalledPlugin {
  return 'id' in plugin;
}

export function PluginCard({
  plugin,
  isInstalled,
  isInstalling,
  onInstall,
  onUpdate,
  onClick,
}: PluginCardProps) {
  const hasUpdate = isInstalledPlugin(plugin) && plugin.has_update;

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={(e) => {
        // Don't trigger card click when clicking a button inside
        if ((e.target as HTMLElement).closest('button')) return;
        onClick?.();
      }}
      data-testid="plugin-card"
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Package className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">{plugin.display_name}</span>
            {isInstalled && !hasUpdate && (
              <Badge variant="secondary" data-testid="badge-installed">
                Installed
              </Badge>
            )}
            {hasUpdate && (
              <Badge
                className="border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400"
                data-testid="badge-update"
              >
                Update Available
              </Badge>
            )}
          </div>
          {plugin.description && (
            <p className="line-clamp-2 text-xs text-muted-foreground">{plugin.description}</p>
          )}
        </div>
        <div className="shrink-0">
          {hasUpdate && onUpdate && (
            <Button size="sm" variant="outline" onClick={onUpdate} disabled={isInstalling}>
              {isInstalling ? 'Updating...' : 'Update'}
            </Button>
          )}
          {!isInstalled && onInstall && (
            <Button size="sm" onClick={onInstall} disabled={isInstalling}>
              {isInstalling ? 'Installing...' : 'Install'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
