import { type Locator, type Page, expect } from '@playwright/test';

/**
 * Page Object Model for the admin invitation manager page.
 * Route: /admin/tenant/invitations
 */
export class AdminInvitationManagerPage {
  readonly page: Page;
  readonly container: Locator;
  readonly title: Locator;
  readonly toggleFormButton: Locator;
  readonly loadingState: Locator;
  readonly emptyState: Locator;
  readonly activeInvitations: Locator;
  readonly expiredInvitations: Locator;

  // Create form
  readonly form: Locator;
  readonly formRole: Locator;
  readonly formEmail: Locator;
  readonly formExpires: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator('[data-testid="invitation-manager"]');
    this.title = page.locator('[data-testid="invitation-manager-title"]');
    this.toggleFormButton = page.locator('[data-testid="btn-toggle-form"]');
    this.loadingState = page.locator('[data-testid="invitation-loading"]');
    this.emptyState = page.locator('[data-testid="invitation-empty"]');
    this.activeInvitations = page.locator('[data-testid="active-invitations"]');
    this.expiredInvitations = page.locator('[data-testid="expired-invitations"]');

    // Create form
    this.form = page.locator('[data-testid="invitation-form"]');
    this.formRole = page.locator('[data-testid="form-role"]');
    this.formEmail = page.locator('[data-testid="form-email"]');
    this.formExpires = page.locator('[data-testid="form-expires"]');
    this.createButton = page.locator('[data-testid="btn-create-invitation"]');
  }

  async goto(): Promise<this> {
    await this.page.goto('/admin/tenant/invitations');
    await this.page.waitForLoadState('networkidle');
    return this;
  }

  async expectLoaded(): Promise<this> {
    await expect(this.container).toBeVisible();
    return this;
  }

  async expectEmpty(): Promise<this> {
    await expect(this.emptyState).toBeVisible();
    return this;
  }

  async openCreateForm(): Promise<this> {
    await this.toggleFormButton.click();
    await expect(this.form).toBeVisible();
    return this;
  }

  async closeCreateForm(): Promise<this> {
    await this.toggleFormButton.click();
    return this;
  }

  async selectRole(role: string): Promise<this> {
    await this.formRole.selectOption(role);
    return this;
  }

  async fillEmail(email: string): Promise<this> {
    await this.formEmail.fill(email);
    return this;
  }

  async setExpiry(dateTime: string): Promise<this> {
    await this.formExpires.fill(dateTime);
    return this;
  }

  async submitCreate(): Promise<this> {
    await this.createButton.click();
    return this;
  }

  // Invitation card interactions
  getInvitationCard(invId: string): Locator {
    return this.page.locator(`[data-testid="invitation-card-${invId}"]`);
  }

  getInvitationCode(invId: string): Locator {
    return this.page.locator(`[data-testid="inv-code-${invId}"]`);
  }

  getInvitationStatus(invId: string): Locator {
    return this.page.locator(`[data-testid="inv-status-${invId}"]`);
  }

  getInvitationLink(invId: string): Locator {
    return this.page.locator(`[data-testid="inv-link-${invId}"]`);
  }

  async copyLink(invId: string): Promise<this> {
    await this.page.locator(`[data-testid="btn-copy-${invId}"]`).click();
    return this;
  }

  async revokeInvitation(invId: string): Promise<this> {
    await this.page.locator(`[data-testid="btn-revoke-${invId}"]`).click();
    return this;
  }

  async toggleQrCode(invId: string): Promise<this> {
    await this.page.locator(`[data-testid="btn-qr-${invId}"]`).click();
    return this;
  }

  getQrCode(invId: string): Locator {
    return this.page.locator(`[data-testid="qr-code-${invId}"]`);
  }
}
