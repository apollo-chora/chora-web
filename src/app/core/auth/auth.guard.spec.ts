import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { PasswordAuthService } from './password-auth.service';
import { ReturnUrlService } from '../services/return-url.service';
import { TenantContextService, TenantContext } from './tenant-context.service';

/** Stub mirroring PasswordAuthService's public surface used by the guard. */
class PasswordAuthStub {
  isConfigured = vi.fn().mockReturnValue(true);
  signInWithPassword = vi.fn();
  signOut = vi.fn().mockResolvedValue(undefined);
}

describe('authGuard', () => {
  let authService: AuthService;
  let router: Router;
  let returnUrlService: ReturnUrlService;
  let passwordAuthStub: PasswordAuthStub;
  let tenantContextStub: {
    availableTenants: ReturnType<typeof signal<TenantContext[]>>;
    currentTenant: ReturnType<typeof signal<TenantContext | null>>;
  };

  beforeEach(() => {
    sessionStorage.clear();
    passwordAuthStub = new PasswordAuthStub();
    tenantContextStub = {
      availableTenants: signal<TenantContext[]>([]),
      currentTenant: signal<TenantContext | null>(null),
    };
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        ReturnUrlService,
        { provide: PasswordAuthService, useValue: passwordAuthStub },
        { provide: TenantContextService, useValue: tenantContextStub },
        {
          provide: Router,
          useValue: {
            createUrlTree: vi.fn((cmds: string[]) => ({ toString: () => cmds.join('/') })),
          },
        },
      ],
    });
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    returnUrlService = TestBed.inject(ReturnUrlService);
  });

  it('should allow already-authenticated users without a silent refresh', async () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
      'token',
    );
    const silentRefresh = vi.spyOn(authService, 'silentRefresh');

    const state = { url: '/dashboard' } as RouterStateSnapshot;
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, state));
    expect(result).toBe(true);
    expect(silentRefresh).not.toHaveBeenCalled();
  });

  it('awaits silent refresh before deciding when not yet authenticated', async () => {
    // silentRefresh is a no-op today (no persisted session, no refresh
    // token) — the guard must still await it (proving it does not decide
    // synchronously) then redirect to /login.
    const silentRefresh = vi.spyOn(authService, 'silentRefresh').mockReturnValue(of(false));

    const state = { url: '/dashboard' } as RouterStateSnapshot;
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, state));

    expect(silentRefresh).toHaveBeenCalledTimes(1);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/dashboard' },
    });
    expect(result).not.toBe(true);
  });

  it('allows through when silent refresh re-establishes a session', async () => {
    // If a future milestone adds a persisted-session restore, the guard
    // must honour it (AuthService.silentRefresh) rather than bouncing to
    // /login.
    const silentRefresh = vi
      .spyOn(authService, 'silentRefresh')
      .mockImplementation(() => {
        authService.setUser(
          {
            gcid: 'gr',
            tenantId: 't1',
            roles: ['learner'],
            capabilities: [],
            displayName: 'Restored',
            email: 'r@example.com',
          },
          'tok',
        );
        return of(true);
      });
    tenantContextStub.availableTenants.set([
      { id: 't1', name: 'Alpha', slug: 'alpha', logoUrl: null },
    ]);

    const state = { url: '/dashboard' } as RouterStateSnapshot;
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, state));

    expect(silentRefresh).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('should redirect unauthenticated users to /login with returnUrl', async () => {
    const state = { url: '/learning/atoms/123' } as RouterStateSnapshot;
    await TestBed.runInInjectionContext(() => authGuard({} as never, state));
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/learning/atoms/123' },
    });
  });

  it('should capture return URL in ReturnUrlService', async () => {
    const state = { url: '/settings' } as RouterStateSnapshot;
    await TestBed.runInInjectionContext(() => authGuard({} as never, state));
    expect(returnUrlService.returnUrl()).toBe('/settings');
  });

  it('routes an authed user with zero tenant memberships to the named refusal', async () => {
    // Authenticated (a prior mint set the user) but with no tenant context.
    authService.setUser(
      {
        gcid: 'g-no-tenant',
        tenantId: '',
        roles: [],
        capabilities: [],
        displayName: 'NoTenant',
        email: 'nt@example.com',
      },
      'token',
    );

    const state = { url: '/dashboard' } as RouterStateSnapshot;
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, state));

    // Post ADR-182 a tenantless session is a FAIL-LOUD state, not an
    // onboarding state: resolve_handler.go 3b auto-enrols a zero-membership
    // GCID into chora-master and re-lists, so an empty list means something
    // upstream went wrong. The old destination was a form whose only possible
    // outcome was 409 already-member, which told the user nothing.
    expect(router.createUrlTree).toHaveBeenCalledWith(['/welcome/no-organisation']);
    expect(router.createUrlTree).not.toHaveBeenCalledWith(['/welcome/no-tenant']);
    expect(result).not.toBe(true);
  });

  it('still lets a single-membership user through to where they asked', async () => {
    // The positive control for the change above. The refusal must fire ONLY
    // on an empty tenant, and it would be easy to widen it by accident into
    // every session that has not selected a tenant yet.
    authService.setUser(
      {
        gcid: 'g-one',
        tenantId: 't-only',
        roles: ['learner'],
        capabilities: [],
        displayName: 'OneTenant',
        email: 'one@example.com',
      },
      'token',
    );

    const state = { url: '/a/knowledge' } as RouterStateSnapshot;
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, state));

    expect(result).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('routes an authed multi-membership user with no selected tenant to /select-tenant', async () => {
    authService.setUser(
      {
        gcid: 'g-multi',
        tenantId: 't1',
        roles: ['learner'],
        capabilities: [],
        displayName: 'Multi',
        email: 'm@example.com',
      },
      'token',
    );
    tenantContextStub.availableTenants.set([
      { id: 't1', name: 'Alpha', slug: 'alpha', logoUrl: null },
      { id: 't2', name: 'Beta', slug: 'beta', logoUrl: null },
    ]);
    tenantContextStub.currentTenant.set(null);

    const state = { url: '/dashboard' } as RouterStateSnapshot;
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, state));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/select-tenant']);
    expect(result).not.toBe(true);
  });

  it('allows a multi-membership user once a tenant is selected', async () => {
    authService.setUser(
      {
        gcid: 'g-multi',
        tenantId: 't1',
        roles: ['learner'],
        capabilities: [],
        displayName: 'Multi',
        email: 'm@example.com',
      },
      'token',
    );
    tenantContextStub.availableTenants.set([
      { id: 't1', name: 'Alpha', slug: 'alpha', logoUrl: null },
      { id: 't2', name: 'Beta', slug: 'beta', logoUrl: null },
    ]);
    tenantContextStub.currentTenant.set({
      id: 't1',
      name: 'Alpha',
      slug: 'alpha',
      logoUrl: null,
    });

    const state = { url: '/dashboard' } as RouterStateSnapshot;
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, state));

    expect(result).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('allows a single-membership user without redirecting to /select-tenant', async () => {
    authService.setUser(
      {
        gcid: 'g-single',
        tenantId: 't1',
        roles: ['learner'],
        capabilities: [],
        displayName: 'Single',
        email: 's@example.com',
      },
      'token',
    );
    tenantContextStub.availableTenants.set([
      { id: 't1', name: 'Alpha', slug: 'alpha', logoUrl: null },
    ]);
    tenantContextStub.currentTenant.set(null);

    const state = { url: '/dashboard' } as RouterStateSnapshot;
    const result = await TestBed.runInInjectionContext(() => authGuard({} as never, state));

    expect(result).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('no-organisation precedence: empty tenantId beats multi-membership', async () => {
    authService.setUser(
      {
        gcid: 'g-edge',
        tenantId: '',
        roles: [],
        capabilities: [],
        displayName: 'Edge',
        email: 'e@example.com',
      },
      'token',
    );
    tenantContextStub.availableTenants.set([
      { id: 't1', name: 'Alpha', slug: 'alpha', logoUrl: null },
      { id: 't2', name: 'Beta', slug: 'beta', logoUrl: null },
    ]);

    const state = { url: '/dashboard' } as RouterStateSnapshot;
    await TestBed.runInInjectionContext(() => authGuard({} as never, state));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/welcome/no-organisation']);
    expect(router.createUrlTree).not.toHaveBeenCalledWith(['/select-tenant']);
  });
});
