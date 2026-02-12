/**
 * localStorage helpers for E2E tests.
 * Zustand persist key: 'claude-hydra-v4-view'
 * Theme key: 'claude-hydra-theme'
 */

import type { Page } from '@playwright/test';

const VIEW_STORE_KEY = 'claude-hydra-v4-view';
const THEME_KEY = 'claude-hydra-theme';

/** Clear the Zustand view store from localStorage */
export async function clearViewStore(page: Page): Promise<void> {
  await page.evaluate((key) => localStorage.removeItem(key), VIEW_STORE_KEY);
}

/** Clear the theme preference from localStorage */
export async function clearTheme(page: Page): Promise<void> {
  await page.evaluate((key) => localStorage.removeItem(key), THEME_KEY);
}

/** Clear all ClaudeHydra localStorage keys */
export async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(
    ([vk, tk]) => {
      localStorage.removeItem(vk);
      localStorage.removeItem(tk);
    },
    [VIEW_STORE_KEY, THEME_KEY] as const,
  );
}

/** Get the currently stored theme mode */
export async function getStoredTheme(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), THEME_KEY);
}

/** Set theme mode in localStorage */
export async function setStoredTheme(page: Page, mode: 'dark' | 'light' | 'system'): Promise<void> {
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [THEME_KEY, mode] as const);
}

/** Get the data-theme attribute from <html> */
export async function getAppliedTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

/** Get meta theme-color content */
export async function getMetaThemeColor(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    return meta?.content ?? null;
  });
}
