import { type Locator, type Page, expect } from '@playwright/test';

export class RegisterPage {
  readonly page: Page;
  readonly container: Locator;
  readonly emailInput: Locator;
  readonly nameInput: Locator;
  readonly submitButton: Locator;
  readonly loginLink: Locator;
  readonly errorAlert: Locator;
  readonly checkEmailSection: Locator;
  readonly resendButton: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="register-page"]');
    this.emailInput = page.locator('[data-testid="register-email"]');
    this.nameInput = page.locator('[data-testid="register-name"]');
    this.submitButton = page.locator('[data-testid="register-submit-btn"]');
    this.loginLink = page.locator('[data-testid="register-login-link"]');
    this.errorAlert = page.locator('[data-testid="register-error"]');
    this.checkEmailSection = page.locator('[data-testid="register-check-email"]');
    this.resendButton = page.locator('[data-testid="register-resend-btn"]');
    this.successMessage = page.locator('[data-testid="register-success"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/register');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async fillForm(email: string, name: string): Promise<this> {
    await this.emailInput.fill(email);
    await this.nameInput.fill(name);
    return this;
  }

  async submit(): Promise<this> {
    await this.submitButton.click();
    return this;
  }

  async navigateToLogin(): Promise<void> {
    await this.loginLink.click();
    await this.page.waitForURL('/login');
  }

  async expectFormVisible(): Promise<this> {
    await expect(this.container).toBeVisible();
    return this;
  }

  async expectCheckEmailVisible(): Promise<this> {
    await expect(this.checkEmailSection).toBeVisible();
    return this;
  }

  async expectError(): Promise<this> {
    await expect(this.errorAlert).toBeVisible();
    return this;
  }
}
