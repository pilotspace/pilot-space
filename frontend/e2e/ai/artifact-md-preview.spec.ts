/**
 * Phase 87.1 Plan 04 — E2E smoke for AI-generated MD/HTML artifact preview.
 *
 * Covers the user-facing payoff of the file-artifacts foundation:
 *   1. user asks the agent for a Markdown file
 *   2. an InlineArtifactCard appears live in the streaming message
 *   3. clicking the card opens the Peek drawer and renders the MD content
 *   4. reload re-hydrates the card from the persisted message envelope
 *
 * Plus a sandbox-invariant assertion for the HTML preview path
 * (T-87.1-04-01): iframe sandbox attribute equals empty string and never
 * contains 'allow-scripts'.
 *
 * NOTE: this is a smoke test. Backend AI provider must be reachable for the
 * end-to-end paths. If you see a timeout on the artifact card, suspect the
 * BYOK config or Anthropic credentials — the test is skipped automatically
 * if `E2E_AI_PROVIDER_AVAILABLE` is unset.
 */

import { test, expect } from '@playwright/test';

const SHOULD_RUN = process.env.E2E_AI_PROVIDER_AVAILABLE === '1';

test.describe('AI artifact preview — MD + HTML', () => {
  test.skip(
    !SHOULD_RUN,
    'AI provider not available in this CI lane (set E2E_AI_PROVIDER_AVAILABLE=1 to run)',
  );

  test.beforeEach(async ({ page }) => {
    await page.goto('/pilot-space-demo/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="chat-view"]', { timeout: 10_000 });
  });

  test('agent generates an MD file → card appears in stream → peek renders content', async ({
    page,
  }) => {
    await page
      .locator('[data-testid="chat-input"]')
      .fill(
        "Use create_file to make a markdown file titled hello.md with content '# Hello world\\n\\nThis is the demo.'",
      );
    await page.locator('[data-testid="send-button"]').click();

    // Inline artifact card appears live during the stream
    const card = page
      .locator('[data-inline-card], [data-testid="inline-artifact-card"]')
      .filter({ hasText: /hello\.md/i })
      .first();
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Click → peek drawer
    await card.click();
    const drawer = page.locator('[data-testid="peek-drawer-content"]');
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    // Body renders via MarkdownRenderer; "Hello world" appears as h1 text
    const renderer = page.locator('[data-testid="artifact-renderer"]');
    await expect(renderer).toBeVisible({ timeout: 10_000 });
    await expect(renderer).toContainText('Hello world', { timeout: 10_000 });

    // Close + reload → card re-renders from persisted envelope
    await page.locator('[data-testid="peek-drawer-close"]').click();
    await page.reload();
    await page.waitForSelector('[data-testid="chat-view"]', { timeout: 10_000 });

    const cardAfterReload = page
      .locator('[data-inline-card], [data-testid="inline-artifact-card"]')
      .filter({ hasText: /hello\.md/i })
      .first();
    await expect(cardAfterReload).toBeVisible({ timeout: 10_000 });
  });

  test('HTML preview iframe sandbox is empty (no allow-scripts)', async ({ page }) => {
    await page
      .locator('[data-testid="chat-input"]')
      .fill(
        "Use create_file to make an HTML file titled note.html with content '<p>safe content</p>'",
      );
    await page.locator('[data-testid="send-button"]').click();

    const card = page
      .locator('[data-inline-card], [data-testid="inline-artifact-card"]')
      .filter({ hasText: /note\.html/i })
      .first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();

    const drawer = page.locator('[data-testid="peek-drawer-content"]');
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    // Locate the preview iframe inside the renderer — HtmlRenderer mounts
    // it under the "Preview" tab which is the default mode.
    const iframe = drawer.locator('iframe').first();
    await expect(iframe).toBeVisible({ timeout: 10_000 });
    const sandbox = await iframe.getAttribute('sandbox');
    expect(sandbox).toBe('');
    expect(sandbox ?? '').not.toContain('allow-scripts');
  });
});
