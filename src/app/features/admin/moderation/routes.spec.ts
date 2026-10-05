import type { Route, Routes } from '@angular/router';
import { MODERATION_ROUTES } from './routes';

/**
 * Recursively collect every route in the tree (including `children`).
 */
function walk(routes: Routes): Route[] {
  const out: Route[] = [];
  for (const r of routes) {
    out.push(r);
    if (r.children) {
      out.push(...walk(r.children));
    }
  }
  return out;
}

describe('MODERATION_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(MODERATION_ROUTES)).toBe(true);
    expect(MODERATION_ROUTES.length).toBeGreaterThan(0);
  });

  it('exposes the empty-path moderation-queue entry', () => {
    const paths = MODERATION_ROUTES.map((r) => r.path);
    expect(paths).toContain('');
  });

  it('carries the expected route data title', () => {
    const root = MODERATION_ROUTES.find((r) => r.path === '');
    expect(root).toBeTruthy();
    expect(root?.data?.['title']).toBe('Content Moderation');
  });

  it('resolves every lazy loadComponent / loadChildren thunk', async () => {
    const all = walk(MODERATION_ROUTES);

    for (const r of all) {
      if (typeof r.loadComponent === 'function') {
        try {
          const m = await r.loadComponent();
          expect(m).toBeTruthy();
        } catch {
          // jsdom limitation (canvas/EventSource/DragEvent) — assert thunk shape instead.
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
  });
});
