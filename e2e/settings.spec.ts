import { test, expect } from './fixtures/base.fixture';
import { SettingsPage } from './pages/SettingsPage';
import { SidebarComponent } from './pages/SidebarComponent';
import { SEL } from './selectors/constants';

test.describe('Settings View', () => {
  let settingsPage: SettingsPage;
  let sidebar: SidebarComponent;

  test.beforeEach(async ({ page }) => {
    sidebar = new SidebarComponent(page);
    settingsPage = new SettingsPage(page);

    // Navigate to Settings view via sidebar
    await sidebar.navigateTo('settings');
    await settingsPage.waitForVisible();
  });

  test('should display the settings view', async ({ page }) => {
    await expect(page.locator(SEL.settingsView)).toBeVisible();
  });

  test('should show "Settings" header', async () => {
    await expect(settingsPage.header).toBeVisible();
    await expect(settingsPage.header).toHaveText('Settings');
  });

  test('should show Appearance section with theme selector', async ({ page }) => {
    // Appearance is defaultOpen, but expand just in case it was collapsed
    await settingsPage.expandSection('Appearance');
    await page.waitForTimeout(400);

    await expect(settingsPage.themeSelector).toBeVisible();
  });

  test('should show 3 theme options (dark, light, system)', async ({ page }) => {
    await settingsPage.expandSection('Appearance');
    await page.waitForTimeout(400);

    await expect(page.locator(SEL.settingsTheme('dark'))).toBeVisible();
    await expect(page.locator(SEL.settingsTheme('light'))).toBeVisible();
    await expect(page.locator(SEL.settingsTheme('system'))).toBeVisible();
  });

  test('should have dark theme active by default', async ({ page }) => {
    await settingsPage.expandSection('Appearance');
    await page.waitForTimeout(400);

    const isActive = await settingsPage.isThemeActive('dark');
    expect(isActive).toBe(true);
  });

  test('should switch to light theme when clicked', async ({ page }) => {
    await settingsPage.selectTheme('light');
    await page.waitForTimeout(400);

    const isLightActive = await settingsPage.isThemeActive('light');
    expect(isLightActive).toBe(true);

    // Dark should no longer be active
    const isDarkActive = await settingsPage.isThemeActive('dark');
    expect(isDarkActive).toBe(false);
  });

  test('should show Default Model section', async ({ page }) => {
    // Default Model is defaultOpen — verify its title button is visible
    const sectionBtn = page.locator('button:has-text("Default Model")').first();
    await expect(sectionBtn).toBeVisible();
  });

  test('should show model selector', async ({ page }) => {
    // Default Model section is defaultOpen, but expand to be safe
    await settingsPage.expandSection('Default Model');
    await page.waitForTimeout(400);

    await expect(settingsPage.modelSelector).toBeVisible();
  });

  test('should show Auto-Start section', async ({ page }) => {
    // Auto-Start is NOT defaultOpen — click to expand
    await page.locator('button:has-text("Auto-Start")').click();
    await page.waitForTimeout(400);

    // The toggle should now be visible inside the expanded section
    await expect(settingsPage.autoStartToggle).toBeVisible();
  });

  test('should toggle auto-start switch', async ({ page }) => {
    // Expand the Auto-Start section first
    await page.locator('button:has-text("Auto-Start")').click();
    await page.waitForTimeout(400);

    // Toggle auto-start on
    await settingsPage.autoStartToggle.click();
    await page.waitForTimeout(300);

    // The toggle button should reflect the active state (border changes to accent)
    const toggleClasses = await settingsPage.autoStartToggle.getAttribute('class');
    expect(toggleClasses).toContain('border-[var(--matrix-accent)]');

    // Toggle auto-start off
    await settingsPage.autoStartToggle.click();
    await page.waitForTimeout(300);

    const toggleClassesOff = await settingsPage.autoStartToggle.getAttribute('class');
    expect(toggleClassesOff).toContain('border-[var(--matrix-border)]');
  });

  test('should show AI Provider API Keys section', async ({ page }) => {
    // AI Provider API Keys is NOT defaultOpen — click to expand
    await page.locator('button:has-text("AI Provider API Keys")').click();
    await page.waitForTimeout(400);

    // Check that at least one provider is visible
    await expect(page.locator(SEL.settingsProvider('claude'))).toBeVisible();
  });

  test('should display all 8 providers', async ({ page }) => {
    // Expand the AI Provider API Keys section
    await page.locator('button:has-text("AI Provider API Keys")').click();
    await page.waitForTimeout(400);

    const providerIds = ['claude', 'openai', 'gemini', 'groq', 'mistral', 'ollama', 'openrouter', 'together'];

    for (const id of providerIds) {
      await expect(page.locator(SEL.settingsProvider(id))).toBeVisible();
    }

    // Verify total count of providers
    const providerCount = await settingsPage.getProviderCount();
    expect(providerCount).toBe(8);
  });

  test('should show About section with "ClaudeHydra v4.0.0" text', async ({ page }) => {
    await expect(settingsPage.about).toBeVisible();
    await expect(settingsPage.about).toHaveText('About');

    // The "About" Card also contains the version text below the heading
    const aboutCard = settingsPage.about.locator('..');
    await expect(aboutCard).toContainText('ClaudeHydra v4.0.0');
  });

  test('should show localStorage note about settings being saved', async ({ page }) => {
    // The save note Card is always visible (not inside a collapsible)
    await expect(page.locator('text=Settings are saved automatically to localStorage.')).toBeVisible();
    await expect(
      page.locator('text=API keys are stored locally in the browser'),
    ).toBeVisible();
  });
});
