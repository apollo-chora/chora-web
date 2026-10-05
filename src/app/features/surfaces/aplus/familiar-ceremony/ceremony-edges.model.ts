/**
 * Ceremony learning-edges — FE model (CHO-2040, CR §8 R7-3/R8-3).
 *
 * At the Familiar summon/goal-attach binding ceremony on `/a/companion`
 * (the R3-5 familiar-side affordance), the learner's Familiar scouts their
 * past learning signals + the goal's surroundings and proposes a labelled
 * checkbox list of growth edges; the learner ticks; confirm mints the edges
 * onto their knowledge map (CHO-2038) and feeds the Familiar's memory.
 *
 * Wire contracts (grounded against the as-built handlers):
 *  1. PROPOSE — `POST /v1/me/familiars/{id}/ceremony/edge-scout`
 *     (`familiar_ceremony_edge_scout_handler.go`, snake_case body/response).
 *  2. MINT (KG-owned) — `POST /v1/me/goals/{goalId}/learning-edges`
 *     (`goal_learning_edges_handler.go`, camelCase; 201 `{learningEdges}`).
 *  3. CONFIRM HOOK — `POST /v1/me/familiars/{id}/ceremony/edge-scout/confirm`
 *     (landing in parallel; snake_case per the CHO-2040 contract brief).
 *
 * All DTOs mirror the wire EXACTLY (no synthesised fields, chora-web
 * CLAUDE.md §3); errors map to i18n keys, never raw BE bodies.
 */

import type { InsufficientManaUpsell } from '../../../../core/services/me-mana.model';

/** The two locked edge labels — "Both, labelled" (INSTRUCT §2). */
export type CeremonyEdgeIntent = 'remediate' | 'explore';

/** Where the Familiar's scout found a candidate. */
export type CeremonyEdgeSource = 'weakness' | 'fog' | 'comment' | 'goal';

/**
 * One proposed growth edge on the propose wire (snake_case — the
 * consumption handler emits `atom_refs`; the gateway passes bodies through
 * verbatim). Title + intent (+ atom_refs) are POSTable to the CHO-2038
 * mint endpoint as-is.
 */
export interface EdgeScoutCandidate {
  readonly title: string;
  readonly intent: CeremonyEdgeIntent;
  readonly source: CeremonyEdgeSource;
  readonly atom_refs?: readonly string[];
  readonly rationale?: string;
}

/**
 * `POST /api/v1/me/familiars/{id}/ceremony/edge-scout` response.
 * `turn_id` is absent on the no-LLM virgin-fallback path; `first_run` is
 * OPTIONAL (the first-scout-free lane lands in a parallel BE round tonight —
 * absent means "not first run" so the chip degrades to the honest cost).
 */
export interface EdgeScoutProposal {
  readonly candidates: readonly EdgeScoutCandidate[];
  readonly fallback: boolean;
  readonly mana_charged: number;
  readonly turn_id?: string;
  readonly first_run?: boolean;
}

/**
 * Normalize a raw propose-wire response into the canonical snake_case
 * {@link EdgeScoutProposal}. The gateway FamiliarBridge camelises the WHOLE
 * consumption body (its `classify` runs `SnakeToCamelJSON`), so over the BFF
 * the FE actually receives `manaCharged` / `firstRun` / `turnId` and per
 * candidate `atomRefs`; a direct consumption call (or a unit-test fixture)
 * sends snake_case. Coalesce BOTH spellings for every field so the panel —
 * which reads snake_case — renders the mana chip + first-scout-free badge and
 * forwards `atom_refs` into the CHO-2038 mint regardless of the hop. Single-
 * word keys (title / intent / source / rationale / fallback / candidates) are
 * spelling-invariant. Fails soft to sane defaults (never fabricates candidates).
 */
export function normalizeEdgeScoutProposal(raw: unknown): EdgeScoutProposal {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawCandidates = Array.isArray(r['candidates'])
    ? (r['candidates'] as readonly unknown[])
    : [];
  const candidates: EdgeScoutCandidate[] = rawCandidates.map((entry) => {
    const c = (entry ?? {}) as Record<string, unknown>;
    const refs = c['atom_refs'] ?? c['atomRefs'];
    const atomRefs =
      Array.isArray(refs) && refs.length > 0
        ? (refs as readonly unknown[]).map((x) => String(x))
        : undefined;
    const rationale =
      typeof c['rationale'] === 'string' && c['rationale']
        ? c['rationale']
        : undefined;
    return {
      title: String(c['title'] ?? ''),
      intent: c['intent'] as CeremonyEdgeIntent,
      source: c['source'] as CeremonyEdgeSource,
      ...(atomRefs ? { atom_refs: atomRefs } : {}),
      ...(rationale ? { rationale } : {}),
    };
  });

  const mana = r['mana_charged'] ?? r['manaCharged'];
  const firstRun = r['first_run'] ?? r['firstRun'];
  const turnId = r['turn_id'] ?? r['turnId'];

  return {
    candidates,
    fallback: r['fallback'] === true,
    mana_charged: typeof mana === 'number' ? mana : 0,
    ...(typeof turnId === 'string' && turnId ? { turn_id: turnId } : {}),
    ...(typeof firstRun === 'boolean' ? { first_run: firstRun } : {}),
  };
}

