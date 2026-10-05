/**
 * Surface nav aggregation contract — Stage 3 pre-flight.
 *
 * Owns the per-surface NavItem registry consumed by `SidebarComponent`.
 * Each Stage 3 surface agent edits ONLY their own `{surface}/{surface}.nav.ts`
 * file — this aggregator never needs to be touched by surface agents.
 */
import type { SurfaceKey } from './surface-landing.component';
import { CPLUS_NAV } from './cplus/cplus.nav';
import { HPLUS_NAV } from './hplus/hplus.nav';
import { OPLUS_NAV } from './oplus/oplus.nav';
import { RPLUS_NAV } from './rplus/rplus.nav';

/**
 * Sidebar nav item contract.
 *
 * `addOn` (optional): snake_case add-on code checked against `FeatureFlagService`.
 * Items with an unsatisfied add-on flag are hidden from the rendered nav.
 *
 * `capability` (optional): RBAC capability checked against `RbacService`
 * (see role-capabilities.ts). Items with an unmet capability are hidden
 * from the rendered nav — same fail-closed pattern as `addOn`. Used by
 * admin-scoped entries that should only surface to users who can
 * actually act on the destination.
 *
 * `role` (optional): session JWT role claim checked case-insensitively
 * via `RbacService.hasRole` (auth-hardening Phase A §4.7d, CHO-1717).
 * Stricter than `capability` — used by operator-scoped entries (e.g. the
 * Setup-Tenant wizard, `platform_operator` only per ADR-181 ruling #5).
 * Same fail-closed hide-when-unmet pattern.
 *
 * `group` (optional): a band key that groups this item under an uppercase
 * band header in the sidebar (CHO-2243, R+ nav de-shadow R1). Items with no
 * `group` render flat, with no header (A+/C+/H+/O+). Only R+ tags its items;
 * SidebarComponent owns the canonical band order + labels + which band is
 * collapsible. Visibility gating (`capability`/`role`/`addOn`) is unchanged —
 * an empty band renders no header.
 */
export interface NavItem {
  readonly labelKey: string;
  readonly icon: string;
  readonly route: string;
  readonly addOn?: string;
  readonly capability?: string;
  readonly role?: string;
  readonly group?: string;
  /**
   * `disabled` (optional): the destination exists in the product plan but is
   * not live yet. The sidebar renders the item grayed out, non-navigable
   * (a span, not an anchor - keyboard focus skips it) with a small note
   * badge, instead of hiding it. Visibility gates (`addOn`/`capability`/
   * `role`) still apply first: a gated-out item stays hidden entirely.
   */
  readonly disabled?: boolean;
  /**
   * `disabledNoteKey` (optional): i18n key for the note badge shown on a
   * disabled item (defaults to `nav.coming_soon`).
   */
  readonly disabledNoteKey?: string;
}

/** Per-surface nav configuration shape. */
export interface SurfaceNavConfig {
  readonly surface: SurfaceKey;
  readonly items: readonly NavItem[];
}

/**
 * Aggregated nav-item registry, keyed by SurfaceKey and DELIBERATELY PARTIAL.
 *
 * Sidebar derives `activeSurface` from the URL prefix (`/a/*` → 'aplus',
 * `/c/*` → 'cplus', etc) and looks up its nav items here. Legacy unprefixed
 * routes (e.g. `/dashboard`, `/learning`) fall back to 'aplus'.
 *
 * **A+ has no entry, and cannot have one.** The A+ sidebar was replaced by the
 * compass bar in C2 slice 1, and `main-layout.component.html` renders the
 * sidebar only under `@if (!usesCompass())` while `usesCompass()` is true for
 * every URL that resolves to A+, legacy unprefixed ones included. So a
 * `SURFACE_NAV_CONFIGS.aplus` could never be rendered by anything: `APLUS_NAV`
 * had been dead code since that slice landed, and slice 3 deleted it. The A+
 * shell's navigation lives in `shared/components/compass/compass.config.ts`,
 * which is not a sixth entry here because it is not a sidebar.
 *
 * The type is `Partial` rather than a full `Record` so this absence is a fact
 * the compiler carries to every reader, instead of a lie kept alive by an
 * entry nothing can reach. Consumers must handle a missing key; the sidebar
 * renders an empty nav.
 */
export const SURFACE_NAV_CONFIGS: Readonly<
  Partial<Record<SurfaceKey, readonly NavItem[]>>
> = {
  cplus: CPLUS_NAV,
  hplus: HPLUS_NAV,
  oplus: OPLUS_NAV,
  rplus: RPLUS_NAV,
};

/**
 * Resolve the active surface from a router URL.
 *
 * - `/a`, `/a/...` → 'aplus'
 * - `/c`, `/c/...` → 'cplus'
 * - `/h`, `/h/...` → 'hplus'
 * - `/o`, `/o/...` → 'oplus'
 * - `/r`, `/r/...` → 'rplus'
 * - `/admin`, `/admin/...` → 'hplus' (tenant admin lives in H+; e.g. Setup Wizard at `/admin/tenant/settings/wizard`)
 * - Anything else (`/dashboard`, `/learning`, `/`, `/login`, …) → 'aplus' (legacy default).
 */
export function resolveActiveSurface(url: string): SurfaceKey {
  // Strip query/fragment, normalise leading slash, take the first path segment.
  const path = url.split(/[?#]/, 1)[0] ?? '';
  const firstSegment = path.replace(/^\/+/, '').split('/', 1)[0] ?? '';

  switch (firstSegment) {
    case 'a':
      return 'aplus';
    case 'c':
      return 'cplus';
    case 'h':
      return 'hplus';
    case 'o':
      return 'oplus';
    case 'r':
      return 'rplus';
    case 'admin':
      return 'hplus';
    default:
      return 'aplus';
  }
}
