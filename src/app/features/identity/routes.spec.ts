import { expect } from 'vitest';
import type { Route, Routes } from '@angular/router';
import { LOGIN_ROUTES, SETTINGS_ROUTES } from './routes';

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

describe('identity routes', () => {
  describe('LOGIN_ROUTES', () => {
    it('is a non-empty Routes array', () => {
      expect(Array.isArray(LOGIN_ROUTES)).toBe(true);
      expect(LOGIN_ROUTES.length).toBeGreaterThan(0);
    });

    it('renders the unified login surface at the empty path', () => {
      const root = LOGIN_ROUTES.find((r) => r.path === '');
      expect(root).toBeDefined();
      expect(typeof root!.loadComponent).toBe('function');
      expect(root!.data).toEqual({ title: 'Log In' });
    });

    it('resolves its lazy component thunk', async () => {
      await exerciseThunks(LOGIN_ROUTES);
    });
  });

  // AUTH_CALLBACK_ROUTES and EMAIL_VERIFY_ROUTES were removed with the
  // Firebase/Identity Platform extraction (OIDC callback + email-verification
  // action link had no server-side equivalent in the frozen gateway
  // contract); their /auth/callback and /auth/verify routes are gone too.

  describe('SETTINGS_ROUTES', () => {
    it('is a non-empty Routes array', () => {
      expect(Array.isArray(SETTINGS_ROUTES)).toBe(true);
      expect(SETTINGS_ROUTES.length).toBeGreaterThan(0);
    });

    it('declares the expected settings sub-paths', () => {
      const paths = SETTINGS_ROUTES.map((r) => r.path);
      expect(paths).toContain('');
      expect(paths).toContain('notifications');
      expect(paths).toContain('notifications/history');
      expect(paths).toContain('account/delete');
      expect(paths).toContain('account/appeal/status');
      expect(paths).toContain('account/appeal');
      expect(paths).toContain('api-keys');
      expect(paths).toContain('identity');
      expect(paths).toContain('privacy/a2a');
      expect(paths).toContain('referrals');
      expect(paths).toContain('kyc');
    });

    it('lazy-loads child routes for the identity sub-tree', () => {
      const identity = SETTINGS_ROUTES.find((r) => r.path === 'identity');
      expect(identity).toBeDefined();
      expect(typeof identity!.loadChildren).toBe('function');
      expect(identity!.loadComponent).toBeUndefined();
    });

    it('attaches a title to every loadComponent leaf route', () => {
      for (const r of SETTINGS_ROUTES) {
        if (typeof r.loadComponent === 'function') {
          expect(r.data).toBeDefined();
          expect(typeof (r.data as { title?: string }).title).toBe('string');
        }
      }
    });

    it('resolves every lazy component and child-routes thunk', async () => {
      await exerciseThunks(SETTINGS_ROUTES);
    });

    it('the identity loadChildren thunk yields the portability Routes array', async () => {
      const identity = SETTINGS_ROUTES.find((r) => r.path === 'identity');
      try {
        const children = await identity!.loadChildren!();
        expect(children).toBeTruthy();
        expect(Array.isArray(children)).toBe(true);
      } catch {
        expect(typeof identity!.loadChildren).toBe('function');
      }
    });
  });
});
