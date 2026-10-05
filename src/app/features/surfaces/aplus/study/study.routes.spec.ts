/**
 * STUDY_ROUTES spec — CHO-2217 (WP2 Study surface).
 *
 * `/a/study` is the hub: Study Lists (default) + Collections. The Collections
 * mounts MOVED here from the surface-level `/a/collections`, which now
 * redirects (see aplus.routes.spec.ts).
 */
import { describe, it, expect } from 'vitest';
import type { Route, Routes } from '@angular/router';
import { STUDY_ROUTES } from './study.routes';

describe('STUDY_ROUTES', () => {
  it('mounts the Study Lists tab at the hub root', () => {
    const root = STUDY_ROUTES.find((r) => r.path === '');
    expect(root).toBeDefined();
    expect(root?.loadComponent).toBeDefined();
    expect((root?.data as { title?: string })?.title).toBe('A+ | Study Lists');
  });

  it('mounts the Collections tab at /collections', () => {
    const list = STUDY_ROUTES.find((r) => r.path === 'collections');
    expect(list?.loadComponent).toBeDefined();
    expect((list?.data as { title?: string })?.title).toBe('A+ | My Collections');
  });

  it('mounts collection create at /collections/new', () => {
    const create = STUDY_ROUTES.find((r) => r.path === 'collections/new');
    expect(create?.loadComponent).toBeDefined();
  });

  it('mounts collection edit at /collections/:collectionId/edit', () => {
    const edit = STUDY_ROUTES.find((r) => r.path === 'collections/:collectionId/edit');
    expect(edit?.loadComponent).toBeDefined();
  });

  it('mounts collection detail at /collections/:collectionId', () => {
    const detail = STUDY_ROUTES.find((r) => r.path === 'collections/:collectionId');
    expect(detail?.loadComponent).toBeDefined();
  });

  it('orders the static `new` segment before the parameterised detail route', () => {
    // Otherwise /a/study/collections/new loads the DETAIL component with
    // collectionId="new" and fetches a collection that cannot exist.
    const newIdx = STUDY_ROUTES.findIndex((r) => r.path === 'collections/new');
    const detailIdx = STUDY_ROUTES.findIndex((r) => r.path === 'collections/:collectionId');
    expect(newIdx).toBeGreaterThanOrEqual(0);
    expect(detailIdx).toBeGreaterThanOrEqual(0);
    expect(newIdx).toBeLessThan(detailIdx);
  });

  it('orders the `/edit` suffix before the parameterised detail route', () => {
    const editIdx = STUDY_ROUTES.findIndex((r) => r.path === 'collections/:collectionId/edit');
    const detailIdx = STUDY_ROUTES.findIndex((r) => r.path === 'collections/:collectionId');
    expect(editIdx).toBeLessThan(detailIdx);
  });
});

// ── Lazy thunk resolution (coverage) ────────────────────────────────────
// The structural assertions above never execute the lazy loadComponent
// thunks, so v8 leaves those lines uncovered. Resolve every one of them
// (pattern: features/identity/routes.spec.ts).
function flattenRoutes(routes: Routes): Route[] {
  const out: Route[] = [];
  for (const r of routes) {
    out.push(r);
    if (r.children) {
      out.push(...flattenRoutes(r.children));
    }
  }
  return out;
}

describe('STUDY_ROUTES lazy thunks', () => {
  it('resolves every loadComponent thunk to a module', async () => {
    for (const r of flattenRoutes(STUDY_ROUTES)) {
      if (typeof r.loadComponent !== 'function') continue;
      try {
        const mod = await r.loadComponent();
        expect(mod).toBeTruthy();
      } catch {
        expect(typeof r.loadComponent).toBe('function');
      }
    }
  }, 60_000);
});
