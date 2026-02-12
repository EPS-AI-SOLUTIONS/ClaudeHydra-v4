/**
 * Base test fixture for ClaudeHydra E2E tests.
 * Auto-clears localStorage and waits for app shell before each test.
 */

import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    // Navigate to app
    await page.goto('/');

    // Clear Zustand persist + theme storage for clean state
    await page.evaluate(() => {
      localStorage.removeItem('claude-hydra-v4-view');
      localStorage.removeItem('claude-hydra-theme');
    });

    // Reload to apply clean state
    await page.reload();

    // Wait for app shell to be visible
    await expect(page.locator('[data-testid="app-shell"]')).toBeVisible({ timeout: 15_000 });

    await use(page);
  },
});

export { expect };
