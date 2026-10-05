/**
 * GovernanceService — canonical signal-based reader for the O+ surface.
 *
 * Polls the 5 O+ BFF endpoints exposed by `chora-gateway` (Phase C of the
 * atomic-napping-spring plan) every 30 seconds and exposes the data as
 * Angular Signals with a discriminated-union state per [[coding-angular]]
 * and the plan's anchoring-decision #4 + #5.
 *
 * BFF surface (Phase C contract, replaces the FakeUpstream JSON):
 *   GET /bff/oplus/dashboard   — IMDA D1-D4 posture + safety risks
 *   GET /bff/oplus/dimensions  — per-dimension rubric drilldown
 *   GET /bff/oplus/agents      — crews + agents hierarchy (NOT 7-agent flat)
 *   GET /bff/oplus/governance  — 3 tabs (decisions / hitl / data + lineage)
 *   GET /bff/oplus/a2a         — A2A console data (or pending-banner mode)
 *
 * Selective deep-link policy (plan anchor #2):
 * The BFF response carries a pre-formatted Cloud Trace URL as an opaque
 * string. The component renders it as a "View in Cloud Trace ↗" anchor —
 * O+ never renders raw spans internally. (The Vertex AI Agent Engine
 * deep-link was removed — decommissioned per ADR-169.)
 *
 * HTTP error classification:
 *   - 401  → state:'error' (will redirect to login via interceptor)
 *   - 403  → state:'error' with "auditor role required" message
 *   - 5xx  → state:'stale' if a prior successful response is cached,
 *            else state:'error'
 *   - net  → state:'error'
 *
 * BFF base URL comes from `environment.bffBaseUrl` (per
 * [[secrets-and-env]] — no inline URL in source).
 */
