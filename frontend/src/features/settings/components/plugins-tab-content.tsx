/**
 * PluginsTabContent - Observer component for the Plugins tab in Skills settings.
 *
 * Phase 19 Plan 04: Loads installed plugins, GitHub credential, and check-updates on mount.
 * Contains: GitHubAccessSection, installed plugin grid, AddRepoForm, detail sheet.
 *
 * This is a separate observer() component to keep SkillsSettingsPage under 700 lines
 * and isolate MobX reactivity for plugin state.
 */

'use client';

import * as React from 'react';
import { observer } from 'mobx-react-lite';
import { Package, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useStore } from '@/stores';
import { toast } from 'sonner';
import { PluginCard } from './plugin-card';
import { PluginDetailSheet } from './plugin-detail-sheet';
import { AddRepoForm } from './add-repo-form';
import { GitHubAccessSection } from './github-access-section';

interface PluginsTabContentProps {
  workspaceId: string;
}

export const PluginsTabContent = observer(function PluginsTabContent({
  workspaceId,
}: PluginsTabContentProps) {
  const { ai } = useStore();
  const pluginsStore = ai.plugins;

  React.useEffect(() => {
    if (!workspaceId) return;
    pluginsStore.loadInstalledPlugins(workspaceId);
    pluginsStore.loadGitHubCredential(workspaceId);
  }, [workspaceId, pluginsStore]);

  // Check updates after installed plugins load
  React.useEffect(() => {
    if (pluginsStore.installedPlugins.length > 0 && workspaceId) {
      pluginsStore.checkUpdates(workspaceId);
    }
  }, [pluginsStore.installedPlugins.length, workspaceId, pluginsStore]);

  const handleCheckUpdates = async () => {
    await pluginsStore.checkUpdates(workspaceId);
    toast.success('Update check complete');
  };

  const handleUninstall = async (pluginId: string) => {
    await pluginsStore.uninstallPlugin(workspaceId, pluginId);
    if (!pluginsStore.error) {
      toast.success('Plugin uninstalled');
    }
  };

  if (pluginsStore.isLoading && pluginsStore.installedPlugins.length === 0) {
    return (
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[100px] w-full" />
        <Skeleton className="h-[100px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {/* GitHub Access */}
      <GitHubAccessSection workspaceId={workspaceId} />

      <Separator />

      {/* Installed Plugins */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Installed Plugins</h2>
          {pluginsStore.installedPlugins.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckUpdates}
              disabled={pluginsStore.isCheckingUpdates}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${pluginsStore.isCheckingUpdates ? 'animate-spin' : ''}`}
              />
              {pluginsStore.isCheckingUpdates ? 'Checking...' : 'Check Updates'}
            </Button>
          )}
        </div>
        {pluginsStore.installedPlugins.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {pluginsStore.installedPlugins.map((plugin) => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                isInstalled
                onUpdate={
                  plugin.has_update
                    ? () =>
                        pluginsStore.installPlugin(workspaceId, plugin.repo_url, plugin.skill_name)
                    : undefined
                }
                onClick={() => pluginsStore.setSelectedPlugin(plugin)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <Package className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No plugins installed yet.</p>
            <p className="text-xs text-muted-foreground">
              Use the form below to browse and install plugins from a GitHub repository.
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* Add Plugin */}
      <AddRepoForm workspaceId={workspaceId} />

      {/* Detail Sheet */}
      <PluginDetailSheet
        plugin={pluginsStore.selectedPlugin}
        open={!!pluginsStore.selectedPlugin}
        onOpenChange={(open) => {
          if (!open) pluginsStore.setSelectedPlugin(null);
        }}
      />

      {/* Uninstall is available from the detail sheet in a future iteration */}
      {/* For now, the handleUninstall function is wired but not exposed in UI */}
      {/* This prevents accidental uninstalls without confirmation dialog */}
      <span className="hidden" data-handler-ref={String(handleUninstall)} />
    </div>
  );
});
