/**
 * Live Quiz Builder model — R+ M9 wave-5 (real BFF wiring).
 *
 * Composer for the presenter-mode quiz. Authors a DRAFT LiveQuiz aggregate
 * via POST /api/v1/live-quizzes, edits via PATCH, publishes via the
 * dedicated /publish action.
 *
 * Wave-3 mock data (CSPO Sprint Planning hard-coded fixture) is removed;
 * the composer now starts every session as a fresh DRAFT and writes back
 * to chora-delivery's classroom.LiveQuiz aggregate at
 * services/chora-delivery/internal/domain/classroom/live_quiz.go.
 *
 * Domain vocabulary anchors:
 *   - `LearningAtom` (MCQ atom — Content Creation primary aggregate)
 *   - `AssessmentSession` (the live presenter session container)
 *   - Cohort (target audience)
 *
 * Wire shape matches the BE liveQuizDTO() in
 * services/chora-delivery/internal/adapter/http/live_quiz_handler.go.
 */

/** Marker for the 4 multiple-choice positions per `feedback_mcq_option_naming`. */
export type QuizOptionKey = 'A' | 'B' | 'C' | 'D';

/** FSM states mirrored from the BE LiveQuiz aggregate. */
export type LiveQuizState =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'ARMED'
  | 'LIVE'
  | 'CLOSED';

/**
 * Post-reveal explainer disclosure policy (Live Classroom expansion,
 * ADR-168 Task #9). Mirrors the BE per-quiz `explainer_mode` enum.
 *
 *   - NEVER            — option explainers are never revealed to learners.
 *   - IMMEDIATE        — reveal right after a learner answers each option.
 *   - END_OF_QUESTION  — reveal when the instructor closes the question.
 *   - END_OF_SESSION   — reveal only on the final session leaderboard.
 */
export type ExplainerMode =
  | 'NEVER'
  | 'IMMEDIATE'
  | 'END_OF_QUESTION'
  | 'END_OF_SESSION';

/** Ordered explainer-mode options for the authoring selector. */
export const EXPLAINER_MODES: readonly ExplainerMode[] = [
  'NEVER',
  'IMMEDIATE',
  'END_OF_QUESTION',
  'END_OF_SESSION',
] as const;

export const DEFAULT_EXPLAINER_MODE: ExplainerMode = 'END_OF_QUESTION';

/**
 * One MCQ option in the composer working copy. The positional `key`
 * (A/B/C/D) is FE-only (per `feedback_mcq_option_naming` — markers are
 * computed at render time and NEVER stored). The BE LiveQuizOption only
 * carries (label, is_correct).
 */
export interface QuizOptionDraft {
  readonly key: QuizOptionKey;
  /** Author-typed answer-choice content (e.g. "Sprint Planning"). */
  readonly text: string;
  /**
   * Post-reveal explanation for this option (Live Classroom expansion,
   * ADR-168 Task #9). DISTINCT from `text` per `feedback_mcq_option_naming`
   * — `text`/`label` is the answer-content the learner picks; `explainer`
   * is the teaching note surfaced after the reveal per the quiz's
   * `explainerMode`. Optional — defaults to '' (no explainer).
   */
  readonly explainer: string;
}

export interface QuizItemDraft {
  /** Stable question id within the quiz. */
  readonly questionId: string;
  /** Question prompt — required, non-blank. */
  readonly prompt: string;
  /** 4 answer options keyed A/B/C/D. */
  readonly options: readonly QuizOptionDraft[];
  /** The canonical correct-answer option key. */
  readonly correctKey: QuizOptionKey;
  /** Per-question timer in seconds (default 60; clamped 5..600). */
  readonly timerSeconds: number;
  /** Per-question score (default 10; clamped 1..100). */
  readonly scorePoints: number;
  /**
   * Optional source LearningAtom id this question was composed from
   * (ADR-168 Task #9 "Add from Atom"). '' for hand-authored questions.
   * Per atom-centric (SP-02) the prompt/options are snapshotted into the
   * question at compose time; the atom_id is a provenance reference, not
   * a live FK (cross-domain refs are UUID-without-constraint).
   */
  readonly atomId: string;
  /** L5.2 (ADR-179 ruling 4): ×2 round — doubles the time-decayed base. */
  readonly doublePoints: boolean;
}

