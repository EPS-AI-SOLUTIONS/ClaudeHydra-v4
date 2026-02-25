/**
 * Chat view E2E tests for ClaudeHydra-v4.
 * Verifies chat UI elements, offline state indicators, and input controls.
 * Backend is NOT running — chat should display offline status throughout.
 */

import { test, expect } from './fixtures/base.fixture';
import { ChatPage } from './pages/ChatPage';
import { SidebarComponent } from './pages/SidebarComponent';
import { SEL } from './selectors/constants';

test.describe('Chat View', () => {
  let chat: ChatPage;
  let sidebar: SidebarComponent;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarComponent(page);
    chat = new ChatPage(page);

    // Navigate to chat view
    await page.locator(SEL.nav('chat')).click();
    await expect(page.locator(SEL.chatView)).toBeVisible({ timeout: 10_000 });
  });

  // ── View visibility ───────────────────────────────────────────────────

  test('should display the chat view', async () => {
    await expect(chat.root).toBeVisible();
  });

  // ── Header ────────────────────────────────────────────────────────────

  test('should show chat header with "Claude Chat" title', async () => {
    await expect(chat.header).toBeVisible();
    await expect(chat.header).toContainText('Claude Chat');
  });

  // ── Offline status ────────────────────────────────────────────────────

  test('should show offline status text "Offline — configure API key in Settings"', async () => {
    await expect(chat.statusText).toBeVisible();
    await expect(chat.statusText).toContainText('Offline');
    await expect(chat.statusText).toContainText('configure API key in Settings');
  });

  // ── Empty state ───────────────────────────────────────────────────────

  test('should display empty state with "Start a conversation" text', async () => {
    await expect(chat.emptyState).toBeVisible();
    await expect(chat.emptyState).toContainText('Start a conversation');
  });

  // ── Message area ──────────────────────────────────────────────────────

  test('should show the message area', async () => {
    await expect(chat.messageArea).toBeVisible();
  });

  // ── Textarea input (disabled when backend is offline) ─────────────────

  test('should have a disabled textarea when backend is offline', async () => {
    await expect(chat.textarea).toBeVisible();
    await expect(chat.textarea).toBeDisabled();
  });

  // ── Send button disabled ──────────────────────────────────────────────

  test('should have a disabled send button when empty', async () => {
    await expect(chat.sendBtn).toBeVisible();
    await expect(chat.sendBtn).toBeDisabled();
  });

  // ── Clear button ──────────────────────────────────────────────────────

  test('should have a clear button', async () => {
    await expect(chat.clearBtn).toBeVisible();
  });

  // ── Input area ────────────────────────────────────────────────────────

  test('should show chat input area', async () => {
    await expect(chat.inputArea).toBeVisible();
  });

  // ── Placeholder text ──────────────────────────────────────────────────

  test('should have textarea with correct placeholder text for offline state', async () => {
    const placeholder = await chat.textarea.getAttribute('placeholder');
    expect(placeholder).toContain('Configure API key in Settings');
  });
});
