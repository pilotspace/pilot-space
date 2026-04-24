import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppliedReceipt } from '../AppliedReceipt';
import { mockAppliedProposal } from '../fixtures/proposals';

describe('AppliedReceipt', () => {
  it('renders APPLIED badge + version delta + lines changed + relative time', () => {
    const decided = new Date('2026-04-24T12:00:00.000Z').getTime();
    const now = decided + 12_000; // 12s ago
    const envelope = mockAppliedProposal({
      appliedVersion: 4,
      decidedAt: new Date(decided).toISOString(),
    });
    render(<AppliedReceipt envelope={envelope} linesChanged={8} now={now} />);
    expect(screen.getByTestId('applied-badge')).toHaveTextContent(/applied/i);
    expect(screen.getByTestId('version-delta')).toHaveTextContent('v3 → v4');
    expect(screen.getByTestId('lines-changed')).toHaveTextContent('8 lines changed');
    expect(screen.getByTestId('relative-time')).toHaveTextContent('12s ago');
  });

  it('renders 14px corner radius + green tint fill', () => {
    render(<AppliedReceipt envelope={mockAppliedProposal()} linesChanged={3} />);
    const receipt = screen.getByTestId('applied-receipt');
    expect(receipt).toHaveClass('rounded-[14px]');
    // #29a38612 = rgba(41, 163, 134, 0.07) after jsdom normalization.
    expect(receipt.style.background).toMatch(/rgba\(41,\s*163,\s*134,\s*0\.0?7\)/);
  });

  it('shows Revert button when within 10-minute window + fires callback on click', async () => {
    const decided = new Date('2026-04-24T12:00:00.000Z').getTime();
    const now = decided + 5 * 60 * 1000; // 5 min ago — inside window
    const envelope = mockAppliedProposal({
      appliedVersion: 2,
      decidedAt: new Date(decided).toISOString(),
    });
    const onRevert = vi.fn();
    render(
      <AppliedReceipt envelope={envelope} linesChanged={1} onRevert={onRevert} now={now} />
    );
    const btn = screen.getByTestId('revert-button');
    await userEvent.click(btn);
    expect(onRevert).toHaveBeenCalledWith(envelope.id);
  });

  it('hides Revert button past the 10-minute window', () => {
    const decided = new Date('2026-04-24T12:00:00.000Z').getTime();
    const now = decided + 11 * 60 * 1000; // 11 min ago — outside window
    const envelope = mockAppliedProposal({
      decidedAt: new Date(decided).toISOString(),
    });
    render(
      <AppliedReceipt
        envelope={envelope}
        linesChanged={1}
        onRevert={() => {}}
        now={now}
      />
    );
    expect(screen.queryByTestId('revert-button')).not.toBeInTheDocument();
  });

  it('View diff button fires onViewDiff with target type + id', async () => {
    const envelope = mockAppliedProposal({
      targetArtifactType: 'ISSUE',
      targetArtifactId: 'issue-xyz',
    });
    const onViewDiff = vi.fn();
    render(
      <AppliedReceipt envelope={envelope} linesChanged={2} onViewDiff={onViewDiff} />
    );
    await userEvent.click(screen.getByTestId('view-diff-button'));
    expect(onViewDiff).toHaveBeenCalledWith('ISSUE', 'issue-xyz');
  });

  it('has role=status for a11y live region', () => {
    render(<AppliedReceipt envelope={mockAppliedProposal()} linesChanged={1} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
