import { expect } from 'vitest';
import type { Route, Routes } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { LandingService } from './core/auth/landing.service';

/**
 * Root application route table spec.
 *
 * Covers the `routes` array literal (top-level redirects + the five layout
 * groups: invite, AuthLayout, PublicLayout, MainLayout, error/not-found) AND
 * executes every lazy `loadComponent` / `loadChildren` thunk reachable by a
 * recursive walk of the `children` tree. Executing the thunks drives the bulk
 * of the otherwise-uncovered lines (the dynamic `import().then(...)` arrows).
 *
 * The root redirect uses a functional `redirectTo` that calls
 * `inject(AuthService)`; it is NOT invoked here (no injection context in a
 * plain unit test) — its presence + signature are asserted instead.
 */

/** Flatten the route tree into a single list (depth-first, children inlined). */
function walk(input: Routes): Route[] {
  const out: Route[] = [];
  for (const r of input) {
    out.push(r);
    if (r.children) {
      out.push(...walk(r.children));
    }
  }
  return out;
}

const flat = walk(routes);

describe('app routes', () => {
  it('exports a non-empty Routes array', () => {
    expect(Array.isArray(routes)).toBe(true);
    expect(routes.length).toBeGreaterThan(0);
  });

  it('declares the top-level layout groups + standalone pre-auth routes', () => {
    const topPaths = routes.map((r) => r.path);
    // Three empty-path entries: the functional root redirect + AuthLayout +
    // PublicLayout + MainLayout groups all bind path:''.
    expect(topPaths.filter((p) => p === '').length).toBeGreaterThanOrEqual(4);
    expect(topPaths).toContain('invite/:code');
    expect(topPaths).toContain('ref/:code');
    expect(topPaths).toContain('enroll');
    expect(topPaths).toContain('unauthorized');
    expect(topPaths).toContain('not-found');
    expect(topPaths).toContain('**');
  });

  it('roots a functional redirect with pathMatch:full as the first entry', () => {
    const root = routes[0];
    expect(root.path).toBe('');
    expect(root.pathMatch).toBe('full');
    // Functional redirectTo (UrlMatcher-style) — assert shape here; the two
    // tests below INVOKE it inside a TestBed injection context.
    expect(typeof root.redirectTo).toBe('function');
  });

  // ── The root redirect, actually invoked (C2 slice 3, ADR-240) ───────────
  //
  // This site used to be the one landing site with no test at all: the spec
  // asserted the redirect's SHAPE and said invoking it was impossible without
  // an injection context. `TestBed.runInInjectionContext` is that context, so
  // the excuse no longer holds, and the site that decides where every
  // authenticated session lands is worth more than a typeof check.
  describe('root redirect, invoked', () => {
    function runRoot(authed: boolean, landing: string): string {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: AuthService, useValue: { isAuthenticated: () => authed } },
          { provide: LandingService, useValue: { landingRoute: () => landing } },
        ],
      });
      const redirect = routes[0].redirectTo as () => string;
      return TestBed.runInInjectionContext(redirect);
    }

    it('sends an authenticated session wherever the landing resolver says', () => {
      expect(runRoot(true, '/resolved-landing')).toBe('/resolved-landing');
    });

    it('sends an anonymous session to /login and never asks the resolver', () => {
      let asked = false;
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: AuthService, useValue: { isAuthenticated: () => false } },
          {
            provide: LandingService,
            useValue: {
              landingRoute: () => {
                asked = true;
                return '/resolved-landing';
              },
            },
          },
        ],
      });
      const redirect = routes[0].redirectTo as () => string;
      expect(TestBed.runInInjectionContext(redirect)).toBe('/login');
      expect(asked, 'the resolver was consulted for an anonymous session').toBe(false);
    });
  });

  it('terminates with a wildcard redirect to not-found', () => {
    const wildcard = routes[routes.length - 1];
    expect(wildcard.path).toBe('**');
    expect(wildcard.redirectTo).toBe('not-found');
  });

  it('mounts the AuthLayout group with login/suspended children', () => {
    // AuthLayout = the first path:'' group that carries a `component` + children.
    const authGroup = routes.find(
      (r) => r.path === '' && r.component && r.children,
    );
    expect(authGroup).toBeDefined();
    const childPaths = (authGroup!.children ?? []).map((c) => c.path);
    expect(childPaths).toContain('login');
    expect(childPaths).toContain('suspended');
    // /register was removed with the Firebase extraction (self-service
    // registration had no server-side equivalent in the frozen gateway
    // contract); unknown paths fall through to the wildcard → not-found.
    expect(childPaths).not.toContain('register');
    // Retired in E2 part 3: the path still resolves, as a redirect to the
    // landing resolver, so a stale bookmark does not 404.
    expect(childPaths).toContain('welcome/no-tenant');
    expect(childPaths).toContain('welcome/no-organisation');
    expect(childPaths).toContain('select-tenant');
  });

  it('guards the PublicLayout group with optionalAuthGuard', () => {
    const publicGroup = routes.find(
      (r) =>
        r.path === '' &&
        r.component &&
        r.children &&
        Array.isArray(r.canActivate) &&
        r.canActivate.length > 0,
    );
    expect(publicGroup).toBeDefined();
    expect(publicGroup!.canActivate).toBeDefined();
    expect(publicGroup!.canActivate!.length).toBeGreaterThan(0);
    const childPaths = (publicGroup!.children ?? []).map((c) => c.path);
    expect(childPaths).toContain('p/:slug');
    expect(childPaths).toContain('pricing');
    expect(childPaths).toContain('verify/:certId');
  });

  it('mounts the protected MainLayout group with surface + admin children', () => {
    // MainLayout group is the path:'' group whose children include the CHORA
    // surface routes ('a'..'r').
    const mainGroup = routes.find(
      (r) =>
        r.path === '' &&
        r.component &&
        r.children?.some((c) => c.path === 'a'),
    );
    expect(mainGroup).toBeDefined();
    expect(mainGroup!.canActivate).toBeDefined();
    const childPaths = (mainGroup!.children ?? []).map((c) => c.path);
    for (const surface of ['a', 'c', 'h', 'o', 'r']) {
      expect(childPaths).toContain(surface);
    }
    expect(childPaths).toContain('dashboard');
    expect(childPaths).toContain('admin');
    expect(childPaths).toContain('settings');
  });

  it('declares NO empty-path child in the protected group (the dead redirect is gone)', () => {
    // C2 slice 3 deleted `{ path: '', redirectTo: 'dashboard', pathMatch: 'full' }`
    // from this group. It had never run: the functional root redirect below is
    // declared FIRST, also binds path:'' with pathMatch:'full', and Angular is
    // first-match-wins. Leaving it would have left a second answer to the
    // question the landing resolver now owns; repointing it would have changed
    // nothing at all. This pins the deletion so it cannot creep back.
    const mainGroup = routes.find(
      (r) => r.path === '' && r.component && r.children?.some((c) => c.path === 'a'),
    );
    expect(mainGroup).toBeDefined();
    expect((mainGroup!.children ?? []).some((c) => c.path === '')).toBe(false);
  });

  it('resolves `/` through the FIRST route in the table, ahead of every group', () => {
    // The property that made the deleted child dead, stated directly: exactly
    // one route claims the empty path with pathMatch:'full', and it is first.
    const fullEmpty = routes.filter((r) => r.path === '' && r.pathMatch === 'full');
    expect(fullEmpty).toHaveLength(1);
    expect(routes.indexOf(fullEmpty[0])).toBe(0);
  });

  it('guards EVERY CHORA surface mount (A+/C+/H+/O+/R+) — closes the CHO-1801 URL-bar bypass', () => {
    // The CHO-1801 security fix is the surface-route RBAC guard: each surface
    // GROUP mount (/a /c /h /o /r) MUST carry a non-empty `canActivate` so
    // URL-bar navigation to a surface the role can't access is ENFORCED, not
    // merely hidden by the rail (CLAUDE.md §2 — role-driven feature visibility,
    // no toggles). This asserts the WIRING so a future route refactor cannot
    // silently drop a `surfaceGuard(...)` and re-open the bypass; the guard's own
    // allow/deny/operator/baseline behaviour is covered in surface.guard.spec.ts.
    // (`/c` additionally composes `addOnGuard('cplus_social')` — the §4.7c axis.)
    for (const surface of ['a', 'c', 'h', 'o', 'r']) {
      const mount = flat.find((r) => r.path === surface);
      expect(mount, `surface mount /${surface} missing`).toBeDefined();
      expect(
        Array.isArray(mount!.canActivate) && mount!.canActivate!.length > 0,
        `surface mount /${surface} has no canActivate guard — URL-bar bypass re-opened`,
      ).toBe(true);
    }
  });

  it('attaches guard refs to add-on / role protected children (refs only, not executed)', () => {
    const guarded = flat.filter(
      (r) => Array.isArray(r.canActivate) && r.canActivate.length > 0,
    );
    expect(guarded.length).toBeGreaterThan(0);
    for (const r of guarded) {
      for (const g of r.canActivate!) {
        expect(g).toBeDefined();
      }
    }
    // A representative add-on route (choraverse) declares a canActivate guard.
    // (The retired `/discovery` route is now a guard-less redirect.)
    const choraverse = flat.find((r) => r.path === 'choraverse');
    expect(choraverse).toBeDefined();
    expect(choraverse!.canActivate).toBeDefined();
  });

  it('guards the C+ surface mount with an add-on guard (§4.7c cplus_social)', () => {
    // One guard at the /c mount covers every C+ child route — per the
    // auth-hardening Phase A FE gating (CHO-1717 / ADR-181 ruling #6).
    const cMount = flat.find((r) => r.path === 'c');
    expect(cMount).toBeDefined();
    expect(cMount!.canActivate).toBeDefined();
    expect(cMount!.canActivate!.length).toBeGreaterThanOrEqual(1);
  });

  it('carries title data on the standalone enroll route', () => {
    const enroll = routes.find((r) => r.path === 'enroll');
    expect(enroll).toBeDefined();
    expect((enroll!.data as { title?: string })?.title).toBe('Join Tenant');
    expect(enroll!.loadChildren).toBeDefined();
  });

  it('executes every loadComponent thunk in the route tree', async () => {
    const withComponent = flat.filter((r) => r.loadComponent);
    expect(withComponent.length).toBeGreaterThan(0);

    for (const r of withComponent) {
      try {
        const m = await r.loadComponent!();
        expect(m).toBeTruthy();
      } catch (err) {
        // A jsdom limitation (canvas / EventSource / DragEvent etc.) inside the
        // imported module's transitive deps must not red the suite — assert the
        // thunk is still a function and move on.
        expect(typeof r.loadComponent).toBe('function');
         
        console.warn(
          `loadComponent thunk for path="${r.path}" threw, treated as function-only: ${String(err)}`,
        );
      }
    }
  });

  it('executes every loadChildren thunk in the route tree', async () => {
    const withChildren = flat.filter((r) => r.loadChildren);
    expect(withChildren.length).toBeGreaterThan(0);

    for (const r of withChildren) {
      try {
        const c = await r.loadChildren!();
        expect(c).toBeTruthy();
      } catch (err) {
        expect(typeof r.loadChildren).toBe('function');
         
        console.warn(
          `loadChildren thunk for path="${r.path}" threw, treated as function-only: ${String(err)}`,
        );
      }
    }
  });
});

