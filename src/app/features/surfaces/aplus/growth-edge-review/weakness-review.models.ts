/**
 * Growth-Edge graduated HITL review — bounded-control models (ADR-205 WS-8).
 *
 * The graduated weakness analyser is a checkpointed LangGraph crew that pauses
 * at an in-graph HITL interrupt so the learner can review their own diagnosis
 * before any edge is upserted or any output generated (ADR-205 D1/D4). The
 * learner-facing noun is **"Growth Edge"** (positive); the internal term is
 * "weakness". EVERY decision the learner makes is BOUNDED — accept / reject /
 * merge an edge, a difficulty tri-toggle, a bounded "add a struggle" picker, a
 * bounded output chooser — there is **no free-form prompt anywhere** (ADR-205
 * D4: the panel's state IS the `Command(resume=...)` payload). The learner
 * never sees the raw `descriptor` (misconceptions / sample_wrong) — only the
 * reframed Growth Edge (ADR-205 D5).
 *
 * Contract status (FLAGGED — see weakness-review.service.ts): these shapes
 * mirror ADR-205 D1/D4/D5/D6 and the AI-Assist resume precedent
 * (`/v1/orchestrator/runs/{run_id}/resume`, `Command(resume=...)`). The
 * gateway BFF proxy for the resume endpoint + the `structured_clues` /
 * `source_material` / `AWAITING_REVIEW` additive contract fields are NOT yet
 * wired downstream — this feature ships DARK behind `featureReadyGuard`
 * ('growth-edge-review') and fails loud (error state) if reached before the
 * BFF lands. All wire DTOs are snake_case (chora-web CLAUDE.md §3); models are
 * `readonly` and mirror the contract — no synthesized fields.
 */

/** Upload kinds incl. the additive `source_material` (textbook grounding, D8). */
export type WeaknessUploadKind =
  | 'marked_test'
  | 'notes'
  | 'scribble'
  | 'source_material';

/** Async job lifecycle — `AWAITING_REVIEW` is the additive HITL-interrupt state. */
export type WeaknessUploadStatus =
  | 'QUEUED'
  | 'ANALYZING'
  | 'AWAITING_REVIEW'
  | 'COMPLETED'
  | 'FAILED';

/** Per-edge decision (D4) — bounded: accept | reject | merge. NO free text. */
export type EdgeDecisionKind = 'accept' | 'reject' | 'merge';

/** Difficulty tri-toggle (D4) — bounded to three steps. */
export type EdgeDifficulty = 'easier' | 'standard' | 'harder';

/** Resume action (D1): `confirm` proceeds; `reiterate` loops back to diagnose
 *  carrying the structured decisions as constraints (never free text). */
export type ReviewAction = 'confirm' | 'reiterate';

/** Output kinds the learner can select (D5). */
export type WeaknessOutputKind =
  | 'focused_dose'
  | 'familiar_coaching'
  | 'practice_test'
  | 'study_aids';

/**
 * Structured clues (D2) — bounded pickers plus ONE optional short note that is
 * DATA, never instruction (screened by `SanitizeUserPrompt` server-side;
 * nothing learner-supplied alters the system prompt, output schema, or safety
 * preamble). All fields optional — the learner may upload with none.
 */
export interface StructuredClues {
  /** Bounded subject picker (curated select). */
  readonly subject?: string;
  /** Bounded level picker (curated select). */
  readonly level?: string;
  /** How confident the learner felt — bounded segmented control. */
  readonly confidence?: 'low' | 'medium' | 'high';
  /**
   * Optional short clarification — DATA only, server-screened, length-capped.
   * NOT a prompt: it never alters the agent's instruction (ADR-205 D2).
   */
  readonly note?: string;
}

/**
 * A proposed Growth Edge the learner reviews at the HITL interrupt. This is the
 * learner-facing REFRAME — the raw `descriptor` (misconceptions / sample_wrong)
 * is NEVER sent to the FE (ADR-205 D5).
 */
export interface ProposedGrowthEdge {
  readonly proposed_edge_id: string;
  readonly concept_label: string;
  /** Positive, learner-facing summary of where to grow. */
  readonly summary: string;
  /** Optional "try next" angles. */
  readonly suggested_angles?: readonly string[];
  /** How shaky: 1 = very weak … 0 = mastered (mirrors GrowthEdge.strength). */
  readonly strength: number;
  /** The crew's suggested starting difficulty (the tri-toggle default). */
  readonly suggested_difficulty: EdgeDifficulty;
}

/** A bounded "add a struggle" candidate (D4 topic picker — no free text). */
export interface StruggleCandidate {
  readonly concept_key: string;
  readonly concept_label: string;
}

/** An output option + its flat mana price (D6 price-up-front, server-supplied). */
export interface WeaknessOutputOption {
  readonly kind: WeaknessOutputKind;
  /** Flat per-action mana price (PricePlanResolver, ADR-178). */
  readonly mana_price: number;
  /** Whether the chooser starts with this output selected. */
  readonly default_selected?: boolean;
}

/** Who fronts the review (D5: the learner's EXISTING Familiar — no new persona). */
export interface ReviewFamiliar {
  readonly familiar_id: string;
  readonly name: string;
  readonly species?: string;
}

/** The HITL interrupt payload presented for review (D1 ★HITL_review). */
export interface WeaknessReviewPanel {
  readonly familiar?: ReviewFamiliar;
  readonly proposed_edges: readonly ProposedGrowthEdge[];
  readonly candidate_struggles: readonly StruggleCandidate[];
  readonly available_outputs: readonly WeaknessOutputOption[];
}

/** The async analysis job — carries the review panel while `AWAITING_REVIEW`. */
export interface WeaknessUploadJob {
  readonly upload_id: string;
  readonly status: WeaknessUploadStatus;
  /** Present (and only present) on `AWAITING_REVIEW`. */
  readonly review?: WeaknessReviewPanel;
  /** Present on `COMPLETED` (may be empty if nothing weak was detected). */
  readonly upserted_growth_edge_ids?: readonly string[];
  /** Present on `FAILED` (non-leaky reason). */
  readonly failure_reason?: string;
}

/** A single bounded per-edge decision in the resume payload. */
export interface EdgeDecision {
  readonly proposed_edge_id: string;
  readonly decision: EdgeDecisionKind;
  /** Required iff `decision === 'merge'` — the surviving edge to merge into. */
  readonly merge_into_id?: string;
  /** Set when accepted/merged — drives the focused dose difficulty. */
  readonly difficulty?: EdgeDifficulty;
}

/**
 * The bounded resume payload — the literal `Command(resume=...)` value
 * (ADR-205 D1/D4). NO free-form text: every field is a bounded selection.
 */
export interface WeaknessReviewDecision {
  readonly action: ReviewAction;
  readonly edges: readonly EdgeDecision[];
  /** `concept_key`s chosen from the bounded struggle picker. */
  readonly added_struggles: readonly string[];
  /** The chosen outputs to generate on confirm. */
  readonly selected_outputs: readonly WeaknessOutputKind[];
}
