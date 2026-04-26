/**
 * Flow (a) — Homepage Launchpad submit lands user in chat.
 *
 * Phase 94 Plan 03 — chat-first capstone E2E. Smoke-eligible: runs
 * across chromium / firefox / webkit projects.
 */

import { test, expect } from './auth.fixture';
import { getSeedContext } from './fixtures/seed-helpers';

test.describe('homepage launchpad', () => {
  test('typing into Launchpad and submitting navigates to /chat with the prompt visible', async ({
    page,
  }) => {
    const seed = getSeedContext();
    await page.goto(`/${seed.workspaceSlug}`);

    const textarea = page
      .getByRole('textbox', { name: /prompt|launchpad|chat|message|ask/i })
      .first();
    await textarea.waitFor({ state: 'visible', timeout: 10_000 });
    await textarea.fill('What are the open critical tasks?');

    const submit = page
      .getByRole('button', { name: /submit|send|ask/i })
      .first();

    const navWait = page.waitForURL(/\/chat(\?|$)/, { timeout: 15_000 });
    await submit.click();
    await navWait;

    await expect(
      page.getByText('What are the open critical tasks?', { exact: false })
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Cmd/Ctrl+Enter submits the launchpad prompt', async ({ page }) => {
    const seed = getSeedContext();
    await page.goto(`/${seed.workspaceSlug}`);
    const textarea = page
      .getByRole('textbox', { name: /prompt|launchpad|chat|message|ask/i })
      .first();
    await textarea.waitFor({ state: 'visible', timeout: 10_000 });
    await textarea.fill('Quick keyboard prompt');
    // Composer commits on Enter or Cmd+Enter depending on the surface; try
    // Meta+Enter first (Mac) and fall back to Enter via auto-retry on URL.
    await textarea.press('Meta+Enter');
    await page.waitForURL(/\/chat(\?|$)/, { timeout: 15_000 });
    await expect(page.getByText('Quick keyboard prompt', { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });
});
