/**
 * The surface route tables the home checks a card's route against.
 *
 * WHY A STATIC IMPORT, WITH ITS COST NAMED
 * `app.routes.ts` lazy loads each surface through `loadChildren`, and this
 * module pulls all five tables into the home's chunk instead. That is a real
 * cost on the landing screen and it is taken deliberately, because the two
 * alternatives are both worse:
 *
 *   - Reading the router's live config gives nothing. The surfaces are still
 *     unresolved `loadChildren` thunks at that point, and `isMountedRoute`
 *     treats an unopened lazy table as mounted rather than claim a route is
 *     dead without looking. Every card would report healthy and the check
 *     would be decoration.
 *   - Resolving the tables asynchronously means the first paint does not know.
 *     Rendering optimistically then withdrawing the link offers a broken click
 *     in the window, which is precisely the defect this check exists to stop;
 *     rendering pessimistically flashes a dead card on a healthy home.
 *
 * The tables are DATA. Every screen behind them is still a `loadComponent`
 * thunk and stays lazy, so what lands here is route declarations and guard
 * references, not the surfaces themselves.
 */
import { APLUS_ROUTES } from '../surfaces/aplus/aplus.routes';
import { CPLUS_ROUTES } from '../surfaces/cplus/cplus.routes';
import { HPLUS_ROUTES } from '../surfaces/hplus/hplus.routes';
import { OPLUS_ROUTES } from '../surfaces/oplus/oplus.routes';
import { RPLUS_ROUTES } from '../surfaces/rplus/rplus.routes';
import type { SurfaceRouteTables } from './home-card.route-liveness';

/**
 * Keyed by the FIRST path segment, which is what a card's `route` carries and
 * what `app.routes.ts` mounts each surface under. All five are present even
 * though only a, h and r are emitted today: a surface missing from this map
 * reads as "not mounted", and silently killing every C+ or O+ card the day one
 * is added would look like a card bug rather than a missing table.
 */
export const SURFACE_ROUTE_TABLES: SurfaceRouteTables = {
  a: APLUS_ROUTES,
  c: CPLUS_ROUTES,
  h: HPLUS_ROUTES,
  o: OPLUS_ROUTES,
  r: RPLUS_ROUTES,
};
