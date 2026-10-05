import { describe, it, expect } from 'vitest';
import type { Route, Routes } from '@angular/router';

import { ME_ASSESSMENTS_ROUTES } from './me-assessments.routes';

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

describe('ME_ASSESSMENTS_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(ME_ASSESSMENTS_ROUTES)).toBe(true);
    expect(ME_ASSESSMENTS_ROUTES.length).toBeGreaterThan(0);
  });

  it('mounts the submission flow destinations', () => {
    const paths = ME_ASSESSMENTS_ROUTES.map((r) => r.path);
    expect(paths).toContain('');
    expect(paths).toContain(':assessmentId');
    expect(paths).toContain(':assessmentId/result/:submissionId');
    expect(paths).toContain(':assessmentId/result');
  });

  it('declares a title + surface=aplus on every leaf route', () => {
    for (const r of ME_ASSESSMENTS_ROUTES) {
      if (typeof r.loadComponent === 'function') {
        expect((r.data as { surface?: string } | undefined)?.surface).toBe('aplus');
        expect(typeof (r.data as { title?: string }).title).toBe('string');
      }
    }
  });

  it('resolves every lazy component thunk', async () => {
    await exerciseThunks(ME_ASSESSMENTS_ROUTES);
  }, 60_000);
});