/**
 * Classroom model — R+ Stage C-lite Wave-5 M8.
 *
 * LiveQuizSession snapshot view-model. Mirrors the BE wire shape from
 * `services/chora-delivery/internal/adapter/http/classroom_session_handler.go`
 * (`classroomSessionDTO`). Tablet-first presenter view.
 *
 * Replaces the wave-2 mock cohort/audience-pulse model with the real
 * 5-endpoint LiveQuizSession contract (start / start-transition / close /
 * snapshot / submit-response).
 *
 * Domain vocabulary anchors:
 *   - `LiveQuizSession` — the per-run classroom-realtime aggregate
 *     (chora-delivery domain/classroom/live_quiz_session.go).
 *   - `QuestionResponse` — one learner answer (first-write-wins).
 *   - `GCID` — Global Chora ID (learner identifier).
 */

export type ClassroomSessionState = 'ARMED' | 'LIVE' | 'CLOSED';

/**
 * Parent-quiz question projection. The presenter uses {questionId, prompt} to
 * drive the "advance" control; the learner-answer view additionally needs the
 * option labels to render the choices (`choice` submitted = the option label,
 * per the BE `isCorrectChoice` contract). Sourced from GET /api/v1/live-quizzes/{id}.
 */
export interface PresenterQuestion {
  readonly questionId: string;
  readonly prompt: string;
  readonly options: readonly { readonly label: string }[];
}

// ── L5.2 Live Classroom-stage view-model blocks (CHO-1704 WS3, ADR-179) ──────────────
// Every block below is OPTIONAL on the wire (the deployed BE may not carry
// them yet) and nil-safed by `toSnapshot` so the FE never branches on
// undefined. Learner-safe per ADR-179 D3 — options carry labels only.

/** Lobby roster entry — gcids are NEVER exposed on the roster. */
export interface Participant {
  readonly nickname: string;
  readonly joinedAt: string;
}

/**
 * The learner-safe open-question block. The learner stage never fetches the
 * quiz — this block carries everything the stage renders (prompt + option
 * labels + the server-anchored answer window).
 */
export interface OpenQuestion {
  readonly questionId: string;
  readonly prompt: string;
  readonly options: readonly { readonly label: string }[];
  /** RFC3339 — when the instructor presented the question. */
  readonly openedAt: string;
  /** 0 = untimed (never locks). */
  readonly timerSeconds: number;
  /** ×2 round (L5.2 builder flag). */
  readonly doublePoints: boolean;
  /** opened_at + timer + 2s grace; null when timer 0 (never locks). */
  readonly locksAt: string | null;
  /** Lazily derived per read on the BE — no scheduler. */
  readonly locked: boolean;
}

/** One ranked row (interim scoreboard / podium / frozen final board). */
export interface ScoreboardEntry {
  readonly nickname: string;
  readonly score: number;
  readonly streak: number;
  readonly rank: number;
}

/** The submitter's own grade — the ONLY pre-reveal correctness channel. */
export interface YourResult {
  readonly questionId: string;
  readonly correct: boolean;
  readonly basePoints: number;
  readonly streakBonus: number;
  readonly awardedPoints: number;
  readonly streakAfter: number;
}

/** Per-caller standing — computed from the gcid, omitted for non-joiners. */
export interface SessionMe {
  readonly nickname: string;
  readonly score: number;
  readonly rank: number;
  readonly streak: number;
  readonly lastResult: YourResult | null;
}

/** Post-lock disclosure — present only when RevealAllowed(explainer_mode). */
export interface Reveal {
  readonly questionId: string;
  readonly correctLabel: string;
  readonly explainer: string;
}

/**
 * One row of the post-close answer review (contract v1.2.0, HANDOFF_L52
 * §4.6) — per-caller: carries the caller's own choice/grade alongside the
 * answer key for every asked question.
 */
