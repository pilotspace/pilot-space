/**
 * Unit tests for ModeSelector component (Phase 87 — Plan 01).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModeSelector } from '../ModeSelector';
import { CHAT_MODES } from '../types';

describe('ModeSelector', () => {
  it('renders 4 chips in order Plan, Act, Research, Draft', () => {
    render(<ModeSelector value="plan" onChange={() => {}} />);
    const chips = screen.getAllByRole('radio');
    expect(chips).toHaveLength(4);
    expect(chips.map((c) => c.getAttribute('data-mode-chip'))).toEqual([
      'plan',
      'act',
      'research',
      'draft',
    ]);
    expect(chips.map((c) => c.textContent)).toEqual(['Plan', 'Act', 'Research', 'Draft']);
  });

  it('marks the value chip aria-checked="true" and others "false"', () => {
    render(<ModeSelector value="research" onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Research' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    for (const m of CHAT_MODES.filter((m) => m !== 'research')) {
      expect(screen.getByRole('radio', { name: new RegExp(`^${m}$`, 'i') })).toHaveAttribute(
        'aria-checked',
        'false'
      );
    }
  });

  it('clicking a chip calls onChange exactly once with that mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModeSelector value="plan" onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Act' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('act');
  });

  it('ArrowRight from Plan moves focus to Act and triggers onChange("act")', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModeSelector value="plan" onChange={onChange} />);
    const planChip = screen.getByRole('radio', { name: 'Plan' });
    planChip.focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('act');
  });

  it('ArrowLeft from Plan wraps to Draft', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModeSelector value="plan" onChange={onChange} />);
    const planChip = screen.getByRole('radio', { name: 'Plan' });
    planChip.focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('draft');
  });

  it('container has role="radiogroup" and aria-label="Conversation mode"', () => {
    render(<ModeSelector value="plan" onChange={() => {}} />);
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('aria-label', 'Conversation mode');
    expect(group).toHaveAttribute('data-mode-selector');
  });

  it('active chip applies the per-mode active background class', () => {
    render(<ModeSelector value="act" onChange={() => {}} />);
    const actChip = screen.getByRole('radio', { name: 'Act' });
    expect(actChip.className).toMatch(/bg-\[#29a386\]/);
    expect(actChip.className).toMatch(/text-white/);
  });

  it('does not invoke onChange when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModeSelector value="plan" onChange={onChange} disabled />);
    await user.click(screen.getByRole('radio', { name: 'Act' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
