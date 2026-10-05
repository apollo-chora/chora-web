import { describe, it, expect } from 'vitest';
import {
  buildResponseRows,
  ClassroomSessionSnapshot,
  responsePercent,
  toSessionByCode,
  toSnapshot,
  toSubmitOutcome,
} from './classroom.model';

const snap = (
  overrides: Partial<ClassroomSessionSnapshot> = {},
): ClassroomSessionSnapshot => ({
  id: 'sess-1',
  tenantId: 'tenant-A',
  liveQuizId: 'quiz-1',
  instructorGcid: 'gcid-instr',
  state: 'LIVE',
  currentQuestionId: 'q1',
  responseCounts: { A: 1, B: 3, C: 2, D: 0 },
  joinedLearners: 6,
  startedAt: '2026-05-26T03:00:00Z',
  endedAt: null,
  // L5.2 Live Classroom-stage fields (CHO-1704 WS3)
  joinCode: '',
  participantCount: 0,
  participants: [],
  openQuestion: null,
  scoreboard: [],
  podium: [],
  finalScoreboard: [],
  me: null,
  reveal: null,
  reveals: [],
  updatedAt: '2026-05-26T03:00:02Z',
  ...overrides,
});

describe('classroom.model — responsePercent', () => {
  it('returns 0 when total is 0', () => {
    expect(responsePercent(5, 0)).toBe(0);
  });

  it('returns 0 when total is negative', () => {
    expect(responsePercent(5, -1)).toBe(0);
  });

  it('rounds to nearest integer', () => {
    expect(responsePercent(1, 3)).toBe(33);
    expect(responsePercent(2, 3)).toBe(67);
  });

  it('returns 100 when one option captures all', () => {
    expect(responsePercent(10, 10)).toBe(100);
  });
});

describe('classroom.model — toSnapshot (wire-shape adapter)', () => {
  it('camelCases snake_case wire fields', () => {
    const out = toSnapshot({
      id: 'sess',
      tenant_id: 'tA',
      live_quiz_id: 'q',
      instructor_gcid: 'i',
      state: 'ARMED',
      current_question_id: '',
      response_counts: {},
      joined_learners: 0,
      created_at: '2026-05-26T03:00:00Z',
      updated_at: '2026-05-26T03:00:00Z',
    });
    expect(out.id).toBe('sess');
    expect(out.tenantId).toBe('tA');
    expect(out.liveQuizId).toBe('q');
    expect(out.instructorGcid).toBe('i');
    expect(out.state).toBe('ARMED');
  });

  it('defaults missing response_counts to {} and joined_learners to 0', () => {
    const out = toSnapshot({
      id: 'sess',
      tenant_id: 'tA',
      live_quiz_id: 'q',
      instructor_gcid: 'i',
      state: 'ARMED',
      current_question_id: '',
      response_counts: undefined as unknown as Record<string, number>,
      joined_learners: undefined as unknown as number,
      created_at: '2026-05-26T03:00:00Z',
      updated_at: '2026-05-26T03:00:00Z',
    });
    expect(out.responseCounts).toEqual({});
    expect(out.joinedLearners).toBe(0);
  });

  it('maps started_at + ended_at when present, null otherwise', () => {
    const out = toSnapshot({
      id: 'sess',
      tenant_id: 'tA',
      live_quiz_id: 'q',
      instructor_gcid: 'i',
      state: 'CLOSED',
      current_question_id: 'q1',
      response_counts: { A: 1 },
      joined_learners: 1,
      started_at: '2026-05-26T03:00:00Z',
      ended_at: '2026-05-26T03:30:00Z',
      created_at: '2026-05-26T02:55:00Z',
      updated_at: '2026-05-26T03:30:00Z',
    });
    expect(out.startedAt).toBe('2026-05-26T03:00:00Z');
    expect(out.endedAt).toBe('2026-05-26T03:30:00Z');
  });
});

