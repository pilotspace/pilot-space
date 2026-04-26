/**
 * Flow (c) — Edit Proposal Accept mutates artifact and renders AppliedReceipt.
 *
 * Phase 94 Plan 03 — depends on seeded `pendingProposalId` and the chat
 * session that hosts it. Skips with TODO until global-setup writes those
 * ids. Accept hits POST /proposals/{id}/accept (NOT /apply — verified
 * via frontend/src/features/ai/proposals/proposalApi.ts).
 */

import { test, expect } from './auth.fixture';
import { getSeedContext } from './fixtures/seed-helpers';
import { waitForApiResponse } from './fixtures/sse-helpers';

test.describe('edit proposal accept', () => {
  test('Approve round-trips through /accept, mutates artifact, AppliedReceipt with revert button renders', async ({
    page,
  }) => {
    const seed = getSeedContext();
    test.skip(
      !seed.pendingProposalId || !seed.chatSessionId,
      'TODO(94-03): global-setup must seed a pending EditProposal ' +
        'targeting a known task before this spec can run end-to-end.'
    );

    await page.goto(
      `/${seed.workspaceSlug}/chat?session=${seed.chatSessionId}`
    );

    const card = page.locator(`[data-proposal-id="${seed.pendingProposalId}"]`);
    await expect(card).toBeVisible({ timeout: 10_000 });

    const approve = card.getByRole('button', { name: /approve|accept/i }).first();

    // Capture the network handshake BEFORE clicking.
    const apiPromise = waitForApiResponse(
      page,
      `/proposals/${seed.pendingProposalId}/accept`,
      { expectedStatus: 200, timeoutMs: 10_000 }
    );

    await approve.click();
    await apiPromise;

    // AppliedReceipt: contains an "Applied" indicator + a revert button.
    await expect(card.getByText(/applied/i)).toBeVisible({ timeout: 5_000 });
    await expect(card.getByRole('button', { name: /revert|undo/i })).toBeVisible();
  });
});
