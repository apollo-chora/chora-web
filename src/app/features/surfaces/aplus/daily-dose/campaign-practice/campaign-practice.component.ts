/**
 * CampaignPracticeComponent — WS-C7 (CHO-2086) hex-tap practice lane.
 *
 * Mounted by DailyDoseComponent when `?campaign_node=` is present: it plays the
 * campaign question bank for ONE map hex with SERVER-side grading (ADR-227 D13).
 * The verdict + ladder outcome come EXCLUSIVELY from the answer POST — the
 * player never inspects the payload answer key (contract §3; the `is_correct`
 * field is dropped in `parseCampaignQuestions`).
 *
 * States: loading → (playing | preparing→poll | empty | failed | node_won |
 * invalid | error). The GET reuses the "generate once, retrieve forever" bank;
 * an idle/requested serve means the familiar is still composing questions, so
 * we poll (~2.5s ×24, mirroring the fog-suggestion poll) then give up honestly.
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { take } from 'rxjs';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import {
  CAMPAIGN_RUNG_LABEL_KEYS,
  CAMPAIGN_TOTAL_RUNGS,
} from '../../my-knowledge/campaign.model';
import type {
  CampaignAnswerRequest,
  CampaignAnswerResult,
  CampaignQuestionsResponse,
} from '../../my-knowledge/campaign.model';
import {
  CampaignPracticeError,
  CampaignPracticeService,
  parseCampaignQuestions,
  type CampaignQuestion,
} from './campaign-practice.service';

/** UI phase for the practice lane (the finished summary rides `finished()`). */
export type CampaignPracticePhase =
  | 'loading'
  | 'preparing'
  | 'preparing_long'
  | 'prep_timeout'
  | 'playing'
  | 'empty'
  | 'tap_capped'
  | 'node_won'
  | 'invalid'
  | 'not_found'
  | 'failed'
  | 'error';

const K = 'aplus.knowledge.';

/** Poll the still-composing serve ~2.5s ×24 (~60s) — the fog-suggestion cadence
 *  (map-familiar-panel): a busy qgen run can exceed the old 30s ceiling. */
const PREP_POLL_INTERVAL_MS = 2500;
const PREP_POLL_MAX = 24;

/**
 * Past the fast window the crew is still legitimately composing (the ADK web
 * write timeout alone is 120s, twice the fast budget), so the old hard give-up
 * fired while generation was healthy and in flight. Keep watching on a calm
 * ~15s ×40 (~10min) cadence instead, so a set that lands live-updates into play
 * with no interaction. Slower on purpose: nobody is staring at this.
 */
const PREP_SLOW_POLL_INTERVAL_MS = 15000;
const PREP_SLOW_POLL_MAX = 40;

/** The "questions ready" flash lingers this long after a composing -> ready
 *  transition, then fades into the player (CHO-2319). */
const READY_FLASH_MS = 2500;

@Component({
  selector: 'chora-aplus-campaign-practice',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './campaign-practice.component.html',
  styleUrl: './campaign-practice.component.scss',
})
export class CampaignPracticeComponent {
  readonly goalId = input.required<string>();
  readonly conceptId = input.required<string>();
  readonly conceptLabel = input<string>('');

  private readonly router = inject(Router);
  private readonly svc = inject(CampaignPracticeService);
  private readonly destroyRef = inject(DestroyRef);

  readonly phase = signal<CampaignPracticePhase>('loading');
  /** Brief "questions ready" confirmation shown when a poll lands the composing
   *  set into play, so the transition is announced, not a silent jump (CHO-2319). */
  readonly readyFlash = signal(false);
  readonly failureReason = signal<string>('');
  /** The BE error code for the invalid/error phases (informs the copy). */
  readonly errorCode = signal<string>('');

  readonly questions = signal<readonly CampaignQuestion[]>([]);
  readonly rung = signal<number>(0);
  readonly conceptKey = signal<string>('');
  readonly activeIndex = signal<number>(0);
  readonly selectedOptionId = signal<string | null>(null);
  readonly submitting = signal<boolean>(false);
  readonly verdict = signal<CampaignAnswerResult | null>(null);
  /** An i18n key for an inline answer-time failure (stale serve etc.). */
  readonly submitError = signal<string | null>(null);
  readonly results = signal<readonly CampaignAnswerResult[]>([]);
  readonly finished = signal<boolean>(false);

