/**
 * SidebarComponent — Page object for sidebar interactions.
 */

import { type Locator, type Page, expect } from '@playwright/test';
import { SEL } from '../selectors/constants';

export class SidebarComponent {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // --- Locators ---

  get sidebar(): Locator {
    return this.page.locator(SEL.sidebar);
  }

  get logo(): Locator {
    return this.page.locator(SEL.sidebarLogo);
  }

  get collapseToggle(): Locator {
    return this.page.locator(SEL.sidebarCollapseToggle);
  }

  get themeToggle(): Locator {
    return this.page.locator(SEL.sidebarThemeToggle);
  }

  get settingsBtn(): Locator {
    return this.page.locator(SEL.sidebarSettingsBtn);
  }

  get newChatBtn(): Locator {
    return this.page.locator(SEL.sidebarNewChatBtn);
  }

  get chatsToggle(): Locator {
    return this.page.locator(SEL.sidebarChatsToggle);
  }

  get sessionList(): Locator {
    return this.page.locator(SEL.sidebarSessionList);
  }

  get sessionItems(): Locator {
    return this.page.locator(SEL.sidebarSessionItem);
  }

  get version(): Locator {
    return this.page.locator(SEL.sidebarVersion);
  }

  // Mobile
  get hamburger(): Locator {
    return this.page.locator(SEL.mobileHamburger);
  }

  get mobileBackdrop(): Locator {
    return this.page.locator(SEL.mobileBackdrop);
  }

  get mobileDrawer(): Locator {
    return this.page.locator(SEL.mobileDrawer);
  }

  get mobileCloseBtn(): Locator {
    return this.page.locator(SEL.mobileCloseBtn);
  }

  // --- Navigation ---

  navButton(viewId: string): Locator {
    return this.page.locator(SEL.nav(viewId));
  }

  async navigateTo(viewId: string): Promise<void> {
    await this.navButton(viewId).click();
  }

  async clickLogo(): Promise<void> {
    await this.logo.click();
  }

  // --- Collapse/Expand ---

  async collapse(): Promise<void> {
    const width = await this.sidebar.evaluate((el) => el.getBoundingClientRect().width);
    if (width > 100) {
      await this.collapseToggle.click();
    }
  }

  async expand(): Promise<void> {
    const width = await this.sidebar.evaluate((el) => el.getBoundingClientRect().width);
    if (width < 100) {
      await this.collapseToggle.click();
    }
  }

  async toggleCollapse(): Promise<void> {
    await this.collapseToggle.click();
  }

  async isCollapsed(): Promise<boolean> {
    const width = await this.sidebar.evaluate((el) => el.getBoundingClientRect().width);
    return width < 100;
  }

  // --- Theme ---

  async clickThemeToggle(): Promise<void> {
    await this.themeToggle.click();
  }

  async getThemeLabel(): Promise<string> {
    return (await this.themeToggle.textContent()) ?? '';
  }

  // --- Sessions ---

  async clickNewChat(): Promise<void> {
    await this.newChatBtn.click();
  }

  async getSessionCount(): Promise<number> {
    // Wait briefly for session list to render
    await this.page.waitForTimeout(300);
    return this.sessionItems.count();
  }

  async getSessionTitles(): Promise<string[]> {
    await this.page.waitForTimeout(300);
    const items = this.sessionItems;
    const count = await items.count();
    const titles: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent();
      titles.push(text?.trim() ?? '');
    }
    return titles;
  }

  async clickSession(index: number): Promise<void> {
    await this.sessionItems.nth(index).click();
  }

  async deleteSession(index: number): Promise<void> {
    const item = this.sessionItems.nth(index);
    await item.hover();
    // Click delete button (Trash2 icon) — first click shows confirm, second deletes
    const deleteBtn = item.locator('button[title="Delete"], button[title="Click again to delete"]');
    await deleteBtn.click();
    await deleteBtn.click();
  }

  async renameSession(index: number, title: string): Promise<void> {
    const item = this.sessionItems.nth(index);
    await item.hover();
    // Click edit button
    const editBtn = item.locator('button[title="Rename"]');
    await editBtn.click();
    // Clear and type new title
    const input = this.page.locator('.glass-input').first();
    await input.fill(title);
    await input.press('Enter');
  }

  // --- Version ---

  async getVersion(): Promise<string> {
    return (await this.version.textContent()) ?? '';
  }

  // --- Mobile ---

  async openMobileDrawer(): Promise<void> {
    await this.hamburger.click();
    await expect(this.mobileBackdrop).toBeVisible();
  }

  async closeMobileDrawer(): Promise<void> {
    await this.mobileCloseBtn.click();
  }

  /**
   * Check if the mobile drawer is open by looking at the backdrop.
   * The drawer element is always in the DOM (using CSS transform to slide
   * off-screen), so checking its visibility directly is unreliable.
   * The backdrop is conditionally rendered and only present when the drawer
   * is open, making it a reliable open/closed indicator.
   */
  async isMobileDrawerOpen(): Promise<boolean> {
    return this.mobileBackdrop.isVisible();
  }

  /**
   * Assert the mobile drawer is in the open state.
   * Uses backdrop visibility as the indicator (see isMobileDrawerOpen).
   */
  async expectDrawerOpen(): Promise<void> {
    await expect(this.mobileBackdrop).toBeVisible();
  }

  /**
   * Assert the mobile drawer is in the closed state.
   * Uses backdrop visibility as the indicator (see isMobileDrawerOpen).
   */
  async expectDrawerClosed(): Promise<void> {
    await expect(this.mobileBackdrop).not.toBeVisible();
  }
}
