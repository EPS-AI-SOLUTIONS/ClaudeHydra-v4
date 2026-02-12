import { type Locator, type Page } from '@playwright/test';
import { SEL } from '../selectors/constants';
import { BasePage } from './BasePage';

export class AgentsPage extends BasePage {
  readonly viewTestId = 'agents-view';

  constructor(page: Page) {
    super(page);
  }

  get header(): Locator {
    return this.page.locator(SEL.agentsHeader);
  }

  get onlineCount(): Locator {
    return this.page.locator(SEL.agentsOnlineCount);
  }

  get filterBar(): Locator {
    return this.page.locator(SEL.agentsFilterBar);
  }

  get grid(): Locator {
    return this.page.locator(SEL.agentsGrid);
  }

  filterButton(tier: string): Locator {
    return this.page.locator(SEL.agentsFilter(tier));
  }

  agentCard(id: string): Locator {
    return this.page.locator(SEL.agentCard(id));
  }

  async clickFilter(tier: string): Promise<void> {
    await this.filterButton(tier).click();
    // Wait for animation
    await this.page.waitForTimeout(400);
  }

  async getVisibleCardCount(): Promise<number> {
    await this.page.waitForTimeout(300);
    return this.grid.locator('[data-testid^="agent-card-"]').count();
  }

  async getOnlineCountText(): Promise<string> {
    return (await this.onlineCount.textContent()) ?? '';
  }
}
