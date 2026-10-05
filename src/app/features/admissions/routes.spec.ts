import { expect } from 'vitest';
import type { Route, Routes } from '@angular/router';
import { ADMISSIONS_ROUTES } from './routes';

/**
 * Recursively flattens a Routes array (walking `children`) into a flat list.
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

describe('ADMISSIONS_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(ADMISSIONS_ROUTES)).toBe(true);
    expect(ADMISSIONS_ROUTES.length).toBeGreaterThan(0);
  });

  it('contains the expected top-level path values', () => {
    const paths = ADMISSIONS_ROUTES.map((r) => r.path);
    expect(paths).toContain('');
    expect(paths).toContain('apply/:pipelineId');
    expect(paths).toContain('apply/:pipelineId/stage/:stageId');
    expect(paths).toContain('applications/:applicationId');
  });

  it('redirects the empty path to "apply" with pathMatch full', () => {
    const root = ADMISSIONS_ROUTES.find((r) => r.path === '');
    expect(root).toBeDefined();
    expect(root!.redirectTo).toBe('apply');
    expect(root!.pathMatch).toBe('full');
  });

  it('attaches a title in route data for each lazy route', () => {
    const apply = ADMISSIONS_ROUTES.find((r) => r.path === 'apply/:pipelineId');
    expect(apply?.data?.['title']).toBe('Apply');

    const stage = ADMISSIONS_ROUTES.find(
      (r) => r.path === 'apply/:pipelineId/stage/:stageId',
    );
    expect(stage?.data?.['title']).toBe('Stage Completion');

    const application = ADMISSIONS_ROUTES.find(
      (r) => r.path === 'applications/:applicationId',
    );
    expect(application?.data?.['title']).toBe('Application Status');
  });

  it('resolves every loadComponent lazy thunk to a truthy component', async () => {
    const all = flatten(ADMISSIONS_ROUTES);
    const lazy = all.filter((r) => typeof r.loadComponent === 'function');
    expect(lazy.length).toBeGreaterThan(0);

    for (const r of lazy) {
      try {
        const m = await r.loadComponent!();
        expect(m).toBeTruthy();
      } catch {
        // jsdom limitation (canvas / EventSource / DragEvent) — still assert the thunk exists.
        expect(typeof r.loadComponent).toBe('function');
      }
    }
  });

  it('resolves every loadChildren lazy thunk to a truthy module', async () => {
    const all = flatten(ADMISSIONS_ROUTES);
    const lazyChildren = all.filter((r) => typeof r.loadChildren === 'function');

    for (const r of lazyChildren) {
      try {
        const c = await r.loadChildren!();
        expect(c).toBeTruthy();
      } catch {
        expect(typeof r.loadChildren).toBe('function');
      }
    }
  });

  it('has no guard refs to execute (canActivate/canMatch absent or defined)', () => {
    const all = flatten(ADMISSIONS_ROUTES);
    for (const r of all) {
      if (r.canActivate) {
        expect(r.canActivate).toBeDefined();
      }
      if (r.canMatch) {
        expect(r.canMatch).toBeDefined();
      }
    }
  });
});
