import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { rplusOpsGuard, RPLUS_OPS_EXEMPT_PATHS } from './rplus-ops.guard';
import { AuthService } from './auth.service';

/**
 * rplus-ops.guard.spec.ts (ADR-239 D3, CHO-2234).
 *
 * The /r mount's canActivateChild guard: exam routes are reachable by the
 * whole R+ surface population; every other R+ child route requires the
 * delivery:ops capability (fail-closed to /unauthorized). Closes the URL-bar
 * variant of the CHO-2200 no-tab-leak row for an exam-ops-only session, the
 * same way CHO-1801 closed the surface-shell leak at the surface boundary.
 */
describe('rplusOpsGuard', () => {
  let authService: AuthService;
  let router: Router;

  const childWithPath = (path: string | undefined): ActivatedRouteSnapshot =>
    ({ routeConfig: path === undefined ? null : { path } }) as ActivatedRouteSnapshot;

  const setUser = (roles: string[], capabilities: string[]) => {
    authService.setUser(
      {
        gcid: 'g1',
        tenantId: 't1',
        roles,
        capabilities,
        displayName: 'Test',
        email: 'test@example.com',
      },
      'token',
    );
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: { createUrlTree: vi.fn((commands: string[]) => commands) } },
      ],
    });
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('pins the exempt exam route family (deterministic contract)', () => {
    expect(Array.from(RPLUS_OPS_EXEMPT_PATHS).sort()).toEqual(['exams', 'exams/:id']);
  });

  it('allows an exam-ops-only session onto the exams list', () => {
    setUser(['PROCTOR'], ['exam:roster_view']);
    const result = TestBed.runInInjectionContext(() =>
      rplusOpsGuard(childWithPath('exams'), {} as never),
    );
    expect(result).toBe(true);
  });

  it('allows an exam-ops-only session onto the exam workspace drill-down', () => {
    setUser(['PROCTOR'], ['exam:roster_view']);
    const result = TestBed.runInInjectionContext(() =>
      rplusOpsGuard(childWithPath('exams/:id'), {} as never),
    );
    expect(result).toBe(true);
  });

  it('redirects an exam-ops-only session off a training-ops route (fail-closed)', () => {
    setUser(['PROCTOR'], ['exam:roster_view']);
    TestBed.runInInjectionContext(() => rplusOpsGuard(childWithPath('roster'), {} as never));
    expect(router.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });

  it('redirects an exam-ops-only session off the authoring route family too', () => {
    setUser(['PROCTOR'], ['exam:roster_view']);
    TestBed.runInInjectionContext(() =>
      rplusOpsGuard(childWithPath('assessment-authoring'), {} as never),
    );
    expect(router.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });

  it('allows a delivery:ops holder onto any training-ops route (instructor unchanged)', () => {
    setUser(['instructor'], ['assessment:author', 'delivery:ops']);
    for (const path of ['roster', 'rostering', 'scheduling', 'catalog', 'campusops']) {
      const result = TestBed.runInInjectionContext(() =>
        rplusOpsGuard(childWithPath(path), {} as never),
      );
      expect(result, `${path} must activate for delivery:ops`).toBe(true);
    }
  });

  it('allows a delivery:ops holder onto the exam routes as well (union, no toggles)', () => {
    setUser(['instructor'], ['assessment:author', 'delivery:ops']);
    const result = TestBed.runInInjectionContext(() =>
      rplusOpsGuard(childWithPath('exams'), {} as never),
    );
    expect(result).toBe(true);
  });

  it('fails closed on a child route with no route config', () => {
    setUser(['PROCTOR'], ['exam:roster_view']);
    TestBed.runInInjectionContext(() => rplusOpsGuard(childWithPath(undefined), {} as never));
    expect(router.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });
});