export interface QuizDraft {
  /** Stable draft id once the BE assigns one; '' until first save. */
  readonly id: string;
  /** Current FSM state (DRAFT until Publish lands the response). */
  readonly state: LiveQuizState;
  /** Optional course context (e.g. CSPO course id). */
  readonly courseId: string;
  /** Quiz title — required. */
  readonly title: string;
  /** Items in presentation order. */
  readonly items: readonly QuizItemDraft[];
  /** ISO8601 timestamp the BE stamps on Publish. '' until then. */
  readonly publishedAt: string;
  /**
   * Optional whole-quiz time budget in seconds (ADR-168 Task #9). 0 means
   * "no overall cap" — per-question timers still apply. Clamped 0 or
   * 5..3600 at the input boundary.
   */
  readonly quizTimeLimitSeconds: number;
  /** Post-reveal explainer disclosure policy. */
  readonly explainerMode: ExplainerMode;
}

export const DEFAULT_TIMER_SECONDS = 60;
export const DEFAULT_SCORE_POINTS = 10;
export const MIN_TIMER_SECONDS = 5;
export const MAX_TIMER_SECONDS = 600;
export const MIN_SCORE_POINTS = 1;
export const MAX_SCORE_POINTS = 100;
/** Per-quiz overall time-limit bounds (0 = unlimited; else 5..3600). */
export const MIN_QUIZ_TIME_LIMIT_SECONDS = 5;
export const MAX_QUIZ_TIME_LIMIT_SECONDS = 3600;
export const DEFAULT_QUIZ_TIME_LIMIT_SECONDS = 0;

/**
 * Backend wire shape mirroring liveQuizDTO() in
 * services/chora-delivery/internal/adapter/http/live_quiz_handler.go.
 * Optional fields default at the mapper boundary.
 */
export interface BackendLiveQuizOption {
  readonly label: string;
  readonly is_correct: boolean;
  /** Post-reveal explanation (ADR-168 Task #9). Optional on the wire. */
  readonly explainer?: string;
}

export interface BackendLiveQuizQuestion {
  readonly question_id: string;
  readonly prompt: string;
  readonly options: readonly BackendLiveQuizOption[];
  readonly timer_seconds: number;
  readonly points: number;
  /** Source LearningAtom id (ADR-168 Task #9). Optional on the wire. */
  readonly atom_id?: string;
  /** L5.2 ×2 round flag (CHO-1704). Optional on the wire (old BE). */
  readonly double_points?: boolean;
}

export interface BackendLiveQuiz {
  readonly id: string;
  readonly tenant_id: string;
  readonly course_id: string;
  readonly instructor_gcid: string;
  readonly title: string;
  readonly state: string;
  readonly questions: readonly BackendLiveQuizQuestion[];
  readonly published_at?: string;
  readonly created_at: string;
  readonly updated_at: string;
  /** Whole-quiz time budget in seconds (ADR-168 Task #9). */
  readonly quiz_time_limit_seconds?: number;
  /** Post-reveal explainer disclosure policy (ADR-168 Task #9). */
  readonly explainer_mode?: string;
}

export interface BackendLiveQuizList {
  readonly items: readonly BackendLiveQuiz[];
}

/**
 * Validate a single quiz item — drives the disabled state of the Publish
 * CTA. Mirrors the BE validateQuestion invariants
 * (`>=2 options + exactly one is_correct + prompt + option labels`).
 */
