import { type Locator, type Page, expect } from '@playwright/test';

export class CommunicationPage {
  readonly page: Page;

  // Notification preferences
  readonly notificationPreferences: Locator;
  readonly preferenceToggles: Locator;

  // Trigger rules
  readonly triggerRuleManager: Locator;
  readonly triggerRuleList: Locator;

  // Email templates
  readonly emailTemplateEditor: Locator;
  readonly templateList: Locator;

  constructor(page: Page) {
    this.page = page;

    this.notificationPreferences = page.locator('[data-testid="notification-preferences"]');
    this.preferenceToggles = page.locator('[data-testid^="pref-toggle"]');

    this.triggerRuleManager = page.locator('[data-testid="trigger-rule-manager"]');
    this.triggerRuleList = page.locator('[data-testid="trigger-rule-list"]');

    this.emailTemplateEditor = page.locator('[data-testid="email-template-editor"]');
    this.templateList = page.locator('[data-testid="template-list"]');
  }

  async gotoAdminPreferences(): Promise<this> {
    await this.page.goto('/admin/communication/preferences');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoLearnerPreferences(): Promise<this> {
    await this.page.goto('/settings/notifications');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoTriggerRules(): Promise<this> {
    await this.page.goto('/admin/communication/trigger-rules');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async gotoEmailTemplates(): Promise<this> {
    await this.page.goto('/admin/communication/email-templates');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectPreferencesLoaded(): Promise<this> {
    await expect(this.notificationPreferences).toBeVisible();
    return this;
  }

  async expectTriggerRulesLoaded(): Promise<this> {
    await expect(this.triggerRuleManager).toBeVisible();
    return this;
  }

  async expectEmailTemplatesLoaded(): Promise<this> {
    await expect(this.emailTemplateEditor).toBeVisible();
    return this;
  }

  async getPreferenceToggleCount(): Promise<number> {
    return this.preferenceToggles.count();
  }

  async getTriggerRuleCount(): Promise<number> {
    return this.triggerRuleList.locator('[data-testid^="trigger-rule-row"]').count();
  }

  async getTemplateCount(): Promise<number> {
    return this.templateList.locator('[data-testid^="template-row"]').count();
  }
}
