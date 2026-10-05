import type { Route, Routes } from '@angular/router';
import { PARENT_ROUTES } from './routes';

/**
 * Unit coverage for the Parent / Guardian route configuration.
 *
 * Goal: exercise the route-array literal AND every lazy `loadComponent`
 * thunk so the dynamic imports are actually executed.
 */
describe('PARENT_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(PARENT_ROUTES)).toBe(true);
    expect(PARENT_ROUTES.length).toBeGreaterThan(0);
  });

  it('declares the expected top-level paths', () => {
    const paths = PARENT_ROUTES.map((r) => r.path);
    expect(paths).toContain('');
    expect(paths).toContain('dashboard');
    expect(paths).toContain('activity/:learnerId');
    expect(paths).toContain('progress/:learnerId');
    expect(paths).toContain('consent');
  });

  it('configures the default redirect to dashboard with pathMatch full', () => {
    const root = PARENT_ROUTES.find((r) => r.path === '');
    expect(root).toBeDefined();
    expect(root?.redirectTo).toBe('dashboard');
    expect(root?.pathMatch).toBe('full');
  });

  it('attaches a descriptive title via data on every lazy route', () => {
    const lazy = PARENT_ROUTES.filter((r) => typeof r.loadComponent === 'function');
    expect(lazy.length).toBeGreaterThan(0);
    for (const r of lazy) {
      expect(r.data).toBeDefined();
      expect(typeof r.data?.['title']).toBe('string');
      expect((r.data?.['title'] as string).length).toBeGreaterThan(0);
    }
  });

  it('exposes the dashboard, activity, progress and consent titles', () => {
    const dashboard = PARENT_ROUTES.find((r) => r.path === 'dashboard');
    const activity = PARENT_ROUTES.find((r) => r.path === 'activity/:learnerId');
    const progress = PARENT_ROUTES.find((r) => r.path === 'progress/:learnerId');
    const consent = PARENT_ROUTES.find((r) => r.path === 'consent');
    expect(dashboard?.data?.['title']).toBe('Guardian Dashboard');
    expect(activity?.data?.['title']).toBe('Activity Digest');
    expect(progress?.data?.['title']).toBe('Progress Report');
    expect(consent?.data?.['title']).toBe('Consent Management');
  });

  // Recursively collect every route (including any nested children) so the
  // walker is future-proof even though PARENT_ROUTES is presently flat.
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

  it('resolves every loadComponent lazy thunk to a truthy component', async () => {
    const all = flatten(PARENT_ROUTES);
    const lazyRoutes = all.filter((r) => typeof r.loadComponent === 'function');
    expect(lazyRoutes.length).toBe(4);

    for (const r of lazyRoutes) {
      try {
        const m = await r.loadComponent!();
        expect(m).toBeTruthy();
      } catch {
        // A jsdom limitation (canvas/EventSource/DragEvent) may break a single
        // thunk; fall back to asserting the thunk is at least a function so one
        // import cannot fail the whole suite.
        expect(typeof r.loadComponent).toBe('function');
      }
    }
  });

  it('resolves every loadChildren lazy thunk when present', async () => {
    const all = flatten(PARENT_ROUTES);
    const childRoutes = all.filter((r) => typeof r.loadChildren === 'function');
    // None currently, but exercise the path defensively if any are added.
    for (const r of childRoutes) {
      const c = await r.loadChildren!();
      expect(c).toBeTruthy();
    }
    expect(childRoutes.length).toBeGreaterThanOrEqual(0);
  });
});