export function validateQuizItem(item: QuizItemDraft): readonly string[] {
  const errors: string[] = [];
  if (item.prompt.trim().length === 0) {
    errors.push('Prompt is required.');
  }
  if (item.options.length !== 4) {
    errors.push('Each item must have 4 options.');
  }
  if (item.options.some((o) => o.text.trim().length === 0)) {
    errors.push('Every option must have text.');
  }
  if (!item.options.some((o) => o.key === item.correctKey)) {
    errors.push('Correct-answer key must match one of the options.');
  }
  if (
    item.timerSeconds < MIN_TIMER_SECONDS ||
    item.timerSeconds > MAX_TIMER_SECONDS
  ) {
    errors.push(
      `Timer must be between ${MIN_TIMER_SECONDS}s and ${MAX_TIMER_SECONDS}s.`,
    );
  }
  if (
    item.scorePoints < MIN_SCORE_POINTS ||
    item.scorePoints > MAX_SCORE_POINTS
  ) {
    errors.push(
      `Score must be between ${MIN_SCORE_POINTS} and ${MAX_SCORE_POINTS} points.`,
    );
  }
  return errors;
}

/**
 * Aggregate validity across the entire draft — drives the Publish CTA
 * disabled state. Empty drafts are invalid (Publish requires >=1 question).
 */
export function isQuizDraftValid(draft: QuizDraft): boolean {
  if (draft.items.length === 0) return false;
  if (draft.title.trim().length === 0) return false;
  return draft.items.every((i) => validateQuizItem(i).length === 0);
}

/** Sum of per-question scorePoints. */
export function totalScore(draft: QuizDraft): number {
  return draft.items.reduce((sum, i) => sum + i.scorePoints, 0);
}

/** Estimated total quiz duration (sum of timer seconds). */
export function totalSeconds(draft: QuizDraft): number {
  return draft.items.reduce((sum, i) => sum + i.timerSeconds, 0);
}

/**
 * Build a fresh blank draft used as the starting state of the composer
 * before any BE round-trip. The composer holds this in a signal and
 * persists via POST → PATCH → POST /publish.
 */
export function blankDraft(): QuizDraft {
  return {
    id: '',
    state: 'DRAFT',
    courseId: '',
    title: '',
    items: [],
    publishedAt: '',
    quizTimeLimitSeconds: DEFAULT_QUIZ_TIME_LIMIT_SECONDS,
    explainerMode: DEFAULT_EXPLAINER_MODE,
  } satisfies QuizDraft;
}

/**
 * Build a fresh blank MCQ item with default timer/score and four empty
 * options keyed A/B/C/D (per `feedback_mcq_option_naming` the key is
 * positional + FE-only; the BE's LiveQuizOption only sees `label` +
 * `is_correct`).
 */
export function blankItem(questionId: string): QuizItemDraft {
  return {
    questionId,
    prompt: '',
    options: [
      { key: 'A', text: '', explainer: '' },
      { key: 'B', text: '', explainer: '' },
      { key: 'C', text: '', explainer: '' },
      { key: 'D', text: '', explainer: '' },
    ],
    correctKey: 'A',
    timerSeconds: DEFAULT_TIMER_SECONDS,
    scorePoints: DEFAULT_SCORE_POINTS,
    atomId: '',
    doublePoints: false,
  };
}

/**
 * Build a quiz item snapshotted from a LearningAtom (ADR-168 Task #9
 * "Add from Atom"). Per atom-centric (SP-02) the prompt/options/explainers
 * are COPIED into the question at compose time — the question owns its
 * snapshot, the `atomId` is a provenance reference only.
 *
 * Source: the composer embeds the reused A+ `AtomQuestionPickerComponent`
 * (BFF search against `GET /api/atoms/questions/search`). On selection the
 * host fetches the full atom projection via
 * `AtomQuestionPickerService.getAtomProjection(atomId)` and passes the
 * resolved prompt/options into this builder; if the atom carries no MCQ
 * payload the caller falls back to the lightweight stem/title plus four
 * blank options for hand-authoring.
 */
export function itemFromAtom(
  questionId: string,
  atomId: string,
  snapshot: {
    readonly prompt: string;
    readonly options: readonly { readonly text: string; readonly explainer?: string }[];
    readonly correctKey?: QuizOptionKey;
  },
): QuizItemDraft {
  const keys: readonly QuizOptionKey[] = ['A', 'B', 'C', 'D'];
  const options: QuizOptionDraft[] = keys.map((key, i) => ({
    key,
    text: snapshot.options[i]?.text ?? '',
    explainer: snapshot.options[i]?.explainer ?? '',
  }));
  return {
    questionId,
    prompt: snapshot.prompt,
    options,
    correctKey: snapshot.correctKey ?? 'A',
    timerSeconds: DEFAULT_TIMER_SECONDS,
    scorePoints: DEFAULT_SCORE_POINTS,
    atomId: atomId.trim(),
    doublePoints: false,
  };
}

