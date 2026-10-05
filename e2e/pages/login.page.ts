import { type Locator, type Page, expect } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly container: Locator;
  readonly emailInput: Locator;
  readonly passkeyButton: Locator;
  readonly googleButton: Locator;
  readonly microsoftButton: Locator;
  readonly registerLink: Locator;
  readonly errorAlert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="login-page"]');
    this.emailInput = page.locator('[data-testid="login-email"]');
    this.passkeyButton = page.locator('[data-testid="login-passkey-btn"]');
    this.googleButton = page.locator('[data-testid="login-google-btn"]');
    this.microsoftButton = page.locator('[data-testid="login-microsoft-btn"]');
    this.registerLink = page.locator('[data-testid="login-register-link"]');
    this.errorAlert = page.locator('[data-testid="login-error"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async fillEmail(email: string): Promise<this> {
    await this.emailInput.fill(email);
    return this;
  }

  async clickPasskey(): Promise<void> {
    await this.passkeyButton.click();
  }

  async clickGoogle(): Promise<void> {
    await this.googleButton.click();
  }

  async clickMicrosoft(): Promise<void> {
    await this.microsoftButton.click();
  }

  async navigateToRegister(): Promise<void> {
    await this.registerLink.click();
    await this.page.waitForURL('/register');
  }

  async expectVisible(): Promise<this> {
    await expect(this.container).toBeVisible();
    return this;
  }

  async expectError(message: string): Promise<this> {
    await expect(this.errorAlert).toBeVisible();
    await expect(this.errorAlert).toContainText(message);
    return this;
  }
}
