/**
 * EgressKillSwitch — O+ platform egress kill-switch wire shapes
 * (CHO-2148; ADR-231 D6).
 *
 * Source of truth:
 *   - `services/chora-observability/internal/adapter/http/external_egress_killswitch_handler.go`
 *     (`killSwitchDTO`)
 *   - chora-gateway route `/api/v1/admin/egress/kill-switch`
 *
 * WHAT THIS IS. Engaging the switch makes chora-model-gateway deny EVERY
 * grounded web-egress call, for EVERY tenant, immediately and with no deploy —
 * regardless of what any tenant has opted into in H+. It is the platform's
 * override, not a tenant setting.
 *
 * PLATFORM_OPERATOR only. The gateway gates it on the validated session roles
 * (fail-closed) and chora-observability re-gates on the mesh header
 * (fail-closed). The FE role check below only hides the control — the API is the
 * gate.
 *
 * The route is NOT under /bff/oplus/: that prefix has no Cloud Armor
 * method-enforcement carve-out (the PATCH would be edge-403'd, surfacing in the
 * browser as an opaque CORS failure) and its AuditorGate omits
 * platform_operator. The O+ surface still owns this UI.
 */

/** Path constant — keep in lockstep with the BFF route. */
export const ADMIN_EGRESS_KILL_SWITCH_PATH = '/api/v1/admin/egress/kill-switch';

export interface EgressKillSwitch {
  readonly engaged: boolean;
  readonly reason?: string;
  readonly updated_by_gcid?: string;
  readonly updated_at?: string;
}

/** PATCH body. `engaged` is REQUIRED upstream — defaulting it could silently
 *  DISENGAGE the switch, which is the dangerous direction. */
export interface EgressKillSwitchPatch {
  readonly engaged: boolean;
  readonly reason?: string;
}

/** AsyncState discriminated unions (fail-loud per chora-web CLAUDE.md §3). */
export type KillSwitchLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly killSwitch: EgressKillSwitch }
  | { readonly status: 'error'; readonly errorKey: string };

export type KillSwitchWriteState =
  | { readonly status: 'idle' }
  | { readonly status: 'confirming'; readonly next: boolean }
  | { readonly status: 'writing' }
  | { readonly status: 'done' }
  | { readonly status: 'error'; readonly errorKey: string };

export const KILL_SWITCH_ERROR_KEYS: Readonly<Record<string, string>> = {
  GATEWAY_FORBIDDEN: 'oplus.egressKillSwitch.error.forbidden',
  OBS_FORBIDDEN: 'oplus.egressKillSwitch.error.forbidden',
  OBS_EGRESS_KILLSWITCH_UNWIRED: 'oplus.egressKillSwitch.error.unwired',
  GATEWAY_OBSERVABILITY_UNWIRED: 'oplus.egressKillSwitch.error.unwired',
};

export const KILL_SWITCH_ERROR_FALLBACK = 'oplus.egressKillSwitch.error.generic';
