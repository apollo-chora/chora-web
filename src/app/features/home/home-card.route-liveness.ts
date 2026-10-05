/**
 * Is a card's route actually mounted? (Phase C, C1b.)
 *
 * WHY THIS EXISTS
 * A card carries a count, a deadline and a ROUTE, and section 8 rule 1 says
 * that is all it carries: the route is the card's entire action. So a card
 * whose route does not resolve is not a degraded card, it is a broken
 * affordance that looks perfectly healthy until someone clicks it and lands on
 * the app not-found.
 *
 * That is not hypothetical. On 2026-09-02, five of the seven routes the
 * aggregator emitted were unmounted: `/a/transcript` (the real route is
 * `/a/me/transcript`), `/a/today`, `/a/paths`, `/r/grading` and `/h/tenants`.
 * `app.routes.ts` ends in `{ path: '**', redirectTo: 'not-found' }`, so every
 * one of them fell through to it. The same class had already shipped once, as
 * the profile's `source-revelation` link that has always 404'd.
 *
 * WHY THE HOME DECIDES THIS RATHER THAN TRUSTING THE PAYLOAD
 * The aggregator composes routes as strings and cannot see the SPA's route
 * table; the SPA can. Checking here means a route that goes stale after a
 * rename degrades the card to a non-actionable one, which is honest, instead of
 * offering a click that cannot work. It is the same discipline section 8 rule 2
 * applies to entitlement: do not offer what the router will bounce.
 */

import type { Routes } from '@angular/router';

/** Surface prefix to the route table mounted under it in `app.routes.ts`. */
export interface SurfaceRouteTables {
  readonly [surfacePrefix: string]: Routes;
}

/** Split a path into its non-empty segments. */
function segments(path: string): readonly string[] {
  return path.split('/').filter((s) => s.length > 0);
}

/**
 * Walk one route table for a full-segment match.
 *
 * Handles the three shapes this codebase actually uses: a literal path, a
 * parameterised segment (`:familiarId`, which matches any single segment), and
 * a `children` subtree including the `**` wildcard folds. A route that only
 * redirects still counts as mounted, because following it lands the viewer
 * somewhere real, which is the property the card needs.
 */
function matches(routes: Routes, want: readonly string[]): boolean {
  for (const route of routes) {
    const pattern = segments(route.path ?? '');

    // A `**` child swallows whatever is left, which is how the retired KG
    // surfaces fold into /a/knowledge.
    if (route.path === '**') return true;

    if (pattern.length > want.length) continue;
    const head = want.slice(0, pattern.length);
    const fits = pattern.every(
      (seg, i) => seg.startsWith(':') || seg === head[i],
    );
    if (!fits) continue;

    const rest = want.slice(pattern.length);
    if (rest.length === 0) {
      // An exact-length match only counts if something renders or redirects
      // here. A pure grouping node with children is not itself a destination.
      return (
        route.loadComponent !== undefined ||
        route.component !== undefined ||
        route.redirectTo !== undefined ||
        route.loadChildren !== undefined
      );
    }
    if (route.children && matches(route.children, rest)) return true;
    // `loadChildren` is a lazy table this check cannot open synchronously.
    // Treat the prefix as mounted rather than claim a route is dead on the
    // strength of not having looked: a false "dead" would hide a working card,
    // which is the worse error of the two.
    if (route.loadChildren !== undefined) return true;
  }
  return false;
}

/**
 * Whether `route` resolves to something in the supplied surface tables.
 *
 * Unknown surface prefix, or a path that matches nothing, is NOT mounted. A
 * path outside every known surface (an absolute external link, say) is also not
 * mounted here, deliberately: this answers one question, whether the SPA router
 * can serve it.
 */
export function isMountedRoute(route: string, tables: SurfaceRouteTables): boolean {
  const segs = segments(route);
  if (segs.length === 0) return false;
  const [prefix, ...rest] = segs;
  const table = tables[prefix ?? ''];
  if (!table) return false;
  if (rest.length === 0) return true; // the surface shell itself
  return matches(table, rest);
}
