/**
 * Mana wallet model — canonical shape for the per-user Mana balance.
 *
 * Source of truth: `chora-contracts/openapi/learner-economy.yaml` →
 *   GET  /api/v1/me/mana            → UserMana (200)
 *   POST /api/v1/me/mana/topup      → ManaTopupResponse (201) | InsufficientManaErrorResponse (402)
 *   POST /api/v1/me/mana/demo-grant → ManaDemoGrantResponse (200) — demo mode only
 *
 * Wired by `MeManaService` (this folder) and consumed by:
 *   - A+ atom-authoring AI assists (this CR) — optimistic mana gate
 *   - A+ wallet (`features/surfaces/aplus/wallet/wallet.component.ts`)
 *     once it migrates off `PHYLLIS_WALLET` fixture per
 *     `docs/m13/of-fixture-audit-2026-05-15.md` §C+5
 *
 * All wire DTOs are snake_case (chora-web CLAUDE.md §3); models are
 * `readonly` and mirror the contract EXACTLY — no synthesized fields.
 */

/** Subsidy slice — per-source breakdown of `balance_units`. */
export type ManaSubsidySource =
  | 'personal'
  | 'tenant_subsidy'
  | 'familiar_plan'
  | 'promo'
  | 'refund';

export interface ManaSubsidyBreakdown {
  /** Set only when source=`tenant_subsidy`. */
  readonly tenant_id?: string;
  readonly units: number;
  readonly source: ManaSubsidySource;
  readonly expires_at?: string;
}

/** GET /api/v1/me/mana response. */
export interface UserMana {
  readonly gcid?: string;
  readonly balance_units: number;
  readonly lifetime_earned: number;
  readonly lifetime_spent: number;
  readonly last_credited_at?: string | null;
  readonly subsidy_breakdown?: readonly ManaSubsidyBreakdown[];
}

/** POST /api/v1/me/mana/topup request body. */
export interface ManaTopupRequest {
  readonly amount_cents: number;
  readonly currency: string;
  readonly payment_method_id: string;
  readonly promo_code?: string | null;
}

/** POST /api/v1/me/mana/topup 201 response. */
export interface ManaTopupResponse {
  readonly topup_id: string;
  readonly gcid: string;
  readonly units_credited: number;
  readonly charged_cents: number;
  readonly currency: string;
  readonly stripe_payment_intent_id?: string;
  readonly ledger_entry_id?: string;
  readonly recorded_at?: string;
}

/**
 * Upsell block carried inside a 402 `InsufficientManaErrorResponse.error.upsell`.
 *
 * Per `docs/m14/cr-question-authoring-design-2026-05-15.md` §4 schema +
 * §9.6 open question — `stripe_checkout_url` may be null when the BE
 * defers session creation to the FE (FE calls `POST /api/v1/me/mana/topup`
 * with `payment_method_id=null` to mint a Checkout URL post-CTA-click).
 * When non-null, the FE opens it directly in a new tab.
 */
export interface InsufficientManaUpsell {
  readonly required_units: number;
  readonly current_balance_units: number;
  readonly recommended_plan_code?: string | null;
  readonly recommended_topup_units?: number | null;
  /**
   * Pre-minted Stripe Checkout session URL. May be null — see open
   * question §9.6: BE may defer session creation to the FE.
   */
  readonly stripe_checkout_url?: string | null;
}

/**
 * Full 402 envelope from any mana-spending endpoint.
 *
 * Per BE design `docs/m14/cr-question-authoring-design-2026-05-15.md`
 * §4, `error.code` is a single uppercase literal `INSUFFICIENT_MANA` for
 * mana-debit failures. The pre-existing learner-economy.yaml contract
 * also reserves `payment_failed` and `payment_method_declined` for the
 * direct-Stripe top-up path, so the type accepts both casings for
 * forward+backward compatibility.
 */
export interface InsufficientManaErrorResponse {
  readonly error: {
    readonly code:
      | 'INSUFFICIENT_MANA'
      | 'insufficient_mana'
      | 'payment_failed'
      | 'payment_method_declined';
    readonly message: string;
    readonly correlation_id?: string;
    readonly upsell?: InsufficientManaUpsell;
  };
}

// ── Per-user mana checkout (WS-2.2: POST /api/v1/checkout/user-mana) ────────

/**
 * One purchasable mana bundle. SKUs MUST match the gateway's server-side
 * catalogue (CHORA_MANA_PACKS env) — the FE sends only the `sku`; the gateway
 * resolves the authoritative price + units (the FE values here are display-only
 * for the picker label and are NOT trusted by the BE).
 */
export interface ManaPack {
  readonly sku: string;
  readonly mana_units: number;
  readonly price_cents: number;
  readonly currency: string;
}

/** Display catalogue for the top-up picker — mirrors the gateway CHORA_MANA_PACKS. */
export const MANA_PACKS: readonly ManaPack[] = [
  { sku: 'mana_pack_1000', mana_units: 1000, price_cents: 199, currency: 'USD' },
  { sku: 'mana_pack_5000', mana_units: 5000, price_cents: 799, currency: 'USD' },
  { sku: 'mana_pack_20000', mana_units: 20000, price_cents: 2499, currency: 'USD' },
] as const;

/**
 * Pick the smallest pack whose units cover `gapUnits`; falls back to the
 * largest pack when no single pack covers the gap. Used to map a 402 upsell's
 * shortfall to a concrete SKU for the one-click top-up CTA.
 */
export function recommendedManaPackSku(gapUnits: number): string {
  const sorted = [...MANA_PACKS].sort((a, b) => a.mana_units - b.mana_units);
  const covering = sorted.find((p) => p.mana_units >= gapUnits);
  return (covering ?? sorted[sorted.length - 1]).sku;
}

