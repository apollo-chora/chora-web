/**
 * Familiar profile model — A+ F5 un-mock (2026-06-02).
 *
 * Domain anchors (per `domain-content-consumption` + ADR-116 amendment
 * + ADR-147 §7 + multi-familiar-per-user-2026-05-11.md):
 *   - `Familiar` (chora-consumption entity, 1:N per learner): a learner
 *     owns N specialised Familiars.
 *   - Per-Familiar 7-stage growth axis (ADR-149) — exposed inline on the
 *     instance response as the OPTIONAL `growthState` projection.
 *   - Per-Familiar Vertex AI Memory Bank (`app_name=familiar:{id}`,
 *     ADR-147 §7) — surfaced as the OPTIONAL `memorySummary` recap.
 *
 * `Familiar` ≠ `Agent`: Familiar = in-game RPG companion (domain
 * entity); the AI agent behind it is a separate adapter concern
 * (`feedback_familiar_vs_agent`).
 *
 * ── Wire alignment (no stubs; mirror the wire honestly) ──────────────
 * The interface mirrors the chora-consumption `getFamiliarInstance`
 * response (`GET /v1/me/familiars/{id}`) EXACTLY, camelCased by the
 * chora-gateway snake→camel pass. Source-of-truth:
 *   - `services/chora-consumption/internal/adapter/http/
 *      familiar_instance_handlers.go` (`instanceResp` + `growthStateResp`
 *      + `cosmeticResp`)
 *   - `chora-contracts/openapi/consumption-companion.yaml`
 *      (`FamiliarInstanceResponse` + `GrowthState` + `Cosmetic`).
 *
 * Contract note: the per-instance GET returns the BASE identity shape;
 * `growthState` / `cosmetic` are documented OPTIONAL on this schema
 * (populated inline on the list endpoint; a parallel BE enrichment is
 * adding them to the GET too). `memorySummary` is the parallel BE
 * Memory-Bank recap enrichment — also OPTIONAL and may be absent/empty.
 * Everything optional renders gracefully (fail-loud on transport errors,
 * but absent enrichment is NOT an error).
 */

/** Growth-stage labels per ADR-149 7-stage axis. */
export type FamiliarStageName =
  | 'egg'
  | 'baby'
  | 'fledgling'
  | 'awakened'
  | 'structural'
  | 'teen'
  | 'matured'
  | 'unknown';

export type FamiliarRarity = '' | 'common' | 'uncommon' | 'rare' | 'legendary';

/**
 * Inline `growth_state` projection — ADR-149 growth-axis. Optional on the
 * per-instance GET (always present on the list endpoint). Mirrors
 * `growthStateResp` in the consumption handler.
 */
export interface FamiliarGrowthProjection {
  readonly stage: number;
  readonly stageName: FamiliarStageName;
  readonly exp: number;
  readonly expToNextStage: number;
  /** Breed; empty pre-hatch. */
  readonly currentBreed: string;
  /** hatched_at; null pre-hatch. */
  readonly breedRevealedAt: string | null;
  /** Cached LLM tier per Mana × Growth matrix; empty pre-hatch. */
  readonly effectiveLlmTier: string;
  readonly lastStageUpAt: string | null;
  /** Resonant Atom anchor (UUIDv7); empty pre-hatch. */
  readonly resonantAtomId: string;
  /** D3 (CHO-2047): server-resolved names; absent when the id does not resolve. */
  readonly resonantConceptTitle?: string;
  readonly resonantAtomTitle?: string;
  readonly ahaMomentConsumed: boolean;
  readonly ahaMomentActiveUntil: string | null;
}

/**
 * Inline `cosmetic` projection. Optional on the per-instance GET. Mirrors
 * `cosmeticResp` in the consumption handler.
 */
export interface FamiliarCosmeticProjection {
  /** DigitalSkin id; null = render default skin. */
  readonly equippedSkinId: string | null;
  readonly shiny: boolean;
  readonly rarity: FamiliarRarity;
}

/**
 * Familiar instance — the documented `FamiliarInstanceResponse`.
 *
 * Identity fields (familiarId … updatedAt) are ALWAYS present. The growth
 * / cosmetic projections and the Memory-Bank recap are OPTIONAL — the FE
 * renders the base identity card and degrades the growth / memory panels
 * to graceful "not yet" copy when absent.
 */
export interface FamiliarProfile {
  // ── Identity (always present) ──────────────────────────────────────
  readonly familiarId: string;
  /**
   * chora-consumption speaks Companion on the wire (ADR-254 D9), so the
   * per-instance GET is keyed `companionId`. The profile model keeps
   * `familiarId`, and the two names meet in `FamiliarService.loadProfile`
   * and nowhere else.
   */
  readonly companionId?: string;
  readonly tenantId: string;
  readonly ownerGcid: string;
  readonly name: string;
  /** Topic specialization — anchors RAG slice + skill pool. */
  readonly specialization: string;
  /** XP-gated tier (apprentice/adept/master/sage); distinct from growth stage. */
  readonly evolutionTier: string;
  readonly skillSlotsUnlocked: number;
  readonly memoryContextCapacity: number;
  readonly skillGrants: readonly string[];
  readonly configuredRules: Readonly<Record<string, string>>;
  /** Vertex AI Memory Bank app_name — `familiar:{familiar_id}`. */
  readonly memoryBankAppName: string;
  readonly createdAt: string;
  readonly updatedAt: string;

  // ── Optional enrichment (parallel BE work; may be absent) ──────────
  readonly growthState?: FamiliarGrowthProjection;
  readonly cosmetic?: FamiliarCosmeticProjection;
  /**
   * Memory-Bank recap (ADR-147 §7). Free-text projection of the
   * per-Familiar Vertex AI Memory Bank. OPTIONAL — absent/empty when the
   * Memory Bank has no recall yet; the UI renders a graceful empty state.
   */
  readonly memorySummary?: string;
}

/**
 * Discriminated-union state for the profile load. Mirrors the
 * `AsyncState<T>` fail-loud pattern used across chora-web (catalog /
 * course-detail / daily-dose). `error` is an i18n key — never a raw BE
 * body.
 */
export type FamiliarProfileState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly profile: FamiliarProfile }
  | { readonly status: 'error'; readonly error: string };

/**
 * Whether the instance carries a non-empty Memory-Bank recap. Used by the
 * component to branch the memory panel between recap copy and the graceful
 * empty state.
 */
export function hasMemorySummary(profile: FamiliarProfile): boolean {
  return (
    typeof profile.memorySummary === 'string' &&
    profile.memorySummary.trim().length > 0
  );
}
