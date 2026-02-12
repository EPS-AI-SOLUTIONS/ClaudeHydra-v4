/**
 * Agents view E2E tests for ClaudeHydra-v4.
 * Verifies agent grid rendering, tier filtering, and individual Witcher agent cards.
 * The swarm contains 12 hardcoded Witcher agents across 3 tiers:
 *   Commander (3), Coordinator (5), Executor (4).
 */

import { test, expect } from './fixtures/base.fixture';
import { AgentsPage } from './pages/AgentsPage';
import { SidebarComponent } from './pages/SidebarComponent';
import { SEL } from './selectors/constants';

test.describe('Agents View', () => {
  let agents: AgentsPage;
  let sidebar: SidebarComponent;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarComponent(page);
    agents = new AgentsPage(page);

    // Navigate to agents view
    await sidebar.navigateTo('agents');
    await expect(page.locator(SEL.agentsView)).toBeVisible({ timeout: 10_000 });
  });

  // ── View visibility ───────────────────────────────────────────────────

  test('should display the agents view', async () => {
    await expect(agents.root).toBeVisible();
  });

  // ── Header ────────────────────────────────────────────────────────────

  test('should show "Witcher Agent Swarm" header', async () => {
    await expect(agents.header).toBeVisible();
    await expect(agents.header).toContainText('Witcher Agent Swarm');
  });

  // ── Online count ──────────────────────────────────────────────────────

  test('should show online count', async () => {
    await expect(agents.onlineCount).toBeVisible();
    const text = await agents.getOnlineCountText();
    // Should display something like "X of 12 agents online"
    expect(text).toMatch(/\d+.*of.*12/i);
  });

  // ── Filter bar ────────────────────────────────────────────────────────

  test('should display filter bar with All, Commander, Coordinator, Executor buttons', async () => {
    await expect(agents.filterBar).toBeVisible();
    await expect(agents.filterButton('all')).toBeVisible();
    await expect(agents.filterButton('commander')).toBeVisible();
    await expect(agents.filterButton('coordinator')).toBeVisible();
    await expect(agents.filterButton('executor')).toBeVisible();
  });

  // ── All filter (default) ──────────────────────────────────────────────

  test('should show all 12 agent cards when "All" filter is active', async () => {
    const count = await agents.getVisibleCardCount();
    expect(count).toBe(12);
  });

  // ── Commander filter ──────────────────────────────────────────────────

  test('should filter to 3 cards when Commander is clicked', async ({ page }) => {
    await agents.clickFilter('commander');
    await page.waitForTimeout(500);

    const count = await agents.getVisibleCardCount();
    expect(count).toBe(3);
  });

  // ── Coordinator filter ────────────────────────────────────────────────

  test('should filter to 5 cards when Coordinator is clicked', async ({ page }) => {
    await agents.clickFilter('coordinator');
    await page.waitForTimeout(500);

    const count = await agents.getVisibleCardCount();
    expect(count).toBe(5);
  });

  // ── Executor filter ───────────────────────────────────────────────────

  test('should filter to 4 cards when Executor is clicked', async ({ page }) => {
    await agents.clickFilter('executor');
    await page.waitForTimeout(500);

    const count = await agents.getVisibleCardCount();
    expect(count).toBe(4);
  });

  // ── Individual agent cards ────────────────────────────────────────────

  test('should display Geralt agent card', async () => {
    await expect(agents.agentCard('geralt')).toBeVisible();
  });

  test('should display Yennefer agent card', async () => {
    await expect(agents.agentCard('yennefer')).toBeVisible();
  });

  // ── Card content ──────────────────────────────────────────────────────

  test('should show agent card with name, role text visible', async () => {
    const geraltCard = agents.agentCard('geralt');
    await expect(geraltCard).toBeVisible();

    // Card should contain the agent name
    await expect(geraltCard).toContainText('Geralt');

    // Card should contain a role/tier label
    const cardText = await geraltCard.textContent();
    expect(cardText).toBeTruthy();
    expect(
      cardText!.includes('Commander') ||
      cardText!.includes('Coordinator') ||
      cardText!.includes('Executor'),
    ).toBe(true);
  });

  // ── Back to All filter ────────────────────────────────────────────────

  test('should switch back to All filter and show 12 cards', async ({ page }) => {
    // First switch to a tier filter
    await agents.clickFilter('executor');
    await page.waitForTimeout(500);

    const filteredCount = await agents.getVisibleCardCount();
    expect(filteredCount).toBe(4);

    // Switch back to All
    await agents.clickFilter('all');
    await page.waitForTimeout(500);

    const allCount = await agents.getVisibleCardCount();
    expect(allCount).toBe(12);
  });
});
