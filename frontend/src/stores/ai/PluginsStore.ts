/**
 * PluginsStore - MobX store for workspace plugin management.
 *
 * Manages installed plugins grouped by repo, toggle operations,
 * batch install, and GitHub PAT credential management.
 */
import { makeAutoObservable, runInAction, computed } from 'mobx';
import { pluginsApi } from '@/services/api/plugins';

export interface InstalledPlugin {
  id: string;
  workspace_id: string;
  repo_url: string;
  skill_name: string;
  display_name: string;
  description: string | null;
  installed_sha: string;
  is_active: boolean;
  has_update: boolean;
}

/** A plugin group = all skills from the same repo. */
export interface PluginGroup {
  repoUrl: string;
  repoName: string;
  repoOwner: string;
  skills: InstalledPlugin[];
  skillCount: number;
  activeCount: number;
  hasUpdate: boolean;
}

export class PluginsStore {
  installedPlugins: InstalledPlugin[] = [];
  isLoading = false;
  isInstalling = false;
  error: string | null = null;
  hasGitHubPat = false;
  selectedRepoUrl: string | null = null;

  constructor() {
    makeAutoObservable(this, {
      groupedPlugins: computed,
      selectedGroup: computed,
    });
  }

  /** Group installed plugins by repo_url. */
  get groupedPlugins(): PluginGroup[] {
    const groups = new Map<string, InstalledPlugin[]>();
    for (const plugin of this.installedPlugins) {
      const existing = groups.get(plugin.repo_url) ?? [];
      existing.push(plugin);
      groups.set(plugin.repo_url, existing);
    }

    return Array.from(groups.entries()).map(([repoUrl, skills]) => {
      const parts = repoUrl.replace(/\.git$/, '').split('/');
      const repoName = parts[parts.length - 1] || repoUrl;
      const repoOwner = parts[parts.length - 2] || '';
      return {
        repoUrl,
        repoName,
        repoOwner,
        skills,
        skillCount: skills.length,
        activeCount: skills.filter((s) => s.is_active).length,
        hasUpdate: skills.some((s) => s.has_update),
      };
    });
  }

  /** Get the selected plugin group for the detail dialog. */
  get selectedGroup(): PluginGroup | null {
    if (!this.selectedRepoUrl) return null;
    return this.groupedPlugins.find((g) => g.repoUrl === this.selectedRepoUrl) ?? null;
  }

  async loadInstalledPlugins(workspaceId: string): Promise<void> {
    runInAction(() => {
      this.isLoading = true;
      this.error = null;
    });
    try {
      const data = await pluginsApi.getInstalled(workspaceId);
      runInAction(() => {
        this.installedPlugins = data;
      });
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : 'Failed to load plugins';
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  async installAllFromRepo(workspaceId: string, repoUrl: string, pat?: string): Promise<boolean> {
    runInAction(() => {
      this.isInstalling = true;
      this.error = null;
    });
    try {
      const plugins = await pluginsApi.installAll(workspaceId, {
        repo_url: repoUrl,
        pat: pat || null,
      });
      runInAction(() => {
        this.installedPlugins = [...this.installedPlugins, ...plugins];
        this.isInstalling = false;
      });
      return true;
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : 'Failed to install plugin';
        this.isInstalling = false;
      });
      return false;
    }
  }

  async toggleSkill(workspaceId: string, pluginId: string, isActive: boolean): Promise<void> {
    // Optimistic update
    const prevPlugins = [...this.installedPlugins];
    runInAction(() => {
      this.installedPlugins = this.installedPlugins.map((p) =>
        p.id === pluginId ? { ...p, is_active: isActive } : p
      );
    });
    try {
      await pluginsApi.togglePlugin(workspaceId, pluginId, isActive);
    } catch (err) {
      runInAction(() => {
        this.installedPlugins = prevPlugins;
        this.error = err instanceof Error ? err.message : 'Failed to toggle skill';
      });
    }
  }

  async toggleRepo(workspaceId: string, repoUrl: string, isActive: boolean): Promise<void> {
    // Optimistic update
    const prevPlugins = [...this.installedPlugins];
    runInAction(() => {
      this.installedPlugins = this.installedPlugins.map((p) =>
        p.repo_url === repoUrl ? { ...p, is_active: isActive } : p
      );
    });
    try {
      await pluginsApi.toggleRepo(workspaceId, repoUrl, isActive);
    } catch (err) {
      runInAction(() => {
        this.installedPlugins = prevPlugins;
        this.error = err instanceof Error ? err.message : 'Failed to toggle plugin';
      });
    }
  }

  async uninstallRepo(workspaceId: string, repoUrl: string): Promise<void> {
    try {
      await pluginsApi.uninstallRepo(workspaceId, repoUrl);
      runInAction(() => {
        this.installedPlugins = this.installedPlugins.filter((p) => p.repo_url !== repoUrl);
        if (this.selectedRepoUrl === repoUrl) this.selectedRepoUrl = null;
      });
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : 'Failed to remove plugin';
      });
    }
  }

  async checkUpdates(workspaceId: string): Promise<void> {
    try {
      const result = await pluginsApi.checkUpdates(workspaceId);
      runInAction(() => {
        this.installedPlugins = this.installedPlugins.map((installed) => {
          const updated = result.plugins.find((p) => p.id === installed.id);
          return updated ? { ...installed, has_update: updated.has_update } : installed;
        });
      });
    } catch {
      // Silent — update check is non-critical
    }
  }

  async saveGitHubPat(workspaceId: string, pat: string): Promise<boolean> {
    try {
      await pluginsApi.saveGitHubPat(workspaceId, pat);
      runInAction(() => {
        this.hasGitHubPat = true;
      });
      return true;
    } catch (err) {
      runInAction(() => {
        this.error = err instanceof Error ? err.message : 'Failed to save PAT';
      });
      return false;
    }
  }

  async loadGitHubCredential(workspaceId: string): Promise<void> {
    try {
      const result = await pluginsApi.getGitHubCredential(workspaceId);
      runInAction(() => {
        this.hasGitHubPat = result.has_pat;
      });
    } catch {
      // Silent
    }
  }

  setSelectedRepoUrl(repoUrl: string | null): void {
    this.selectedRepoUrl = repoUrl;
  }

  reset(): void {
    this.installedPlugins = [];
    this.isLoading = false;
    this.isInstalling = false;
    this.error = null;
    this.hasGitHubPat = false;
    this.selectedRepoUrl = null;
  }
}
