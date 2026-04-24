/**
 * Phase 89 Plan 06 — VersionHistoryChip tests.
 *
 * Anatomy per 89-UI-SPEC §VersionHistoryChip:
 *   - Chip text format: "v{N} · {aiCount} AI · {userCount} you"
 *   - Empty history: "v{N} · just created"
 *   - Clicking opens a Radix Popover flyover with newest-first entries
 *   - Each entry: vN chip, who (AI|You), relative time, summary
 *   - Keyboard: Enter opens popover, Esc closes
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VersionHistoryChip } from '../VersionHistoryChip';
import type { VersionHistoryEntry } from '@/features/ai/proposals/types';

const ISO = (offsetMin: number): string =>
  new Date(Date.now() - offsetMin * 60_000).toISOString();

function entries(): VersionHistoryEntry[] {
  return [
    {
      vN: 1,
      by: 'ai',
      at: ISO(120),
      summary: 'Initial AI draft',
      snapshot: {},
    },
    {
      vN: 2,
      by: 'ai',
      at: ISO(45),
      summary: 'AI refined description',
      snapshot: {},
    },
    {
      vN: 3,
      by: 'user',
      at: ISO(5),
      summary: 'Reverted v3 → v2',
      snapshot: {},
    },
  ];
}

describe('VersionHistoryChip', () => {
  it('renders "v{N} · {aiCount} AI · {userCount} you" for a populated history', () => {
    render(<VersionHistoryChip versionNumber={3} versionHistory={entries()} />);
    expect(screen.getByTestId('version-history-chip-label')).toHaveTextContent(
      'v3 · 2 AI · 1 you'
    );
  });

  it('renders "v{N} · just created" for empty history', () => {
    render(<VersionHistoryChip versionNumber={1} versionHistory={[]} />);
    expect(screen.getByTestId('version-history-chip-label')).toHaveTextContent(
      'v1 · just created'
    );
  });

  it('clicking the chip opens a flyover popover listing entries newest first', async () => {
    render(<VersionHistoryChip versionNumber={3} versionHistory={entries()} />);
    await userEvent.click(screen.getByTestId('version-history-chip'));

    const list = await screen.findByTestId('version-history-list');
    expect(list).toBeInTheDocument();

    const rows = screen.getAllByTestId('version-history-entry');
    expect(rows).toHaveLength(3);
    // Newest first
    expect(rows[0]).toHaveTextContent('v3');
    expect(rows[0]).toHaveTextContent('You');
    expect(rows[0]).toHaveTextContent('Reverted v3 → v2');
    expect(rows[1]).toHaveTextContent('v2');
    expect(rows[1]).toHaveTextContent('AI');
    expect(rows[2]).toHaveTextContent('v1');
  });

  it('empty-state popover lists no entries', async () => {
    render(<VersionHistoryChip versionNumber={1} versionHistory={[]} />);
    await userEvent.click(screen.getByTestId('version-history-chip'));
    const popover = await screen.findByTestId('version-history-popover');
    expect(popover).toHaveTextContent(/no edits yet/i);
    expect(screen.queryByTestId('version-history-list')).not.toBeInTheDocument();
  });

  it('chip has an aria-label that fully describes the counts', () => {
    render(<VersionHistoryChip versionNumber={4} versionHistory={entries()} />);
    const chip = screen.getByTestId('version-history-chip');
    expect(chip).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/Version 4\.\s*2 edits by AI,\s*1 edit by you/i)
    );
  });

  it('popover is dismissed by pressing Escape', async () => {
    render(<VersionHistoryChip versionNumber={2} versionHistory={entries()} />);
    await userEvent.click(screen.getByTestId('version-history-chip'));
    await screen.findByTestId('version-history-popover');

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    });
    // The popover should unmount after Escape. Radix handles focus management.
    // We assert by querying: the popover may stay in the DOM briefly but the
    // role="dialog" should be gone for screen readers.
    // Use queryByRole — if Radix leaves it in the tree hidden, aria-hidden
    // filters it out.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
