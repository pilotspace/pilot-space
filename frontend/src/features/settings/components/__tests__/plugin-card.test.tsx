import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PluginCard } from '../plugin-card';
import type { PluginGroup } from '@/stores/ai/PluginsStore';

const makeGroup = (overrides?: Partial<PluginGroup>): PluginGroup => ({
  repoUrl: 'https://github.com/org/skills',
  repoName: 'skills',
  repoOwner: 'org',
  skills: [
    {
      id: 'p-1',
      workspace_id: 'ws-1',
      repo_url: 'https://github.com/org/skills',
      skill_name: 'code-review',
      display_name: 'Code Review',
      description: 'Reviews pull requests',
      installed_sha: 'abc12345',
      is_active: true,
      has_update: false,
    },
  ],
  skillCount: 1,
  activeCount: 1,
  hasUpdate: false,
  ...overrides,
});

describe('PluginCard', () => {
  it('renders plugin name and skill count', () => {
    const group = makeGroup({ skillCount: 3, activeCount: 3 });
    render(<PluginCard group={group} onToggle={vi.fn()} onClick={vi.fn()} />);

    expect(screen.getByText('skills')).toBeInTheDocument();
    expect(screen.getByText('3 skills')).toBeInTheDocument();
  });

  it('SKRG-04: shows Active badge when all skills are active', () => {
    const group = makeGroup({ skillCount: 2, activeCount: 2 });
    render(<PluginCard group={group} onToggle={vi.fn()} onClick={vi.fn()} />);

    expect(screen.getByTestId('badge-active')).toBeInTheDocument();
  });

  it('shows Partial badge when some skills are active', () => {
    const group = makeGroup({ skillCount: 3, activeCount: 1 });
    render(<PluginCard group={group} onToggle={vi.fn()} onClick={vi.fn()} />);

    expect(screen.getByTestId('badge-partial')).toBeInTheDocument();
  });

  it('SKRG-04: shows Update badge when update is available', () => {
    const group = makeGroup({ hasUpdate: true });
    render(<PluginCard group={group} onToggle={vi.fn()} onClick={vi.fn()} />);

    expect(screen.getByTestId('badge-update')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<PluginCard group={makeGroup()} onToggle={vi.fn()} onClick={onClick} />);

    await user.click(screen.getByTestId('plugin-card'));

    expect(onClick).toHaveBeenCalled();
  });

  it('calls onToggle when switch is toggled without triggering onClick', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onClick = vi.fn();
    render(<PluginCard group={makeGroup()} onToggle={onToggle} onClick={onClick} />);

    const toggle = screen.getByRole('switch');
    await user.click(toggle);

    expect(onToggle).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shows singular "skill" for single skill', () => {
    const group = makeGroup({ skillCount: 1, activeCount: 1 });
    render(<PluginCard group={group} onToggle={vi.fn()} onClick={vi.fn()} />);

    expect(screen.getByText('1 skill')).toBeInTheDocument();
  });
});
