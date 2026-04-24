/**
 * Phase 88 Plan 02 — Task 3: SuggestedPromptsRow RED phase.
 *
 * Per UI-SPEC §5 + plan task 3 behavior:
 *  - Renders exactly 4 buttons with the locked labels (in order):
 *      1. "Draft a standup for me"
 *      2. "What's at risk today?"
 *      3. "Summarize last sprint"
 *      4. "Start a new topic"
 *  - Each <button type="button"> with aria-label="Use prompt: {label}"
 *  - Container has role="group" + aria-label="Suggested prompts"
 *  - Click invokes onPick(label) with the exact label string
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SuggestedPromptsRow } from '../components/SuggestedPromptsRow';

const LOCKED_PROMPTS = [
  'Draft a standup for me',
  "What's at risk today?",
  'Summarize last sprint',
  'Start a new topic',
] as const;

afterEach(() => cleanup());

describe('SuggestedPromptsRow (Phase 88 Plan 02 — UI-SPEC §5)', () => {
  it('renders exactly 4 buttons with the locked labels', () => {
    render(<SuggestedPromptsRow onPick={vi.fn()} />);

    for (const label of LOCKED_PROMPTS) {
      expect(
        screen.getByRole('button', { name: `Use prompt: ${label}` }),
      ).toBeInTheDocument();
    }

    const allButtons = screen.getAllByRole('button');
    expect(allButtons).toHaveLength(4);
  });

  it('container has role="group" with aria-label="Suggested prompts"', () => {
    render(<SuggestedPromptsRow onPick={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Suggested prompts' });
    expect(group).toBeInTheDocument();
  });

  it('each chip is a <button type="button">', () => {
    render(<SuggestedPromptsRow onPick={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    for (const btn of buttons) {
      expect(btn).toHaveAttribute('type', 'button');
    }
  });

  it.each(LOCKED_PROMPTS)('clicking "%s" invokes onPick with the label', async (label) => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    render(<SuggestedPromptsRow onPick={onPick} />);

    const btn = screen.getByRole('button', { name: `Use prompt: ${label}` });
    await user.click(btn);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(label);
  });

  it('renders prompts in the locked display order', () => {
    render(<SuggestedPromptsRow onPick={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([...LOCKED_PROMPTS]);
  });
});
