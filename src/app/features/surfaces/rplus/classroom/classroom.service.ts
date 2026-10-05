/**
 * ClassroomService — R+ Stage C-lite Wave-5 M8.
 *
 * Real BFF wiring for the LiveQuizSession contract. Replaces the wave-2 mock
 * fixture per `feedback_no_stubs_real_wiring`.
 *
 * NINE endpoints, all proxied through the chora-gateway BFF. This list is
 * asserted against the code by `classroom.service.doc.spec.ts`, in both
 * directions, because it previously claimed five while the service called nine
 * and nothing caught the drift (R6 D4).
 *
 *   POST /api/v1/live-quizzes/{quizId}/sessions       → start (ARMED)
 *   GET  /api/v1/live-quizzes/{id}                    → the parent quiz's
 *                                                       questions, so the
 *                                                       presenter can advance
 *   POST /api/v1/classroom-sessions/{id}/start        → ARMED→LIVE
 *   POST /api/v1/classroom-sessions/{id}/close        → LIVE→CLOSED
 *   GET  /api/v1/classroom-sessions/{id}              → snapshot (polled)
 *   POST /api/v1/classroom-sessions/{id}/responses    → SubmitResponse; called
 *                                                       by BOTH submitResponse
 *                                                       and the detailed
 *                                                       variant, which is why
 *                                                       ten call sites are nine
 *                                                       endpoints
 *   GET  /api/v1/classroom-sessions/by-code/{code}    → learner join lookup
 *   POST /api/v1/classroom-sessions/{id}/join         → learner join
 *   POST /api/v1/classroom-sessions/{id}/advance      → presenter next question
 *
 * Polling: `snapshotStream(id)` emits the snapshot every 2s while LIVE.
 * Stops on CLOSED (one final emission). The component's `toSignal()`
 * binding folds it into a UI signal. Polling pauses on tab hide via
 * `document.visibilityState` — no work when off-screen.
 *
 * Error handling: real BFF errors propagate as-is (fail loud per the
 * no-stubs rule). Components show a 503/404/etc. badge to the presenter
 * rather than hiding the failure.
 */
import { Injectable, inject } from '@angular/core';

import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import {
  EMPTY,
  Observable,
  Subject,
  defer,
  interval,
  merge,
  of,
  retry,
  takeUntil,
  takeWhile,
  throwError,
  timer,
} from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  ClassroomSessionSnapshot,
  ClassroomSessionWire,
  PresenterQuestion,
  SessionByCode,
  SessionByCodeWire,
  SubmitOutcome,
  SubmitResponseWire,
  toSessionByCode,
  toSnapshot,
  toSubmitOutcome,
} from './classroom.model';

/** Poll interval in ms — 2 second cadence while LIVE per the brief. */
export const CLASSROOM_POLL_INTERVAL_MS = 2000;

/**
 * Poll retry budget (HANDOFF_L52 §4.4): a transient 5xx must not freeze the
 * presenter/learner view, but a sustained outage still has to surface to the
 * caller's pollError UI. 8 retries at 2s/4s/8s/16s then capped 30s ≈ 2.5min
 * of self-healing — comfortably covers an auto-deployer pod roll.
 */
export const CLASSROOM_POLL_RETRY_BUDGET = 8;

