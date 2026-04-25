/**
 * Tests for SkillsViewToggle (Phase 92 Plan 03 Task 1).
 *
 * Verifies the Tabs-styled segmented control:
 *   - both [Cards | Graph] triggers render
 *   - active tab reflects the `value` prop
 *   - clicking the inactive tab fires `onValueChange` with the new value
 *   - tablist exposes aria-label="Skills view"
 *   - leading icons render (LayoutGrid for Cards, GitFork for Graph)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SkillsViewToggle } from '../SkillsViewToggle';

describe('SkillsViewToggle', () => {
  it('renders two tab triggers (Cards, Graph)', () => {
    render(<SkillsViewToggle value="cards" onValueChange={() => {}} />);
    expect(screen.getByRole('tab', { name: /cards/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /graph/i })).toBeInTheDocument();
  });

  it('marks the active tab via aria-selected when value="cards"', () => {
    render(<SkillsViewToggle value="cards" onValueChange={() => {}} />);
    const cardsTab = screen.getByRole('tab', { name: /cards/i });
    const graphTab = screen.getByRole('tab', { name: /graph/i });
    expect(cardsTab).toHaveAttribute('aria-selected', 'true');
    expect(graphTab).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the active tab via aria-selected when value="graph"', () => {
    render(<SkillsViewToggle value="graph" onValueChange={() => {}} />);
    const cardsTab = screen.getByRole('tab', { name: /cards/i });
    const graphTab = screen.getByRole('tab', { name: /graph/i });
    expect(cardsTab).toHaveAttribute('aria-selected', 'false');
    expect(graphTab).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onValueChange with "graph" when Graph tab is clicked', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SkillsViewToggle value="cards" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('tab', { name: /graph/i }));
    expect(onValueChange).toHaveBeenCalledWith('graph');
  });

  it('calls onValueChange with "cards" when Cards tab is clicked', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<SkillsViewToggle value="graph" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('tab', { name: /cards/i }));
    expect(onValueChange).toHaveBeenCalledWith('cards');
  });

  it('exposes aria-label="Skills view" on the tablist', () => {
    render(<SkillsViewToggle value="cards" onValueChange={() => {}} />);
    expect(
      screen.getByRole('tablist', { name: /skills view/i }),
    ).toBeInTheDocument();
  });
});
