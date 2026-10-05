/**
 * Familiar Ritual (Grimoire Rituals v1) model — front-end shapes mirror the
 * chora-consumption ritual handlers + chora-gateway FamiliarBridge contract
 * (CHO-2016 P4, ADR-219 D3/D4).
 *
 * The rituals wire is camelCase END-TO-END and is NOT `{data:T}`-enveloped —
 * FamiliarBridge proxies with `classify` (raw pass-through), unlike the
 * hatch/resonance routes. So the service consumes/sends camelCase directly
 * (mirroring the loadout family), and validates every response with a type
 * guard (fail-loud — no fabricated shapes).
 *
 * A `FamiliarRitual` is a learner-composed, deterministic pipeline of 1..5
 * (⇢8 with the long_weaving craft) equipped-active Skill steps landing in
 * exactly ONE closed sink, unlocked at st4 (structural). Revisions are
 * append-only server-side; the FE only ever reads the current revision's
 * steps and re-publishes a new revision.
 */

// ── Grammar limits (mirror services/chora-consumption/.../familiar/ritual.go —
//    single source of truth is the domain; these are display/validation aids). ─
export const RITUAL_NAME_MAX_LEN = 60;
export const RITUAL_STEP_CAP_BASE = 5; // innate at st4
export const RITUAL_STEP_CAP_LONG_WEAVING = 8; // craft long_weaving lifts 5→8
export const RITUAL_ENABLED_QUOTA_BASE = 2; // craft twin_rituals lifts 2→4
/** Rituals unlock at growth stage 4 (structural) — mirrors RitualUnlockStage. */
export const RITUAL_UNLOCK_STAGE = 4;

// ── Composed price (N8), mirroring ComposePriceUnits (`ritual.go:39-42,359-373`).
//    Base plus a per-STEP uplift for each premium Skill; standard and autonomy
//    add nothing. Frozen into publishedPriceUnits at publish and charged flat
//    per run, which is why the learner has to see it BEFORE they freeze it. ──
export const RITUAL_BASE_PRICE_UNITS = 20;
export const RITUAL_GENERATIVE_UPLIFT_UNITS = 15;
export const RITUAL_EGRESS_UPLIFT_UNITS = 40;

/** Per-class uplift. A class absent from this map is UNKNOWN, never free. */
const RITUAL_UPLIFT_BY_CLASS: Readonly<Record<string, number>> = {
  standard: 0,
  autonomy: 0,
  generative: RITUAL_GENERATIVE_UPLIFT_UNITS,
  external_egress: RITUAL_EGRESS_UPLIFT_UNITS,
};

/**
 * What ONE step adds to the price, or undefined when its class is unknown.
 *
 * ⚠ 0 and undefined must never collapse. "Included in the base" and "I cannot
 * tell you" are different answers, and a card that renders the second as the
 * first tells the learner a premium step is free.
 */
export function ritualStepUplift(
  policyClass: string | undefined,
): number | undefined {
  return policyClass ? RITUAL_UPLIFT_BY_CLASS[policyClass] : undefined;
}

/**
 * What a draft costs, or why it cannot be said.
 *
 * `unpriceable` is a first-class answer rather than a null or a zero: the
 * learner is about to freeze this number, so "I cannot total this" and "this
 * costs 20" must never render as the same thing.
 */
export type RitualPriceEstimate =
  | { readonly kind: 'priced'; readonly units: number }
  | { readonly kind: 'unpriceable'; readonly skillKeys: readonly string[] };

/**
 * Compose the publish price for a draft.
 *
 * ⚠ A step whose policy class is unknown makes the whole set unpriceable, and
 * the estimate says so instead of totalling the rest. An unknown class is NOT a
 * standard one: standard adds nothing, so treating unknown as standard
 * understates what the learner is about to freeze, in the one direction that
 * costs them mana. The server takes the same position and errors rather than
 * guessing. This is also the arrival path for a policy class the server gains
 * and this mirror has not learned yet, which is exactly when a silent
 * fall-through would be worst.
 */
export function composeRitualPrice(
  steps: readonly { readonly skillKey: string }[],
  policyClassOf: (skillKey: string) => string | undefined,
): RitualPriceEstimate {
  const unknown: string[] = [];
  let units = RITUAL_BASE_PRICE_UNITS;
  for (const step of steps) {
    const cls = policyClassOf(step.skillKey);
    const uplift = cls ? RITUAL_UPLIFT_BY_CLASS[cls] : undefined;
    if (uplift === undefined) {
      unknown.push(step.skillKey);
      continue;
    }
    units += uplift;
  }
  return unknown.length > 0
    ? { kind: 'unpriceable', skillKeys: unknown }
    : { kind: 'priced', units };
}

