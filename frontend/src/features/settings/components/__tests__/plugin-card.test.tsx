import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginCard } from '../plugin-card';
import type { InstalledPlugin, AvailablePlugin } from '@/stores/ai/PluginsStore';

const mockInstalled: InstalledPlugin = {
  id: 'p-1',
  workspace_id: 'ws-1',
  repo_url: 'https://github.com/org/skills',
  skill_name: 'code-review',
  display_name: 'Code Review',
  description: 'Reviews pull requests',
  installed_sha: 'abc12345',
  is_active: true,
  has_update: false,
};

const mockAvailable: AvailablePlugin = {
  skill_name: 'test-gen',
  display_name: 'Test Generator',
  description: 'Generates unit tests',
  repo_url: 'https://github.com/org/skills',
};

describe('PluginCard', () => {
  it('SKRG-04: shows orange Update Available chip when has_update is true', () => {
    const plugin = { ...mockInstalled, has_update: true };
    render(<PluginCard plugin={plugin} isInstalled onUpdate={() => {}} />);

    const badge = screen.getByTestId('badge-update');
    expect(badge).toHaveTextContent('Update Available');
    expect(badge.className).toContain('bg-orange-100');
  });

  it('SKRG-01: shows Installed badge when plugin is installed', () => {
    render(<PluginCard plugin={mockInstalled} isInstalled />);

    const badge = screen.getByTestId('badge-installed');
    expect(badge).toHaveTextContent('Installed');
  });

  it('SKRG-02: calls onInstall when Install button clicked', async () => {
    const user = userEvent.setup();
    const onInstall = vi.fn();
    render(<PluginCard plugin={mockAvailable} isInstalled={false} onInstall={onInstall} />);

    const button = screen.getByRole('button', { name: 'Install' });
    await user.click(button);

    expect(onInstall).toHaveBeenCalledOnce();
  });

  it('shows Update button when has_update and onUpdate provided', () => {
    const plugin = { ...mockInstalled, has_update: true };
    render(<PluginCard plugin={plugin} isInstalled onUpdate={() => {}} />);

    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });

  it('does not show Install button for installed plugin without update', () => {
    render(<PluginCard plugin={mockInstalled} isInstalled />);

    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('renders plugin display name and description', () => {
    render(<PluginCard plugin={mockAvailable} isInstalled={false} />);

    expect(screen.getByText('Test Generator')).toBeInTheDocument();
    expect(screen.getByText('Generates unit tests')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PluginCard plugin={mockInstalled} isInstalled onClick={onClick} />);

    const card = screen.getByTestId('plugin-card');
    await user.click(card);

    expect(onClick).toHaveBeenCalledOnce();
  });
});
