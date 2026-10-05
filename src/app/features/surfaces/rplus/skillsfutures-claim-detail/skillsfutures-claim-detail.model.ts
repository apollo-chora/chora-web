/**
 * SkillsFutures Claim Detail model — R+ Wave-5 drill-down.
 *
 * Re-exports the canonical `SkillsFuturesClaim` aggregate from the
 * sibling list directory so the FE has a single source of truth for
 * the snake_case → camelCase wire mapping. The detail screen does NOT
 * carry any extra fields today (the backend
 * `skillsFuturesClaimDTO` is identical for list rows + single-fetch).
 * The re-export keeps a clean seam in case a follow-on iteration adds
 * detail-only fields (audit timeline, decision log).
 *
 * Drill-down route: `/r/skillsfutures-claims/:id` (rplus.routes.ts is
 * owned by master).
 *
 * Per the BE handler `handleSkillsFuturesGet` the visibility rules are:
 *   - training-admin / admin / instructor → any claim in their tenant
 *   - learner → only their own claim row (matched on gcid)
 *   - cross-tenant / cross-learner: 404
 */
export type {
  SkillsFuturesClaim,
  SkillsFuturesClaimList,
  SkillsFuturesClaimState,
  StateBadgeVariant,
} from '../skillsfutures-claims/skillsfutures-claims.model';

export {
  SKILLSFUTURES_CLAIM_STATES,
  formatSGD,
  shortNricHash,
  stateBadgeVariant,
} from '../skillsfutures-claims/skillsfutures-claims.model';
