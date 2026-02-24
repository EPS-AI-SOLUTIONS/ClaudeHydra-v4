import { type Locator, type Page } from '@playwright/test';
import { SEL } from '../selectors/constants';
import { BasePage } from './BasePage';

export class SettingsPage extends BasePage {
  readonly viewTestId = 'settings-view';

  constructor(page: Page) {
    super(page);
  }

  get header(): Locator {
    return this.page.locator(SEL.settingsHeader);
  }

  get themeSelector(): Locator {
    return this.page.locator(SEL.settingsThemeSelector);
  }

  get modelSelector(): Locator {
    return this.page.locator(SEL.settingsModelSelector);
  }

  get autoStartToggle(): Locator {
    return this.page.locator(SEL.settingsAutoStartToggle);
  }

  get about(): Locator {
    return this.page.locator(SEL.settingsAbout);
  }

  themeOption(mode: string): Locator {
    return this.page.locator(SEL.settingsTheme(mode));
  }

  provider(id: string): Locator {
    return this.page.locator(SEL.settingsProvider(id));
  }

  async selectTheme(mode: 'dark' | 'light' | 'system'): Promise<void> {
    const option = this.themeOption(mode);
    // If the option is not visible, try to expand the section
    if (!(await option.isVisible())) {
      await this.expandSection('Appearance');
    }
    await option.click();
  }

  async toggleAutoStart(): Promise<void> {
    await this.expandSection('Auto-Start');
    await this.autoStartToggle.click();
  }

  async expandSection(titlePart: string): Promise<void> {
    // Find the section button by text
    const sectionBtn = this.page.locator(`button:has-text("${titlePart}")`).first();
    if (!(await sectionBtn.isVisible())) return;

    // Detect if section is already expanded.
    // CollapsibleSection uses AnimatePresence: when open, content is rendered in DOM;
    // when closed, it is removed entirely. The content area is a sibling div after
    // the button inside the same Card parent. We check if the button's parent
    // (the Card) has more than just the button — specifically a visible child
    // that is not the button itself.
    const isAlreadyOpen = await sectionBtn.evaluate((btn) => {
      // The button's parent is the Card div
      const card = btn.parentElement;
      if (!card) return false;
      // When expanded, there's a motion.div sibling after the button
      // that contains the content (with a border-t div inside)
      const siblings = Array.from(card.children);
      // If there are more visible children beyond the button, section is open
      return siblings.length > 1 && siblings.some((child, i) => {
        if (child === btn) return false;
        // Check that it's not collapsed (height > 0)
        const rect = child.getBoundingClientRect();
        return rect.height > 0;
      });
    });

    if (!isAlreadyOpen) {
      await sectionBtn.click();
      // Wait for AnimatePresence expand animation to complete
      await this.page.waitForTimeout(400);
    }
  }

  async isThemeActive(mode: string): Promise<boolean> {
    const option = this.themeOption(mode);
    const className = await option.getAttribute('class');
    return className?.includes('border-[var(--matrix-accent)]') ?? false;
  }

  async getProviderCount(): Promise<number> {
    return this.page.locator('[data-testid^="settings-provider-"]').count();
  }
}
