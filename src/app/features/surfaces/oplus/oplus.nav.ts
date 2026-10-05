/**
 * O+ (Observability+) surface nav config — Stage 3 wave 1.
 *
 * Owns: Governance + Observability + runtime control + A2A console.
 * Wave-1 routes: `/o/dashboard` is the only fully built screen; the
 * remaining four entries point to wave-2 placeholder pages.
 *
 * Icons follow the lucide-ish keyword set used by `SidebarComponent` in
 * chora-web (e.g. `grid`, `hexagon`, `compass`). Where the upstream
 * AssessorFlow source used FontAwesome glyphs, the closest semantic
 * keyword is used here so the existing sidebar icon resolver picks them up.
 */
import type { NavItem } from '../surface-nav';

export const OPLUS_NAV: readonly NavItem[] = [
  { labelKey: 'nav.oplus_dashboard', icon: 'grid', route: '/o/dashboard' },
  { labelKey: 'nav.oplus_agents', icon: 'cpu', route: '/o/agents' },
  { labelKey: 'nav.oplus_governance', icon: 'shield', route: '/o/governance' },
  { labelKey: 'nav.oplus_costs', icon: 'coins', route: '/o/costs' },
  { labelKey: 'nav.oplus_agent_eval', icon: 'flask-conical', route: '/o/agent-eval' },
  // CHO-2148 — platform web-egress kill-switch (ADR-231 D6). The operator's
  // emergency stop on Far Sight: engaging it denies every grounded web call,
  // for every tenant, immediately.
  { labelKey: 'nav.oplus_egress_kill_switch', icon: 'power', route: '/o/egress-kill-switch' },
  // Owner ruling 2026-07-27: the external A2A edge is designed-not-wired
  // (CHO-2358 - zero gateway instances, no DNS, no LB host rule), so the
  // console entry sits LAST, grayed out with a coming-soon note instead of
  // presenting a live-looking door to an unwired surface.
  {
    labelKey: 'nav.oplus_a2a_console',
    icon: 'plug',
    route: '/o/a2a-console',
    disabled: true,
    disabledNoteKey: 'nav.coming_soon',
  },
];
