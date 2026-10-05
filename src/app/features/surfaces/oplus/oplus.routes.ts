/**
 * O+ (Observability+) surface route module.
 *
 * Owns: Governance + Observability + runtime control + A2A console.
 *
 * Wave-1: `/o/dashboard` (the single consolidated governance page — IMDA
 * D1-D4 traffic-light panels + rubric drill-down, merged from the former
 * `/o/dimensions` page on 2026-06-22; `/o/dimensions` now redirects here).
 * Wave-2: `/o/agents` (7-agent invariant + risk profile + quality baselines).
 * Wave-3: `/o/governance` (3-tab consolidation of DecisionTrace +
 * HumanOversight + DataGovernance) + `/o/a2a-console` (new A2A admin
 * console for ADR-132 core domain).
 */
import type { Routes } from '@angular/router';

export const OPLUS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./components/dashboard/oplus-dashboard.component').then(
        (m) => m.OplusDashboardComponent,
      ),
    data: { title: 'O+ Governance Dashboard' },
  },
  {
    // Retired 2026-06-22 — the IMDA rubric drill-down was merged into the
    // dashboard. Keep the path as a redirect so bookmarks/deep-links survive.
    path: 'dimensions',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'agents',
    loadComponent: () =>
      import('./components/agents/oplus-agents.component').then(
        (m) => m.OplusAgentsComponent,
      ),
    data: { title: 'O+ Agent Views' },
  },
  {
    path: 'governance',
    loadComponent: () =>
      import('./components/governance/oplus-governance.component').then(
        (m) => m.OplusGovernanceComponent,
      ),
    data: { title: 'O+ Governance Controls' },
  },
  {
    path: 'a2a-console',
    loadComponent: () =>
      import('./components/a2a-console/oplus-a2a-console.component').then(
        (m) => m.OplusA2aConsoleComponent,
      ),
    data: { title: 'O+ A2A Console' },
  },
  {
    path: 'costs',
    loadComponent: () =>
      import('./components/costs/oplus-costs.component').then(
        (m) => m.OplusCostsComponent,
      ),
    data: { title: 'O+ AI Cost & Usage' },
  },
  {
    path: 'agent-eval',
    loadComponent: () =>
      import('./components/agent-eval/oplus-agent-eval.component').then(
        (m) => m.OplusAgentEvalComponent,
      ),
    data: { title: 'O+ Agent Eval Evidence' },
  },
  // CHO-2148 / ADR-231 D6 — the platform egress kill-switch. Engaging it makes
  // chora-model-gateway deny EVERY grounded web call, for EVERY tenant, with no
  // deploy. PLATFORM_OPERATOR only: the component checks the role to hide the
  // control, but the API is the gate (gateway + observability both fail closed).
  // surfaceGuard('oplus') alone is NOT sufficient — it admits anyone with O+
  // surface membership, with operator only as a bypass.
  {
    path: 'egress-kill-switch',
    loadComponent: () =>
      import(
        './components/egress-kill-switch/oplus-egress-kill-switch.component'
      ).then((m) => m.OplusEgressKillSwitchComponent),
    data: { title: 'O+ Web Egress Kill-Switch' },
  },
  // CHO-2245 / ADR-231 — the O+ external-web egress AUDIT trail (read-only
  // transparency: every grounded web call a Familiar routed through the model
  // gateway, permitted or denied; IMDA D1 accountability + D2 transparency).
  // Gated auditor/admin/owner by the AuditorGate on /bff/oplus/*; this route
  // inherits surfaceGuard('oplus') from the `o` parent — the SAME guard the
  // governance page uses, so it is auditor-reachable. It is deliberately NOT
  // co-located on the kill-switch page above: that page gates its whole body on
  // platform_operator, a role the AuditorGate excludes (and vice-versa — the
  // read endpoint's AuditorGate omits platform_operator), so co-location would
  // strand each disjoint audience on half a page. The kill-switch page links here.
  {
    path: 'egress-audit',
    loadComponent: () =>
      import(
        './components/egress-audit/oplus-egress-audit.component'
      ).then((m) => m.OplusEgressAuditComponent),
    data: { title: 'O+ Egress Audit' },
  },
];
