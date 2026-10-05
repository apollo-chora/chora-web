/**
 * PlayService spec — L5.2 Live Classroom learner stage (CHO-1704 WS3).
 *
 * Covers the pure stage-machine derivation (7-stage learner journey from
 * `docs/design/ux_live_classroom_play.md`) + the server-anchored countdown
 * math. Fixtures are built through the REAL wire adapter (`toSnapshot`) so
 * the snake_case → camelCase mapping is exercised end-to-end.
 *
 * Stage map: JOIN → LOBBY → GET-READY → QUESTION → LOCKED → REVEAL → PODIUM.
 */
import { describe, it, expect } from 'vitest';
import {
  toSnapshot,
  type ClassroomSessionWire,
} from '../classroom/classroom.model';
import {
  GET_READY_BEAT_MS,
  QUESTION_GRACE_MS,
  answeredCount,
  deriveStage,
  estimateSkewMs,
  ordinal,
  questionDeadlineMs,
  remainingFraction,
  remainingMs,
  type StageContext,
} from './play.service';

/** Anchor instant for all fixtures (server clock). */
const T0 = Date.parse('2026-06-10T03:00:00Z');
const iso = (ms: number): string => new Date(ms).toISOString();

const wire = (
  overrides: Partial<ClassroomSessionWire> = {},
): ClassroomSessionWire => ({
  id: 'sess-1',
  tenant_id: 'tA',
  live_quiz_id: 'quiz-1',
  instructor_gcid: 'i-1',
  state: 'LIVE',
  current_question_id: '',
  response_counts: {},
  joined_learners: 0,
  created_at: iso(T0 - 60_000),
  updated_at: iso(T0),
  ...overrides,
});

/** An open question fixture: opened at T0, 60s timer, no explicit locks_at. */
const openQuestion = (
  over: Partial<NonNullable<ClassroomSessionWire['open_question']>> = {},
) => ({
  question_id: 'q-1',
  prompt: 'What is 2 + 2?',
  options: [{ label: '3' }, { label: '4' }, { label: '5' }, { label: '22' }],
  opened_at: iso(T0),
  timer_seconds: 60,
  double_points: false,
  locked: false,
  ...over,
});

const ctx = (over: Partial<StageContext> = {}): StageContext => ({
  joined: true,
  answeredQuestionId: '',
  serverNowMs: T0 + 10_000,
  ...over,
});

describe('play.service — deriveStage', () => {
  it('JOIN before the learner has joined (even when LIVE)', () => {
    const snap = toSnapshot(wire({ open_question: openQuestion() }));
    expect(deriveStage(snap, ctx({ joined: false }))).toBe('JOIN');
  });

  it('JOIN while the snapshot has not arrived yet', () => {
    expect(deriveStage(null, ctx())).toBe('JOIN');
  });

  it('ARMED (no open question) → LOBBY once joined', () => {
    const snap = toSnapshot(wire({ state: 'ARMED' }));
    expect(deriveStage(snap, ctx())).toBe('LOBBY');
  });

  it('LIVE with no question presented yet → LOBBY', () => {
    const snap = toSnapshot(wire());
    expect(deriveStage(snap, ctx())).toBe('LOBBY');
  });

  it('a freshly-opened question → GET_READY for the sync beat', () => {
    const snap = toSnapshot(wire({ open_question: openQuestion() }));
    expect(
      deriveStage(snap, ctx({ serverNowMs: T0 + GET_READY_BEAT_MS - 1 })),
    ).toBe('GET_READY');
  });

  it('open question after the beat → QUESTION', () => {
    const snap = toSnapshot(wire({ open_question: openQuestion() }));
    expect(deriveStage(snap, ctx({ serverNowMs: T0 + 10_000 }))).toBe(
      'QUESTION',
    );
  });

  it('own submission → LOCKED while the window is still open', () => {
    const snap = toSnapshot(wire({ open_question: openQuestion() }));
    expect(
      deriveStage(snap, ctx({ answeredQuestionId: 'q-1' })),
    ).toBe('LOCKED');
  });

  it('a submission for a PRIOR question does not lock the new one', () => {
    const snap = toSnapshot(wire({ open_question: openQuestion() }));
    expect(
      deriveStage(snap, ctx({ answeredQuestionId: 'q-0' })),
    ).toBe('QUESTION');
  });

  it('server-flagged locked → REVEAL (answered or not)', () => {
    const snap = toSnapshot(
      wire({ open_question: openQuestion({ locked: true }) }),
    );
    expect(deriveStage(snap, ctx())).toBe('REVEAL');
    expect(deriveStage(snap, ctx({ answeredQuestionId: 'q-1' }))).toBe(
      'REVEAL',
    );
  });

  it('flips QUESTION → REVEAL locally when remaining hits 0', () => {
    const snap = toSnapshot(wire({ open_question: openQuestion() }));
    // 60s timer + 2s grace — one ms past the deadline.
    expect(
      deriveStage(
        snap,
        ctx({ serverNowMs: T0 + 62_000 + 1, answeredQuestionId: 'q-1' }),
      ),
    ).toBe('REVEAL');
  });

  it('timer 0 questions never lock locally (QUESTION an hour later)', () => {
    const snap = toSnapshot(
      wire({ open_question: openQuestion({ timer_seconds: 0 }) }),
    );
    expect(
      deriveStage(snap, ctx({ serverNowMs: T0 + 3_600_000 })),
    ).toBe('QUESTION');
  });

  it('CLOSED → PODIUM regardless of question state', () => {
    const snap = toSnapshot(
      wire({ state: 'CLOSED', open_question: openQuestion() }),
    );
    expect(deriveStage(snap, ctx())).toBe('PODIUM');
  });
});

