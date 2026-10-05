/**
 * AtomAttemptComponent - A+ atom playback (Phyllis demo Step 7).
 *
 * Wired LIVE 2026-05-15 to the real BFF endpoints via `AtomAttemptService`:
 *   GET  /api/atoms/{atomId}                  → atom-load
 *   POST /api/atoms/{atomId}/session          → session-start
 *   POST /api/atoms/{atomId}/session/submit   → grade
 *
 * WS-1 restores MCQ/OE interactive rendering using the `question_payload`
 * field now carried by the BFF (WS-0b A16 contract expansion).
 *
 * Question-type routing:
 *   - `'mcq'`          → MCQ option buttons + select state + submit with selected_option_id
 *   - `'oe'`           → textarea + rubric criteria + submit with oe_response
 *   - `'reading-only'` → title + body + Continue CTA (outline atoms or atoms without payload)
 *
 * Eira's right-rail panel stays on `ActiveFamiliarService.active()`.
 *
 * Routes: both `/a/atoms/play` (legacy demo) and `/a/atoms/:atomId/play`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ActiveFamiliarService } from '../../../../core/familiar/active-familiar.service';
import { AtomAttemptService } from './atomic-session.service';
import { CourseLearnService } from '../course-learn/course-learn.service';
import { getQuestionType } from './atomic-session.model';
import type {
  LearningAtom,
  QuestionPayload,
  McqQuestionPayload,
  OeQuestionPayload,
  OeRubric,
  SubmissionCampaignOutcome,
} from './atomic-session.model';
import {
  CAMPAIGN_RUNG_LABEL_KEYS,
  CAMPAIGN_TOTAL_RUNGS,
} from '../my-knowledge/campaign.model';
import type { BreedSpecies } from '../../../../shared/components/breed-art/breed-art.component';
import { ChoraQuestionImageComponent } from '../../../../shared/components/chora-question-image/chora-question-image.component';

/** Canonical Phyllis demo atom id — A+ Atomic Learning Primitives (outline). */
const PHYLLIS_DEMO_ATOM_ID = '00000000-0000-7000-8000-00000000a0a1';

/** Right-rail Familiar panel view-model — post-hatch ActiveFamiliarService. */
interface FamiliarPanelVm {
  readonly familiarName: string;
  readonly avatarLevel: string;
  readonly rankLabel: string;
  readonly species: BreedSpecies | '';
  readonly isPostHatch: boolean;
}