describe('classroom.model — buildResponseRows', () => {
  it('returns empty array when responseCounts is empty', () => {
    expect(
      buildResponseRows(snap({ responseCounts: {} })),
    ).toEqual([]);
  });

  it('returns empty array when total counts is 0', () => {
    expect(
      buildResponseRows(snap({ responseCounts: { A: 0, B: 0 } })),
    ).toEqual([]);
  });

  it('sorts rows by marker ascending', () => {
    const rows = buildResponseRows(
      snap({ responseCounts: { C: 1, A: 2, B: 3 } }),
    );
    expect(rows.map((r) => r.marker)).toEqual(['A', 'B', 'C']);
  });

  it('computes percent rounded to nearest int', () => {
    // A:1 B:3 C:2 → total 6 → A 17%, B 50%, C 33%
    const rows = buildResponseRows(
      snap({ responseCounts: { A: 1, B: 3, C: 2 } }),
    );
    expect(rows.find((r) => r.marker === 'A')?.percent).toBe(17);
    expect(rows.find((r) => r.marker === 'B')?.percent).toBe(50);
    expect(rows.find((r) => r.marker === 'C')?.percent).toBe(33);
  });

  it('keeps the raw count alongside the percent', () => {
    const rows = buildResponseRows(
      snap({ responseCounts: { A: 4, B: 6 } }),
    );
    expect(rows.find((r) => r.marker === 'A')?.count).toBe(4);
    expect(rows.find((r) => r.marker === 'B')?.count).toBe(6);
  });
});

// ── L5.2 Live Classroom-stage snapshot extension (CHO-1704 WS3) ──────────────────────

const baseWire = {
  id: 'sess',
  tenant_id: 'tA',
  live_quiz_id: 'q',
  instructor_gcid: 'i',
  state: 'LIVE' as const,
  current_question_id: 'q-1',
  response_counts: { '4': 3 },
  joined_learners: 3,
  created_at: '2026-06-10T03:00:00Z',
  updated_at: '2026-06-10T03:01:00Z',
};

