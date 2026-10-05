/**
 * PlayService — L5.2 Live Classroom learner stage (CHO-1704 WS3, ADR-179).
 *
 * The learner page is a STAGE, not an app page (ux_live_classroom_play.md):
 * during a live quiz the learner sees exactly three things — the question,
 * the clock, their standing. This service owns:
 *
 *   1. The pure 7-stage machine derivation (JOIN → LOBBY → GET-READY →
 *      QUESTION → LOCKED → REVEAL → PODIUM) from the polled
 *      `ClassroomSessionSnapshot`.
 *   2. The server-anchored countdown math: the client clock is cosmetic
 *      (skew-corrected from the snapshot's `updated_at`); the BE enforces
 *      the real window at submit. remaining = (locks_at ?? opened_at +
 *      timer + 2s grace) − serverNow, clamped at 0; timer 0 = no ring.
 *   3. Thin delegation to `ClassroomService` for the 4 learner endpoints
 *      (resolve by-code / join / poll / submit) — the polling cadence +
 *      visibility pause are reused from the presenter's proven stream.
 *
 * The stage derivation is exported as pure functions so the spec drives it
 * from snapshot fixtures without a component harness.
 */
import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ClassroomService } from '../classroom/classroom.service';
import {
  ClassroomSessionSnapshot,
  OpenQuestion,
  SessionByCode,
  SubmitOutcome,
} from '../classroom/classroom.model';

/** The 7 learner stages, in journey order. */
export type PlayStage =
  | 'JOIN'
  | 'LOBBY'
  | 'GET_READY'
  | 'QUESTION'
  | 'LOCKED'
  | 'REVEAL'
  | 'PODIUM';

/**
 * Server-side answer-window grace (contract: locks_at = opened_at +
 * timer_seconds + 2s). Used only when `locks_at` is absent on the wire.
 */
export const QUESTION_GRACE_MS = 2_000;

/**
 * GET-READY sync beat: a question is "fresh" for this long after its
 * server-side opened_at. Server-anchored (NOT frame-arrival-anchored) so
 * every device flips to QUESTION at the same instant; late joiners and
 * mid-question refreshes skip the beat naturally.
 */
export const GET_READY_BEAT_MS = 1_500;

/** |skew| beyond this is a stale mutation stamp, not real clock drift. */
export const MAX_PLAUSIBLE_SKEW_MS = 15_000;

/**
 * Clock-skew estimate: server − local, sampled once from the first
 * snapshot's `updated_at` against the local clock at receipt. Returns 0 on
 * an unparsable stamp (old BE) — the local clock then stands in unskewed.
 *
 * CLAMPED to ±15s: `updated_at` is a MUTATION stamp, fresh only right after
 * a write (join/advance/answer). A learner page loaded mid-idle would
 * otherwise estimate minutes of negative "skew" and freeze the stage in
 * GET_READY while the real window expires (caught live, 2026-06-10 walk).
 * Real client clock drift is within a second or two; anything larger here
 * is staleness — trust the local clock instead.
 */
export function estimateSkewMs(serverIso: string, localNowMs: number): number {
  const server = Date.parse(serverIso);
  if (!Number.isFinite(server)) return 0;
  const skew = server - localNowMs;
  return Math.abs(skew) <= MAX_PLAUSIBLE_SKEW_MS ? skew : 0;
}

/**
 * Absolute lock deadline (ms since epoch, server clock) for an open
 * question. null = untimed (timer 0 never locks → no countdown ring).
 */
export function questionDeadlineMs(q: OpenQuestion): number | null {
  if (q.locksAt) {
    const locks = Date.parse(q.locksAt);
    if (Number.isFinite(locks)) return locks;
  }
  if (q.timerSeconds <= 0) return null;
  const opened = Date.parse(q.openedAt);
  if (!Number.isFinite(opened)) return null;
  return opened + q.timerSeconds * 1_000 + QUESTION_GRACE_MS;
}

/** Remaining window in ms, clamped ≥ 0. null when the question is untimed. */
export function remainingMs(
  q: OpenQuestion,
  serverNowMs: number,
): number | null {
  const deadline = questionDeadlineMs(q);
  if (deadline === null) return null;
  return Math.max(0, deadline - serverNowMs);
}

