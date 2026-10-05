/**
 * Browser session fixture for specs that drive the DEPLOYED A+ surface as a
 * signed-in learner.
 *
 * WHY THIS EXISTS. The deployed SPA holds its Chora session JWT in an
 * in-memory signal only (`core/auth/auth.service.ts`); nothing durable is
 * written for the session itself, and the `chora.dev.jwt` localStorage path is
 * `isDevMode()`-gated, so it is dead on a production bundle. The mint endpoint
 * returns the token in the response BODY and sets no cookie, so there is also
 * no cookie to carry over. On a cold load the app instead calls
 * `FirebaseAuthService.tryRestoreSession()` and, if Firebase restores a user,
 * re-mints a real Chora session against `POST /api/v1/auth/session/mint`.
 *
 * So the honest way to authenticate a browser against the deployed surface is
 * to give Firebase a real session to restore. This fixture writes the Firebase
 * Web SDK's own persistence record (the SDK is configured with
 * `browserLocalPersistence`, i.e. localStorage) before any app code runs. The
 * ID token is a genuine Firebase credential for an allowlisted account, and
 * everything downstream is real: the SDK restores, the app mints, the gateway
 * validates. NOTHING IS MOCKED, no route interception, no stubbed session.
 *
 * The refresh token is deliberately optional. Firebase restores from the
 * persisted `accessToken` while it is unexpired, and a CI-minted ID token is
 * always fresh, so the lane does not need to carry a refresh token to run this.
 *
 * Required env (the lane supplies these; see the `integration-journey` step in
 * `chora-web/cloudbuild-staging.yaml`, which already writes all three to
 * /workspace):
 *   E2E_FIREBASE_ID_TOKEN   Firebase ID token (RS256) for the allowlisted account
 *   E2E_FIREBASE_EMAIL      that account's email
 *   E2E_FIREBASE_UID        that account's Firebase uid
 * Optional:
 *   E2E_FIREBASE_REFRESH_TOKEN  persisted when present; not needed for a fresh token
 *   E2E_FIREBASE_API_KEY        overrides the committed public client key
 *
 * Fails loud if a required value is missing, a spec that cannot authenticate
 * must fail, never silently degrade to an anonymous run.
 */
import { type BrowserContext } from '@playwright/test';
import { environment } from '../../src/environments/environment.prod';

/** Firebase Web SDK default app name; part of its persistence key. */
const FIREBASE_APP_NAME = '[DEFAULT]';

/** Assumed lifetime of a freshly minted Firebase ID token. */
const ID_TOKEN_TTL_MS = 3_600_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Specs that sign in to the deployed surface need a real ` +
        `Firebase credential for an allowlisted account. The chora-web lane supplies ` +
        `it from scripts/mint-phyllis-jwt.py; see the integration-journey step in ` +
        `chora-web/cloudbuild-staging.yaml. Refusing to run rather than skip.`,
    );
  }
  return value;
}

/**
 * Seed the Firebase Web SDK persistence record so the deployed SPA restores a
 * real session and re-mints a real Chora token on first load.
 *
 * Must be called on the CONTEXT before the first navigation, the init script
 * has to land before app bootstrap reads localStorage.
 */
export async function seedFirebaseSession(context: BrowserContext): Promise<void> {
  const idToken = requireEnv('E2E_FIREBASE_ID_TOKEN');
  const email = requireEnv('E2E_FIREBASE_EMAIL');
  const uid = requireEnv('E2E_FIREBASE_UID');

  // The Firebase Web API key is public client configuration and is already
  // committed in the environment file, so it is read from there rather than
  // duplicated here (per feedback_no_inline_config).
  const apiKey = process.env['E2E_FIREBASE_API_KEY'] ?? environment.firebase?.apiKey;
  if (!apiKey) {
    throw new Error(
      'No Firebase API key: environment.prod.ts carries no firebase.apiKey and ' +
        'E2E_FIREBASE_API_KEY is unset.',
    );
  }

  const now = Date.now();
  const persistedUser = {
    uid,
    email,
    emailVerified: true,
    isAnonymous: false,
    providerData: [
      {
        providerId: 'password',
        uid: email,
        displayName: null,
        email,
        phoneNumber: null,
        photoURL: null,
      },
    ],
    stsTokenManager: {
      refreshToken: process.env['E2E_FIREBASE_REFRESH_TOKEN'] ?? '',
      accessToken: idToken,
      expirationTime: now + ID_TOKEN_TTL_MS,
    },
    createdAt: String(now - ID_TOKEN_TTL_MS),
    lastLoginAt: String(now),
    apiKey,
    appName: FIREBASE_APP_NAME,
  };

  const storageKey = `firebase:authUser:${apiKey}:${FIREBASE_APP_NAME}`;
  await context.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [storageKey, JSON.stringify(persistedUser)] as const,
  );
}
