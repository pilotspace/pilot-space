/**
 * Tests for MCPCatalogCard - catalog entry card with Install button.
 *
 * Behavioral contract:
 *   - Renders entry name, description, transport_type badge, auth_type badge
 *   - Renders "Official" badge when is_official=true
 *   - Install button calls onInstall(entry) when clicked
 *   - Install button is disabled with "Installed" label when isInstalled=true
 *   - "Update Available" badge (amber) visible when hasUpdate=true
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MCPCatalogCard } from '../mcp-catalog-card';
import type { McpCatalogEntry } from '@/services/api/mcp-catalog';

const makeCatalogEntry = (overrides?: Partial<McpCatalogEntry>): McpCatalogEntry => ({
  id: 'entry-1',
  name: 'Context7',
  description: 'Context7 MCP server for up-to-date documentation',
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

describe('MCPCatalogCard', () => {
  it('renders entry name and description', () => {
    render(
      <MCPCatalogCard
        entry={makeCatalogEntry()}
        isInstalled={false}
        hasUpdate={false}
        onInstall={vi.fn()}
      />
    );

    expect(screen.getByText('Context7')).toBeInTheDocument();
    expect(
      screen.getByText('Context7 MCP server for up-to-date documentation')
    ).toBeInTheDocument();
  });

  it('renders transport_type badge', () => {
    render(
      <MCPCatalogCard
        entry={makeCatalogEntry({ transport_type: 'http' })}
        isInstalled={false}
        hasUpdate={false}
        onInstall={vi.fn()}
      />
    );

    expect(screen.getByText('HTTP')).toBeInTheDocument();
  });

  it('renders auth_type badge', () => {
    render(
      <MCPCatalogCard
        entry={makeCatalogEntry({ auth_type: 'bearer' })}
        isInstalled={false}
        hasUpdate={false}
        onInstall={vi.fn()}
      />
    );

    expect(screen.getByText('Bearer')).toBeInTheDocument();
  });

  it('renders "Official" badge when is_official=true', () => {
    render(
      <MCPCatalogCard
        entry={makeCatalogEntry({ is_official: true })}
        isInstalled={false}
        hasUpdate={false}
        onInstall={vi.fn()}
      />
    );

    expect(screen.getByText('Official')).toBeInTheDocument();
  });

  it('does NOT render "Official" badge when is_official=false', () => {
    render(
      <MCPCatalogCard
        entry={makeCatalogEntry({ is_official: false })}
        isInstalled={false}
        hasUpdate={false}
        onInstall={vi.fn()}
      />
    );

    expect(screen.queryByText('Official')).not.toBeInTheDocument();
  });

  it('renders Install button that calls onInstall(entry) when clicked', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    const entry = makeCatalogEntry();

    render(
      <MCPCatalogCard entry={entry} isInstalled={false} hasUpdate={false} onInstall={onInstall} />
    );

    const installButton = screen.getByRole('button', { name: /install/i });
    expect(installButton).not.toBeDisabled();

    await user.click(installButton);

    expect(onInstall).toHaveBeenCalledWith(entry);
  });

  it('Install button is disabled and labeled "Installed" when isInstalled=true', () => {
    render(
      <MCPCatalogCard
        entry={makeCatalogEntry()}
        isInstalled={true}
        hasUpdate={false}
        onInstall={vi.fn()}
      />
    );

    const installedButton = screen.getByRole('button', { name: /installed/i });
    expect(installedButton).toBeDisabled();
  });

  it('renders "Update Available" badge when hasUpdate=true', () => {
    render(
      <MCPCatalogCard
        entry={makeCatalogEntry()}
        isInstalled={true}
        hasUpdate={true}
        onInstall={vi.fn()}
      />
    );

    expect(screen.getByText('Update Available')).toBeInTheDocument();
  });

  it('does NOT render "Update Available" badge when hasUpdate=false', () => {
    render(
      <MCPCatalogCard
        entry={makeCatalogEntry()}
        isInstalled={false}
        hasUpdate={false}
        onInstall={vi.fn()}
      />
    );

    expect(screen.queryByText('Update Available')).not.toBeInTheDocument();
  });
});
