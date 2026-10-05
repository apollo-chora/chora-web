/**
 * EgressAudit — O+ external-web egress audit read shapes
 * (CHO-2245; ADR-231 Amendment 2026-07-17).
 *
 * Source of truth (wire tags mirrored EXACTLY):
 *   - `services/chora-gateway/internal/adapter/upstream/governance_client.go`
 *     (`EgressAuditEvent` — the per-row json tags: event_id / created_at /
 *     after, NOT id / occurred_at / after_state)
 *   - `services/chora-gateway/internal/adapter/http/handlers_oplus.go`
 *     (`EgressAuditResponse` — { fetched_at, items[], count }, NOT total)
 *   - `chora-contracts/proto/events/governance/audit.proto`
 *     (`ExternalEgressAudited` — the `after` payload; chora-governance marshals
 *     it with protojson, so the nested keys are lowerCamelCase and zero values
 *     are OMITTED)
 *
 * WHAT THIS IS. The read-only transparency trail (IMDA D1 accountability + D2
 * transparency) of every learner-triggered grounded web-egress the Familiar
 * routed through chora-model-gateway — permitted or denied. Gated
 * auditor/admin/owner by the AuditorGate on `/bff/oplus/*`. This surface never
 * mutates; the platform override lives on the operator-only kill-switch page.
 */

/** Path constant — keep in lockstep with the BFF route (handlers_oplus.go). */
export const OPLUS_EGRESS_AUDIT_PATH = '/bff/oplus/governance/egress-audit';

/**
 * The protojson-marshalled `ExternalEgressAudited` payload carried verbatim in
 * `EgressAuditEvent.after`. Keys are lowerCamelCase (protojson default) and
 * EVERY field is optional: a call denied before dispatch omits the
 * post-dispatch fields (queries / citations / post-Armor / vendor / model), and
 * zero values are dropped by the marshaller. The FE reads defensively — a
 * missing field renders nothing, never a fabricated value.
 *
 * `webSearchQueries` is the search text the grounded model issued. Per the
 * proto (§web_search_queries) it is the QUERY, never the web-sourced content or
 * knowledge — the panel presents it strictly as "what was searched".
 */
export interface EgressAuditAfter {
  readonly agentId?: string;
  readonly actionCode?: string;
  readonly webSearchQueries?: readonly string[];
  readonly citationCount?: number;
  /** Raw enum name: AUDIT_RESULT_ALLOWED | AUDIT_RESULT_DENIED | AUDIT_RESULT_ANOMALY. */
  readonly result?: string;
  readonly denialReason?: string;
  readonly modelArmorVerdictPre?: string;
  readonly modelArmorVerdictPost?: string;
  readonly vendor?: string;
  readonly modelVersion?: string;
}

/**
 * One external-egress audit row. Mirrors the gateway `EgressAuditEvent` json
 * tags EXACTLY — `event_id` (not id), `created_at` (not occurred_at), `after`
 * (not after_state). `decision` is the BE-mapped binary ("permitted" |
 * "denied"); `after.result` keeps the raw enum (so an ANOMALY, which maps to
 * decision="permitted", stays visible).
 */
export interface EgressAuditEvent {
  readonly event_id: string;
  readonly tenant_id: string;
  readonly actor_gcid?: string;
  /** Always "external_egress" (the audit_log.action discriminator). */
  readonly action: string;
  /** "permitted" | "denied". */
  readonly decision: string;
  readonly reason?: string;
  /** "agent" — the calling skill. */
  readonly subject_type?: string;
  /** The calling skill id, e.g. "familiar_seeker". */
  readonly subject_id?: string;
  readonly traceparent?: string;
  /** RFC3339 — the audit row's canonical timestamp. */
  readonly created_at: string;
  readonly after?: EgressAuditAfter;
}

/**
 * BFF response envelope. Mirrors `EgressAuditResponse` (handlers_oplus.go):
 * `{ fetched_at, items[], count }`. NOT wrapped in the discriminated-union
 * envelope — the BFF maps upstream status honestly (a governance DENY is a 4xx,
 * an unavailable upstream a 503), so the FE derives its state from the HTTP
 * status. `items` is always a non-nil array.
 */
export interface EgressAuditResponse {
  readonly fetched_at: string;
  readonly items: readonly EgressAuditEvent[];
  readonly count: number;
}

/** AsyncState discriminated union (fail-loud per chora-web CLAUDE.md §3). */
export type EgressAuditLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly response: EgressAuditResponse }
  | { readonly status: 'error'; readonly errorKey: string };

/**
 * Known BFF error codes → i18n keys. The primary signal is the HTTP status
 * (403 → insufficient role, 503 → upstream unavailable); this map only pins the
 * unavailable code so a governance-unwired 503 reads correctly even if a proxy
 * rewrites the status.
 */
export const EGRESS_AUDIT_ERROR_KEYS: Readonly<Record<string, string>> = {
  GATEWAY_GOVERNANCE_UNAVAILABLE: 'oplus.egressAudit.error.unavailable',
};

export const EGRESS_AUDIT_ERROR_FALLBACK = 'oplus.egressAudit.error.generic';
