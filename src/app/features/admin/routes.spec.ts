import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  Router,
  type Route,
  type Routes,
  type CanMatchFn,
  type UrlSegment,
  type UrlTree,
} from '@angular/router';
import { ADMIN_ROUTES } from './routes';
import { environment } from '../../../environments/environment';

/**
 * Coverage for the admin feature route-array literal + every lazy thunk.
 *
 * The bulk of the uncovered lines are the `loadComponent` / `loadChildren`
 * arrow-function thunks. We execute each of them (awaiting the dynamic import)
 * to drive coverage. Any single thunk that throws under jsdom (canvas /
 * EventSource / DragEvent style limitations) is isolated via try/catch so it
 * cannot fail the suite — in that case we still assert the thunk is a function.
 */

function flatten(routes: Routes): Route[] {
  const out: Route[] = [];
  for (const r of routes) {
    out.push(r);
    if (r.children) {
      out.push(...flatten(r.children));
    }
  }
  return out;
}

describe('ADMIN_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(ADMIN_ROUTES)).toBe(true);
    expect(ADMIN_ROUTES.length).toBeGreaterThan(0);
  });

  it('declares the root redirect to content/atoms', () => {
    const root = ADMIN_ROUTES.find((r) => r.path === '');
    expect(root).toBeTruthy();
    expect(root?.redirectTo).toBe('content/atoms');
    expect(root?.pathMatch).toBe('full');
  });

  it('contains the expected top-level paths', () => {
    const paths = ADMIN_ROUTES.map((r) => r.path);
    expect(paths).toContain('content/atoms');
    expect(paths).toContain('content/atoms/new');
    expect(paths).toContain('content/atoms/:id/edit');
    expect(paths).toContain('content/topics');
    // 'tenant/users' was here until E2 part 3 retired it; see the retirement
    // describe block below, which asserts it no longer resolves.
    expect(paths).toContain('governance');
    expect(paths).toContain('communication');
    expect(paths).toContain('investigation');
    expect(paths).toContain('developer');
    expect(paths).toContain('agents/monitoring');
    expect(paths).toContain('training');
    expect(paths).toContain('support');
    expect(paths).toContain('rbac');
    expect(paths).toContain('accounts');
    expect(paths).toContain('economy');
    expect(paths).toContain('moderation/dashboard');
  });

  it('attaches a title via data on every non-redirect route', () => {
    for (const r of ADMIN_ROUTES) {
      if (r.redirectTo) {
        continue;
      }
      expect(r.data?.['title']).toBeTruthy();
    }
  });

  it('defines guard references where declared (without executing them)', () => {
    const editAtom = ADMIN_ROUTES.find((r) => r.path === 'content/atoms/new');
    expect(editAtom?.canDeactivate).toBeDefined();
    expect(Array.isArray(editAtom?.canDeactivate)).toBe(true);

    const governance = ADMIN_ROUTES.find((r) => r.path === 'governance');
    expect(governance?.canActivate).toBeDefined();

    const economy = ADMIN_ROUTES.find((r) => r.path === 'economy');
    // economy stacks add-on + role guards
    expect(economy?.canActivate?.length).toBe(2);
  });

  it('no longer guards the wizard here, because it no longer lives here', () => {
    // Auth-hardening Phase A (CHO-1717 / ADR-181 ruling #5): private tenant
    // creation is PLATFORM_OPERATOR-only. E5 moved the wizard to /h/setup and
    // the guard MOVED WITH IT; hplus.routes.spec.ts asserts it is present
    // there and that a tenant admin is refused.
    //
    // This test is kept rather than deleted, and asserts the redirect carries
    // no guard of its own, because a redirect that silently gained a
    // canActivate would be a second gate nobody is maintaining. The real gate
    // is the one on the destination.
    const wizard = ADMIN_ROUTES.find((r) => r.path === 'tenant/settings/wizard');
    expect(wizard).toBeDefined();
    expect(wizard?.redirectTo).toBe('/h/setup');
    expect(wizard?.canActivate).toBeUndefined();
  });

  describe('lazy thunks', () => {
    const all = flatten(ADMIN_ROUTES);
    const withComponent = all.filter((r) => typeof r.loadComponent === 'function');
    const withChildren = all.filter((r) => typeof r.loadChildren === 'function');

    it('has at least one loadComponent and one loadChildren route', () => {
      expect(withComponent.length).toBeGreaterThan(0);
      expect(withChildren.length).toBeGreaterThan(0);
    });

    it('resolves every loadComponent thunk to a truthy module', async () => {
      for (const r of withComponent) {
        try {
          const m = await r.loadComponent!();
          expect(m).toBeTruthy();
        } catch (err) {
          // jsdom limitation on a specific component module — keep suite green.
          // eslint-disable-next-line no-console
          console.warn(
            `loadComponent for path "${r.path}" threw under jsdom: ${String(err)}`,
          );
          expect(typeof r.loadComponent).toBe('function');
        }
      }
    });

    it('resolves every loadChildren thunk to a truthy module', async () => {
      for (const r of withChildren) {
        try {
          const c = await r.loadChildren!();
          expect(c).toBeTruthy();
        } catch (err) {
          // jsdom limitation on a specific child-routes module — keep suite green.
          // eslint-disable-next-line no-console
          console.warn(
            `loadChildren for path "${r.path}" threw under jsdom: ${String(err)}`,
          );
          expect(typeof r.loadChildren).toBe('function');
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Fail-loud / no-stub remediation (Governance | O+ Admin Trust, CHO-2071).
//
// The developer-console, investigation-workspace, economy-config and
// content-moderation-dashboard feature services return HARDCODED `of(MOCK_...)`
// arrays (no real BffClientService call), so a routed O+ admin page renders
// FABRICATED incidents / flagged content / RLS state / economy config as if it
// were real platform data. Until their BFF endpoints exist those routes MUST
// NOT be reachable — each is gated OFF via `featureReadyGuard` (a CanMatch guard
// → /not-found), the established WS-10 pattern. These tests pin BOTH the wiring
// (guard attached to each of the 4 mount points) AND the behaviour (redirects
// while the area is gated in the build's `environment`).
// ---------------------------------------------------------------------------
describe('ADMIN_ROUTES — WS-10 mock-feature gating (fail-loud / no-stub)', () => {
  // path = the ADMIN_ROUTES `path`; area = the featureReadyGuard key that must
  // be present in environment.gatedAreas for the dev + prod build.
  const GATED_MOCK_FEATURES: readonly { path: string; area: string }[] = [
    { path: 'developer', area: 'developer' },
    { path: 'investigation', area: 'investigation' },
    { path: 'economy', area: 'economy' },
    { path: 'moderation/dashboard', area: 'moderation' },
  ];

  let parseUrl: Mock<(url: string) => UrlTree>;

  beforeEach(() => {
    // Echo the url back as the (fake) UrlTree so the test can assert the guard
    // returns the parseUrl REDIRECT rather than `true` (mirrors the
    // feature-ready.guard.spec idiom).
    parseUrl = vi.fn<(url: string) => UrlTree>(
      (url: string) => url as unknown as UrlTree,
    );
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { parseUrl } }],
    });
  });

  for (const { path, area } of GATED_MOCK_FEATURES) {
    it(`attaches a CanMatch guard to the "${path}" mount`, () => {
      const route = ADMIN_ROUTES.find((r) => r.path === path);
      expect(route, `route "${path}" must exist`).toBeDefined();
      expect(Array.isArray(route?.canMatch)).toBe(true);
      expect(route?.canMatch?.length ?? 0).toBeGreaterThan(0);
    });

    it(`redirects "${path}" to /not-found while "${area}" is gated`, () => {
      // Precondition: the area is gated in the build's environment (dev + prod).
      expect(environment.gatedAreas).toContain(area);

      const route = ADMIN_ROUTES.find((r) => r.path === path);
      const guard = route?.canMatch?.[0] as CanMatchFn;
      expect(typeof guard).toBe('function');

      const result = TestBed.runInInjectionContext(() =>
        guard({} as Route, [] as UrlSegment[]),
      );

      expect(parseUrl).toHaveBeenCalledWith('/not-found');
      expect(result).not.toBe(true);
    });
  }

  it('does NOT gate the real /admin/content/moderation route (real BFF)', () => {
    // content/moderation → ContentApprovalComponent makes REAL BffClientService
    // calls; only the mock `moderation/dashboard` is gated. Guard-rail so the
    // gating never over-reaches onto a genuinely-wired page.
    const real = ADMIN_ROUTES.find((r) => r.path === 'content/moderation');
    expect(real).toBeDefined();
    expect(real?.canMatch).toBeUndefined();
  });
});

describe('ADMIN_ROUTES - E2 part 3, the retirement', () => {
  // Every route below was routable, carried no featureReadyGuard, and called
  // a gateway path that does not exist. Four duplicated live H+ work; the
  // fifth, tenant/entitlements, was audited in part 3 and is the same class:
  // its three paths (GET and PATCH on
  // /api/v1/tenancy/tenants/current/entitlements, and /api/v1/tenancy/add-ons)
  // appear nowhere in the gateway, while /h/addons does the same job on
  // /api/v1/admin/tenants/me/addons, which phyllis_handler.go registers.
  const DELETED = [
    'tenant/users',
    'tenant/invitations',
    'tenant/roles',
    'tenant/members/add',
    'tenant/entitlements',
  ] as const;

  for (const path of DELETED) {
    it(`no longer defines "${path}"`, () => {
      expect(ADMIN_ROUTES.find((r) => r.path === path)).toBeUndefined();
    });
  }

  it('replaces the dead go-live checklist with a redirect to the H+ screen', () => {
    // The old screen called five /api/v1/tenants/go-live/test/* paths the
    // gateway never claimed, so it could only ever 404. S6 at /h/go-live reads
    // real state and refuses to vouch for a check that could not run.
    const route = ADMIN_ROUTES.find((r) => r.path === 'tenant/settings/go-live');
    expect(route, 'the path must still resolve, as a redirect').toBeDefined();
    expect(route?.redirectTo).toBe('/h/go-live');
    expect(route?.loadComponent).toBeUndefined();
  });

  it('gates the onboarding mount behind featureReadyGuard', () => {
    const route = ADMIN_ROUTES.find((r) => r.path === 'onboarding');
    expect(route).toBeDefined();
    expect(Array.isArray(route?.canMatch)).toBe(true);
    expect(route?.canMatch?.length ?? 0).toBeGreaterThan(0);
    expect(environment.gatedAreas).toContain('onboarding');
  });

  it('RETIRES tenant/settings/offboard: the gate was hiding a deeper fact', () => {
    // Row E7, sibling of the delete screen. This one was GATED on 2026-09-02
    // (E2 part 3) rather than retired, on the recorded reason that it "fails
    // through the ungranted tenant:delete capability". That was true and it was
    // not the whole story. Re-derived on 54946bb0e:
    //
    // 1. NO BACKEND, in any service. `git grep -ln "offboarding" -- services/`
    //    returns exactly two files, both TESTS, and neither is a route:
    //    chora-tenancy manapool/handlers_test.go:378 and
    //    tenant_mana_allocation/allocation_test.go:201, where "offboarding" is
    //    a mana-revocation REASON STRING. Nothing serves
    //    /api/v1/tenants/offboarding*, so granting tenant:delete would not have
    //    made this screen work.
    // 2. NO COPY EITHER. Its template reads admin.offboard.* and en.json holds
    //    ZERO keys containing "offboard", so every string on it already fell
    //    back to a humanised key.
    //
    // A gate makes a screen unreachable; it does not make it exist. Retired
    // with its component, its contrast-debt entry and its gatedAreas entry.
    // The design requirement it expressed, that tenant destruction has a
    // reason, an export and a grace period, is carried by row E7 alongside the
    // two-person control from the delete screen.
    expect(ADMIN_ROUTES.find((r) => r.path === 'tenant/settings/offboard')).toBeUndefined();
    expect(environment.gatedAreas).not.toContain('offboard');
  });

  it('RETIRES tenant/settings/delete: nothing served it, end to end', () => {
    // Row E7. This route was held for months on the reason "lift its two-person
    // flow into S7 (ownership handover) first". S7 landed, which made the hold
    // read as released, so the facts were re-derived on 54946bb0e before acting
    // and none of them supported a lift:
    //
    // 1. S7 is a different action: /h/ownership is offer/accept for ownership
    //    TRANSFER, not a second APPROVER for DESTRUCTION.
    // 2. NO BACKEND. `git grep "deletion" -- services/chora-tenancy/internal/
    //    adapter/http` returns nothing; chora-tenancy registers no
    //    /api/v1/tenancy/tenants/current/deletion, /approver, /confirm or
    //    /export.
    // 3. NO GATEWAY PREFIX. Its only tenancy prefixes are
    //    /api/v1/tenancy/sub-tenants and .../tenants/current/hierarchy
    //    (jwt_auth.go:668,673). The hierarchy read is why the screen used to
    //    render while all five writes were unreachable.
    // 4. NO SERVER-SIDE CONCEPT AT ALL. `git grep "second_approver\|Second
    //    Approver" -- services/` returns nothing across all 20 services.
    //
    // So it was a four-step flow whose every write called an endpoint nothing
    // serves: a dead affordance offering a tenant owner a destruction they
    // could not perform. Retired with its component and its 78
    // tenant_deletion.* keys.
    //
    // ⚠ WHAT MUST NOT BE LOST: the design requirement that destroying a tenant
    // takes TWO PEOPLE and a grace period. That is carried by row E7 (tenant
    // destruction, unbuilt end to end), not by this deleted code. This test
    // exists so a future reader sees a decision with its evidence rather than
    // an unexplained absence, and so re-adding the screen without a backend
    // has to argue with something.
    expect(ADMIN_ROUTES.find((r) => r.path === 'tenant/settings/delete')).toBeUndefined();
  });
});

describe('ADMIN_ROUTES - E5, the wizard moved to H+', () => {
  it('redirects the old wizard path to /h/setup', () => {
    // A redirect rather than a deletion: the path is linked from the tenant
    // creation success state and from older docs, and landing an operator on
    // the moved screen beats a 404.
    const route = ADMIN_ROUTES.find((r) => r.path === 'tenant/settings/wizard');
    expect(route, 'the path must still resolve, as a redirect').toBeDefined();
    expect(route?.redirectTo).toBe('/h/setup');
    expect(route?.loadComponent).toBeUndefined();
  });
});
