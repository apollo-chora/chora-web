/**
 * FamiliarGrowthService — chora-gateway client for the §2.1 BFF
 * endpoints per `docs/m13/HANDOFF_FE_FAMILIAR_GROWTH_2026-05-13.md`.
 *
 * `listMyFamiliars` consumes the enriched chora-consumption wire from
 * `GET /v1/me/familiars` (BE round-21, B5/A24/debt#44 — handoff
 * 2026-05-16). Each item carries inline `growth_state` + `cosmetic`
 * projections; the prior `configured_rules` JSONB derivation chain
 * (parseGrowthStage / parseSpecies / intRule + STAGE_EXP_THRESHOLDS
 * lookup) is gone. Per [[no-stubs-real-wiring]] fetch failures
 * propagate (no mock fallback); empty lists render empty state.
 *
 * All other endpoints (getGrowth / hatch / pickResonantConcept /
 * getLoadout / equipSkill / unequipSkill / invokeSkill /
 * openSourceRevelation / getGrowthEvents / egg catalog / odds /
 * checkout) ALSO fail-loud — mock fallbacks were stripped 2026-05-16
 * per the no-debts directive. The retired kg-neighbours pick (R3-1,
 * CHO-2013 P1) is replaced by pickResonantConcept (POST /resonance).
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BffClientService } from '../services/bff-client.service';
import type { BreedSpecies } from '../../shared/components/breed-art/breed-art.component';
import type {
  EggCatalogResponse,
  FamiliarGrowthState,
  FamiliarSummary,
  GrowthEventsPage,
  GrowthStage,
  HatchEggResponse,
  LoadoutView,
  NextUnlock,
  Rarity,
  AdminEggCatalogEntry,
  PreviewEggOddsResponse,
  RevealBreedResponse,
  SkillInvokeResult,
} from './familiar-growth.model';
import {
  normalizeGrowthEventsPage,
  normalizeLoadoutView,
  normalizeSkillInvokeResult,
} from './familiar-growth.model';

interface BffEnvelope<T> {
  readonly data?: T;
  readonly error?: { readonly code: string; readonly message: string };
}

/**
 * Envelope unwrap helper — throws if `env.data` is undefined so the
 * Observable emits a real error rather than synthesising fake data.
 * Preserves the BFF-provided error message when present.
 */
function unwrap<T>(env: BffEnvelope<T>, fallbackMessage: string): T {
  if (env.data === undefined) {
    throw new Error(env.error?.message ?? fallbackMessage);
  }
  return env.data;
}

/**
 * Inline `growth_state` projection on the `/v1/me/familiars` wire
 * (B5 round-21, handoff 2026-05-16). Sourced from the
 * `familiar_instances` ADR-149 columns (no JOIN; single-SELECT).
 */
interface FamiliarGrowthStateWire {
  readonly stage: number;
  readonly stageName: string;
  readonly exp: number;
  readonly expToNextStage: number;
  readonly currentBreed: string;
  readonly breedRevealedAt: string | null;
  readonly effectiveLlmTier: string;
  readonly lastStageUpAt: string | null;
  readonly resonantAtomId: string;
  readonly ahaMomentConsumed: boolean;
  readonly ahaMomentActiveUntil: string | null;
  /**
   * C1a: the next stage's Path preview per roster row.
   *
   * ⚠ Not served on this read yet. `next_unlocks` comes only from
   * `handleGetGrowth`, and that handler's comment says the embedded
   * `stateResp` omits it. Typed here so C1a lands with no FE change; until
   * then it is simply absent, which the mapper passes through as absent.
   */
  readonly nextUnlocks?: readonly NextUnlock[];
}

/** Inline `cosmetic` projection on the `/v1/me/familiars` wire. */
interface FamiliarCosmeticWire {
  readonly equippedSkinId: string | null;
  readonly shiny: boolean;
  readonly rarity: string;
}

/**
 * Wire row from chora-consumption `/v1/me/familiars` (camelCase via the
 * chora-gateway `classify()` snake→camel pass). Mirrors
 * `services/chora-consumption/.../familiar_instance_handlers.go` +
 * `chora-contracts/openapi/consumption-companion.yaml`.
 */
