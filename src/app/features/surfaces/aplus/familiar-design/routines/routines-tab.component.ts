/**
 * RoutinesTabComponent — the Grimoire's Rituals tab (CHO-2016 P4, ADR-219 D3).
 *
 * A learner composes a deterministic Ritual: pick equipped-active Skills from
 * the loadout palette (click to add — accessible, mirrors the pipeline-builder
 * precedent), reorder the 1..cap steps by CDK drag, then publish (which
 * freezes a flat price + appends an append-only revision) and run it. Every
 * op is a real BFF call; conflicts (403 RITUALS_LOCKED / 409 quota / 422
 * invalid / 402 mana) toast fail-loud and never fabricate success.
 *
 * CHO-2362: the inspector is a real per-step param editor driven by each
 * Skill's `paramsSchema` on the loadout grant row (BE `params_schema`,
 * rendered from the domain sheet table that also validates). Values ride the
 * step objects as STRINGS; absent params mean "Skill default" and are always
 * fine. Ref params (concept_ref / growth_edge_ref) offer the learner's own
 * concepts / growth edges by TITLE, never raw UUID entry (CHO-2346 defect
 * class). `required` is a nudge ("Recommended"), never a block - the server
 * deliberately does not refuse publish on a missing required param, and the
 * FE must never be stricter than the server.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Observable, Subject, Subscription, interval, merge, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import {
  ReorderableListDirective,
  type ReorderEvent,
} from '../../../../../shared/components/reorderable-list/reorderable-list.directive';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import { FamiliarGrowthService } from '../../../../../core/familiar/familiar-growth.service';
import { FamiliarRitualService } from '../../../../../core/familiar/familiar-ritual.service';
import { ConceptGraphService } from '../../discovery-graph/concept-graph.service';
import { GrowthEdgesService } from '../../growth-edges/growth-edges.service';
import type {
  LoadoutGrant,
  LoadoutView,
  SkillParamSpec,
  SkillParamType,
  SkillParamsSchema,
} from '../../../../../core/familiar/familiar-growth.model';
import {
  RITUAL_NAME_MAX_LEN,
  V1_RITUAL_TRIGGERS,
  RITUAL_SINKS,
  isRunTerminal,
  ritualStepCap,
  type CreateRitualRequest,
  type Ritual,
  type RitualRun,
  type RitualStep,
  type RitualSink,
  type RitualTrigger,
  composeRitualPrice,
  ritualStepUplift,
  type RitualPriceEstimate,
} from '../../../../../core/familiar/familiar-ritual.model';

/** What one step adds to the composed price (N8, b.4 cost row). */
type StepCost =
  | { readonly kind: 'included' }
  | { readonly kind: 'uplift'; readonly units: number }
  | { readonly kind: 'unknown' };

type ListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly rituals: readonly Ritual[];
      /** What this deployment can write, served with the list (B3b). */
      readonly wiredSinks: readonly RitualSink[];
      /** Whether the server answered the question at all (B3b ruling). */
      readonly sinksReported: boolean;
    }
  | { readonly status: 'error' };

type Mode = 'list' | 'create' | 'compose';

// ── CHO-2362: schema-driven per-step param editor ────────────────────────────

/** One pickable ref target (a concept or growth edge): id submitted, title shown. */
export interface RefOption {
  readonly id: string;
  readonly title: string;
}

/**
 * Lazy-load state for a ref-picker source. `idle` = never needed yet (the
 * source loads the first time a ref param is shown); `error` re-loads only on
 * an explicit retry, never in a loop.
 */
export type RefSourceState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'success'; readonly options: readonly RefOption[] };

/** One named param spec, in sheet order, for the inspector template. */
export interface SchemaEntry {
  readonly name: string;
  readonly spec: SkillParamSpec;
}

/** The long_weaving craft lifts the step cap 5→8; owned+always-on when granted. */
const CRAFT_LONG_WEAVING = 'long_weaving';

/**
 * Run-history poll cadence (CHO-2145). A run's steps finish server-side in ~30s,
 * so 2s ticks settle the common case in a handful of polls.
 */
export const RUN_POLL_INTERVAL_MS = 2_000;

/**
 * Poll ceiling — 150 × 2s = 5 minutes. Past it we stop asking and say so
 * plainly: the run is still going and its terminal state WILL land in Run
 * history (the server detaches the terminal write and a stale-sweep reclaims
 * orphans), so giving up polling is never an error condition.
 */
