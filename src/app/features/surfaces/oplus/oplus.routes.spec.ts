import { describe, it, expect } from 'vitest';
import type { Route } from '@angular/router';
import { OPLUS_ROUTES } from './oplus.routes';

describe('OPLUS_ROUTES', () => {
  it('exports a non-empty Routes array', () => {
    expect(Array.isArray(OPLUS_ROUTES)).toBe(true);
    expect(OPLUS_ROUTES.length).toBeGreaterThan(0);
  });

  it('default empty path redirects to dashboard', () => {
    const defaultRoute = OPLUS_ROUTES.find((r) => r.path === '');
    expect(defaultRoute).toBeTruthy();
    expect(defaultRoute?.redirectTo).toBe('dashboard');
    expect(defaultRoute?.pathMatch).toBe('full');
  });

  it('exposes a dashboard route with loadComponent', () => {
    const dashboard = OPLUS_ROUTES.find((r) => r.path === 'dashboard');
    expect(dashboard).toBeTruthy();
    expect(typeof dashboard?.loadComponent).toBe('function');
  });

  it('redirects the retired "dimensions" route to the dashboard (merged 2026-06-22)', () => {
    const route = OPLUS_ROUTES.find((r) => r.path === 'dimensions');
    expect(route).toBeTruthy();
    expect(route?.redirectTo).toBe('dashboard');
    expect(route?.pathMatch).toBe('full');
    // No component is loaded — the IMDA rubric drill-down now lives on the dashboard.
    expect(route?.loadComponent).toBeUndefined();
  });

  it('wave-2 wires a real component for the "agents" route', () => {
    const route = OPLUS_ROUTES.find((r) => r.path === 'agents');
    expect(route).toBeTruthy();
    expect(typeof route?.loadComponent).toBe('function');
  });

  it.each<['governance' | 'a2a-console']>([
    ['governance'],
    ['a2a-console'],
  ])('wave-3 wires a real component for "%s" route', (path) => {
    const route = OPLUS_ROUTES.find((r) => r.path === path);
    expect(route).toBeTruthy();
    expect(typeof route?.loadComponent).toBe('function');
    // Wave-3 routes no longer use the placeholder `section` data attribute.
    const data = route?.data as { section?: string } | undefined;
    expect(data?.section).toBeUndefined();
  });

  it('wires a real component for the agent-eval route', () => {
    const route = OPLUS_ROUTES.find((r) => r.path === 'agent-eval');
    expect(route).toBeTruthy();
    expect(typeof route?.loadComponent).toBe('function');
  });

  it('wires the auditor-reachable egress-audit read route (CHO-2245)', () => {
    const route = OPLUS_ROUTES.find((r) => r.path === 'egress-audit');
    expect(route).toBeTruthy();
    expect(typeof route?.loadComponent).toBe('function');
    // Auditor-reachable: it carries NO per-route operator guard — it inherits
    // surfaceGuard('oplus') from the `o` parent, the SAME guard the governance
    // page uses. The read endpoint is AuditorGate'd (auditor/admin/owner), a
    // set disjoint from the kill-switch's platform_operator, so the audit lives
    // on its own page rather than co-located on the operator-only kill-switch.
    expect(route?.canActivate).toBeUndefined();
    expect((route?.data as { title?: string } | undefined)?.title).toBe('O+ Egress Audit');
  });

  it('all loadComponent routes resolve to a defined component class', async () => {
    const loadable: Route[] = OPLUS_ROUTES.filter(
      (r): r is Route & { loadComponent: NonNullable<Route['loadComponent']> } =>
        typeof r.loadComponent === 'function',
    );
    for (const r of loadable) {
      const cmp = await r.loadComponent!();
      expect(cmp).toBeTruthy();
    }
  });
});
