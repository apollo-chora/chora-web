/**
 * Phyllis A+ Login skeleton — visits `/a/login`, asserts the login form
 * renders, then runs an axe-core WCAG 2.1 AA scan.
 *
 * Public route, no auth needed. Acts as the smallest possible CI a11y gate
 * for the A+ surface entry point. Companion specs:
 *   - phyllis-roster.spec.ts        (R+ roster — Phyllis happy-path Step 10)
 *   - phyllis-quiz-builder.spec.ts  (R+ classroom quiz builder)
 */
import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/axe';

test.describe('A+ Login (public)', () => {
  test('renders login form and passes a11y scan', async ({ page }) => {
    await page.goto('/a/login');

    // Page wrapper
    await expect(page.getByTestId('aplus-login-page')).toBeVisible();

    // Form essentials
    await expect(page.getByTestId('aplus-login-email')).toBeVisible();
    await expect(page.getByTestId('aplus-login-password')).toBeVisible();

    // Federated IdP buttons (Google + Microsoft + Singpass) per
    // Identity Platform IdP — at least one must render.
    await expect(page.getByTestId('aplus-login-google-btn')).toBeVisible();

    await expectNoSeriousViolations(page, 'A+ login');
  });
});
