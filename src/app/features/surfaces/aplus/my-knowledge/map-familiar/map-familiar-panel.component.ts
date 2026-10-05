/**
 * MapFamiliarPanelComponent: the "My Knowledge" Familiar lens (WS-E, epic
 * CHO-2004 / CHO-2005, ADR-212 D5 + ADR-214). The map canvas renders this
 * panel when the Familiar lens is active.
 *
 * Design principle: recommendations ⟺ Familiar. A map with no Familiar bound
 * gets a "Summon a Familiar" flow (pick from the learner's roster, or an honest
 * CTA to the Familiar surface when the roster is empty). Once a Familiar is
 * bound, the panel composes five affordances:
 *   a. bond header + Dismiss (clears the map↔Familiar bond),
 *   b. the re-voiced fog suggestion loop (generate → poll → accept/dismiss),
 *   c. the reused per-Familiar memory panel (RAG-explainability),
 *   d. a Diagnose upload (marked test / notes / scribble → Growth Edges),
 *   e. a Daily Dose CTA.
 *
 * Fail-loud: every mutation toasts; honest loading / error / empty states; no
 * fabricated data. `changed` is emitted after any mutation that changes the map
 * graph OR the Familiar bond (summon / dismiss / accept-suggestion /
 * completed-diagnose); the parent silently refetches the map graph on it.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { fromEvent } from 'rxjs';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../../core/services/translate.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { httpErrorView } from '../../../../../core/interceptors/api-error.model';
import { FamiliarService } from '../../familiar/familiar.service';
import { FamiliarGrowthService } from '../../../../../core/familiar/familiar-growth.service';
import { GoalService } from '../../dashboard/goal/goal.service';
import { ConceptGraphService } from '../../discovery-graph/concept-graph.service';
import { FamiliarMapService } from '../../discovery-graph/familiar-map.service';
import { GoalKnowledgeService } from '../goal-knowledge.service';
import { GrowthEdgesService } from '../../growth-edges/growth-edges.service';
import type { PendingReviewItem } from '../../growth-edges/growth-edges.service';
import { diagnoseStatus } from './diagnose-status';
import type { DiagnoseStatusLabel } from './diagnose-status';
import { PendingReviewStore } from '../../growth-edge-review/pending-review.store';
import type {
  GrowthEdgeUploadJob,
  GrowthEdgeUploadKind,
} from '../../growth-edges/growth-edges.service';
import { FamiliarMapMemoryPanelComponent } from '../../discovery-graph/familiar-map/familiar-map-memory-panel.component';
import type { FamiliarPortrait } from '../../discovery-graph/familiar-map/familiar-map-memory-panel.component';
import { FamiliarLoadoutComponent } from '../../../../../shared/components/familiar-loadout/familiar-loadout.component';
import { ChoraFileDropzoneComponent } from '../../../../../shared/components/chora-file-dropzone/chora-file-dropzone.component';
import type {
  FamiliarGoalKnowledge,
  FamiliarMemoryState,
  GoalReflection,
  GoalReflectionState,
} from '../../discovery-graph/familiar-map.model';
import type {
  ConceptNode,
  ConceptSuggestion,
} from '../../discovery-graph/concept-graph.model';
import { learnerFamiliarName } from '../../../../../core/familiar/familiar-growth.model';
import type { FamiliarSummary } from '../../../../../core/familiar/familiar-growth.model';

/**
 * Map a fog-generate failure to honest copy. The campaign fog reveals only
 * through wins (WS-C7 / ADR-227 D15), so a 409 names WHY the generate was
 * refused — win THIS hex (`CAMPAIGN_NODE_NOT_WON`) or explore from a won focal
 * on a goal map (`CAMPAIGN_MAP_REQUIRES_FOCAL`); anything else keeps the generic
 * retry. Reads the code via the shared `httpErrorView` idiom (never a raw body).
 */
export function generateErrorKey(err: unknown): string {
  const body = httpErrorView(err)?.body;
  const code =
    body !== null && typeof body === 'object'
      ? (body as { code?: unknown }).code
      : undefined;
  if (code === 'CAMPAIGN_NODE_NOT_WON') {
    return 'aplus.knowledge.campaign_gen_node_not_won';
  }
  if (code === 'CAMPAIGN_MAP_REQUIRES_FOCAL') {
    return 'aplus.knowledge.campaign_gen_map_requires_focal';
  }
  return 'aplus.knowledge.familiar_suggest_error';
}

/**
 * Poll the suggestions list every ~2.5s for ~24 tries (~60s) after a generate.
 * The concept-shaped fog is a single LLM call routed through the model gateway;
 * a busy run can exceed the old 30s ceiling, which left the learner on a false
 * "no suggestions yet" empty state. Widened + a graceful "still working" timeout
 * (see suggestSlow) so a slow run reads as pending, never as failure.
 */
const SUGGESTION_POLL_INTERVAL_MS = 2500;
const SUGGESTION_POLL_MAX = 24;

/**
 * Poll the diagnose upload every ~3s up to ~100 tries (~5 min ceiling).
 *
 * Real graph-mode multimodal analysis runs ~2 to 4 minutes, and the upload sits
 * QUEUED that entire time (there is no intermediate ANALYZING emit), flipping to
 * AWAITING_REVIEW only at the very end. The old ~2 min ceiling (40 x 3s) gave up
 * mid-analysis and reported the false "Couldn't finish" over a run the backend
 * then completed successfully, so the ceiling is widened to comfortably clear
 * real latency. A transient poll error (e.g. an edge 504) is NOT a verdict
 * either: it counts as one more pending tick, so a single blip never aborts the
 * diagnosis. Only a definitive FAILED status, or the full ceiling, fails it.
 *
 * Exported for the spec, which loops exactly the ceiling to prove the widened
 * bound (a hard-coded copy would drift the moment the ceiling moves).
 */
export const UPLOAD_POLL_INTERVAL_MS = 3000;
export const UPLOAD_POLL_MAX = 100;

/**
 * After this many pending ticks (~30s at the interval above) the wait counts as
 * a long one, so a calm "this can take a couple of minutes" reassurance surfaces
 * under the working line rather than leaving the learner on a silent page.
 */