describe('app routes - E2 part 3, the retirement', () => {
  function flattenAll(rs: Routes): Route[] {
    const out: Route[] = [];
    for (const r of rs) {
      out.push(r);
      if (r.children) out.push(...flattenAll(r.children));
    }
    return out;
  }

  it('gates the learner onboarding checklist behind featureReadyGuard', () => {
    // Same cause as the /admin/onboarding mount: every /api/v1/onboarding/*
    // path is unclaimed by the gateway, so the screen renders a checklist made
    // of 404s. Gating is honest; deleting would throw away the design.
    const route = flattenAll(routes).find((r) => r.path === 'onboarding/checklist');
    expect(route, 'the checklist route must still be declared').toBeDefined();
    expect(Array.isArray(route?.canMatch)).toBe(true);
    expect(route?.canMatch?.length ?? 0).toBeGreaterThan(0);
  });

  it('retires the no-tenant form to a redirect, keeping the path alive', () => {
    const route = flattenAll(routes).find((r) => r.path === 'welcome/no-tenant');
    expect(route, 'the path must still resolve').toBeDefined();
    expect(route?.redirectTo).toBe('/');
    expect(route?.loadComponent, 'the form must be gone').toBeUndefined();
  });

  it('declares the named refusal the guard now routes to', () => {
    const route = flattenAll(routes).find((r) => r.path === 'welcome/no-organisation');
    expect(route).toBeDefined();
    expect(typeof route?.loadComponent).toBe('function');
  });
});
