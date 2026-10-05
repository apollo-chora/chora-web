import { describe, it, expect } from 'vitest';
import type { FeatureFlagService } from '../../core/services/feature-flag.service';
import type { RbacService } from '../../core/services/rbac.service';
import {
  ALL_SURFACE_KEYS,
  SURFACE_ADDON_GATE,
  SURFACE_LANDING,
  canAccessAddOn,
  canAccessSurface,
  firstAccessibleSurfaceLanding,
  isNavItemVisible,
  NO_SURFACE_LANDING,
  resolveLandingRoute,
  canSeeSurfaceRail,
  resolveVisibleSurfaces,
  type SurfaceMembershipView,
} from './surface-access';
import type { SurfaceKey } from './surface-landing.component';
import type { NavItem } from './surface-nav';

/**
 * Structural stubs — the access rule only reads `isEnabled` /`hasRole`, so the
 * unit tests stay decoupled from Angular DI and the heavy AuthService chain.
 */
function flags(enabled: ReadonlySet<string>): FeatureFlagService {
  return {
    isEnabled: (code: string) => enabled.has(code),
  } as unknown as FeatureFlagService;
}

function rbac(operator: boolean): RbacService {
  return {
    hasRole: (role: string) =>
      operator && role.trim().toLowerCase() === 'platform_operator',
  } as unknown as RbacService;
}

describe('surface-access', () => {
  describe('SURFACE_ADDON_GATE registry', () => {
    it('gates C+ on the cplus_social add-on', () => {
      expect(SURFACE_ADDON_GATE.cplus).toBe('cplus_social');
    });

    it('leaves A+/H+/O+/R+ un-gated (no surface-level add-on)', () => {
      expect(SURFACE_ADDON_GATE.aplus).toBeUndefined();
      expect(SURFACE_ADDON_GATE.hplus).toBeUndefined();
      expect(SURFACE_ADDON_GATE.oplus).toBeUndefined();
      expect(SURFACE_ADDON_GATE.rplus).toBeUndefined();
    });
  });

  describe('canAccessAddOn — unified add-on access rule', () => {
    it('grants when the active tenant is entitled to the add-on', () => {
      expect(
        canAccessAddOn('cplus_social', flags(new Set(['cplus_social'])), rbac(false)),
      ).toBe(true);
    });

    it('grants for a platform_operator even when the tenant is NOT entitled', () => {
      expect(
        canAccessAddOn('cplus_social', flags(new Set()), rbac(true)),
      ).toBe(true);
    });

    it('denies a non-operator in a non-entitled tenant', () => {
      expect(
        canAccessAddOn('cplus_social', flags(new Set()), rbac(false)),
      ).toBe(false);
    });

    it('grants an entitled operator (both branches true)', () => {
      expect(
        canAccessAddOn('cplus_social', flags(new Set(['cplus_social'])), rbac(true)),
      ).toBe(true);
    });
  });

  describe('canAccessSurface — surface-level reachability', () => {
    it('always allows an un-gated surface regardless of entitlement/operator', () => {
      for (const key of ['aplus', 'hplus', 'oplus', 'rplus'] as const) {
        expect(canAccessSurface(key, flags(new Set()), rbac(false)), key).toBe(true);
      }
    });

    it('hides C+ for a non-operator in a non-entitled tenant', () => {
      expect(canAccessSurface('cplus', flags(new Set()), rbac(false))).toBe(false);
    });

    it('shows C+ for a non-operator in an entitled tenant', () => {
      expect(
        canAccessSurface('cplus', flags(new Set(['cplus_social'])), rbac(false)),
      ).toBe(true);
    });

    it('shows C+ for a platform_operator in a non-entitled tenant', () => {
      expect(canAccessSurface('cplus', flags(new Set()), rbac(true))).toBe(true);
    });
  });
});

/**
 * The membership-axis surface predicate shared by `surface.guard.ts` (route
 * entry, fail-closed) and — by construction — `SurfaceRailComponent`
 * (rail visibility, fail-open). The CHO-1801 surface guard reuses the SAME
 * candidate-resolution the rail does (active membership `surfaces[]` →
 * matching-membership → union) so the two navigation gates can never disagree
 * on WHICH surfaces a membership unlocks; they differ ONLY in the empty-data
 * fail-mode.
 */
