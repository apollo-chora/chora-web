import { describe, it, expect } from 'vitest';

import { SURFACE_LANDING } from '../surfaces/surface-access';
import type { SurfaceMembershipView } from '../surfaces/surface-access';

import { HOME_PIN_REGISTRY, homePinById } from './home-pin.registry';
import {
  defaultPins,
  filterVisiblePins,
  type HomePinFilterInputs,
} from './home-pin.filter';

/**
 * ADR-240 D4 / D7 - the capability/surface filter + role-derived default set.
 *
 * The filter is the home's read-only reuse of the SHIPPED access predicates
 * (resolveVisibleSurfaces membership axis, canAccessSurface add-on axis) plus
 * RbacService.hasCapability, so the home never becomes a fourth opinion about
 * who may go where. defaultPins derives a small first-run set FROM that filter.
 */

// ── structural session fakes (read-only, matching the real service shapes) ──
const membership = (id: string, surfaces?: readonly string[]): SurfaceMembershipView => ({
  id,
  ...(surfaces ? { surfaces } : {}),
});

const fakeFlags = (...enabled: string[]) => ({
  isEnabled: (code: string) => enabled.includes(code),
});

const fakeRbac = (roles: readonly string[], caps: readonly string[]) => ({
  hasRole: (role: string) => roles.map((r) => r.toLowerCase()).includes(role.toLowerCase()),
  hasCapability: (cap: string) => caps.includes(cap),
});

interface Session {
  readonly active?: SurfaceMembershipView | null;
  readonly memberships?: readonly SurfaceMembershipView[];
  readonly enabled?: readonly string[];
  readonly roles?: readonly string[];
  readonly caps?: readonly string[];
  readonly onEmpty?: HomePinFilterInputs['onEmpty'];
}

const inputs = (s: Session): HomePinFilterInputs => ({
  active: s.active ?? null,
  memberships: s.memberships ?? [],
  flags: fakeFlags(...(s.enabled ?? [])),
  rbac: fakeRbac(s.roles ?? [], s.caps ?? []),
  onEmpty: s.onEmpty ?? 'closed-none',
});

const visibleIds = (s: Session): string[] =>
  filterVisiblePins(HOME_PIN_REGISTRY, inputs(s)).map((p) => p.id);
const defaultIds = (s: Session): string[] => defaultPins(inputs(s)).map((p) => p.id);

describe('filterVisiblePins - membership axis', () => {
  it('a learner reaching only A+ sees only A+ pins (that they can reach)', () => {
    const ids = visibleIds({ active: membership('t1', ['aplus']) });
    expect(ids).toEqual(['aplus-learning', 'aplus-knowledge', 'aplus-familiar', 'aplus-wallet']);
    // aplus-studio is capability-gated (assessment:author) and absent here.
    expect(ids).not.toContain('aplus-studio');
    // and nothing from any other surface leaked in
    expect(ids.every((id) => id.startsWith('aplus-'))).toBe(true);
  });

  it('a surface absent from the membership never contributes a pin', () => {
    const ids = visibleIds({ active: membership('t1', ['aplus', 'oplus']) });
    expect(ids.some((id) => id.startsWith('hplus-'))).toBe(false);
    expect(ids.some((id) => id.startsWith('rplus-'))).toBe(false);
    expect(ids).toContain('oplus-dashboard');
  });

  it('empty surfaces + onEmpty aplus-baseline yields A+ pins only', () => {
    const ids = visibleIds({ active: membership('t1', []), onEmpty: 'aplus-baseline' });
    expect(ids.every((id) => id.startsWith('aplus-'))).toBe(true);
    expect(ids).toContain('aplus-learning');
  });

  it('empty surfaces + onEmpty closed-none yields nothing', () => {
    expect(visibleIds({ active: membership('t1', []), onEmpty: 'closed-none' })).toEqual([]);
  });
});

