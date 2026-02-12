/**
 * BasePage — abstract base class for all page objects.
 * Provides common navigation and visibility helpers.
 */

import { type Locator, type Page, expect } from '@playwright/test';
import { SEL } from '../selectors/constants';

export abstract class BasePage {
  readonly page: Page;
  abstract readonly viewTestId: string;

  constructor(page: Page) {
    this.page = page;
  }

  get root(): Locator {
    return this.page.locator(`[data-testid="${this.viewTestId}"]`);
  }

  async waitForVisible(timeout = 10_000): Promise<void> {
    await expect(this.root).toBeVisible({ timeout });
  }

  async isVisible(): Promise<boolean> {
    return this.root.isVisible();
  }

  async navigateVia(navTestId: string): Promise<void> {
    await this.page.locator(SEL.nav(navTestId)).click();
    await this.waitForVisible();
  }
}
