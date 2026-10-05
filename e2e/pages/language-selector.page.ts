import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Page Object for the LanguageSelectorComponent.
 *
 * Wraps `data-testid="language-selector-*"` elements.
 * Used by i18n E2E tests to switch locale and verify translations.
 */
export class LanguageSelectorPage {
  readonly page: Page;
  readonly container: Locator;
  readonly trigger: Locator;
  readonly dropdown: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="language-selector"]');
    this.trigger = page.locator('[data-testid="language-selector-trigger"]');
    this.dropdown = page.locator('[data-testid="language-selector-dropdown"]');
  }

  /** Click the trigger to open the dropdown, then select the locale option. */
  async selectLocale(code: string): Promise<void> {
    await this.trigger.click();
    await expect(this.dropdown).toBeVisible();
    await this.dropdown.locator(`[data-testid="language-option-${code}"]`).click();
  }

  /** Returns the visible text of the trigger (the current locale's nativeName). */
  async getCurrentLocaleText(): Promise<string> {
    return (await this.trigger.textContent() ?? '').trim();
  }

  /** Assert the language selector component is rendered. */
  async expectVisible(): Promise<this> {
    await expect(this.container).toBeVisible();
    return this;
  }

  /** Assert the dropdown is open and shows options. */
  async expectDropdownOpen(): Promise<this> {
    await expect(this.dropdown).toBeVisible();
    return this;
  }

  /** Assert the dropdown is closed. */
  async expectDropdownClosed(): Promise<this> {
    await expect(this.dropdown).not.toBeVisible();
    return this;
  }

  /** Open the dropdown by clicking the trigger. */
  async open(): Promise<void> {
    await this.trigger.click();
  }

  /** Close the dropdown by pressing Escape on the trigger. */
  async close(): Promise<void> {
    await this.trigger.press('Escape');
  }
}