interface FamiliarInstanceWire {
  /**
   * chora-consumption speaks Companion on the wire (ADR-254 D9), so a roster
   * item is keyed `companionId`. The roster model keeps `familiarId`, and the
   * two names meet in `wireToSummary` and nowhere else.
   */
  readonly companionId: string;
  readonly tenantId: string;
  readonly ownerGcid: string;
  readonly name: string;
  readonly specialization: string;
  /** The FE-facing topic axis; the same value as `specialization`. */
  readonly subject?: string;
  readonly evolutionTier: string;
  readonly skillSlotsUnlocked: number;
  readonly memoryContextCapacity: number;
  readonly skillGrants: readonly string[];
  readonly configuredRules: Readonly<Record<string, string>>;
  readonly memoryBankAppName: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  // ⚠ Both blocks are `omitempty` POINTERS server-side and are populated only
  // on the LIST response: the create and per-instance reads return the base
  // shape without them. Typed optional here because the mapper must survive a
  // base-shape row rather than throwing on a dereference.
  readonly growthState?: FamiliarGrowthStateWire;
  readonly cosmetic?: FamiliarCosmeticWire;
}

interface FamiliarListResponse {
  readonly items: readonly FamiliarInstanceWire[];
  // C1a (`e2cbd0bd7`): the effective cap and where it came from, on the
  // ENVELOPE rather than per item. Both spellings accepted: which hop this
  // read takes is not settled, and a silent zero here is a wrong denominator
  // on the roster, which is the exact fork the field exists to close.
  readonly roster_cap?: number;
  readonly cap_source?: string;
  readonly rosterCap?: number;
  readonly capSource?: string;
}

/** The roster read with its envelope kept (C3). */
export interface RosterView {
  readonly companions: readonly FamiliarSummary[];
  /**
   * The effective maximum. UNDEFINED when the server sent none or sent a
   * non-positive one: rendering "1 of 0" is nonsense and re-deriving 3 from
   * the FE would re-invent the denominator this field exists to stop the
   * client inventing, so absent stays absent and the chip drops the fraction.
   */
  readonly rosterCap?: number;
  /** `default` today, `entitlement` once M12.3 lands. */
  readonly capSource?: string;
}

function clampStage(n: number): GrowthStage {
  return n >= 0 && n <= 6 ? (n as GrowthStage) : 0;
}

/** The closed rarity set, mirrored so an unknown value is not cast into a lie. */
const KNOWN_RARITIES: ReadonlySet<string> = new Set([
  '',
  'common',
  'uncommon',
  'rare',
  'legendary',
]);

/**
 * Narrow the wire's rarity string.
 *
 * A cast would let a rarity this SPA has never heard of through as though it
 * were understood, and the roster paints by rarity. Unknown reads as absent,
 * which the card renders as no rarity treatment rather than a wrong one.
 */
function toRarity(raw: string | undefined): Rarity | undefined {
  return raw !== undefined && KNOWN_RARITIES.has(raw)
    ? (raw as Rarity)
    : undefined;
}

function wireToSummary(
  wire: FamiliarInstanceWire,
  index: number,
): FamiliarSummary {
  // ⚠ Both blocks are optional on the wire and were dereferenced unguarded
  // here, so a base-shape row (create, or the per-instance read) threw
  // "Cannot read properties of undefined" instead of degrading. A test pins it.
  const g = wire.growthState;
  const c = wire.cosmetic;
  return {
    familiarId: wire.companionId,
    displayName: wire.name,
    species: g?.currentBreed as BreedSpecies,
    growthStage: clampStage(g?.stage ?? 0),
    shinyVariant: c?.shiny ?? false,
    expCurrent: g?.exp ?? 0,
    expNextThreshold: g?.expToNextStage ?? 0,
    isActive:
      wire.configuredRules?.['is_active'] === 'true' || index === 0,

    // C3: kept rather than discarded. Every one of these was already on the
    // wire and thrown away here.
    subject: wire.subject ?? wire.specialization,
    evolutionTier: wire.evolutionTier,
    stageName: g?.stageName,
    skillSlotsUnlocked: wire.skillSlotsUnlocked,
    rarity: toRarity(c?.rarity),
    lastStageUpAt: g?.lastStageUpAt,
    // Passed through UNTOUCHED so absent stays absent: see the model's note on
    // why absent and [] must not collapse. C1a makes this start arriving.
    nextUnlocks: g?.nextUnlocks,
  };
}

@Injectable({ providedIn: 'root' })
export class FamiliarGrowthService {
  private readonly bff = inject(BffClientService);