/** One ticked edge in the CHO-2038 mint request (camelCase, as-built). */
export interface LearningEdgeSelection {
  readonly title: string;
  readonly intent: CeremonyEdgeIntent;
  readonly atomRefs?: readonly string[];
}

/** One minted concept + hierarchy edge from the CHO-2038 mint response. */
export interface MintedLearningEdge {
  readonly conceptId: string;
  readonly title: string;
  readonly intent: CeremonyEdgeIntent;
  readonly edgeId: string;
}

/**
 * CHO-2038 mint response. The as-built handler returns
 * `201 {"learningEdges": [...]}`; the CHO-2040 contract brief said
 * `{"edges": [...]}` — the reader accepts BOTH keys (contract in flight
 * tonight) and fails loud when neither is present.
 */
export interface MintLearningEdgesResponse {
  readonly learningEdges?: readonly MintedLearningEdge[];
  readonly edges?: readonly MintedLearningEdge[];
}

/** Confirm-hook receipt — `{published, noted}` per the CHO-2040 contract. */
export interface CeremonyMemoryReceipt {
  readonly published: number;
  readonly noted: number;
}

/**
 * Outcome of the confirm orchestration (mint THEN memory hook, sequential).
 * A mint failure is a thrown error (nothing happened). A memory-hook failure
 * AFTER a successful mint is NON-blocking — the edges exist on the map — so
 * it surfaces as `memory.status === 'failed'` with a retry affordance for
 * the hook only (never a re-mint).
 */
export interface CeremonyConfirmOutcome {
  readonly minted: readonly MintedLearningEdge[];
  readonly memory:
    | { readonly status: 'synced'; readonly receipt: CeremonyMemoryReceipt }
    | { readonly status: 'failed' };
}

/** Selection cap — mirrors the BE `edgescout.MaxCandidates` top-8 (CR-locked). */
export const CEREMONY_SELECTION_CAP = 8;

// ── Panel state unions (fail-loud AsyncState pattern, CLAUDE.md §3) ────────

/** Propose-call state driving the panel body. */
export type EdgeScoutState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly proposal: EdgeScoutProposal }
  | { readonly status: 'error'; readonly error: string };

/** Confirm-flow state (mint → memory hook). */
export type CeremonyConfirmState =
  | { readonly status: 'idle' }
  | { readonly status: 'inflight' }
  | { readonly status: 'error'; readonly error: string }
  | {
      readonly status: 'success';
      readonly outcome: CeremonyConfirmOutcome;
      /** True while the memory-hook RETRY is in flight (success stays rendered). */
      readonly retrying: boolean;
    };

// ── Error mapping (i18n keys — never raw bodies) ───────────────────────────

/** Minimal HttpErrorResponse slice we branch on. */
interface HttpErrorLike {
  readonly status?: number;
  readonly error?: unknown;
}

function statusOf(err: unknown): number {
  const s = (err as HttpErrorLike | null)?.status;
  return typeof s === 'number' ? s : 0;
}

/**
 * Extract the 402 `insufficient_mana` upsell envelope
 * (`{error:{code,message,upsell}}` — the canonical consumption shape the
 * chat/authoring surfaces already render via ManaTopupModalComponent).
 * Returns null for anything that is not a 402-with-upsell.
 */
export function extractManaUpsell(err: unknown): InsufficientManaUpsell | null {
  if (statusOf(err) !== 402) return null;
  const body = (err as HttpErrorLike).error;
  if (!body || typeof body !== 'object') return null;
  const inner = (body as { error?: unknown }).error;
  if (!inner || typeof inner !== 'object') return null;
  const upsell = (inner as { upsell?: InsufficientManaUpsell }).upsell;
  return upsell ?? null;
}

/** Map a propose failure to an i18n key (402 is handled via the upsell). */
export function proposeErrorKey(err: unknown): string {
  const status = statusOf(err);
  if (status === 402) return 'familiar.ceremony.error_mana';
  if (status === 404) return 'familiar.ceremony.error_not_found';
  if (status === 422) return 'familiar.ceremony.error_invalid';
  if (status === 401 || status === 403) {
    return 'familiar.ceremony.error_unauthorised';
  }
  if (status === 503) return 'familiar.ceremony.error_unavailable';
  if (status === 502) return 'familiar.ceremony.error_scout_failed';
  if (status >= 500) return 'familiar.ceremony.error_upstream';
  return 'familiar.ceremony.error_generic';
}

/**
 * Map a mint (confirm step 1) failure to an i18n key. 422
 * INVALID_LEARNING_EDGES notably covers the rootless-goal precondition
 * (ADR-214 §1 — the goal must anchor a root concept before edges can land).
 */
export function mintErrorKey(err: unknown): string {
  const status = statusOf(err);
  if (status === 404) return 'familiar.ceremony.error_not_found';
  if (status === 422) return 'familiar.ceremony.confirm_error_invalid';
  if (status === 401 || status === 403) {
    return 'familiar.ceremony.error_unauthorised';
  }
  if (status === 503) return 'familiar.ceremony.error_unavailable';
  if (status >= 500) return 'familiar.ceremony.error_upstream';
  return 'familiar.ceremony.confirm_error_generic';
}
