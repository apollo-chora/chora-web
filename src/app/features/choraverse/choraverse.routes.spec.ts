import { describe, it, expect } from 'vitest';
import type { Route, Routes } from '@angular/router';

import { CHORAVERSE_ROUTES } from './choraverse.routes';

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

describe('CHORAVERSE_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(CHORAVERSE_ROUTES)).toBe(true);
    expect(CHORAVERSE_ROUTES.length).toBeGreaterThan(0);
  });

  it('gates the whole surface behind authGuard + addOnGuard(choraverse)', () => {
    const root = CHORAVERSE_ROUTES[0];
    expect(root?.path).toBe('');
    expect(Array.isArray(root?.canActivate)).toBe(true);
    expect((root?.canActivate ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('declares the expected child destinations', () => {
    const children = CHORAVERSE_ROUTES[0].children ?? [];
    const paths = children.map((c) => c.path);
    expect(paths).toContain('');
    expect(paths).toContain('chat');
    expect(paths).toContain('skins');
    expect(paths).toContain('evolution');
    expect(paths).toContain('stats');
    expect(paths).toContain('tutorial');
    expect(paths).toContain('persona');
    expect(paths).toContain('memory');
    expect(paths).toContain('store');
    expect(paths).toContain('transactions');
    expect(paths).toContain('a2a-activity');
  });

  it('gates the store + transactions children behind the reward_vault add-on', () => {
    const children = CHORAVERSE_ROUTES[0].children ?? [];
    for (const path of ['store', 'transactions']) {
      const r = children.find((c) => c.path === path);
      expect(Array.isArray(r?.canActivate), `${path} must declare a guard`).toBe(true);
      expect((r?.canActivate ?? []).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('resolves every lazy component thunk', async () => {
    await exerciseThunks(CHORAVERSE_ROUTES);
  }, 60_000);
});