import { type Locator, type Page } from '@playwright/test';
import { SEL } from '../selectors/constants';
import { BasePage } from './BasePage';

export class ChatPage extends BasePage {
  readonly viewTestId = 'chat-view';

  constructor(page: Page) {
    super(page);
  }

  get header(): Locator {
    return this.page.locator(SEL.chatHeader);
  }

  get statusText(): Locator {
    return this.page.locator(SEL.chatStatusText);
  }

  get emptyState(): Locator {
    return this.page.locator(SEL.chatEmptyState);
  }

  get messageArea(): Locator {
    return this.page.locator(SEL.chatMessageArea);
  }

  get streamingBar(): Locator {
    return this.page.locator(SEL.chatStreamingBar);
  }

  get clearBtn(): Locator {
    return this.page.locator(SEL.chatClearBtn);
  }

  get inputArea(): Locator {
    return this.page.locator(SEL.chatInputArea);
  }

  get textarea(): Locator {
    return this.page.locator(SEL.chatTextarea);
  }

  get sendBtn(): Locator {
    return this.page.locator(SEL.chatSendBtn);
  }

  get messageBubbles(): Locator {
    return this.page.locator(SEL.chatMessageBubble);
  }

  async getStatusText(): Promise<string> {
    return (await this.statusText.textContent()) ?? '';
  }

  async typeMessage(text: string): Promise<void> {
    await this.textarea.fill(text);
  }

  async isSendDisabled(): Promise<boolean> {
    return this.sendBtn.isDisabled();
  }

  async getMessageCount(): Promise<number> {
    return this.messageBubbles.count();
  }
}