describe('classroom.model — toSnapshot L5.2 extension', () => {
  it('nil-safes every new field when the deployed BE omits them', () => {
    const out = toSnapshot(baseWire);
    expect(out.joinCode).toBe('');
    expect(out.participantCount).toBe(0);
    expect(out.participants).toEqual([]);
    expect(out.openQuestion).toBeNull();
    expect(out.scoreboard).toEqual([]);
    expect(out.podium).toEqual([]);
    expect(out.finalScoreboard).toEqual([]);
    expect(out.me).toBeNull();
    expect(out.reveal).toBeNull();
    expect(out.reveals).toEqual([]);
    expect(out.updatedAt).toBe('2026-06-10T03:01:00Z');
  });

  it('maps reveals (post-close answer review) — skipped questions get yourChoice null', () => {
    const out = toSnapshot({
      ...baseWire,
      state: 'CLOSED',
      reveals: [
        {
          question_id: 'q-1',
          prompt: 'What is 2+2?',
          correct_label: '4',
          explainer: 'Basic addition.',
          your_choice: '5',
          your_correct: false,
        },
        { question_id: 'q-2', prompt: 'What is 3+3?', correct_label: '6' },
      ],
    });
    expect(out.reveals).toEqual([
      {
        questionId: 'q-1',
        prompt: 'What is 2+2?',
        correctLabel: '4',
        explainer: 'Basic addition.',
        yourChoice: '5',
        yourCorrect: false,
      },
      {
        questionId: 'q-2',
        prompt: 'What is 3+3?',
        correctLabel: '6',
        explainer: '',
        yourChoice: null,
        yourCorrect: false,
      },
    ]);
  });

  it('maps join_code + participants + participant_count', () => {
    const out = toSnapshot({
      ...baseWire,
      join_code: 'K7M3QX',
      participant_count: 2,
      participants: [
        { nickname: 'AtomAce', joined_at: '2026-06-10T03:00:10Z' },
        { nickname: 'QuarkQueen', joined_at: '2026-06-10T03:00:20Z' },
      ],
    });
    expect(out.joinCode).toBe('K7M3QX');
    expect(out.participantCount).toBe(2);
    expect(out.participants).toEqual([
      { nickname: 'AtomAce', joinedAt: '2026-06-10T03:00:10Z' },
      { nickname: 'QuarkQueen', joinedAt: '2026-06-10T03:00:20Z' },
    ]);
  });

  it('maps the learner-safe open_question block', () => {
    const out = toSnapshot({
      ...baseWire,
      open_question: {
        question_id: 'q-1',
        prompt: 'What is 2 + 2?',
        options: [{ label: '3' }, { label: '4' }],
        opened_at: '2026-06-10T03:01:00Z',
        timer_seconds: 60,
        double_points: true,
        locks_at: '2026-06-10T03:02:02Z',
        locked: false,
      },
    });
    expect(out.openQuestion).toEqual({
      questionId: 'q-1',
      prompt: 'What is 2 + 2?',
      options: [{ label: '3' }, { label: '4' }],
      openedAt: '2026-06-10T03:01:00Z',
      timerSeconds: 60,
      doublePoints: true,
      locksAt: '2026-06-10T03:02:02Z',
      locked: false,
    });
  });

  it('defaults open_question optionals (double_points, locks_at, options)', () => {
    const out = toSnapshot({
      ...baseWire,
      open_question: {
        question_id: 'q-1',
        prompt: 'Untimed?',
        opened_at: '2026-06-10T03:01:00Z',
        timer_seconds: 0,
        locked: false,
      },
    });
    expect(out.openQuestion?.doublePoints).toBe(false);
    expect(out.openQuestion?.locksAt).toBeNull();
    expect(out.openQuestion?.options).toEqual([]);
  });

  it('maps scoreboard / podium / final_scoreboard rows with streak default', () => {
    const rows = [
      { nickname: 'AtomAce', score: 120, streak: 2, rank: 1 },
      { nickname: 'QuarkQueen', score: 90, rank: 2 },
    ];
    const out = toSnapshot({
      ...baseWire,
      scoreboard: rows,
      podium: rows,
      final_scoreboard: rows,
    });
    for (const board of [out.scoreboard, out.podium, out.finalScoreboard]) {
      expect(board).toEqual([
        { nickname: 'AtomAce', score: 120, streak: 2, rank: 1 },
        { nickname: 'QuarkQueen', score: 90, streak: 0, rank: 2 },
      ]);
    }
  });

  it('maps me (with nested last_result) and reveal', () => {
    const out = toSnapshot({
      ...baseWire,
      me: {
        nickname: 'AtomAce',
        score: 187,
        rank: 4,
        streak: 2,
        last_result: {
          question_id: 'q-1',
          correct: true,
          base_points: 80,
          streak_bonus: 7,
          awarded_points: 87,
          streak_after: 2,
        },
      },
      reveal: {
        question_id: 'q-1',
        correct_label: '4',
        explainer: 'Basic addition.',
      },
    });
    expect(out.me).toEqual({
      nickname: 'AtomAce',
      score: 187,
      rank: 4,
      streak: 2,
      lastResult: {
        questionId: 'q-1',
        correct: true,
        basePoints: 80,
        streakBonus: 7,
        awardedPoints: 87,
        streakAfter: 2,
      },
    });
    expect(out.reveal).toEqual({
      questionId: 'q-1',
      correctLabel: '4',
      explainer: 'Basic addition.',
    });
  });
});

describe('classroom.model — toSubmitOutcome', () => {
  it('splits the 201 body into snapshot + yourResult', () => {
    const out = toSubmitOutcome({
      ...baseWire,
      your_result: {
        question_id: 'q-1',
        correct: false,
        awarded_points: 0,
        streak_after: 0,
      },
    });
    expect(out.snapshot.id).toBe('sess');
    expect(out.yourResult).toEqual({
      questionId: 'q-1',
      correct: false,
      basePoints: 0,
      streakBonus: 0,
      awardedPoints: 0,
      streakAfter: 0,
    });
  });

  it('nil-safes a missing your_result (old BE)', () => {
    const out = toSubmitOutcome(baseWire);
    expect(out.yourResult).toBeNull();
  });
});

describe('classroom.model — toSessionByCode', () => {
  it('camelCases the by-code resolution body', () => {
    expect(
      toSessionByCode({
        session_id: 'sess-1',
        live_quiz_id: 'quiz-1',
        quiz_title: 'CSPO',
        state: 'ARMED',
        participant_count: 7,
      }),
    ).toEqual({
      sessionId: 'sess-1',
      liveQuizId: 'quiz-1',
      quizTitle: 'CSPO',
      state: 'ARMED',
      participantCount: 7,
    });
  });

  it('defaults the optional fields', () => {
    const out = toSessionByCode({
      session_id: 'sess-1',
      live_quiz_id: 'quiz-1',
      state: 'LIVE',
    });
    expect(out.quizTitle).toBe('');
    expect(out.participantCount).toBe(0);
  });
});
