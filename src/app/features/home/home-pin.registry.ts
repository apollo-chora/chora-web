/**
 * Home pin registry (ADR-240 Track B H2, D4 + D11).
 *
 * The STATIC, typed vocabulary of pinnable cross-surface entry points for the
 * shell /home launcher. Each entry is a SCREEN a user can already reach from
 * some surface or role they hold; the launcher links to it, it does not re-host
 * it (ADR-240 D6). Filtering to what a live session can reach happens at RENDER
 * via `home-pin.filter.ts`, never here and never at reconcile.
 *
 * D4 (portability): the id + metadata shape is deliberately flat so a future
 * BFF-served per-role / per-tenant manifest can replace this source WITHOUT
 * changing any persisted `home_layout` value or the reconcile. The moment a
 * user pins a card its `id` is a STABLE PERSISTED STRING: NEVER rename an id
 * (a rename silently orphans every user who pinned it), exactly the WrapperKey
 * never-rename rule. Add or remove entries; never rewrite an id's history.
 *
 * D11 (single authority): this registry is the ONE authority for the pin
 * vocabulary. `HOME_PIN_IDS` is DERIVED from it (never hand-mirrored), and
 * `home-pin.registry.spec.ts` enumerates the whole registry so a new pin cannot
 * land unvalidated the way `study` / `transcript` drifted for dashboard_layout
 * (CHO-2274). The gateway does NOT edge-validate these ids: a pin is an id in a
 * GCID-scoped preference blob, it grants nothing, the filter gates access at
 * render, and reconcile drops an unknown id. i18n VALUES for `labelKey` are
 * owned by H3 (this module carries KEYS only).
 *
 * Gating mirrors the shipped surface nav EXACTLY so the home never becomes a
 * fourth opinion about who may go where (ADR-240 D4): a pin carries a
 * `requiredCapability` ONLY where its nav item carries one (A+ studio ->
 * assessment:author; R+ offerings -> delivery:ops). The C+ surface add-on gate
 * (cplus_social) and every membership gate are applied by the filter through
 * the shipped predicates, not restated here.
 */
import type { SurfaceKey } from '../surfaces/surface-landing.component';

/**
 * A pinnable entry point. Flat + BFF-portable (D4). `labelKey` is an i18n key
 * (values deferred to H3); `requiredCapability`, when present, is an
 * `RbacService` capability checked at render by the filter.
 */
export interface HomePinDefinition {
  readonly id: string;
  readonly labelKey: string;
  readonly icon: string;
  readonly route: string;
  readonly owningSurface: SurfaceKey;
  readonly requiredCapability?: string;
}

/**
 * The persisted layout element (ADR-240 D2): a reference to a registry pin by
 * id. `HomePin` is `{ id }` for v1; H5 adds position fields, so keep consumers
 * keyed on `id` only and let the reconcile pass extra fields through.
 */
export interface HomePin {
  readonly id: string;
}

/**
 * The pin vocabulary. Ordered so the FIRST entry per surface is that surface's
 * primary landing (consumed by `defaultPins`, which takes the first reachable
 * pin per surface). Routes + icons + capability gates are grounded in the live
 * per-surface nav (aplus/cplus/hplus/oplus/rplus `*.nav.ts`).
 */
export const HOME_PIN_REGISTRY: readonly HomePinDefinition[] = [
  // A+ (learner + author) - ungated surface.
  { id: 'aplus-learning', labelKey: 'home.pins.aplusLearning', icon: 'shapes', route: '/a/dashboard', owningSurface: 'aplus' },
  { id: 'aplus-knowledge', labelKey: 'home.pins.aplusKnowledge', icon: 'map', route: '/a/knowledge', owningSurface: 'aplus' },
  { id: 'aplus-familiar', labelKey: 'home.pins.aplusFamiliar', icon: 'paw', route: '/a/companion', owningSurface: 'aplus' },
  { id: 'aplus-wallet', labelKey: 'home.pins.aplusWallet', icon: 'wallet', route: '/a/wallet', owningSurface: 'aplus' },
  { id: 'aplus-studio', labelKey: 'home.pins.aplusStudio', icon: 'pen', route: '/a/studio', owningSurface: 'aplus', requiredCapability: 'assessment:author' },

  // C+ (social) - surface add-on gate cplus_social applied by the filter.
  { id: 'cplus-feed', labelKey: 'home.pins.cplusFeed', icon: 'fire', route: '/c/feed', owningSurface: 'cplus' },
  // `cplus-leaderboards` -> `/c/leaderboards` was RETIRED (C1b, 2026-09-03).
  // `cplus.routes.ts` has never mounted that path (feed, duels, interests,
  // connections, bookmarks), so every session holding `cplus_social` was
  // offered a pin that fell through `app.routes.ts`'s `{ path: '**',
  // redirectTo: 'not-found' }`. The leaderboards COMPONENT is complete and
  // stays where it is; mounting a route for it is a Circle build row after the
  // R43 ADR, and the pin comes back with the route, not before it.
  // `home-pin.route-liveness.spec.ts` now fails any pin whose route is unmounted.

  // H+ (tenant admin) - membership-gated surface; nav items carry no capability.
  { id: 'hplus-tenant', labelKey: 'home.pins.hplusTenant', icon: 'gauge', route: '/h/tenant', owningSurface: 'hplus' },
  { id: 'hplus-members', labelKey: 'home.pins.hplusMembers', icon: 'users', route: '/h/members', owningSurface: 'hplus' },
  { id: 'hplus-billing', labelKey: 'home.pins.hplusBilling', icon: 'credit-card', route: '/h/billing', owningSurface: 'hplus' },

  // O+ (governance + observability) - membership-gated surface; nav ungated.
  { id: 'oplus-dashboard', labelKey: 'home.pins.oplusDashboard', icon: 'chart-line', route: '/o/dashboard', owningSurface: 'oplus' },
  { id: 'oplus-governance', labelKey: 'home.pins.oplusGovernance', icon: 'shield', route: '/o/governance', owningSurface: 'oplus' },
  { id: 'oplus-costs', labelKey: 'home.pins.oplusCosts', icon: 'coins', route: '/o/costs', owningSurface: 'oplus' },

  // R+ (delivery) - offerings gated on delivery:ops; exams ungated (proctors).
  { id: 'rplus-offerings', labelKey: 'home.pins.rplusOfferings', icon: 'graduation-cap', route: '/r/offerings', owningSurface: 'rplus', requiredCapability: 'delivery:ops' },
  { id: 'rplus-exams', labelKey: 'home.pins.rplusExams', icon: 'file-lines', route: '/r/exams', owningSurface: 'rplus' },
];

/**
 * The DERIVED pin vocabulary (ADR-240 D11): the set of known ids, computed from
 * the registry, never a hand-written mirror. This is the `knownIds` the home
 * reconcile keys on. A future BFF manifest would derive its own set the same
 * way; the rule (one authority, everyone else derives) points either direction.
 */
export const HOME_PIN_IDS: ReadonlySet<string> = new Set(
  HOME_PIN_REGISTRY.map((pin) => pin.id),
);

/** Resolve a pin id to its definition (for rendering), or undefined if unknown. */
export function homePinById(id: string): HomePinDefinition | undefined {
  return HOME_PIN_REGISTRY.find((pin) => pin.id === id);
}