export interface RevealEntry {
  readonly questionId: string;
  readonly prompt: string;
  readonly correctLabel: string;
  readonly explainer: string;
  /** Caller's submitted label; null when this question was skipped. */
  readonly yourChoice: string | null;
  readonly yourCorrect: boolean;
}

export interface ClassroomSessionSnapshot {
  /** LiveQuizSession id (UUIDv7). */
  readonly id: string;
  /** Tenant id (RLS scope). */
  readonly tenantId: string;
  /** Parent LiveQuiz id. */
  readonly liveQuizId: string;
  /** Instructor GCID — the host. */
  readonly instructorGcid: string;
  /** State machine — drives the polling stop condition. */
  readonly state: ClassroomSessionState;
  /**
   * The question_id the FE renders responses for. Empty string before any
   * learner has answered — the FE shows the "waiting" state.
   */
  readonly currentQuestionId: string;
  /**
   * Per-choice response counts for `currentQuestionId`. Empty object
   * before any response — never null/undefined per the wire contract
   * (`feedback_no_stubs_real_wiring`: every slot present so the UI can
   * render the empty-state truthfully).
   */
  readonly responseCounts: Readonly<Record<string, number>>;
  /** Unique learner-GCID count across all responses in the session. */
  readonly joinedLearners: number;
  /** RFC3339 timestamp when ARMED→LIVE fired (absent in ARMED). */
  readonly startedAt: string | null;
  /** RFC3339 timestamp when LIVE→CLOSED fired (absent until CLOSED). */
  readonly endedAt: string | null;
  // ── L5.2 Live Classroom-stage fields (all nil-safe defaults for the old BE) ──
  /** Ephemeral 6-char join code ('' when the BE doesn't carry it yet). */
  readonly joinCode: string;
  /** Lobby roster size (join-based; distinct from joinedLearners). */
  readonly participantCount: number;
  /** Lobby roster (nicknames only). */
  readonly participants: readonly Participant[];
  /** Learner-safe open question; null when nothing is presented. */
  readonly openQuestion: OpenQuestion | null;
  /** Interim ranked board (top 20), present once LIVE. */
  readonly scoreboard: readonly ScoreboardEntry[];
  /** Top 3–5, present when CLOSED. */
  readonly podium: readonly ScoreboardEntry[];
  /** Frozen by Close — ephemeral, lives only in the session row. */
  readonly finalScoreboard: readonly ScoreboardEntry[];
  /** Per-caller standing; null for header-only/non-joined callers. */
  readonly me: SessionMe | null;
  /** Per-caller reveal; null pre-lock or when the mode forbids it. */
  readonly reveal: Reveal | null;
  /**
   * Post-close full answer review — one entry per asked question once
   * CLOSED (explainer_mode != NEVER). Empty until then.
   */
  readonly reveals: readonly RevealEntry[];
  /** RFC3339 server stamp of this frame — drives the clock-skew estimate. */
  readonly updatedAt: string;
}

// ── Wire shapes (BE snake_case; optionals = deployed-BE compatibility) ───────

export interface ParticipantWire {
  readonly nickname: string;
  readonly joined_at: string;
}

export interface OpenQuestionWire {
  readonly question_id: string;
  readonly prompt: string;
  readonly options?: readonly { readonly label: string }[];
  readonly opened_at: string;
  readonly timer_seconds: number;
  readonly double_points?: boolean;
  readonly locks_at?: string;
  readonly locked?: boolean;
}

export interface ScoreboardEntryWire {
  readonly nickname: string;
  readonly score: number;
  readonly streak?: number;
  readonly rank: number;
}

export interface YourResultWire {
  readonly question_id: string;
  readonly correct: boolean;
  readonly base_points?: number;
  readonly streak_bonus?: number;
  readonly awarded_points: number;
  readonly streak_after?: number;
}

export interface SessionMeWire {
  readonly nickname?: string;
  readonly score?: number;
  readonly rank?: number;
  readonly streak?: number;
  readonly last_result?: YourResultWire;
}

