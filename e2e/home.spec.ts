/**
 * Home view E2E tests for ClaudeHydra-v4.
 * Verifies the glass card, title, subtitle, version badge, feature badges,
 * feature cards, and CTA buttons on the default landing view.
 */

import { test, expect } from './fixtures/base.fixture';
import { HomePage } from './pages/HomePage';
import { SEL } from './selectors/constants';

test.describe('Home View', () => {
  let home: HomePage;

  test.beforeEach(async ({ page }) => {
    home = new HomePage(page);
    await home.waitForVisible();
  });

  // ── Layout ──────────────────────────────────────────────────────────

  test('should display the glass card container', async () => {
    await expect(home.glassCard).toBeVisible();
  });

  // ── Title & subtitle ───────────────────────────────────────────────

  test('should show ClaudeHydra title', async () => {
    await expect(home.title).toBeVisible();
    await expect(home.title).toContainText('ClaudeHydra');
  });

  test('should show "AI Swarm Control Center" subtitle', async () => {
    await expect(home.subtitle).toBeVisible();
    await expect(home.subtitle).toContainText('AI Swarm Control Center');
  });

  // ── Version badge ──────────────────────────────────────────────────

  test('should display version badge with "v4.0.0"', async () => {
    await expect(home.versionBadge).toBeVisible();
    await expect(home.versionBadge).toContainText('v4.0.0');
  });

  // ── Feature badges ─────────────────────────────────────────────────

  test('should show all 6 feature badges', async () => {
    await expect(home.featureBadges).toBeVisible();

    const expectedBadges = [
      '12 Agents',
      'Claude + Ollama',
      'MCP Integration',
      'Streaming Chat',
      'Swarm AI',
      'Local LLMs',
    ];

    const badgeTexts = await home.getFeatureBadgeTexts();
    for (const label of expectedBadges) {
      expect(badgeTexts).toContainEqual(expect.stringContaining(label));
    }
  });

  // ── Feature cards ──────────────────────────────────────────────────

  test('should display 3 feature cards', async ({ page }) => {
    await expect(home.featureCards).toBeVisible();

    // Each feature card is a direct child div inside the feature-cards container
    const cards = home.featureCards.locator('> div');
    await expect(cards).toHaveCount(3);

    // Verify card content mentions the three features
    const cardsText = await home.featureCards.textContent();
    expect(cardsText).toContain('Swarm AI');
    expect(cardsText).toContain('Ollama');
    expect(cardsText).toContain('MCP');
  });

  // ── CTA buttons ────────────────────────────────────────────────────

  test('should show 3 CTA buttons', async () => {
    await expect(home.ctaStartChat).toBeVisible();
    await expect(home.ctaViewAgents).toBeVisible();
    await expect(home.ctaSettings).toBeVisible();

    await expect(home.ctaStartChat).toContainText('Start Chat');
    await expect(home.ctaViewAgents).toContainText('View Agents');
    await expect(home.ctaSettings).toContainText('Settings');
  });

  test('should have visible CTA buttons that are clickable', async () => {
    await expect(home.ctaStartChat).toBeVisible();
    await expect(home.ctaStartChat).toBeEnabled();

    await expect(home.ctaViewAgents).toBeVisible();
    await expect(home.ctaViewAgents).toBeEnabled();

    await expect(home.ctaSettings).toBeVisible();
    await expect(home.ctaSettings).toBeEnabled();
  });
});
