/**
 * DailyDoseComponent — A+ Daily Dose with Ebbinghaus spaced-repetition
 * ordering, per-Familiar nudge, mana gating, and streak indicator (WS-12).
 *
 * WS-12 additions (2026-05-26):
 *   - Carousel renders atoms ordered by Ebbinghaus retention urgency (BE-side).
 *   - Each card shows a retention indicator using `--chora-retention-{state}`.
 *   - Per-Familiar nudge card at carousel top (when `familiar_nudge` present).
 *   - Mana gating: if user's tier is Basic and nudge is Standard+, show upsell.
 *   - Streak: current streak days + at-risk pulse when last completion >18h ago.
 *   - "Review" CTA navigates to `/a/atoms/{id}/play?returnUrl=/a/daily-dose`.
 *
 * Domain vocabulary: `DailyDose`, `LearningAtom`, `Familiar`, `Ebbinghaus`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of, take } from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { AtomCardComponent } from '../../../../shared/components/atom-card/atom-card.component';
import { AtomService } from '../../../../features/atomic/services/atom.service';
import type { LearningAtom } from '../../../../features/atomic/models/atom.models';
import { ActiveFamiliarService } from '../../../../core/familiar/active-familiar.service';
import { GoalService } from '../dashboard/goal/goal.service';
import { MeManaService } from '../../../../core/services/me-mana.service';
import {
  SpacedRepetitionService,
  retentionStateFromCategory,
  retentionColorVar,
  retentionIconClass,
} from '../../../../core/services/spaced-repetition.service';
import { AiLabelChipComponent } from '../../../../shared/components/ai-label-chip/ai-label-chip.component';
import { BreedArtComponent } from '../../../../shared/components/breed-art/breed-art.component';
import type {
  BreedSpecies,
  BreedStage,
} from '../../../../shared/components/breed-art/breed-art.component';
import { DailyDoseService } from './daily-dose.service';
import { CampaignPracticeComponent } from './campaign-practice/campaign-practice.component';
import {
  DailyDoseAtom,
  DailyDoseStreak,
  DoseScope,
  FamiliarNudge,
  categoryBadgeClass,
  formatHoursUntil,
} from './daily-dose.model';

/** Threshold: last dose completion >18 hours ago = streak at risk. */
const STREAK_AT_RISK_MS = 18 * 60 * 60 * 1000;

