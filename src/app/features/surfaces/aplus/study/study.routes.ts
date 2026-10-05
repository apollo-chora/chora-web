/**
 * A+ Study hub routes — CHO-2217 (WS-4 study lists + their source Collections).
 *
 * Mounted at `/a/study` from aplus.routes.ts. Two tabs (StudySubNavComponent):
 *
 *   /a/study                              → Study Lists (hub default)
 *   /a/study/collections                  → Collections list
 *   /a/study/collections/new              → create
 *   /a/study/collections/:id/edit         → edit
 *   /a/study/collections/:id              → detail
 *
 * The Collections mounts MOVED here from the surface-level `/a/collections`,
 * which redirects (param-preserving) in aplus.routes.ts. The component FILES
 * stay under `aplus/collections/**` — this is a URL move, not a file move; the
 * components are unchanged apart from gaining the sub-nav strip.
 *
 * Route ORDER is load-bearing: the static `collections/new` segment and the
 * `/edit` suffix MUST precede the bare `collections/:collectionId` detail route
 * or the param match swallows them.
 */
import { Routes } from '@angular/router';

export const STUDY_ROUTES: Routes = [
  // ── Study Lists — the hub default ───────────────────────────────────────
  {
    path: '',
    loadComponent: () =>
      import('./study-lists/study-lists.component').then((m) => m.StudyListsComponent),
    data: { title: 'A+ | Study Lists', surface: 'aplus' },
  },

  // ── Collections tab ─────────────────────────────────────────────────────
  {
    path: 'collections',
    loadComponent: () =>
      import('../collections/collections-list/collections-list.component').then(
        (m) => m.CollectionsListComponent,
      ),
    data: { title: 'A+ | My Collections', surface: 'aplus' },
  },
  {
    path: 'collections/new',
    loadComponent: () =>
      import('../collections/collections-edit/collections-edit.component').then(
        (m) => m.CollectionsEditComponent,
      ),
    data: { title: 'A+ | New Collection', surface: 'aplus' },
  },
  {
    path: 'collections/:collectionId/edit',
    loadComponent: () =>
      import('../collections/collections-edit/collections-edit.component').then(
        (m) => m.CollectionsEditComponent,
      ),
    data: { title: 'A+ | Edit Collection', surface: 'aplus' },
  },
  {
    path: 'collections/:collectionId',
    loadComponent: () =>
      import('../collections/collections-detail/collections-detail.component').then(
        (m) => m.CollectionsDetailComponent,
      ),
    data: { title: 'A+ | Collection', surface: 'aplus' },
  },
];
