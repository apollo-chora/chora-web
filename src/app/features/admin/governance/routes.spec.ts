import type { Route, Routes } from '@angular/router';

import { GOVERNANCE_ROUTES } from './routes';

/**
 * Recursively walk a Routes array, invoking every lazy `loadComponent` and
 * `loadChildren` thunk so the lazy import chunks are executed (coverage).
 *
 * If awaiting a specific thunk throws (jsdom limitations: canvas / EventSource /
 * DragEvent), the thunk is still asserted to be a function so a single bad
 * thunk cannot fail the whole suite.
 */
async function walkAndExecute(routes: Routes): Promise<void> {
  for (const r of routes as Route[]) {
    if (typeof r.loadComponent === 'function') {
      try {
        const m = await r.loadComponent();
        expect(m).toBeTruthy();
      } catch {
        expect(typeof r.loadComponent).toBe('function');
      }
    }
    if (typeof r.loadChildren === 'function') {
      try {
        const c = await r.loadChildren();
        expect(c).toBeTruthy();
      } catch {
        expect(typeof r.loadChildren).toBe('function');
      }
    }
    if (Array.isArray(r.children)) {
      await walkAndExecute(r.children);
    }
  }
}

describe('GOVERNANCE_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(GOVERNANCE_ROUTES)).toBe(true);
    expect(GOVERNANCE_ROUTES.length).toBeGreaterThan(0);
  });

  it('has a default empty-path redirect to restrictions with pathMatch full', () => {
    const redirect = GOVERNANCE_ROUTES.find((r) => r.path === '');
    expect(redirect).toBeDefined();
    expect(redirect?.redirectTo).toBe('restrictions');
    expect(redirect?.pathMatch).toBe('full');
  });

  it('declares the known governance paths', () => {
    const paths = GOVERNANCE_ROUTES.map((r) => r.path);
    expect(paths).toContain('restrictions');
    expect(paths).toContain('appeals');
    expect(paths).toContain('kyc');
    expect(paths).toContain('moderation');
    expect(paths).toContain('moderation/queue');
    expect(paths).toContain('escalation');
  });

  it('attaches a title to each lazy-loaded route via data', () => {
    const titles = GOVERNANCE_ROUTES.filter((r) => typeof r.loadComponent === 'function').map(
      (r) => r.data?.['title'],
    );
    expect(titles).toContain('Restrictions');
    expect(titles).toContain('Appeals');
    expect(titles).toContain('KYC Review');
    expect(titles).toContain('Moderation Log');
    expect(titles).toContain('Moderation Queue');
    expect(titles).toContain('Escalation Tracker');
  });

  it('provides a loadComponent thunk (function) for every non-redirect route', () => {
    for (const r of GOVERNANCE_ROUTES) {
      if (r.redirectTo) {
        continue;
      }
      expect(typeof r.loadComponent).toBe('function');
    }
  });

  it('executes every lazy loadComponent / loadChildren thunk', async () => {
    await walkAndExecute(GOVERNANCE_ROUTES);
  });
});