/**
 * Fraction of the answer window remaining (1 → 0) for the conic-gradient
 * ring. 1 for untimed questions (full, static ring is hidden anyway).
 */
export function remainingFraction(
  q: OpenQuestion,
  serverNowMs: number,
): number {
  const deadline = questionDeadlineMs(q);
  if (deadline === null) return 1;
  const opened = Date.parse(q.openedAt);
  const total = deadline - (Number.isFinite(opened) ? opened : deadline);
  if (total <= 0) return 0;
  const left = Math.max(0, deadline - serverNowMs);
  return Math.min(1, left / total);
}

/** "k answered" — sum of the per-choice response counts. Nil-safe. */
export function answeredCount(
  snapshot: ClassroomSessionSnapshot | null,
): number {
  if (!snapshot) return 0;
  return Object.values(snapshot.responseCounts).reduce(
    (sum, n) => sum + (n ?? 0),
    0,
  );
}

/** English ordinal for ranks ("You placed 12th of 30"). */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Per-caller context the snapshot alone cannot know. */
export interface StageContext {
  /** True once this learner has a roster identity (join 200 or `me`). */
  readonly joined: boolean;
  /** The question_id this learner has already answered ('' = none). */
  readonly answeredQuestionId: string;
  /** Skew-corrected server-now in ms. */
  readonly serverNowMs: number;
}

/**
 * Pure 7-stage derivation. Order of precedence mirrors the UX journey:
 *
 *   not joined            → JOIN  (the BE rejects everything else anyway)
 *   CLOSED                → PODIUM (final frame renders before polling stops)
 *   no open question      → LOBBY ("eyes on the big screen")
 *   question locked       → REVEAL (server flag OR local countdown at 0 —
 *                            the BE enforces the true window at submit)
 *   already answered      → LOCKED (held result stays hidden)
 *   freshly opened        → GET_READY (server-anchored sync beat)
 *   otherwise             → QUESTION
 */
export function deriveStage(
  snapshot: ClassroomSessionSnapshot | null,
  ctx: StageContext,
): PlayStage {
  if (!snapshot || !ctx.joined) return 'JOIN';
  if (snapshot.state === 'CLOSED') return 'PODIUM';
  const q = snapshot.openQuestion;
  if (!q) return 'LOBBY';
  const remaining = remainingMs(q, ctx.serverNowMs);
  if (q.locked || (remaining !== null && remaining <= 0)) return 'REVEAL';
  if (ctx.answeredQuestionId === q.questionId) return 'LOCKED';
  const opened = Date.parse(q.openedAt);
  if (
    Number.isFinite(opened) &&
    ctx.serverNowMs - opened < GET_READY_BEAT_MS
  ) {
    return 'GET_READY';
  }
  return 'QUESTION';
}

@Injectable({ providedIn: 'root' })
export class PlayService {
  private readonly classroom = inject(ClassroomService);

  /** Resolve a join code to its live session (GET by-code). */
  resolveCode(code: string): Observable<SessionByCode> {
    return this.classroom.resolveByCode(code);
  }

  /** Claim a nickname + join the lobby (POST join). */
  join(
    sessionId: string,
    nickname: string,
  ): Observable<ClassroomSessionSnapshot> {
    return this.classroom.join(sessionId, nickname);
  }

  /** Submit the tapped option LABEL; keeps the 201 `your_result`. */
  submit(
    sessionId: string,
    questionId: string,
    choice: string,
  ): Observable<SubmitOutcome> {
    return this.classroom.submitResponseDetailed(sessionId, questionId, choice);
  }

  /**
   * 2s visibility-paused snapshot poll. Stops only after one final CLOSED
   * frame — i.e. AFTER the podium has data to render.
   */
  snapshotStream(
    sessionId: string,
    stop$: Subject<void>,
  ): Observable<ClassroomSessionSnapshot> {
    return this.classroom.visibilityAwareSnapshotStream(sessionId, stop$);
  }
}
