/**
 * AddRepoForm - GitHub repo URL input + browse button for discovering plugins.
 *
 * Phase 19 Plan 04: Submits URL to PluginsStore.fetchRepo, shows available plugins as cards.
 */

'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore } from '@/stores';
import { PluginCard } from './plugin-card';

interface AddRepoFormProps {
  workspaceId: string;
}

export const AddRepoForm = observer(function AddRepoForm({ workspaceId }: AddRepoFormProps) {
  const { ai } = useStore();
  const pluginsStore = ai.plugins;
  const [repoUrl, setRepoUrl] = React.useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    await pluginsStore.fetchRepo(workspaceId, repoUrl.trim());
  };

  const handleInstall = async (skillName: string) => {
    await pluginsStore.installPlugin(workspaceId, repoUrl.trim(), skillName);
  };

  const isAlreadyInstalled = (skillName: string) =>
    pluginsStore.installedPlugins.some(
      (p) => p.skill_name === skillName && p.repo_url === repoUrl.trim()
    );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="repo-url">Add Plugin from GitHub</Label>
        <p className="text-xs text-muted-foreground">
          Paste a GitHub repository URL to browse available skills.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          id="repo-url"
          type="url"
          placeholder="https://github.com/org/skills"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={!repoUrl.trim() || pluginsStore.isLoading}>
          <Search className="mr-1.5 h-4 w-4" />
          {pluginsStore.isLoading ? 'Browsing...' : 'Browse'}
        </Button>
      </form>

      {pluginsStore.repoError && (
        <Alert variant="destructive">
          <AlertDescription>{pluginsStore.repoError}</AlertDescription>
        </Alert>
      )}

      {pluginsStore.availablePlugins.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Available Skills</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {pluginsStore.availablePlugins.map((plugin) => {
              const installed = isAlreadyInstalled(plugin.skill_name);
              return (
                <PluginCard
                  key={plugin.skill_name}
                  plugin={plugin}
                  isInstalled={installed}
                  isInstalling={pluginsStore.isSaving}
                  onInstall={installed ? undefined : () => handleInstall(plugin.skill_name)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
