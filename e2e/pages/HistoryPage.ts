import { type Locator, type Page } from '@playwright/test';
import { SEL } from '../selectors/constants';
import { BasePage } from './BasePage';

export class HistoryPage extends BasePage {
  readonly viewTestId = 'history-view';

  constructor(page: Page) {
    super(page);
  }

  get header(): Locator {
    return this.page.locator(SEL.historyHeader);
  }

  get entryCount(): Locator {
    return this.page.locator(SEL.historyEntryCount);
  }

  get clearAllBtn(): Locator {
    return this.page.locator(SEL.historyClearAllBtn);
  }

  get searchInput(): Locator {
    return this.page.locator(SEL.historySearchInput);
  }

  get sortBtn(): Locator {
    return this.page.locator(SEL.historySortBtn);
  }

  get list(): Locator {
    return this.page.locator(SEL.historyList);
  }

  get emptyState(): Locator {
    return this.page.locator(SEL.historyEmptyState);
  }

  filterButton(status: string): Locator {
    return this.page.locator(SEL.historyFilter(status));
  }

  async clickFilter(status: string): Promise<void> {
    await this.filterButton(status).click();
    await this.page.waitForTimeout(300);
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(300);
  }

  async clearSearch(): Promise<void> {
    await this.searchInput.fill('');
    await this.page.waitForTimeout(300);
  }

  async toggleSort(): Promise<void> {
    await this.sortBtn.click();
    await this.page.waitForTimeout(300);
  }

  async getEntryCountText(): Promise<string> {
    return (await this.entryCount.textContent()) ?? '';
  }

  async getVisibleEntryCount(): Promise<number> {
    await this.page.waitForTimeout(300);
    // Each entry is a Card inside list
    return this.list.locator('[data-testid^=""]').locator('..').locator('> div').count();
  }

  async getSortButtonText(): Promise<string> {
    return (await this.sortBtn.textContent()) ?? '';
  }

  async clearAll(): Promise<void> {
    await this.clearAllBtn.click();
  }
}