import { DestroyRef, Injectable, Injector, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  BehaviorSubject,
  Observable,
  catchError,
  combineLatest,
  interval,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';

import { BffClientService } from './bff-client.service';

// ─── Discriminated state union ────────────────────────────────────────

/** Polling cadence — anchor #4 of the plan. 30s window matches the
 *  IMDA dashboard refresh expectation in Phase E step 5. */
export const GOVERNANCE_POLL_INTERVAL_MS = 30_000;

/** Per-route async state with stale-while-error semantics. */
export type GovernanceState<T> =
  | { state: 'loading' }
  | { state: 'live'; data: T; fetchedAt: Date }
  | { state: 'stale'; data: T; since: Date }
  | { state: 'error'; error: GovernanceError };

/** Error envelope — distinct kinds map to distinct UX outcomes. */
export interface GovernanceError {
  /** Coarse classification for component branching. */
  readonly kind: 'unauthorized' | 'forbidden' | 'server' | 'network' | 'unknown';
  /** Translation key for user-facing copy. */
  readonly messageKey: string;
  /** HTTP status if known. */
  readonly status?: number;
}

// ─── BFF response shapes (Phase C contracts) ──────────────────────────
//
// Shapes follow the plan §"Architecture sketch" deep-link wiring + §B5
// crews+agents hierarchy. If chora-gateway lands a slightly different
// shape, only the `*Response` types below need to change — the rest of
// the O+ frontend consumes via these types.

export type ImdaDimensionLabel =
  | 'accountability'
  | 'transparency'
  | 'safety_and_robustness'
  | 'fairness_and_human_oversight';

export type RubricStatus = 'pass' | 'partial' | 'fail';
export type DimensionStatus = 'achieved' | 'partial' | 'attention' | 'pending';
/**
 * Per-item remediation priority driving the dimensions traffic-light + badge:
 * P1 (critical — a single FAIL turns the dimension RED), P2 (≥2 FAILs → AMBER),
 * P3 (never affects the signal). Empty/undefined for legacy/unscored items.
 */
export type RubricPriority = 'P1' | 'P2' | 'P3';
export type AutonomyLevel = 'HOOTL' | 'HOTL' | 'HITL-L0' | 'HITL-L1' | 'HITL-L2';

/** /bff/oplus/dashboard — IMDA posture + safety summary. */
export interface DashboardData {
  readonly fetched_at: string;
  readonly posture: readonly {
    readonly num: 1 | 2 | 3 | 4;
    readonly label: ImdaDimensionLabel;
    readonly score: number;
    readonly status: DimensionStatus;
  }[];
  readonly all_baseline_achieved: boolean;
  /** Optional summary chip data (recent decisions / cost rollup). */
  readonly recent_decisions_24h?: number;
}

/** /bff/oplus/dimensions — per-dimension rubric items with deep-links. */
export interface DimensionsData {
  readonly fetched_at: string;
  readonly dimensions: readonly {
    readonly num: 1 | 2 | 3 | 4;
    readonly label: ImdaDimensionLabel;
    readonly score: number;
    readonly status: DimensionStatus;
    readonly rubric_items: readonly {
      readonly ref: string;
      readonly requirement: string;
      readonly tool_coverage: string;
      readonly tools: readonly string[];
      readonly status: RubricStatus;
      /** Per-rubric evidence URL — drives "View evidence ↗". */
      readonly evidence_source_url: string | null;
      /** Remediation priority (P1/P2/P3) — badge + traffic-light driver. */
      readonly priority?: RubricPriority;
    }[];
  }[];
}

/** /bff/oplus/agents — crews + agents hierarchy (plan §B5). */
export interface AgentsData {
  readonly fetched_at: string;
  readonly crews: readonly AgentsCrew[];
}

export interface AgentsCrew {
  readonly crew_name: string;
  readonly crew_id: string;
  /** Display label (translation key, falls back to crew_name). */
  readonly crew_label?: string;
  /** Whether the crew has produced any traffic in the 24h window. */
  readonly has_recent_activity: boolean;
  readonly agents: readonly AgentsAgent[];
}

export interface AgentsAgent {
  readonly agent_id: string;
  readonly role: string;
  readonly engine_id: string | null;
  /**
   * Pre-formatted Cloud Trace deep-link — the agent's actual latest trace
   * (`?tid=`) when it has recent activity, else a per-agent `chora.agent_id`
   * label filter. Never duplicate Cloud Trace UI in O+.
   * (The Vertex AI Agent Engine deep-link was removed — decommissioned per
   * ADR-169.)
   */
  readonly cloud_trace_template_url: string | null;
  readonly stats: AgentsAgentStats;
}

export interface AgentsAgentStats {
  /** Invocation count over the aggregation window (default ~90d / last quarter). */
  readonly invocations_24h: number | null;
  readonly p95_latency_ms: number | null;
  readonly refusal_rate: number | null;
}

/** /bff/oplus/governance — 3 tabs of governance data. */
export interface GovernanceData {
  readonly fetched_at: string;
  readonly decisions: readonly GovernanceDecision[];
  readonly hitl_pending: readonly GovernanceHitlItem[];
  readonly data_lineage: readonly GovernanceLineageEntry[];
  /** Data-currency window (in days) the Decision Traces are drawn from — the
   *  BFF's canonical window, surfaced so O+ can tell auditors how recent the
   *  evidence is ("last N days · as of <fetched_at>"). */
  readonly window_days?: number;
}

export interface GovernanceDecision {
  readonly id: string;
  readonly workflow_id: string;
  readonly agent: string;
  readonly agent_slug: string;
  /** Agent quality-gate verdict (accepted | rejected | refused | …) — the
   *  human-meaningful value the FE "Decision" column renders. */
  readonly decision_type: string;
  readonly model: string;
  readonly timestamp: string;
  /** OTLP trace_id — drives "View in Cloud Trace ↗". */
  readonly trace_id: string | null;
  /** Pre-formatted trace-console URL (if BFF chose to template it). */
  readonly cloud_trace_url?: string | null;
  /**
   * The agent's OWN rationale for this decision (= qgen critic_notes) — the
   * IMDA D2 "why" the row-click reasoning panel renders. Absent/empty when the
   * decision row carried no reasoning.
   */
  readonly reasoning_summary?: string | null;
  /** PII-safe citation of the reviewed content (sha256 hex). */
  readonly input_hash?: string | null;
  readonly output_hash?: string | null;
  /**
   * The prompt-shaping discriminants that produced this decision — a flat
   * key→value map of the conditions the orchestrator fed the agent (IMDA D2
   * explainability). Absent/empty for non-orchestrator crews or legacy rows;
   * the panel renders nothing when it is missing.
   */
  readonly prompt_conditions?: Record<string, string> | null;
}

export interface GovernanceHitlItem {
  readonly id: string;
  readonly workflow_id: string;
  readonly gate: 'question_review' | 'report_review' | 'material_decision';
  readonly agent: string;
  readonly summary: string;
  readonly autonomy_level: AutonomyLevel;
  readonly waiting_since: string;
  /**
   * Reviewer GCID currently responsible for the gate.
   *
   * `null` = unassigned (default at creation; sits in the shared queue
   * until a reviewer claims via the deferred-to-wave-N+1 claim endpoint).
   * The template renders `null` as the localised "unassigned" string.
   *
   * Distinct from `operator_gcid` (post-verdict "who decided" provenance).
   * Per the BFF schema reconciliation: `null` is the honest unassigned
   * semantic; the BFF never substitutes a synthetic placeholder.
   */
  readonly assignee: string | null;
}

export interface GovernanceLineageEntry {
  readonly domain: string;
  readonly db: string;
  readonly table: string;
  readonly retention: string;
  readonly classification: 'Audit' | 'Knowledge' | 'PII' | 'Operational';
  readonly pii_closure_map: boolean;
}

/**
 * /bff/oplus/costs — token + LLM cost rollups (TokenUsageLedger-derived).
 *
 * The BFF returns this object directly with HTTP 200 (NOT a state
 * envelope); the FE derives live/stale/error from the HTTP status exactly
 * like every other O+ route via `buildPolled` + `classifyError`.
 */
export interface CostData {
  /** RFC3339 timestamp of the upstream rollup. */
  readonly fetched_at: string;
  /** Cumulative spend across the reporting window, in USD. */
  readonly cumulative_cost_usd: number;
  /** Spend + token rollup grouped by model id. */
  readonly by_model: readonly CostBucket[];
  /** Spend + token rollup grouped by agent id. */
  readonly by_agent: readonly CostBucket[];
  /**
   * Presentation currency code (e.g. `USD`, `SGD`). The `*_usd` amounts above
   * are ALWAYS canonical USD; the FE multiplies them by `fx_rate` and renders
   * this currency. Optional — absent ⇒ treat as `USD` @ rate 1 (no conversion).
   */
  readonly currency?: string;
  /** Static display-units-per-USD rate. Absent ⇒ 1 (no conversion). */
  readonly fx_rate?: number;
}

export interface CostBucket {
  /** Group key — the model id (by_model) or agent id (by_agent). */
  readonly key: string;
  readonly cost_usd: number;
  readonly prompt_tokens: number;
  readonly completion_tokens: number;
}

/**
 * Cost time-window filter token. `all` == all-time (no window) and is the
 * default; `day`/`week`/`month` map to rolling 24h / 7d / 30d windows the BFF
 * computes server-side off its own clock. Sent as `?range=<x>` (omitted for
 * `all` so the default URL stays `/bff/oplus/costs`).
 */
export type CostRange = 'day' | 'week' | 'month' | 'all';

// ─── /bff/oplus/eval-runs — Agent-Eval evidence drill-down (IMDA D2) ──────
//
// Crew-run index (polled) + per-row evidence drill-down (on-demand). A CREW
// RUN is keyed by `candidate_label` (shared by all members of one gate run);
// a MEMBER is the `experiment` (e.g. chora-agent-eval-qgen-question). Backs
// the O+ Agent-Eval view — IMDA D2 (transparency) evidence over the agent
// CI/CD eval gate (ADR-169 / CHO-1674).

/** Polled crew-run index from /bff/oplus/eval-runs. */
export interface AgentEvalData {
  readonly fetched_at: string;
  readonly runs: readonly EvalCrewRun[];
}

export interface EvalCrewRun {
  /** Crew-run key shared by all members (e.g. depbump0607). */
  readonly candidate_label: string;
  readonly last_recorded_at: string;
  /** BigQuery console deep-link to the agent_eval_rows table (Preview works;
   *  the view has none). Per-run filtering isn't possible in a console URL —
   *  the per-run evidence is the in-app drill-down. */
  readonly bigquery_url: string | null;
  readonly members: readonly EvalMember[];
}

export interface EvalMember {
  /** Member identity (e.g. chora-agent-eval-qgen-question). */
  readonly experiment: string;
  /** Short display label (e.g. qgen-question). */
  readonly member_label: string;
  /** Vertex AI Experiments console deep-link for this member's run trend. */
  readonly vertex_experiment_url: string | null;
  readonly autorater_metrics: readonly EvalMetric[];
  /** null when the run produced no adversarial rows for this member. */
  readonly adversarial: EvalAdversarial | null;
}

export interface EvalMetric {
  /** safety | instruction_following | … (scores are per-metric, not blended). */
  readonly metric: string;
  readonly count: number;
  readonly avg_score: number;
}

export interface EvalAdversarial {
  readonly total: number;
  readonly blocked: number;
  readonly leaked: number;
}

/** On-demand per-row evidence for one crew run (/bff/oplus/eval-runs/{label}). */
export interface EvalEvidenceData {
  readonly fetched_at?: string;
  readonly candidate_label: string;
  readonly rows: readonly EvalEvidenceRow[];
}

export interface EvalEvidenceRow {
  readonly experiment: string;
  readonly kind: 'autorater' | 'adversarial';
  readonly case_id: string;
  readonly row_index: number;
  readonly metric: string;
  readonly score: number;
  /** Only present for kind === 'adversarial': BLOCKED(pass) | LEAKED(fail). */
  readonly adversarial_verdict?: string;
  readonly explanation: string;
  readonly prompt: string;
  readonly response: string;
  readonly reference?: string;
  readonly recorded_at: string;
}

// ─── /bff/oplus/prompts: ADR-197 prompt-versioning read slice (CHO-2364) ───
//
// Per-agent prompt-version evidence, aggregated by the BFF. Two evidence
// kinds discriminate the union: `decisions` rows aggregate the prompt stamps
// on `chora_observability.agent_decision_log`; the `familiar` row aggregates
// Routine run ritual stamps. The wire always carries all five in-scope
// agents (qgen_question, qgen_critic, oe_evaluator, oe_moderator, familiar);
// `latest_*`/`last_*` keys are OMITTED (not null) when an agent or use-case
// lane has no evidence yet, so the FE renders the designed empty state and
// never fabricates a version.

/** One /bff/oplus/prompts row, discriminated on `evidence_kind`. */
export type PromptAgent = PromptDecisionAgent | PromptRitualAgent;

/** Prompt evidence sourced from agent decision-log stamps. */
export interface PromptDecisionAgent {
  readonly agent_id: string;
  readonly crew_name: string;
  readonly evidence_kind: 'decisions';
  readonly decisions_total: number;
  /** Omitted when the agent has no decision evidence yet. */
  readonly last_decision_at?: string;
  readonly latest_prompt_version?: string;
  readonly latest_prompt_source?: string;
  readonly versions: readonly PromptDecisionVersion[];
  /** Present only for the qgen agents (3 fixed use-case lanes). */
  readonly use_cases?: readonly PromptUseCase[];
}

export interface PromptDecisionVersion {
  readonly prompt_version: string;
  readonly prompt_source: string;
  readonly decisions: number;
  readonly last_seen: string;
}

/** Per use-case lane rollup (ai_assist_single / batch / daily_dose). */
export interface PromptUseCase {
  readonly key: string;
  readonly decisions: number;
  /** Omitted when the lane has no evidence yet (decisions === 0). */
  readonly last_seen?: string;
  readonly latest_prompt_version?: string;
  readonly latest_prompt_source?: string;
}

/** Prompt evidence sourced from Familiar Routine run ritual stamps. */
export interface PromptRitualAgent {
  readonly agent_id: string;
  readonly crew_name: string;
  readonly evidence_kind: 'ritual_stamps';
  readonly runs_total: number;
  /** Omitted when no Routine run has stamped a prompt version yet. */
  readonly last_run_at?: string;
  readonly versions: readonly PromptRitualVersion[];
}

export interface PromptRitualVersion {
  readonly prompt_version: string;
  readonly runs: number;
  readonly last_seen: string;
}

/** GET /bff/oplus/prompts response body. */
export interface PromptsData {
  readonly agents: readonly PromptAgent[];
}

// ─── /bff/oplus/prompts/{agent_id}/versions: prompt CONTENT catalogue ───
//
// CHO-2368 (ADR-197 M-D read slice). Unlike the evidence rows above (what
// versions have RUN), the catalogue serves what each version SAYS: the
// registry's seeded v1 baselines + gated override plans, segment bodies
// included. The BFF wraps the orchestrator payload verbatim under
// `registry` in the O+ envelope; nullable metadata rides as null (not
// omitted) per the orchestrator's pydantic serialization.

/** One catalogue version row of an agent (baseline or gated override). */
export interface PromptCatalogueVersion {
  readonly version: string;
  readonly kind: 'baseline' | 'override';
  readonly status: string; // draft|pending_eval|pending_hitl|active|rejected|archived
  readonly plan_code: string;
  readonly created_at: string;
  readonly activated_at: string | null;
  readonly approved_by: string | null;
  readonly eval_run_id: string | null;
}

/** GET /bff/oplus/prompts/{agent_id}/versions → registry payload. */
export interface PromptCatalogueList {
  readonly agent_id: string;
  readonly versions: readonly PromptCatalogueVersion[];
  readonly total: number;
}

/** One segment of a catalogue version, in composition order. */
export interface PromptCatalogueSegment {
  readonly segment_id: string;
  readonly body: string;
  /** Display-only segments (output contracts, safety preambles, fences). */
  readonly locked: boolean;
  readonly position: number;
  readonly content_hash: string | null;
  readonly note: string;
}

/** GET /bff/oplus/prompts/{agent_id}/versions/{version} → registry payload. */
export interface PromptCatalogueDetail extends PromptCatalogueVersion {
  readonly agent_id: string;
  readonly segments: readonly PromptCatalogueSegment[];
}

/** The gateway's O+ envelope around a catalogue payload. */
interface PromptCatalogueEnvelope<T> {
  readonly state: 'live' | 'stale' | 'error' | 'pending';
  readonly error?: string;
  readonly registry?: T;
}

/** /bff/oplus/a2a — pending or live (plan §B6/B7 + §D6). */
export type A2aData = A2aDataLive | A2aDataPending;

export interface A2aDataLive {
  readonly mode: 'live';
  readonly fetched_at: string;
  readonly contracts: readonly A2aContract[];
  readonly external_agents: readonly A2aExternalAgent[];
  readonly invocations: readonly A2aInvocation[];
}

export interface A2aDataPending {
  readonly mode: 'pending';
  readonly fetched_at: string;
  /** Mock payload kept for visual continuity; UI shows a banner over it. */
  readonly contracts: readonly A2aContract[];
  readonly external_agents: readonly A2aExternalAgent[];
  readonly invocations: readonly A2aInvocation[];
}

export interface A2aContract {
  readonly id: string;
  readonly partner: string;
  readonly agid: string;
  readonly scope: readonly string[];
  readonly status: 'active' | 'paused' | 'pending' | 'revoked';
  readonly last_invocation: string | null;
  readonly invocations_30d: number;
  readonly created_at: string;
}

export interface A2aExternalAgent {
  readonly agid: string;
  readonly partner: string;
  readonly trust_level: 'verified' | 'pilot' | 'experimental';
  readonly key_fingerprint: string;
  readonly rotated_at: string;
}

export interface A2aInvocation {
  readonly id: string;
  readonly contract_id: string;
  readonly agid: string;
  readonly partner: string;
  readonly endpoint: string;
  readonly status: 'success' | 'denied' | 'error';
  readonly latency_ms: number;
  readonly timestamp: string;
}

// ─── Service ──────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class GovernanceService {
  private readonly bff = inject(BffClientService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  // Cached "last good payload" per route. Used for the `stale` branch on
  // 5xx so the UI never blanks out a previously-loaded view.
  private readonly _dashboardCache = signal<DashboardData | null>(null);
  private readonly _dimensionsCache = signal<DimensionsData | null>(null);
  private readonly _agentsCache = signal<AgentsData | null>(null);
  private readonly _governanceCache = signal<GovernanceData | null>(null);
  private readonly _a2aCache = signal<A2aData | null>(null);
  private readonly _costsCache = signal<CostData | null>(null);
  private readonly _agentEvalCache = signal<AgentEvalData | null>(null);
  private readonly _promptsCache = signal<PromptsData | null>(null);

  // Manual re-poll trigger for the prompts route: the error-state retry CTA
  // calls `retryPrompts()` so the auditor never has to wait out the 30s tick.
  private readonly _promptsRetry$ = new BehaviorSubject<void>(undefined);

  // Cost time-window filter. Driven by a BehaviorSubject (not a signal) so it
  // emits synchronously on subscribe — the costs() polled stream combines it
  // with the interval, and a `setCostRange` re-emits to re-poll immediately.
  private readonly _costRange$ = new BehaviorSubject<CostRange>('all');
  private _costRangeSig?: Signal<CostRange>;

  // Polled signals — created lazily on first read so we don't burn a
  // 30s timer on routes the user never visits.
  private _dashboard?: Signal<GovernanceState<DashboardData>>;
  private _dimensions?: Signal<GovernanceState<DimensionsData>>;
  private _agents?: Signal<GovernanceState<AgentsData>>;
  private _governance?: Signal<GovernanceState<GovernanceData>>;
  private _a2a?: Signal<GovernanceState<A2aData>>;
  private _costs?: Signal<GovernanceState<CostData>>;
  private _agentEval?: Signal<GovernanceState<AgentEvalData>>;
  private _prompts?: Signal<GovernanceState<PromptsData>>;

  // ─── Public API ─────────────────────────────────────────────────────

  /** Polled IMDA posture + safety summary. */
  dashboard(): Signal<GovernanceState<DashboardData>> {
    if (this._dashboard === undefined) {
      this._dashboard = this.buildPolled<DashboardData>(
        '/bff/oplus/dashboard',
        this._dashboardCache,
      );
    }
    return this._dashboard;
  }

  /** Polled per-dimension rubric drilldown. */
  dimensions(): Signal<GovernanceState<DimensionsData>> {
    if (this._dimensions === undefined) {
      this._dimensions = this.buildPolled<DimensionsData>(
        '/bff/oplus/dimensions',
        this._dimensionsCache,
      );
    }
    return this._dimensions;
  }

  /** Polled crews + agents hierarchy. */
  agents(): Signal<GovernanceState<AgentsData>> {
    if (this._agents === undefined) {
      this._agents = this.buildPolled<AgentsData>(
        '/bff/oplus/agents',
        this._agentsCache,
      );
    }
    return this._agents;
  }

  /** Polled 3-tab governance data. */
  governance(): Signal<GovernanceState<GovernanceData>> {
    if (this._governance === undefined) {
      this._governance = this.buildPolled<GovernanceData>(
        '/bff/oplus/governance',
        this._governanceCache,
      );
    }
    return this._governance;
  }

  /** Polled A2A console data — may be pending-mode if backend not LIVE. */
  a2a(): Signal<GovernanceState<A2aData>> {
    if (this._a2a === undefined) {
      this._a2a = this.buildPolled<A2aData>('/bff/oplus/a2a', this._a2aCache);
    }
    return this._a2a;
  }

  /**
   * Polled token + LLM cost rollups, scoped to the active time-window filter.
   * The path is recomputed per poll from `_costRange$`, and a `setCostRange`
   * re-triggers the stream so the new window is fetched immediately.
   */
  costs(): Signal<GovernanceState<CostData>> {
    if (this._costs === undefined) {
      this._costs = this.buildPolled<CostData>(
        () => {
          const r = this._costRange$.value;
          return r === 'all' ? '/bff/oplus/costs' : `/bff/oplus/costs?range=${r}`;
        },
        this._costsCache,
        this._costRange$,
      );
    }
    return this._costs;
  }

  /** Current cost time-window filter (day / week / month / all). */
  costRange(): Signal<CostRange> {
    if (this._costRangeSig === undefined) {
      this._costRangeSig = toSignal(this._costRange$, {
        injector: this.injector,
        initialValue: 'all' as CostRange,
      });
    }
    return this._costRangeSig;
  }

  /** Switch the cost time-window; triggers an immediate re-poll of costs(). */
  setCostRange(r: CostRange): void {
    this._costRange$.next(r);
  }

  /**
   * Polled prompt-versioning evidence (ADR-197 read slice, CHO-2364).
   * Auditor-gated like the other O+ routes; 403 classifies as `forbidden`.
   */
  prompts(): Signal<GovernanceState<PromptsData>> {
    if (this._prompts === undefined) {
      this._prompts = this.buildPolled<PromptsData>(
        '/bff/oplus/prompts',
        this._promptsCache,
        this._promptsRetry$,
      );
    }
    return this._prompts;
  }

  /** Re-poll the prompts route immediately (error-state retry CTA). */
  retryPrompts(): void {
    this._promptsRetry$.next(undefined);
  }

  /** Polled agent-eval crew-run index (IMDA D2 drill-down). */
  agentEval(): Signal<GovernanceState<AgentEvalData>> {
    if (this._agentEval === undefined) {
      this._agentEval = this.buildPolled<AgentEvalData>(
        '/bff/oplus/eval-runs',
        this._agentEvalCache,
      );
    }
    return this._agentEval;
  }

  /**
   * On-demand per-row evidence drill-down for ONE crew run. Not polled — the
   * component fetches it lazily when a crew run is expanded. The crew-run key
   * is `candidate_label`; it is path-encoded onto /bff/oplus/eval-runs/{label}.
   */
  agentEvalEvidence(candidateLabel: string): Observable<EvalEvidenceData> {
    return this.bff.get<EvalEvidenceData>(
      `/bff/oplus/eval-runs/${encodeURIComponent(candidateLabel)}`,
    );
  }

  /**
   * On-demand catalogue version list for one agent (CHO-2368 modal). Not
   * polled — the prompt modal fetches it lazily on open. A gateway
   * state:error envelope (upstream outage / unconfigured) is surfaced as a
   * thrown error so the modal's error branch renders.
   */
  promptCatalogueVersions(agentId: string): Observable<PromptCatalogueList> {
    return this.bff
      .get<PromptCatalogueEnvelope<PromptCatalogueList>>(
        `/bff/oplus/prompts/${encodeURIComponent(agentId)}/versions`,
      )
      .pipe(map((env) => this.unwrapCatalogue(env)));
  }

  /** On-demand segment content for one agent version (CHO-2368 modal). */
  promptCatalogueVersion(
    agentId: string,
    version: string,
  ): Observable<PromptCatalogueDetail> {
    return this.bff
      .get<PromptCatalogueEnvelope<PromptCatalogueDetail>>(
        `/bff/oplus/prompts/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(version)}`,
      )
      .pipe(map((env) => this.unwrapCatalogue(env)));
  }

  /** Unwrap the O+ envelope; a non-live state throws (modal error branch). */
  private unwrapCatalogue<T>(env: PromptCatalogueEnvelope<T>): T {
    if (env.state !== 'live' || env.registry === undefined) {
      throw new Error(env.error ?? 'prompt catalogue unavailable');
    }
    return env.registry;
  }

  // ─── Internals ──────────────────────────────────────────────────────

  /**
   * Build a polling signal for one BFF route.
   *
   * Pattern: `interval(30s).pipe(startWith(0), switchMap(fetch))` so the
   * first emission is immediate (no 30s blank screen on route entry).
   * `takeUntilDestroyed` ties the subscription lifecycle to the
   * `providedIn:'root'` service instance — when the app shuts down the
   * polling stops.
   */
  private buildPolled<T>(
    path: string | (() => string),
    cache: ReturnType<typeof signal<T | null>>,
    extraTrigger?: Observable<unknown>,
  ): Signal<GovernanceState<T>> {
    const ticks = interval(GOVERNANCE_POLL_INTERVAL_MS).pipe(startWith(0));
    // When an extra trigger is supplied (e.g. the cost-range subject), re-poll
    // on EITHER a tick OR a trigger emission. combineLatest emits synchronously
    // once both sources have a value, preserving the synchronous first fetch.
    const trigger: Observable<unknown> = extraTrigger
      ? combineLatest([ticks, extraTrigger])
      : ticks;
    const stream = trigger.pipe(
      switchMap(() =>
        this.bff.get<T>(typeof path === 'function' ? path() : path).pipe(
          map<T, GovernanceState<T>>((data) => {
            // chora-gateway graceful-degradation: it returns HTTP 200 with
            // an `{state:'error', error}` envelope when an upstream collapses
            // (e.g. a mesh-authz 403 on /api/imda/dimensions/*). Classify by
            // the in-body `state`, not just the HTTP status, so the FE renders
            // the error/stale variant instead of crashing on the absent
            // payload arrays.
            if (isOPlusErrorEnvelope(data)) {
              const cached = cache();
              if (cached !== null) {
                return { state: 'stale', data: cached, since: new Date() };
              }
              return {
                state: 'error',
                error: { kind: 'server', messageKey: 'oplus.errors.upstream' },
              };
            }
            cache.set(data);
            return {
              state: 'live',
              data,
              fetchedAt: new Date(),
            };
          }),
          catchError((err: unknown) =>
            of<GovernanceState<T>>(this.classifyError<T>(err, cache())),
          ),
        ),
      ),
      takeUntilDestroyed(this.destroyRef),
    );
    return toSignal(stream, {
      initialValue: { state: 'loading' },
      injector: this.injector,
    });
  }

  /**
   * Map an HTTP error to a typed GovernanceState. 5xx with a cached
   * payload returns `state:'stale'` so the UI keeps the last-good data
   * visible while the backend recovers.
   */
  private classifyError<T>(
    err: unknown,
    cached: T | null,
  ): GovernanceState<T> {
    const status = this.extractStatus(err);
    if (status === 401) {
      return {
        state: 'error',
        error: {
          kind: 'unauthorized',
          messageKey: 'oplus.errors.unauthorized',
          status: 401,
        },
      };
    }
    if (status === 403) {
      return {
        state: 'error',
        error: {
          kind: 'forbidden',
          messageKey: 'oplus.errors.auditor_required',
          status: 403,
        },
      };
    }
    if (typeof status === 'number' && status >= 500) {
      if (cached !== null) {
        return { state: 'stale', data: cached, since: new Date() };
      }
      return {
        state: 'error',
        error: {
          kind: 'server',
          messageKey: 'oplus.errors.upstream',
          status,
        },
      };
    }
    if (typeof status === 'number') {
      return {
        state: 'error',
        error: {
          kind: 'unknown',
          messageKey: 'oplus.errors.generic',
          status,
        },
      };
    }
    return {
      state: 'error',
      error: {
        kind: 'network',
        messageKey: 'oplus.errors.network',
      },
    };
  }

  private extractStatus(err: unknown): number | undefined {
    if (err !== null && typeof err === 'object' && 'status' in err) {
      const s = (err as { status?: unknown }).status;
      if (typeof s === 'number') return s;
    }
    return undefined;
  }
}

// ─── Helpers exposed for component templates ──────────────────────────

/**
 * Detect the `chora-gateway` graceful-degradation envelope.
 *
 * The BFF returns HTTP 200 with `{state:'error', fetched_at, error}` when
 * an upstream collapses (e.g. a mesh-authz 403 on the IMDA dimensions
 * upstream) — see `services/chora-gateway/.../handlers_oplus.go`
 * `writeOPlusError`. Because the HTTP status is 200, `buildPolled` must
 * classify by the in-body `state`, not the status, or it would treat the
 * error envelope as live data (which carries no payload arrays) and the
 * O+ components would crash iterating the absent fields.
 *
 * NOTE: this triggers ONLY on `state === 'error'`. The a2a route's
 * `{state:'pending', ...}` envelope and the costs route's raw object (no
 * `state` field) are intentionally unaffected.
 */
function isOPlusErrorEnvelope(data: unknown): data is { state: 'error'; error?: string } {
  return (
    data !== null &&
    typeof data === 'object' &&
    'state' in data &&
    (data as { state?: unknown }).state === 'error'
  );
}

/**
 * Pure helper to derive the header badge variant.
 *
 * `live`   → LIVE green pulse
 * `stale`  → STALE amber
 * `error`  → OFFLINE red
 * `loading`→ LOADING grey
 */
export type LiveBadgeVariant = 'live' | 'stale' | 'offline' | 'loading';

export function badgeVariant<T>(state: GovernanceState<T>): LiveBadgeVariant {
  switch (state.state) {
    case 'live':
      return 'live';
    case 'stale':
      return 'stale';
    case 'error':
      return 'offline';
    default:
      return 'loading';
  }
}

/** Type guard for the live branch — narrows `data` for the template. */
export function isLive<T>(
  state: GovernanceState<T>,
): state is { state: 'live'; data: T; fetchedAt: Date } {
  return state.state === 'live';
}

/** Type guard for the stale branch. */
export function isStale<T>(
  state: GovernanceState<T>,
): state is { state: 'stale'; data: T; since: Date } {
  return state.state === 'stale';
}

/** Either live or stale — caller can read `state.data`. */
export function hasData<T>(
  state: GovernanceState<T>,
): state is
  | { state: 'live'; data: T; fetchedAt: Date }
  | { state: 'stale'; data: T; since: Date } {
  return state.state === 'live' || state.state === 'stale';
}

/** computed factory — exposes data | null for templates that branch. */
export function dataOrNull<T>(s: Signal<GovernanceState<T>>): Signal<T | null> {
  return computed(() => {
    const v = s();
    return hasData(v) ? v.data : null;
  });
}
