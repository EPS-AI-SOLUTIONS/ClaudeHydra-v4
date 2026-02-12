import { test, expect } from './fixtures/base.fixture';
import { HistoryPage } from './pages/HistoryPage';
import { SidebarComponent } from './pages/SidebarComponent';
import { SEL } from './selectors/constants';

test.describe('History View', () => {
  let historyPage: HistoryPage;
  let sidebar: SidebarComponent;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarComponent(page);
    historyPage = new HistoryPage(page);

    // Navigate to History view via sidebar
    await sidebar.navigateTo('history');
    await historyPage.waitForVisible();
  });

  test('should display the history view', async ({ page }) => {
    await expect(page.locator(SEL.historyView)).toBeVisible();
  });

  test('should show "Approval History" header', async () => {
    await expect(historyPage.header).toBeVisible();
    await expect(historyPage.header).toHaveText('Approval History');
  });

  test('should display entry count "7 total entries"', async () => {
    await expect(historyPage.entryCount).toBeVisible();
    await expect(historyPage.entryCount).toHaveText('7 total entries');
  });

  test('should show search input', async ({ page }) => {
    await expect(page.locator(SEL.historySearchInput)).toBeVisible();
  });

  test('should show sort button with "Newest" text', async () => {
    await expect(historyPage.sortBtn).toBeVisible();
    const sortText = await historyPage.getSortButtonText();
    expect(sortText).toContain('Newest');
  });

  test('should display status filter buttons (All, Approved, Auto, Denied, Pending)', async ({ page }) => {
    const filters = ['all', 'approved', 'auto-approved', 'denied', 'pending'];
    for (const filter of filters) {
      await expect(page.locator(SEL.historyFilter(filter))).toBeVisible();
    }

    // Verify button labels
    await expect(page.locator(SEL.historyFilter('all'))).toHaveText('All');
    await expect(page.locator(SEL.historyFilter('approved'))).toHaveText('Approved');
    await expect(page.locator(SEL.historyFilter('auto-approved'))).toHaveText('Auto');
    await expect(page.locator(SEL.historyFilter('denied'))).toHaveText('Denied');
    await expect(page.locator(SEL.historyFilter('pending'))).toHaveText('Pending');
  });

  test('should show history list with entries', async ({ page }) => {
    await expect(page.locator(SEL.historyList)).toBeVisible();
    // There should be 7 Card entries rendered inside the list
    const cards = page.locator(SEL.historyList).locator('> div');
    await expect(cards).toHaveCount(7);
  });

  test('should filter to approved entries when Approved filter clicked', async ({ page }) => {
    await historyPage.clickFilter('approved');

    // approved entries: h1, h3, h6 = 3 entries
    const cards = page.locator(SEL.historyList).locator('> div');
    await expect(cards).toHaveCount(3);
  });

  test('should filter to denied entries when Denied filter clicked', async ({ page }) => {
    await historyPage.clickFilter('denied');

    // denied entries: h4 = 1 entry
    const cards = page.locator(SEL.historyList).locator('> div');
    await expect(cards).toHaveCount(1);
  });

  test('should search and filter entries by text "Geralt"', async ({ page }) => {
    await historyPage.search('Geralt');

    // Only h1 mentions Geralt (agentName and description)
    const cards = page.locator(SEL.historyList).locator('> div');
    await expect(cards).toHaveCount(1);

    // Verify the matching entry contains "Geralt"
    await expect(page.locator(SEL.historyList)).toContainText('Geralt');
  });

  test('should toggle sort order to "Oldest"', async () => {
    // Default is "Newest"
    let sortText = await historyPage.getSortButtonText();
    expect(sortText).toContain('Newest');

    // Toggle to "Oldest"
    await historyPage.toggleSort();

    sortText = await historyPage.getSortButtonText();
    expect(sortText).toContain('Oldest');
  });

  test('should show Clear All button', async () => {
    await expect(historyPage.clearAllBtn).toBeVisible();
    await expect(historyPage.clearAllBtn).toContainText('Clear All');
  });

  test('should clear all entries when Clear All is clicked, then show empty state', async ({ page }) => {
    // Click Clear All
    await historyPage.clearAll();
    await page.waitForTimeout(400);

    // History list should be gone, empty state should appear
    await expect(page.locator(SEL.historyList)).not.toBeVisible();
    await expect(page.locator(SEL.historyEmptyState)).toBeVisible();

    // Entry count should reflect 0
    await expect(historyPage.entryCount).toHaveText('0 total entries');
  });

  test('should return to all filter and show no entries after clear', async ({ page }) => {
    // Clear everything first
    await historyPage.clearAll();
    await page.waitForTimeout(400);

    // Click "All" filter to ensure we are on the default filter
    await historyPage.clickFilter('all');

    // Should still show empty state with 0 entries
    await expect(historyPage.entryCount).toHaveText('0 total entries');
    await expect(page.locator(SEL.historyList)).not.toBeVisible();
    await expect(page.locator(SEL.historyEmptyState)).toBeVisible();
  });
});