export interface RevealWire {
  readonly question_id: string;
  readonly correct_label?: string;
  readonly explainer?: string;
}

export interface RevealEntryWire {
  readonly question_id: string;
  readonly prompt?: string;
  readonly correct_label?: string;
  readonly explainer?: string;
  readonly your_choice?: string;
  readonly your_correct?: boolean;
}

/**
 * Wire shape from BE `classroomSessionDTO`. Field names are snake_case
 * (Go default). Adapted to camelCase in `toSnapshot`.
 */
export interface ClassroomSessionWire {
  readonly id: string;
  readonly tenant_id: string;
  readonly live_quiz_id: string;
  readonly instructor_gcid: string;
  readonly state: ClassroomSessionState;
  readonly current_question_id: string;
  readonly response_counts: Record<string, number>;
  readonly joined_learners: number;
  readonly started_at?: string;
  readonly ended_at?: string;
  readonly created_at: string;
  readonly updated_at: string;
  // L5.2 Live Classroom-stage blocks — optional until the BE rollout completes.
  readonly join_code?: string;
  readonly participant_count?: number;
  readonly participants?: readonly ParticipantWire[];
  readonly open_question?: OpenQuestionWire;
  readonly scoreboard?: readonly ScoreboardEntryWire[];
  readonly podium?: readonly ScoreboardEntryWire[];
  readonly final_scoreboard?: readonly ScoreboardEntryWire[];
  readonly me?: SessionMeWire;
  readonly reveal?: RevealWire;
  readonly reveals?: readonly RevealEntryWire[];
}

/** 201 body of POST .../responses — the snapshot + the submitter's grade. */
export interface SubmitResponseWire extends ClassroomSessionWire {
  readonly your_result?: YourResultWire;
}

/** FE-side split of the 201 submit body. */
export interface SubmitOutcome {
  readonly snapshot: ClassroomSessionSnapshot;
  readonly yourResult: YourResult | null;
}

/** GET /api/v1/classroom-sessions/by-code/{code} body. */
export interface SessionByCodeWire {
  readonly session_id: string;
  readonly live_quiz_id: string;
  readonly quiz_title?: string;
  readonly state: ClassroomSessionState;
  readonly participant_count?: number;
}

export interface SessionByCode {
  readonly sessionId: string;
  readonly liveQuizId: string;
  readonly quizTitle: string;
  readonly state: ClassroomSessionState;
  readonly participantCount: number;
}

function toOpenQuestion(w?: OpenQuestionWire): OpenQuestion | null {
  if (!w) return null;
  return {
    questionId: w.question_id ?? '',
    prompt: w.prompt ?? '',
    options: (w.options ?? []).map((o) => ({ label: o.label ?? '' })),
    openedAt: w.opened_at ?? '',
    timerSeconds: w.timer_seconds ?? 0,
    doublePoints: w.double_points ?? false,
    locksAt: w.locks_at ?? null,
    locked: w.locked ?? false,
  };
}

function toBoard(
  rows?: readonly ScoreboardEntryWire[],
): readonly ScoreboardEntry[] {
  return (rows ?? []).map((r) => ({
    nickname: r.nickname ?? '',
    score: r.score ?? 0,
    streak: r.streak ?? 0,
    rank: r.rank ?? 0,
  }));
}

function toYourResult(w?: YourResultWire | null): YourResult | null {
  if (!w) return null;
  return {
    questionId: w.question_id ?? '',
    correct: w.correct ?? false,
    basePoints: w.base_points ?? 0,
    streakBonus: w.streak_bonus ?? 0,
    awardedPoints: w.awarded_points ?? 0,
    streakAfter: w.streak_after ?? 0,
  };
}

function toMe(w?: SessionMeWire): SessionMe | null {
  if (!w) return null;
  return {
    nickname: w.nickname ?? '',
    score: w.score ?? 0,
    rank: w.rank ?? 0,
    streak: w.streak ?? 0,
    lastResult: toYourResult(w.last_result),
  };
}

