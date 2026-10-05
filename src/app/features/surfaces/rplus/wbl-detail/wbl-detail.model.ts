/**
 * WBL Placement detail model — R+ Wave-5 drill-down (M15c R+ Stage C-lite).
 *
 * Re-exports the canonical `Placement` aggregate + `PlacementState` FSM
 * from the sibling list directory so the FE has a single source of truth
 * for the snake-case → camelCase wire mapping. The detail screen does NOT
 * carry any extra fields today (the backend `wblPlacementDTO` is identical
 * for list rows + single-fetch). The re-export keeps a clear seam in case
 * a follow-on iteration adds detail-only fields (e.g., audit timeline,
 * supervisor reviews).
 *
 * Drill-down route: `/r/wbl/:id` (rplus.routes.ts is owned by master).
 */
export type {
  Placement,
  PlacementsList,
  PlacementState,
} from '../wbl/wbl.model';

export {
  completionPercent,
  isPlacement,
  isPlacementState,
  stateBadgeVariant,
} from '../wbl/wbl.model';
