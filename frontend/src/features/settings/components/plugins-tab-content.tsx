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
}

export const PluginsTabContent = observer(function PluginsTabContent({
  workspaceId,
}: PluginsTabContentProps) {
  const { ai } = useStore();
  const pluginsStore = ai.plugins;
  const [addDialogOpen, setAddDialogOpen] = React.useState(false);

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
      <div className="space-y-4 pt-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[80px] w-full" />
        <Skeleton className="h-[80px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Plugins</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage installed plugins and their skills
          </p>
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Plugin
        </Button>
      </div>

      {/* Plugin cards or empty state */}
      {pluginsStore.groupedPlugins.length > 0 ? (
        <div className="space-y-3">
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
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="rounded-xl border border-border/50 bg-muted/30 p-4 mb-4">
            <Puzzle className="h-8 w-8 text-muted-foreground/60" />
          </div>
          <h3 className="text-sm font-medium text-foreground">No plugins installed</h3>
          <p className="mt-1 text-xs text-muted-foreground text-center max-w-[280px]">
            Plugins add new skills to your workspace. Install one from a GitHub repository.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Plugin
          </Button>
        </div>
      )}

      {/* Add Plugin Dialog */}
      <AddPluginDialog
        workspaceId={workspaceId}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
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
