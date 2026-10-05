import type { NavItem } from '../surface-nav';

/**
 * C+ (Circle+) surface nav config — Atom Sharing Redesign (Phase 3).
 *
 * Owns: Content Sharing — shared-atom feed, duels, leaderboards.
 * Routes prefixed `/c/*`. Nav shrinks 7→3: the mock pages (profile,
 * wallet, bounties, connections) are deleted; only the real-backed v1
 * features remain.
 *
 * §4.7c (auth-hardening Phase A, CHO-1717 / ADR-181): every C+ entry is
 * gated by the `cplus_social` add-on entitlement — the sidebar hides items
 * whose `addOn` check fails, and the `/c` route mount carries the matching
 * `addOnGuard('cplus_social')`. Per Phase-A ruling #6, C+ = public space +
 * opt-in chora-managed tenants via the `cplus_social` add-on.
 */

/** Add-on code gating the whole C+ surface (tenancy `add_ons.code`). */
export const CPLUS_ADDON_CODE = 'cplus_social';

export const CPLUS_NAV: readonly NavItem[] = [
  { labelKey: 'nav.cplus.feed', icon: 'fire', route: '/c/feed', addOn: CPLUS_ADDON_CODE },
  { labelKey: 'nav.cplus.duels', icon: 'swords', route: '/c/duels', addOn: CPLUS_ADDON_CODE },
  { labelKey: 'nav.cplus.interests', icon: 'user-gear', route: '/c/interests', addOn: CPLUS_ADDON_CODE },
  { labelKey: 'nav.cplus.connections', icon: 'link', route: '/c/connections', addOn: CPLUS_ADDON_CODE },
];