  readonly total = computed<number>(() => this.questions().length);
  readonly activeQuestion = computed<CampaignQuestion | null>(
    () => this.questions()[this.activeIndex()] ?? null,
  );
  readonly answered = computed<boolean>(() => this.verdict() !== null);
  readonly isLastQuestion = computed<boolean>(
    () => this.activeIndex() >= this.total() - 1,
  );
  readonly canSubmit = computed<boolean>(
    () =>
      this.phase() === 'playing' &&
      !this.answered() &&
      this.selectedOptionId() !== null &&
      !this.submitting(),
  );

  /** Revised-Bloom label key for the serve rung (D6 two-vocabulary rule). */
  readonly rungLabelKey = computed<string>(
    () => CAMPAIGN_RUNG_LABEL_KEYS[this.rung()] ?? '',
  );

  /** The post-grade explainer. The §2 serve is sanitised (no explainer), so it
   *  arrives on the §3 answer response — read it from the verdict, not the
   *  option. Absent/blank ⇒ no panel. */
  readonly activeExplainer = computed<string | null>(() => {
    const ex = this.verdict()?.explainer;
    return ex && ex.trim() ? ex : null;
  });

  /** The correct option id revealed by the answer response — highlights the
   *  right choice after an incorrect answer (icon+text, never colour alone). */
  readonly correctOptionId = computed<string | null>(
    () => this.verdict()?.correct_option_id ?? null,
  );

  readonly correctCount = computed<number>(
    () => this.results().filter((r) => r.correct).length,
  );

  // ── Verdict banners (precedence: won > cleared > paced > counted) ──────
  readonly showWon = computed<boolean>(() => this.verdict()?.won === true);
  readonly showCleared = computed<boolean>(() => {
    const v = this.verdict();
    return !!v && !v.won && v.cleared_rung > 0;
  });
  readonly showPaced = computed<boolean>(() => {
    const v = this.verdict();
    return !!v && !v.won && v.cleared_rung === 0 && v.paced_today;
  });
  readonly showCounted = computed<boolean>(() => {
    const v = this.verdict();
    return !!v && !v.won && v.cleared_rung === 0 && !v.paced_today && v.counted;
  });
  readonly isRefresher = computed<boolean>(() => this.verdict()?.is_refresher === true);
  /** Revised-Bloom label of the rung UNLOCKED by clearing (cleared_rung + 1). */
  readonly nextRungLabelKey = computed<string>(() => {
    const v = this.verdict();
    if (!v || v.cleared_rung <= 0 || v.cleared_rung >= CAMPAIGN_TOTAL_RUNGS) return '';
    return CAMPAIGN_RUNG_LABEL_KEYS[v.cleared_rung + 1] ?? '';
  });

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private readyFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private pollsRemaining = 0;
  private slowPollsRemaining = 0;
  private lastLoadKey = '';

  constructor() {
    // Fetch once per distinct (goalId, conceptId) — reactive so a re-tap onto a
    // different hex (same route instance) reloads; guarded against re-firing on
    // unrelated CD.
    effect(() => {
      const gid = this.goalId();
      const cid = this.conceptId();
      const key = `${gid}::${cid}`;
      if (!gid || !cid || key === this.lastLoadKey) return;
      this.lastLoadKey = key;
      untracked(() => this.fetch());
    });
    this.destroyRef.onDestroy(() => {
      this.stopPoll();
      if (this.readyFlashTimer !== null) clearTimeout(this.readyFlashTimer);
    });
  }

  /** A/B/C/D positional marker — computed locally, never stored (mcq-option-naming). */
  optionMarker(index: number): string {
    return String.fromCharCode(65 + (index % 26));
  }

  selectOption(optionId: string): void {
    if (this.answered() || this.submitting()) return; // locked once graded
    this.selectedOptionId.set(optionId);
  }

