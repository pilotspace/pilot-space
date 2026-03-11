/**
 * PluginsTabContent - Observer component for the Plugins tab in Skills settings.
 *
 * Shows installed plugins as grouped cards, "Add Plugin" button top-right,
 * empty state, and detail dialog for individual skill management.
 */

'use client';

import * as React from 'react';
import { observer } from 'mobx-react-lite';
import { Plus, Puzzle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useStore } from '@/stores';
import { toast } from 'sonner';
import { PluginCard } from './plugin-card';
import { PluginDetailDialog } from './plugin-detail-sheet';
import { AddPluginDialog } from './add-repo-form';

interface PluginsTabContentProps {
  workspaceId: string;
  addDialogOpen: boolean;
  onAddDialogOpenChange: (open: boolean) => void;
}

export const PluginsTabContent = observer(function PluginsTabContent({
  workspaceId,
  addDialogOpen,
  onAddDialogOpenChange,
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

  const handleToggleRepo = async (repoUrl: string, isActive: boolean) => {
    await pluginsStore.toggleRepo(workspaceId, repoUrl, isActive);
  };

  const handleToggleSkill = async (pluginId: string, isActive: boolean) => {
    await pluginsStore.toggleSkill(workspaceId, pluginId, isActive);
  };

  const handleRemoveRepo = async (repoUrl: string) => {
    await pluginsStore.uninstallRepo(workspaceId, repoUrl);
    if (!pluginsStore.error) {
      toast.success('Plugin removed');
    }
  };

  if (pluginsStore.isLoading && pluginsStore.installedPlugins.length === 0) {
    return (
      <div className="space-y-2 pt-3">
        <Skeleton className="h-[64px] w-full rounded-lg" />
        <Skeleton className="h-[64px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-3">
      {/* Plugin cards or empty state */}
      {pluginsStore.groupedPlugins.length > 0 ? (
        <div className="space-y-2">
          {pluginsStore.groupedPlugins.map((group) => (
            <PluginCard
              key={group.repoUrl}
              group={group}
              onToggle={(isActive) => handleToggleRepo(group.repoUrl, isActive)}
              onClick={() => pluginsStore.setSelectedRepoUrl(group.repoUrl)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 px-4">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 mb-3">
            <Puzzle className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <h3 className="text-sm font-medium text-foreground">No plugins installed</h3>
          <p className="mt-0.5 text-xs text-muted-foreground text-center max-w-[260px]">
            Install a plugin from a GitHub repository to add new skills.
          </p>
          <Button size="sm" className="mt-3" onClick={() => onAddDialogOpenChange(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Plugin
          </Button>
        </div>
      )}

      {/* Add Plugin Dialog */}
      <AddPluginDialog
        workspaceId={workspaceId}
        open={addDialogOpen}
        onOpenChange={onAddDialogOpenChange}
      />

      {/* Plugin Detail Dialog */}
      <PluginDetailDialog
        group={pluginsStore.selectedGroup}
        open={!!pluginsStore.selectedRepoUrl}
        onOpenChange={(open) => {
          if (!open) pluginsStore.setSelectedRepoUrl(null);
        }}
        onToggleSkill={handleToggleSkill}
        onRemove={handleRemoveRepo}
      />
    </div>
  );
});
