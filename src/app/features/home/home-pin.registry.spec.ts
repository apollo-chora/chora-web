import { describe, it, expect } from 'vitest';

import { ALL_SURFACE_KEYS } from '../surfaces/surface-access';
import type { SurfaceKey } from '../surfaces/surface-landing.component';

import {
  HOME_PIN_IDS,
  HOME_PIN_REGISTRY,
  homePinById,
  type HomePinDefinition,
} from './home-pin.registry';

/**
 * ADR-240 D11 - the FE registry is the SINGLE authority for the pin vocabulary.
 *
 * This table-driven totality test enumerates the WHOLE registry (mirroring
 * ADR-239 D5's precedent and rplus.nav.spec.ts) so a new pin cannot silently
 * land unvalidated the way `study` / `transcript` drifted for dashboard_layout
 * (CHO-2274). The backend does NOT validate ids (D11: unknown ids are inert in
 * a GCID-scoped preference blob); this test guards the FE authority.
 */

/** Each surface's route prefix - a pin must live inside the surface it names. */
const SURFACE_ROUTE_PREFIX: Readonly<Record<SurfaceKey, string>> = {
  aplus: '/a/',
  cplus: '/c/',
  hplus: '/h/',
  oplus: '/o/',
  rplus: '/r/',
};

/** Stable persisted id shape: lowercase kebab, like WrapperKey (never-rename). */
const STABLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('HOME_PIN_REGISTRY - D11 totality', () => {
  it('is non-empty (the launcher has something to offer)', () => {
    expect(HOME_PIN_REGISTRY.length).toBeGreaterThan(0);
  });

  // ── every-entry invariants (the table-driven sweep) ──────────────────────
  it.each(HOME_PIN_REGISTRY.map((p) => [p.id, p] as const))(
    'entry %s satisfies every registry invariant',
    (_id, pin: HomePinDefinition) => {
      // stable id
      expect(pin.id, 'id must be non-empty').not.toBe('');
      expect(pin.id.trim(), 'id must not have surrounding whitespace').toBe(pin.id);
      expect(pin.id, 'id must be stable kebab (never-rename)').toMatch(STABLE_ID);

      // label i18n key
      expect(pin.labelKey.length, 'labelKey must be non-empty').toBeGreaterThan(0);
      expect(pin.labelKey.startsWith('home.'), 'labelKey must be namespaced home.*').toBe(true);

      // icon
      expect(pin.icon.length, 'icon must be non-empty').toBeGreaterThan(0);

      // route, under the owning surface
      expect(pin.route.startsWith('/'), 'route must be an absolute in-app path').toBe(true);
      expect(
        pin.route.startsWith(SURFACE_ROUTE_PREFIX[pin.owningSurface]),
        `route ${pin.route} must live under ${pin.owningSurface} (${SURFACE_ROUTE_PREFIX[pin.owningSurface]})`,
      ).toBe(true);

      // owning surface
      expect(
        (ALL_SURFACE_KEYS as readonly string[]).includes(pin.owningSurface),
        'owningSurface must be a canonical CHORA surface',
      ).toBe(true);

      // optional capability, non-empty when present
      if (pin.requiredCapability !== undefined) {
        expect(pin.requiredCapability.length, 'requiredCapability, if present, non-empty').toBeGreaterThan(0);
      }
    },
  );

  it('has globally unique ids (no drift-hiding duplicates)', () => {
    const ids = HOME_PIN_REGISTRY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every CHORA surface (a launcher for the whole platform)', () => {
    const surfaces = new Set(HOME_PIN_REGISTRY.map((p) => p.owningSurface));
    for (const key of ALL_SURFACE_KEYS) {
      expect(surfaces.has(key), `at least one pin for ${key}`).toBe(true);
    }
  });
});

describe('HOME_PIN_IDS - the derived single authority', () => {
  it('equals the exact set of registry ids (derived, never hand-mirrored)', () => {
    const derived = new Set(HOME_PIN_REGISTRY.map((p) => p.id));
    expect(HOME_PIN_IDS.size).toBe(derived.size);
    for (const id of derived) {
      expect(HOME_PIN_IDS.has(id)).toBe(true);
    }
    // and nothing extra beyond the registry
    for (const id of HOME_PIN_IDS) {
      expect(derived.has(id)).toBe(true);
    }
  });
});

describe('homePinById', () => {
  it('resolves a known id to its definition', () => {
    const first = HOME_PIN_REGISTRY[0];
    expect(homePinById(first.id)).toBe(first);
  });

  it('returns undefined for an unknown id', () => {
    expect(homePinById('definitely-not-a-pin')).toBeUndefined();
  });
});
