/**
 * Unit tests for SkillCreatorCard component.
 * Phase 64-03
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillCreatorCard } from '../SkillCreatorCard';

// Mock MonacoFileEditor (lazy-loaded) — not renderable in jsdom
vi.mock('@/features/code/components/MonacoFileEditor', () => ({
  default: function MockMonacoEditor(props: { content: string }) {
    return React.createElement('div', { 'data-testid': 'monaco-editor' }, props.content);
  },
}));

const defaultProps = {
  skillName: 'test-skill',
  frontmatter: { description: 'A test skill description' },
  content: '## Instructions\nDo something useful.',
  isUpdate: false,
};

describe('SkillCreatorCard', () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onTest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn();
    onTest = vi.fn();
  });

  it('renders skill name from props', () => {
    render(<SkillCreatorCard {...defaultProps} onSave={onSave} onTest={onTest} />);
    expect(screen.getByText('test-skill')).toBeInTheDocument();
  });

  it('renders description from frontmatter', () => {
    render(<SkillCreatorCard {...defaultProps} onSave={onSave} onTest={onTest} />);
    expect(screen.getByText('A test skill description')).toBeInTheDocument();
  });

  it('shows content in compact preview by default', () => {
    render(<SkillCreatorCard {...defaultProps} onSave={onSave} onTest={onTest} />);
    expect(screen.getByText(/Do something useful/)).toBeInTheDocument();
  });

  it('shows "Updated" badge when isUpdate=true', () => {
    render(<SkillCreatorCard {...defaultProps} isUpdate={true} onSave={onSave} onTest={onTest} />);
    expect(screen.getByText('Updated')).toBeInTheDocument();
  });

  it('shows "New" badge when isUpdate=false', () => {
    render(<SkillCreatorCard {...defaultProps} isUpdate={false} onSave={onSave} onTest={onTest} />);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('clicking Edit button opens modal with Monaco editor', async () => {
    const user = userEvent.setup();
    render(<SkillCreatorCard {...defaultProps} onSave={onSave} onTest={onTest} />);
    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByTestId('monaco-editor')).toBeInTheDocument();
  });

  it('calls onTest with current content when Test button clicked', async () => {
    const user = userEvent.setup();
    render(<SkillCreatorCard {...defaultProps} onSave={onSave} onTest={onTest} />);
    await user.click(screen.getByRole('button', { name: /test/i }));
    expect(onTest).toHaveBeenCalledWith(defaultProps.content);
  });

  it('calls onSave with current content when Save button clicked', async () => {
    const user = userEvent.setup();
    render(<SkillCreatorCard {...defaultProps} onSave={onSave} onTest={onTest} />);
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(defaultProps.content);
  });
});