  /**
   * List the caller's roster. Real fetch — fail-loud (no mock fallback).
   * Errors propagate; empty arrays render as empty state in callers.
   */
  listMyFamiliars(): Observable<readonly FamiliarSummary[]> {
    // Delegates, so there is ONE read and ONE mapping rather than two that can
    // drift. Eleven callers want the bare array and keep getting it.
    return this.listRoster().pipe(map((r) => r.companions));
  }

  /**
   * The roster read WITH its envelope (C3): the companions plus the effective
   * cap and where that cap came from.
   */
  listRoster(): Observable<RosterView> {
    return this.bff.get<FamiliarListResponse>('/api/v1/me/familiars').pipe(
      map((env) => {
        const cap = env.roster_cap ?? env.rosterCap;
        return {
          companions: (env.items ?? []).map(wireToSummary),
          // A non-positive cap is treated as unknown: the create handler never
          // enforces zero, so zero is far likelier a serialisation miss than a
          // learner who may hold nothing.
          rosterCap: typeof cap === 'number' && cap > 0 ? cap : undefined,
          capSource: env.cap_source ?? env.capSource,
        };
      }),
    );
  }

  /**
   * Full growth state for one Familiar. Fail-loud — backend ask:
   * E2E-BE-FAM-GROWTH.
   */
  getGrowth(familiarId: string): Observable<FamiliarGrowthState> {
    return this.bff
      .get<BffEnvelope<FamiliarGrowthState>>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/growth`,
      )
      .pipe(
        map((env) => unwrap(env, 'familiar-growth: getGrowth missing data')),
        // The wire is keyed `companionId` (ADR-254 D9); the model keeps
        // `familiarId`. Meet them here, falling back to the id we asked
        // for. The profile page binds this id into the Grimoire loadout,
        // whose required input parks in `loading` and never calls when it
        // receives ''.
        map((state) => ({
          ...state,
          familiarId: state.familiarId || state.companionId || familiarId,
        })),
      );
  }

  /**
   * CHO-2229 — reveal the breed AHEAD of naming: POST /reveal rolls once,
   * persists the roll and returns it. Idempotent — a re-POST (ceremony
   * resume, double-tap) returns the SAME roll with alreadyRevealed=true and
   * never re-rolls. 409 NOT_STIRRING propagates fail-loud.
   */
  reveal(familiarId: string): Observable<RevealBreedResponse> {
    return this.bff
      .post<BffEnvelope<RevealBreedResponse>>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/reveal`,
        {},
      )
      .pipe(map((env) => unwrap(env, 'familiar-growth: reveal missing data')));
  }

  /**
   * The identity commit — the hatch POST (Stage 0 → 1, one-shot; a second
   * call 422s ALREADY_HATCHED). COMMIT-ONLY since CHO-2229: the breed was
   * rolled + persisted by reveal(); an unrevealed pod 409s NOT_REVEALED.
   * Tones mirror the backend canonical set (growth.canonicalTones).
   * The resonant atom is optional at hatch (CHO-2028) — when present it
   * must be an atom UUID; omit the key to hatch without one.
   */
  hatch(
    familiarId: string,
    body: {
      readonly displayName: string;
      readonly tone: 'socratic' | 'direct' | 'encouraging';
      readonly learnerPersona: string;
      readonly resonantAtomId?: string;
    },
  ): Observable<HatchEggResponse> {
    return this.bff
      .post<BffEnvelope<HatchEggResponse>>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/hatch`,
        body,
      )
      .pipe(map((env) => unwrap(env, 'familiar-growth: hatch missing data')));
  }

  /**
   * R3-1 awakening resonant-concept pick — the ring-radius centre inside the
   * bound Goal's subgraph. POST /resonance {conceptId}; BFF-wrapped {data:
   * {state}}. Replaces the retired kg-neighbours pick (pickKgNeighbor).
   * Fail-loud: a 404 CONCEPT_NOT_FOUND / 409 (not hatched / not bound)
   * propagates so the caller renders the honest conflict.
   */
  pickResonantConcept(
    familiarId: string,
    conceptId: string,
  ): Observable<FamiliarGrowthState> {
    return this.bff
      .post<BffEnvelope<{ readonly state: FamiliarGrowthState }>>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/resonance`,
        { conceptId },
      )
      .pipe(
        map((env) => {
          const wrapper = unwrap(
            env,
            'familiar-growth: pickResonantConcept missing data',
          );
          return wrapper.state;
        }),
      );
  }

  /**
   * The Grimoire loadout view (CHO-2013 P1). GET /skills — UNWRAPPED
   * snake→camel (the skills family is NOT {data:T}-enveloped). Fail-loud.
   * CHO-2362: grant rows are reconciled via normalizeLoadoutView so each
   * row's paramsSchema/params_schema spelling coalesces for the editor.
   */
  getLoadout(familiarId: string): Observable<LoadoutView> {
    return this.bff
      .get<LoadoutView>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/skills`,
      )
      .pipe(map(normalizeLoadoutView));
  }

  /**
   * Equip an owned Skill into an earned slot (PUT /skills/{key}/equip).
   * Returns the new loadout view. A 409 SKILL_SLOTS_FULL / SKILL_NOT_ACTIVE
   * / SKILL_NOT_OWNED / CRAFT_SKILL_ALWAYS_ON propagates (status preserved)
   * so the caller renders the conflict.
   */
  equipSkill(familiarId: string, skillKey: string): Observable<LoadoutView> {
    return this.bff
      .put<LoadoutView>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/skills/${encodeURIComponent(skillKey)}/equip`,
        {},
      )
      .pipe(map(normalizeLoadoutView));
  }

  /** Unequip a Skill (free swap; DELETE /skills/{key}/equip). */
  unequipSkill(familiarId: string, skillKey: string): Observable<LoadoutView> {
    return this.bff
      .delete<LoadoutView>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/skills/${encodeURIComponent(skillKey)}/equip`,
      )
      .pipe(map(normalizeLoadoutView));
  }

  /**
   * R4-4 single-step Skill invoke runner (POST /skills/{key}/invoke). Params
   * are the Skill's spec-§2 sheet params (all string enums/refs for the P1
   * three). Empty params ⇒ the `params` key is omitted (all defaults). The
   * runner drives one gateway-metered agent turn and writes the sink;
   * 402 insufficient_mana / 409 (not equipped/active/stage) propagate.
   */
  invokeSkill(
    familiarId: string,
    skillKey: string,
    params?: Readonly<Record<string, string>>,
  ): Observable<SkillInvokeResult> {
    const body =
      params && Object.keys(params).length > 0 ? { params } : {};
    // CHO-2040 tail: normalise the wire so the mana chip renders regardless of
    // whether the response arrived camelised (FamiliarBridge hop) or snake_case
    // (a non-camelising hop) — a naive cast left `manaCharged` undefined.
    return this.bff
      .post<unknown>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/skills/${encodeURIComponent(skillKey)}/invoke`,
        body,
      )
      .pipe(map(normalizeSkillInvokeResult));
  }

  /**
   * Trigger the Stage-3 24h Aha-moment window. Fail-loud — backend
   * ask: E2E-BE-FAM-AHA.
   */
  openSourceRevelation(
    familiarId: string,
  ): Observable<{ readonly previewLlmTier: string; readonly windowExpiresAt: string }> {
    return this.bff
      .post<BffEnvelope<{ previewLlmTier: string; windowExpiresAt: string }>>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/source-revelation`,
        {},
      )
      .pipe(map((env) => unwrap(env, 'familiar-growth: openSourceRevelation missing data')));
  }

  /**
   * Paginated EXP ledger. Fail-loud — backend ask: E2E-BE-FAM-EVENTS.
   */
  getGrowthEvents(
    familiarId: string,
    pageToken?: string,
  ): Observable<GrowthEventsPage> {
    const path =
      `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/growth-events` +
      (pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '');
    return this.bff
      .get<BffEnvelope<GrowthEventsPage>>(path)
      .pipe(
        map((env) =>
          normalizeGrowthEventsPage(
            unwrap(env, 'familiar-growth: getGrowthEvents missing data'),
          ),
        ),
      );
  }

  /** Egg catalog. Fail-loud — backend ask: E2E-BE-FAM-EGGS-CATALOG. */
  getEggCatalog(): Observable<EggCatalogResponse> {
    return this.bff
      .get<BffEnvelope<EggCatalogResponse>>('/api/v1/familiar-eggs/catalog')
      .pipe(map((env) => unwrap(env, 'familiar-growth: getEggCatalog missing data')));
  }

  /**
   * Per-SKU breed odds (IMDA D2 mandatory pre-checkout disclosure).
   * Fail-loud — backend ask: E2E-BE-FAM-EGGS-ODDS.
   */
  getEggOdds(sku: string): Observable<PreviewEggOddsResponse> {
    return this.bff
      .get<BffEnvelope<PreviewEggOddsResponse>>(
        `/api/v1/familiar-eggs/${encodeURIComponent(sku)}/odds`,
      )
      .pipe(map((env) => unwrap(env, 'familiar-growth: getEggOdds missing data')));
  }

  /**
   * GET the FULL catalogue entry for the H+ SKU editor (D6). Fail-loud.
   *
   * Deliberately not the odds read: the editor saves through a full-entry
   * upsert, so it has to hold every field that upsert consumes. Deliberately
   * not the catalogue LIST either, which filters on the availability window and
   * so hides exactly the SKU an admin is most likely to be fixing.
   */
  getAdminEggEntry(sku: string): Observable<AdminEggCatalogEntry> {
    return this.bff
      .get<BffEnvelope<AdminEggCatalogEntry>>(
        `/api/v1/familiar-eggs/admin/catalog/${encodeURIComponent(sku)}`,
      )
      .pipe(map((env) => unwrap(env, 'familiar-growth: getAdminEggEntry missing data')));
  }

  /**
   * POST the whole entry back (D6). The upsert REPLACES the row, so callers must
   * send what they read, not a partial. Errors propagate: a refused distribution
   * has to reach the editor as a refusal, never as a save.
   */
  saveAdminEggEntry(entry: AdminEggCatalogEntry): Observable<AdminEggCatalogEntry> {
    return this.bff
      .post<BffEnvelope<AdminEggCatalogEntry>>('/api/v1/familiar-eggs/admin/catalog', entry)
      .pipe(map((env) => unwrap(env, 'familiar-growth: saveAdminEggEntry missing data')));
  }

  /**
   * Start Stripe Checkout. Fail-loud — backend ask:
   * E2E-BE-FAM-CHECKOUT (Stripe integration pending).
   */
  checkout(
    sku: string,
  ): Observable<{ readonly stripeCheckoutUrl: string; readonly purchaseId: string }> {
    return this.bff
      .post<BffEnvelope<{ stripeCheckoutUrl: string; purchaseId: string }>>(
        '/api/v1/familiar-eggs/checkout',
        { sku },
      )
      .pipe(map((env) => unwrap(env, 'familiar-growth: checkout missing data')));
  }

  /**
   * Retire (soft-delete) a Familiar (CHO-2033) — frees a roster slot for
   * a future hatch while the growth ledger + history persist server-side
   * (pseudonymise-not-delete; `services/chora-consumption/internal/
   * adapter/http/familiar_retire_handler.go`). POST /retire with an
   * empty body.
   *
   * The gateway route for this sub-path is being finalised in parallel
   * (SP3 follow-up on the backend ticket) so the response body is
   * intentionally NOT modelled here — the caller must treat any 2xx as
   * success and re-fetch/prune the roster, never branch on the payload
   * shape. A non-2xx (e.g. 404 if already retired) propagates fail-loud.
   */
  retire(familiarId: string): Observable<void> {
    return this.bff
      .post<unknown>(
        `/api/v1/me/familiars/${encodeURIComponent(familiarId)}/retire`,
        {},
      )
      .pipe(map(() => undefined));
  }

  /**
   * CHO-2034 free-claim lane: acquire a Familiar for a map WITHOUT the live
   * Stripe ceremony (mode "dev_hatched" — the honest free path; see
   * chora-consumption familiar_acquire_handler.go). The Instance is minted
   * bound to the map's Goal and born hatched (stage 1). Like `retire`, the
   * response body is intentionally NOT modelled — any 2xx is success (the
   * caller re-fetches / navigates); a non-2xx (409 one-per-learner /
   * map-already-bound, 422 missing goalId) propagates fail-loud so the caller
   * renders the honest conflict rather than a console-only error.
   */
  acquireFamiliar(
    goalId: string,
    opts?: {
      readonly mode?: 'hatched' | 'dev_hatched';
      readonly familiarName?: string;
      readonly species?: string;
    },
  ): Observable<void> {
    const body: Record<string, string> = {
      goalId,
      mode: opts?.mode ?? 'dev_hatched',
    };
    if (opts?.familiarName) body['familiarName'] = opts.familiarName;
    if (opts?.species) body['species'] = opts.species;
    return this.bff
      .post<unknown>('/api/v1/me/familiars/acquire', body)
      .pipe(map(() => undefined));
  }

  // Mock fixtures stripped 2026-05-16 per the no-debts directive.
  // See git history for the prior mockEiraState / mockHatchResponse /
  // mockSourceRevelation / mockGrowthEvents / mockEggCatalog /
  // mockEggOdds / mockCheckout bodies.
}

