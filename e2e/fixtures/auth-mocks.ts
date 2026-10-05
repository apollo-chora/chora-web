import { type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// JWT Builder — creates a decodable JWT for AuthService.decodeJwtClaims()
// Signature is a dummy (no server-side validation in E2E mocks)
// ---------------------------------------------------------------------------

interface MockClaims {
  sub: string;
  email: string;
  display_name: string;
  tenant_id: string;
  roles: string[];
  capabilities: string[];
  exp: number;
}

function buildMockJwt(claims: MockClaims): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.mock-signature`;
}

// ---------------------------------------------------------------------------
// Role-specific JWT claims
// ---------------------------------------------------------------------------

const ROLE_CLAIMS: Record<string, MockClaims> = {
  learner: {
    sub: 'gcid-learner-001',
    email: 'learner@test.chora.io',
    display_name: 'Test Learner',
    tenant_id: 'tenant-001',
    roles: ['learner'],
    capabilities: ['atom:read', 'atom:answer', 'engagement:read'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  instructor: {
    sub: 'gcid-instructor-001',
    email: 'instructor@test.chora.io',
    display_name: 'Test Instructor',
    tenant_id: 'tenant-001',
    roles: ['instructor'],
    capabilities: ['atom:read', 'atom:answer', 'atom:publish', 'goal:create', 'class:manage'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  'tenant-admin': {
    sub: 'gcid-admin-001',
    email: 'admin@test.chora.io',
    display_name: 'Test Admin',
    tenant_id: 'tenant-001',
    roles: ['tenant_admin'],
    capabilities: ['atom:read', 'atom:publish', 'tenant:manage', 'user:manage'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
  'content-manager': {
    sub: 'gcid-cm-001',
    email: 'cm@test.chora.io',
    display_name: 'Test Content Manager',
    tenant_id: 'tenant-001',
    roles: ['content_manager'],
    capabilities: ['atom:read', 'atom:publish', 'content:moderate'],
    exp: Math.floor(Date.now() / 1000) + 3600,
  },
};

// Default add-ons enabled for tests
const DEFAULT_ADD_ONS = [
  'learner_engagement',
  'knowledge_graph',
  'CHORAVERSE',
  'social',
  'discovery_economy',
];

// Identity Platform Firebase Web apiKey — MUST match environment.prod.ts
// (`firebase.apiKey`), which is what the staging build (`ng build
// --configuration=production`) bundles. Public HTTP-referrer-restricted key,
// already committed in src/environments/*. Used to construct the Firebase Auth
// IndexedDB persistence key so the real authGuard path restores a session.
const FIREBASE_API_KEY = 'AIzaSyDJydlZo-gFAMI39RKXIs9w_o3uwY9DeKg';

/**
 * Seeds Firebase Auth's IndexedDB persistence (`firebaseLocalStorageDb` /
 * `firebaseLocalStorage`, key `firebase:authUser:{apiKey}:[DEFAULT]`) with a
 * non-expired user BEFORE the app boots, so `getAuth().currentUser` is restored
 * and `FirebaseAuthService.tryRestoreSession()` returns a token. This drives the
 * REAL auth path (AuthService.mintFromFirebase → POST /api/v1/auth/session/mint)
 * rather than adding any test backdoor to production code. CHO-1613.
 */
async function seedFirebaseSession(page: Page, claims: MockClaims): Promise<void> {
  const now = Date.now();
  const user = {
    uid: claims.sub,
    email: claims.email,
    emailVerified: true,
    displayName: claims.display_name,
    isAnonymous: false,
    photoURL: null,
    providerData: [
      {
        providerId: 'google.com',
        uid: claims.email,
        displayName: claims.display_name,
        email: claims.email,
        phoneNumber: null,
        photoURL: null,
      },
    ],
    stsTokenManager: {
      refreshToken: 'e2e-firebase-refresh-token',
      accessToken: 'e2e-firebase-id-token',
      // Far-future so getIdToken() returns the cached token with no network.
      expirationTime: now + 60 * 60 * 1000,
    },
    createdAt: String(now),
    lastLoginAt: String(now),
    apiKey: FIREBASE_API_KEY,
    appName: '[DEFAULT]',
  };

  await page.addInitScript(
    ({ apiKey, user: u }) => {
      try {
        const req = indexedDB.open('firebaseLocalStorageDb', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
            db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('firebaseLocalStorage', 'readwrite');
          tx.objectStore('firebaseLocalStorage').put({
            fbase_key: `firebase:authUser:${apiKey}:[DEFAULT]`,
            value: u,
          });
        };
      } catch {
        /* best-effort seed — guard falls through to /login if it fails */
      }
    },
    { apiKey: FIREBASE_API_KEY, user },
  );

  // Defensive: if Firebase proactively validates/refreshes the restored user,
  // keep those calls from invalidating it (getIdToken uses the cached token, so
  // these are usually never hit).
  await page.route('**/securetoken.googleapis.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-firebase-id-token',
        id_token: 'e2e-firebase-id-token',
        refresh_token: 'e2e-firebase-refresh-token',
        expires_in: '3600',
        token_type: 'Bearer',
      }),
    }),
  );
  await page.route('**/identitytoolkit.googleapis.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: [
          {
            localId: claims.sub,
            email: claims.email,
            emailVerified: true,
            displayName: claims.display_name,
          },
        ],
      }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sets up BFF auth mocks so the app initializes as an authenticated user.
 * Call in test.beforeEach() before navigating to any page.
 */
export async function mockAuthSession(
  page: Page,
  role: string = 'learner',
  addOns: string[] = DEFAULT_ADD_ONS,
): Promise<void> {
  const claims = ROLE_CLAIMS[role];
  if (!claims) {
    throw new Error(`Unknown test role: ${role}`);
  }

  const jwt = buildMockJwt(claims);

  // Seed Firebase Auth persistence so the real init path authenticates:
  // provideAppInitializer → AuthService.initialize() → mintFromFirebase →
  // FirebaseAuthService.tryRestoreSession() (now restores the seeded user) →
  // POST /api/v1/auth/session/mint (mocked below) → authGuard passes. CHO-1613.
  await seedFirebaseSession(page, claims);

  // Mock the Firebase→Chora session mint (the endpoint mintFromFirebase calls).
  await page.route('**/api/v1/auth/session/mint', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: jwt }),
    });
  });

  // Back-compat: legacy silent-refresh endpoint (no longer used by the Firebase
  // flow, retained so specs that pre-date the migration don't 404).
  await page.route('**/api/v1/auth/token/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ access_token: jwt }),
    });
  });

  // Mock logout
  await page.route('**/api/v1/auth/logout', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  // Mock tenant entitlements — consumed by FeatureFlagService
  await page.route('**/api/v1/tenants/current/entitlements', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled_add_ons: addOns }),
    });
  });
}

/**
 * Sets up BFF mocks for an unauthenticated session.
 * The refresh endpoint returns 401, causing AuthService to stay unauthenticated.
 */
export async function mockUnauthenticatedSession(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/token/refresh', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'IAM_UNAUTHORIZED', message: 'No valid session', details: {} },
      }),
    });
  });
}
