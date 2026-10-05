import { Routes } from '@angular/router';

/**
 * C+ (Circle+) surface route module — Atom Sharing Redesign (Phase 3).
 *
 * Owns: Content Sharing — shared-atom feed, duels, leaderboards.
 *
 * Route prefix `/c/*`. v1 shrinks 7→3 routes: the mock pages (profile,
 * wallet, bounties, connections) are deleted; only the real-backed v1
 * features remain.
 */
export const CPLUS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'feed' },
  {
    path: 'feed',
    loadComponent: () =>
      import('./components/feed/cplus-feed.component').then(
        (m) => m.CplusFeedComponent,
      ),
    data: { surface: 'cplus', title: 'C+ Circle+ | Curious Now' },
  },
  {
    path: 'duels',
    loadComponent: () =>
      import('./components/duels/cplus-duels.component').then(
        (m) => m.CplusDuelsComponent,
      ),
    data: { surface: 'cplus', title: 'C+ Circle+ | Duels' },
  },
  {
    path: 'interests',
    loadComponent: () =>
      import('./components/interests/cplus-interests.component').then(
        (m) => m.CplusInterestsComponent,
      ),
    data: { surface: 'cplus', title: 'C+ Circle+ | Interests' },
  },
  {
    path: 'connections',
    loadComponent: () =>
      import('./components/connections/cplus-connections.component').then(
        (m) => m.CplusConnectionsComponent,
      ),
    data: { surface: 'cplus', title: 'C+ Circle+ | Connections' },
  },
  {
    path: 'bookmarks',
    loadComponent: () =>
      import('./bookmarks/bookmarks.component').then(
        (m) => m.BookmarksComponent,
      ),
    data: { surface: 'cplus', title: 'C+ Circle+ | Bookmarks' },
  },
];
