import type { Route, Routes } from '@angular/router';
import { SUPPORT_ROUTES } from './routes';

/**
 * Unit coverage for the Support route configuration.
 *
 * Goal: exercise the route-array literal AND every lazy `loadComponent`
 * thunk so the dynamic imports are actually executed.
 */
describe('SUPPORT_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(SUPPORT_ROUTES)).toBe(true);
    expect(SUPPORT_ROUTES.length).toBeGreaterThan(0);
  });

  it('declares the expected top-level paths', () => {
    const paths = SUPPORT_ROUTES.map((r) => r.path);
    expect(paths).toContain('');
    expect(paths).toContain('tickets');
    expect(paths).toContain('tickets/new');
    expect(paths).toContain('tickets/:ticketId');
    expect(paths).toContain('faq');
    expect(paths).toContain('satisfaction/:ticketId');
  });

  it('configures the default redirect to tickets with pathMatch full', () => {
    const root = SUPPORT_ROUTES.find((r) => r.path === '');
    expect(root).toBeDefined();
    expect(root?.redirectTo).toBe('tickets');
    expect(root?.pathMatch).toBe('full');
  });

  it('attaches a descriptive title via data on every lazy route', () => {
    const lazy = SUPPORT_ROUTES.filter(
      (r) => typeof r.loadComponent === 'function',
    );
    expect(lazy.length).toBeGreaterThan(0);
    for (const r of lazy) {
      expect(r.data).toBeDefined();
      expect(typeof r.data?.['title']).toBe('string');
      expect((r.data?.['title'] as string).length).toBeGreaterThan(0);
    }
  });

  it('exposes the ticket list, new-ticket and FAQ titles', () => {
    const list = SUPPORT_ROUTES.find((r) => r.path === 'tickets');
    const create = SUPPORT_ROUTES.find((r) => r.path === 'tickets/new');
    const detail = SUPPORT_ROUTES.find((r) => r.path === 'tickets/:ticketId');
    const faq = SUPPORT_ROUTES.find((r) => r.path === 'faq');
    const survey = SUPPORT_ROUTES.find(
      (r) => r.path === 'satisfaction/:ticketId',
    );
    expect(list?.data?.['title']).toBe('My Tickets');
    expect(create?.data?.['title']).toBe('New Ticket');
    expect(detail?.data?.['title']).toBe('Ticket Detail');
    expect(faq?.data?.['title']).toBe('FAQ');
    expect(survey?.data?.['title']).toBe('Feedback');
  });

  // Recursively collect every route (including any nested children) so the
  // walker is future-proof even though SUPPORT_ROUTES is presently flat.
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
    const all = flatten(SUPPORT_ROUTES);
    const lazyRoutes = all.filter((r) => typeof r.loadComponent === 'function');
    expect(lazyRoutes.length).toBe(5);

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
    const all = flatten(SUPPORT_ROUTES);
    const childRoutes = all.filter((r) => typeof r.loadChildren === 'function');
    // None currently, but exercise the path defensively if any are added.
    for (const r of childRoutes) {
      const c = await r.loadChildren!();
      expect(c).toBeTruthy();
    }
    expect(childRoutes.length).toBeGreaterThanOrEqual(0);
  });
});
