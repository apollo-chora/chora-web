import { describe, expect, it } from 'vitest';

import { isMountedRoute } from './home-card.route-liveness';
import { HOME_PIN_REGISTRY } from './home-pin.registry';
import { APLUS_ROUTES } from '../surfaces/aplus/aplus.routes';
import { CPLUS_ROUTES } from '../surfaces/cplus/cplus.routes';
import { HPLUS_ROUTES } from '../surfaces/hplus/hplus.routes';
import { OPLUS_ROUTES } from '../surfaces/oplus/oplus.routes';
import { RPLUS_ROUTES } from '../surfaces/rplus/rplus.routes';

/**
 * Route liveness for home PINS (Phase C, C1b).
 *
 * WHY THIS EXISTS, given `home-card.route-liveness.spec.ts` already exists
 * That file guards the routes the AGGREGATOR emits. Nothing guarded the routes
 * the SPA itself hard-codes, and the two fail differently: a bad card route
 * arrives over the wire and can be fixed server-side, while a bad pin route is
 * committed in `home-pin.registry.ts` and ships in the bundle. The pin is worse
 * on every axis. It is always rendered rather than conditionally emitted, it
 * survives every deploy until someone edits the registry, and it is offered as
 * a first-run DEFAULT, so the viewer most likely to click it is the one with
 * the least idea where they are.
 *
 * The defect that prompted it: `cplus-leaderboards` pinned `/c/leaderboards`,
 * which `cplus.routes.ts` has never mounted (its five paths are feed, duels,
 * interests, connections and bookmarks). Any session holding `cplus_social`
 * saw a Leaderboards pin that fell through `app.routes.ts`'s
 * `{ path: '**', redirectTo: 'not-found' }`. Two specs stood beside it and
 * neither caught it, because both asked whether the pin was PRESENT rather
 * than whether it WORKED: `home-pin.filter.spec.ts` asserted the id appears
 * for an entitled tenant, and `home-pin.retirement-census.spec.ts` recorded its
 * destiny as `none`. A spec that pins a dead link is worse than no spec, since
 * it reads as coverage.
 *
 * The rule this file enforces: a pin's route is its entire promise, so every
 * pin in the registry must resolve in the surface module that owns it. There is
 * no allowance list on purpose. The card guard carries one (a ratchet for
 * routes the aggregator already emits and cannot be fixed here); a pin is
 * editable in the same commit as its test, so a dead one is retired rather than
 * recorded.
 */

const TABLES = {
  a: APLUS_ROUTES,
  c: CPLUS_ROUTES,
  h: HPLUS_ROUTES,
  o: OPLUS_ROUTES,
  r: RPLUS_ROUTES,
};

describe('every home pin points at a route its surface actually mounts', () => {
  it('resolves a route that is really mounted, and refuses one that is not', () => {
    // The positive control, and its negative twin. Without the first, every
    // pass below could be the matcher saying "true" to anything; without the
    // second, it could be the tables being empty and matching by accident.
    expect(isMountedRoute('/c/feed', TABLES)).toBe(true);
    expect(isMountedRoute('/a/knowledge', TABLES)).toBe(true);
    expect(isMountedRoute('/o/governance', TABLES)).toBe(true);
    expect(isMountedRoute('/c/no-such-screen', TABLES)).toBe(false);
  });

  it.each(HOME_PIN_REGISTRY.map((p) => [p.id, p.route] as const))(
    '%s -> %s is mounted',
    (_id, route) => {
      expect(isMountedRoute(route, TABLES)).toBe(true);
    },
  );

  it('checks every pin in the registry, so a new one cannot skip the gate', () => {
    // Guards the guard: if `HOME_PIN_REGISTRY` were ever empty or renamed to
    // something this file does not see, the it.each above would silently
    // assert nothing at all and still report green.
    expect(HOME_PIN_REGISTRY.length).toBeGreaterThan(0);
    for (const pin of HOME_PIN_REGISTRY) {
      expect(pin.route.startsWith('/')).toBe(true);
    }
  });
});
