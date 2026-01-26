/**
 * E2E tests for PR Review feature (T229-T230).
 *
 * Tests PR review panel visibility and 5 review aspects display.
 */

import { test, expect } from '@playwright/test';

test.describe('PR Review', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to PR detail page - adjust route as needed based on actual routing
    await page.goto('/github/repo-1/prs/123');
    await page.waitForSelector('[data-testid="pr-detail"]', { timeout: 10000 });
  });

  // T229: PR review panel opens
  test('should open PR review panel', async ({ page }) => {
    // Verify PR review panel is visible
    const reviewPanel = page.locator('[data-testid="pr-review-panel"]');
    await expect(reviewPanel).toBeVisible();

    // Verify "Request AI Review" button is present
    const requestButton = page.locator('text=Request AI Review');
    await expect(requestButton).toBeVisible();
  });

  // T230: 5 aspects displayed
  test('should display all 5 review aspects after review', async ({ page }) => {
    // Click "Request AI Review" button
    await page.click('text=Request AI Review');

    // Wait for review completion (up to 120s timeout as per spec)
    await page.waitForSelector('[data-testid="review-result"]', { timeout: 120000 });

    // Verify all 5 review aspects are displayed
    const aspects = ['Architecture', 'Security', 'Quality', 'Performance', 'Documentation'];
    for (const aspect of aspects) {
      const aspectLocator = page.locator(`text=${aspect}`);
      await expect(aspectLocator).toBeVisible({
        timeout: 5000,
      });
    }

    // Verify overall summary is shown
    const reviewSummary = page.locator('[data-testid="review-summary"]');
    await expect(reviewSummary).toBeVisible();
  });
});
