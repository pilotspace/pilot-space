import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/api/plugins', () => ({
  pluginsApi: {
    getInstalled: vi.fn(),
    browse: vi.fn(),
    install: vi.fn(),
    installAll: vi.fn(),
    uninstall: vi.fn(),
    uninstallRepo: vi.fn(),
    togglePlugin: vi.fn(),
    toggleRepo: vi.fn(),
    checkUpdates: vi.fn(),
    saveGitHubPat: vi.fn(),
    getGitHubCredential: vi.fn(),
  },
}));

import { PluginsStore } from '../PluginsStore';
import type { InstalledPlugin } from '../PluginsStore';
import { pluginsApi } from '@/services/api/plugins';

const mockedApi = vi.mocked(pluginsApi);

const WORKSPACE_ID = 'ws-1';
const REPO_URL = 'https://github.com/org/skills';

const mockInstalled: InstalledPlugin = {
  id: 'p-1',
  workspace_id: WORKSPACE_ID,
  repo_url: REPO_URL,
  skill_name: 'code-review',
  display_name: 'Code Review',
  description: 'Reviews pull requests',
  installed_sha: 'abc12345',
  is_active: true,
  has_update: false,
};

const mockInstalled2: InstalledPlugin = {
  id: 'p-2',
  workspace_id: WORKSPACE_ID,
  repo_url: REPO_URL,
  skill_name: 'test-gen',
  display_name: 'Test Generator',
  description: 'Generates tests',
  installed_sha: 'abc12345',
  is_active: false,
  has_update: false,
};