/**
 * How a Ritual fires. `manual`/`on_map_open`/`on_dose_completed` are the
 * v1-runnable triggers; `schedule`/`on_event` are schema-carried for P6
 * autonomy (the BE refuses to publish/run them in v1) and are modelled here
 * only so a P6 row never crashes display.
 */
export type RitualTrigger =
  | 'manual'
  | 'on_map_open'
  | 'on_dose_completed'
  | 'schedule'
  | 'on_event';

/** The triggers a learner may pick when creating a Ritual in v1. */
export const V1_RITUAL_TRIGGERS: readonly RitualTrigger[] = [
  'manual',
  'on_map_open',
  'on_dose_completed',
];

/** The closed sink list (ADR-218 D9) a Ritual's output may land in. */
export type RitualSink =
  | 'chat'
  | 'memory_note'
  | 'suggestion_inbox'
  | 'question_bank'
  | 'notification'
  | 'calendar_artifact';

export const RITUAL_SINKS: readonly RitualSink[] = [
  'chat',
  'memory_note',
  'suggestion_inbox',
  'question_bank',
  'notification',
  'calendar_artifact',
];

/** One equipped-active Skill invocation with bounded params. */
export interface RitualStep {
  readonly skillKey: string;
  /** Bounded per-step params (Skill-spec §2 shape); omitted ⇒ defaults. */
  readonly params?: Readonly<Record<string, unknown>>;
}