export const RUN_POLL_MAX_ATTEMPTS = 150;

@Component({
  selector: 'chora-routines-tab',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    CdkDrag,
    CdkDropList,
    ReorderableListDirective,
  ],
  templateUrl: './routines-tab.component.html',
  styleUrl: './routines-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoutinesTabComponent {
  private readonly ritualSvc = inject(FamiliarRitualService);
  private readonly growthSvc = inject(FamiliarGrowthService);
  private readonly conceptGraphSvc = inject(ConceptGraphService);
  private readonly growthEdgesSvc = inject(GrowthEdgesService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  // Needed to compose a sink option's label in TS: an <option> may only contain
  // text, so the greyed reason cannot be a template element.
  private readonly translate = inject(TranslateService);

  readonly familiarId = input.required<string>();

  readonly nameMaxLen = RITUAL_NAME_MAX_LEN;
  readonly triggers = V1_RITUAL_TRIGGERS;
  readonly sinks = RITUAL_SINKS;

  private readonly reloadList$ = new Subject<void>();

  /** Rituals list (fail-loud). */
  readonly listState = toSignal(
    merge(
      toObservable(this.familiarId),
      this.reloadList$.pipe(map(() => this.familiarId())),
    ).pipe(switchMap((id) => this.loadRituals(id))),
    { initialValue: { status: 'loading' } as ListState },
  );

  /** Loadout — the source of the equipped-active step palette. */
  readonly loadout = toSignal(
    toObservable(this.familiarId).pipe(
      switchMap((id) =>
        id ? this.growthSvc.getLoadout(id).pipe(catchError(() => of<LoadoutView | null>(null))) : of(null),
      ),
    ),
    { initialValue: null as LoadoutView | null },
  );

  readonly rituals = computed<readonly Ritual[]>(() => {
    const s = this.listState();
    return s.status === 'success' ? s.rituals : [];
  });
  /**
   * The sinks this deployment can write, straight from the list read (B3b).
   *
   * Empty until the list resolves, and empty when the server serves nothing,
   * which greys every sink. Fail-closed on purpose: the FE cannot claim a sink
   * is available on a server that has not said so, and publish would 422 it.
   */
  readonly wiredSinks = computed<readonly RitualSink[]>(() => {
    const s = this.listState();
    return s.status === 'success' ? s.wiredSinks : [];
  });
  /**
   * Whether the server told us which sinks are ready. False also while the list
   * is still loading or errored, which is correct: we have not been told.
   */
  readonly sinksReported = computed<boolean>(() => {
    const s = this.listState();
    return s.status === 'success' ? s.sinksReported : false;
  });
  readonly loading = computed(() => this.listState().status === 'loading');
  readonly errored = computed(() => this.listState().status === 'error');

  readonly mode = signal<Mode>('list');
  readonly selected = signal<Ritual | null>(null);
  readonly draftSteps = signal<readonly RitualStep[]>([]);
  readonly selectedStepIndex = signal<number | null>(null);
  /**
   * CHO-2362: the server's plain-language 422 RITUAL_INVALID detail from the
   * last publish/run refusal, surfaced verbatim in the composer's error strip
   * (fail-loud - the server is the validator, its words reach the learner).
   */
  readonly publishErrorDetail = signal<string | null>(null);
  /** Lazy ref-picker sources (CHO-2362): loaded the first time a ref param shows. */
  readonly conceptSource = signal<RefSourceState>({ status: 'idle' });
  readonly edgeSource = signal<RefSourceState>({ status: 'idle' });
  readonly conceptFilter = signal('');
  readonly edgeFilter = signal('');
  readonly saving = signal(false);
  /** A run is in flight server-side (the 202 was acked; we are polling). */
  readonly running = signal(false);
  /** The poll gave up before the run settled — honest, and NOT an error. */
  readonly runSlow = signal(false);
  readonly lastRun = signal<RitualRun | null>(null);
  readonly runs = signal<readonly RitualRun[]>([]);

  private pollSub?: Subscription;

  // Create-draft form state.
  readonly newName = signal('');
  readonly newTrigger = signal<RitualTrigger>('manual');
  readonly newSink = signal<RitualSink>('chat');

  /** The equipped-active Skills a step may use (ritual.go ValidateSteps). */
  readonly palette = computed<readonly LoadoutGrant[]>(() => {
    const lv = this.loadout();
    if (!lv) return [];
    return lv.grants.filter(
      (g) => g.equipped && g.skillKind === 'active' && g.catalogueActive,
    );
  });

  /** Effective step cap (5, or 8 with the long_weaving craft owned). */
  readonly stepCap = computed<number>(() => {
    const lv = this.loadout();
    const hasLongWeaving =
      !!lv && lv.grants.some((g) => g.skillKey === CRAFT_LONG_WEAVING);
    return ritualStepCap(hasLongWeaving);
  });

  readonly atStepCap = computed(() => this.draftSteps().length >= this.stepCap());
  readonly canPublish = computed(() => {
    const n = this.draftSteps().length;
    return n >= 1 && n <= this.stepCap() && !this.saving();
  });
  /**
   * The draft's composed price (N8), or why it cannot be totalled.
   *
   * ⚠ Deliberately NOT gating publish. This is a MIRROR of the domain's
   * constants and the SERVER holds the catalogue, so a grant can lack
   * `policyClass` here while the server prices it perfectly well; refusing
   * client-side would block a publish the server would accept. The unwired-sink
   * greying can refuse locally because there the server SERVES its own wired
   * list. Here it does not, so this is loud rather than obstructive.
   */
  readonly draftPrice = computed<RitualPriceEstimate>(() =>
    composeRitualPrice(this.draftSteps(), (key) => this.policyClassOf(key)),
  );

  /**
   * What ONE step adds to the price. The total tells the learner what the
   * routine costs; this tells them WHICH step is the expensive one, which is
   * the part they can act on.
   *
   * ⚠ `included` and `unknown` are separate answers and must render
   * separately. Collapsing them tells the learner a premium step is free,
   * which is the same understatement the routine total refuses, one level down.
   */
  readonly stepCosts = computed<readonly StepCost[]>(() =>
    this.draftSteps().map((step) => {
      const uplift = ritualStepUplift(this.policyClassOf(step.skillKey));
      if (uplift === undefined) return { kind: 'unknown' };
      return uplift === 0
        ? { kind: 'included' }
        : { kind: 'uplift', units: uplift };
    }),
  );

  /** Index-addressed for the template; `stepCosts` is the computed behind it. */
  stepCost(index: number): StepCost {
    return this.stepCosts()[index] ?? { kind: 'unknown' };
  }

  /** The policy class on this Skill's grant row, if the catalogue named one. */
  private policyClassOf(skillKey: string): string | undefined {
    return this.loadout()?.grants.find((g) => g.skillKey === skillKey)
      ?.policyClass;
  }

  readonly canCreate = computed(() => {
    const name = this.newName().trim();
    return name.length > 0 && name.length <= this.nameMaxLen && !this.saving();
  });
  /** A ritual can run only once it has a published revision. */
  readonly canRun = computed(() => {
    const r = this.selected();
    return !!r && r.currentRevision > 0 && !this.running();
  });

  // ── CHO-2362: per-step param editor state ──────────────────────────────────

  /** The currently selected draft step, if any. */
  readonly selectedStep = computed<RitualStep | null>(() => {
    const i = this.selectedStepIndex();
    if (i === null) return null;
    return this.draftSteps()[i] ?? null;
  });

  /**
   * The selected step's param sheet in sheet order. Empty when the Skill has
   * no editable parameters (no sheet on its grant row) or the grant is gone.
   */
  readonly selectedStepSchemaEntries = computed<readonly SchemaEntry[]>(() => {
    const step = this.selectedStep();
    if (!step) return [];
    const schema = this.schemaForKey(step.skillKey, this.loadout());
    if (!schema) return [];
    return Object.entries(schema).map(([name, spec]) => ({ name, spec }));
  });

  /**
   * Compact per-step params summaries, index-aligned with draftSteps (e.g.
   * "style: story · window: week"; ref params show the picked title once the
   * source has loaded, a short "#id" token before that - never fabricated).
   */
  readonly stepSummaries = computed<readonly string[]>(() => {
    const lv = this.loadout();
    const concepts = this.conceptSource();
    const edges = this.edgeSource();
    return this.draftSteps().map((step) =>
      this.summarizeStep(step, lv, concepts, edges),
    );
  });

  /**
   * Which ref sources the composer currently needs: the selected step's
   * editor (any ref entry), plus any draft step carrying an EXPLICIT ref
   * value (its chip summary shows the title). Drives the lazy loads below.
   */
  private readonly refSourcesWanted = computed<{
    readonly concepts: boolean;
    readonly edges: boolean;
  }>(() => {
    let concepts = false;
    let edges = false;
    const mark = (type: SkillParamType) => {
      if (type === 'concept_ref') concepts = true;
      if (type === 'growth_edge_ref') edges = true;
    };
    for (const entry of this.selectedStepSchemaEntries()) mark(entry.spec.type);
    const lv = this.loadout();
    for (const step of this.draftSteps()) {
      const schema = this.schemaForKey(step.skillKey, lv);
      if (!schema) continue;
      for (const [name, spec] of Object.entries(schema)) {
        const v = step.params?.[name];
        if (typeof v === 'string' && v.trim() !== '') mark(spec.type);
      }
    }
    return { concepts, edges };
  });

  constructor() {
    // Lazily load a ref-picker source the FIRST time it is needed (a ref
    // param shown in the editor, or a saved ref value needing its title).
    // An errored source never auto-reloads - only the explicit retry does.
    effect(() => {
      const want = this.refSourcesWanted();
      untracked(() => {
        if (want.concepts) this.ensureRefSource('concept_ref');
        if (want.edges) this.ensureRefSource('growth_edge_ref');
      });
    });
  }

  private loadRituals(id: string): Observable<ListState> {
    if (!id) return of<ListState>({ status: 'loading' });
    return this.ritualSvc.listRituals(id).pipe(
      map((listing): ListState => ({
        status: 'success',
        rituals: listing.rituals,
        wiredSinks: listing.wiredSinks,
        sinksReported: listing.sinksReported,
      })),
      catchError(() => of<ListState>({ status: 'error' })),
      startWith<ListState>({ status: 'loading' }),
    );
  }

  reloadList(): void {
    this.reloadList$.next();
  }

  // ── Create-draft flow ──────────────────────────────────────────────────────
  startCreate(): void {
    this.newName.set('');
    this.newTrigger.set('manual');
    this.newSink.set('chat');
    this.mode.set('create');
  }

  cancelCreate(): void {
    this.mode.set('list');
  }

  submitCreate(): void {
    if (!this.canCreate()) return;
    this.saving.set(true);
    const body: CreateRitualRequest = {
      name: this.newName().trim(),
      trigger: this.newTrigger(),
      sink: this.newSink(),
    };
    this.ritualSvc.createRitual(this.familiarId(), body).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.reloadList();
        this.openRitual(r);
        this.toast.show('familiar_grimoire.toast.created', 'success');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.toast.show(this.ritualErrorKey(err), 'error');
      },
    });
  }

  // ── Compose flow ────────────────────────────────────────────────────────────
  openRitual(r: Ritual): void {
    this.stopPoll(); // a poll belongs to the ritual that started it
    this.running.set(false);
    this.runSlow.set(false);
    this.selected.set(r);
    this.draftSteps.set([...r.steps]);
    this.selectedStepIndex.set(null);
    this.publishErrorDetail.set(null);
    this.conceptFilter.set('');
    this.edgeFilter.set('');
    this.lastRun.set(null);
    this.mode.set('compose');
    this.loadRuns(r);
  }

  backToList(): void {
    this.stopPoll();
    this.running.set(false);
    this.runSlow.set(false);
    this.selected.set(null);
    this.publishErrorDetail.set(null);
    this.mode.set('list');
  }

  addStepFromPalette(g: LoadoutGrant): void {
    if (this.atStepCap()) {
      this.toast.show('familiar_grimoire.toast.step_cap', 'error');
      return;
    }
    this.draftSteps.update((steps) => [...steps, { skillKey: g.skillKey }]);
    this.selectedStepIndex.set(this.draftSteps().length - 1);
  }

  removeStep(index: number): void {
    this.draftSteps.update((steps) => steps.filter((_, i) => i !== index));
    if (this.selectedStepIndex() === index) this.selectedStepIndex.set(null);
  }

  selectStep(index: number): void {
    this.selectedStepIndex.set(index);
  }

  /**
   * The ONE reorder mutation (ruling R-a). Pointer drops and keyboard moves are
   * two ways to ask for the same thing, so they must not be two implementations
   * of it: the one that drifts is always the one fewer people exercise.
   */
  moveStep(from: number, to: number): void {
    const next = [...this.draftSteps()];
    if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) {
      return;
    }
    moveItemInArray(next, from, to);
    this.draftSteps.set(next);
    this.selectedStepIndex.update((sel) => this.selectionAfterMove(sel, from, to));
  }

  /**
   * Where the selection lands after a move.
   *
   * ⚠ `selectedStepIndex` is an INDEX and the inspector renders whatever sits
   * at it, so a move that does not carry the selection silently repoints the
   * param editor at a DIFFERENT step while the learner is editing it. That was
   * live on the pointer path before this change, and it is the kind of bug
   * nobody reports because it looks like their own mis-click.
   */
  private selectionAfterMove(
    sel: number | null,
    from: number,
    to: number,
  ): number | null {
    if (sel === null) return null;
    if (sel === from) return to; // the selected step is the one being carried
    if (from < sel && sel <= to) return sel - 1; // it shifted up past the gap
    if (to <= sel && sel < from) return sel + 1; // it shifted down
    return sel; // the move did not straddle it
  }

  onStepDrop(event: CdkDragDrop<readonly RitualStep[]>): void {
    this.moveStep(event.previousIndex, event.currentIndex);
  }

  /** The keyboard path (Alt+Arrow, Alt+Home/End) via ReorderableListDirective. */
  onStepReorder(event: ReorderEvent): void {
    this.moveStep(event.from, event.to);
  }

  /**
   * How a step names itself in the reorder announcement. The DISPLAY key, never
   * the raw `skillKey`: a screen reader reading "weakness_sight" out loud is
   * letter salad, and the composer already prints the display name everywhere
   * else on the card.
   */
  stepRowLabel = (index: number): string => {
    const step = this.draftSteps()[index];
    return step ? this.skillLabelKey(step.skillKey) : '';
  };

  /** True when the last replay attempt failed. Cleared on the next attempt. */
  readonly replayError = signal(false);

  /**
   * Open ONE past run's story from the history list.
   *
   * The history showed a status and a mana figure and nothing else, so the
   * story of any run but the latest was unreachable. This reads the single-run
   * endpoint rather than filtering the list, which is capped at 50 and ordered
   * newest-first, so an older run is not addressable there at all.
   *
   * A failure is LOUD. A button that appears to do nothing is the same defect
   * as a silent keyboard no-op one layer up: the learner cannot tell a broken
   * control from an empty result.
   */
  replayRun(runId: string): void {
    const r = this.selected();
    if (!r) return;
    this.replayError.set(false);
    this.ritualSvc.getRun(this.familiarId(), r.ritualId, runId).subscribe({
      next: (run) => this.lastRun.set(run),
      error: () => this.replayError.set(true),
    });
  }

  publish(): void {
    const r = this.selected();
    if (!r || !this.canPublish()) return;
    this.saving.set(true);
    this.publishErrorDetail.set(null);
    this.ritualSvc
      .publishRitual(this.familiarId(), r.ritualId, { steps: this.draftSteps() })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.selected.set(updated);
          this.draftSteps.set([...updated.steps]);
          this.reloadList();
          this.toast.show('familiar_grimoire.toast.published', 'success');
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.surfaceRitualError(err);
        },
      });
  }

  /**
   * Start a run. The POST acks 202 with a `running` record (its steps take ~30s
   * server-side — longer than the gateway's 5s route budget, which is why the
   * run is async): we render that as a calm "running" state and poll Run history
   * for the terminal. A healthy run NEVER toasts an error — only a real refusal
   * (402 mana / 403 locked / 404 / 422) does, and those still arrive
   * synchronously on the POST.
   */
  run(): void {
    const r = this.selected();
    if (!r || !this.canRun()) return;
    this.stopPoll();
    this.running.set(true);
    this.runSlow.set(false);
    this.lastRun.set(null);
    this.ritualSvc.runRitual(this.familiarId(), r.ritualId).subscribe({
      next: (run) => {
        this.lastRun.set(run); // the non-error acknowledgement, rendered at once
        if (isRunTerminal(run.status)) {
          // Terminal at ack (skipped_budget — a designed pause). Nothing to poll.
          this.running.set(false);
          this.loadRuns(r);
          return;
        }
        this.pollRun(r, run.runId);
      },
      error: (err: unknown) => {
        this.running.set(false);
        this.surfaceRitualError(err);
      },
    });
  }

  /**
   * Poll Run history until this run settles. A failed poll tick is NOT an error
   * — the run is fine server-side, we just could not read it this time — so it
   * keeps the loop alive rather than toasting.
   */
  private pollRun(r: Ritual, runId: string): void {
    let attempts = 0;
    this.pollSub = interval(RUN_POLL_INTERVAL_MS)
      .pipe(
        switchMap(() =>
          this.ritualSvc
            .listRuns(this.familiarId(), r.ritualId)
            .pipe(catchError(() => of<readonly RitualRun[]>([]))),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((runs) => {
        attempts++;
        if (runs.length > 0) this.runs.set(runs);

        const mine = runs.find((run) => run.runId === runId);
        if (mine && isRunTerminal(mine.status)) {
          this.lastRun.set(mine);
          this.running.set(false);
          this.stopPoll();
          return;
        }
        if (attempts >= RUN_POLL_MAX_ATTEMPTS) {
          // Out of patience, not out of luck: the run is still going and its
          // terminal WILL land in Run history. Say that — never "went wrong".
          this.running.set(false);
          this.runSlow.set(true);
          this.stopPoll();
        }
      });
  }

  /** Cancel an in-flight poll (terminal reached, ritual switched, or gave up). */
  stopPoll(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = undefined;
  }

  private loadRuns(r: Ritual): void {
    this.ritualSvc.listRuns(this.familiarId(), r.ritualId).subscribe({
      next: (runs) => this.runs.set(runs),
      error: () => this.runs.set([]),
    });
  }

  triggerLabelKey(trigger: string): string {
    return `familiar_grimoire.trigger.${trigger}`;
  }

  sinkLabelKey(sink: string): string {
    return `familiar_grimoire.sink.${sink}`;
  }

  /**
   * N5: whether this deployment has a writer registered for `sink`.
   *
   * An unwired sink is greyed in the picker rather than hidden, so the learner
   * can see that the capability exists and is not yet available. The server is
   * the control: publishing one is refused with 422 RITUAL_SINK_NOT_WIRED
   * regardless of what this returns.
   */
  sinkWired(sink: string): boolean {
    return (this.wiredSinks() as readonly string[]).includes(sink);
  }

  /**
   * The reason a greyed sink is greyed. A greyed control with no reason reads
   * as a bug, so every disabled option carries one.
   */
  sinkUnavailableKey(): string {
    // Two facts, two sentences. Both grey the sink; only one is transient.
    // Collapsing them into one message is the defect the B3b ruling corrected:
    // an absence must be distinguished by the words, never by an empty result.
    return this.sinksReported()
      ? 'familiar_grimoire.sink_not_available'
      : 'familiar_grimoire.sink_not_reported';
  }

  /**
   * The hint under the sink picker, which follows the same split as the option
   * reason: a skew we expect to pass reads differently from a settled state.
   */
  sinkAvailabilityHintKey(): string {
    return this.sinksReported()
      ? 'familiar_grimoire.sink_availability_hint'
      : 'familiar_grimoire.sink_availability_unknown_hint';
  }

  /**
   * One sink option's full label, reason included.
   *
   * Composed in TS rather than in the template because an `<option>` may only
   * contain text: a nested `<span>` renders fine under jsdom and is stripped by
   * a real browser, so the reason would have passed its test and vanished in
   * production.
   */
  sinkOptionLabel(sink: string): string {
    const name = this.translate.instant(this.sinkLabelKey(sink));
    if (this.sinkWired(sink)) {
      return name;
    }
    return `${name} (${this.translate.instant(this.sinkUnavailableKey())})`;
  }

  /**
   * A Skill's learner-facing display name (N6). The loadout already renders
   * `familiar_skill.{key}`; the composer used to print the raw machine key, so
   * a learner dragged a card that said `socratic_drill`. One key, both editors.
   */
  skillLabelKey(skillKey: string): string {
    return `familiar_skill.${skillKey}`;
  }

  // ── CHO-2362: per-step param editing ───────────────────────────────────────

  /** The param sheet on a Skill's grant row, if any (full loadout, not palette). */
  private schemaForKey(
    skillKey: string,
    lv: LoadoutView | null,
  ): SkillParamsSchema | undefined {
    return lv?.grants.find((g) => g.skillKey === skillKey)?.paramsSchema;
  }

  /** The selected step's EXPLICIT value for a param ('' when unset). */
  private explicitParamValue(name: string): string {
    const step = this.selectedStep();
    const v = step?.params?.[name];
    return typeof v === 'string' ? v : '';
  }

  /**
   * The value a control shows: the step's explicit value, else the schema
   * default (so an enum select sits on its default until the learner picks).
   */
  paramControlValue(name: string): string {
    const explicit = this.explicitParamValue(name);
    if (explicit !== '') return explicit;
    const entry = this.selectedStepSchemaEntries().find((e) => e.name === name);
    return entry?.spec.default ?? '';
  }

  /**
   * Set one param on the selected step. Values are wire STRINGS; a blank
   * value UNSETS the param (absent = the Skill's default, always valid).
   * A step with no params left drops its `params` key entirely.
   */
  setStepParam(name: string, value: string): void {
    const idx = this.selectedStepIndex();
    if (idx === null) return;
    this.draftSteps.update((steps) =>
      steps.map((step, i) => {
        if (i !== idx) return step;
        const next: Record<string, unknown> = { ...(step.params ?? {}) };
        if (value.trim() === '') {
          delete next[name];
        } else {
          next[name] = value;
        }
        return Object.keys(next).length > 0
          ? { skillKey: step.skillKey, params: next }
          : { skillKey: step.skillKey };
      }),
    );
  }

  /**
   * Number-input change hook: ngModel hands a number (or null on a cleared
   * box); the wire wants a numeric STRING (e.g. "4"). Bounds stay with the
   * server (422 RITUAL_INVALID surfaces its plain-language detail).
   */
  setStepParamFromNumber(name: string, value: number | string | null): void {
    if (value === null || value === undefined || value === '') {
      this.setStepParam(name, '');
      return;
    }
    this.setStepParam(name, String(value));
  }

  /**
   * Live character count for a text param, in CODE POINTS to mirror the
   * server's rune cap (UTF-16 .length overcounts astral characters).
   */
  paramRuneCount(name: string): number {
    return [...this.explicitParamValue(name)].length;
  }

  isRefType(type: SkillParamType): boolean {
    return type === 'concept_ref' || type === 'growth_edge_ref';
  }

  refSourceFor(type: SkillParamType): RefSourceState {
    return type === 'concept_ref' ? this.conceptSource() : this.edgeSource();
  }

  refFilterValue(type: SkillParamType): string {
    return type === 'concept_ref' ? this.conceptFilter() : this.edgeFilter();
  }

  setRefFilter(type: SkillParamType, value: string): void {
    (type === 'concept_ref' ? this.conceptFilter : this.edgeFilter).set(value);
  }

  /**
   * The options a ref select shows: title-filtered by the search box, with
   * the currently picked option always kept visible so the control never
   * silently blanks a set value.
   */
  refOptionsFor(type: SkillParamType, currentId: string): readonly RefOption[] {
    const src = this.refSourceFor(type);
    if (src.status !== 'success') return [];
    const needle = this.refFilterValue(type).trim().toLowerCase();
    const filtered =
      needle === ''
        ? src.options
        : src.options.filter((o) => o.title.toLowerCase().includes(needle));
    if (
      currentId !== '' &&
      !filtered.some((o) => o.id === currentId)
    ) {
      const current = src.options.find((o) => o.id === currentId);
      if (current) return [...filtered, current];
    }
    return filtered;
  }

  /** i18n key builder for the ref-picker copy (concept_* / edge_* leaves). */
  refKey(type: SkillParamType, leaf: string): string {
    const family = type === 'concept_ref' ? 'concept' : 'edge';
    return `familiar_grimoire.params.${family}_${leaf}`;
  }

  /**
   * The unset option's label key: "Auto" for an optional ref (absent = the
   * Skill's context default, e.g. map_sight's resonant centre / the top
   * growth edge), "not chosen yet" phrasing for a required one. Both remain
   * selectable - required never blocks, and a learner may always step back.
   */
  unsetOptionKey(type: SkillParamType, required: boolean): string {
    if (required) return 'familiar_grimoire.params.unset_required';
    return this.refKey(type, 'auto');
  }

  paramNameKey(name: string): string {
    return `familiar_grimoire.params.name.${name}`;
  }

  paramValueKey(value: string): string {
    return `familiar_grimoire.params.value.${value}`;
  }

  /** Explicit retry for a failed ref source (the only path that re-loads it). */
  retryRefSource(type: SkillParamType): void {
    this.loadRefSource(type);
  }

  /** Load a ref source only from idle (error waits for the explicit retry). */
  private ensureRefSource(type: 'concept_ref' | 'growth_edge_ref'): void {
    const src = type === 'concept_ref' ? this.conceptSource : this.edgeSource;
    if (src().status !== 'idle') return;
    this.loadRefSource(type);
  }

  private loadRefSource(type: SkillParamType): void {
    if (type === 'concept_ref') {
      this.conceptSource.set({ status: 'loading' });
      this.conceptGraphSvc.getGraph().subscribe({
        next: (graph) =>
          this.conceptSource.set({
            status: 'success',
            options: graph.concepts.map((c) => ({
              id: c.conceptId,
              title: c.title,
            })),
          }),
        error: () => this.conceptSource.set({ status: 'error' }),
      });
      return;
    }
    // growth_edge_ref: the growth-edges list serves id + concept_label
    // cheaply (listAll walks the few pages a learner has), so the picker
    // offers real titles rather than falling back to Auto-only.
    this.edgeSource.set({ status: 'loading' });
    this.growthEdgesSvc.listAll().subscribe({
      next: (page) =>
        this.edgeSource.set({
          status: 'success',
          options: page.items.map((e) => ({ id: e.id, title: e.concept_label })),
        }),
      error: () => this.edgeSource.set({ status: 'error' }),
    });
  }

  /** Compact "name: value" summary line for one step's params. */
  private summarizeStep(
    step: RitualStep,
    lv: LoadoutView | null,
    concepts: RefSourceState,
    edges: RefSourceState,
  ): string {
    const params = step.params ?? {};
    const schema = this.schemaForKey(step.skillKey, lv);
    // Sheet order first (stable, matches the editor), then any stray keys.
    const names = schema
      ? [
          ...Object.keys(schema),
          ...Object.keys(params).filter((n) => !(n in schema)),
        ]
      : Object.keys(params);
    const parts: string[] = [];
    for (const name of names) {
      const v = params[name];
      if (typeof v !== 'string' || v.trim() === '') continue;
      const spec = schema?.[name];
      let display = v;
      if (spec && this.isRefType(spec.type)) {
        const src = spec.type === 'concept_ref' ? concepts : edges;
        const title =
          src.status === 'success'
            ? src.options.find((o) => o.id === v)?.title
            : undefined;
        display = title ?? `#${v.slice(0, 8)}`;
      } else if (spec?.type === 'text') {
        const points = [...v];
        display =
          points.length > 24 ? `${points.slice(0, 24).join('')}…` : v;
      }
      parts.push(`${name}: ${display}`);
    }
    return parts.join(' · ');
  }

  /**
   * Fail-loud error surfacing for publish/run refusals: always the canonical
   * toast; a 422 RITUAL_INVALID additionally pins the server's plain-language
   * detail to the composer's error strip (the learner sees exactly WHY).
   */
  private surfaceRitualError(err: unknown): void {
    const code = (err as { error?: { code?: string } })?.error?.code;
    const message = (err as { error?: { message?: string } })?.error?.message;
    if (
      code === 'RITUAL_INVALID' &&
      typeof message === 'string' &&
      message.trim() !== ''
    ) {
      this.publishErrorDetail.set(message);
    }
    this.toast.show(this.ritualErrorKey(err), 'error');
  }

  /** Map a rituals-family conflict to a canonical i18n key (status preserved). */
  private ritualErrorKey(err: unknown): string {
    const status = (err as { status?: number })?.status;
    const code = (err as { error?: { code?: string } })?.error?.code;
    if (status === 402) return 'familiar_grimoire.error.mana';
    switch (code) {
      case 'RITUALS_LOCKED':
        return 'familiar_grimoire.error.locked';
      case 'RITUAL_QUOTA_REACHED':
        return 'familiar_grimoire.error.quota';
      case 'RITUAL_INVALID':
        return 'familiar_grimoire.error.invalid';
      case 'RITUAL_NOT_FOUND':
        return 'familiar_grimoire.error.not_found';
      default:
        return 'familiar_grimoire.error.generic';
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByRitualId(_index: number, r: Ritual): string {
    return r.ritualId;
  }

  trackBySkillKey(_index: number, g: LoadoutGrant): string {
    return g.skillKey;
  }

  trackByRunId(_index: number, r: RitualRun): string {
    return r.runId;
  }
}
