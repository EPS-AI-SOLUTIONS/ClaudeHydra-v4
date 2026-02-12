/**
 * Navigation E2E tests for ClaudeHydra-v4.
 * Verifies sidebar navigation, logo click, Home CTA routing, and active-nav highlighting.
 */

import { test, expect } from './fixtures/base.fixture';
import { SidebarComponent } from './pages/SidebarComponent';
import { HomePage } from './pages/HomePage';
import { SEL } from './selectors/constants';

test.describe('Navigation', () => {
  let sidebar: SidebarComponent;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarComponent(page);
  });

  // ── Sidebar navigation ──────────────────────────────────────────────

  test('should start on home view by default', async ({ page }) => {
    await expect(page.locator(SEL.homeView)).toBeVisible();
  });

  test('should navigate to chat via sidebar', async ({ page }) => {
    await sidebar.navigateTo('chat');
    await page.waitForTimeout(500);
    await expect(page.locator(SEL.chatView)).toBeVisible();
  });

  test('should navigate to agents via sidebar', async ({ page }) => {
    await sidebar.navigateTo('agents');
    await page.waitForTimeout(500);
    await expect(page.locator(SEL.agentsView)).toBeVisible();
  });

  test('should navigate to history via sidebar', async ({ page }) => {
    await sidebar.navigateTo('history');
    await page.waitForTimeout(500);
    await expect(page.locator(SEL.historyView)).toBeVisible();
  });

  test('should navigate to settings via sidebar', async ({ page }) => {
    await sidebar.navigateTo('settings');
    await page.waitForTimeout(500);
    await expect(page.locator(SEL.settingsView)).toBeVisible();
  });

  // ── Logo navigation ─────────────────────────────────────────────────

  test('should navigate back to home via logo click', async ({ page }) => {
    // First navigate away from home
    await sidebar.navigateTo('settings');
    await page.waitForTimeout(500);
    await expect(page.locator(SEL.settingsView)).toBeVisible();

    // Click logo to return home
    await sidebar.clickLogo();
    await page.waitForTimeout(500);
    await expect(page.locator(SEL.homeView)).toBeVisible();
  });

  // ── Home CTA navigation ─────────────────────────────────────────────

  test('should navigate to chat via Home CTA "Start Chat" button', async ({ page }) => {
    const home = new HomePage(page);
    await home.waitForVisible();

    await home.clickStartChat();
    await page.waitForTimeout(500);
    await expect(page.locator(SEL.chatView)).toBeVisible();
  });

  test('should navigate to agents via Home CTA "View Agents" button', async ({ page }) => {
    const home = new HomePage(page);
    await home.waitForVisible();

    await home.clickViewAgents();
    await page.waitForTimeout(500);
    await expect(page.locator(SEL.agentsView)).toBeVisible();
  });

  test('should navigate to settings via Home CTA "Settings" button', async ({ page }) => {
    const home = new HomePage(page);
    await home.waitForVisible();

    await home.clickSettings();
    await page.waitForTimeout(500);
    await expect(page.locator(SEL.settingsView)).toBeVisible();
  });

  // ── Active nav highlight ────────────────────────────────────────────

  test('should highlight active nav item', async ({ page }) => {
    // Navigate to agents and verify its nav button has the active styling
    await sidebar.navigateTo('agents');
    await page.waitForTimeout(500);

    const agentsNavBtn = sidebar.navButton('agents');
    await expect(agentsNavBtn).toBeVisible();

    // The active nav button should have the matrix-accent background class
    const className = await agentsNavBtn.getAttribute('class');
    expect(className).toContain('matrix-accent');

    // Other nav buttons should NOT have the active accent
    const homeNavBtn = sidebar.navButton('home');
    const homeClass = await homeNavBtn.getAttribute('class');
    expect(homeClass).not.toContain('matrix-accent');
  });
});
