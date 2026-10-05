import { test, expect } from '@playwright/test';
import { RegisterPage } from '../pages/register.page';
import { runAxeAudit } from '../fixtures/a11y.fixture';

test.describe('Registration flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('register page renders with form fields', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await registerPage.expectFormVisible();
    await expect(registerPage.emailInput).toBeVisible();
    await expect(registerPage.nameInput).toBeVisible();
    await expect(registerPage.submitButton).toBeVisible();
    await expect(registerPage.loginLink).toBeVisible();
  });

  test('form validation shows errors on empty submit', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    // Touch and submit empty form
    await registerPage.emailInput.click();
    await registerPage.nameInput.click();
    await registerPage.emailInput.click();
    await registerPage.submit();

    // Validation errors should appear (via Angular reactive form validation)
    const emailError = page.locator('#email-error');
    const nameError = page.locator('#name-error');
    await expect(emailError).toBeVisible();
    await expect(nameError).toBeVisible();
  });

  test('successful registration shows check-email step', async ({ page }) => {
    // Mock registration endpoint
    await page.route('**/api/v1/auth/register', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ gcid: 'gcid-new-001', message: 'Verification email sent' }),
      });
    });

    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillForm('new@test.chora.io', 'New Learner');
    await registerPage.submit();

    await registerPage.expectCheckEmailVisible();
    await expect(registerPage.resendButton).toBeVisible();
  });

  test('resend verification shows success message', async ({ page }) => {
    // First mock registration
    await page.route('**/api/v1/auth/register', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ gcid: 'gcid-new-001' }),
      });
    });

    // Mock resend
    await page.route('**/api/v1/auth/resend-verification', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Sent' }),
      });
    });

    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.fillForm('new@test.chora.io', 'New Learner');
    await registerPage.submit();
    await registerPage.expectCheckEmailVisible();

    await registerPage.resendButton.click();
    await expect(registerPage.successMessage).toBeVisible();
  });

  test('login link navigates to /login', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();
    await registerPage.navigateToLogin();

    await expect(page).toHaveURL(/\/login/);
  });

  test('register page passes accessibility audit', async ({ page }) => {
    const registerPage = new RegisterPage(page);
    await registerPage.goto();

    await runAxeAudit(page, 'Register page');
  });
});
