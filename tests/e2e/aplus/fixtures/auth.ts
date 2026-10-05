/**
 * Phyllis A+ journey — auth fixture.
 *
 * Posts a real Firebase ID token to the BFF `POST /api/v1/auth/session/mint`
 * endpoint and asserts it mints.
 *
 * ⚠ CORRECTED 2026-08-24. This file used to claim the mint sets an HttpOnly
 * `chora_session` cookie that "subsequent page navigations carry
 * automatically". IT DOES NOT. Measured against the deployed endpoint: the
 * response carries NO `Set-Cookie` at all and returns `access_token` in the
 * response BODY. The deployed SPA holds that token in an in-memory signal
 * (`core/auth/auth.service.ts`), so there is nothing here for a browser to
 * pick up.
 *
 * CONSEQUENCE, read before relying on this: calling `mintSession(page)` proves
 * the credential is valid and the mint endpoint is reachable. It does NOT sign
 * the browser in, so a spec that calls it and then navigates to a guarded `/a/*`
 * route is NOT authenticated. To actually sign a browser in to the deployed
 * surface, seed the Firebase SDK persistence record instead, before the first
 * navigation: see `tests/fixtures/firebase-session.ts`.
 *
 * Architectural rules (per CLAUDE.md + feedback_no_stubs_real_wiring):
 *   - NO mocks — this hits the real BFF (PLAYWRIGHT_BASE_URL env var).
 *   - Fails loud immediately if E2E_TEST_TOKEN is not set.
 *   - The test email must be on the `idp-google-email-allowlist` Secret Manager
 *     allowlist in chora-489812; coordinate with the infra team if the allowlist
 *     needs a new entry.
 *
 * Usage:
 *   import { mintSession } from './auth';
 *
 *   test.beforeEach(async ({ page }) => {
 *     await mintSession(page);
 *   });
 *
 * Local run (do NOT run `playwright test` locally per feedback_no_local_cicd_run;
 * this file exists for CI + manual one-shot validation under explicit approval):
 *   PLAYWRIGHT_BASE_URL=https://chora.site E2E_TEST_TOKEN=<firebase-id-token> \
 *     npx playwright test --grep @phyllis-aplus
 */

import { type Page } from '@playwright/test';

const BFF_MINT_PATH = '/api/v1/auth/session/mint';

/**
 * Assert that a Firebase ID token mints a Chora session at the BFF.
 *
 * Does NOT authenticate the browser (see the file header). Use
 * `seedFirebaseSession` from `tests/fixtures/firebase-session.ts` for that.
 *
 * Reads E2E_TEST_TOKEN from the environment. Throws immediately if the env
 * var is absent (fail-loud — never silently skip auth).
 *
 * @param page  Playwright Page instance.
 */
export async function mintSession(page: Page): Promise<void> {
  const token = process.env['E2E_TEST_TOKEN'];
  if (!token) {
    throw new Error(
      'E2E_TEST_TOKEN environment variable is not set. ' +
        'Set it to a valid Firebase ID token for the allowlisted test account. ' +
        'Obtain a token via: firebase auth:sign-in (CLI) or the firebase-admin SDK ' +
        'createCustomToken flow. The account email must be on the ' +
        'idp-google-email-allowlist Secret Manager secret in chora-489812.',
    );
  }

  const baseUrl = process.env['PLAYWRIGHT_BASE_URL'] ?? 'https://chora.site';
  const mintUrl = `${baseUrl.replace(/\/$/, '')}${BFF_MINT_PATH}`;

  // Playwright's request API would persist any response cookies into the
  // page's context, but the mint endpoint sets none (see the file header), so
  // this call validates the credential rather than establishing a session.
  const response = await page.request.post(mintUrl, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    data: { firebase_id_token: token },
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => '<unreadable>');
    throw new Error(
      `BFF session mint failed — status ${response.status()} from ${mintUrl}. ` +
        `Body: ${body}. ` +
        'Check that E2E_TEST_TOKEN is fresh (< 1h), the email is allowlisted, ' +
        'and the BFF at PLAYWRIGHT_BASE_URL is reachable.',
    );
  }
}
