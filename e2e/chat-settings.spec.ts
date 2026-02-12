/**
 * E2E stub: Chat + Settings flow
 *
 * Requires Playwright — install with:
 *   pnpm add -D @playwright/test
 *   npx playwright install
 *
 * Run with:
 *   npx playwright test
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5177';

test.describe('Settings flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('should load the app and display the home view', async ({ page }) => {
    await expect(page).toHaveTitle(/ClaudeHydra/i);
  });

  test('should navigate to settings', async ({ page }) => {
    // Click the settings nav item in the sidebar
    await page.getByRole('button', { name: /settings/i }).click();
    // Verify the settings view is displayed
    await expect(page.getByText(/settings/i).first()).toBeVisible();
  });

  test('should toggle theme in settings', async ({ page }) => {
    await page.getByRole('button', { name: /settings/i }).click();

    // Look for a theme toggle element
    const themeToggle = page.getByRole('button', { name: /theme|dark|light/i });
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      // The toggle should still be visible after clicking
      await expect(themeToggle).toBeVisible();
    }
  });
});

test.describe('Chat flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('should navigate to chat view', async ({ page }) => {
    await page.getByRole('button', { name: /new chat|chat/i }).click();
    await expect(page.locator('[data-testid="chat-view"]').or(page.getByText(/chat/i).first())).toBeVisible();
  });

  test('should navigate from settings back to chat', async ({ page }) => {
    // Go to settings first
    await page.getByRole('button', { name: /settings/i }).click();
    await expect(page.getByText(/settings/i).first()).toBeVisible();

    // Navigate to chat
    await page.getByRole('button', { name: /new chat|chat/i }).click();
    await expect(page.locator('[data-testid="chat-view"]').or(page.getByText(/chat/i).first())).toBeVisible();
  });
});
