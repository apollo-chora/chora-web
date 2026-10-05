/**
 * ClassroomComponent — R+ Stage C-lite Wave-5 M8.
 *
 * Snapshot view of a LiveQuizSession. Wires the real BFF endpoints via
 * `ClassroomService` per `feedback_no_stubs_real_wiring` — replaces the
 * wave-2 mock fixture.
 *
 * Behaviour:
 *   - Reads `?session_id=` from the route. Absent → shows the empty-state
 *     "no session selected" panel.
 *   - When present, subscribes to `visibilityAwareSnapshotStream(id)` which
 *     polls /api/v1/classroom-sessions/{id} every 2s while LIVE. Stops on
 *     CLOSED (one final emit). Pauses while the tab is hidden.
 *   - Renders the snapshot: current_question_id + per-choice response bars
 *     + joined_learners count + LIVE/ARMED/CLOSED state badge.
 *   - Fails loud on BFF error: shows a `data-testid="classroom-error"`
 *     panel with the HTTP status code (per the no-stubs rule).
 *
 * Signal-first: no NgRx, no BehaviorSubject. `toSignal()` folds the polling
 * Observable into a writable signal; `computed()` derives bar-chart rows.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { qrSvg } from '../../../../shared/qr/qr.util';
import { ClassroomService } from './classroom.service';
import {
  ClassroomSessionSnapshot,
  PresenterQuestion,
  ResponseChoiceRow,
  buildResponseRows,
} from './classroom.model';

@Component({
  selector: 'chora-rplus-classroom',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './classroom.component.html',
  styleUrl: './classroom.component.scss',
})
export class ClassroomComponent {
  private readonly classroomService = inject(ClassroomService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stop$ = new Subject<void>();

  /** Latest BFF error (null when none). Exposed as a signal for the view. */
  readonly error = signal<HttpErrorResponse | null>(null);

  /**
   * Session id from `?session_id=` — captured once on construction.
   * Components are recreated on route change so reading via snapshot is
   * safe (vs subscribing to paramMap).
   */
  readonly sessionId = signal<string>(
    this.route.snapshot.queryParamMap.get('session_id')?.trim() ?? '',
  );

  /**
   * Snapshot stream — null until first emission, then the latest snapshot.
   * `toSignal` with `initialValue: null` matches the FE polling contract
   * (the template's `@if (snapshot(); as s)` gates render until first
   * frame arrives).
   */
  readonly snapshot = toSignal<ClassroomSessionSnapshot | null>(
    this.startStream(),
    { initialValue: null },
  );

  /** Derived bar-chart rows for the current question. */
  readonly responseRows = computed<readonly ResponseChoiceRow[]>(() => {
    const s = this.snapshot();
    if (!s) return [];
    return buildResponseRows(s);
  });

  /** True when polling will continue (LIVE / ARMED). */
  readonly polling = computed<boolean>(() => {
    const s = this.snapshot();
    if (!s) return this.sessionId() !== '';
    return s.state !== 'CLOSED';
  });

  /** L5 — parent-quiz questions so the instructor can advance through them. */
  readonly questions = signal<readonly PresenterQuestion[]>([]);

  /** L5 — true while a start/advance round-trip is inflight. */
  readonly acting = signal<boolean>(false);

  /** Guard so the parent-quiz question fetch fires at most once. */
  private questionsFetched = false;

  // ── L5.2 host console (CHO-1704, ADR-179) ─────────────────────────────────

  /** 500ms wall-clock tick driving the presenter countdown. */
  private readonly nowMs = signal<number>(Date.now());

  readonly joinCode = computed<string>(() => this.snapshot()?.joinCode ?? '');
  readonly roster = computed(() => this.snapshot()?.participants ?? []);
  readonly participantCount = computed<number>(
    () => this.snapshot()?.participantCount ?? 0,
  );
  readonly openQuestion = computed(() => this.snapshot()?.openQuestion ?? null);

  /** QR for the learner entry URL (projector lobby). Vendored zero-dep gen. */
  readonly qr = computed<{ size: number; path: string } | null>(() => {
    const code = this.joinCode();
    if (!code) return null;
    return qrSvg(`${location.origin}/play/${code}`);
  });

  /** Deep link to the learner play view (§4.6) — same-origin chromeless route. */
  readonly playHref = computed<string>(() => {
    const code = this.joinCode();
    return code ? `/play/${code}` : '';
  });

  /**
   * Seconds left in the answer window — the SAME server-anchored clock the
   * learners see (locks_at, falling back to opened_at + timer + 2s grace).
   * null when no timed question is open.
   */
  readonly countdownSecs = computed<number | null>(() => {
    const oq = this.openQuestion();
    if (!oq || oq.timerSeconds <= 0) return null;
    const lockMs = oq.locksAt
      ? Date.parse(oq.locksAt)
      : Date.parse(oq.openedAt) + (oq.timerSeconds + 2) * 1000;
    if (Number.isNaN(lockMs)) return null;
    return Math.max(0, Math.ceil((lockMs - this.nowMs()) / 1000));
  });

  /** Total answers in for the open question (sum of the choice counts). */
  readonly answeredCount = computed<number>(() => {
    const s = this.snapshot();
    if (!s) return 0;
    return Object.values(s.responseCounts).reduce((a, n) => a + n, 0);
  });

  /** The answer window has shut (server-derived flag or clock-passed). */
  readonly windowLocked = computed<boolean>(() => {
    const oq = this.openQuestion();
    if (!oq) return false;
    if (oq.locked) return true;
    const cd = this.countdownSecs();
    return cd !== null && cd <= 0;
  });

  /** Interim scoreboard (ruling 3): LIVE + window shut → top-10 projected. */
  readonly interimBoard = computed(() => {
    const s = this.snapshot();
    if (!s || s.state !== 'LIVE' || !this.windowLocked()) return [];
    return s.scoreboard.slice(0, 10);
  });

  /** Podium (top-5) — the finale, once CLOSED. */
  readonly podium = computed(() => {
    const s = this.snapshot();
    if (!s || s.state !== 'CLOSED') return [];
    const rows = s.podium.length > 0 ? s.podium : s.finalScoreboard;
    return rows.slice(0, 5);
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stop$.next();
      this.stop$.complete();
    });
    // L5.2 — drive the presenter countdown off a coarse wall-clock tick.
    const tick = setInterval(() => this.nowMs.set(Date.now()), 500);
    this.destroyRef.onDestroy(() => clearInterval(tick));
    // L5 — fetch the parent quiz's questions the first time the polling
    // snapshot yields a liveQuizId (the snapshot carries only the current
    // question_id, not the list the advance control needs). Reuses the
    // existing snapshot signal — no extra GET on the session.
    effect(() => {
      const s = this.snapshot();
      if (s?.liveQuizId && !this.questionsFetched) {
        this.questionsFetched = true;
        this.classroomService
          .liveQuizQuestions(s.liveQuizId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({ next: (qs) => this.questions.set(qs) });
      }
    });
  }

  /**
   * Builds the polling Observable from the current sessionId(). Returns
   * EMPTY (via `of` null-stream) when no id is present, so the
   * `@if (snapshot(); as s)` template branch falls through to the empty
   * panel. Errors are folded into `this.error` and the stream completes.
   */
  private startStream() {
    const id = this.sessionId();
    if (!id) return of(null);
    return this.classroomService
      .visibilityAwareSnapshotStream(id, this.stop$)
      .pipe(
        catchError((err: HttpErrorResponse) => {
          this.error.set(err);
          return of(null);
        }),
      );
  }

  /** L5 — ARMED → LIVE (instructor "go live"). */
  start(): void {
    const id = this.sessionId();
    if (!id) return;
    this.acting.set(true);
    this.classroomService
      .transitionStart(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.acting.set(false),
        error: (err: HttpErrorResponse) => {
          this.acting.set(false);
          this.error.set(err);
        },
      });
  }

  /** L5.2 — End session (LIVE → CLOSED): freezes the podium on the BE. */
  endSession(): void {
    const id = this.sessionId();
    if (!id) return;
    this.acting.set(true);
    this.classroomService
      .transitionClose(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.acting.set(false),
        error: (err: HttpErrorResponse) => {
          this.acting.set(false);
          this.error.set(err);
        },
      });
  }

  /** L5 — present a question for answering (instructor advance; LIVE only). */
  advanceTo(questionId: string): void {
    const id = this.sessionId();
    if (!id) return;
    this.acting.set(true);
    this.classroomService
      .advance(id, questionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.acting.set(false),
        error: (err: HttpErrorResponse) => {
          this.acting.set(false);
          this.error.set(err);
        },
      });
  }
}
