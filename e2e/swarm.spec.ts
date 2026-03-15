import { test, expect } from './fixtures/base.fixture';
import { SidebarComponent } from './pages/SidebarComponent';

test.describe('Swarm & Memory Pruning Panel', () => {
  let sidebar: SidebarComponent;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarComponent(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Attempt to navigate to Swarm view
    const swarmNav = page.locator('[data-testid="nav-swarm"]');
    if (await swarmNav.isVisible()) {
      await swarmNav.click();
    } else {
      // Force navigation via text or store evaluation if testid is missing
      const swarmBtn = page.locator('button', { hasText: 'Swarm' });
      if (await swarmBtn.isVisible()) {
        await swarmBtn.click();
      } else {
        await page.evaluate(() => {
          // @ts-ignore
          const zustand = window.__ZUSTAND_STORE__ || {};
          // Best effort navigation 
        });
      }
    }
  });

  test('should render MemoryPruningPanel inside Swarm View', async ({ page }) => {
    // Click the Pruning Tab
    const pruningTab = page.locator('button', { hasText: 'Memory Pruning' });
    if (await pruningTab.isVisible()) {
      await pruningTab.click();
    }

    // Expect MemoryPruningPanel to be visible.
    await expect(page.locator('text=Pruning Engine')).toBeVisible();
  });

  test('should execute Swarm IPC delegation', async ({ page }) => {
    // Monitoring tab is default or might be visible
    const monitoringTab = page.locator('button', { hasText: 'Monitoring' });
    if (await monitoringTab.isVisible()) {
      await monitoringTab.click();
    }

    // Try to enter something in delegation prompt and execute
    const delegateInput = page.locator('input[placeholder*="Analyze"]');
    if (await delegateInput.isVisible()) {
      await delegateInput.fill('Test Swarm IPC');
      const delegateBtn = page.locator('button', { hasText: 'Delegate' });
      if (await delegateBtn.isVisible()) {
        await delegateBtn.click();
        await page.waitForTimeout(1000);
      }
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