describe('play.service — countdown math', () => {
  it('uses locks_at verbatim when present', () => {
    const snap = toSnapshot(
      wire({
        open_question: openQuestion({ locks_at: iso(T0 + 45_000) }),
      }),
    );
    expect(questionDeadlineMs(snap.openQuestion!)).toBe(T0 + 45_000);
  });

  it('falls back to opened_at + timer + 2s grace when locks_at absent', () => {
    const snap = toSnapshot(wire({ open_question: openQuestion() }));
    expect(questionDeadlineMs(snap.openQuestion!)).toBe(
      T0 + 60_000 + QUESTION_GRACE_MS,
    );
  });

  it('timer_seconds 0 → null deadline (no ring, never locks)', () => {
    const snap = toSnapshot(
      wire({ open_question: openQuestion({ timer_seconds: 0 }) }),
    );
    expect(questionDeadlineMs(snap.openQuestion!)).toBeNull();
    expect(remainingMs(snap.openQuestion!, T0 + 5_000)).toBeNull();
  });

  it('remainingMs counts down and clamps at 0', () => {
    const snap = toSnapshot(wire({ open_question: openQuestion() }));
    const q = snap.openQuestion!;
    expect(remainingMs(q, T0)).toBe(62_000);
    expect(remainingMs(q, T0 + 30_000)).toBe(32_000);
    expect(remainingMs(q, T0 + 99_000)).toBe(0);
  });

  it('remainingFraction spans 1 → 0 over the window', () => {
    const snap = toSnapshot(wire({ open_question: openQuestion() }));
    const q = snap.openQuestion!;
    expect(remainingFraction(q, T0)).toBe(1);
    expect(remainingFraction(q, T0 + 31_000)).toBeCloseTo(0.5, 2);
    expect(remainingFraction(q, T0 + 90_000)).toBe(0);
  });

  it('estimateSkewMs is server-minus-local (and 0 on garbage)', () => {
    expect(estimateSkewMs(iso(T0), T0 - 7_000)).toBe(7_000);
    expect(estimateSkewMs(iso(T0), T0 + 3_000)).toBe(-3_000);
    expect(estimateSkewMs('not-a-date', T0)).toBe(0);
    expect(estimateSkewMs('', T0)).toBe(0);
  });
});

describe('play.service — helpers', () => {
  it('answeredCount sums the per-choice response counts', () => {
    const snap = toSnapshot(
      wire({ response_counts: { '3': 1, '4': 7, '22': 4 } }),
    );
    expect(answeredCount(snap)).toBe(12);
    expect(answeredCount(toSnapshot(wire()))).toBe(0);
    expect(answeredCount(null)).toBe(0);
  });

  it('ordinal renders English ordinals for ranks', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(101)).toBe('101st');
  });
});

// Regression (2026-06-10 live walk): updated_at is a MUTATION stamp — an
// idle-loaded page estimated minutes of negative skew and froze GET_READY
// while the real window expired. Stale stamps must clamp to 0.
describe('estimateSkewMs — stale-stamp clamp', () => {
  it('keeps plausible skews (±15s)', () => {
    expect(estimateSkewMs(new Date(1_000_000).toISOString(), 1_000_000 - 3_000)).toBe(3_000);
    expect(estimateSkewMs(new Date(1_000_000).toISOString(), 1_000_000 + 14_999)).toBe(-14_999);
  });

  it('zeroes implausible (stale mutation-stamp) skews', () => {
    expect(estimateSkewMs(new Date(1_000_000).toISOString(), 1_000_000 + 120_000)).toBe(0);
    expect(estimateSkewMs(new Date(1_000_000).toISOString(), 1_000_000 - 120_000)).toBe(0);
  });
});
