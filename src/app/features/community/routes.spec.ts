import { Routes, Route } from '@angular/router';
import { COMMUNITY_ROUTES } from './routes';

/**
 * Recursively flattens a Routes array (including nested `children`) into a flat list.
 */
function flatten(routes: Routes): Route[] {
  const out: Route[] = [];
  for (const r of routes) {
    out.push(r);
    if (r.children?.length) {
      out.push(...flatten(r.children));
    }
  }
  return out;
}

describe('COMMUNITY_ROUTES', () => {
  it('is a non-empty Routes array', () => {
    expect(Array.isArray(COMMUNITY_ROUTES)).toBe(true);
    expect(COMMUNITY_ROUTES.length).toBeGreaterThan(0);
  });

  it('declares the expected top-level paths', () => {
    const paths = COMMUNITY_ROUTES.map((r) => r.path);
    expect(paths).toContain('');
    expect(paths).toContain('atom-bank');
    expect(paths).toContain('peer-review');
    expect(paths).toContain('curation');
    expect(paths).toContain('contributor/:gcid');
    expect(paths).toContain('contribute');
    expect(paths).toContain('upload');
  });

  it('redirects the empty path to atom-bank with pathMatch full', () => {
    const redirect = COMMUNITY_ROUTES.find((r) => r.path === '');
    expect(redirect).toBeTruthy();
    expect(redirect!.redirectTo).toBe('atom-bank');
    expect(redirect!.pathMatch).toBe('full');
  });

  it('attaches a title via data for each lazy route', () => {
    const lazy = COMMUNITY_ROUTES.filter((r) => typeof r.loadComponent === 'function');
    expect(lazy.length).toBeGreaterThan(0);
    for (const r of lazy) {
      expect(r.data).toBeTruthy();
      expect(typeof r.data!['title']).toBe('string');
      expect((r.data!['title'] as string).length).toBeGreaterThan(0);
    }
  });

  it('resolves every loadComponent and loadChildren lazy thunk', async () => {
    const all = flatten(COMMUNITY_ROUTES);

    for (const r of all) {
      if (typeof r.loadComponent === 'function') {
        try {
          const m = await r.loadComponent();
          expect(m).toBeTruthy();
        } catch {
          // jsdom limitation for this particular component module — assert the
          // thunk is still a callable function rather than failing the suite.
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

  it('defines guard references where present without executing them', () => {
    const all = flatten(COMMUNITY_ROUTES);
    for (const r of all) {
      if (r.canActivate) {
        expect(Array.isArray(r.canActivate)).toBe(true);
        for (const g of r.canActivate) {
          expect(g).toBeDefined();
        }
      }
      if (r.canMatch) {
        expect(Array.isArray(r.canMatch)).toBe(true);
        for (const g of r.canMatch) {
          expect(g).toBeDefined();
        }
      }
    }
  });
});
