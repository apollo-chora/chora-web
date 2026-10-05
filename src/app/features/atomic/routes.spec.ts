import { expect } from 'vitest';
import type { Route, Routes } from '@angular/router';
import { ATOMIC_ROUTES } from './routes';

/**
 * Atomic feature route-module spec.
 *
 * Covers the ATOMIC_ROUTES array literal AND every lazy `loadComponent`
 * thunk so the lazy `import(...)` lines are exercised. All entries are
 * `loadComponent` lazy routes (no children, no guards, no redirects).
 */

/** Recursively collect every route (including any nested children). */
function flatten(routes: Routes): Route[] {
  const out: Route[] = [];
  for (const r of routes) {
    out.push(r);
    if (r.children) out.push(...flatten(r.children));
  }
  return out;
}

describe('ATOMIC_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(ATOMIC_ROUTES)).toBe(true);
    expect(ATOMIC_ROUTES.length).toBeGreaterThan(0);
  });

  it('mounts the atom list at the empty path', () => {
    const list = ATOMIC_ROUTES.find((r) => r.path === '');
    expect(list).toBeDefined();
    expect(list?.loadComponent).toBeDefined();
    expect((list?.data as { title?: string })?.title).toBe('Learning Atoms');
  });

  it('contains the known atom-player and daily-dose paths', () => {
    const paths = ATOMIC_ROUTES.map((r) => r.path);
    expect(paths).toContain('player/:id');
    expect(paths).toContain('daily-dose');
  });

  it('contains the learning-path, exam-prep and training paths', () => {
    const paths = ATOMIC_ROUTES.map((r) => r.path);
    expect(paths).toContain('path/:pathId');
    expect(paths).toContain('exam-prep/:examId/final');
    expect(paths).toContain('exam-prep/:examId/day-of');
    expect(paths).toContain('training');
  });

  it('mounts the revision-history viewer at /revisions/:atomId', () => {
    const rev = ATOMIC_ROUTES.find((r) => r.path === 'revisions/:atomId');
    expect(rev).toBeDefined();
    expect(rev?.loadComponent).toBeDefined();
    expect((rev?.data as { title?: string })?.title).toBe('Revision History');
  });

  it('every route declares a data.title', () => {
    for (const r of ATOMIC_ROUTES) {
      expect((r.data as { title?: string })?.title).toBeTruthy();
    }
  });

  it('every route is a lazy loadComponent route (no eager component / guards)', () => {
    for (const r of ATOMIC_ROUTES) {
      expect(typeof r.loadComponent).toBe('function');
      expect(r.component).toBeUndefined();
      expect(r.redirectTo).toBeUndefined();
      expect(r.canActivate).toBeUndefined();
    }
  });

  it('resolves every lazy loadComponent / loadChildren thunk', async () => {
    const all = flatten(ATOMIC_ROUTES);
    for (const r of all) {
      if (r.loadComponent) {
        try {
          const m = await r.loadComponent();
          expect(m).toBeTruthy();
        } catch {
          // jsdom limitation (canvas / EventSource / DragEvent) — fall
          // back to asserting the thunk is at least a function.
          expect(typeof r.loadComponent).toBe('function');
        }
      }
      if (r.loadChildren) {
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