/** The designer aggregate as projected on the wire (`ritualDTO`). */
export interface Ritual {
  readonly ritualId: string;
  readonly familiarId: string;
  readonly name: string;
  readonly trigger: RitualTrigger;
  readonly sink: RitualSink;
  readonly enabled: boolean;
  /** Composed-flat price frozen at publish, charged flat per run. */
  readonly publishedPriceUnits: number;
  /** 0 until first publish; otherwise the latest revision number. */
  readonly currentRevision: number;
  readonly steps: readonly RitualStep[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** One step's plain-language line inside a run story (learner-safe). */
export interface RitualRunStepStory {
  readonly title: string;
  readonly summary: string;
  readonly sources?: readonly string[];
}

/** The learner-facing "what I did and why" projection of a run (ADR-215). */
export interface RitualRunStory {
  readonly title: string;
  readonly status: string;
  readonly steps: readonly RitualRunStepStory[];
  readonly manaCost: number;
}

/** A decision-stamped run record (`ritualRunDTO`). */
export interface RitualRun {
  readonly runId: string;
  readonly ritualId: string;
  readonly revisionNo: number;
  readonly status: string;
  readonly manaCharged: number;
  readonly sinkRef?: string;
  readonly error?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly story?: RitualRunStory;
}

/**
 * The one NON-terminal run status. POST /run acks 202 with a run in this state
 * and the steps finish server-side (~30s — well past the gateway's 5s route
 * budget, which is exactly why the run is async: a synchronous run was 504'd at
 * the edge and surfaced a false "Something went wrong" — CHO-2145).
 */
export const RUN_STATUS_RUNNING = 'running';

/**
 * True once a run has settled (`completed` / `failed` / `blocked` /
 * `skipped_budget`) — i.e. the caller should stop polling and render it.
 *
 * Deliberately "anything that is not `running`": an unknown status from a newer
 * server must STOP the poll, never spin forever on a state this client does not
 * understand.
 */
export function isRunTerminal(status: string): boolean {
  return status !== RUN_STATUS_RUNNING;
}

// ── Request bodies (camelCase — pass-through, no snake translation). ──────────

export interface CreateRitualRequest {
  readonly name: string;
  readonly trigger: RitualTrigger;
  readonly sink: RitualSink;
}

export interface PublishRitualRequest {
  readonly steps: readonly RitualStep[];
  /** Model Armor verdict token from a prior screen, when the step params carry
   *  learner free-text; omitted when there is nothing to screen. */
  readonly armorVerdict?: string;
}

export interface RunRitualRequest {
  /** Attribution for a manual run; defaults to "manual" server-side. */
  readonly triggerSource?: string;
}

// ── Wire list envelopes (raw, camelCase). ────────────────────────────────────

export interface ListRitualsResponse {
  readonly rituals: readonly Ritual[];
  /**
   * The sinks THIS deployment can write, served by the server (B3b).
   *
   * Replaces a client-side constant that could drift from the deployment. The
   * server owns the registry the publish gate reads, so there is one source of
   * truth and the composer greys from the same answer that would 422 it.
   *
   * Optional on the type so an older server does not read as malformed. Absent
   * resolves to NOTHING wired via `wiredSinksOf`, which greys every sink, and
   * is reported separately from a served empty list so the two get different
   * learner-facing words (see `RitualListing.sinksReported`).
   */
  readonly wiredSinks?: readonly RitualSink[];
}

export interface ListRitualRunsResponse {
  readonly runs: readonly RitualRun[];
}

// ── Type guards (FE-law: guard every API response; fail-loud on malformed). ──

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function isRitualStep(x: unknown): x is RitualStep {
  return isRecord(x) && typeof x['skillKey'] === 'string';
}

export function isRitual(x: unknown): x is Ritual {
  if (!isRecord(x)) return false;
  return (
    typeof x['ritualId'] === 'string' &&
    typeof x['familiarId'] === 'string' &&
    typeof x['name'] === 'string' &&
    typeof x['trigger'] === 'string' &&
    typeof x['sink'] === 'string' &&
    typeof x['enabled'] === 'boolean' &&
    typeof x['publishedPriceUnits'] === 'number' &&
    typeof x['currentRevision'] === 'number' &&
    Array.isArray(x['steps']) &&
    x['steps'].every(isRitualStep)
  );
}

export function isRitualRun(x: unknown): x is RitualRun {
  if (!isRecord(x)) return false;
  return (
    typeof x['runId'] === 'string' &&
    typeof x['ritualId'] === 'string' &&
    typeof x['revisionNo'] === 'number' &&
    typeof x['status'] === 'string' &&
    typeof x['manaCharged'] === 'number' &&
    typeof x['startedAt'] === 'string'
  );
}

/**
 * The wired sinks in a list response, normalised.
 *
 * Fail-closed and closed-list-filtered: an absent, null or non-array value
 * yields none, and a value the server sends that is not an ADR-218 D9 sink is
 * dropped, because the server is the authority on which sinks are WIRED, never
 * on what a sink IS.
 */
/**
 * What a list read gives the composer: the rituals AND what this deployment can
 * write. One fetch, one source of truth for the sink picker.
 */
export interface RitualListing {
  readonly rituals: readonly Ritual[];
  readonly wiredSinks: readonly RitualSink[];
  /**
   * Whether the server ANSWERED the wired-sink question at all.
   *
   * Both `false` and an empty `wiredSinks` grey every sink, but they are
   * different facts and the learner is owed different words: "the server did
   * not report which sinks are ready" is a transient contract skew, "no sink is
   * wired on this instance yet" is a settled state of the deployment.
   *
   * This is ADR-252 D6's principle applied to a drafting surface: distinguish
   * by the MESSAGE, never by an empty result. D6 itself rules the other way on
   * the allow/deny axis, because there an absent row refusing every turn would
   * be an outage; here the only cost of refusing is that a learner cannot
   * publish during a window that ships closed, and publish would 422 anyway.
   */
  readonly sinksReported: boolean;
}

/** What `wiredSinksOf` learned from a list response. */
export interface WiredSinkReport {
  readonly sinks: readonly RitualSink[];
  readonly reported: boolean;
}

export function wiredSinksOf(raw: unknown): WiredSinkReport {
  if (!isRecord(raw)) return { sinks: [], reported: false };
  const v = raw['wiredSinks'];
  if (!Array.isArray(v)) return { sinks: [], reported: false };
  // The server ANSWERED. A list that filters down to nothing still counts as
  // reported: it named values, they were simply outside the closed list.
  return {
    sinks: v.filter((s): s is RitualSink =>
      (RITUAL_SINKS as readonly string[]).includes(s as string),
    ),
    reported: true,
  };
}

export function isListRitualsResponse(x: unknown): x is ListRitualsResponse {
  return isRecord(x) && Array.isArray(x['rituals']) && x['rituals'].every(isRitual);
}

export function isListRitualRunsResponse(
  x: unknown,
): x is ListRitualRunsResponse {
  return isRecord(x) && Array.isArray(x['runs']) && x['runs'].every(isRitualRun);
}

/**
 * Effective step ceiling for a familiar's craft state (5, or 8 with
 * long_weaving). Mirrors RitualCapabilityContext.StepCap — the FE uses it to
 * cap the composer's "add step" affordance before the server does.
 */
export function ritualStepCap(hasLongWeaving: boolean): number {
  return hasLongWeaving ? RITUAL_STEP_CAP_LONG_WEAVING : RITUAL_STEP_CAP_BASE;
}