@Component({
  selector: 'chora-aplus-atomic-session',
  imports: [RouterLink, TranslatePipe, FormsModule, ChoraQuestionImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './atomic-session.component.html',
  styleUrl: './atomic-session.component.scss',
})
export class AtomAttemptComponent {
  private readonly atomicService = inject(AtomAttemptService);
  private readonly activeFamiliar = inject(ActiveFamiliarService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly courseLearn = inject(CourseLearnService);

  /**
   * Route reads are REACTIVE, not snapshots (CHO-2350).
   *
   * Angular REUSES this component when only the route param changes, which is
   * exactly what the Next-atom CTA now does. A `snapshot` read is evaluated
   * once at construction, so the URL advanced to the next atom while the
   * player kept rendering the PREVIOUS one: right address, wrong content, and
   * it looked like it had worked. Reading the observables keeps id and course
   * in step with the URL.
   */
  private readonly paramMapSig = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryMapSig = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /**
   * Course context, carried on `?course=` from the course page so that "next"
   * can mean the next atom IN THIS LEARNER'S PATH. Empty when the atom was
   * opened outside a course (a Daily Dose item, a deep link, a review).
   */
  get courseId(): string {
    return this.queryMapSig()?.get('course') ?? '';
  }

  /** Resolved atom id — route param when present, else the demo seed. */
  get atomId(): string {
    return this.paramMapSig()?.get('atomId') ?? PHYLLIS_DEMO_ATOM_ID;
  }

  // ── Atom load state (fail-loud) ────────────────────────────────────
  readonly loadState = this.atomicService.loadState;
  readonly atom = this.atomicService.atom;
  readonly isLoading = computed<boolean>(
    () => this.loadState().status === 'loading',
  );
  readonly isLoadError = computed<boolean>(
    () => this.loadState().status === 'error',
  );
  readonly loadErrorKey = computed<string>(() => {
    const s = this.loadState();
    return s.status === 'error' ? s.error : '';
  });
  readonly loadPartial = computed<string | null>(() => {
    const s = this.loadState();
    return s.status === 'success' ? s.partial : null;
  });

  // ── Session-start state ────────────────────────────────────────────
  readonly startState = this.atomicService.startState;
  readonly session = this.atomicService.session;
  readonly isStarting = computed<boolean>(
    () => this.startState().status === 'starting',
  );
  readonly isStarted = computed<boolean>(
    () => this.startState().status === 'started',
  );
  readonly startErrorKey = computed<string>(() => {
    const s = this.startState();
    return s.status === 'error' ? s.error : '';
  });

  // ── Submit state ───────────────────────────────────────────────────
  readonly submitState = this.atomicService.submitState;
  readonly isSubmitting = computed<boolean>(
    () => this.submitState().status === 'submitting',
  );
  readonly isGraded = computed<boolean>(
    () => this.submitState().status === 'graded',
  );
  readonly submitErrorKey = computed<string>(() => {
    const s = this.submitState();
    return s.status === 'error' ? s.error : '';
  });

  /**
   * The grade currently on screen is a REPLAY of an answer already recorded
   * (CHO-2405), not a fresh one. The server sets `duplicate` when the submitted
   * `answer_id` matched the attempt's last one; it returns the stored result
   * and skips the outbox publish and the campaign fold entirely.
   */
  readonly isDuplicateGrade = computed<boolean>(() => {
    const s = this.submitState();
    return s.status === 'graded' && s.result.duplicate;
  });

  // ── Campaign feedback (CHO-2315) ───────────────────────────────────
  // When a graded dose answer folds into today's KG campaign hex the BE
  // returns the ladder outcome; surface it so the dose lane is no longer
  // silent about pacing (parity with the hex-tap practice banners).
  readonly campaignOutcome = computed<SubmissionCampaignOutcome | null>(() => {
    const s = this.submitState();
    return s.status === 'graded' ? (s.result.campaign ?? null) : null;
  });
  /** Banner state, precedence won > cleared > paced > counted (matches the
   *  hex-tap practice lane). null = no campaign fold, or a bare refresher. */
  readonly campaignBanner = computed<
    'won' | 'cleared' | 'paced' | 'counted' | null
  >(() => {
    // CHO-2405: a replay must not re-play the ladder feedback. The server
    // already returns early on a duplicate, before the campaign fold, so this
    // outcome is normally absent anyway, but the guard makes the suppression a
    // property of the player rather than a courtesy of the wire.
    if (this.isDuplicateGrade()) return null;
    const c = this.campaignOutcome();
    if (!c) return null;
    if (c.won) return 'won';
    if (c.cleared_rung > 0) return 'cleared';
    if (c.paced_today) return 'paced';
    if (c.counted) return 'counted';
    return null;
  });
  /** Revised-Bloom label key of the rung UNLOCKED by clearing (cleared_rung+1). */
  readonly campaignNextRungLabelKey = computed<string>(() => {
    const c = this.campaignOutcome();
    if (!c || c.cleared_rung <= 0 || c.cleared_rung >= CAMPAIGN_TOTAL_RUNGS) {
      return '';
    }
    return CAMPAIGN_RUNG_LABEL_KEYS[c.cleared_rung + 1] ?? '';
  });

  // ── Question-type routing (WS-1) ───────────────────────────────────
  /**
   * Derives the question render mode from the loaded atom.
   * 'mcq' | 'oe' | 'reading-only' | null
   */
  readonly questionType = computed<'mcq' | 'oe' | 'reading-only' | null>(
    () => getQuestionType(this.atom()),
  );

  /**
   * Reading-only atoms carry no question_payload — there is nothing to answer.
   * The session/submit panel is suppressed for them (see template), and the
   * learner gets a "no question yet" notice plus the Continue CTA instead.
   */
  readonly isReadingOnly = computed<boolean>(
    () => this.questionType() === 'reading-only',
  );

  /**
   * Positional markers for MCQ options.
   * marker = ['A','B','C','D','E','F'][index] — NEVER stored, computed at render.
   * Per feedback_mcq_option_naming.
   */
  readonly MCQ_MARKERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

  // ── MCQ interaction state ──────────────────────────────────────────
  /** Currently selected option_id — null means no selection yet. */
  readonly selectedOptionId = signal<string | null>(null);

  /**
   * Idempotency key for the answer the learner is currently submitting
   * (CHO-2405). `POST /v1/me/atom-sessions/{id}/answers` treats `answer_id`
   * as an idempotency key: a submit carrying an id that matches the attempt's
   * last one replays the stored result with `duplicate: true` instead of
   * grading and publishing again, and that check runs BEFORE the terminal-state
   * guard, so retrying the answer that COMPLETED the attempt is a clean 200
   * rather than a 409 the learner would read as "your answer failed".
   *
   * Lifecycle, which is the whole of the contract:
   *   - minted lazily on the first submit of an answer;
   *   - held across every retry of THAT answer, so the retry is recognised;
   *   - dropped the moment the answer itself changes, or the player moves to
   *     another atom. Carrying a key onto a different answer would swallow the
   *     new answer as a replay of the old one, which is the same defect
   *     pointed the other way.
   */
  private readonly pendingAnswerId = signal<string | null>(null);

  /** Select an MCQ option by option_id. */
  selectOption(optionId: string): void {
    // A genuinely different choice is a different answer, so it needs its own
    // key. Re-clicking the option already selected changes nothing, and must
    // keep the key or a re-submit of the same answer would be graded twice.
    if (this.selectedOptionId() !== optionId) {
      this.pendingAnswerId.set(null);
    }
    this.selectedOptionId.set(optionId);
  }

  // ── Template union-narrowing helpers ──────────────────────────────────────
  // Angular's template type-checker does not narrow a discriminated union via
  // the `!` non-null assertion, so narrow the QuestionPayload arms here and
  // bind the result with `@let` in the template.
  mcqOf(p: QuestionPayload | undefined): McqQuestionPayload | null {
    return p?.type === 'mcq' ? p : null;
  }

  oeOf(p: QuestionPayload | undefined): OeQuestionPayload | null {
    return p?.type === 'oe' ? p : null;
  }

  oeRubricOf(p: QuestionPayload | undefined): OeRubric | null {
    return p?.type === 'oe' ? (p.rubric ?? null) : null;
  }

  // ── OE interaction state ───────────────────────────────────────────
  /** Learner's open-ended response text (signal-backed; ngModel two-way via getter/setter). */
  readonly oeResponse = signal<string>('');

  /** ngModel two-way binding accessor for the OE textarea. */
  get oeResponseValue(): string {
    return this.oeResponse();
  }
  set oeResponseValue(val: string) {
    this.setOeResponse(val);
  }

  /** Input event handler for OE textarea — keeps signal in sync for OnPush. */
  onOeInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.setOeResponse(target.value);
  }

  /**
   * Single mutation point for the OE response, so an edited answer always
   * drops its idempotency key (CHO-2405). Both writers route through here;
   * a second writer that set the signal directly would silently resubmit
   * edited prose under the previous answer's key and have it replayed.
   */
  private setOeResponse(val: string): void {
    if (this.oeResponse() !== val) {
      this.pendingAnswerId.set(null);
    }
    this.oeResponse.set(val);
  }

  // ── Atom-type helpers (legacy compat) ──────────────────────────────
  readonly isMcqAtom = computed<boolean>(
    () => this.atom()?.atom_type === 'mcq',
  );
  readonly isEssayAtom = computed<boolean>(
    () => this.atom()?.atom_type === 'essay',
  );
  readonly isOutlineAtom = computed<boolean>(
    () => this.atom()?.atom_type === 'outline',
  );

  /**
   * Right-rail Familiar panel view-model. Sourced entirely from the
   * post-hatch `ActiveFamiliarService.active()` (Stage N · stageName ·
   * species per ADR-149) — the wave-2 legacy `getEiraHint()` fixture
   * (LEVEL 12 SCHOLAR quote) is gone with the rest of the MCQ-shaped
   * fixtures.
   */
  readonly familiarPanel = computed<FamiliarPanelVm | null>(() => {
    const active = this.activeFamiliar.active();
    if (!active) return null;
    return {
      familiarName: active.displayName?.length ? active.displayName : 'Eira',
      avatarLevel: active.growthStage.toString(),
      rankLabel: active.stageName.toUpperCase(),
      species: active.species,
      isPostHatch: true,
    };
  });

  /** Last atom id actually loaded, so a re-render never re-fetches. */
  private lastLoadedAtomID = '';

  constructor() {
    // Single source of truth: load the atom whenever the param resolves, AND
    // again whenever it CHANGES (the reused-component case, CHO-2350). The
    // previous atom's session view is cleared first, or the next atom renders
    // already graded with the last one's outcome.
    effect(() => {
      const id = this.atomId;
      if (!id || id === this.lastLoadedAtomID) {
        return;
      }
      const isSwitch = this.lastLoadedAtomID !== '';
      this.lastLoadedAtomID = id;
      if (isSwitch) {
        this.atomicService.resetSession();
        this.resetAnswerState();
      }
      this.atomicService.load(id);
    });
  }

  // ── Actions ────────────────────────────────────────────────────────
  /** Retry CTA on load error. */
  retryLoad(): void {
    this.atomicService.load(this.atomId);
  }

  /** Start session CTA — real `POST /api/atoms/{atomId}/session`. */
  startSession(): void {
    this.atomicService.start(this.atomId);
  }

  /**
   * Submit answer CTA — real `POST /api/atoms/{atomId}/session/submit`.
   *
   * A16 (WS-0b) shipped the question_payload, so we now compose a real
   * answer body per question type:
   *   - MCQ: `{session_id, selected_option_id}`
   *   - OE:  `{session_id, oe_response}`
   *   - reading-only: `{session_id}` only (no answer fields)
   */
  submitAnswer(): void {
    const s = this.session();
    if (!s) return;
    const qType = this.questionType();
    // Reading-only (and any non-question) atom has no answer payload — never
    // fire a vacuous submit that would round-trip to a "Graded." no-op.
    if (qType !== 'mcq' && qType !== 'oe') return;
    const body: Record<string, unknown> = {
      session_id: s.session_id,
      // CHO-2405, the idempotency key. Always sent: an answer the server
      // cannot recognise on retry is an answer the learner can be charged for
      // twice, or told failed when it succeeded.
      answer_id: this.answerIdForSubmit(),
    };
    if (qType === 'mcq') {
      const sel = this.selectedOptionId();
      if (sel) body['selected_option_id'] = sel;
    } else if (qType === 'oe') {
      const resp = this.oeResponse();
      if (resp.trim().length > 0) body['oe_response'] = resp;
    }
    this.atomicService.submit(this.atomId, body);
  }

  /**
   * The key to send with this submit: the one held for the answer in hand, or
   * a freshly minted one if this is its first attempt.
   */
  private answerIdForSubmit(): string {
    const held = this.pendingAnswerId();
    if (held) return held;
    const minted = this.newAnswerId();
    this.pendingAnswerId.set(minted);
    return minted;
  }

  /** Drop the answer in hand and its key, when the player changes atom. */
  private resetAnswerState(): void {
    this.selectedOptionId.set(null);
    this.oeResponse.set('');
    this.pendingAnswerId.set(null);
  }

  /**
   * Mint an answer id. `crypto.randomUUID` is the norm; the fallback covers a
   * non-secure context, where an unrecognisable key is still better than none
   * because the server compares it verbatim and never parses it as a UUID.
   */
  private newAnswerId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `ans-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Next-atom CTA (CHO-2350).
   *
   * This was a hardcoded `navigateByUrl('/a/map')` left from "wave-3 will hand
   * to the LockedPath next", which never landed. `/a/map` redirects to
   * `/a/knowledge`, so a learner who finished atom 1 of a course was dropped on
   * the Discover surface and had to find their way back by hand. The path
   * itself advanced correctly the whole time; only the CTA that exists to carry
   * the learner there did not.
   *
   * With a course context we resolve the learner's OWN path and go to the atom
   * that genuinely follows this one. Past the last atom we return to the course
   * page, which is where the completion state and the certificate live. Without
   * a course context (dose / deep link) the knowledge surface stays the honest
   * destination rather than a fabricated "next". A lookup failure also lands on
   * the course page: never strand a learner mid-course.
   */
  nextAtom(): void {
    const courseID = this.courseId;
    if (!courseID) {
      void this.router.navigateByUrl('/a/knowledge');
      return;
    }
    const backToCourse = `/a/courses/${courseID}/learn`;
    this.courseLearn.getMyLearningPathByCourse(courseID).subscribe({
      next: (path) => {
        const ids = (path?.atoms ?? []).map((a) => a.atom_id);
        const idx = ids.indexOf(this.atomId);
        const nextID = idx >= 0 ? ids[idx + 1] : undefined;
        void this.router.navigateByUrl(
          nextID ? `/a/atoms/${nextID}/play?course=${courseID}` : backToCourse,
        );
      },
      error: () => {
        void this.router.navigateByUrl(backToCourse);
      },
    });
  }

  // ── Display helpers ────────────────────────────────────────────────
  difficultyLabel(atom: LearningAtom): string {
    const stars = '★'.repeat(Math.max(1, Math.min(5, atom.difficulty)));
    return stars;
  }
}
