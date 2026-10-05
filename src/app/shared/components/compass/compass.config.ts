/**
 * The A+ compass bar (UX Track U, plan section 3.1).
 *
 * Replaces the 280px sidebar on A+ only. C+/H+/O+/R+ keep the sidebar, which
 * is why this config lives beside the compass rather than in the shared
 * surface-nav registry: it is not a sixth nav config, it is the A+ shell.
 *
 * Six entries, role-gated and fail-closed. Deliberately NO add-on-gated entry:
 * per R39 a learner reaches C+ through the hand-offs, the "your circle" card
 * and the atom exit, never through a door in the shell chrome.
 *
 * `NavItem` is reused rather than redeclared so `isNavItemVisible` filters
 * compass entries and sidebar entries through the same fail-closed rule.
 */
import type { NavItem } from '../../../features/surfaces/surface-nav';

export const APLUS_COMPASS: readonly NavItem[] = [
  { labelKey: 'aplus.shell.compass.home', icon: 'house', route: '/a/home' },
  // "Map" is the learner's word for the knowledge surface. The retired sidebar
  // entry it replaces read "Discover"; the plan's vocabulary (section 3.3) is
  // Map, because a Goal IS a map (ADR-214). The old label key is not named
  // here any more: it left en.json with the config in C2 slice 3, and a
  // comment naming a key that no longer exists is a false lead for the next
  // reader (and, while the dead-key guard still ran, kept the key alive).
  { labelKey: 'aplus.shell.compass.map', icon: 'map', route: '/a/knowledge' },
  { labelKey: 'aplus.shell.compass.roster', icon: 'paw', route: '/a/roster' },
  { labelKey: 'aplus.shell.compass.courses', icon: 'graduation-cap', route: '/a/courses' },
  // Fail-closed on `assessment:author`, matching the roleGuard on every
  // `/a/studio/**` route: a learner-only session never sees this entry. NOT
  // `course:author`, which is admin-only by owner ruling and which an author
  // does not hold.
  {
    labelKey: 'aplus.shell.compass.create',
    icon: 'pen',
    route: '/a/studio',
    capability: 'assessment:author',
  },
  { labelKey: 'aplus.shell.compass.wallet', icon: 'wallet', route: '/a/wallet' },
];

/**
 * FontAwesome 6.4.0 (free, solid) classes for exactly the six icons this bar
 * uses. Explicit rather than a shared lookup with a fallback glyph: a compass
 * of six fixed entries should fail to compile if an icon name is wrong, not
 * render a neutral dot.
 */
export const COMPASS_ICON_CLASS: Readonly<Record<string, string>> = {
  house: 'fa-solid fa-house',
  map: 'fa-solid fa-map',
  paw: 'fa-solid fa-paw',
  'graduation-cap': 'fa-solid fa-graduation-cap',
  pen: 'fa-solid fa-pen',
  wallet: 'fa-solid fa-wallet',
};
