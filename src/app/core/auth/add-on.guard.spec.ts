import { TestBed } from '@angular/core/testing';
import { Router, type UrlTree } from '@angular/router';
import { type Observable, firstValueFrom, isObservable } from 'rxjs';
import { addOnGuard } from './add-on.guard';
import { FeatureFlagService } from '../services/feature-flag.service';
import { RbacService } from '../services/rbac.service';
import type { TenantEntitlement } from '../services/feature-flags.model';

function buildEntitlement(overrides: Partial<TenantEntitlement> = {}): TenantEntitlement {
  return {
    id: 'a7e00001-0000-7000-8000-000000000001',
    tenant_id: '11111111-1111-7111-8111-111111111111',
    addon_id: 'a7d00006-0000-7000-8000-000000000006',
    status: 'active',
    monthly_price_cents_snapshot: 0,
    activated_at: '2026-06-10T00:00:00Z',
    updated_at: '2026-06-10T00:00:00Z',
    ...overrides,
  };
}

describe('addOnGuard', () => {
  let flagService: FeatureFlagService;
  let router: Router;
  let isOperator: boolean;

  beforeEach(() => {
    isOperator = false;
    TestBed.configureTestingModule({
      providers: [
        FeatureFlagService,
        {
          // Operator state is controllable per-test via the `isOperator`
          // closure; the guard only reads `hasRole('platform_operator')`.
          provide: RbacService,
          useValue: {
            hasRole: (role: string) =>
              isOperator && role.trim().toLowerCase() === 'platform_operator',
          },
        },
        { provide: Router, useValue: { createUrlTree: vi.fn((commands: string[]) => commands) } },
      ],
    });
    flagService = TestBed.inject(FeatureFlagService);
    router = TestBed.inject(Router);
  });

  /** Invoke the guard, resolving both the sync (operator) + async (flag-wait)
   *  return shapes to a single value. */
  function invokeGuard(code: string): boolean | UrlTree | Observable<boolean | UrlTree> {
    return TestBed.runInInjectionContext(
      () => addOnGuard(code)({} as never, {} as never) as
        | boolean
        | UrlTree
        | Observable<boolean | UrlTree>,
    );
  }
  async function runGuard(code: string): Promise<boolean | UrlTree> {
    const result = invokeGuard(code);
    return isObservable(result) ? await firstValueFrom(result) : result;
  }

  it('should allow when add-on is enabled', async () => {
    flagService.setFlags({ knowledge_graph: true });
    expect(await runGuard('knowledge_graph')).toBe(true);
  });

  it('should redirect to / when add-on is disabled', async () => {
    flagService.setFlags({});
    await runGuard('knowledge_graph');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
  });

  // ── §4.7c — entitlement addon_code bridge through the guard ────────────
  it('allows when an ACTIVE entitlement carries the matching addon_code', async () => {
    flagService.setEntitlements([
      buildEntitlement({ addon_code: 'cplus_social', status: 'active' }),
    ]);
    expect(await runGuard('cplus_social')).toBe(true);
  });

  it('redirects when the matching entitlement is not active', async () => {
    flagService.setEntitlements([
      buildEntitlement({ addon_code: 'cplus_social', status: 'cancelled' }),
    ]);
    await runGuard('cplus_social');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
  });

  // ── ADR-165 god-mode: platform_operator transcends tenant entitlements ──
  it('allows a platform_operator even when the tenant is NOT entitled', async () => {
    isOperator = true;
    flagService.setFlags({});
    flagService.setEntitlements([]);
    expect(await runGuard('cplus_social')).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('still redirects a NON-operator in a non-entitled tenant', async () => {
    isOperator = false;
    flagService.setFlags({});
    flagService.setEntitlements([]);
    await runGuard('cplus_social');
    expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
  });

  it('allows a non-operator in an entitled tenant (entitlement branch unchanged)', async () => {
    isOperator = false;
    flagService.setEntitlements([
      buildEntitlement({ addon_code: 'cplus_social', status: 'active' }),
    ]);
    expect(await runGuard('cplus_social')).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  // ── read-seam: defer the non-operator decision until flags load ─────────
  // GET /api/feature-flags is a non-blocking side-effect; a guard firing in
  // that window must NOT redirect an entitled user against an empty set.
  it('does NOT decide mid-load, then ALLOWS an entitled non-operator once flags resolve', () => {
    isOperator = false;
    // Flags not loaded yet (no setFlags/setEntitlements) → guard must wait.
    const result = invokeGuard('cplus_social');
    expect(isObservable(result)).toBe(true);

    let emitted: boolean | UrlTree | undefined;
    (result as Observable<boolean | UrlTree>).subscribe((v) => (emitted = v));
    expect(emitted).toBeUndefined();
    expect(router.createUrlTree).not.toHaveBeenCalled();

    // Flags resolve carrying the entitlement → allow, no redirect.
    flagService.setEntitlements([
      buildEntitlement({ addon_code: 'cplus_social', status: 'active' }),
    ]);
    expect(emitted).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('does NOT redirect mid-load, then REDIRECTS a non-operator once flags resolve empty', () => {
    isOperator = false;
    const result = invokeGuard('cplus_social');
    let emitted: boolean | UrlTree | undefined;
    (result as Observable<boolean | UrlTree>).subscribe((v) => (emitted = v));
    expect(emitted).toBeUndefined();
    expect(router.createUrlTree).not.toHaveBeenCalled();

    flagService.setEntitlements([]); // resolved, no entitlement
    expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
  });

  it('allows a platform_operator IMMEDIATELY without waiting for flags to load', () => {
    isOperator = true;
    // Flags deliberately never loaded — operator must not be made to wait.
    const result = invokeGuard('cplus_social');
    expect(result).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('on flags-load timeout, falls back to a fail-closed decision for a non-operator', () => {
    vi.useFakeTimers();
    try {
      isOperator = false;
      const result = invokeGuard('cplus_social'); // flags never resolve
      let emitted: boolean | UrlTree | undefined;
      (result as Observable<boolean | UrlTree>).subscribe((v) => (emitted = v));
      expect(emitted).toBeUndefined();

      vi.advanceTimersByTime(8001);
      expect(router.createUrlTree).toHaveBeenCalledWith(['/']);
    } finally {
      vi.useRealTimers();
    }
  });
});
