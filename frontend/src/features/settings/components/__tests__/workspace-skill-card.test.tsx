/**
 * WorkspaceSkillCard tests — WRSKL-01, WRSKL-02
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { WorkspaceSkillCard } from '../workspace-skill-card';
import type { WorkspaceRoleSkill } from '@/services/api/workspace-role-skills';

const baseSkill: WorkspaceRoleSkill = {
  id: 'skill-1',
  workspaceId: 'ws-1',
  roleType: 'developer',
  roleName: 'Senior Developer',
  skillContent: 'You are a senior developer with 10 years of React experience.',
  experienceDescription: '10 years React',
  isActive: false,
  createdBy: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

describe('WorkspaceSkillCard', () => {
  it('renders Pending Review badge when is_active is false (WRSKL-02)', () => {
    render(<WorkspaceSkillCard skill={baseSkill} onActivate={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Pending Review')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('renders Active badge when is_active is true (WRSKL-02)', () => {
    const activeSkill = { ...baseSkill, isActive: true };
    render(<WorkspaceSkillCard skill={activeSkill} onActivate={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Pending Review')).not.toBeInTheDocument();
  });

  it('shows Activate button for pending skills (WRSKL-02)', () => {
    render(<WorkspaceSkillCard skill={baseSkill} onActivate={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument();
  });

  it('does not show Activate button for active skills (WRSKL-02)', () => {
    const activeSkill = { ...baseSkill, isActive: true };
    render(<WorkspaceSkillCard skill={activeSkill} onActivate={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument();
  });

  it('does not show Deactivate button for active skills (is_active is one-way)', () => {
    const activeSkill = { ...baseSkill, isActive: true };
    render(<WorkspaceSkillCard skill={activeSkill} onActivate={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument();
  });

  it('calls onActivate with skill id when Activate clicked (WRSKL-02)', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<WorkspaceSkillCard skill={baseSkill} onActivate={onActivate} onRemove={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Activate' }));
    expect(onActivate).toHaveBeenCalledWith('skill-1');
  });

  it('calls onRemove when Remove button clicked (WRSKL-01)', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<WorkspaceSkillCard skill={baseSkill} onActivate={vi.fn()} onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledWith('skill-1');
  });
});
