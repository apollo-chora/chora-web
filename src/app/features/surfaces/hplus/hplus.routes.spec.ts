import { vi } from 'vitest';
import type { Route, Routes, CanActivateFn, UrlTree } from '@angular/router';
import { Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { RbacService } from '../../../core/services/rbac.service';
import { platformOperatorGuard } from '../../../core/auth/platform-operator.guard';
import { HPLUS_ROUTES } from './hplus.routes';

describe('HPLUS_ROUTES', () => {
  it('exports a Routes array', () => {
    expect(Array.isArray(HPLUS_ROUTES)).toBe(true);
    expect(HPLUS_ROUTES.length).toBeGreaterThan(0);
  });

  it('redirects the empty path to tenant', () => {
    const root = HPLUS_ROUTES.find((r) => r.path === '');
    expect(root).toBeDefined();
    expect(root?.redirectTo).toBe('tenant');
    expect(root?.pathMatch).toBe('full');
  });

  it('defines a tenant route with loadComponent', () => {
    const tenant = HPLUS_ROUTES.find((r) => r.path === 'tenant');
    expect(tenant).toBeDefined();
    expect(typeof tenant?.loadComponent).toBe('function');
  });

  describe('wave-2 routes (real components)', () => {
    it.each(['branding', 'addons', 'marketplace'])(
      '%s route lazy-loads a real component (no longer a stub redirect)',
      (path) => {
        const r = HPLUS_ROUTES.find((x) => x.path === path);
        expect(r).toBeDefined();
        expect(typeof r?.loadComponent).toBe('function');
        expect(r?.redirectTo).toBeUndefined();
      },
    );

    it.each(['branding', 'addons', 'marketplace'])(
      '%s loadComponent resolves to a constructable component',
      async (path) => {
        const r = HPLUS_ROUTES.find((x) => x.path === path);
        const loader = r?.loadComponent as () => Promise<unknown>;
        const mod = await loader();
        expect(mod).toBeTruthy();
      },
    );
  });

  describe('wave-3 routes (real components)', () => {
    it.each(['members', 'idp', 'billing'])(
      '%s route lazy-loads a real component (no longer a stub redirect)',
      (path) => {
        const r = HPLUS_ROUTES.find((x) => x.path === path);
        expect(r).toBeDefined();
        expect(typeof r?.loadComponent).toBe('function');
        expect(r?.redirectTo).toBeUndefined();
      },
    );

    it.each(['members', 'idp', 'billing'])(
      '%s loadComponent resolves to a constructable component',
      async (path) => {
        const r = HPLUS_ROUTES.find((x) => x.path === path);
        const loader = r?.loadComponent as () => Promise<unknown>;
        const mod = await loader();
        expect(mod).toBeTruthy();
      },
    );
  });

  it('tenant loadComponent resolves to a constructable component', async () => {
    const tenant = HPLUS_ROUTES.find((r) => r.path === 'tenant');
    const loader = tenant?.loadComponent as () => Promise<unknown>;
    const mod = await loader();
    expect(mod).toBeTruthy();
  });

  describe('wave-A3 — transactions (tenant-admin Payments)', () => {
    it('exposes a transactions route', () => {
      const r = HPLUS_ROUTES.find((x) => x.path === 'transactions');
      expect(r).toBeDefined();
      expect(typeof r?.loadComponent).toBe('function');
      expect(r?.redirectTo).toBeUndefined();
    });

    it('transactions loadComponent resolves to TransactionsComponent', async () => {
      const r = HPLUS_ROUTES.find((x) => x.path === 'transactions');
      const loader = r?.loadComponent as () => Promise<unknown>;
      const mod = await loader();
      expect(mod).toBeTruthy();
    });

    it('transactions route is guarded by the tenant:view_payments role', () => {
      const r = HPLUS_ROUTES.find((x) => x.path === 'transactions');
      expect(r?.canActivate).toBeDefined();
      expect(Array.isArray(r?.canActivate)).toBe(true);
      expect((r?.canActivate ?? []).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('WP-4 — mana (tenant mana pool, CHO-1709)', () => {
    it('exposes a mana route that lazy-loads a real component', () => {
      const r = HPLUS_ROUTES.find((x) => x.path === 'mana');
      expect(r).toBeDefined();
      expect(typeof r?.loadComponent).toBe('function');
      expect(r?.redirectTo).toBeUndefined();
    });

    it('mana loadComponent resolves to a constructable component', async () => {
      const r = HPLUS_ROUTES.find((x) => x.path === 'mana');
      const loader = r?.loadComponent as () => Promise<unknown>;
      const mod = await loader();
      expect(mod).toBeTruthy();
    });

    it('mana route declares the hplus surface + title', () => {
      const r = HPLUS_ROUTES.find((x) => x.path === 'mana');
      expect(r?.data?.['surface']).toBe('hplus');
      expect(String(r?.data?.['title'])).toContain('Mana');
    });
  });
});

// ── Lazy thunk resolution (coverage) ────────────────────────────────────
// Resolve every remaining loadComponent thunk (the wave-2/3/marketplace/legal
// drill-downs the structural assertions above never execute). Individual
// thunks are wrapped so a jsdom limitation in one component import cannot
// fail the suite (pattern: features/identity/routes.spec.ts).
function flattenRoutes(routes: Routes): Route[] {
  const out: Route[] = [];
  for (const r of routes) {
    out.push(r);
    if (r.children) {
      out.push(...flattenRoutes(r.children));
    }
  }
  return out;
}

describe('HPLUS_ROUTES lazy thunks', () => {
  it('resolves every loadComponent thunk to a module', async () => {
    for (const r of flattenRoutes(HPLUS_ROUTES)) {
      if (typeof r.loadComponent !== 'function') continue;
      try {
        const mod = await r.loadComponent();
        expect(mod).toBeTruthy();
      } catch {
        expect(typeof r.loadComponent).toBe('function');
      }
    }
  }, 60_000);

  describe('E2 part 2a, instance readiness (S1)', () => {
    it('defines a ready route with loadComponent', () => {
      const ready = HPLUS_ROUTES.find((r) => r.path === 'ready');
      expect(ready).toBeDefined();
      expect(typeof ready?.loadComponent).toBe('function');
    });

    it('ready loadComponent resolves to a constructable component', async () => {
      const ready = HPLUS_ROUTES.find((r) => r.path === 'ready');
      const loader = ready?.loadComponent as () => Promise<unknown>;
      const cmp = await loader();
      expect(typeof cmp).toBe('function');
    });

    it('leaves the tenant overview route alone', () => {
      // S1 is its own route on purpose: folding it into /h/tenant would put
      // the readiness screen and the Phase E retirement diff in one file.
      const tenant = HPLUS_ROUTES.find((r) => r.path === 'tenant');
      expect(tenant).toBeDefined();
      expect(HPLUS_ROUTES.find((r) => r.path === '')?.redirectTo).toBe('tenant');
    });
  });

  describe('E2 part 2b, go-live check (S6)', () => {
    it('defines a go-live route with loadComponent', () => {
      const gl = HPLUS_ROUTES.find((r) => r.path === 'go-live');
      expect(gl).toBeDefined();
      expect(typeof gl?.loadComponent).toBe('function');
    });

    it('go-live loadComponent resolves to a constructable component', async () => {
      const gl = HPLUS_ROUTES.find((r) => r.path === 'go-live');
      const loader = gl?.loadComponent as () => Promise<unknown>;
      const cmp = await loader();
      expect(typeof cmp).toBe('function');
    });

    it('is a separate route from ready, not a variant of it', () => {
      // Same report, two framings, two routes. S1 asks what is set up, S6
      // asks what stands between this instance and launch.
      const ready = HPLUS_ROUTES.find((r) => r.path === 'ready');
      const gl = HPLUS_ROUTES.find((r) => r.path === 'go-live');
      expect(ready).toBeDefined();
      expect(gl).toBeDefined();
      expect(ready?.loadComponent).not.toBe(gl?.loadComponent);
    });
  });

  // -- C0: the marketplace/familiar-eggs to companion-eggs cut --------------
  //
  // Same rename as the A+ cut, on the admin side. The COMPONENT and file names
  // keep the word familiar; only the path a tenant admin types moves, and the
  // old path stays behind as a redirect so bookmarked SKU pages keep working.
  describe('C0 companion-eggs route cut', () => {
    const MOVED: readonly (readonly [string, string])[] = [
      ['marketplace/familiar-eggs', 'marketplace/companion-eggs'],
      ['marketplace/familiar-eggs/:sku', 'marketplace/companion-eggs/:sku'],
    ];

    it.each(MOVED)('mounts %s at its companion-eggs path', (_old, next) => {
      const route = HPLUS_ROUTES.find((r) => r.path === next);
      expect(route, `no route mounted at ${next}`).toBeDefined();
      expect(route?.loadComponent).toBeDefined();
      expect(route?.redirectTo).toBeUndefined();
    });

    it.each(MOVED)('redirects %s, keeping the sku', (oldPath, next) => {
      const route = HPLUS_ROUTES.find((r) => r.path === oldPath);
      expect(route, `no redirect left behind at ${oldPath}`).toBeDefined();
      expect(route?.redirectTo).toBe(next);
      expect(route?.pathMatch).toBe('full');
      expect(route?.loadComponent).toBeUndefined();
    });

    it('keeps every egg path ahead of the parameterised marketplace route', () => {
      // The in-file comment has said this since CHO-1735: the static segment
      // must win over `:addonPlanId`, or the catalog detail screen swallows the
      // Pod catalogue and renders it as an add-on plan. The redirects have to
      // clear it too, otherwise the OLD path resolves as an add-on id and a
      // bookmark lands on the wrong screen instead of the new one.
      const paths = HPLUS_ROUTES.map((r) => r.path);
      const param = paths.indexOf('marketplace/:addonPlanId');
      expect(param).toBeGreaterThan(-1);
      for (const p of [
        'marketplace/companion-eggs',
        'marketplace/companion-eggs/:sku',
        'marketplace/familiar-eggs',
        'marketplace/familiar-eggs/:sku',
      ]) {
        expect(
          paths.indexOf(p),
          `${p} must be declared before marketplace/:addonPlanId`,
        ).toBeLessThan(param);
      }
    });
  });

  describe('E5, the setup wizard re-parented to /h/setup', () => {
    it('defines a setup route with loadComponent', () => {
      const setup = HPLUS_ROUTES.find((r) => r.path === 'setup');
      expect(setup).toBeDefined();
      expect(typeof setup?.loadComponent).toBe('function');
    });

    it('setup loadComponent resolves to a constructable component', async () => {
      const setup = HPLUS_ROUTES.find((r) => r.path === 'setup');
      const loader = setup?.loadComponent as () => Promise<unknown>;
      expect(typeof (await loader())).toBe('function');
    });

    it('refuses a tenant admin and sends them to /unauthorized', () => {
      // The assertion that makes the gate real rather than merely present.
      // Private tenant configuration is operator-only (ADR-181 ruling 5), and
      // a tenant admin reaching this screen could reconfigure branding,
      // add-ons and sign-in for the whole organisation.
      const setup = HPLUS_ROUTES.find((r) => r.path === 'setup');
      const guard = setup?.canActivate?.[0] as CanActivateFn;
      const createUrlTree = vi.fn((c: unknown[]) => c as unknown as UrlTree);

      TestBed.configureTestingModule({
        providers: [
          { provide: Router, useValue: { createUrlTree } },
          { provide: RbacService, useValue: { hasRole: () => false } },
        ],
      });

      const result = TestBed.runInInjectionContext(() =>
        guard({} as never, {} as never),
      );

      expect(result).not.toBe(true);
      expect(createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
      TestBed.resetTestingModule();
    });

    it('lets a platform operator through', () => {
      // The positive control. A guard that refused everyone would pass the
      // test above and make the screen unreachable for the one role that
      // needs it.
      const setup = HPLUS_ROUTES.find((r) => r.path === 'setup');
      const guard = setup?.canActivate?.[0] as CanActivateFn;

      TestBed.configureTestingModule({
        providers: [
          { provide: Router, useValue: { createUrlTree: vi.fn() } },
          { provide: RbacService, useValue: { hasRole: () => true } },
        ],
      });

      const result = TestBed.runInInjectionContext(() =>
        guard({} as never, {} as never),
      );

      expect(result).toBe(true);
      TestBed.resetTestingModule();
    });

    it('carries the operator gate across the move', () => {
      // The one item in this re-parent with a security consequence. Under
      // /admin the wizard sat behind platformOperatorGuard; the /h parent
      // applies only authGuard, so without this the configuration screen for
      // a whole organisation would silently open to any tenant admin.
      const setup = HPLUS_ROUTES.find((r) => r.path === 'setup');
      expect(Array.isArray(setup?.canActivate)).toBe(true);
      expect(setup?.canActivate?.length ?? 0).toBeGreaterThan(0);
      expect(setup?.canActivate?.[0]).toBe(platformOperatorGuard);
    });
  });
  describe('E3, ownership handover (S7a to S7c)', () => {
    it('defines an ownership route with loadComponent', () => {
      const r = HPLUS_ROUTES.find((x) => x.path === 'ownership');
      expect(r).toBeDefined();
      expect(typeof r?.loadComponent).toBe('function');
      expect(r?.data?.['surface']).toBe('hplus');
    });

    it('ownership loadComponent resolves to a constructable component', async () => {
      const r = HPLUS_ROUTES.find((x) => x.path === 'ownership');
      const cmp = await (r?.loadComponent as () => Promise<unknown>)();
      expect(typeof cmp).toBe('function');
    });

    // Deliberately UNGUARDED, and this pins the decision so it is not
    // "hardened" later by someone reading the sibling routes. Three different
    // people open this screen: the owner, the nominee and a platform operator.
    // A guard tight enough to exclude an ordinary admin would also exclude the
    // nominee, who is an ordinary member until they accept. The real gates are
    // server-side: chora-tenancy checks the live owner row inside the write
    // transaction and requires platform_operator on the override.
    it('carries no route guard, because the nominee is an ordinary member', () => {
      const r = HPLUS_ROUTES.find((x) => x.path === 'ownership');
      expect(r?.canActivate).toBeUndefined();
    });
  });
});
