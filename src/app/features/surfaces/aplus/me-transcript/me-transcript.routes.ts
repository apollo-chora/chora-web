import { Routes } from '@angular/router';

/**
 * A+ Me-Transcript routes — W6 outcome spine (per-learner transcript view).
 *
 * `aplus.routes.ts` mounts this lazily under the `me/transcript` prefix (the
 * whole `/a` surface is already behind `authGuard` + `surfaceGuard('aplus')`
 * in `app.routes.ts`, so no additional per-route guard is needed):
 *   {
 *     path: 'me/transcript',
 *     loadChildren: () =>
 *       import('./me-transcript/me-transcript.routes').then(
 *         (m) => m.ME_TRANSCRIPT_ROUTES,
 *       ),
 *   }
 *
 * Mounted route (with parent `me/transcript` prefix):
 *   - /a/me/transcript   → the learner's own transcript list
 */
export const ME_TRANSCRIPT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./me-transcript.component').then((m) => m.MeTranscriptComponent),
    data: { title: 'A+ | My Transcript', surface: 'aplus' },
  },
];
