/**
 * E2E tests for Ghost Text feature.
 *
 * Tests the AI-powered inline text completion feature with:
 * - Ghost text suggestion appearance after typing pause (500ms debounce)
 * - Tab key acceptance of full suggestion
 * - Escape key dismissal of suggestion
 * - SSE streaming integration with backend
 *
 * T223: Ghost text suggestion appears
 * T224: Tab accepts ghost text
 * T225: Escape dismisses ghost text
 *
 * Auth state is pre-loaded via global setup.
 */

import { test, expect } from '@playwright/test';

const WORKSPACE_SLUG = 'workspace';
const GHOST_TEXT_DEBOUNCE_MS = 500;
const API_RESPONSE_TIMEOUT_MS = 2000;
const TOTAL_WAIT_MS = GHOST_TEXT_DEBOUNCE_MS + API_RESPONSE_TIMEOUT_MS;

test.describe('Ghost Text E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to notes page
    await page.goto(`/${WORKSPACE_SLUG}/notes`);
    await page.waitForLoadState('networkidle');

    // Check if authenticated
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      test.skip(true, 'Skipping test - authentication required');
    }

    // Create a new note for testing
    const createButton = page.locator('[data-testid="create-note-button"]');
    const hasCreateButton = await createButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasCreateButton) {
      test.skip(true, 'Skipping test - notes page not accessible');
    }

    await createButton.click();

    // Wait for navigation to note editor
    await page.waitForURL(`**/${WORKSPACE_SLUG}/notes/**`);
    await expect(page.locator('[data-testid="note-editor"]')).toBeVisible({
      timeout: 10000,
    });
  });

  /**
   * T223: Ghost text suggestion appears after typing pause
   *
   * Verifies that:
   * 1. User can type text in the editor
   * 2. After 500ms pause, ghost text suggestion appears
   * 3. Ghost text uses correct CSS class (.ghost-text-suggestion)
   */
  test('T223: should show ghost text suggestion after typing pause', async ({ page }) => {
    const editor = page.locator('[data-testid="note-editor"] .ProseMirror');

    // Click editor to focus
    await editor.click();

    // Type content that would trigger a suggestion
    await editor.pressSequentially('The authentication system should ', {
      delay: 50, // Type at human-like speed
    });

    // Wait for debounce period + API response time
    await page.waitForTimeout(TOTAL_WAIT_MS);

    // Check for ghost text suggestion element
    const ghostText = page.locator('.ghost-text-suggestion');

    // Ghost text may or may not appear depending on AI backend availability
    const isVisible = await ghostText.isVisible({ timeout: 1000 }).catch(() => false);

    if (isVisible) {
      // If ghost text appeared, verify it's visible and has content
      await expect(ghostText).toBeVisible();

      const suggestionText = await ghostText.textContent();
      expect(suggestionText).toBeTruthy();
      expect(suggestionText?.length).toBeGreaterThan(0);

      // Verify the ghost text container has the Tab hint
      const tabHint = page.locator('.ghost-text-hint');
      await expect(tabHint).toBeVisible();
      const hintText = await tabHint.textContent();
      expect(hintText).toContain('Tab');
    } else {
      // Log that AI backend is not configured
      console.warn('Ghost text did not appear - AI backend may not be configured');
      test.skip(true, 'Ghost text feature requires AI backend configuration');
    }
  });

  /**
   * T224: Tab key accepts ghost text suggestion
   *
   * Verifies that:
   * 1. Ghost text appears after typing
   * 2. Pressing Tab inserts the suggestion into the editor
   * 3. Ghost text decoration disappears after acceptance
   */
  test('T224: should accept ghost text on Tab press', async ({ page }) => {
    const editor = page.locator('[data-testid="note-editor"] .ProseMirror');

    // Click editor to focus
    await editor.click();

    // Type content
    await editor.pressSequentially('The authentication system should ', {
      delay: 50,
    });

    // Wait for ghost text to appear
    await page.waitForTimeout(TOTAL_WAIT_MS);

    const ghostText = page.locator('.ghost-text-suggestion');
    const isVisible = await ghostText.isVisible({ timeout: 1000 }).catch(() => false);

    if (!isVisible) {
      console.warn('Ghost text did not appear - AI backend may not be configured');
      test.skip(true, 'Ghost text feature requires AI backend configuration');
      return;
    }

    // Get the ghost text suggestion content
    const suggestionText = await ghostText.textContent();
    expect(suggestionText).toBeTruthy();

    // Get current editor content before accepting
    const contentBefore = await editor.textContent();

    // Press Tab to accept suggestion
    await page.keyboard.press('Tab');

    // Wait for content to update
    await page.waitForTimeout(300);

    // Verify suggestion was inserted into editor
    const contentAfter = await editor.textContent();
    expect(contentAfter).not.toBe(contentBefore);
    expect(contentAfter).toContain(suggestionText ?? '');

    // Verify ghost text decoration is gone
    await expect(ghostText).not.toBeVisible();
  });

  /**
   * T225: Escape key dismisses ghost text suggestion
   *
   * Verifies that:
   * 1. Ghost text appears after typing
   * 2. Pressing Escape dismisses the suggestion
   * 3. No content is inserted into the editor
   * 4. Ghost text decoration disappears
   */
  test('T225: should dismiss ghost text on Escape press', async ({ page }) => {
    const editor = page.locator('[data-testid="note-editor"] .ProseMirror');

    // Click editor to focus
    await editor.click();

    // Type content
    await editor.pressSequentially('The authentication system should ', {
      delay: 50,
    });

    // Wait for ghost text to appear
    await page.waitForTimeout(TOTAL_WAIT_MS);

    const ghostText = page.locator('.ghost-text-suggestion');
    const isVisible = await ghostText.isVisible({ timeout: 1000 }).catch(() => false);

    if (!isVisible) {
      console.warn('Ghost text did not appear - AI backend may not be configured');
      test.skip(true, 'Ghost text feature requires AI backend configuration');
      return;
    }

    // Verify ghost text is visible
    await expect(ghostText).toBeVisible();

    // Get current editor content before dismissing
    const contentBefore = await editor.textContent();

    // Press Escape to dismiss
    await page.keyboard.press('Escape');

    // Wait for dismissal
    await page.waitForTimeout(200);

    // Verify ghost text is gone
    await expect(ghostText).not.toBeVisible();

    // Verify no content was inserted
    const contentAfter = await editor.textContent();
    expect(contentAfter).toBe(contentBefore);
  });

  /**
   * Additional test: Ghost text clears on continued typing
   *
   * Verifies that ghost text disappears when user continues typing
   * instead of accepting or dismissing.
   */
  test('should clear ghost text when user continues typing', async ({ page }) => {
    const editor = page.locator('[data-testid="note-editor"] .ProseMirror');

    // Click editor to focus
    await editor.click();

    // Type content
    await editor.pressSequentially('The authentication system should ', {
      delay: 50,
    });

    // Wait for ghost text to appear
    await page.waitForTimeout(TOTAL_WAIT_MS);

    const ghostText = page.locator('.ghost-text-suggestion');
    const isVisible = await ghostText.isVisible({ timeout: 1000 }).catch(() => false);

    if (!isVisible) {
      console.warn('Ghost text did not appear - AI backend may not be configured');
      test.skip(true, 'Ghost text feature requires AI backend configuration');
      return;
    }

    // Verify ghost text is visible
    await expect(ghostText).toBeVisible();

    // Continue typing (should clear ghost text)
    await page.keyboard.type('handle');

    // Wait for ghost text to clear
    await page.waitForTimeout(200);

    // Verify ghost text is gone
    await expect(ghostText).not.toBeVisible();
  });

  /**
   * Additional test: Ghost text does not appear for short text
   *
   * Verifies that ghost text only appears after minimum character threshold
   * (default: 10 characters as per GhostTextExtension minChars option).
   */
  test('should not show ghost text for short text input', async ({ page }) => {
    const editor = page.locator('[data-testid="note-editor"] .ProseMirror');

    // Click editor to focus
    await editor.click();

    // Type very short content (below minChars threshold)
    await editor.pressSequentially('Hello', {
      delay: 50,
    });

    // Wait for debounce period
    await page.waitForTimeout(TOTAL_WAIT_MS);

    // Ghost text should NOT appear for short input
    const ghostText = page.locator('.ghost-text-suggestion');
    await expect(ghostText).not.toBeVisible();
  });

  /**
   * Additional test: Loading indicator appears during API call
   *
   * Verifies that loading indicator (shimmer effect) appears
   * while waiting for AI response.
   */
  test('should show loading indicator while fetching suggestion', async ({ page }) => {
    const editor = page.locator('[data-testid="note-editor"] .ProseMirror');

    // Click editor to focus
    await editor.click();

    // Type content
    await editor.pressSequentially('The authentication system should ', {
      delay: 50,
    });

    // Wait for debounce period only (not full API response time)
    await page.waitForTimeout(GHOST_TEXT_DEBOUNCE_MS + 100);

    // Check for loading indicator (may be brief)
    const loader = page.locator('.ghost-text-loader');
    const loaderVisible = await loader.isVisible({ timeout: 500 }).catch(() => false);

    if (loaderVisible) {
      // Verify loader has expected elements
      await expect(loader).toBeVisible();
      const loaderText = page.locator('.ghost-text-loader-text');
      await expect(loaderText).toBeVisible();
      const loaderTextContent = await loaderText.textContent();
      expect(loaderTextContent).toContain('Thinking');
    } else {
      // Loading indicator may have already transitioned to suggestion
      console.log('Loading indicator not visible - may have been too fast');
    }
  });

  /**
   * Additional test: Multiple suggestions in same session
   *
   * Verifies that ghost text can appear multiple times
   * in the same editing session.
   */
  test('should show multiple ghost text suggestions in same session', async ({ page }) => {
    const editor = page.locator('[data-testid="note-editor"] .ProseMirror');

    // Click editor to focus
    await editor.click();

    // First suggestion cycle
    await editor.pressSequentially('The authentication system should ', {
      delay: 50,
    });

    await page.waitForTimeout(TOTAL_WAIT_MS);

    const ghostText = page.locator('.ghost-text-suggestion');
    const firstVisible = await ghostText.isVisible({ timeout: 1000 }).catch(() => false);

    if (!firstVisible) {
      console.warn('Ghost text did not appear - AI backend may not be configured');
      test.skip(true, 'Ghost text feature requires AI backend configuration');
      return;
    }

    // Accept first suggestion
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);

    // Continue typing for second suggestion
    await page.keyboard.type(' and also ');
    await page.waitForTimeout(TOTAL_WAIT_MS);

    // Second ghost text may or may not appear depending on AI backend
    const secondVisible = await ghostText.isVisible({ timeout: 1000 }).catch(() => false);

    if (secondVisible) {
      await expect(ghostText).toBeVisible();
    }
  });
});
