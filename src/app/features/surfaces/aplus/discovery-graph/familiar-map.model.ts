/**
 * Familiar-per-map models (ADR-212 WS-3).
 *
 * Each learner-sovereign map designates ONE Familiar. The learner acquires
 * it (dev-hatched in dev, Stripe-hatched in prod), the binding records the
 * map↔Familiar link, and the Familiar's memory endpoint exposes its
 * persona / rules / focus plus RAG-explainability (visibleNeighbors +
 * per-concept atom Citations).
 *
 * Mirrors the FE-facing gateway contract exactly — the gateway maps
 * `/api/v1/me/familiars/*` → chora-consumption `/v1/me/familiars/*`.
 * camelCase on the wire; `readonly` + thin.
 */

/** Acquisition mode. `dev_hatched` bypasses Stripe so the flow works in dev. */
export type FamiliarAcquireMode = 'hatched' | 'dev_hatched';

/**
 * POST /familiars/acquire request body. A MAP is a Goal (ADR-214), so a
 * Familiar is acquired FOR a map identified by its `goalId`.
 */
export interface AcquireFamiliarRequest {
  readonly goalId: string;
  readonly familiarName?: string;
  readonly mode?: FamiliarAcquireMode;
}

/** POST /familiars/acquire response body (201). */
export interface AcquiredFamiliar {
  readonly familiarId: string;
  readonly name: string;
  readonly goalId: string;
  readonly acquisition: string;
}

/**
 * One map↔Familiar binding. A MAP is a Goal (ADR-214): `bindingId` is the
 * map/goal id and `mapTheme` is the map's root-concept title. `acquisition`
 * may be "" — it is no longer separately tracked on the binding.
 */
export interface FamiliarBinding {
  readonly bindingId: string;
  readonly mapTheme: string;
  readonly familiarId: string;
  readonly acquisition: string;
  readonly createdAt: string;
}

/** GET /familiars/bindings response body. */
export interface FamiliarBindingsResponse {
  readonly items: readonly FamiliarBinding[];
}

/**
 * One DURABLE source behind a grounded research note (ADR-231 D4, CHO-2185).
 *
 * ⚠ There is no `url`, and that is deliberate. The uri Google returns is a
 * grounding-api-redirect that EXPIRES (~30 days), so it was never persisted —
 * re-serving one from a months-old note would be a dead link that still looks
 * like a working source. The domain never expires; it is the record.
 */
export interface MemoryCitation {
  readonly domain?: string;
  readonly title?: string;
  readonly snippet?: string;
}

/**
 * Where a grounded note came from: the queries the Companion actually issued,
 * plus the durable citations (persisted as source_metadata, mig 0094).
 *
 * ABSENT (undefined) on a note written before that migration — its provenance is
 * genuinely unrecoverable, and the panel says so plainly rather than inventing it.
 */
export interface MemoryProvenance {
  readonly webSearchQueries?: readonly string[];
  readonly citations?: readonly MemoryCitation[];
}

/** One remembered fact. */
export interface FamiliarMemoryItem {
  readonly id: string;
  readonly memoryType: string;
  readonly content: string;
  readonly createdAt: string;
  /**
   * Grounded provenance — present IFF the note actually has any. The BE omits the
   * key for an unrecorded (pre-0094) note rather than sending an empty object, so
   * "absent" is the single honest signal the panel branches on.
   */
  readonly sourceMetadata?: MemoryProvenance;
}

/** A cited atom under a visible concept (RAG-explainability). */
export interface ConceptCitation {
  readonly atomId: string;
  readonly atomTitle: string;
  readonly topicNodePath: string;
}

/** A concept the Familiar can currently "see", with its atom citations. */
export interface VisibleNeighbor {
  readonly conceptId: string;
  readonly conceptTitle: string;
  readonly citations: readonly ConceptCitation[];
}