  /** Submit the selected option for SERVER grading. The door has no idempotency
   *  store, so `submitting` is the only guard against a double POST. */
  submit(): void {
    if (!this.canSubmit()) return;
    const optionId = this.selectedOptionId();
    if (optionId === null) return;
    const question = this.activeQuestion();
    if (question === null) return;
    this.submitting.set(true);
    this.submitError.set(null);
    const req: CampaignAnswerRequest = {
      concept_id: this.conceptId(),
      rung: this.rung(),
      // The question's index on the WIRE, never the render cursor (CHO-2252):
      // the parse drops unusable candidates, so activeIndex() can point at a
      // different question than the backend would grade.
      question_index: question.sourceIndex,
      selected_option_id: optionId,
    };
    this.svc
      .answer(this.goalId(), req)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.submitting.set(false);
          this.verdict.set(result);
          this.results.update((rs) => [...rs, result]);
        },
        error: (err) => {
          this.submitting.set(false);
          this.handleAnswerError(err);
        },
      });
  }

  /** Advance to the next question, or finish into the summary on the last. */
  next(): void {
    if (!this.answered()) return;
    if (this.isLastQuestion()) {
      this.finished.set(true);
      return;
    }
    this.activeIndex.update((i) => i + 1);
    this.selectedOptionId.set(null);
    this.verdict.set(null);
    this.submitError.set(null);
  }

  retry(): void {
    this.fetch();
  }

  /**
   * Resume the calm watch from the resting state. This is a RE-READ, never a
   * regenerate: the BE guards a same-day in-flight set twice (maybeRequest
   * short-circuits, MarkRequested refuses), so looking again is the only honest
   * thing a button can do while generation is pending. Deliberately NOT retry(),
   * which resets to 'loading' and reads as "that failed, try once more".
   */
  recheck(): void {
    this.stopPoll();
    this.phase.set('preparing_long');
    this.slowPollsRemaining = PREP_SLOW_POLL_MAX;
    this.pollNow();
  }

  backToMap(): void {
    void this.router.navigate(['/a/knowledge', this.goalId()]);
  }

  /** Back to the learner's OWN map LIST — used when the routed goal isn't theirs
   *  (not-found), where back-to-this-map (`/a/knowledge/{goalId}`) would re-404. */
  backToMaps(): void {
    void this.router.navigate(['/a/knowledge']);
  }

  // ── Load / route ──────────────────────────────────────────────────────

  private fetch(): void {
    this.stopPoll();
    this.phase.set('loading');
    this.svc
      .load(this.goalId(), this.conceptId())
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => this.routeResponse(resp),
        error: (err) => this.handleLoadError(err),
      });
  }

  private routeResponse(resp: CampaignQuestionsResponse): void {
    switch (resp.status) {
      case 'ready':
        this.enterPlaying(resp);
        break;
      case 'none':
        this.phase.set('empty');
        break;
      case 'tap_capped':
        // The explicit-tap daily generation budget is spent (the dose-march has
        // its own separate budget). Honest, actionable copy, never a poll.
        this.phase.set('tap_capped');
        break;
      case 'idle':
      case 'requested':
        this.phase.set('preparing');
        this.startPoll();
        break;
      case 'failed':
        this.failWith(resp.failure_reason ?? '');
        break;
      default:
        this.failWith('');
    }
  }

  private enterPlaying(resp: CampaignQuestionsResponse): void {
    // Announce a composing -> ready transition (the learner was watching a
    // poll); an initial ready load (phase 'loading') jumps straight in, no flash.
    const wasComposing = this.isPreparing();
    const qs = parseCampaignQuestions(resp.questions);
    if (qs.length === 0) {
      // A `ready` serve that carries no readable question is a broken payload —
      // fail loud rather than paint an empty player (never invent a question).
      this.failWith('');
      return;
    }
    this.questions.set(qs);
    this.rung.set(resp.rung);
    this.conceptKey.set(resp.concept_key);
    this.activeIndex.set(0);
    this.selectedOptionId.set(null);
    this.verdict.set(null);
    this.results.set([]);
    this.finished.set(false);
    this.submitError.set(null);
    this.phase.set('playing');
    if (wasComposing) {
      this.readyFlash.set(true);
      if (this.readyFlashTimer !== null) clearTimeout(this.readyFlashTimer);
      this.readyFlashTimer = setTimeout(
        () => this.readyFlash.set(false),
        READY_FLASH_MS,
      );
    }
  }

  private failWith(reason: string): void {
    this.stopPoll();
    this.failureReason.set(reason.trim());
    this.phase.set('failed');
  }

  private handleLoadError(err: unknown): void {
    this.stopPoll();
    if (err instanceof CampaignPracticeError) {
      if (err.status === 409 && err.code === 'NODE_WON') {
        this.phase.set('node_won');
        return;
      }
      if (err.status === 404 && err.code === 'GOAL_NOT_FOUND') {
        // The goal/map isn't this learner's (or doesn't exist) — a stale or
        // cross-learner deep link. This is NOT "questions aren't ready": tell the
        // truth and send them to their OWN maps (back-to-this-map would re-404).
        this.errorCode.set(err.code);
        this.phase.set('not_found');
        return;
      }
      if (err.status === 404 || err.status === 422) {
        this.errorCode.set(err.code);
        this.phase.set('invalid');
        return;
      }
      this.errorCode.set(err.code);
    } else {
      this.errorCode.set('UNKNOWN');
    }
    this.phase.set('error');
  }

  private handleAnswerError(err: unknown): void {
    if (err instanceof CampaignPracticeError && err.status === 409 && err.code === 'NODE_WON') {
      this.stopPoll();
      this.phase.set('node_won');
      return;
    }
    const code = err instanceof CampaignPracticeError ? err.code : 'UNKNOWN';
    const stale = code === 'RUNG_NOT_UNLOCKED' || code === 'SET_NOT_SERVABLE';
    this.submitError.set(
      stale ? `${K}campaign_practice_answer_stale` : `${K}campaign_practice_answer_error`,
    );
  }

  // ── Poll (preparing) ──────────────────────────────────────────────────

  /** Both watching phases: the fast window and the calm long watch. A poll
   *  response for either is still ours; anything else has superseded us. */
  private isPreparing(): boolean {
    const p = this.phase();
    return p === 'preparing' || p === 'preparing_long';
  }

  private startPoll(): void {
    this.stopPoll();
    this.pollsRemaining = PREP_POLL_MAX;
    this.slowPollsRemaining = PREP_SLOW_POLL_MAX;
    this.scheduleNextPoll();
  }

  private stopPoll(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private scheduleNextPoll(): void {
    if (this.phase() === 'preparing' && this.pollsRemaining <= 0) {
      // The fast window closed while the crew is STILL COMPOSING. That is not a
      // failure and not a give-up: a same-day set is in flight and the BE
      // refuses to re-fire it, so a "Try again" here could only re-read and
      // restart the same countdown. Drop to a calm watch that live-updates the
      // moment the set lands.
      this.phase.set('preparing_long');
    }
    const slow = this.phase() === 'preparing_long';
    if (slow && this.slowPollsRemaining <= 0) {
      // Stop watching after the long window (the learner has almost certainly
      // gone). Stay truthful: the set may still land, so the resting state
      // offers a re-read, never a retry the BE would refuse.
      this.phase.set('prep_timeout');
      return;
    }
    this.pollTimer = setTimeout(
      () => this.pollNow(),
      slow ? PREP_SLOW_POLL_INTERVAL_MS : PREP_POLL_INTERVAL_MS,
    );
  }

  private pollNow(): void {
    if (this.phase() === 'preparing_long') this.slowPollsRemaining -= 1;
    else this.pollsRemaining -= 1;
    this.svc
      .load(this.goalId(), this.conceptId())
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          if (!this.isPreparing()) return; // superseded (destroyed/retried)
          switch (resp.status) {
            case 'ready':
              this.enterPlaying(resp);
              break;
            case 'none':
              this.phase.set('empty');
              break;
            case 'failed':
              this.failWith(resp.failure_reason ?? '');
              break;
            default:
              this.scheduleNextPoll(); // idle | requested → keep watching
          }
        },
        error: (err) => {
          if (!this.isPreparing()) return;
          if (
            err instanceof CampaignPracticeError &&
            err.status === 409 &&
            err.code === 'NODE_WON'
          ) {
            this.stopPoll();
            this.phase.set('node_won');
            return;
          }
          // A transient blip (edge 504) is NOT a verdict — one more tick.
          this.scheduleNextPoll();
        },
      });
  }
}
