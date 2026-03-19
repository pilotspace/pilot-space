/**
 * Tests for MCPCatalogTabContent - observer tab with filter chips + catalog cards.
 *
 * Behavioral contract:
 *   - Calls catalogStore.loadCatalog() on mount
 *   - Renders a card for each catalog entry
 *   - Filter chip "HTTP" shows only entries with transport_type='http'
 *   - Filter chip "SSE" shows only entries with transport_type='sse'
 *   - Filter chip "All" shows all entries
 *   - Shows loading skeleton when catalogStore.isLoading=true
 *   - Shows error alert when catalogStore.error is set and entries are empty
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MCPCatalogTabContent } from '../mcp-catalog-tab-content';
import type { McpCatalogEntry } from '@/services/api/mcp-catalog';
import type { MCPServer } from '@/stores/ai/MCPServersStore';

// Mock useStore to return a controlled catalogStore
vi.mock('@/stores', () => ({
  useStore: vi.fn(),
}));

import { useStore } from '@/stores';

const makeEntry = (overrides?: Partial<McpCatalogEntry>): McpCatalogEntry => ({
  id: 'entry-1',
  name: 'Context7',
  description: 'Context7 MCP server',
  url_template: 'https://mcp.context7.com/mcp',
  transport_type: 'http',
  auth_type: 'bearer',
  catalog_version: '1.0.0',
  is_official: true,
  icon_url: null,
  setup_instructions: null,
  sort_order: 0,
  oauth_auth_url: null,
  oauth_token_url: null,
  oauth_scopes: null,
  ...overrides,
});

function makeMockCatalogStore(overrides?: {
  entries?: McpCatalogEntry[];
  isLoading?: boolean;
  error?: string | null;
}) {
  const loadCatalog = vi.fn().mockResolvedValue(undefined);
  return {
    entries: overrides?.entries ?? [],
    isLoading: overrides?.isLoading ?? false,
    error: overrides?.error ?? null,
    loadCatalog,
  };
}

describe('MCPCatalogTabContent', () => {
  const mockOnInstall = vi.fn();
  const emptyInstalledServers: MCPServer[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls catalogStore.loadCatalog() on mount', () => {
    const catalogStore = makeMockCatalogStore({ entries: [] });
    vi.mocked(useStore).mockReturnValue({
      ai: { mcpCatalog: catalogStore },
    } as unknown as ReturnType<typeof useStore>);

    render(
      <MCPCatalogTabContent
        workspaceId="ws-1"
        installedServers={emptyInstalledServers}
        onInstall={mockOnInstall}
      />
    );

    expect(catalogStore.loadCatalog).toHaveBeenCalledTimes(1);
  });

  it('renders a card for each catalog entry', () => {
    const entries = [
      makeEntry({ id: 'e1', name: 'Context7' }),
      makeEntry({ id: 'e2', name: 'GitHub' }),
    ];
    const catalogStore = makeMockCatalogStore({ entries });
    vi.mocked(useStore).mockReturnValue({
      ai: { mcpCatalog: catalogStore },
    } as unknown as ReturnType<typeof useStore>);

    render(
      <MCPCatalogTabContent
        workspaceId="ws-1"
        installedServers={emptyInstalledServers}
        onInstall={mockOnInstall}
      />
    );

    expect(screen.getByText('Context7')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('filter chip "HTTP" shows only http transport entries', async () => {
    const user = userEvent.setup();
    const entries = [
      makeEntry({ id: 'e1', name: 'HTTP Entry', transport_type: 'http' }),
      makeEntry({ id: 'e2', name: 'SSE Entry', transport_type: 'sse' }),
    ];
    const catalogStore = makeMockCatalogStore({ entries });
    vi.mocked(useStore).mockReturnValue({
      ai: { mcpCatalog: catalogStore },
    } as unknown as ReturnType<typeof useStore>);

    render(
      <MCPCatalogTabContent
        workspaceId="ws-1"
        installedServers={emptyInstalledServers}
        onInstall={mockOnInstall}
      />
    );

    await user.click(screen.getByRole('button', { name: 'HTTP' }));

    expect(screen.getByText('HTTP Entry')).toBeInTheDocument();
    expect(screen.queryByText('SSE Entry')).not.toBeInTheDocument();
  });

  it('filter chip "SSE" shows only sse transport entries', async () => {
    const user = userEvent.setup();
    const entries = [
      makeEntry({ id: 'e1', name: 'HTTP Entry', transport_type: 'http' }),
      makeEntry({ id: 'e2', name: 'SSE Entry', transport_type: 'sse' }),
    ];
    const catalogStore = makeMockCatalogStore({ entries });
    vi.mocked(useStore).mockReturnValue({
      ai: { mcpCatalog: catalogStore },
    } as unknown as ReturnType<typeof useStore>);

    render(
      <MCPCatalogTabContent
        workspaceId="ws-1"
        installedServers={emptyInstalledServers}
        onInstall={mockOnInstall}
      />
    );

    await user.click(screen.getByRole('button', { name: 'SSE' }));

    expect(screen.queryByText('HTTP Entry')).not.toBeInTheDocument();
    expect(screen.getByText('SSE Entry')).toBeInTheDocument();
  });

  it('filter chip "All" shows all entries', async () => {
    const user = userEvent.setup();
    const entries = [
      makeEntry({ id: 'e1', name: 'HTTP Entry', transport_type: 'http' }),
      makeEntry({ id: 'e2', name: 'SSE Entry', transport_type: 'sse' }),
    ];
    const catalogStore = makeMockCatalogStore({ entries });
    vi.mocked(useStore).mockReturnValue({
      ai: { mcpCatalog: catalogStore },
    } as unknown as ReturnType<typeof useStore>);

    render(
      <MCPCatalogTabContent
        workspaceId="ws-1"
        installedServers={emptyInstalledServers}
        onInstall={mockOnInstall}
      />
    );

    // Click SSE first to filter
    await user.click(screen.getByRole('button', { name: 'SSE' }));
    expect(screen.queryByText('HTTP Entry')).not.toBeInTheDocument();

    // Click All to reset
    await user.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByText('HTTP Entry')).toBeInTheDocument();
    expect(screen.getByText('SSE Entry')).toBeInTheDocument();
  });

  it('shows error alert when catalogStore.error is set and entries are empty', () => {
    const catalogStore = makeMockCatalogStore({
      entries: [],
      error: 'Failed to load catalog',
    });
    vi.mocked(useStore).mockReturnValue({
      ai: { mcpCatalog: catalogStore },
    } as unknown as ReturnType<typeof useStore>);

    render(
      <MCPCatalogTabContent
        workspaceId="ws-1"
        installedServers={emptyInstalledServers}
        onInstall={mockOnInstall}
      />
    );

    // Both alert title "Failed to load catalog" and error description appear
    expect(screen.getAllByText('Failed to load catalog').length).toBeGreaterThan(0);
  });

  it('does NOT show error alert when entries are populated even if error set', () => {
    const catalogStore = makeMockCatalogStore({
      entries: [makeEntry()],
      error: 'Stale error',
    });
    vi.mocked(useStore).mockReturnValue({
      ai: { mcpCatalog: catalogStore },
    } as unknown as ReturnType<typeof useStore>);

    render(
      <MCPCatalogTabContent
        workspaceId="ws-1"
        installedServers={emptyInstalledServers}
        onInstall={mockOnInstall}
      />
    );

    expect(screen.queryByText('Stale error')).not.toBeInTheDocument();
  });
});