describe('filterVisiblePins - add-on axis (C+ / cplus_social)', () => {
  it('hides C+ pins when the tenant lacks cplus_social and is not operator', () => {
    const ids = visibleIds({ active: membership('t1', ['aplus', 'cplus']) });
    expect(ids.some((id) => id.startsWith('cplus-'))).toBe(false);
    expect(ids).toContain('aplus-learning');
  });

  it('shows C+ pins once cplus_social is entitled', () => {
    const ids = visibleIds({ active: membership('t1', ['cplus']), enabled: ['cplus_social'] });
    // Asserted as the whole C+ SET, not as a `toContain` per id. The previous
    // form also asserted `cplus-leaderboards`, which pinned a route
    // `cplus.routes.ts` never mounted: the spec read as coverage while
    // guaranteeing a dead link. An exact set fails loudly when a pin is added,
    // which sends the author to `home-pin.route-liveness.spec.ts` first.
    expect(ids.filter((id) => id.startsWith('cplus-'))).toEqual(['cplus-feed']);
  });

  it('platform_operator reaches C+ even without the add-on (ADR-165 god-mode)', () => {
    const ids = visibleIds({ active: membership('t1', ['cplus']), roles: ['platform_operator'] });
    expect(ids).toContain('cplus-feed');
  });
});

describe('filterVisiblePins - capability axis', () => {
  it('reveals aplus-studio only with assessment:author', () => {
    expect(visibleIds({ active: membership('t1', ['aplus']) })).not.toContain('aplus-studio');
    expect(
      visibleIds({ active: membership('t1', ['aplus']), caps: ['assessment:author'] }),
    ).toContain('aplus-studio');
  });

  it('a proctor (R+ surface, no delivery:ops) sees exams but not offerings', () => {
    const ids = visibleIds({ active: membership('t1', ['rplus']) });
    expect(ids).toContain('rplus-exams');
    expect(ids).not.toContain('rplus-offerings');
  });

  it('delivery:ops reveals the gated R+ pins', () => {
    const ids = visibleIds({ active: membership('t1', ['rplus']), caps: ['delivery:ops'] });
    expect(ids).toContain('rplus-offerings');
    expect(ids).toContain('rplus-exams');
  });
});

describe('filterVisiblePins - purity', () => {
  it('is a projection: the source registry is never mutated', () => {
    const before = HOME_PIN_REGISTRY.length;
    filterVisiblePins(HOME_PIN_REGISTRY, inputs({ active: membership('t1', ['aplus']) }));
    expect(HOME_PIN_REGISTRY.length).toBe(before);
  });
});

describe('defaultPins - role-derived first-run set (D7)', () => {
  it('a full-access multi-surface session lands one pin per surface = the 5 surface landings', () => {
    const s: Session = {
      memberships: [membership('t1', ['aplus', 'cplus', 'hplus', 'oplus', 'rplus'])],
      enabled: ['cplus_social'],
      roles: ['platform_operator'],
      caps: ['assessment:author', 'delivery:ops', 'tenant:manage', 'tenant:view_payments'],
    };
    const ids = defaultIds(s);
    expect(ids).toEqual([
      'aplus-learning',
      'cplus-feed',
      'hplus-tenant',
      'oplus-dashboard',
      'rplus-offerings',
    ]);
    // the property that makes it a sensible default: each default pin's route is
    // exactly that surface's landing route.
    //
    // A+ is the one exception, since C2 slice 3 moved its landing to `/a/home`
    // (ADR-240). The pin grid renders ON the home itself (`HomeComponent` is
    // mounted at both `/home` and `/a/home`), so an A+ pin pointing at
    // `SURFACE_LANDING.aplus` would be a link from the page to itself. The pin
    // keeps pointing at the Learn hub, which is what its
    // `home.pins.aplusLearning` label has always promised. Written by
    // UX-subagent3 from the C2 fence because the landing move is what broke it;
    // the pin's DESTINATION is untouched and remains C1b's to decide.
    const routes = ids.map((id) => homePinById(id)?.route);
    expect(routes).toEqual([
      '/a/dashboard',
      SURFACE_LANDING.cplus,
      SURFACE_LANDING.hplus,
      SURFACE_LANDING.oplus,
      SURFACE_LANDING.rplus,
    ]);
  });

  it('a pure learner gets exactly one card (their A+ hub) - never blank', () => {
    expect(defaultIds({ active: membership('t1', ['aplus']) })).toEqual(['aplus-learning']);
  });

  it('degrades to the first REACHABLE pin when a surface landing is capability-gated off', () => {
    // A proctor cannot reach /r/offerings (delivery:ops); their R+ default card
    // becomes the first reachable R+ pin: Exam Administration.
    expect(defaultIds({ active: membership('t1', ['rplus']) })).toEqual(['rplus-exams']);
  });

  it('is empty when no surface is reachable (a legitimate, non-blank-by-design edge)', () => {
    expect(defaultIds({ active: membership('t1', []), onEmpty: 'closed-none' })).toEqual([]);
  });
});