function member(id: string, surfaces?: readonly string[]): SurfaceMembershipView {
  return { id, surfaces };
}

describe('resolveVisibleSurfaces — membership-axis predicate', () => {
  it('uses the ACTIVE tenant membership surfaces[] when present', () => {
    const visible = resolveVisibleSurfaces(
      member('t1', ['hplus']),
      [member('t1', ['hplus']), member('t2', ['aplus', 'cplus'])],
      { onEmpty: 'closed-none' },
    );
    expect([...visible].sort()).toEqual(['hplus']);
  });

  it('falls back to the matching availableTenants membership when the active context carries no surfaces (bare-JWT seed)', () => {
    const visible = resolveVisibleSurfaces(
      member('t1'), // active context seeded without surfaces
      [member('t1', ['aplus', 'cplus'])],
      { onEmpty: 'closed-none' },
    );
    expect([...visible].sort()).toEqual(['aplus', 'cplus']);
  });

  it('unions surfaces across memberships when there is no active context', () => {
    const visible = resolveVisibleSurfaces(
      null,
      [member('t1', ['aplus']), member('t2', ['rplus']), member('t3', ['aplus'])],
      { onEmpty: 'closed-none' },
    );
    expect([...visible].sort()).toEqual(['aplus', 'rplus']);
  });

  it('drops surface tokens that are not real SurfaceKeys', () => {
    const visible = resolveVisibleSurfaces(
      member('t1', ['hplus', 'bogus', '']),
      [member('t1', ['hplus', 'bogus', ''])],
      { onEmpty: 'closed-none' },
    );
    expect([...visible].sort()).toEqual(['hplus']);
  });

  describe('empty / absent surface data → fail-mode', () => {
    const empties: readonly [string, SurfaceMembershipView | null, SurfaceMembershipView[]][] = [
      ['no active + no memberships', null, []],
      ['active + matching membership both surface-less', member('t1'), [member('t1')]],
      ['surfaces present but all unknown tokens', member('t1', ['nope']), [member('t1', ['nope'])]],
    ];

    for (const [label, active, memberships] of empties) {
      it(`fail-OPEN ('open-all') → all 5 surfaces [${label}]`, () => {
        const visible = resolveVisibleSurfaces(active, memberships, { onEmpty: 'open-all' });
        expect([...visible].sort()).toEqual([...ALL_SURFACE_KEYS].sort());
      });

      it(`A+ baseline ('aplus-baseline') → ONLY A+ [${label}]`, () => {
        const visible = resolveVisibleSurfaces(active, memberships, { onEmpty: 'aplus-baseline' });
        expect([...visible].sort()).toEqual(['aplus']);
      });

      it(`strict fail-CLOSED ('closed-none') → NO surfaces [${label}]`, () => {
        const visible = resolveVisibleSurfaces(active, memberships, { onEmpty: 'closed-none' });
        expect([...visible]).toEqual([]);
      });
    }
  });
});