/** Backoff cap in ms for the poll retry delay. */
export const CLASSROOM_POLL_RETRY_MAX_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class ClassroomService {
  private readonly bff = inject(BffClientService);

  /** POST /api/v1/live-quizzes/{quizId}/sessions — start (ARMED). */
  startSession(quizId: string): Observable<ClassroomSessionSnapshot> {
    return this.bff
      .post<ClassroomSessionWire>(
        `/api/v1/live-quizzes/${encodeURIComponent(quizId)}/sessions`,
        {},
      )
      .pipe(map(toSnapshot));
  }

  /** POST /api/v1/classroom-sessions/{id}/start — ARMED→LIVE. */
  transitionStart(sessionId: string): Observable<ClassroomSessionSnapshot> {
    return this.bff
      .post<ClassroomSessionWire>(
        `/api/v1/classroom-sessions/${encodeURIComponent(sessionId)}/start`,
        {},
      )
      .pipe(map(toSnapshot));
  }

  /** POST /api/v1/classroom-sessions/{id}/close — LIVE→CLOSED. */
  transitionClose(sessionId: string): Observable<ClassroomSessionSnapshot> {
    return this.bff
      .post<ClassroomSessionWire>(
        `/api/v1/classroom-sessions/${encodeURIComponent(sessionId)}/close`,
        {},
      )
      .pipe(map(toSnapshot));
  }

  /** GET /api/v1/classroom-sessions/{id} — single snapshot. */
  getSnapshot(sessionId: string): Observable<ClassroomSessionSnapshot> {
    return this.bff
      .get<ClassroomSessionWire>(
        `/api/v1/classroom-sessions/${encodeURIComponent(sessionId)}`,
      )
      .pipe(map(toSnapshot));
  }

  /**
   * POST /api/v1/classroom-sessions/{id}/responses — SubmitResponse.
   * Returns the post-submit snapshot.
   */
  submitResponse(
    sessionId: string,
    questionId: string,
    choice: string,
  ): Observable<ClassroomSessionSnapshot> {
    return this.bff
      .post<ClassroomSessionWire>(
        `/api/v1/classroom-sessions/${encodeURIComponent(sessionId)}/responses`,
        { question_id: questionId, choice },
      )
      .pipe(map(toSnapshot));
  }

  // ── L5.2 Live Classroom-stage endpoints (CHO-1704 WS3) ─────────────────────────────

  /**
   * GET /api/v1/classroom-sessions/by-code/{code} — learner entry. The code
   * is normalised FE-side (uppercase, spaces/dashes stripped) to mirror the
   * BE rule so typed/QR variants resolve identically.
   */
  resolveByCode(code: string): Observable<SessionByCode> {
    const normalised = code.toUpperCase().replace(/[\s-]/g, '');
    return this.bff
      .get<SessionByCodeWire>(
        `/api/v1/classroom-sessions/by-code/${encodeURIComponent(normalised)}`,
      )
      .pipe(map(toSessionByCode));
  }

  /**
   * POST /api/v1/classroom-sessions/{id}/join — claim a nickname + join the
   * lobby. Idempotent per gcid; 400 nickname_invalid/profane, 409 taken or
   * session CLOSED propagate to the caller (fail loud).
   */
  join(
    sessionId: string,
    nickname: string,
  ): Observable<ClassroomSessionSnapshot> {
    return this.bff
      .post<ClassroomSessionWire>(
        `/api/v1/classroom-sessions/${encodeURIComponent(sessionId)}/join`,
        { nickname },
      )
      .pipe(map(toSnapshot));
  }

  /**
   * POST /api/v1/classroom-sessions/{id}/responses — like `submitResponse`
   * but keeps the 201 body's `your_result` (the submitter's own grade — the
   * only pre-reveal correctness channel). The play stage holds it hidden
   * until the REVEAL stage.
   */
  submitResponseDetailed(
    sessionId: string,
    questionId: string,
    choice: string,
  ): Observable<SubmitOutcome> {
    return this.bff
      .post<SubmitResponseWire>(
        `/api/v1/classroom-sessions/${encodeURIComponent(sessionId)}/responses`,
        { question_id: questionId, choice },
      )
      .pipe(map(toSubmitOutcome));
  }

  /**
   * POST /api/v1/classroom-sessions/{id}/advance — AdvanceTo (instructor).
   * Opens `questionId` for answering (LIVE only). Returns the post-advance
   * snapshot.
   */
  advance(
    sessionId: string,
    questionId: string,
  ): Observable<ClassroomSessionSnapshot> {
    return this.bff
      .post<ClassroomSessionWire>(
        `/api/v1/classroom-sessions/${encodeURIComponent(sessionId)}/advance`,
        { question_id: questionId },
      )
      .pipe(map(toSnapshot));
  }

  /**
   * GET /api/v1/live-quizzes/{id} — fetch the parent quiz's questions so the
   * presenter can drive the advance control (the snapshot carries only the
   * current question_id). Returns the minimal {questionId, prompt} list.
   */
  liveQuizQuestions(liveQuizId: string): Observable<readonly PresenterQuestion[]> {
    return this.bff
      .get<{
        questions?: {
          question_id: string;
          prompt: string;
          options?: { label: string }[];
        }[];
      }>(`/api/v1/live-quizzes/${encodeURIComponent(liveQuizId)}`)
      .pipe(
        map((q) =>
          (q.questions ?? []).map((x) => ({
            questionId: x.question_id,
            prompt: x.prompt,
            options: (x.options ?? []).map((o) => ({ label: o.label })),
          })),
        ),
      );
  }

  /**
   * Polling stream — emits the snapshot every 2s while LIVE. Stops after
   * one final CLOSED emission. The first emission fires immediately
   * (no 2s delay before initial paint).
   *
   * Optional `stop$` Subject lets the caller stop polling early (e.g. on
   * component teardown). Closes cleanly on emission of any value.
   */
  snapshotStream(
    sessionId: string,
    stop$: Subject<void> = new Subject<void>(),
  ): Observable<ClassroomSessionSnapshot> {
    // Defer keeps the URL evaluation lazy until subscription.
    return defer(() =>
      merge(of(0), interval(CLASSROOM_POLL_INTERVAL_MS)).pipe(
        switchMap(() => this.getSnapshot(sessionId)),
        // A single 5xx used to complete the stream — frozen view until a
        // manual reload. Capped exponential backoff with a fresh immediate
        // fetch per resubscribe; resetOnSuccess so a later blip gets the
        // full budget again. Exhausting the budget propagates the error to
        // the caller's pollError UI (fail loud per the no-stubs rule).
        // 4xx is truth (unknown session, auth, RLS), not turbulence — it
        // fails loud immediately, never retried.
        retry({
          count: CLASSROOM_POLL_RETRY_BUDGET,
          delay: (err, retryCount) => {
            // httpErrorView, not `instanceof HttpErrorResponse`: the global
            // errorInterceptor rethrows every failure as ApiError, so the
            // instanceof matched only in specs. In the app the status read as
            // 0, the predicate below decided a 4xx was turbulence, and an
            // unknown-session, auth or RLS refusal was retried through the
            // whole backoff budget, which is the opposite of what the comment
            // above promises.
            const status = httpErrorView(err)?.status ?? 0;
            if (status >= 400 && status < 500) {
              return throwError(() => err);
            }
            return timer(
              Math.min(
                CLASSROOM_POLL_INTERVAL_MS * 2 ** (retryCount - 1),
                CLASSROOM_POLL_RETRY_MAX_MS,
              ),
            );
          },
          resetOnSuccess: true,
        }),
        // Emit one CLOSED frame then stop (inclusive=true).
        takeWhile((snap) => snap.state !== 'CLOSED', true),
        takeUntil(stop$),
      ),
    );
  }

  /**
   * Visibility-gated polling stream. When the tab is hidden polling
   * pauses; when visible again it resumes. Safe to call in browsers
   * without `document` (SSR-safe — falls back to plain `snapshotStream`).
   */
  visibilityAwareSnapshotStream(
    sessionId: string,
    stop$: Subject<void> = new Subject<void>(),
  ): Observable<ClassroomSessionSnapshot> {
    if (typeof document === 'undefined') {
      return this.snapshotStream(sessionId, stop$);
    }
    // The Observable body emits the initial visibility synchronously on
    // subscribe, so NO startWith() — a startWith(true) here double-emitted the
    // initial value (startWith's `true` + the body's `sub.next(...)`), and each
    // emission spun up a fresh snapshotStream whose `of(0)` fired a GET before
    // switchMap could cancel the prior one → two GETs on load. distinctUntilChanged
    // collapses the single initial emit to one fetch and also suppresses redundant
    // re-fetches when visibilitychange fires without an actual hidden/visible flip.
    const visibility$ = new Observable<boolean>((sub) => {
      sub.next(document.visibilityState !== 'hidden');
      const handler = () => sub.next(document.visibilityState !== 'hidden');
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    }).pipe(distinctUntilChanged());
    return visibility$.pipe(
      switchMap((visible) =>
        visible ? this.snapshotStream(sessionId, stop$) : EMPTY,
      ),
    );
  }
}