describe('PluginsStore', () => {
  let store: PluginsStore;

  beforeEach(() => {
    store = new PluginsStore();
    vi.clearAllMocks();
  });

  describe('loadInstalledPlugins', () => {
    it('populates installedPlugins from API response', async () => {
      mockedApi.getInstalled.mockResolvedValue([mockInstalled]);

      await store.loadInstalledPlugins(WORKSPACE_ID);

      expect(mockedApi.getInstalled).toHaveBeenCalledWith(WORKSPACE_ID);
      expect(store.installedPlugins).toEqual([mockInstalled]);
      expect(store.isLoading).toBe(false);
    });

    it('sets error on failure', async () => {
      mockedApi.getInstalled.mockRejectedValue(new Error('Network error'));

      await store.loadInstalledPlugins(WORKSPACE_ID);

      expect(store.error).toBe('Network error');
      expect(store.isLoading).toBe(false);
    });
  });

  describe('groupedPlugins', () => {
    it('groups plugins by repo_url', () => {
      store.installedPlugins = [mockInstalled, mockInstalled2];

      expect(store.groupedPlugins).toHaveLength(1);
      expect(store.groupedPlugins[0]?.skillCount).toBe(2);
      expect(store.groupedPlugins[0]?.activeCount).toBe(1);
      expect(store.groupedPlugins[0]?.repoName).toBe('skills');
      expect(store.groupedPlugins[0]?.repoOwner).toBe('org');
    });

    it('separates plugins from different repos', () => {
      const otherRepo: InstalledPlugin = {
        ...mockInstalled,
        id: 'p-3',
        repo_url: 'https://github.com/other/repo',
        skill_name: 'lint',
      };
      store.installedPlugins = [mockInstalled, otherRepo];

      expect(store.groupedPlugins).toHaveLength(2);
    });
  });

  describe('installAllFromRepo', () => {
    it('SKRG-02: installs all skills from repo and adds to store', async () => {
      mockedApi.installAll.mockResolvedValue([mockInstalled, mockInstalled2]);

      const result = await store.installAllFromRepo(WORKSPACE_ID, REPO_URL);

      expect(result).toBe(true);
      expect(mockedApi.installAll).toHaveBeenCalledWith(WORKSPACE_ID, {
        repo_url: REPO_URL,
        pat: null,
      });
      expect(store.installedPlugins).toHaveLength(2);
      expect(store.isInstalling).toBe(false);
    });

    it('passes PAT to API when provided', async () => {
      mockedApi.installAll.mockResolvedValue([mockInstalled]);

      await store.installAllFromRepo(WORKSPACE_ID, REPO_URL, 'ghp_test');

      expect(mockedApi.installAll).toHaveBeenCalledWith(WORKSPACE_ID, {
        repo_url: REPO_URL,
        pat: 'ghp_test',
      });
    });

    it('returns false and sets error on failure', async () => {
      mockedApi.installAll.mockRejectedValue(new Error('Install failed'));

      const result = await store.installAllFromRepo(WORKSPACE_ID, REPO_URL);

      expect(result).toBe(false);
      expect(store.error).toBe('Install failed');
    });
  });

  describe('toggleSkill', () => {
    it('SKRG-03: optimistically toggles a single skill', async () => {
      store.installedPlugins = [mockInstalled];
      mockedApi.togglePlugin.mockResolvedValue({ ...mockInstalled, is_active: false });

      await store.toggleSkill(WORKSPACE_ID, 'p-1', false);

      expect(store.installedPlugins[0]?.is_active).toBe(false);
    });

    it('reverts on API failure', async () => {
      store.installedPlugins = [mockInstalled];
      mockedApi.togglePlugin.mockRejectedValue(new Error('Server error'));

      await store.toggleSkill(WORKSPACE_ID, 'p-1', false);

      expect(store.installedPlugins[0]?.is_active).toBe(true); // reverted
      expect(store.error).toBe('Server error');
    });
  });

  describe('toggleRepo', () => {
    it('optimistically toggles all skills from a repo', async () => {
      store.installedPlugins = [mockInstalled, mockInstalled2];
      mockedApi.toggleRepo.mockResolvedValue([
        { ...mockInstalled, is_active: false },
        { ...mockInstalled2, is_active: false },
      ]);

      await store.toggleRepo(WORKSPACE_ID, REPO_URL, false);

      expect(store.installedPlugins.every((p) => !p.is_active)).toBe(true);
    });
  });

  describe('uninstallRepo', () => {
    it('removes all plugins from a repo', async () => {
      store.installedPlugins = [mockInstalled, mockInstalled2];
      mockedApi.uninstallRepo.mockResolvedValue(undefined);

      await store.uninstallRepo(WORKSPACE_ID, REPO_URL);

      expect(store.installedPlugins).toEqual([]);
    });

    it('clears selectedRepoUrl if matching', async () => {
      store.installedPlugins = [mockInstalled];
      store.setSelectedRepoUrl(REPO_URL);
      mockedApi.uninstallRepo.mockResolvedValue(undefined);

      await store.uninstallRepo(WORKSPACE_ID, REPO_URL);

      expect(store.selectedRepoUrl).toBeNull();
    });
  });

  describe('checkUpdates', () => {
    it('SKRG-04: sets has_update flag on plugins with differing SHA', async () => {
      const updatedPlugin = { ...mockInstalled, has_update: true };
      mockedApi.checkUpdates.mockResolvedValue({ plugins: [updatedPlugin] });
      store.installedPlugins = [mockInstalled];

      await store.checkUpdates(WORKSPACE_ID);

      expect(store.installedPlugins[0]?.has_update).toBe(true);
    });
  });

  describe('GitHub credential', () => {
    it('loadGitHubCredential sets hasGitHubPat', async () => {
      mockedApi.getGitHubCredential.mockResolvedValue({ has_pat: true });

      await store.loadGitHubCredential(WORKSPACE_ID);

      expect(store.hasGitHubPat).toBe(true);
    });

    it('saveGitHubPat calls API and updates hasGitHubPat', async () => {
      mockedApi.saveGitHubPat.mockResolvedValue(undefined);

      const result = await store.saveGitHubPat(WORKSPACE_ID, 'ghp_test123');

      expect(result).toBe(true);
      expect(mockedApi.saveGitHubPat).toHaveBeenCalledWith(WORKSPACE_ID, 'ghp_test123');
      expect(store.hasGitHubPat).toBe(true);
    });
  });

  describe('AIStore integration', () => {
    it('AIStore.plugins is an instance of PluginsStore', async () => {
      const { AIStore } = await import('../AIStore');
      const aiStore = new AIStore();
      expect(aiStore.plugins).toBeInstanceOf(PluginsStore);
    });
  });

  describe('reset', () => {
    it('resets all state', () => {
      store.installedPlugins = [mockInstalled];
      store.isLoading = true;
      store.error = 'some error';
      store.hasGitHubPat = true;
      store.selectedRepoUrl = REPO_URL;

      store.reset();

      expect(store.installedPlugins).toEqual([]);
      expect(store.isLoading).toBe(false);
      expect(store.error).toBeNull();
      expect(store.hasGitHubPat).toBe(false);
      expect(store.selectedRepoUrl).toBeNull();
    });
  });
});