function toReveal(w?: RevealWire): Reveal | null {
  if (!w) return null;
  return {
    questionId: w.question_id ?? '',
    correctLabel: w.correct_label ?? '',
    explainer: w.explainer ?? '',
  };
}

function toRevealEntries(
  w?: readonly RevealEntryWire[],
): readonly RevealEntry[] {
  return (w ?? []).map((e) => ({
    questionId: e.question_id ?? '',
    prompt: e.prompt ?? '',
    correctLabel: e.correct_label ?? '',
    explainer: e.explainer ?? '',
    // BE omits your_choice entirely for skipped questions.
    yourChoice: e.your_choice ?? null,
    yourCorrect: e.your_correct ?? false,
  }));
}

/** Adapts the BE snake_case wire shape into the FE camelCase view-model. */
export function toSnapshot(wire: ClassroomSessionWire): ClassroomSessionSnapshot {
  return {
    id: wire.id,
    tenantId: wire.tenant_id,
    liveQuizId: wire.live_quiz_id,
    instructorGcid: wire.instructor_gcid,
    state: wire.state,
    currentQuestionId: wire.current_question_id ?? '',
    responseCounts: wire.response_counts ?? {},
    joinedLearners: wire.joined_learners ?? 0,
    startedAt: wire.started_at ?? null,
    endedAt: wire.ended_at ?? null,
    joinCode: wire.join_code ?? '',
    participantCount: wire.participant_count ?? 0,
    participants: (wire.participants ?? []).map((p) => ({
      nickname: p.nickname ?? '',
      joinedAt: p.joined_at ?? '',
    })),
    openQuestion: toOpenQuestion(wire.open_question),
    scoreboard: toBoard(wire.scoreboard),
    podium: toBoard(wire.podium),
    finalScoreboard: toBoard(wire.final_scoreboard),
    me: toMe(wire.me),
    reveal: toReveal(wire.reveal),
    reveals: toRevealEntries(wire.reveals),
    updatedAt: wire.updated_at ?? '',
  };
}

/** Splits the 201 submit body into the snapshot + the held your_result. */
export function toSubmitOutcome(wire: SubmitResponseWire): SubmitOutcome {
  return {
    snapshot: toSnapshot(wire),
    yourResult: toYourResult(wire.your_result),
  };
}

/** Adapts the by-code resolution body. */
export function toSessionByCode(wire: SessionByCodeWire): SessionByCode {
  return {
    sessionId: wire.session_id ?? '',
    liveQuizId: wire.live_quiz_id ?? '',
    quizTitle: wire.quiz_title ?? '',
    state: wire.state,
    participantCount: wire.participant_count ?? 0,
  };
}

/**
 * One presenter-row in the response-distribution bar chart. The marker
 * (A/B/C/D) is the choice value submitted by the learner — the BE stores
 * the choice verbatim; the FE sorts marker-asc to give a stable visual
 * order (per `feedback_mcq_option_naming`: marker is positional + never
 * embedded in payload).
 */
export interface ResponseChoiceRow {
  readonly marker: string;
  readonly count: number;
  readonly percent: number;
}

/**
 * Build the bar-chart row list from a snapshot. Sorted marker-asc.
 * Percent rounded to nearest int; safe at 0 total (returns []).
 */
export function buildResponseRows(snapshot: ClassroomSessionSnapshot): readonly ResponseChoiceRow[] {
  const counts = snapshot.responseCounts;
  const markers = Object.keys(counts).sort();
  if (markers.length === 0) return [];
  const total = markers.reduce((sum, m) => sum + counts[m], 0);
  if (total <= 0) return [];
  return markers.map((marker) => ({
    marker,
    count: counts[marker],
    percent: Math.round((counts[marker] / total) * 100),
  }));
}

/**
 * Compute the per-option percent given a count + total. Pure, exposed
 * for unit tests + components that pre-format their own row data.
 */
export function responsePercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}
