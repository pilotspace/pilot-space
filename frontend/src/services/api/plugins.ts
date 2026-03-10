/**
 * Plugins API client.
 *
 * Typed API client for workspace plugin CRUD, toggle, batch install,
 * and GitHub credential management.
 */
import { apiClient } from '@/services/api/client';
import type { InstalledPlugin } from '@/stores/ai/PluginsStore';

const base = (workspaceId: string) => `/workspaces/${workspaceId}/plugins`;

export const pluginsApi = {
  /** List all installed plugins. */
  getInstalled: (workspaceId: string): Promise<InstalledPlugin[]> =>
    apiClient.get<InstalledPlugin[]>(base(workspaceId)),

  /** Browse available plugins from a GitHub repo. */
  browse: (
    workspaceId: string,
    repoUrl: string
  ): Promise<{ skill_name: string; display_name: string; description: string | null }[]> =>
    apiClient.get(`${base(workspaceId)}/browse`, { params: { repo_url: repoUrl } }),

  /** Install a single plugin skill. */
  install: (
    workspaceId: string,
    payload: { repo_url: string; skill_name: string }
  ): Promise<InstalledPlugin> => apiClient.post<InstalledPlugin>(base(workspaceId), payload),

  /** Install all skills from a GitHub repo. */
  installAll: (
    workspaceId: string,
    payload: { repo_url: string; pat?: string | null }
  ): Promise<InstalledPlugin[]> =>
    apiClient.post<InstalledPlugin[]>(`${base(workspaceId)}/install-all`, payload),

  /** Uninstall a single plugin. */
  uninstall: (workspaceId: string, pluginId: string): Promise<void> =>
    apiClient.delete<void>(`${base(workspaceId)}/${pluginId}`),

  /** Uninstall all plugins from a repo. */
  uninstallRepo: (workspaceId: string, repoUrl: string): Promise<void> =>
    apiClient.delete<void>(`${base(workspaceId)}/uninstall-repo`, {
      params: { repo_url: repoUrl },
    }),

  /** Toggle a single plugin's active state. */
  togglePlugin: (
    workspaceId: string,
    pluginId: string,
    isActive: boolean
  ): Promise<InstalledPlugin> =>
    apiClient.patch<InstalledPlugin>(`${base(workspaceId)}/${pluginId}/toggle`, {
      is_active: isActive,
    }),

  /** Toggle all plugins from a repo. */
  toggleRepo: (
    workspaceId: string,
    repoUrl: string,
    isActive: boolean
  ): Promise<InstalledPlugin[]> =>
    apiClient.patch<InstalledPlugin[]>(`${base(workspaceId)}/toggle-repo`, {
      repo_url: repoUrl,
      is_active: isActive,
    }),

  /** Check for available updates. */
  checkUpdates: (workspaceId: string): Promise<{ plugins: InstalledPlugin[] }> =>
    apiClient.get<{ plugins: InstalledPlugin[] }>(`${base(workspaceId)}/check-updates`),

  /** Save a GitHub PAT. */
  saveGitHubPat: (workspaceId: string, pat: string): Promise<void> =>
    apiClient.post<void>(`${base(workspaceId)}/github-credential`, { pat }),

  /** Check if GitHub PAT is configured. */
  getGitHubCredential: (workspaceId: string): Promise<{ has_pat: boolean }> =>
    apiClient.get<{ has_pat: boolean }>(`${base(workspaceId)}/github-credential`),
};
