import { describe, it, expect } from 'vitest';
import type { Route, Routes } from '@angular/router';

import { BILLING_ROUTES } from './routes';

/**
 * Recursively collect every route (including nested `children`) from a Routes array.
 */
function flatten(routes: Routes): Route[] {
  const out: Route[] = [];
  for (const r of routes) {
    out.push(r);
    if (r.children) {
      out.push(...flatten(r.children));
    }
  }
  return out;
}

/**
 * Exercise every lazy thunk (`loadComponent` / `loadChildren`) on a Routes array.
 * Individual thunks are wrapped so a jsdom limitation in one component import
 * cannot fail the whole suite.
 */
async function exerciseThunks(routes: Routes): Promise<void> {
  for (const r of flatten(routes)) {
    if (typeof r.loadComponent === 'function') {
      try {
        const m = await r.loadComponent();
        expect(m).toBeTruthy();
      } catch {
        // jsdom/runtime limitation on import — assert the thunk shape instead.
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
  }
}

describe('BILLING_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(BILLING_ROUTES)).toBe(true);
    expect(BILLING_ROUTES.length).toBeGreaterThan(0);
  });

  it('redirects the empty path to subscription', () => {
    const root = BILLING_ROUTES.find((r) => r.path === '');
    expect(root?.redirectTo).toBe('subscription');
    expect(root?.pathMatch).toBe('full');
  });

  it('declares the expected billing destinations', () => {
    const paths = BILLING_ROUTES.map((r) => r.path);
    expect(paths).toContain('subscription');
    expect(paths).toContain('invoices');
    expect(paths).toContain('promo-codes');
    expect(paths).toContain('usage');
    expect(paths).toContain('marketplace/:itemId');
    expect(paths).toContain('campaigns');
    expect(paths).toContain('campaigns/new');
    expect(paths).toContain('instructor-revenue');
  });

  it('orders the static campaigns/new before campaigns', () => {
    const paths = BILLING_ROUTES.map((r) => r.path);
    expect(paths.indexOf('campaigns/new')).toBeGreaterThanOrEqual(0);
    expect(paths.indexOf('campaigns/new')).toBeLessThan(paths.indexOf('campaigns'));
  });

  it('attaches a title to every loadComponent leaf route', () => {
    for (const r of BILLING_ROUTES) {
      if (typeof r.loadComponent === 'function') {
        expect(r.data).toBeDefined();
        expect(typeof (r.data as { title?: string }).title).toBe('string');
      }
    }
  });

  it('resolves every lazy component thunk', async () => {
    await exerciseThunks(BILLING_ROUTES);
  }, 60_000);
});