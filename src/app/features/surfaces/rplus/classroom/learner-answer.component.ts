/**
 * LearnerAnswerComponent (L5) — the learner side of the live classroom.
 *
 * Reached at `/r/classroom/answer?session_id=…` (the instructor shares the
 * session). Polls the LiveQuizSession snapshot for the instructor-opened
 * question, renders the option labels from the parent quiz, and submits the
 * learner's choice via POST /api/v1/classroom-sessions/{id}/responses
 * (`choice` = the option label, per the BE `isCorrectChoice` contract).
 * First-write-wins per (learner, question) — a 409 is surfaced as "answered".
 *
 * Reuses the R+ ClassroomService — the SAME chora-delivery session contract the
 * presenter drives. (The legacy `features/classroom` learner player targets a
 * separate `chora-classroom` service and is NOT wired to this session model.)
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
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ClassroomService } from './classroom.service';
import {
  ClassroomSessionSnapshot,
  PresenterQuestion,
} from './classroom.model';

@Component({
  selector: 'chora-rplus-learner-answer',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './learner-answer.component.html',
  styleUrl: './classroom.component.scss',
})
export class LearnerAnswerComponent {
  private readonly classroomService = inject(ClassroomService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stop$ = new Subject<void>();

  /** Latest BFF error (null when none). */
  readonly error = signal<HttpErrorResponse | null>(null);

  /** Session id from `?session_id=` (the instructor's shared link). */
  readonly sessionId = signal<string>(
    this.route.snapshot.queryParamMap.get('session_id')?.trim() ?? '',
  );

  /** Polled session snapshot (current_question_id + state). */
  readonly snapshot = toSignal<ClassroomSessionSnapshot | null>(
    this.startStream(),
    { initialValue: null },
  );

  /** Parent-quiz questions (with option labels) for the current question. */
  readonly questions = signal<readonly PresenterQuestion[]>([]);

  /** True while a submit round-trip is inflight. */
  readonly submitting = signal<boolean>(false);

  /** The question id the learner has already answered (first-write-wins). */
  readonly answeredQuestionId = signal<string>('');

  /** The instructor-opened question, resolved against the quiz list. */
  readonly currentQuestion = computed<PresenterQuestion | null>(() => {
    const s = this.snapshot();
    if (!s || !s.currentQuestionId) return null;
    return (
      this.questions().find((q) => q.questionId === s.currentQuestionId) ?? null
    );
  });

  /** True when the learner has already answered the open question. */
  readonly alreadyAnswered = computed<boolean>(() => {
    const s = this.snapshot();
    return !!s && this.answeredQuestionId() === s.currentQuestionId;
  });

  private questionsFetched = false;
  private redirected = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stop$.next();
      this.stop$.complete();
    });
    // L5.2 retirement (CHO-1704): this view is a thin shim — the moment the
    // BE snapshot carries a join_code, hand the learner to the Live Classroom stage
    // at /play/<code>. Old BEs (no join_code) keep the legacy answer flow.
    effect(() => {
      const code = this.snapshot()?.joinCode ?? '';
      if (code && !this.redirected) {
        this.redirected = true;
        void this.router.navigate(['/play', code], { replaceUrl: true });
      }
    });
    // Fetch the parent quiz's questions once the snapshot yields a liveQuizId.
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

  /** Submit the chosen option label for the current question. */
  answer(label: string): void {
    const id = this.sessionId();
    const q = this.currentQuestion();
    if (!id || !q || this.submitting() || this.alreadyAnswered()) return;
    this.submitting.set(true);
    this.classroomService
      .submitResponse(id, q.questionId, label)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.answeredQuestionId.set(q.questionId);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          // 409 = already answered (first-write-wins) — treat as answered.
          if (err.status === 409) {
            this.answeredQuestionId.set(q.questionId);
          } else {
            this.error.set(err);
          }
        },
      });
  }

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
}
