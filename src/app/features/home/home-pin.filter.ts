/**
 * Home pin filter + default set (ADR-240 Track B H2, D4 + D7).
 *
 * The home's READ-ONLY reuse of the shipped access predicates, so it can never
 * become a fourth opinion about who may go where (ADR-240 D4). A pin is visible
 * for a session IFF all three axes agree:
 *   1. membership - `resolveVisibleSurfaces` says the owning surface is visible;
 *   2. add-on     - `canAccessSurface` says the owning surface is reachable
 *                   (today only C+ -> cplus_social; platform_operator god-mode);
 *   3. capability - the pin has no `requiredCapability`, or `hasCapability` holds.
 *
 * Filtering happens at RENDER against the LIVE session, never at reconcile: a
 * user who loses a capability sees the pin disappear and get it back when the
 * capability returns, rather than having it deleted from their persisted layout
 * (that is `home-pin.reconcile`'s invariant, keyed on the id vocabulary alone).
 *
 * `defaultPins` (D7) derives a small first-run set FROM the filter so /home is
 * never blank on first run: the first reachable pin per accessible surface, in
 * CHORA surface order. It is DERIVED, not persisted - a user with no
 * `home_layout` has no row, which the typed port reports as `layout: null`
 * (unset), never as an empty layout.
 *
 * Pure + framework-free (no Angular, no TestBed): the structural `Pick` shapes
 * are satisfied by the real `FeatureFlagService` / `RbacService` at the call
 * site, and tie to them so a signature drift is caught by the compiler.
 */
import type { FeatureFlagService } from '../../core/services/feature-flag.service';
import type { RbacService } from '../../core/services/rbac.service';
import {
  ALL_SURFACE_KEYS,
  canAccessSurface,
  resolveVisibleSurfaces,
} from '../surfaces/surface-access';
import type { SurfaceFailMode, SurfaceMembershipView } from '../surfaces/surface-access';
import type { SurfaceKey } from '../surfaces/surface-landing.component';

import { HOME_PIN_REGISTRY } from './home-pin.registry';
import type { HomePin, HomePinDefinition } from './home-pin.registry';

/** Add-on entitlement axis - structurally the real `FeatureFlagService`. */
export type AddOnAccessCheck = Pick<FeatureFlagService, 'isEnabled'>;
/** Operator (for canAccessSurface) + capability axes - the real `RbacService`. */
export type CapabilityAccessCheck = Pick<RbacService, 'hasRole' | 'hasCapability'>;

/** Everything the filter reads from the live session (all read-only). */
export interface HomePinFilterInputs {
  /** Active tenant context (membership view), or null when none is set. */
  readonly active: SurfaceMembershipView | null;
  /** All memberships, for the union fallback in `resolveVisibleSurfaces`. */
  readonly memberships: readonly SurfaceMembershipView[];
  readonly flags: AddOnAccessCheck;
  readonly rbac: CapabilityAccessCheck;
  /** Fail-mode when the session carries no usable `surfaces[]` (guard axis). */
  readonly onEmpty: SurfaceFailMode;
}

/**
 * The visible subset of `registry` for a session, reusing the shipped
 * predicates read-only. A projection: the source registry is never mutated.
 */
export function filterVisiblePins(
  registry: readonly HomePinDefinition[],
  inputs: HomePinFilterInputs,
): HomePinDefinition[] {
  const visibleSurfaces = resolveVisibleSurfaces(inputs.active, inputs.memberships, {
    onEmpty: inputs.onEmpty,
  });
  return registry.filter((pin) => isPinVisible(pin, visibleSurfaces, inputs));
}

function isPinVisible(
  pin: HomePinDefinition,
  visibleSurfaces: ReadonlySet<SurfaceKey>,
  inputs: HomePinFilterInputs,
): boolean {
  // 1. membership axis
  if (!visibleSurfaces.has(pin.owningSurface)) {
    return false;
  }
  // 2. add-on axis (C+ -> cplus_social; platform_operator god-mode)
  if (!canAccessSurface(pin.owningSurface, inputs.flags, inputs.rbac)) {
    return false;
  }
  // 3. capability axis (only for capability-scoped pins)
  if (pin.requiredCapability !== undefined && !inputs.rbac.hasCapability(pin.requiredCapability)) {
    return false;
  }
  return true;
}

/**
 * A role-derived DEFAULT pin set (ADR-240 D7): the first reachable pin per
 * accessible surface, in CHORA surface order. Small (at most one per surface),
 * sensible (the registry lists each surface's primary landing first, so this is
 * that landing, degrading to the first reachable pin when the landing itself is
 * capability-gated off), and DERIVED from the filter (never persisted). Returns
 * `HomePin[]` so it can seed the engine's layout directly; render resolves each
 * id back to its definition via `homePinById`.
 */
export function defaultPins(inputs: HomePinFilterInputs): HomePin[] {
  const visible = filterVisiblePins(HOME_PIN_REGISTRY, inputs);
  const out: HomePin[] = [];
  for (const surface of ALL_SURFACE_KEYS) {
    const primary = visible.find((pin) => pin.owningSurface === surface);
    if (primary) {
      out.push({ id: primary.id });
    }
  }
  return out;
}