/** POST /api/v1/checkout/user-mana 200 response (mirrors gateway CheckoutResponse). */
export interface UserManaCheckoutResponse {
  readonly purchase_id: string;
  readonly stripe_session_id: string;
  readonly stripe_checkout_url: string;
  readonly state: string;
}

/** Checkout flow state for the Stripe-redirect top-up. */
export type MeManaCheckoutState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'redirecting'; readonly checkoutUrl: string }
  | { readonly status: 'error'; readonly error: string };

// ── AsyncState discriminated unions (fail-loud per chora-web CLAUDE.md §3) ──

/**
 * Atom-load-style discriminated state for the GET /api/v1/me/mana fetch.
 *
 * `loading` MAY carry the last-known balance (stale-while-revalidate): a
 * re-load after a mana-spending action keeps the previous balance rendered
 * instead of flashing "0 mana" while the refresh is in flight (L4 no-debt
 * fix 2026-06-10 — the chat header showed 0 after every turn_complete).
 */
export type MeManaLoadState =
  | { readonly status: 'loading'; readonly mana?: UserMana }
  | { readonly status: 'success'; readonly mana: UserMana }
  | { readonly status: 'error'; readonly error: string };

/** Top-up flow state for the POST /api/v1/me/mana/topup action. */
export type MeManaTopupState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly result: ManaTopupResponse }
  | {
      readonly status: 'insufficient';
      /** The full upsell block — modal renders it directly. */
      readonly upsell: InsufficientManaUpsell;
      readonly message: string;
    }
  | { readonly status: 'error'; readonly error: string };

// ── Demo free top-up (POST /api/v1/me/mana/demo-grant) ───────────────────

/**
 * POST /api/v1/me/mana/demo-grant 200 response.
 *
 * Demo-mode only: a free, ledger-backed mana grant that bypasses the Stripe
 * settlement path entirely — no `amount_cents`, no `payment_method_id`, no
 * Checkout Session. `replayed` is true when the Idempotency-Key matched an
 * earlier grant, so the BE replays the original result instead of crediting
 * twice; the FE must not read that as a fresh credit.
 */
export interface ManaDemoGrantResponse {
  readonly granted_units: number;
  readonly balance_units: number;
  readonly replayed: boolean;
  readonly reason?: string;
}

/** Demo free top-up flow state for the POST /api/v1/me/mana/demo-grant action. */
export type MeManaDemoGrantState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly result: ManaDemoGrantResponse }
  | { readonly status: 'error'; readonly error: string };

// ── Mana-action cost catalogue (ADR-142 §4) ────────────────────────────

/**
 * Canonical action codes the FE can spend mana on.
 *
 * Sourced from BE design `docs/m14/cr-question-authoring-design-2026-05-15.md`
 * §3.2 (new `mana_action_pricing` rows seeded for this CR) and ADR-142 §4.
 */
export type ManaActionCode =
  /** Path 2 — generate model answer / explainers for an existing manual question (~5 mana). */
  | 'question_authoring_model_answer'
  /** Path 3 — AI-draft a brand-new question from prompt + type (~10 mana). */
  | 'question_authoring_ai_draft'
  /** Path 4 (parse step) — chora-doc-parser ingest of an uploaded file (~50 mana). */
  | 'question_authoring_batch_parse'
  /** Path 4 (per-item step) — each accepted candidate's qgen_delivery debit (~5 mana). */
  | 'question_authoring_batch_per_item'
  /** ADR-154 — Familiar conversational chat turn (tier-aware 5/15/30 mana; BE dispatches by tier). */
  | 'familiar_chat_turn'
  /** CHO-2040 (CR R7-3) — binding-ceremony edge-scout crawl+extraction (one charge; virgin fallback free). */
  | 'familiar_ceremony_edge_scout';

/**
 * Default per-action mana cost. The BE is authoritative — these are used
 * for the FE's optimistic gate + cost-preview chip ("Generate (10 mana —
 * you have 240)"). If the BE returns a different `mana_charged` on
 * success, the FE reconciles to the BE value. The BE may also refund on
 * LLM failure (mirrors the `mana_quoter` pattern in chora-consumption).
 *
 * Sources:
 * - BE design §3.2 (new action codes seeded for this CR)
 * - ADR-142 §4 (per-user economy mana costs)
 */
export const MANA_ACTION_COSTS: Readonly<Record<ManaActionCode, number>> = {
  question_authoring_model_answer: 5,
  question_authoring_ai_draft: 10,
  question_authoring_batch_parse: 50,
  // Per-item is the floor; total batch cost = parse(50) + per_item(5) × accepted.
  // BE returns `estimated_mana_cost` on the 202 response.
  question_authoring_batch_per_item: 5,
  // ADR-154 — Familiar chat turn is tier-aware (5/15/30); the FE shows
  // the basic-tier floor as the optimistic gate. BE returns the actual
  // `mana_charged` on the `turn_complete` SSE frame.
  familiar_chat_turn: 5,
  // CHO-2040 — mirrors the BE canonical-map projection (cost_map.go,
  // PROVISIONAL 25 pending the owner's chora_identity pricing seed). The
  // propose response's `mana_charged` is the receipt of record.
  familiar_ceremony_edge_scout: 25,
} as const;

/** Helper: is the current balance enough for this action? */
export function hasEnoughMana(
  mana: UserMana | null,
  action: ManaActionCode,
): boolean {
  if (!mana) return false;
  return mana.balance_units >= MANA_ACTION_COSTS[action];
}
