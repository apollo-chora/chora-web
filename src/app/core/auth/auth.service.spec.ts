import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';

import { AuthService, AuthUser } from './auth.service';
import { AuthTokenResponse } from './auth.models';
import { TenantContextService } from './tenant-context.service';
import { PasswordAuthService } from './password-auth.service';
import { FeatureFlagService } from '../services/feature-flag.service';

/** TestBed stub for PasswordAuthService — AuthService no longer depends on
 *  it directly, but the provider keeps the DI graph explicit. */
class PasswordAuthStub {
  isConfigured = vi.fn().mockReturnValue(true);
  signInWithPassword = vi.fn();
  signOut = vi.fn().mockResolvedValue(undefined);
}

function createJwt(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.fake-signature`;
}

/**
 * The same JWT, built the way a real HS256 minter builds one: serialise the
 * claims, encode THAT to UTF-8 bytes, then base64 the bytes.
 *
 * `createJwt` above cannot express this case at all. `btoa` throws
 * `InvalidCharacterError` on any code point over U+00FF, so an ASCII-only
 * helper can never produce the token a learner named in Chinese, Tamil or
 * Arabic actually receives.
 */
function createUtf8Jwt(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  const payload = btoa(String.fromCharCode(...bytes));
  return `${header}.${payload}.fake-signature`;
}

/** Matches the WP-6 `GET /api/v1/tenants/me` branding hydration round-trip. */
function isTenantMe(r: { url: string }): boolean {
  return r.url.includes('/api/v1/tenants/me');
}

/** Matches the LEGACY `GET /api/v1/tenants` list round-trip ONLY (neither
 *  the WP-6 `/tenants/me` hydration nor `/api/feature-flags`). */
function isLegacyTenantList(r: { url: string }): boolean {
  return (
    r.url.includes('/api/v1/tenants') &&
    !r.url.includes('/tenants/me') &&
    !r.url.includes('feature-flags')
  );
}

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let router: Router;
  let tenantContext: TenantContextService;
  let passwordAuthStub: PasswordAuthStub;

  beforeEach(() => {
    // TenantContextService.setCurrentTenant persists the active tenant id to
    // localStorage, which survives between tests in a file — clear it so one
    // test's tenant can't leak into another's mint body.
    localStorage.clear();
    TestBed.resetTestingModule();
    passwordAuthStub = new PasswordAuthStub();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: PasswordAuthService, useValue: passwordAuthStub },
      ],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    tenantContext = TestBed.inject(TenantContextService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should start unauthenticated', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
    expect(service.getToken()).toBeNull();
  });

  it('should set and clear user', () => {
    const user: AuthUser = {
      gcid: 'g1',
      tenantId: 't1',
      roles: ['learner'],
      capabilities: ['atom:read'],
      displayName: 'Test',
      email: 'test@example.com',
    };
    service.setUser(user, 'token-123');

    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()?.gcid).toBe('g1');
    expect(service.getToken()).toBe('token-123');

    service.clearAuth();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should decode JWT and set user on handleAuthResponse', () => {
    const token = createJwt({
      sub: 'gcid-123',
      email: 'user@chora.app',
      display_name: 'Test User',
      tenant_id: 'tenant-1',
      roles: ['admin'],
      capabilities: ['atom:publish'],
      exp: Date.now() / 1000 + 3600,
    });

    const response: AuthTokenResponse = {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600,
      gcid: 'gcid-123',
    };

    service.handleAuthResponse(response);

    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()?.email).toBe('user@chora.app');
    expect(service.user()?.displayName).toBe('Test User');
    expect(service.gcid()).toBe('gcid-123');

    // Flush side-effect requests triggered by handleAuthResponse
    // loadAvailableTenants → GET /api/v1/tenants
    // loadFeatureFlags → GET /api/feature-flags (post-A7 flat route)
    // hydrateActiveTenantBranding → GET /api/v1/tenants/me (WP-6)
    httpMock.expectOne(isLegacyTenantList).flush({ data: [] });
    httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
    httpMock.expectOne(isTenantMe).flush({});
  });

  it('should set tenant context on handleAuthResponse', () => {
    const setSpy = vi.spyOn(tenantContext, 'setCurrentTenant');
    const token = createJwt({
      sub: 'gcid-1',
      email: 'a@b.com',
      display_name: 'A',
      tenant_id: 'tenant-abc',
      roles: [],
      capabilities: [],
      exp: Date.now() / 1000 + 3600,
    });

    service.handleAuthResponse({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600,
      gcid: 'gcid-1',
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tenant-abc' }),
    );

    // Flush side-effect requests triggered by handleAuthResponse
    httpMock.expectOne(isLegacyTenantList).flush({ data: [] });
    httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
    httpMock.expectOne(isTenantMe).flush({});
  });

  it('should not set user for invalid JWT', () => {
    service.handleAuthResponse({
      access_token: 'not-a-jwt',
      token_type: 'Bearer',
      expires_in: 3600,
      gcid: 'gcid-1',
    });
    expect(service.isAuthenticated()).toBe(false);
  });

  it('initialize() resolves false (no persisted session, no network call)', async () => {
    // The session JWT lives in memory only — the gateway mints no refresh
    // tokens in this milestone, so there is nothing to silently restore.
    const resultP = new Promise<boolean>((resolve) => {
      service.initialize().subscribe((r) => resolve(r));
    });

    expect(await resultP).toBe(false);
    httpMock.verify(); // assert no outstanding HTTP requests
  });

  it('should call logout endpoint and navigate to /login', () => {
    service.logout();

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/auth/logout'));
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should navigate to /login even if logout request fails', () => {
    service.logout();

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/auth/logout'));
    req.flush(null, { status: 500, statusText: 'Server Error' });

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(service.isAuthenticated()).toBe(false);
  });

  // ── entitlements must not outlive the session ─────────────────────────
  //
  // A signed-out session that leaves its add-on entitlements in memory hands
  // them to whoever signs in next on the SAME browser. On a shared device that
  // is a cross-tenant entitlement leak: the incoming tenant's add-on guards
  // read the OUTGOING tenant's set and open surfaces that tenant has not
  // bought, for the whole window until `GET /api/feature-flags` returns.
  //
  // The clear lives in `clearAuth()`, which is the one place a session is
  // dropped: both arms of `logout()` call it, and so does the interceptor when
  // a refresh cannot mint. Anything narrower would leave the other path open.
  describe('entitlements do not survive a dropped session', () => {
    let featureFlags: FeatureFlagService;

    beforeEach(() => {
      featureFlags = TestBed.inject(FeatureFlagService);
      featureFlags.setEntitlements([
        {
          id: 'a7e00001-0000-7000-8000-000000000001',
          tenant_id: '11111111-1111-7111-8111-111111111111',
          addon_id: 'a7d00001-0000-7000-8000-000000000001',
          addon_code: 'cplus_social',
          status: 'active',
          monthly_price_cents_snapshot: 4900,
          activated_at: '2026-05-08T00:00:00Z',
          updated_at: '2026-05-08T00:00:00Z',
        },
      ]);
      expect(featureFlags.isEnabled('cplus_social')).toBe(true);
    });

    it('logout clears the entitlements (success path)', () => {
      service.logout();

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/auth/logout'));
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(featureFlags.entitlements()).toEqual([]);
      expect(featureFlags.isEnabled('cplus_social')).toBe(false);
    });

    it('logout clears the entitlements (error path)', () => {
      service.logout();

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/auth/logout'));
      req.flush(null, { status: 500, statusText: 'Server Error' });

      expect(featureFlags.entitlements()).toEqual([]);
      expect(featureFlags.isEnabled('cplus_social')).toBe(false);
    });

    // The interceptor's failed-refresh arms call clearAuth() directly
    // (auth.interceptor.ts:89 and :95) without going through logout().
    it('clearAuth clears the entitlements', () => {
      service.clearAuth();

      expect(featureFlags.entitlements()).toEqual([]);
      expect(featureFlags.isEnabled('cplus_social')).toBe(false);
    });

    // Re-armed, not latched: a gate left resolved from the previous tenant
    // lets the next session's add-on guard decide on an empty set before that
    // tenant's own flags land.
    it('re-arms the loaded gate so the next session waits for its own flags', async () => {
      service.clearAuth();

      let resolved = false;
      featureFlags.whenLoaded$.subscribe(() => {
        resolved = true;
      });
      await Promise.resolve();
      expect(resolved).toBe(false);
    });
  });

  // ── a non-ASCII display name must survive the decode ──────────────────
  //
  // `atob` returns one character per BYTE. Handing that straight to
  // JSON.parse reads UTF-8 bytes as Latin-1 characters, so every name outside
  // ASCII arrives mangled and renders mangled everywhere the session name is
  // shown. Three of the five shipped locales are affected.
  describe('display names outside ASCII survive the JWT decode', () => {
    const baseClaims = {
      sub: 'gcid-utf8',
      gcid: 'gcid-utf8',
      email: 'learner@chora.app',
      tenant_id: 'tenant-1',
      roles: ['learner'],
      exp: Date.now() / 1000 + 3600,
    };

    function mint(displayName: string): void {
      const token = createUtf8Jwt({ ...baseClaims, display_name: displayName });
      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-utf8',
      });
      // handleAuthResponse fires two non-blocking reads; neither is under test.
      httpMock.match(isTenantMe).forEach((r) => r.flush({}));
      httpMock.match(isLegacyTenantList).forEach((r) => r.flush({ data: [] }));
      httpMock
        .match((r) => r.url.includes('/api/feature-flags'))
        .forEach((r) => r.flush({ items: [], total: 0 }));
    }

    it.each([
      ['Chinese', '李明'],
      ['Tamil', 'அருண் குமார்'],
      ['Arabic', 'أحمد بن سالم'],
      ['an accented Latin name', 'José Müller'],
      ['an emoji', 'Ada 🚀'],
    ])('keeps a %s display name intact', (_label, displayName) => {
      mint(displayName);

      expect(service.user()?.displayName).toBe(displayName);
    });

    it('still decodes a plain ASCII name', () => {
      mint('Plain Name');

      expect(service.user()?.displayName).toBe('Plain Name');
    });

  });

  describe('Stage-2 cutover — inline memberships from mint response', () => {
    it('flows memberships into TenantContextService.availableTenants', () => {
      const setAvailSpy = vi.spyOn(tenantContext, 'setAvailableTenants');
      const token = createJwt({
        sub: 'gcid-multi',
        email: 'multi@chora.app',
        display_name: 'Multi Tenant',
        tenant_id: 'tenant-a',
        roles: ['learner'],
        exp: Date.now() / 1000 + 3600,
      });

      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-multi',
        memberships: [
          {
            tenant_id: 'tenant-a',
            tenant_slug: 'school-a',
            roles: ['learner'],
            surfaces: ['aplus'],
            is_default: true,
          },
          {
            tenant_id: 'tenant-b',
            tenant_slug: 'school-b',
            roles: ['author'],
            surfaces: ['aplus', 'cplus'],
            is_default: false,
          },
        ],
      });

      expect(setAvailSpy).toHaveBeenCalledTimes(1);
      const passed = setAvailSpy.mock.calls[0][0];
      expect(passed).toHaveLength(2);
      expect(passed[0]).toEqual(
        expect.objectContaining({
          id: 'tenant-a',
          // mint memberships carry no display name — slug is used as the
          // display name so consumers never render a blank.
          name: 'school-a',
          slug: 'school-a',
          roles: ['learner'],
          surfaces: ['aplus'],
          isDefault: true,
        }),
      );
      expect(passed[1]).toEqual(
        expect.objectContaining({ id: 'tenant-b', isDefault: false }),
      );

      // feature-flags + WP-6 /tenants/me hydration side-effects still
      // fire; the LEGACY /api/v1/tenants round-trip is SKIPPED because
      // memberships were present.
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
      httpMock.expectOne(isTenantMe).flush({});
      httpMock.expectNone(isLegacyTenantList);
    });

    it('falls back to the /api/v1/tenants round-trip when memberships absent', () => {
      const token = createJwt({
        sub: 'gcid-legacy',
        email: 'legacy@chora.app',
        display_name: 'Legacy',
        tenant_id: 'tenant-legacy',
        roles: [],
        exp: Date.now() / 1000 + 3600,
      });

      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-legacy',
      });

      // No memberships → legacy round-trip fires (plus WP-6 hydration).
      httpMock.expectOne(isLegacyTenantList).flush({ data: [] });
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
      httpMock.expectOne(isTenantMe).flush({});
    });
  });

  describe('mintWithActiveTenant', () => {
    // The gateway mints from username/password only — no tenant-switch
    // route, no refresh token — and the JWT's tenant_id claim is
    // authoritative, so the frontend must not invent or override a tenant.
    // The call fails loudly instead of silently switching local state.
    it('fails loudly with a re-authentication error (no HTTP call)', async () => {
      let message = '';
      await new Promise<void>((resolve) => {
        service.mintWithActiveTenant('tenant-target').subscribe({
          error: (err: Error) => {
            message = err.message;
            resolve();
          },
        });
      });

      expect(message).toContain('tenant-target');
      expect(message).toMatch(/sign out and sign in again/i);
      httpMock.verify(); // no mint request was made
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Branch-coverage augmentation — drive the currently-uncovered arms
  // of the nullish-coalescing / optional-chain / early-return / error
  // callbacks in handleAuthResponse + loadAvailableTenants +
  // loadFeatureFlags + decodeJwtClaims. Source NOT modified.
  // ──────────────────────────────────────────────────────────────────
  describe('handleAuthResponse — nullish + guard arms', () => {
    it('falls back to empty roles when the JWT omits a roles claim (claims.roles ?? [])', () => {
      // No `roles` key at all → `claims.roles ?? []` takes the nullish arm.
      const token = createJwt({
        sub: 'gcid-noroles',
        gcid: 'gcid-noroles',
        email: 'noroles@chora.app',
        display_name: 'No Roles',
        tenant_id: 'tenant-nr',
        exp: Date.now() / 1000 + 3600,
      });

      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-noroles',
      });

      expect(service.user()?.roles).toEqual([]);
      // Unknown/empty roles → no capabilities (capabilitiesForRoles fail-closed).
      expect(service.user()?.capabilities).toEqual([]);

      httpMock.expectOne(isLegacyTenantList).flush({ data: [] });
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
      httpMock.expectOne(isTenantMe).flush({});
    });

    it('falls back to claims.sub for gcid when the JWT omits a gcid claim (claims.gcid ?? claims.sub)', () => {
      // `gcid` absent → `claims.gcid ?? claims.sub` resolves to `sub`.
      const token = createJwt({
        sub: 'sub-as-gcid',
        email: 'subonly@chora.app',
        display_name: 'Sub Only',
        tenant_id: 'tenant-sub',
        roles: ['admin'],
        exp: Date.now() / 1000 + 3600,
      });

      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'sub-as-gcid',
      });

      expect(service.gcid()).toBe('sub-as-gcid');
      // `admin` role → mapped capabilities (proves capabilitiesForRoles non-empty arm).
      expect(service.user()?.capabilities).toEqual(
        expect.arrayContaining(['tenant:manage', 'tenant:view_payments']),
      );

      httpMock.expectOne(isLegacyTenantList).flush({ data: [] });
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
      httpMock.expectOne(isTenantMe).flush({});
    });

    it('skips setCurrentTenant + loadFeatureFlags when the JWT carries no tenant_id', () => {
      // `tenant_id` absent → `if (claims.tenant_id)` false arm (no setCurrentTenant)
      // AND `loadFeatureFlags` early-return (`if (!tenantId) return;` true arm).
      const setCurrentSpy = vi.spyOn(tenantContext, 'setCurrentTenant');
      const token = createJwt({
        sub: 'gcid-notenant',
        gcid: 'gcid-notenant',
        email: 'notenant@chora.app',
        display_name: 'No Tenant',
        roles: ['learner'],
        exp: Date.now() / 1000 + 3600,
      });

      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-notenant',
      });

      expect(setCurrentSpy).not.toHaveBeenCalled();
      expect(service.isAuthenticated()).toBe(true);

      // No memberships → loadAvailableTenants still fires (the /api/v1/tenants
      // round-trip). loadFeatureFlags short-circuits → NO /feature-flags call.
      // No tenant_id → NO WP-6 /tenants/me hydration either.
      httpMock.expectOne(isLegacyTenantList).flush({ data: [] });
      httpMock.expectNone((r) => r.url.includes('/feature-flags'));
      httpMock.expectNone(isTenantMe);
    });
  });

  describe('loadAvailableTenants — data nullish + branding optional-chain + error arms', () => {
    function mintWithLegacyTenants(): void {
      const token = createJwt({
        sub: 'gcid-tenants',
        gcid: 'gcid-tenants',
        email: 'tenants@chora.app',
        display_name: 'Tenants',
        tenant_id: 'tenant-t',
        roles: [],
        exp: Date.now() / 1000 + 3600,
      });
      // No memberships → loadAvailableTenants round-trip path.
      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-tenants',
      });
    }

    it('maps branding.logo_url, missing logo_url, and absent branding across tenant rows', () => {
      const setAvailSpy = vi.spyOn(tenantContext, 'setAvailableTenants');
      mintWithLegacyTenants();

      httpMock
        .expectOne(isLegacyTenantList)
        .flush({
          data: [
            // branding present + logo_url present → `t.branding?.logo_url ?? null` = url
            { id: 't1', name: 'One', subdomain: 'one', branding: { logo_url: 'https://cdn/one.png' } },
            // branding present + logo_url absent → optional-chain present, `?? null` arm
            { id: 't2', name: 'Two', subdomain: 'two', branding: {} },
            // branding absent → `t.branding?.logo_url` short-circuits to undefined → null
            { id: 't3', name: 'Three', subdomain: 'three' },
          ],
        });
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
      httpMock.expectOne(isTenantMe).flush({});

      const tenants = setAvailSpy.mock.calls[0][0];
      expect(tenants).toHaveLength(3);
      expect(tenants[0].logoUrl).toBe('https://cdn/one.png');
      expect(tenants[1].logoUrl).toBeNull();
      expect(tenants[2].logoUrl).toBeNull();
    });

    it('falls back to an empty tenant list when the response omits data (response.data ?? [])', () => {
      const setAvailSpy = vi.spyOn(tenantContext, 'setAvailableTenants');
      mintWithLegacyTenants();

      // Response with NO `data` key → `(response.data ?? [])` nullish arm.
      httpMock
        .expectOne(isLegacyTenantList)
        .flush({});
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
      httpMock.expectOne(isTenantMe).flush({});

      expect(setAvailSpy).toHaveBeenCalledWith([]);
    });

    it('swallows a /api/v1/tenants error (silent error callback)', () => {
      const setAvailSpy = vi.spyOn(tenantContext, 'setAvailableTenants');
      mintWithLegacyTenants();

      httpMock
        .expectOne(isLegacyTenantList)
        .flush(null, { status: 500, statusText: 'Server Error' });
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
      httpMock.expectOne(isTenantMe).flush({});

      // error callback is a no-op → setAvailableTenants never called, no throw.
      expect(setAvailSpy).not.toHaveBeenCalled();
      expect(service.isAuthenticated()).toBe(true);
    });
  });

  describe('loadFeatureFlags — items nullish + error arms', () => {
    function mintWithTenant(): void {
      const token = createJwt({
        sub: 'gcid-ff',
        gcid: 'gcid-ff',
        email: 'ff@chora.app',
        display_name: 'FF',
        tenant_id: 'tenant-ff',
        roles: [],
        exp: Date.now() / 1000 + 3600,
      });
      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-ff',
      });
    }

    it('falls back to empty entitlements when the response omits items (response.items ?? [])', () => {
      const setEntSpy = vi.spyOn(
        TestBed.inject(FeatureFlagService),
        'setEntitlements',
      );
      mintWithTenant();

      httpMock.expectOne(isLegacyTenantList).flush({ data: [] });
      // Response with NO `items` key → `response.items ?? []` nullish arm.
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ total: 0 });
      httpMock.expectOne(isTenantMe).flush({});

      expect(setEntSpy).toHaveBeenCalledWith([]);
    });

    it('swallows a /api/feature-flags error (silent error callback)', () => {
      const setEntSpy = vi.spyOn(
        TestBed.inject(FeatureFlagService),
        'setEntitlements',
      );
      mintWithTenant();

      httpMock.expectOne(isLegacyTenantList).flush({ data: [] });
      httpMock
        .expectOne((r) => r.url.includes('/feature-flags'))
        .flush(null, { status: 503, statusText: 'Unavailable' });
      httpMock.expectOne(isTenantMe).flush({});

      // error callback is a no-op → setEntitlements never called, no throw.
      expect(setEntSpy).not.toHaveBeenCalled();
      expect(service.isAuthenticated()).toBe(true);
    });
  });

  describe('decodeJwtClaims — malformed token arms', () => {
    it('returns null (no user set) for a token without exactly 3 segments', () => {
      // `header.payload` (2 parts) → `parts.length !== 3` true arm.
      service.handleAuthResponse({
        access_token: 'only.twoparts',
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-bad',
      });

      expect(service.isAuthenticated()).toBe(false);
      httpMock.verify(); // no side-effect requests fired
    });

    it('returns null (no user set) when the payload segment is not valid JSON', () => {
      // 3 segments but the middle is base64 of a non-JSON string → JSON.parse
      // throws → catch arm returns null.
      const token = `${btoa('{}')}.${btoa('not json at all')}.sig`;
      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-bad2',
      });

      expect(service.isAuthenticated()).toBe(false);
      httpMock.verify();
    });
  });

  describe('silent refresh (username/password milestone)', () => {
    it('resolves false without any HTTP call (no persisted session exists)', async () => {
      const resultP = new Promise<boolean>((resolve) => {
        service.silentRefresh().subscribe((r) => resolve(r));
      });

      expect(await resultP).toBe(false);
      httpMock.verify(); // no /session/mint, no /token/refresh
    });

    it('clearAuth drops the persisted tenant so the next user starts fresh', () => {
      localStorage.setItem('chora_active_tenant_id', 'tenant-previous-user');
      service.clearAuth();
      expect(localStorage.getItem('chora_active_tenant_id')).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // CHO-1709 WP-6 — post-mint active-tenant branding hydration.
  // The mint `memberships[]` carry slug only, so the shell rendered the
  // literal slug as the tenant name (§2-F) and never a logo. Post-mint,
  // AuthService hydrates the ACTIVE TenantContext from
  // GET /api/v1/tenants/me (chora-tenancy MeTenantHandler proxied by
  // the gateway) — patching `name` (display_name, slug fallback) +
  // `logoUrl`. Hydration is best-effort: failure keeps the slug-named
  // context and must never throw into the auth flow.
  // ──────────────────────────────────────────────────────────────────
  describe('WP-6 — post-mint active-tenant branding hydration (GET /api/v1/tenants/me)', () => {
    /** Mint with a single membership whose tenant_id matches the JWT,
     *  then flush the feature-flags side-effect (leaving the /tenants/me
     *  hydration request pending for the test to flush/err). */
    function mintWithMembership(tenantId = 'tenant-acme', slug = 'acme'): void {
      const token = createJwt({
        sub: 'gcid-brand',
        gcid: 'gcid-brand',
        email: 'brand@chora.app',
        display_name: 'Brand User',
        tenant_id: tenantId,
        roles: ['learner'],
        exp: Date.now() / 1000 + 3600,
      });
      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-brand',
        memberships: [
          {
            tenant_id: tenantId,
            tenant_slug: slug,
            roles: ['learner'],
            surfaces: ['aplus'],
            is_default: true,
          },
        ],
      });
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
    }

    it('seeds the ACTIVE TenantContext from its mint membership (slug baseline) before hydration resolves', () => {
      mintWithMembership();

      // Pre-hydration the active tenant already carries the slug as its
      // name (not the blank-name JWT seed) so the shell renders something.
      expect(tenantContext.currentTenant()).toEqual(
        expect.objectContaining({
          id: 'tenant-acme',
          name: 'acme',
          slug: 'acme',
          logoUrl: null,
        }),
      );

      httpMock.expectOne(isTenantMe).flush({
        id: 'tenant-acme',
        display_name: 'Acme Institute',
        slug: 'acme',
        branding: {},
      });
    });

    it('patches the active tenant name + logoUrl from display_name + branding.logo_url', () => {
      mintWithMembership();

      httpMock.expectOne(isTenantMe).flush({
        id: 'tenant-acme',
        display_name: 'Acme Institute',
        slug: 'acme',
        branding: {
          logo_url: 'https://cdn.chora.site/acme.png',
          primary_color_hex: '#336699',
          custom_domain: '',
        },
      });

      const active = tenantContext.currentTenant();
      expect(active?.name).toBe('Acme Institute');
      expect(active?.logoUrl).toBe('https://cdn.chora.site/acme.png');
      // Slug + membership metadata survive the patch.
      expect(active?.slug).toBe('acme');
      expect(active?.roles).toEqual(['learner']);
    });

    it('falls back to the slug name when display_name is absent and maps empty logo_url to null', () => {
      mintWithMembership();

      // chora-tenancy serialises branding.logo_url as "" (Go string zero
      // value) when no logo is set — must NOT leak an empty-string src.
      httpMock.expectOne(isTenantMe).flush({
        id: 'tenant-acme',
        slug: 'acme',
        branding: { logo_url: '' },
      });

      const active = tenantContext.currentTenant();
      expect(active?.name).toBe('acme');
      expect(active?.logoUrl).toBeNull();
    });

    it('keeps the slug-named context intact and does not throw when hydration 404s', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mintWithMembership();

      httpMock
        .expectOne(isTenantMe)
        .flush({ error: 'tenant_not_found' }, { status: 404, statusText: 'Not Found' });

      expect(tenantContext.currentTenant()).toEqual(
        expect.objectContaining({ id: 'tenant-acme', name: 'acme', logoUrl: null }),
      );
      // Login flow unaffected — hydration is a non-blocking side-effect.
      expect(service.isAuthenticated()).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('keeps the slug-named context intact on a network error', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mintWithMembership();

      httpMock.expectOne(isTenantMe).error(new ProgressEvent('error'));

      expect(tenantContext.currentTenant()).toEqual(
        expect.objectContaining({ id: 'tenant-acme', name: 'acme', logoUrl: null }),
      );
      expect(service.isAuthenticated()).toBe(true);
      warnSpy.mockRestore();
    });

    it('ignores a stale /tenants/me response describing a different tenant', () => {
      mintWithMembership();

      // Simulates a tenant switch re-seeding the context while the
      // hydration round-trip was in flight.
      httpMock.expectOne(isTenantMe).flush({
        id: 'tenant-other',
        display_name: 'Someone Else',
        branding: { logo_url: 'https://cdn.chora.site/other.png' },
      });

      expect(tenantContext.currentTenant()).toEqual(
        expect.objectContaining({ id: 'tenant-acme', name: 'acme', logoUrl: null }),
      );
    });

    it('does not call /tenants/me when the JWT carries no tenant_id', () => {
      const token = createJwt({
        sub: 'gcid-nt',
        gcid: 'gcid-nt',
        email: 'nt@chora.app',
        display_name: 'No Tenant',
        roles: [],
        exp: Date.now() / 1000 + 3600,
      });

      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-nt',
      });

      httpMock.expectOne(isLegacyTenantList).flush({ data: [] });
      httpMock.expectNone(isTenantMe);
    });

    it('hydrates on the legacy no-memberships path too', () => {
      const token = createJwt({
        sub: 'gcid-leg',
        gcid: 'gcid-leg',
        email: 'leg@chora.app',
        display_name: 'Legacy',
        tenant_id: 'tenant-leg',
        roles: [],
        exp: Date.now() / 1000 + 3600,
      });

      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-leg',
      });

      httpMock.expectOne(isLegacyTenantList).flush({ data: [] });
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
      httpMock.expectOne(isTenantMe).flush({
        id: 'tenant-leg',
        display_name: 'Legacy Org',
        slug: 'leg',
        branding: { logo_url: null },
      });

      expect(tenantContext.currentTenant()).toEqual(
        expect.objectContaining({ id: 'tenant-leg', name: 'Legacy Org', logoUrl: null }),
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Branch-coverage augmentation (additive) — refreshProfile, the
  // constructor dev-autologin path (mint server + fallbacks), and the
  // handleAuthResponse membership-mismatch arm. Source NOT modified.
  // ──────────────────────────────────────────────────────────────────

  describe('refreshProfile — best-effort cached-profile refresh', () => {
    const cachedUser: AuthUser = {
      gcid: 'g-refresh',
      tenantId: 't-refresh',
      roles: ['learner'],
      capabilities: [],
      displayName: 'Stale Name',
      email: 'stale@chora.app',
    };

    it('no-ops without a cached user (no HTTP call)', () => {
      service.refreshProfile();
      httpMock.verify();
    });

    it('patches email + displayName from GET /api/me', () => {
      service.setUser(cachedUser, 'tok');
      service.refreshProfile();

      const req = httpMock.expectOne(
        (r) => r.method === 'GET' && r.url.endsWith('/api/me'),
      );
      req.flush({
        gcid: 'g-refresh',
        email: 'fresh@chora.app',
        display_name: 'Fresh Name',
      });

      expect(service.user()?.email).toBe('fresh@chora.app');
      expect(service.user()?.displayName).toBe('Fresh Name');
      // Untouched fields survive the partial patch.
      expect(service.user()?.gcid).toBe('g-refresh');
      expect(service.user()?.tenantId).toBe('t-refresh');
    });

    it('keeps the cached profile when the fetch fails (silent error callback)', () => {
      service.setUser(cachedUser, 'tok');
      service.refreshProfile();

      const req = httpMock.expectOne((r) => r.url.endsWith('/api/me'));
      req.flush(null, { status: 500, statusText: 'Server Error' });

      expect(service.user()?.email).toBe('stale@chora.app');
      expect(service.user()?.displayName).toBe('Stale Name');
    });
  });

  describe('handleAuthResponse — active tenant when no membership matches', () => {
    it('keeps the blank-name JWT seed when no mint membership matches claims.tenant_id', () => {
      const token = createJwt({
        sub: 'gcid-orphan',
        gcid: 'gcid-orphan',
        email: 'orphan@chora.app',
        display_name: 'Orphan',
        tenant_id: 'tenant-orphan',
        roles: [],
        exp: Date.now() / 1000 + 3600,
      });
      service.handleAuthResponse({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        gcid: 'gcid-orphan',
        memberships: [
          {
            tenant_id: 'tenant-other',
            tenant_slug: 'other',
            roles: ['learner'],
            surfaces: ['aplus'],
            is_default: false,
          },
        ],
      });

      // `memberships.find((m) => m.id === claims.tenant_id)` found nothing →
      // the active tenant stays the blank-name JWT seed (the pre-membership
      // setCurrentTenant at the top of handleAuthResponse).
      expect(tenantContext.currentTenant()).toEqual(
        expect.objectContaining({ id: 'tenant-orphan', name: '', slug: '' }),
      );

      // feature-flags + WP-6 /tenants/me side-effects still fire; the
      // LEGACY /api/v1/tenants round-trip is skipped (memberships present).
      httpMock.expectOne((r) => r.url.includes('/feature-flags')).flush({ items: [], total: 0 });
      httpMock.expectOne(isTenantMe).flush({});
      httpMock.expectNone(isLegacyTenantList);
    });
  });

});