/** GET /familiars/{familiarId}/memory response body. */
export interface FamiliarMapMemory {
  readonly familiarId: string;
  readonly name: string;
  readonly focus: string;
  readonly persona: string;
  readonly rules: Record<string, unknown>;
  /** Tier LABEL (string on the wire, e.g. "hatchling") — not a numeric level. */
  readonly evolutionTier: string;
  readonly skills: readonly string[];
  readonly hasMemory: boolean;
  readonly memories: readonly FamiliarMemoryItem[];
  readonly visibleNeighbors: readonly VisibleNeighbor[];
  /**
   * The Companion's grounded research notes, each with the provenance behind it
   * (CHO-2185). Read server-side as its OWN memory_type-filtered list, not sieved
   * out of `memories`: that array is a shared recency window, so a learner who
   * chats a lot would push their research notes out of it and never see them.
   *
   * OPTIONAL on purpose. chora-consumption always sends it (as `[]` when there are
   * none, never null), but the SPA and the service deploy independently — so a
   * bundle can legitimately meet a chora-consumption that predates CHO-2185 and
   * omits the key entirely. Typing it as required would be this model asserting a
   * guarantee the wire does not make; callers coalesce with `?? []`.
   */
  readonly researchNotes?: readonly FamiliarMemoryItem[];
}

/**
 * Deterministic goal-scoped knowledge (CHO-2116 tier 1 — no LLM): what the
 * familiar knows about the learner ON the hosting map's goal, computed by the
 * host from the already-painted concepts. `due` marks a shaky concept whose
 * retention has decayed past the review threshold. The cached LLM narrative
 * synthesis over the full RAG memory is tier 2 (CHO-2118, design-first).
 */
export interface FamiliarGoalKnowledgeShaky {
  readonly title: string;
  readonly due: boolean;
}
export interface FamiliarGoalKnowledge {
  readonly shaky: readonly FamiliarGoalKnowledgeShaky[];
  readonly mastered: readonly string[];
}

/**
 * The Companion's cached narrative reflection on a goal (CHO-2118 tier 2) —
 * `GET /v1/me/goals/{goalId}/knowledge`.
 *
 * `status` is the BACKEND's read-policy verdict, not a UI state:
 *  - `fresh`      — a cached reflection, served with zero LLM cost.
 *  - `reflecting` — a synthesis is wanted or in flight. `text` still carries the
 *                   LAST GOOD reflection (possibly `''`): serve-stale-while-regen,
 *                   so the learner never sees a blank where prose used to be.
 *  - `none`       — there is honestly nothing to reflect on yet (no memories AND
 *                   no shaky concepts), or no Companion is bound. Never fabricate
 *                   one to fill the space (ADR-207 — unknown is a state).
 */
export type GoalReflectionStatus = 'fresh' | 'reflecting' | 'none';

export interface GoalReflection {
  readonly text: string;
  readonly status: GoalReflectionStatus;
}

/**
 * A weakness that genuinely bears on THIS goal, shakiest first.
 *
 * ⚠ `strength` is on the wire but must NEVER be rendered: ADR-215 D5 forbids
 * showing the learner a model-internal score. Shakiness rides the ORDER of the
 * list, never a number — otherwise we eventually ship a Companion that tells a
 * learner "your strength is 0.82".
 */
export interface GoalShakyConcept {
  readonly conceptKey: string;
  readonly conceptLabel: string;
  readonly strength: number;
}

/** The BE's tier-1 block + the tier-2 reflection, in one goal-scoped read. */
export interface GoalKnowledge {
  readonly goalId: string;
  readonly goalTitle: string;
  readonly familiarId: string;
  readonly familiarName: string;
  readonly conceptsTotal: number;
  readonly conceptsMastered: number;
  readonly shakyConcepts: readonly GoalShakyConcept[];
  readonly hasMemory: boolean;
  readonly memories: readonly FamiliarMemoryItem[];
  readonly reflection: GoalReflection;
}

/**
 * Fail-SOFT async state. The reflection is an enrichment ON TOP of the
 * deterministic tier-1 block, so every failure degrades to tier 1 and renders
 * nothing — no error card, no retry button. Contrast `FamiliarMemoryState`,
 * which is fail-LOUD because the memory panel IS the content.
 */
export type GoalReflectionState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly knowledge: GoalKnowledge }
  | { readonly status: 'error' };

/** Fail-loud async state for the bindings list. `error` is an i18n key. */
export type FamiliarBindingsState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly bindings: readonly FamiliarBinding[] }
  | { readonly status: 'error'; readonly error: string };

/** Fail-loud async state for the memory panel. `error` is an i18n key. */
export type FamiliarMemoryState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly memory: FamiliarMapMemory }
  | { readonly status: 'error'; readonly error: string };
