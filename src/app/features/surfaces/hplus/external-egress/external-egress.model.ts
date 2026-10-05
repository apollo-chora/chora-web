/**
 * ExternalEgress — H+ tenant external web-egress entitlement wire shapes
 * (CHO-2148; ADR-220 D4, ADR-231 D6, PLAN.md §4.2.4).
 *
 * Source of truth:
 *   - `services/chora-tenancy/internal/adapter/http/external_egress_handler.go`
 *     (`externalEgressDTO`)
 *   - chora-gateway phyllis alias `/api/v1/admin/tenants/me/external-egress`
 *
 * The gateway forwards chora-tenancy's JSON VERBATIM (phyllis writes the raw
 * upstream body), so these are snake_case and NOT wrapped in a data envelope —
 * same as the sibling H+ add-on admin shapes.
 *
 * What this screen actually controls: whether this tenant's learners may reach
 * the OPEN WEB through the Far Sight / Seeker grounded-search egress. It is
 * default-deny — a tenant with no policy row is OFF — which is how franchise
 * tenants (schools, minors) stay safe with no seeding (ADR-220 D4).
 */

/** Path constant — keep in lockstep with the BFF alias. */
export const ADMIN_TENANTS_ME_EXTERNAL_EGRESS_PATH =
  '/api/v1/admin/tenants/me/external-egress';

/** The tenant's current egress policy. Mirrors the BE handler output. */
export interface ExternalEgressPolicy {
  readonly tenant_id: string;
  readonly egress_enabled: boolean;
  readonly daily_call_ceiling: number;

  /**
   * Distinguishes "never opted in" (no row — the default-deny posture a
   * franchise tenant starts in) from "explicitly turned off". Both are
   * egress_enabled=false, but conflating them would hide the default from the
   * admin, so the screen renders them differently.
   */
  readonly opted_in: boolean;

  /** Platform hard cap, served by the BE so the FE need not hardcode it. */
  readonly max_daily_call_ceiling: number;

  readonly version: number;
  readonly updated_by_gcid?: string;
  readonly updated_at?: string;
}

/** PATCH body. Omitted fields are LEFT ALONE upstream (merge, not reset). */
export interface ExternalEgressPatch {
  readonly egress_enabled?: boolean;
  readonly daily_call_ceiling?: number;
}

/**
 * AsyncState discriminated unions (fail-loud per chora-web CLAUDE.md §3).
 *
 * The load state has a REAL error variant on purpose. A failed read must never
 * collapse into a rendered "egress off" — that is indistinguishable from a real
 * policy denial, and an admin could conclude their tenant is safely disabled
 * when in fact we simply could not read the policy.
 */
export type ExternalEgressLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly policy: ExternalEgressPolicy }
  | { readonly status: 'error'; readonly errorKey: string };

export type ExternalEgressSaveState =
  | { readonly status: 'idle' }
  | { readonly status: 'saving' }
  | { readonly status: 'saved' }
  | { readonly status: 'error'; readonly errorKey: string };

/** i18n keys for the BE error codes this screen can surface. */
export const EXTERNAL_EGRESS_ERROR_KEYS: Readonly<Record<string, string>> = {
  forbidden: 'hplus.externalEgress.error.forbidden',
  conflict: 'hplus.externalEgress.error.conflict',
  validation_failed: 'hplus.externalEgress.error.validation',
  egress_policy_unwired: 'hplus.externalEgress.error.unwired',
};

export const EXTERNAL_EGRESS_ERROR_FALLBACK = 'hplus.externalEgress.error.generic';
