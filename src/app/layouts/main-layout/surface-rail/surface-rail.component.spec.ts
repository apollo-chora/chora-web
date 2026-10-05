import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateService } from '../../../core/services/translate.service';
import { FeatureFlagService } from '../../../core/services/feature-flag.service';
import { RbacService } from '../../../core/services/rbac.service';
import {
  TenantContextService,
  type TenantContext,
} from '../../../core/auth/tenant-context.service';
import { SurfaceRailComponent } from './surface-rail.component';

function buildTenant(
  id: string,
  overrides: Partial<TenantContext> = {},
): TenantContext {
  return { id, name: id, slug: id, logoUrl: null, ...overrides };
}

interface SetupOpts {
  /** Session holds the `platform_operator` role (ADR-165 god-mode). */
  readonly operator?: boolean;
  /** Active tenant is entitled to the `cplus_social` add-on. */
  readonly cplusSocial?: boolean;
  /**
   * Surfaces on the seeded active membership. Defaults to all five so the
   * structural, a11y and accent tests assert a five-chip rail for the RIGHT
   * reason (the session genuinely holds all five) rather than by riding the
   * old fail-open. Pass `null` to seed NO tenant context at all, which is
   * how the fail-CLOSED and union paths are exercised.
   */
  readonly surfaces?: readonly string[] | null;
  /**
   * Roles on the session (R39). Defaults to `['admin']` so the structural,
   * a11y and accent tests keep asserting a rendered rail for the RIGHT reason
   * (an admin is rail-eligible) rather than by riding the pre-R39 world where
   * every session saw one. The role-gate block drives this explicitly.
   */
  readonly roles?: readonly string[];
}

/** Every surface, for the default seeded membership. */
const ALL_SURFACES = ['aplus', 'cplus', 'hplus', 'oplus', 'rplus'] as const;

function setup(
  url = '/a/dashboard',
  opts: SetupOpts = {},
): {
  fixture: ComponentFixture<SurfaceRailComponent>;
  el: HTMLElement;
  router: Router;
  tenantContext: TenantContextService;
  flags: FeatureFlagService;
} {
  const operator = opts.operator ?? false;
  // Default to an ENTITLED tenant so the structural/a11y/accent tests keep
  // asserting the full 5-surface rail; the add-on-gate describe block flips
  // this off explicitly.
  const cplusSocial = opts.cplusSocial ?? true;
  const roles = new Set(
    (opts.roles ?? ['admin']).map((r) => r.trim().toLowerCase()),
  );
  if (operator) roles.add('platform_operator');
  TestBed.configureTestingModule({
    imports: [SurfaceRailComponent],
    providers: [
      provideRouter([
        { path: 'a/dashboard', children: [] },
        { path: 'c/feed', children: [] },
        { path: 'h/tenant', children: [] },
        { path: 'o/dashboard', children: [] },
        { path: 'r/roster', children: [] },
      ]),
      TranslateService,
      FeatureFlagService,
      {
        // Stub RbacService — the real one pulls the AuthService/HttpClient
        // chain. The rail only reads `hasRole('platform_operator')`.
        provide: RbacService,
        useValue: {
          hasRole: (role: string) => roles.has(role.trim().toLowerCase()),
          hasCapability: () => false,
        },
      },
    ],
  });
  const router = TestBed.inject(Router);
  const tenantContext = TestBed.inject(TenantContextService);
  const flags = TestBed.inject(FeatureFlagService);
  flags.setFlags({ cplus_social: cplusSocial });
  vi.spyOn(router, 'url', 'get').mockReturnValue(url);
  const seedSurfaces =
    opts.surfaces === undefined ? [...ALL_SURFACES] : opts.surfaces;
  if (seedSurfaces !== null) {
    tenantContext.setCurrentTenant(
      // Copied rather than passed through: `TenantContext.surfaces` is a
      // mutable array and the option is readonly.
      buildTenant('seed-tenant', { surfaces: [...seedSurfaces] }),
    );
  }
  const fixture = TestBed.createComponent(SurfaceRailComponent);
  fixture.detectChanges();
  return {
    fixture,
    el: fixture.nativeElement as HTMLElement,
    router,
    tenantContext,
    flags,
  };
}