describe('firstAccessibleSurfaceLanding — safe redirect target', () => {
  it('prefers A+ (universal home) when it is visible + accessible', () => {
    const visible = new Set<SurfaceKey>(['aplus', 'cplus']);
    expect(
      firstAccessibleSurfaceLanding(visible, flags(new Set(['cplus_social'])), rbac(false)),
    ).toBe(SURFACE_LANDING.aplus);
  });

  it('falls through to the next visible surface (admin → H+) when A+ is not held', () => {
    const visible = new Set<SurfaceKey>(['hplus']);
    expect(firstAccessibleSurfaceLanding(visible, flags(new Set()), rbac(false))).toBe(
      SURFACE_LANDING.hplus,
    );
  });

  it('skips a C+-only membership that is NOT entitled to cplus_social (loop-safe — never lands somewhere addOnGuard would bounce)', () => {
    const visible = new Set<SurfaceKey>(['cplus']);
    expect(firstAccessibleSurfaceLanding(visible, flags(new Set()), rbac(false))).toBeNull();
  });

  it('lands a C+-only operator on C+ (operator passes the add-on gate)', () => {
    const visible = new Set<SurfaceKey>(['cplus']);
    expect(firstAccessibleSurfaceLanding(visible, flags(new Set()), rbac(true))).toBe(
      SURFACE_LANDING.cplus,
    );
  });

  it('returns null when no surface is visible', () => {
    expect(
      firstAccessibleSurfaceLanding(new Set<SurfaceKey>(), flags(new Set()), rbac(false)),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// isNavItemVisible: the ONE nav visibility predicate (C2 shell)
//
// Extracted from `SidebarComponent.isVisible` so the compass bar and the
// sidebar cannot drift. A forked copy is exactly the defect class where a
// sibling screen misses a fail-closed fix, so there is one definition and
// both callers import it.
// ─────────────────────────────────────────────────────────────────────────

/** Structural stub carrying both axes the nav gate reads. */
function navRbac(roles: ReadonlySet<string>, caps: ReadonlySet<string>): RbacService {
  return {
    hasRole: (role: string) => roles.has(role.trim().toLowerCase()),
    hasCapability: (cap: string) => caps.has(cap),
  } as unknown as RbacService;
}

const NONE = new Set<string>();

describe('isNavItemVisible', () => {
  it('admits an ungated item', () => {
    const item: NavItem = { labelKey: 'a', icon: 'map', route: '/a/knowledge' };
    expect(isNavItemVisible(item, flags(NONE), navRbac(NONE, NONE))).toBe(true);
  });

  it('fails CLOSED on an unmet capability', () => {
    const item: NavItem = {
      labelKey: 'a',
      icon: 'pen',
      route: '/a/studio',
      capability: 'assessment:author',
    };
    expect(isNavItemVisible(item, flags(NONE), navRbac(NONE, NONE))).toBe(false);
  });

  it('admits a capability-gated item when the capability is held', () => {
    const item: NavItem = {
      labelKey: 'a',
      icon: 'pen',
      route: '/a/studio',
      capability: 'assessment:author',
    };
    const held = new Set(['assessment:author']);
    expect(isNavItemVisible(item, flags(NONE), navRbac(NONE, held))).toBe(true);
  });

  it('fails CLOSED on an unmet role', () => {
    const item: NavItem = { labelKey: 'a', icon: 'gear', route: '/x', role: 'platform_operator' };
    expect(isNavItemVisible(item, flags(NONE), navRbac(NONE, NONE))).toBe(false);
  });

  it('fails CLOSED on an add-on the tenant is not entitled to', () => {
    const item: NavItem = { labelKey: 'a', icon: 'users', route: '/c/feed', addOn: 'cplus_social' };
    expect(isNavItemVisible(item, flags(NONE), navRbac(NONE, NONE))).toBe(false);
  });

  it('admits an add-on-gated item for a platform operator', () => {
    const item: NavItem = { labelKey: 'a', icon: 'users', route: '/c/feed', addOn: 'cplus_social' };
    const operator = new Set(['platform_operator']);
    expect(isNavItemVisible(item, flags(NONE), navRbac(operator, NONE))).toBe(true);
  });

  it('applies EVERY axis, not just the first: a held capability does not rescue an unmet add-on', () => {
    const item: NavItem = {
      labelKey: 'a',
      icon: 'pen',
      route: '/a/studio',
      capability: 'assessment:author',
      addOn: 'cplus_social',
    };
    const held = new Set(['assessment:author']);
    expect(isNavItemVisible(item, flags(NONE), navRbac(NONE, held))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// canSeeSurfaceRail: R39 (owner, 2026-09-02)
// ─────────────────────────────────────────────────────────────────────────
describe('canSeeSurfaceRail', () => {
  const eligible = [
    'admin',
    'tenant_admin',
    'owner',
    'instructor',
    'auditor',
    'platform_operator',
    'proctor',
    'training_admin',
  ];

  for (const role of eligible) {
    it(`admits ${role}`, () => {
      expect(canSeeSurfaceRail(navRbac(new Set([role]), NONE))).toBe(true);
    });
  }

  it('refuses a learner', () => {
    expect(canSeeSurfaceRail(navRbac(new Set(['learner']), NONE))).toBe(false);
  });

  it('refuses an author', () => {
    expect(canSeeSurfaceRail(navRbac(new Set(['author']), NONE))).toBe(false);
  });

  it('refuses a learner who is also an author', () => {
    expect(canSeeSurfaceRail(navRbac(new Set(['learner', 'author']), NONE))).toBe(false);
  });

  it('fails CLOSED on an empty role payload', () => {
    expect(canSeeSurfaceRail(navRbac(NONE, NONE))).toBe(false);
  });

  it('admits a learner who ALSO holds a qualifying role', () => {
    expect(canSeeSurfaceRail(navRbac(new Set(['learner', 'auditor']), NONE))).toBe(true);
  });
});

/**
 * The ONE landing rule (C2 slice 3, ADR-240). `firstAccessibleSurfaceLanding`
 * answers "is there anywhere safe to send a DENIED user" and reports `null`
 * when there is not; `resolveLandingRoute` answers "where does this session
 * go" and is TOTAL, so no caller has to invent an empty case of its own. That
 * totality is the property worth pinning: seven call sites used to each hold a
 * private answer, and they disagreed.
 */
describe('resolveLandingRoute', () => {
  const NONE = new Set<string>();

  it('lands A+ on /a/home, the C2 slice 3 move off /a/dashboard', () => {
    expect(SURFACE_LANDING.aplus).toBe('/a/home');
    expect(
      resolveLandingRoute(new Set<SurfaceKey>(['aplus']), flags(NONE), rbac(false)),
    ).toBe('/a/home');
  });

  it('keeps every other surface landing where it was', () => {
    expect(SURFACE_LANDING.cplus).toBe('/c/feed');
    expect(SURFACE_LANDING.hplus).toBe('/h/tenant');
    expect(SURFACE_LANDING.oplus).toBe('/o/dashboard');
    expect(SURFACE_LANDING.rplus).toBe('/r/offerings');
  });

  it('falls back to the never-strand door when no surface is reachable', () => {
    expect(NO_SURFACE_LANDING).toBe('/home');
    expect(resolveLandingRoute(new Set<SurfaceKey>(), flags(NONE), rbac(false))).toBe(
      '/home',
    );
  });

  it('is TOTAL: every subset of surfaces yields a route, never null', () => {
    // Exhaustive over the 32 subsets of the 5 surface keys, entitled and not.
    for (let mask = 0; mask < 1 << ALL_SURFACE_KEYS.length; mask += 1) {
      const subset = new Set<SurfaceKey>(
        ALL_SURFACE_KEYS.filter((_, i) => (mask & (1 << i)) !== 0),
      );
      for (const entitled of [NONE, new Set(['cplus_social'])]) {
        const result = resolveLandingRoute(subset, flags(entitled), rbac(false));
        expect(typeof result, `subset ${mask}`).toBe('string');
        expect(result.startsWith('/'), `subset ${mask}`).toBe(true);
      }
    }
  });

  it('never lands on a surface the session cannot enter (loop-safety)', () => {
    // C+ held but not entitled: `/c/feed` would bounce off its own addOnGuard.
    expect(
      resolveLandingRoute(new Set<SurfaceKey>(['cplus']), flags(NONE), rbac(false)),
    ).toBe('/home');
    expect(
      resolveLandingRoute(
        new Set<SurfaceKey>(['cplus']),
        flags(new Set(['cplus_social'])),
        rbac(false),
      ),
    ).toBe('/c/feed');
  });

  it('agrees with firstAccessibleSurfaceLanding wherever that one has an answer', () => {
    for (const key of ALL_SURFACE_KEYS) {
      const subset = new Set<SurfaceKey>([key]);
      const denied = firstAccessibleSurfaceLanding(
        subset,
        flags(new Set(['cplus_social'])),
        rbac(false),
      );
      expect(
        resolveLandingRoute(subset, flags(new Set(['cplus_social'])), rbac(false)),
      ).toBe(denied ?? NO_SURFACE_LANDING);
    }
  });
});