export const UPLOAD_SLOW_AFTER = 10;

/**
 * Client-side guards for the Diagnose upload. These MIRROR the diagnose door
 * (growth_edge_uploads_handler.go `allowedUploadMIME` + storage.
 * MaxWeaknessBlobBytes) and deliberately do NOT reuse the batch-authoring
 * dropzone's list: authoring advertises .docx and .webp, which the diagnose
 * door answers with a 415. A picker that accepts what the server refuses is a
 * worse affordance than no picker at all, so keep these in step with the Go
 * allowlist whenever it moves.
 */
const DIAGNOSE_ACCEPT_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.md'] as const;
const DIAGNOSE_MAX_FILE_BYTES = 32 * 1024 * 1024;
/** How long the success flourish stays on screen before settling. */
const DIAGNOSE_CELEBRATE_MS = 2200;

/** Fail-loud state for the summon-time roster fetch. */
type RosterState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly familiars: readonly FamiliarSummary[] }
  | { readonly status: 'error'; readonly error: string };

/**
 * Lifecycle of the Diagnose upload. `empty` is the ADR-238 D6 terminal state: a
 * run that COMPLETED but placed zero growth edges — "processed" is not "found",
 * so it gets its own honest state instead of the bare "growth signals updated".
 */
type UploadPhase =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  // ADR-205 D4 (O2, CHO-2301): the graduated crew parked at its bounded HITL
  // interrupt. This is a TERMINAL phase for this panel: polling stops and the
  // learner is handed off to the review route. It is a SUCCESS awaiting them,
  // so it must never be reported as 'failed'.
  | 'awaiting_review'
  | 'done'
  | 'empty'
  | 'failed';

