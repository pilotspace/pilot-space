/**
 * E2E tests for AI Context feature (T226-T228).
 *
 * Tests the AI Context generation workflow in issue detail pages:
 * - Opening AI context panel/sidebar
 * - Streaming progress through 5 phases
 * - Copying Claude Code prompts to clipboard
 */

import { test, expect } from '@playwright/test';

test.describe('AI Context', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to issues page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click on first issue to open detail page
    const issueCard = page.locator('[data-testid="issue-card"]').first();
    await issueCard.waitFor({ state: 'visible', timeout: 10000 });
    await issueCard.click();

    // Wait for issue detail page to load
    await page.waitForSelector('[data-testid="issue-detail"], h1', { timeout: 10000 });
  });

  // T226: AI context panel opens
  test('should open AI context panel on button click', async ({ page }) => {
    // Click AI context button in header or sidebar
    const aiContextButton = page.locator('[data-testid="ai-context-button"]');
    await aiContextButton.waitFor({ state: 'visible', timeout: 10000 });
    await aiContextButton.click();

    // Verify AI context panel/sidebar opens
    const aiContextPanel = page.locator(
      '[data-testid="ai-context-panel"], [data-testid="ai-context-sidebar"]'
    );
    await expect(aiContextPanel).toBeVisible({ timeout: 5000 });

    // Verify "Generate" or "Generate AI Context" button is visible
    const generateButton = page
      .locator('text=/Generate.*Context/i, [data-testid="generate-context-button"]')
      .first();
    await expect(generateButton).toBeVisible();
  });

  // T227: Streaming phases display
  test('should show streaming phases during generation', async ({ page }) => {
    // Open AI context panel
    const aiContextButton = page.locator('[data-testid="ai-context-button"]');
    await aiContextButton.waitFor({ state: 'visible', timeout: 10000 });
    await aiContextButton.click();

    // Click generate button
    const generateButton = page
      .locator('text=/Generate.*Context/i, [data-testid="generate-context-button"]')
      .first();
    await generateButton.waitFor({ state: 'visible', timeout: 5000 });
    await generateButton.click();

    // Should show streaming component with phases
    const streamingContainer = page.locator('text=/Generating.*Context/i').first();
    await expect(streamingContainer).toBeVisible({ timeout: 5000 });

    // Wait a bit for phases to start appearing
    await page.waitForTimeout(1000);

    // Check that phases are visible
    const phaseElements = page.locator(
      '[data-testid="ai-context-phase"], .phase-item, li:has-text("Analyzing")'
    );
    const phaseCount = await phaseElements.count();

    // Should have 5 phases
    expect(phaseCount).toBeGreaterThanOrEqual(5);

    // Wait for completion - increase timeout for long-running AI operation
    const resultSelector =
      '[data-testid="claude-code-prompt"], [data-testid="ai-context-result"], text=/Related Documents/i';
    await page.waitForSelector(resultSelector, { timeout: 60000 });

    // Verify all phases show complete status or check icons are visible
    const checkIcons = page.locator('svg.lucide-check, [data-status="complete"]');
    const completedCount = await checkIcons.count();
    expect(completedCount).toBeGreaterThanOrEqual(5);
  });

  // T228: Claude Code prompt copy
  test('should copy Claude Code prompt to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Open AI context panel
    const aiContextButton = page.locator('[data-testid="ai-context-button"]');
    await aiContextButton.waitFor({ state: 'visible', timeout: 10000 });
    await aiContextButton.click();

    // Generate context
    const generateButton = page
      .locator('text=/Generate.*Context/i, [data-testid="generate-context-button"]')
      .first();
    await generateButton.waitFor({ state: 'visible', timeout: 5000 });
    await generateButton.click();

    // Wait for Claude Code prompt card to appear
    const promptCard = page
      .locator('[data-testid="claude-code-prompt"], text=/Claude Code Prompt/i')
      .first();
    await expect(promptCard).toBeVisible({ timeout: 60000 });

    // Find and click copy button
    const copyButton = page
      .locator('[data-testid="copy-prompt-button"], button:has-text("Copy")')
      .first();
    await copyButton.waitFor({ state: 'visible', timeout: 5000 });
    await copyButton.click();

    // Verify clipboard contains prompt content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBeTruthy();
    expect(clipboardText.length).toBeGreaterThan(0);

    // Verify "Copied" feedback is shown
    const copiedFeedback = page.locator('text=/Copied/i').first();
    await expect(copiedFeedback).toBeVisible({ timeout: 3000 });
  });
});