@Component({
  selector: 'chora-aplus-daily-dose',
  imports: [
    RouterLink,
    TranslatePipe,
    AtomCardComponent,
    AiLabelChipComponent,
    BreedArtComponent,
    CampaignPracticeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-dose.component.html',
  styleUrl: './daily-dose.component.scss',
})
export class DailyDoseComponent implements OnInit {
  private readonly doseService = inject(DailyDoseService);
  private readonly atomService = inject(AtomService);
  private readonly activeFamiliar = inject(ActiveFamiliarService);
  private readonly goalService = inject(GoalService);
  private readonly manaService = inject(MeManaService);
  // SpacedRepetitionService injected to be available for "play" flow handoff.
  readonly srService = inject(SpacedRepetitionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** F4 paydown — discriminated state from the service (loading / success / error). */
  readonly state = this.doseService.state;
  /** Convenience: success-state payload or null otherwise. */
  readonly dose = this.doseService.dose;
  readonly isLoading = computed<boolean>(() => this.state().status === 'loading');
  readonly isError = computed<boolean>(() => this.state().status === 'error');
  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  // ── Familiar greeting (B2-C / daily-dose/ai progressive enhancement) ───
  // The deterministic dose renders instantly with a templated `familiarQuote`;
  // the service then fetches the REAL AI greeting (+ Recommender narrative)
  // async and exposes them via these signals. The displayed greeting prefers
  // the AI greeting, then any greeting embedded in the dose, else null (the
  // template falls back to `familiarQuote`).
  private readonly aiGreeting = this.doseService.aiGreeting;
  private readonly aiNarrative = this.doseService.aiNarrative;

  readonly familiarGreeting = computed<string | null>(
    () => this.aiGreeting() ?? this.dose()?.familiarGreeting ?? null,
  );
  readonly recommenderNarrative = computed<string | null>(() =>
    this.asProse(this.aiNarrative() ?? this.dose()?.recommenderNarrative),
  );

  /**
   * Guard against a non-prose Recommender "narrative" leaking to the learner.
   * The Recommender agent can bail with a raw JSON envelope (optionally fenced
   * as ```json …```) — e.g. `{"reason":"…","recommendations":[]}` when a
   * candidate atom has an empty title/snippet. That must NEVER render as the
   * Familiar's pick-rationale; return null so the template keeps the
   * deterministic narrative. Fenced PROSE is unwrapped and shown.
   */
  private asProse(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const unfenced = raw
      .trim()
      .replace(/^```[a-z]*\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    if (!unfenced || unfenced.startsWith('{') || unfenced.startsWith('[')) {
      return null;
    }
    return unfenced;
  }

  // ── AI picks (M2 / ADR-196) ────────────────────────────────────────
  // The async `/daily-dose/ai` enrichment returns `ai_picks` (bare atom_ids).
  // The constructor effect below resolves each to a LearningAtom via
  // AtomService (fail-SOFT per pick — a pick that 404s/errors is skipped) and
  // publishes the survivors here. Loaded async like the greeting/narrative
  // enhancement — it NEVER blocks the deterministic dose render.
  private readonly _aiPickAtoms = signal<readonly LearningAtom[]>([]);
  readonly aiPickAtoms = this._aiPickAtoms.asReadonly();

  /** True once ≥1 AI-pick atom has resolved (fail-soft hides the section). */
  readonly hasAiPicks = computed<boolean>(() => this._aiPickAtoms().length > 0);

  // ── Focused mode (Growth Edge deep-link, Phase 2B) ─────────────────
  // Populated from OPTIONAL `growth_edge_id` + `concept` query params in
  // ngOnInit. When `growthEdgeId` is set, the dose is scoped to that Growth
  // Edge and a focused-practice header is shown; otherwise the page is
  // byte-identical to the unscoped Daily Dose.
  readonly growthEdgeId = signal<string | null>(null);
  readonly focusedConcept = signal<string | null>(null);
  readonly isFocused = computed<boolean>(() => this.growthEdgeId() !== null);

  /**
   * OPTIONAL `goal_id` query param (map deep-link) scopes the dose to one
   * Goal. Independent of `growthEdgeId`; absent leaves the request unchanged.
   * NB in campaign mode `goal_id` is consumed by `campaignGoalId` instead and
   * no dose load happens at all.
   */
  readonly goalId = signal<string | null>(null);

  // ── Campaign practice mode (WS-C7 hex-tap deep-link, CHO-2086) ──────
  // Populated from OPTIONAL `campaign_node` + `goal_id` + `concept` query
  // params in ngOnInit. When `campaignNode` is set the page mounts the
  // campaign-practice child INSTEAD of the dose flow (the dose load + tick are
  // skipped); absent → byte-identical to the pre-existing dose behaviour.
  readonly campaignNode = signal<string | null>(null);
  readonly campaignGoalId = signal<string>('');
  readonly campaignConcept = signal<string>('');

  constructor() {
    // Companion dispatch. Hands the companion OF RECORD (see
    // `companionOfRecordId`) to ActiveFamiliarService so the mascot strip and
    // the chat-open dispatch reflect the same Companion this rail names.
    //
    // Guarded against re-dispatch: `setActiveFamiliarId` fires a growth GET,
    // and this effect re-runs whenever the dose or the goals list settles, so
    // without the guard a single page load would issue the same fetch several
    // times over.
    effect(() => {
      const id = this.companionOfRecordId();
      if (!id || id === this.lastDispatchedCompanionId) return;
      this.lastDispatchedCompanionId = id;
      this.activeFamiliar.setActiveFamiliarId(id);
    });
    // M2 (ADR-196): resolve the AI-pick atom_ids → LearningAtoms whenever the
    // enrichment publishes a new set. Fail-soft per pick (a 404/error pick is
    // skipped); runs async — the dose is already rendered. `_aiPickAtoms` is
    // written only from the subscription, so the section never flashes stale.
    effect(() => {
      const sources = this.doseService
        .aiPicks()
        .map((id) =>
          this.atomService.loadAtom(id).pipe(take(1), catchError(() => of(null))),
        );
      (sources.length ? forkJoin(sources) : of<(LearningAtom | null)[]>([]))
        .subscribe((atoms) =>
          this._aiPickAtoms.set(
            atoms.filter((a): a is LearningAtom => a !== null),
          ),
        );
    });
    // Load mana balance so mana-gating computed signals have fresh data.
    this.manaService.load();
  }

  /** Currently shown card index. */
  readonly activeIndex = signal<number>(0);

  /** Recomputed every second from `setInterval`. */
  readonly nowTick = signal<number>(Date.now());
  private tickHandle: ReturnType<typeof setInterval> | null = null;

  // ── Derived state ─────────────────────────────────────────────────

  /** Atoms ordered by Ebbinghaus retention urgency (BE-side: low→medium→unknown). */
  readonly atoms = computed<readonly DailyDoseAtom[]>(
    () => this.dose()?.atoms ?? [],
  );

  readonly activeAtom = computed<DailyDoseAtom | null>(() => {
    const atoms = this.atoms();
    const idx = this.activeIndex();
    return atoms[idx] ?? null;
  });

  /**
   * True when the BFF answered 200 but composed ZERO atoms (learner not
   * enrolled, nothing projected yet). Distinct from loading and from error:
   * an empty dose is a legitimate outcome, not a failure, so it must not
   * render the fail-loud banner, and it must not render the card-stack
   * chrome either, which would otherwise frame an empty stack.
   */
  readonly isEmpty = computed<boolean>(
    () => this.state().status === 'success' && this.atoms().length === 0,
  );

  /**
   * The server's own explanation for an empty dose (`DoseMessageFor`). Shown
   * verbatim so the learner gets the authoritative reason rather than a
   * client-side guess; null when absent or blank so the template falls back
   * to local copy.
   */
  readonly emptyMessage = computed<string | null>(() => {
    const message = this.dose()?.message?.trim();
    return message ? message : null;
  });

  readonly composition = computed(() => this.dose()?.composition ?? null);

  /**
   * Goal-scope disclosure for a goal-scoped dose (ADR-242 D2): how today's
   * SERVED cards split between this goal, its topics, and the learner's wider
   * enrolment. Null whenever the BFF sent no block (no goal_id on the request,
   * or the goal did not resolve): the header then says nothing about scope
   * rather than presenting a guessed split as a measurement.
   */
  readonly scope = computed<DoseScope | null>(() => this.dose()?.scope ?? null);

  readonly totalXp = computed<number>(() => this.dose()?.totalXpAvailable ?? 0);

  readonly countdownLabel = computed<string>(() => {
    const dose = this.dose();
    if (!dose) return '--:--:--';
    return formatHoursUntil(dose.nextDoseAt, new Date(this.nowTick()));
  });

  readonly canGoPrev = computed<boolean>(() => this.activeIndex() > 0);
  readonly canGoNext = computed<boolean>(
    () => this.activeIndex() < this.atoms().length - 1,
  );

  readonly progressPercent = computed<number>(() => {
    const atoms = this.atoms();
    if (atoms.length === 0) return 0;
    return Math.round(((this.activeIndex() + 1) / atoms.length) * 100);
  });

  // ── Streak state (WS-12) ──────────────────────────────────────────

  readonly streak = computed<DailyDoseStreak | null>(
    () => this.dose()?.streak ?? null,
  );

  /**
   * True when last dose activity was >18h ago (streak at risk).
   * Triggers a subtle pulse animation on the streak indicator.
   */
  readonly streakAtRisk = computed<boolean>(() => {
    void this.nowTick(); // re-evaluate each tick
    const s = this.streak();
    if (!s || !s.lastActivityAt) return false;
    if (s.status === 'broken') return false;
    const sinceMs = Date.now() - new Date(s.lastActivityAt).getTime();
    return sinceMs > STREAK_AT_RISK_MS;
  });

  // ── Familiar nudge state (WS-12-NUDGE) ───────────────────────────

  /**
   * The nudge atom from the active Familiar, if present.
   * WS-12-NUDGE: populated by BE once `GET /api/v1/familiars/{id}/recommended-atoms`
   * is wired. Currently absent in all real responses.
   */
  readonly familiarNudge = computed<FamiliarNudge | null>(
    () => this.dose()?.familiar_nudge ?? null,
  );

  /**
   * True when the nudge is present AND the user's mana tier is Basic
   * (nudge is a Standard+ feature). Renders the upsell card.
   *
   * Mana gating: `familiar_plan` subsidy source = Standard+.
   * Basic users have no `familiar_plan` subsidy entry.
   * WS-12-MANA: this is a best-effort client-side gate — the BE enforces
   * the tier authoritatively on the recommended-atoms endpoint.
   */
  readonly nudgeRequiresUpgrade = computed<boolean>(() => {
    const nudge = this.familiarNudge();
    if (!nudge) return false;
    if (nudge.requires_standard_tier) return true;
    // Secondary client-side gate: no familiar_plan subsidy = Basic tier.
    const mana = this.manaService.mana();
    if (!mana) return false;
    const hasFamiliarPlan = (mana.subsidy_breakdown ?? []).some(
      (s) => s.source === 'familiar_plan',
    );
    return !hasFamiliarPlan;
  });

  // ── Companion rail identity (CHO-2403) ────────────────────────────

  /** Last id handed to ActiveFamiliarService, so the effect dispatches once. */
  private lastDispatchedCompanionId: string | null = null;

  /**
   * The Familiar the BFF says is greeting for THIS dose (CHO-1577), or null
   * when the dose named none (every Familiar pre-hatch, or an empty roster).
   */
  private readonly greeterId = computed<string | null>(
    () => this.dose()?.greeting_from?.familiar_id ?? null,
  );

  /**
   * The Companion the learner attached to the Goal this dose is scoped to, or
   * null when the dose is unscoped, the goal is not in the list yet, or the
   * goal holds no bond.
   *
   * Read off `GoalService.goals()`, the plain `GET /api/v1/me/goals` list.
   * Deliberately NOT off `/goals/{id}/knowledge`: that read CLAIMS a
   * reflection row and schedules an LLM call (ADR-235), which must never be
   * fired merely to decorate a panel.
   */
  private readonly goalCompanionId = computed<string | null>(() => {
    const gid = this.goalId();
    if (!gid) return null;
    const goal = this.goalService.goals().find((g) => g.goalId === gid);
    return goal?.attachedFamiliarId?.trim() || null;
  });

  /**
   * The Companion of record for this rail: who the panel names, draws, and
   * opens. Owner ruling 2026-08-20 on which of the platform's three competing
   * selection rules wins here.
   *
   * Precedence: the Companion ATTACHED TO THE GOAL in view, then the dose's
   * topic-matched greeter. A goal-scoped dose is about that goal, so the
   * Companion the learner deliberately bound to it outranks a topic-match
   * heuristic. An unscoped dose has no goal to consult and keeps the greeter.
   * The `/a/companion` front-door rule (`isActive`) never wins here: it is the
   * rule that produced the reported bug.
   */
  readonly companionOfRecordId = computed<string | null>(
    () => this.goalCompanionId() ?? this.greeterId(),
  );

  /**
   * Breed-art inputs for the greeting Familiar, or null when we cannot PROVE
   * the resolved companion IS that greeter.
   *
   * `ActiveFamiliarService.active()` becomes the companion of record once the
   * dispatch effect lands, but the roster bootstrap picks by `isActive` while
   * this rail picks by goal-bond then topic-match, so in the window before
   * the dispatch resolves `active()` is a different Familiar entirely.
   * Rendering it there would put one companion's portrait under another
   * companion's name, which is the exact confusion this fix exists to remove.
   * Null instead: the rail shows NO face rather than the wrong one, and picks
   * the art up when the dispatch settles.
   */
  private readonly resolvedCompanion = computed(() => {
    const companion = this.activeFamiliar.active();
    if (!companion) return null;
    const ofRecord = this.companionOfRecordId();
    if (ofRecord !== null && companion.familiarId !== ofRecord) return null;
    return companion;
  });

  readonly companionArt = computed<{
    readonly species: BreedSpecies;
    readonly stage: BreedStage;
    readonly shiny: boolean;
  } | null>(() => {
    const companion = this.resolvedCompanion();
    if (!companion) return null;
    return {
      species: companion.species,
      stage: companion.growthStage,
      shiny: companion.shinyVariant,
    };
  });

  /**
   * The name printed on the rail, and the alt text on its art.
   *
   * `familiarName` on the wire is the GREETER's: chora-consumption overrides
   * it from the greeting selection. When a Goal's Companion outranks the
   * greeter, binding the heading to that field would print one Companion's
   * name over another Companion's portrait, which is this story's own defect
   * reintroduced one element to the left. The resolved Companion therefore
   * wins whenever it is known.
   *
   * Falls back to the wire value only while nothing is resolved yet. In that
   * window no art is drawn either, so the rail is never internally
   * inconsistent: it shows a name with no face, then both together.
   */
  readonly companionName = computed<string>(
    () =>
      this.resolvedCompanion()?.displayName?.trim() ||
      this.dose()?.familiarName ||
      '',
  );

  /**
   * The stage printed under the name. `familiarLevel` on the wire is the
   * GREETER's ADR-149 GrowthStage (chora-consumption overrides it alongside
   * the name), NOT a separate level scale, so the resolved Companion's
   * `growthStage` is the same quantity and substitutes cleanly.
   */
  readonly companionStage = computed<number>(
    () => this.resolvedCompanion()?.growthStage ?? this.dose()?.familiarLevel ?? 0,
  );

  /** Mood overlay for the rail art (idle / curious / sleepy / celebrating). */
  readonly companionMood = this.activeFamiliar.mood;

  /**
   * Target for the open-companion CTA. The bare `/a/companion` front door
   * resolves by `isActive`, which is NOT the greeting-selection rule, so a
   * dose that names a greeter must deep-link that greeter by id or the
   * learner lands on a different companion than the one that just spoke.
   * Falls back to the front door only when the dose named nobody.
   */
  readonly familiarLink = computed<readonly string[]>(() => {
    const ofRecord = this.companionOfRecordId();
    // C0: built from SEGMENTS, not a joined literal, which is why a census
    // keyed on the string `/a/familiar` could not see it. Segment arrays are
    // the form to check whenever a route moves.
    return ofRecord ? ['/a', 'companion', ofRecord] : ['/a', 'companion'];
  });

  // ── Retention display helpers (WS-12) ──────────────────────────────

  retentionColorVar(atom: DailyDoseAtom): string {
    const state = atom.retention_state ?? retentionStateFromCategory(atom.category);
    return retentionColorVar(state);
  }

  retentionIconClass(atom: DailyDoseAtom): string {
    const state = atom.retention_state ?? retentionStateFromCategory(atom.category);
    return retentionIconClass(state);
  }

  retentionLabel(atom: DailyDoseAtom): string {
    const state = atom.retention_state ?? retentionStateFromCategory(atom.category);
    return `aplus.daily_dose.retention_${state}`;
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;

    // Campaign practice mode (WS-C7 / CHO-2086): a map hex-tap deep-links here
    // with `?campaign_node=<conceptId>&goal_id=<id>&concept=<label>`. When
    // present, mount the campaign-practice child and skip the dose load +
    // countdown tick entirely (they would fire a needless dose BFF call).
    const campaignNode = qp.get('campaign_node')?.trim() || null;
    if (campaignNode) {
      this.campaignNode.set(campaignNode);
      this.campaignGoalId.set(qp.get('goal_id')?.trim() ?? '');
      this.campaignConcept.set(qp.get('concept')?.trim() ?? '');
      return;
    }

    // Focused mode (Phase 2B): the dashboard deep-links into a Growth-Edge-
    // scoped session via `?growth_edge_id=<id>&concept=<label>`. Both params
    // are OPTIONAL — when absent the dose loads exactly as today.
    const edgeId = qp.get('growth_edge_id')?.trim() || null;
    const concept = qp.get('concept')?.trim() || null;
    const goalId = qp.get('goal_id')?.trim() || null;
    this.growthEdgeId.set(edgeId);
    this.focusedConcept.set(concept);
    this.goalId.set(goalId);

    // A goal-scoped dose needs the goals list to resolve the Goal's attached
    // Companion (see `goalCompanionId`). Only then: an unscoped dose must not
    // pay for a read it cannot use. `load()` is idempotent, so a surface that
    // already fetched the list (the dashboard) is not re-fetched into.
    if (goalId) {
      this.goalService.load();
    }

    this.doseService.load(edgeId ?? undefined, goalId ?? undefined);
    this.tickHandle = setInterval(() => this.nowTick.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => {
      if (this.tickHandle !== null) {
        clearInterval(this.tickHandle);
        this.tickHandle = null;
      }
    });
  }

  /** Retry CTA: re-fires the BFF call, preserving any Growth Edge / Goal scope. */
  retry(): void {
    this.doseService.load(
      this.growthEdgeId() ?? undefined,
      this.goalId() ?? undefined,
    );
  }

  // ── Actions ───────────────────────────────────────────────────────
  goPrev(): void {
    if (this.canGoPrev()) {
      this.activeIndex.update((i) => i - 1);
    }
  }

  goNext(): void {
    if (this.canGoNext()) {
      this.activeIndex.update((i) => i + 1);
    }
  }

  selectIndex(index: number): void {
    const atoms = this.atoms();
    if (index < 0 || index >= atoms.length) return;
    this.activeIndex.set(index);
  }

  /**
   * Navigate to the atom player with a returnUrl back to daily-dose.
   * WS-12: routes to `/a/atoms/{id}/play?returnUrl=/a/daily-dose`.
   */
  playAtom(atomId: string): void {
    void this.router.navigate(['/a', 'atoms', atomId, 'play'], {
      queryParams: { returnUrl: '/a/daily-dose' },
    });
  }

  /** Convenience: play the currently active carousel atom. */
  playActiveAtom(): void {
    const atom = this.activeAtom();
    if (!atom) return;
    this.playAtom(atom.atomId);
  }

  /** Play the nudge atom from the Familiar recommendation. */
  playNudgeAtom(): void {
    const nudge = this.familiarNudge();
    if (!nudge || nudge.requires_standard_tier) return;
    this.playAtom(nudge.atom_id);
  }

  /** Open an AI-pick atom in the player (same flow as a dose card). */
  openAiPick(atom: LearningAtom): void {
    this.playAtom(atom.id);
  }

  // ── Display helpers ───────────────────────────────────────────────
  categoryBadgeClass(atom: DailyDoseAtom): string {
    return categoryBadgeClass(atom.category);
  }

  categoryLabelKey(atom: DailyDoseAtom): string {
    return `aplus.daily_dose.category_${atom.category}`;
  }
}