@Component({
  selector: 'chora-aplus-map-familiar-panel',
  imports: [
    RouterLink,
    TranslatePipe,
    FamiliarMapMemoryPanelComponent,
    FamiliarLoadoutComponent,
    ChoraFileDropzoneComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map-familiar-panel.component.html',
  styleUrl: './map-familiar-panel.component.scss',
})
export class MapFamiliarPanelComponent implements OnDestroy {
  // ── Frozen inputs / output ──────────────────────────────────────────
  /** The map (= a Goal, ADR-214). */
  readonly goalId = input.required<string>();
  /** From the MapGraph read; undefined ⇒ no Familiar bound to this map. */
  readonly attachedFamiliarId = input<string | undefined>(undefined);
  /** Current focal concept id (seeds focal-anchored suggestions); may be ''. */
  readonly focalConceptId = input<string>('');
  /** The map's concepts (used to label edge suggestions by title). */
  readonly concepts = input<readonly ConceptNode[]>([]);
  /**
   * Whether the focal node is WON — the fog reveal unlocks only by winning the
   * node (ADR-227 D2). Gates the Generate affordance so an unwon node shows the
   * "win this hex first" state up front instead of an enabled button that 409s.
   */
  readonly focalWon = input<boolean>(false);
  /**
   * Whether the focal node is the goal's ROOT. The root is the goal (ADR-214 /
   * ADR-227 D14, immutable); its breadth grows by authoring or re-root, never by
   * an LLM win-to-reveal — so the root offers no Generate, only the authoring
   * pointer (owner decision 2026-07-16: root = authoring-only breadth).
   */
  readonly isRoot = input<boolean>(false);
  /**
   * The goal map's ROOT concept id, or '' when unknown (an unrooted graph).
   *
   * Needed to tell a GOAL-LEVEL suggestion from a node one. ADR-238 D4 anchors
   * an unmatched weakness's suggestion at the root purely so it survives the
   * read-time goal fence, so the anchoring IS the signal: there is no marker on
   * the wire saying "this came from a weakness". That reading is safe on a goal
   * map because the Companion never generates fog on the root (`canGenerate`
   * requires a non-root focal), so a root-anchored row is not a fog batch.
   */
  readonly rootConceptId = input<string>('');
  /**
   * Focal-scoped daily-dose params (`{growth_edge_id, concept}`) supplied by the
   * parent map so the Familiar section's Daily-Dose CTA opens the same
   * concept-scoped RAG dose as the map's Practice link. Empty ⇒ generic dose.
   */
  readonly doseQueryParams = input<Record<string, string>>({});
  /**
   * Which slice of the panel to render. The drawer's tabbed redesign mounts the
   * panel three times over (one per tab) — `suggestions`, `familiar` (the bond
   * header + memory + Daily-Dose), and `diagnose`. `all` (the default) shows
   * every block for any caller that wants the whole panel. The summon "no
   * Familiar yet" state always shows regardless of section.
   */
  readonly section = input<'all' | 'suggestions' | 'familiar' | 'diagnose'>(
    'all',
  );
  /** Emitted after a mutation that changes the map graph OR the Familiar bond. */
  readonly changed = output<void>();
  /**
   * Emitted after a Diagnose that placed ≥1 growth edge (ADR-238 D5 auto-reveal):
   * the parent switches to the Growth lens so the newly-lit nodes surface where
   * the marked test's weaknesses actually landed. NOT emitted on an empty run.
   */
  /**
   * ADR-238 D2 prerequisite. 'concept' passes the focal as a SOFT hint;
   * 'goal' sends no hint at all.
   *
   * "Diagnose my map" must select SOME concept purely to have a drawer to host
   * the form (root, else focal, else `concepts()[0]` in repo order). Forwarding
   * that as a hint is harmless only while D2's bias is unbuilt. The moment the
   * bias lands it would silently bias a WHOLE-MAP diagnosis toward an arbitrary
   * node, a subtler form of the very defect ADR-238 exists to close.
   */
  readonly diagnoseScope = input<'concept' | 'goal'>('concept');

  readonly diagnosed = output<void>();
  /**
   * The learner asked to practise the focal hex from the win-gated suggestions
   * state. Navigation stays in the parent, which already owns the campaign
   * deep-link (map-canvas.practiceHex).
   */
  readonly practiceRequested = output<void>();

  /**
   * Goal-scoped knowledge for the memory panel (CHO-2116 tier 1) — computed
   * from the map's already-painted concepts, no extra read: shaky = active
   * growth edges (strongest first, capped) + ceremony remediate edges; due =
   * a shaky concept whose retention decayed; mastered = the grown ones.
   */
  readonly goalKnowledge = computed<FamiliarGoalKnowledge>(() => {
    const cs = this.concepts();
    const shaky = cs
      .filter((c) => c.growthEdge || c.intent === 'remediate')
      .sort(
        (a, b) => (b.growthEdge?.strength ?? 0) - (a.growthEdge?.strength ?? 0),
      )
      .slice(0, 5)
      .map((c) => ({
        title: c.title,
        due: c.growthEdge?.isDue === true,
      }));
    const mastered = cs
      .filter((c) => c.mastered === true)
      .slice(0, 5)
      .map((c) => c.title);
    return { shaky, mastered };
  });

  /** Section gates — a block shows for `all` OR its own section. */
  readonly showSuggestions = computed<boolean>(
    () => this.section() === 'all' || this.section() === 'suggestions',
  );
  /**
   * The Companion may reveal a node's children (Generate) only on a WON, non-root
   * focal (ADR-227 D2 + the root = authoring-only decision). An unwon node shows
   * the win-gate; the root shows the authoring pointer — neither offers Generate.
   */
  readonly canGenerate = computed<boolean>(
    () => this.focalWon() && !this.isRoot(),
  );
  /** The bond header + memory panel + Daily-Dose CTA travel together. */
  readonly showFamiliar = computed<boolean>(
    () => this.section() === 'all' || this.section() === 'familiar',
  );
  readonly showDiagnose = computed<boolean>(
    () => this.section() === 'all' || this.section() === 'diagnose',
  );

  private readonly toast = inject(ToastService);
  private readonly familiarSvc = inject(FamiliarService);
  private readonly familiarGrowthSvc = inject(FamiliarGrowthService);
  private readonly goalSvc = inject(GoalService);
  private readonly graphSvc = inject(ConceptGraphService);
  private readonly familiarMapSvc = inject(FamiliarMapService);
  private readonly goalKnowledgeSvc = inject(GoalKnowledgeService);
  private readonly growthSvc = inject(GrowthEdgesService);
  private readonly pendingReview = inject(PendingReviewStore);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  // ── Summon (no Familiar attached) ───────────────────────────────────
  private readonly _rosterState = signal<RosterState>({ status: 'idle' });
  readonly rosterState = this._rosterState.asReadonly();
  readonly rosterFamiliars = computed<readonly FamiliarSummary[]>(() => {
    const s = this._rosterState();
    return s.status === 'success' ? s.familiars : [];
  });

  /**
   * The learner's own name for a summonable roster entry, or '' while it is
   * still a Pod. A pod is summonable pre-hatch (binding it to a Goal is how it
   * warms), so this list mixes stages and must suppress the backend's NOT NULL
   * placeholder name for the Stage-0 rows. See learnerFamiliarName().
   */
  rosterName(f: FamiliarSummary): string {
    return learnerFamiliarName(f.growthStage, f.displayName);
  }
  /**
   * Companion ids already bound to one of the learner's OTHER live Goals
   * (CHO-2403). Keyed on OTHER goals on purpose: a bond on THIS goal must
   * never remove its own Companion from its own list.
   */
  readonly assignedElsewhere = computed<ReadonlySet<string>>(() => {
    const mine = this.goalId();
    const taken = new Set<string>();
    for (const g of this.goalSvc.goals()) {
      if (g.goalId === mine) continue;
      const fid = g.attachedFamiliarId?.trim();
      if (fid) taken.add(fid);
    }
    return taken;
  });

  /**
   * The roster minus Companions already living on another graph. A Companion
   * belongs to at most one knowledge graph, so offering a taken one would
   * invite a summon the backend now refuses with a 409.
   *
   * This is the COURTESY, not the control. The refusal is the 409 in
   * chora-consumption and the guarantee is the partial unique index; a
   * filtered list on its own would only be theatre, since nothing stops a
   * direct PATCH.
   */
  readonly summonableFamiliars = computed<readonly FamiliarSummary[]>(() => {
    const taken = this.assignedElsewhere();
    return this.rosterFamiliars().filter((f) => !taken.has(f.familiarId));
  });

  /**
   * The learner HAS Companions, but every one of them is already spoken for.
   * Deliberately distinct from owning none: telling someone with four
   * Companions that they have none would be a lie, and the way forward is a
   * new egg rather than the roster they have already filled.
   */
  readonly allCompanionsAssigned = computed<boolean>(
    () => this.rosterFamiliars().length > 0 && this.summonableFamiliars().length === 0,
  );

  /** True while a summon PATCH is in flight. */
  readonly summoning = signal<boolean>(false);

  // ── Bond ────────────────────────────────────────────────────────────
  readonly hasFamiliar = computed<boolean>(() => !!this.attachedFamiliarId());
  /** True while a dismiss PATCH is in flight. */
  readonly dismissing = signal<boolean>(false);

  // ── Suggestions (re-voiced fog) ─────────────────────────────────────
  /**
   * Every pending suggestion in THIS goal, as the goal-scoped read returns
   * them. Split below; nothing renders this raw.
   */
  private readonly _allSuggestions = signal<readonly ConceptSuggestion[]>([]);

  /**
   * The suggestions that belong to the FOCAL node: its own, plus whole-map rows.
   *
   * This reproduces client-side exactly what the backend's focal read used to
   * return, so dropping `?focalConceptId=` in favour of one goal-scoped call
   * does not widen what fans around a node. The narrowing exists so a stale
   * prior-generate batch anchored on a DIFFERENT focal cannot leak onto this
   * one, and it is now enforced HERE as well as there.
   */
  readonly suggestions = computed<readonly ConceptSuggestion[]>(() => {
    const focal = this.focalConceptId();
    return this._allSuggestions().filter(
      (s) => !s.focalConceptId || s.focalConceptId === focal,
    );
  });

  /**
   * Goal-level suggestions: the root-anchored rows, shown while the learner is
   * standing anywhere ELSE.
   *
   * Without this they were reachable only from the root, so an unmatched
   * weakness was "never dropped" in storage and dropped in the UI. Empty while
   * standing ON the root, where the same rows are already the node's own and a
   * second section would render them twice.
   */
  readonly goalLevelSuggestions = computed<readonly ConceptSuggestion[]>(() => {
    const root = this.rootConceptId();
    const focal = this.focalConceptId();
    if (!root || root === focal) return [];
    return this._allSuggestions().filter((s) => s.focalConceptId === root);
  });
  /** True while generate is in flight or we're polling for arrivals. */
  readonly suggestionsWaiting = signal<boolean>(false);
  /**
   * True when the poll window elapsed with nothing yet — an honest "still
   * working, this can take a moment" state with a manual re-check, so a slow fog
   * run never collapses to the misleading "No suggestions yet" empty state.
   * Cleared on a fresh generate or when suggestions arrive.
   */
  readonly suggestSlow = signal<boolean>(false);
  /** True while the generate POST is in flight (disables the Suggest button). */
  readonly generating = signal<boolean>(false);
  /** True while an accept/dismiss suggestion op is in flight. */
  readonly mutatingSuggestion = signal<boolean>(false);
  private suggestPollTimer: ReturnType<typeof setTimeout> | null = null;
  private suggestPollsRemaining = 0;

  // ── Memory (reused panel) ───────────────────────────────────────────
  private readonly _memoryState = signal<FamiliarMemoryState>({ status: 'idle' });
  readonly memoryState = this._memoryState.asReadonly();

  /**
   * The bound Companion's species + stage for the memory header's portrait (D1).
   *
   * The memory wire carries identity but not the growth axis, and this panel is
   * the only place that knows WHICH Companion is bound, so the growth axis is
   * read here and handed down. Null until it lands, and null again if the read
   * failed: the header then draws nothing rather than guessing a species. The
   * old header hardcoded `fa-dragon` for every Companion.
   */
  private readonly _portrait = signal<FamiliarPortrait | null>(null);
  readonly portrait = this._portrait.asReadonly();

  // ── The Companion's reflection (CHO-2118 tier 2) ────────────────────
  private readonly _reflectionState = signal<GoalReflectionState>({
    status: 'idle',
  });
  /**
   * The reflection to render, or null when we have not read it or the read
   * FAILED. Null hides the prose and leaves the deterministic tier-1 block
   * standing — the reflection is an enrichment, so it fails SOFT (owner design
   * decision 5; contrast `memoryState`, which is fail-loud because the memory
   * panel IS the content).
   */
  readonly reflection = computed<GoalReflection | null>(() => {
    const s = this._reflectionState();
    return s.status === 'success' ? s.knowledge.reflection : null;
  });
  /** The `(goal, familiar)` pair the current reflection state belongs to. */
  private reflectionKey = '';

  // ── Diagnose (growth-edge upload) ───────────────────────────────────
  readonly uploadKinds: readonly GrowthEdgeUploadKind[] = [
    'marked_test',
    'notes',
    'scribble',
  ];
  readonly uploadKind = signal<GrowthEdgeUploadKind>('marked_test');
  readonly uploadFile = signal<File | null>(null);
  readonly uploadPhase = signal<UploadPhase>('idle');
  /**
   * The last completed diagnosis's placed-edge count (ADR-238 D5 goal-level
   * summary). Set only on a `> 0` completion (drives the done-banner summary);
   * null until then and on an empty run.
   */
  readonly diagnoseResult = signal<{ readonly count: number } | null>(null);
  /** Upload id parked at the HITL interrupt; drives the review deep-link. */
  readonly reviewUploadId = signal<string | null>(null);

  // ── Parked diagnoses (C4 slice 2 item 2) ──────────────────────────
  //
  // The in-drawer review CTA above is EPHEMERAL by design: closing the drawer
  // destroys it and re-opening does not restore it. So a diagnosis parked at
  // the interrupt was afterwards reachable only from the /a/knowledge banner or
  // by typing the URL. This is the durable half of that same affordance.
  private readonly _parked = signal<readonly PendingReviewItem[]>([]);
  /** The goal whose parked list `_parked` holds ('' = never read). */
  private parkedGoalId = '';

  /**
   * Parked rows belonging to THIS map, with their status resolved to copy.
   *
   * The goal filter is OURS: the collection takes only `?status=awaiting_review`
   * and no goal parameter, so every one of the learner's rows arrives here. A
   * row from another map, or one carrying no goal at all (a diagnosis raised
   * outside any map), is not this map's business, and rendering it would
   * attribute a diagnosis to a goal it does not belong to.
   */
  readonly parkedDiagnoses = computed<
    readonly {
      readonly uploadId: string;
      readonly uploadKind: string;
      readonly status: DiagnoseStatusLabel;
    }[]
  >(() => {
    const goalId = this.goalId();
    return this._parked()
      .filter((row) => !!row.goal_id && row.goal_id === goalId)
      .map((row) => ({
        uploadId: row.upload_id,
        uploadKind: row.upload_kind,
        status: diagnoseStatus(row.status),
      }));
  });
  readonly uploadBusy = computed<boolean>(
    () => this.uploadPhase() === 'uploading' || this.uploadPhase() === 'analyzing',
  );
  /**
   * True once the analysis wait has run long enough (UPLOAD_SLOW_AFTER ticks) to
   * warrant a "this can take a couple of minutes" reassurance under the working
   * line. Reset on every fresh submit; only meaningful while uploadBusy().
   */
  readonly diagnoseSlow = signal<boolean>(false);
  /** i18n key for a client-side rejection (bad type / oversize); null = clean. */
  readonly uploadError = signal<string | null>(null);
  /** The dropzone is list-shaped; this lane stays single-file (one blob per
   *  upload job, one mana reserve), so it renders 0..1 chips. */
  readonly uploadFiles = computed<readonly File[]>(() => {
    const f = this.uploadFile();
    return f ? [f] : [];
  });
  /** Native accept attribute, kept in step with the Go allowlist. */
  readonly diagnoseAccept = DIAGNOSE_ACCEPT_EXTENSIONS.join(',');
  /** Drives the one-shot success flourish on the done banner. */
  readonly celebrating = signal<boolean>(false);
  /**
   * Singular/plural summary key. The old single key rendered "Found 1 growth
   * spots" on a one-edge run.
   */
  readonly diagnoseSummaryKey = computed<string>(() =>
    this.diagnoseResult()?.count === 1
      ? 'aplus.knowledge.familiar_diagnose_summary_one'
      : 'aplus.knowledge.familiar_diagnose_summary_other',
  );
  private uploadPollTimer: ReturnType<typeof setTimeout> | null = null;
  private celebrateTimer: ReturnType<typeof setTimeout> | null = null;
  private uploadAttempt = 0;
  /** Guards the focal-change reload effect from firing on the initial seed. */
  private focalSeeded = false;

  constructor() {
    // React to the map's Familiar bond: load memory + suggestions when a
    // Familiar is attached; load the summon roster when it is not. Fires once
    // per distinct `attachedFamiliarId` (a summon/dismiss re-passes a new value
    // from the parent's silent map refetch).
    effect(() => {
      const famId = this.attachedFamiliarId();
      // Depend on the bond ALONE: the body reads focalConceptId (via
      // loadSuggestions) which would otherwise transitively re-run this whole
      // effect — re-firing loadMemory — on every node switch. The focal-change
      // effect below owns the per-node suggestion reload.
      untracked(() => {
        if (famId) {
          this.loadMemory(famId);
          this.loadSuggestions();
        } else {
          this.stopSuggestPolling();
          this._allSuggestions.set([]);
          this.suggestionsWaiting.set(false);
          this.suggestSlow.set(false);
          this._memoryState.set({ status: 'idle' });
          this._portrait.set(null);
          this.loadRoster();
        }
      });
    });

    // Follow the node: when the drawer recenters onto a different concept the
    // focalConceptId input changes, so reload THIS node's suggestions (they are
    // focal-scoped server-side) and stop any poll anchored on the old focal.
    // Skips the initial seed (the Familiar-bond effect above already loads on
    // mount) so it fires ONLY on a genuine focal change; the familiar-bound gate
    // is read untracked so this effect depends on focalConceptId alone.
    effect(() => {
      const focal = this.focalConceptId();
      if (!this.focalSeeded) {
        this.focalSeeded = true;
        return;
      }
      void focal;
      untracked(() => {
        if (!this.hasFamiliar()) return;
        this.stopSuggestPolling();
        this.suggestionsWaiting.set(false);
        this.suggestSlow.set(false);
        this.loadSuggestions();
      });
    });

    // Read the Companion's reflection ONLY while its tab is actually on screen.
    //
    // This read is not free: on a stale or missing cache row chora-consumption
    // claims the row and schedules an LLM synthesis. Firing it on mount, or from
    // the Suggestions / Diagnose tabs, would burn model calls to fill a panel
    // the learner never opened. So it depends on `showFamiliar()` as much as on
    // the bond, and re-asks only when the answer could actually have changed.
    effect(() => {
      const goalId = this.goalId();
      const famId = this.attachedFamiliarId();
      const shown = this.showFamiliar();
      untracked(() => {
        if (!shown || !goalId || !famId) return;

        const key = `${goalId}${famId}`;
        const settled = this._reflectionState();
        const holdsFresh =
          settled.status === 'success' &&
          settled.knowledge.reflection.status === 'fresh';
        // Re-entering the tab with a fresh reflection in hand asks nothing; a
        // request already in flight is not duplicated. Anything else — first
        // open, a different map/Companion, or a reflection that was still being
        // written when we last looked — re-asks, so the finished prose lands
        // instead of the learner staring at "reflecting…" until a full reload.
        // A re-ask is normally a pure cache hit (zero LLM); the backend's
        // regen floor and in-flight claim bound the cost of the rest.
        if (
          this.reflectionKey === key &&
          (holdsFresh || settled.status === 'loading')
        ) {
          return;
        }
        this.reflectionKey = key;
        this.loadReflection(goalId);
      });
    });

    // Read the parked diagnoses ONLY while the Diagnose tab is on screen, the
    // same rule the reflection above follows: a panel the learner never opened
    // should cost nothing. Re-read on a different map, never twice for one.
    effect(() => {
      const goalId = this.goalId();
      const shown = this.showDiagnose();
      untracked(() => {
        if (!shown || !goalId || this.parkedGoalId === goalId) return;
        this.parkedGoalId = goalId;
        this.loadParked();
      });
    });

    // A learner who tabs away during the async fog generate then returns should
    // see suggestions that landed while hidden — refetch on tab-visible (only
    // when a Familiar is bound; recommendations <-> Familiar). Auto-unsubscribed
    // on destroy. Mirrors the q-bank picker stale-on-re-entry fix.
    fromEvent(document, 'visibilitychange')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (document.visibilityState === 'visible' && this.hasFamiliar()) {
          this.loadSuggestions();
        }
      });
  }

  ngOnDestroy(): void {
    this.stopSuggestPolling();
    this.stopUploadPolling();
    if (this.celebrateTimer !== null) {
      clearTimeout(this.celebrateTimer);
      this.celebrateTimer = null;
    }
  }

  // ── Summon ──────────────────────────────────────────────────────────

  /** GET the learner's roster for the summon picker. Fail-loud. */
  loadRoster(): void {
    // The picker must know which Companions are already on another graph
    // (CHO-2403), which lives on the goals list. Idempotent, so a surface
    // that already fetched it is not re-fetched into.
    this.goalSvc.load();
    this._rosterState.set({ status: 'loading' });
    this.familiarSvc
      .getMyFamiliars()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (familiars) =>
        this._rosterState.set({ status: 'success', familiars }),
      error: () =>
        this._rosterState.set({
          status: 'error',
          error: 'aplus.knowledge.familiar_roster_error',
        }),
    });
  }

  /** Attach the picked Familiar to this map, then let the parent refetch. */
  summon(familiarId: string): void {
    if (this.summoning()) return;
    this.summoning.set(true);
    this.goalSvc
      .update(this.goalId(), { attachedFamiliarId: familiarId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.summoning.set(false);
          this.toast.show('aplus.knowledge.familiar_summon_success', 'success');
          this.changed.emit();
        },
        error: () => {
          this.summoning.set(false);
          this.toast.show('aplus.knowledge.familiar_summon_error', 'error');
        },
      });
  }

  // ── Awakening resonance pick (R3-1, CHO-2013 P1) ────────────────────
  /** True while the resonant-concept POST is in flight. */
  readonly pickingResonance = signal<boolean>(false);
  /** The pick is available only when a Familiar is bound AND a concept is focal. */
  readonly canPickResonance = computed<boolean>(
    () => !!this.attachedFamiliarId() && !!this.focalConceptId(),
  );

  /**
   * Elect the current focal concept as the Familiar's resonant concept — the
   * ring-radius centre of its awakening (R3-1). POST /resonance {conceptId};
   * on success the parent refetches (the ring may re-render). Fail-loud toast.
   */
  pickResonance(): void {
    const familiarId = this.attachedFamiliarId();
    const conceptId = this.focalConceptId();
    if (!familiarId || !conceptId || this.pickingResonance()) return;
    this.pickingResonance.set(true);
    this.familiarGrowthSvc
      .pickResonantConcept(familiarId, conceptId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.pickingResonance.set(false);
          this.toast.show('aplus.knowledge.familiar_resonance_success', 'success');
          this.changed.emit();
        },
        error: () => {
          this.pickingResonance.set(false);
          this.toast.show('aplus.knowledge.familiar_resonance_error', 'error');
        },
      });
  }

  // ── Bond ────────────────────────────────────────────────────────────

  /** Clear this map's Familiar bond, then let the parent refetch. */
  dismiss(): void {
    if (this.dismissing()) return;
    this.dismissing.set(true);
    this.goalSvc
      .update(this.goalId(), { detachFamiliar: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: () => {
        this.dismissing.set(false);
        this.toast.show('aplus.knowledge.familiar_dismiss_success', 'success');
        this.changed.emit();
      },
      error: () => {
        this.dismissing.set(false);
        this.toast.show('aplus.knowledge.familiar_dismiss_error', 'error');
      },
    });
  }

  // ── Memory ──────────────────────────────────────────────────────────

  /**
   * GET the Familiar's memory + persona/rules/focus + citations. Fail-loud.
   * Scoped to THIS map (ADR-214): unscoped, "What it can see" lists every other
   * map's concepts, so a Software Design map showed Water Cycle and Food Chains.
   */
  loadMemory(familiarId: string): void {
    this.loadPortrait(familiarId);
    this._memoryState.set({ status: 'loading' });
    this.familiarMapSvc
      .getMemory(familiarId, this.goalId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (memory) => this._memoryState.set({ status: 'success', memory }),
      error: () =>
        this._memoryState.set({
          status: 'error',
          error: 'aplus.knowledge.familiar_memory_error',
        }),
    });
  }

  /**
   * GET the bound Companion's growth axis, for the memory header's portrait.
   *
   * Fail-SOFT and deliberately so: the portrait is enrichment on a panel whose
   * content is the memory read beside it, so a dead growth read must cost the
   * picture and nothing else. It resolves to null rather than to a default
   * species, because a wrong portrait is worse than none (D1).
   */
  private loadPortrait(familiarId: string): void {
    this._portrait.set(null);
    this.familiarGrowthSvc
      .getGrowth(familiarId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (g) =>
          this._portrait.set({ species: g.species, stage: g.growthStage }),
        error: () => this._portrait.set(null),
      });
  }

  /**
   * GET the Companion's goal-scoped reflection (CHO-2118 tier 2). Fail-SOFT, by
   * design: the reflection sits ON TOP of a deterministic block the panel has
   * already rendered from data it holds, so a dead read costs the prose and
   * nothing else. Showing an error card here would break a working panel to
   * announce that an enrichment is missing.
   */
  /**
   * Read the diagnoses parked at the review interrupt. Fail-SOFT: this is a way
   * BACK to work already done, so a dead read costs the list and nothing else;
   * an error card here would break a working Diagnose tab to announce that a
   * convenience is missing.
   */
  private loadParked(): void {
    this.growthSvc
      .listAwaitingReview()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => this._parked.set(items),
        error: () => this._parked.set([]),
      });
  }

  loadReflection(goalId: string): void {
    this._reflectionState.set({ status: 'loading' });
    this.goalKnowledgeSvc
      .get(goalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (knowledge) =>
          this._reflectionState.set({ status: 'success', knowledge }),
        error: () => this._reflectionState.set({ status: 'error' }),
      });
  }

  // ── Suggestions ─────────────────────────────────────────────────────

  /**
   * Fetch the pending suggestions. Non-fatal: a failure keeps the last state
   * (the map load, owned by the parent, is the primary fail-loud surface).
   * Clears the waiting shimmer and stops polling once any arrive.
   */
  loadSuggestions(): void {
    // ONE call, goal-scoped: `?goalId=` is a shape the handler already accepts,
    // and it is the only way to see the root-anchored rows from another node.
    // The focal narrowing moved into `suggestions` above, so this widens what is
    // FETCHED without widening what is SHOWN.
    this.graphSvc
      .getSuggestions(undefined, this.goalId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: (res) => {
        this._allSuggestions.set(res.suggestions);
        // The shimmer and the poll belong to a generate fired around the FOCAL
        // node, so they end when the FOCAL's rows arrive. Testing the raw
        // response instead would let a stale goal-level row end a wait for a
        // batch that has not landed.
        if (this.suggestions().length > 0) {
          this.suggestionsWaiting.set(false);
          this.suggestSlow.set(false);
          this.stopSuggestPolling();
        }
      },
      error: () => {
        /* keep last state; the next poll retries */
      },
    });
  }

  /**
   * Ask the map's Familiar for suggestions around the focal concept. 202
   * fire-and-forget; they land asynchronously, so we enter the waiting state
   * and poll a few times to pick them up.
   */
  generateSuggestions(): void {
    if (this.generating() || this.suggestionsWaiting()) return;
    this.generating.set(true);
    this.suggestSlow.set(false); // fresh run — drop any prior "still working" state
    const focal = this.focalConceptId() || undefined;
    this.graphSvc
      .generateSuggestions({
        goalId: this.goalId(),
        ...(focal ? { focalConceptId: focal } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.generating.set(false);
          this.suggestionsWaiting.set(true);
          this.startSuggestPolling();
        },
        error: (err: unknown) => {
          this.generating.set(false);
          this.toast.show(generateErrorKey(err), 'error');
        },
      });
  }

  /** Accept: mints a real concept/edge server-side; refetch both + the map. */
  acceptSuggestion(suggestionId: string): void {
    if (this.mutatingSuggestion()) return;
    this.mutatingSuggestion.set(true);
    this.graphSvc
      .acceptSuggestion(suggestionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: () => {
        this.mutatingSuggestion.set(false);
        this.toast.show(
          'aplus.knowledge.familiar_suggestion_accepted',
          'success',
        );
        this.loadSuggestions();
        this.changed.emit();
      },
      error: () => {
        this.mutatingSuggestion.set(false);
        this.toast.show('aplus.knowledge.familiar_suggestion_error', 'error');
      },
    });
  }

  /** Dismiss: marks the suggestion dismissed; the map graph is unchanged. */
  dismissSuggestion(suggestionId: string): void {
    if (this.mutatingSuggestion()) return;
    this.mutatingSuggestion.set(true);
    this.graphSvc
      .dismissSuggestion(suggestionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
      next: () => {
        this.mutatingSuggestion.set(false);
        this.toast.show(
          'aplus.knowledge.familiar_suggestion_dismissed',
          'success',
        );
        this.loadSuggestions();
      },
      error: () => {
        this.mutatingSuggestion.set(false);
        this.toast.show('aplus.knowledge.familiar_suggestion_error', 'error');
      },
    });
  }

  /** A display label for a suggestion (edge suggestions resolve concept titles). */
  suggestionLabel(s: ConceptSuggestion): string {
    if (s.kind === 'edge') {
      return `${this.conceptTitle(s.sourceConceptId)} → ${this.conceptTitle(
        s.targetConceptId,
      )}`;
    }
    return s.title ?? '';
  }

  private conceptTitle(conceptId?: string): string {
    if (!conceptId) return '';
    // Never surface a raw UUID in an edge-suggestion label when the concept is
    // not in this map's set — show a human placeholder instead.
    return (
      this.concepts().find((c) => c.conceptId === conceptId)?.title ??
      this.translate.instant('aplus.knowledge.familiar_unknown_concept')
    );
  }

  /** Cancel any scheduled suggestion poll (also called on destroy). */
  stopSuggestPolling(): void {
    if (this.suggestPollTimer !== null) {
      clearTimeout(this.suggestPollTimer);
      this.suggestPollTimer = null;
    }
  }

  private startSuggestPolling(): void {
    this.stopSuggestPolling();
    this.suggestPollsRemaining = SUGGESTION_POLL_MAX;
    this.scheduleNextSuggestPoll();
  }

  private scheduleNextSuggestPoll(): void {
    if (this.suggestPollsRemaining <= 0) {
      // Window elapsed with nothing yet — the fog is slow, not empty. Drop the
      // shimmer but surface an honest "still working, check again" state rather
      // than the misleading "No suggestions yet" empty copy.
      this.suggestionsWaiting.set(false);
      if (this.suggestions().length === 0) this.suggestSlow.set(true);
      return;
    }
    this.suggestPollTimer = setTimeout(() => {
      this.suggestPollsRemaining -= 1;
      this.loadSuggestions();
      // loadSuggestions stops us once any arrive; otherwise keep polling.
      if (this.suggestionsWaiting()) {
        this.scheduleNextSuggestPoll();
      }
    }, SUGGESTION_POLL_INTERVAL_MS);
  }

  // ── Diagnose (growth-edge upload) ───────────────────────────────────

  onKindChange(event: Event): void {
    this.uploadKind.set(
      (event.target as HTMLSelectElement).value as GrowthEdgeUploadKind,
    );
  }

  /**
   * Take a picked/dropped selection. Validates against the diagnose door's OWN
   * limits before anything is sent, so a file the server would 415 or 413 is
   * refused here with a reason rather than after an upload, a mana reserve and
   * a round trip. Single-file lane: extra files are ignored, not silently
   * queued, since one upload is one job and one mana charge.
   */
  onFilesAdded(files: readonly File[]): void {
    const picked = files[0];
    if (!picked) return;
    if (!this.hasAllowedExtension(picked.name)) {
      this.uploadFile.set(null);
      this.uploadError.set('aplus.knowledge.familiar_diagnose_error_type');
      return;
    }
    if (picked.size > DIAGNOSE_MAX_FILE_BYTES) {
      this.uploadFile.set(null);
      this.uploadError.set('aplus.knowledge.familiar_diagnose_error_size');
      return;
    }
    this.uploadError.set(null);
    this.uploadFile.set(picked);
    // A fresh pick clears a prior done/empty/failed banner.
    const phase = this.uploadPhase();
    if (phase === 'done' || phase === 'empty' || phase === 'failed') {
      this.uploadPhase.set('idle');
    }
  }

  /** Drop the selection. Removal can only relax constraints, so it clears the
   *  rejection reason too. */
  onFileRemoved(): void {
    this.uploadFile.set(null);
    this.uploadError.set(null);
  }

  private hasAllowedExtension(name: string): boolean {
    const lower = name.toLowerCase();
    return DIAGNOSE_ACCEPT_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  /**
   * Upload the marked-up artefact, then poll the async analysis to a verdict.
   * Carries `goal_id` so chora-consumption resolves the detected weaknesses
   * goal-wide (ADR-238 D1); the focal concept rides along as a SOFT hint only
   * (ADR-238 D2) — resolution is goal-scoped regardless of the entry node.
   */
  startDiagnose(): void {
    const file = this.uploadFile();
    if (!file || this.uploadBusy()) return;
    this.diagnoseResult.set(null);
    this.diagnoseSlow.set(false);
    this.uploadPhase.set('uploading');
    this.growthSvc
      .upload(
        file,
        this.uploadKind(),
        undefined,
        this.goalId(),
        // ADR-238 D2: a goal-level entry carries NO concept hint.
        this.diagnoseScope() === 'goal' ? undefined : this.focalConceptId() || undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => this.beginUploadPoll(job.upload_id),
        error: () => this.failDiagnose(),
      });
  }

  private beginUploadPoll(uploadId: string): void {
    this.uploadPhase.set('analyzing');
    this.uploadAttempt = 0;
    this.diagnoseSlow.set(false);
    // CHO-2337: persist the parked upload at SUBMIT time, the instant the 202
    // lands, not only once AWAITING_REVIEW is observed. Real analysis (~2 to 4
    // min) outlives a closed drawer or the poll ceiling, so writing the id here
    // lets /a/knowledge self-heal the review banner against GET /uploads/{id}
    // even when this in-drawer poller never sees the terminal state itself. It
    // is cleared again on a terminal COMPLETED (completeDiagnose); a FAILED /
    // ceiling-hit deliberately keeps it (see failDiagnose).
    this.pendingReview.set(uploadId);
    this.scheduleUploadPoll(uploadId);
  }

  private scheduleUploadPoll(uploadId: string): void {
    this.uploadPollTimer = setTimeout(() => {
      this.growthSvc
        .pollUpload(uploadId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
        next: (job) => {
          if (job.status === 'COMPLETED') {
            this.completeDiagnose(job);
            return;
          }
          if (job.status === 'FAILED') {
            this.failDiagnose();
            return;
          }
          if (job.status === 'AWAITING_REVIEW') {
            this.parkForReview(job.upload_id);
            return;
          }
          // Still QUEUED/ANALYZING — one more tick.
          this.advanceUploadPoll(uploadId);
        },
        // A transient poll error (edge 504, network blip) is NOT a verdict —
        // count it as a pending tick so one hiccup can't abort a diagnosis the
        // async analyser is still completing. Only a definitive FAILED status
        // (above) or the ceiling fails it.
        error: () => this.advanceUploadPoll(uploadId),
      });
    }, UPLOAD_POLL_INTERVAL_MS);
  }

  /** Advance the poll by one tick, failing only once the ceiling is reached. */
  private advanceUploadPoll(uploadId: string): void {
    this.uploadAttempt += 1;
    if (this.uploadAttempt >= UPLOAD_POLL_MAX) {
      this.failDiagnose();
      return;
    }
    // Long wait: surface the calm reassurance so a multi-minute analysis reads
    // as "still working", never as a frozen page.
    if (this.uploadAttempt >= UPLOAD_SLOW_AFTER) {
      this.diagnoseSlow.set(true);
    }
    this.scheduleUploadPoll(uploadId);
  }

  /**
   * A COMPLETED diagnosis. ADR-238 D5/D6: branch on how many growth edges the run
   * actually placed —
   *   • > 0 → the success path: record the count for the goal-level summary, toast,
   *     refetch the map (`changed`), and tell the parent to auto-reveal the Growth
   *     lens (`diagnosed`) so the newly-lit nodes show WHERE the edges landed.
   *   • = 0 → the D6 empty state: "processed" is not "found", so DON'T fire the
   *     bare "growth signals updated" success over an empty panel — surface an
   *     explicit empty banner instead. Still refetch (harmless — nothing changed).
   */
  private completeDiagnose(job: GrowthEdgeUploadJob): void {
    this.stopUploadPolling();
    this.uploadFile.set(null);
    this.diagnoseSlow.set(false);
    // COMPLETED is terminal with nothing parked for HITL review, so drop the
    // submit-time pending-review marker (CHO-2337): there is no review to
    // re-offer, and leaving it would make /a/knowledge poll a resolved job.
    this.pendingReview.clear();
    const count = job.upserted_growth_edge_ids?.length ?? 0;
    if (count > 0) {
      this.diagnoseResult.set({ count });
      this.uploadPhase.set('done');
      // A one-shot flourish: the learner just turned a marked-up artefact into
      // real map signal, which is the payoff moment of the whole lane.
      this.celebrating.set(true);
      this.celebrateTimer = setTimeout(
        () => this.celebrating.set(false),
        DIAGNOSE_CELEBRATE_MS,
      );
      this.toast.show('aplus.knowledge.familiar_diagnose_done', 'success');
      // The map's shaky overlay shifted, so let the parent refetch…
      this.changed.emit();
      // …then reveal where the edges landed (parent switches to the Growth lens).
      this.diagnosed.emit();
      return;
    }
    this.diagnoseResult.set(null);
    this.uploadPhase.set('empty');
    // Harmless: nothing landed on the map, but a refetch keeps parity cheap.
    this.changed.emit();
  }

  /**
   * Park the diagnosis at the bounded HITL interrupt (ADR-205 D4). Polling STOPS
   * here: the run cannot advance until the learner resumes it, so continuing to
   * tick would burn the poll ceiling and then report a false failure for a run
   * that succeeded. The panel itself lives on its own route because it owns an
   * independent poller; mounting it here would put two pollers on one job.
   */
  private parkForReview(uploadId: string): void {
    this.stopUploadPolling();
    this.diagnoseSlow.set(false);
    this.reviewUploadId.set(uploadId);
    this.uploadPhase.set('awaiting_review');
    // The in-drawer review CTA is ephemeral: closing the drawer destroys it and
    // re-opening does not restore it. The upload is already persisted from submit
    // (beginUploadPoll); reaffirm it here so the park intent stays explicit and
    // robust even if the submit-time write is ever refactored (CHO-2337).
    this.pendingReview.set(uploadId);
  }

  private failDiagnose(): void {
    this.stopUploadPolling();
    this.diagnoseSlow.set(false);
    // Deliberately do NOT clear the submit-time pending-review marker here. A
    // ceiling-hit is not a real failure: the backend may still reach
    // AWAITING_REVIEW after this poller gave up, and keeping the id lets
    // /a/knowledge self-heal the banner. A genuinely FAILED job is pruned by that
    // same self-heal on its next read (it only shows the banner on AWAITING_REVIEW).
    this.uploadPhase.set('failed');
    this.toast.show('aplus.knowledge.familiar_diagnose_error', 'error');
  }

  private stopUploadPolling(): void {
    if (this.uploadPollTimer !== null) {
      clearTimeout(this.uploadPollTimer);
      this.uploadPollTimer = null;
    }
  }
}