/** Coerce an arbitrary string to a known ExplainerMode (defaults safely). */
export function coerceExplainerMode(value: string | undefined): ExplainerMode {
  return EXPLAINER_MODES.includes(value as ExplainerMode)
    ? (value as ExplainerMode)
    : DEFAULT_EXPLAINER_MODE;
}

/**
 * Map a BackendLiveQuiz wire envelope into a QuizDraft. Per
 * `feedback_mcq_option_naming` — the FE assigns positional A/B/C/D markers
 * at decode time; the BE never carries them.
 */
export function mapBackendLiveQuiz(b: BackendLiveQuiz): QuizDraft {
  return {
    id: b.id,
    state: (b.state || 'DRAFT') as LiveQuizState,
    courseId: b.course_id ?? '',
    title: b.title ?? '',
    items: (b.questions ?? []).map(mapBackendLiveQuizQuestion),
    publishedAt: b.published_at ?? '',
    quizTimeLimitSeconds:
      b.quiz_time_limit_seconds ?? DEFAULT_QUIZ_TIME_LIMIT_SECONDS,
    explainerMode: coerceExplainerMode(b.explainer_mode),
  };
}

function mapBackendLiveQuizQuestion(
  q: BackendLiveQuizQuestion,
): QuizItemDraft {
  const keys: readonly QuizOptionKey[] = ['A', 'B', 'C', 'D'];
  const options: QuizOptionDraft[] = [];
  const correctKeyIndex = (q.options ?? []).findIndex((o) => o.is_correct);
  for (let i = 0; i < 4; i++) {
    const beOpt = q.options[i];
    options.push({
      key: keys[i]!,
      text: beOpt?.label ?? '',
      explainer: beOpt?.explainer ?? '',
    });
  }
  const correctKey = correctKeyIndex >= 0 && correctKeyIndex < 4
    ? keys[correctKeyIndex]!
    : 'A';
  return {
    questionId: q.question_id ?? '',
    prompt: q.prompt ?? '',
    options,
    correctKey,
    timerSeconds: q.timer_seconds ?? DEFAULT_TIMER_SECONDS,
    scorePoints: q.points ?? DEFAULT_SCORE_POINTS,
    atomId: q.atom_id ?? '',
    doublePoints: q.double_points ?? false,
  };
}

/**
 * Build the BE create payload from the composer working copy. The BE
 * NewLiveQuiz only takes (tenant_id, course_id, instructor_gcid, title);
 * tenant_id + instructor_gcid are stamped by the mesh.
 */
export function toCreatePayload(draft: QuizDraft): {
  readonly courseId: string;
  readonly title: string;
} {
  return {
    courseId: draft.courseId,
    title: draft.title.trim(),
  };
}

/**
 * Build the BE PATCH payload — replaces title + questions atomically
 * (EditDraft semantics).
 */
export function toPatchPayload(draft: QuizDraft): {
  readonly title: string;
  readonly quiz_time_limit_seconds: number;
  readonly explainer_mode: ExplainerMode;
  readonly questions: readonly BackendLiveQuizQuestion[];
} {
  return {
    title: draft.title.trim(),
    quiz_time_limit_seconds: draft.quizTimeLimitSeconds,
    explainer_mode: draft.explainerMode,
    questions: draft.items.map((it) => ({
      question_id: it.questionId,
      prompt: it.prompt.trim(),
      atom_id: it.atomId,
      options: it.options.map((o) => ({
        label: o.text.trim(),
        is_correct: o.key === it.correctKey,
        explainer: o.explainer.trim(),
      })),
      timer_seconds: it.timerSeconds,
      points: it.scorePoints,
      double_points: it.doublePoints,
    })),
  };
}