describe('SurfaceRailComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('rendering', () => {
    it('renders the root rail element', () => {
      const { el } = setup();
      expect(el.querySelector('[data-testid="surface-rail"]')).not.toBeNull();
    });

    it('renders one chip per CHORA surface (5 total)', () => {
      const { el } = setup();
      const chips = el.querySelectorAll('[data-testid^="surface-rail-chip-"]');
      expect(chips.length).toBe(5);
    });

    it('renders the CHORA letters C H O R A in brand spelling order', () => {
      const { el } = setup();
      const letters = Array.from(
        el.querySelectorAll('[data-testid^="surface-rail-letter-"]'),
      ).map((n) => (n.textContent ?? '').trim());
      expect(letters).toEqual(['C', 'H', 'O', 'R', 'A']);
      expect(letters.join('')).toBe('CHORA');
    });

    it('every chip is an anchor with a routerLink to that surface landing route', () => {
      const { el } = setup();
      const expected: Record<string, string> = {
        aplus: '/a/home',
        cplus: '/c/feed',
        hplus: '/h/tenant',
        oplus: '/o/dashboard',
        rplus: '/r/offerings',
      };
      for (const [surface, target] of Object.entries(expected)) {
        const chip = el.querySelector(
          `[data-testid="surface-rail-chip-${surface}"]`,
        ) as HTMLAnchorElement | null;
        expect(chip, surface).not.toBeNull();
        expect(chip!.getAttribute('href')).toBe(target);
      }
    });
  });

  describe('active surface', () => {
    it('marks A+ as active when on /a/* route', () => {
      const { el } = setup('/a/dashboard');
      const aplus = el.querySelector('[data-testid="surface-rail-chip-aplus"]');
      expect(aplus?.getAttribute('aria-current')).toBe('page');
    });

    it('marks C+ as active when on /c/* route', () => {
      const { el } = setup('/c/feed');
      const cplus = el.querySelector('[data-testid="surface-rail-chip-cplus"]');
      expect(cplus?.getAttribute('aria-current')).toBe('page');
    });

    it('marks H+ as active when on /h/* route', () => {
      const { el } = setup('/h/tenant');
      const hplus = el.querySelector('[data-testid="surface-rail-chip-hplus"]');
      expect(hplus?.getAttribute('aria-current')).toBe('page');
    });

    it('marks O+ as active when on /o/* route', () => {
      const { el } = setup('/o/dashboard');
      const oplus = el.querySelector('[data-testid="surface-rail-chip-oplus"]');
      expect(oplus?.getAttribute('aria-current')).toBe('page');
    });

    it('marks R+ as active when on /r/* route', () => {
      const { el } = setup('/r/offerings');
      const rplus = el.querySelector('[data-testid="surface-rail-chip-rplus"]');
      expect(rplus?.getAttribute('aria-current')).toBe('page');
    });

    it('falls back to A+ active on legacy unprefixed routes', () => {
      const { el } = setup('/dashboard');
      const aplus = el.querySelector('[data-testid="surface-rail-chip-aplus"]');
      expect(aplus?.getAttribute('aria-current')).toBe('page');
    });

    it('non-active chips do not carry aria-current', () => {
      const { el } = setup('/a/dashboard');
      const cplus = el.querySelector('[data-testid="surface-rail-chip-cplus"]');
      expect(cplus?.getAttribute('aria-current')).toBeNull();
    });
  });

  describe('a11y', () => {
    it('uses <nav> with an aria-label', () => {
      const { el } = setup();
      const rail = el.querySelector('[data-testid="surface-rail"]');
      expect(rail?.tagName).toBe('NAV');
      expect(rail?.getAttribute('aria-label')).toBeTruthy();
    });

    it('each chip has an aria-label distinct from its visible letter', () => {
      const { el } = setup();
      const chip = el.querySelector(
        '[data-testid="surface-rail-chip-aplus"]',
      ) as HTMLAnchorElement;
      expect(chip.getAttribute('aria-label')).toBeTruthy();
      expect(chip.getAttribute('aria-label')).not.toBe('A');
    });
  });

  describe('surface accent', () => {
    it('chip carries surface-{key} class for accent styling', () => {
      const { el } = setup();
      const aplus = el.querySelector('[data-testid="surface-rail-chip-aplus"]');
      expect(aplus?.className).toContain('surface-rail__chip--aplus');
    });

    it('each chip carries its own surface-{key} accent class', () => {
      const { el } = setup();
      for (const key of ['aplus', 'cplus', 'hplus', 'oplus', 'rplus']) {
        const chip = el.querySelector(
          `[data-testid="surface-rail-chip-${key}"]`,
        );
        expect(chip?.className, key).toContain(`surface-rail__chip--${key}`);
      }
    });

    it('active chip carries the --active modifier class', () => {
      const { el } = setup('/o/dashboard');
      const oplus = el.querySelector('[data-testid="surface-rail-chip-oplus"]');
      expect(oplus?.className).toContain('surface-rail__chip--active');
    });

    it('non-active chip omits the --active modifier class', () => {
      const { el } = setup('/o/dashboard');
      const aplus = el.querySelector('[data-testid="surface-rail-chip-aplus"]');
      expect(aplus?.className).not.toContain('surface-rail__chip--active');
    });
  });

  describe('short-name labels', () => {
    it('renders an sr-only short name per surface in CHORA order', () => {
      const { el } = setup();
      const shorts = Array.from(
        el.querySelectorAll('.surface-rail__short'),
      ).map((n) => (n.textContent ?? '').trim());
      expect(shorts).toEqual(['C+', 'H+', 'O+', 'R+', 'A+']);
    });

    it('short-name span is screen-reader-only (sr-only) while the letter is aria-hidden', () => {
      const { el } = setup();
      const aplusChip = el.querySelector(
        '[data-testid="surface-rail-chip-aplus"]',
      ) as HTMLElement;
      const letter = aplusChip.querySelector(
        '[data-testid="surface-rail-letter-aplus"]',
      ) as HTMLElement;
      const short = aplusChip.querySelector('.surface-rail__short') as HTMLElement;
      expect(letter.getAttribute('aria-hidden')).toBe('true');
      expect(short.className).toContain('sr-only');
    });
  });

  describe('isActive method', () => {
    it('returns true only for the surface matching the current URL', () => {
      const { fixture } = setup('/h/tenant');
      const cmp = fixture.componentInstance;
      expect(cmp.isActive('hplus')).toBe(true);
      expect(cmp.isActive('aplus')).toBe(false);
      expect(cmp.isActive('cplus')).toBe(false);
      expect(cmp.isActive('oplus')).toBe(false);
      expect(cmp.isActive('rplus')).toBe(false);
    });

    it('exposes the computed activeSurface signal matching the URL', () => {
      const { fixture } = setup('/r/offerings');
      expect(fixture.componentInstance.activeSurface()).toBe('rplus');
    });
  });

  describe('entries registry', () => {
    it('builds exactly five entries with key/letter/landing/ariaKey fields (membership holds all five)', () => {
      const { fixture } = setup();
      const entries = fixture.componentInstance.entries();
      expect(entries.length).toBe(5);
      expect(entries.map((e) => e.key)).toEqual([
        'cplus',
        'hplus',
        'oplus',
        'rplus',
        'aplus',
      ]);
      expect(entries.map((e) => e.letter).join('')).toBe('CHORA');
      const aplus = entries.find((e) => e.key === 'aplus');
      expect(aplus?.letter).toBe('A');
      expect(aplus?.shortName).toBe('A+');
      expect(aplus?.landing).toBe('/a/home');
      expect(aplus?.ariaKey).toBe('surface_rail.aplus.aria');
    });
  });

  // §4.7a (auth-hardening Phase A, CHO-1717 / ADR-181): the rail filters
  // by the ACTIVE TenantContext membership's surfaces[]; union across
  // memberships when no active context; fail-open to all 5 when no
  // surface data exists (legacy shapes / pre-mint states).
  describe('RBAC surface visibility (membership surfaces[])', () => {
    function chipKeys(el: HTMLElement): string[] {
      return Array.from(
        el.querySelectorAll('[data-testid^="surface-rail-chip-"]'),
      ).map((n) =>
        (n.getAttribute('data-testid') ?? '').replace('surface-rail-chip-', ''),
      );
    }

    it("renders only the active membership's surfaces (learner → A+ and C+)", () => {
      const { el, tenantContext, fixture } = setup();
      tenantContext.setCurrentTenant(
        buildTenant('t1', { surfaces: ['aplus', 'cplus'] }),
      );
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['cplus', 'aplus']);
    });

    it('renders a single chip for a single-surface membership (instructor → R+)', () => {
      const { el, tenantContext, fixture } = setup();
      tenantContext.setCurrentTenant(buildTenant('t1', { surfaces: ['rplus'] }));
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['rplus']);
    });

    it('keeps CHORA spelling order regardless of surfaces[] order', () => {
      const { el, tenantContext, fixture } = setup();
      tenantContext.setCurrentTenant(
        buildTenant('t1', { surfaces: ['rplus', 'aplus', 'hplus'] }),
      );
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['hplus', 'rplus', 'aplus']);
    });

    it('falls back to the matching availableTenants membership when the active context carries no surfaces (bare-JWT seed)', () => {
      const { el, tenantContext, fixture } = setup();
      // handleAuthResponse seeds the current tenant from JWT claims alone
      // (id only, no surfaces) before memberships arrive.
      tenantContext.setCurrentTenant(buildTenant('t1'));
      tenantContext.setAvailableTenants([
        buildTenant('t1', { surfaces: ['oplus'] }),
        buildTenant('t2', { surfaces: ['aplus', 'cplus'] }),
      ]);
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['oplus']);
    });

    it('unions surfaces across memberships when NO active tenant context is set', () => {
      const { el, tenantContext, fixture } = setup('/a/dashboard', {
        surfaces: null,
      });
      tenantContext.setAvailableTenants([
        buildTenant('t1', { surfaces: ['aplus', 'cplus'] }),
        buildTenant('t2', { surfaces: ['rplus'] }),
      ]);
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['cplus', 'rplus', 'aplus']);
    });

    it('ignores unknown surface tokens from the wire', () => {
      const { el, tenantContext, fixture } = setup();
      tenantContext.setCurrentTenant(
        buildTenant('t1', { surfaces: ['aplus', 'mystery_surface'] }),
      );
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['aplus']);
    });

    // B1 (UX refactor, master plan section 3.1): the rail used to FAIL OPEN
    // here, rendering all five chips whenever no membership carried a
    // `surfaces[]` array. That published every surface to a session the mint
    // had granted nothing, and it made Figure 4.14's "only one A" evidence
    // depend on the payload rather than on the rule. It now fails CLOSED.
    //
    // Closed does not mean empty: the chip for the surface the session is
    // ALREADY rendering cannot be a dead-end, because the route guard has
    // demonstrably let the session in. So the fallback is exactly that one
    // surface, which grants no navigation the session did not already hold
    // while keeping the shell recoverable.
    it('fails CLOSED to the active surface when memberships carry no surfaces data (legacy /api/v1/tenants shape)', () => {
      const { el, tenantContext, fixture } = setup('/a/dashboard', {
        surfaces: null,
      });
      tenantContext.setCurrentTenant(buildTenant('t1'));
      tenantContext.setAvailableTenants([buildTenant('t1'), buildTenant('t2')]);
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['aplus']);
    });

    it('fails CLOSED to whichever surface is active, not to A+ by default', () => {
      const { el, tenantContext, fixture } = setup('/r/roster', {
        surfaces: null,
      });
      tenantContext.setCurrentTenant(buildTenant('t1'));
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['rplus']);
    });

    it('fails CLOSED with no tenant context at all (pre-mint state)', () => {
      const { el } = setup('/o/dashboard', {
        operator: true,
        surfaces: null,
      });
      expect(chipKeys(el)).toEqual(['oplus']);
    });

    it('never widens: an empty surfaces[] array is not treated as missing data', () => {
      const { el, tenantContext, fixture } = setup('/a/dashboard');
      tenantContext.setCurrentTenant(buildTenant('t1', { surfaces: [] }));
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['aplus']);
    });

    it('reacts to a tenant switch (signal-driven re-render)', () => {
      const { el, tenantContext, fixture } = setup();
      tenantContext.setCurrentTenant(
        buildTenant('t1', { surfaces: ['aplus', 'cplus'] }),
      );
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['cplus', 'aplus']);

      tenantContext.setCurrentTenant(buildTenant('t2', { surfaces: ['hplus'] }));
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['hplus']);
    });
  });

  // Unified surface access rule (nav-fe reconciliation, CHO-1717 / ADR-181
  // + ADR-165): an add-on-gated surface (C+ → cplus_social) is visible in
  // the rail IFF the active tenant is entitled OR the user is a
  // platform_operator. The rail must never show a surface the route guard
  // would redirect away from (no dead-ends), and vice versa.
  describe('add-on-gated surface visibility (C+ → cplus_social, ADR-165)', () => {
    function chipKeys(el: HTMLElement): string[] {
      return Array.from(
        el.querySelectorAll('[data-testid^="surface-rail-chip-"]'),
      ).map((n) =>
        (n.getAttribute('data-testid') ?? '').replace('surface-rail-chip-', ''),
      );
    }

    it('hides C+ for a non-operator in a NON-entitled tenant (membership includes cplus)', () => {
      const { el, tenantContext, fixture } = setup('/a/dashboard', {
        operator: false,
        cplusSocial: false,
      });
      tenantContext.setCurrentTenant(
        buildTenant('t1', { surfaces: ['aplus', 'cplus'] }),
      );
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['aplus']);
    });

    it('shows C+ for a non-operator in an ENTITLED tenant', () => {
      const { el, tenantContext, fixture } = setup('/a/dashboard', {
        operator: false,
        cplusSocial: true,
      });
      tenantContext.setCurrentTenant(
        buildTenant('t1', { surfaces: ['aplus', 'cplus'] }),
      );
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['cplus', 'aplus']);
    });

    it('shows C+ for a platform_operator even when the tenant is NOT entitled', () => {
      const { el, tenantContext, fixture } = setup('/a/dashboard', {
        operator: true,
        cplusSocial: false,
      });
      tenantContext.setCurrentTenant(
        buildTenant('t1', { surfaces: ['aplus', 'cplus'] }),
      );
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['cplus', 'aplus']);
    });

    it('hides C+ for a non-entitled non-operator whose membership holds all five, other 4 still render', () => {
      const { el } = setup('/a/dashboard', {
        operator: false,
        cplusSocial: false,
      });
      // The membership grants all five; the add-on gate is what removes the
      // un-entitled C+. The two gates compose, and neither is the fallback.
      expect(chipKeys(el)).toEqual(['hplus', 'oplus', 'rplus', 'aplus']);
    });

    it('the fail-CLOSED fallback is still add-on gated (active C+, not entitled → no chip)', () => {
      const { el } = setup('/c/feed', {
        operator: false,
        cplusSocial: false,
        surfaces: null,
      });
      expect(chipKeys(el)).toEqual([]);
    });

    it('leaves the non-gated surfaces (A+/H+/O+/R+) unaffected by cplus_social state', () => {
      const { el } = setup('/a/dashboard', {
        operator: false,
        cplusSocial: false,
      });
      const keys = chipKeys(el);
      expect(keys).toEqual(['hplus', 'oplus', 'rplus', 'aplus']);
      expect(keys).not.toContain('cplus');
    });

    it('reacts when cplus_social is granted at runtime (entitlement signal-driven re-render)', () => {
      const { el, tenantContext, fixture, flags } = setup('/a/dashboard', {
        operator: false,
        cplusSocial: false,
      });
      tenantContext.setCurrentTenant(
        buildTenant('t1', { surfaces: ['aplus', 'cplus'] }),
      );
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['aplus']);

      flags.setFlags({ cplus_social: true });
      fixture.detectChanges();
      expect(chipKeys(el)).toEqual(['cplus', 'aplus']);
    });
  });

  describe('navigation reactivity', () => {
    it('recomputes the active surface when a NavigationEnd event fires', async () => {
      const { fixture, el, router } = setup('/a/dashboard');

      // Initially A+ is active.
      expect(
        el
          .querySelector('[data-testid="surface-rail-chip-aplus"]')
          ?.getAttribute('aria-current'),
      ).toBe('page');

      // Mutate the URL and drive a real router navigation so a NavigationEnd
      // event flows through the constructor subscription, bumping navTick.
      vi.spyOn(router, 'url', 'get').mockReturnValue('/c/feed');
      await router.navigateByUrl('/c/feed');
      fixture.detectChanges();

      const cplus = el.querySelector('[data-testid="surface-rail-chip-cplus"]');
      expect(cplus?.getAttribute('aria-current')).toBe('page');
      const aplus = el.querySelector('[data-testid="surface-rail-chip-aplus"]');
      expect(aplus?.getAttribute('aria-current')).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// R39 (owner, 2026-09-02): the CHORA rail is ROLE-GATED.
//
// Learners and authors never see it. It is shown only to admin, instructor,
// auditor and the internal roles. A learner reaches C+ through the hand-offs,
// the "your circle" card and the atom exit, and the account through the avatar
// menu, never through a rail.
// ─────────────────────────────────────────────────────────────────────────
describe('SurfaceRailComponent role gate (R39)', () => {
  function chips(el: HTMLElement): number {
    return el.querySelectorAll('[data-testid^="surface-rail-chip-"]').length;
  }

  const SHOWN = [
    'admin',
    'tenant_admin',
    'owner',
    'instructor',
    'auditor',
    'platform_operator',
    'proctor',
    'training_admin',
  ] as const;

  for (const role of SHOWN) {
    it(`shows the rail for ${role}`, () => {
      const { el } = setup('/a/dashboard', { roles: [role] });
      expect(chips(el)).toBeGreaterThan(0);
    });
  }

  it('HIDES the rail for a learner', () => {
    const { el } = setup('/a/dashboard', { roles: ['learner'] });
    expect(chips(el)).toBe(0);
  });

  it('HIDES the rail for an author (author-only session)', () => {
    const { el } = setup('/a/dashboard', { roles: ['author'] });
    expect(chips(el)).toBe(0);
  });

  it('HIDES the rail for a learner who is also an author', () => {
    const { el } = setup('/a/dashboard', { roles: ['learner', 'author'] });
    expect(chips(el)).toBe(0);
  });

  it('fails CLOSED on an empty role payload', () => {
    const { el } = setup('/a/dashboard', { roles: [] });
    expect(chips(el)).toBe(0);
  });

  it('shows the rail when a learner ALSO holds a qualifying role', () => {
    const { el } = setup('/a/dashboard', { roles: ['learner', 'instructor'] });
    expect(chips(el)).toBeGreaterThan(0);
  });

  // The B1 fail-closed-to-active-surface fallback applies only once the rail is
  // shown at all. Two tests rather than one, because TestBed cannot be
  // reconfigured after instantiation and `setup` may be called only once.
  it('B1 fallback still gives an ELIGIBLE session its active-surface chip', () => {
    const { el } = setup('/a/dashboard', { roles: ['auditor'], surfaces: null });
    expect(chips(el)).toBe(1);
  });

  it('B1 fallback cannot resurrect a chip for an INELIGIBLE session', () => {
    const { el } = setup('/a/dashboard', { roles: ['learner'], surfaces: null });
    expect(chips(el)).toBe(0);
  });

  it('exposes the gate as a signal when SHOWN, so the layout can size itself', () => {
    const { fixture } = setup('/a/dashboard', { roles: ['admin'] });
    expect(fixture.componentInstance.railVisible()).toBe(true);
  });

  it('exposes the gate as a signal when HIDDEN, so the layout reclaims the left edge', () => {
    const { fixture } = setup('/a/dashboard', { roles: ['learner'] });
    expect(fixture.componentInstance.railVisible()).toBe(false);
  });
});
