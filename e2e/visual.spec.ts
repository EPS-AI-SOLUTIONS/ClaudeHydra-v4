import { test, expect } from './test';

test('home view visual regression', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('home.png', { maxDiffPixelRatio: 0.02 });
});

test('dark theme visual', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('home-dark.png', { maxDiffPixelRatio: 0.02 });
});

test('light theme visual', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('home-light.png', { maxDiffPixelRatio: 0.02 });
});

test('swarm builder visual regression', async ({ page }) => {
  await page.goto('/');
  const swarmNav = page.locator('[data-testid="nav-swarm"]');
  if (await swarmNav.isVisible()) {
    await swarmNav.click();
  } else {
    const swarmBtn = page.locator('button', { hasText: 'Swarm' });
    if (await swarmBtn.isVisible()) {
      await swarmBtn.click();
    }
  }
  await page.waitForTimeout(1000);
  const builderTab = page.locator('button', { hasText: 'Swarm Builder' });
  if (await builderTab.isVisible()) {
    await builderTab.click();
    await page.waitForTimeout(1000); // let canvas load
  }
  // take screenshot of just the body or app shell if possible to avoid flaky animations
  await expect(page).toHaveScreenshot('swarm-builder.png', { maxDiffPixelRatio: 0.05 });
});
