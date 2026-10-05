import { describe, it, expect } from 'vitest';
import {
  buildTallyRows,
  decodeBoardRows,
  decodeLeaderboard,
  decodeSnapshot,
  isSnapshotFrame,
  liveQuizWsPath,
  shouldRevealExplainers,
  topNLeaderboard,
  type LivePlayLeaderboardEntry,
  type LivePlaySnapshot,
} from './live-classroom-play.model';

describe('live-classroom-play.model — isSnapshotFrame', () => {
  it('is true only for the snapshot frame type', () => {
    expect(isSnapshotFrame({ type: 'snapshot' })).toBe(true);
    expect(isSnapshotFrame({ type: 'event' })).toBe(false);
    expect(isSnapshotFrame({ type: 'heartbeat' })).toBe(false);
  });
});

describe('live-classroom-play.model — decodeSnapshot', () => {
  it('decodes the BE liveQuizSnapshotPayload shape', () => {
    const snap = decodeSnapshot({
      id: 'sess-1',
      live_quiz_id: 'lq-1',
      tenant_id: 't-1',
      instructor_gcid: 'g-chen',
      state: 'LIVE',
      started_at: '2026-05-29T01:00:00Z',
      response_counts: { q1: { A: 2, B: 5, C: 1 } },
      total_responses: 8,
    });
    expect(snap).not.toBeNull();
    expect(snap!.id).toBe('sess-1');
    expect(snap!.state).toBe('LIVE');
    expect(snap!.startedAt).toBe('2026-05-29T01:00:00Z');
    expect(snap!.endedAt).toBeNull();
    expect(snap!.responseCounts['q1']!['B']).toBe(5);
    expect(snap!.totalResponses).toBe(8);
  });

  it('defaults a malformed state to ARMED', () => {
    const snap = decodeSnapshot({ id: 's', state: 'WAT', response_counts: {} });
    expect(snap!.state).toBe('ARMED');
  });

  it('returns null for a non-object payload', () => {
    expect(decodeSnapshot(null)).toBeNull();
    expect(decodeSnapshot('nope')).toBeNull();
    expect(decodeSnapshot([1, 2])).toBeNull();
  });

  it('tolerates a missing response_counts map', () => {
    const snap = decodeSnapshot({ id: 's', state: 'ARMED' });
    expect(snap!.responseCounts).toEqual({});
  });
});

describe('live-classroom-play.model — decodeLeaderboard', () => {
  it('decodes a bare leaderboard array', () => {
    const out = decodeLeaderboard([
      { gcid: 'g1', display_name: 'Ada', score: 30 },
      { gcid: 'g2', score: 20 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ gcid: 'g1', displayName: 'Ada', score: 30 });
    // display_name absent → falls back to gcid.
    expect(out[1]!.displayName).toBe('g2');
  });

  it('decodes a { leaderboard: [...] } wrapper object', () => {
    const out = decodeLeaderboard({
      leaderboard: [{ gcid: 'g3', display_name: 'Lin', score: 50 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.score).toBe(50);
  });

  it('returns [] when no leaderboard data is present', () => {
    expect(decodeLeaderboard({ response_counts: {} })).toEqual([]);
    expect(decodeLeaderboard(null)).toEqual([]);
  });

  it('drops entries without a gcid', () => {
    const out = decodeLeaderboard([{ display_name: 'ghost', score: 99 }]);
    expect(out).toEqual([]);
  });
});

describe('live-classroom-play.model — buildTallyRows', () => {
  const snap: LivePlaySnapshot = {
    id: 's',
    liveQuizId: 'lq',
    tenantId: 't',
    instructorGcid: 'g',
    state: 'LIVE',
    startedAt: null,
    endedAt: null,
    responseCounts: { q1: { B: 5, A: 3, C: 2 } },
    totalResponses: 10,
    scoreboard: [],
    podium: [],
  };

  it('sorts rows marker-asc with rounded percents', () => {
    const rows = buildTallyRows(snap, 'q1');
    expect(rows.map((r) => r.marker)).toEqual(['A', 'B', 'C']);
    expect(rows[0]).toEqual({ marker: 'A', count: 3, percent: 30 });
    expect(rows[1]).toEqual({ marker: 'B', count: 5, percent: 50 });
  });

  it('returns [] for an unknown question or null snapshot', () => {
    expect(buildTallyRows(snap, 'qZ')).toEqual([]);
    expect(buildTallyRows(null, 'q1')).toEqual([]);
  });

  it('returns [] when all counts are zero', () => {
    const zero: LivePlaySnapshot = {
      ...snap,
      responseCounts: { q1: { A: 0, B: 0 } },
    };
    expect(buildTallyRows(zero, 'q1')).toEqual([]);
  });
});

describe('live-classroom-play.model — topNLeaderboard', () => {
  const entries: readonly LivePlayLeaderboardEntry[] = [
    { gcid: 'g1', displayName: 'Ada', score: 30 },
    { gcid: 'g2', displayName: 'Bo', score: 50 },
    { gcid: 'g3', displayName: 'Cy', score: 50 },
    { gcid: 'g4', displayName: 'Di', score: 10 },
  ];

  it('sorts score-desc then displayName-asc for ties', () => {
    const top = topNLeaderboard(entries, 10);
    expect(top.map((e) => e.gcid)).toEqual(['g2', 'g3', 'g1', 'g4']);
  });

  it('caps to the requested N', () => {
    expect(topNLeaderboard(entries, 2)).toHaveLength(2);
  });
});

describe('live-classroom-play.model — shouldRevealExplainers', () => {
  it('NEVER never reveals', () => {
    expect(shouldRevealExplainers('NEVER', 'LIVE')).toBe(false);
    expect(shouldRevealExplainers('NEVER', 'CLOSED')).toBe(false);
  });

  it('END_OF_SESSION reveals only when CLOSED', () => {
    expect(shouldRevealExplainers('END_OF_SESSION', 'LIVE')).toBe(false);
    expect(shouldRevealExplainers('END_OF_SESSION', 'CLOSED')).toBe(true);
  });

  it('IMMEDIATE + END_OF_QUESTION reveal while LIVE or CLOSED', () => {
    expect(shouldRevealExplainers('IMMEDIATE', 'LIVE')).toBe(true);
    expect(shouldRevealExplainers('END_OF_QUESTION', 'LIVE')).toBe(true);
    expect(shouldRevealExplainers('IMMEDIATE', 'ARMED')).toBe(false);
  });
});

describe('live-classroom-play.model — liveQuizWsPath', () => {
  it('builds the per-session WS path and url-encodes the id', () => {
    expect(liveQuizWsPath('sess-1')).toBe('/api/v1/live-quizzes/sess-1/ws');
    expect(liveQuizWsPath('a b')).toBe('/api/v1/live-quizzes/a%20b/ws');
  });
});

// ── L5.2 nickname-keyed scoreboard + podium (CHO-1704 WS3) ───────────────────

describe('live-classroom-play.model — decodeBoardRows', () => {
  it('decodes well-formed scoreboard rows', () => {
    expect(
      decodeBoardRows([
        { nickname: 'AtomAce', score: 120, streak: 2, rank: 1 },
        { nickname: 'QuarkQueen', score: 90, rank: 2 },
      ]),
    ).toEqual([
      { nickname: 'AtomAce', score: 120, streak: 2, rank: 1 },
      { nickname: 'QuarkQueen', score: 90, streak: 0, rank: 2 },
    ]);
  });

  it('drops malformed entries and tolerates non-arrays', () => {
    expect(decodeBoardRows(undefined)).toEqual([]);
    expect(decodeBoardRows('nope')).toEqual([]);
    expect(
      decodeBoardRows([{ score: 5 }, null, { nickname: 'Ok', score: 1, rank: 9 }]),
    ).toEqual([{ nickname: 'Ok', score: 1, streak: 0, rank: 9 }]);
  });
});

describe('live-classroom-play.model — decodeSnapshot scoreboard/podium', () => {
  it('carries the nickname-keyed scoreboard + podium when present', () => {
    const snap = decodeSnapshot({
      id: 'sess-1',
      state: 'CLOSED',
      response_counts: {},
      scoreboard: [{ nickname: 'AtomAce', score: 120, streak: 1, rank: 1 }],
      podium: [{ nickname: 'AtomAce', score: 120, streak: 1, rank: 1 }],
    });
    expect(snap?.scoreboard).toEqual([
      { nickname: 'AtomAce', score: 120, streak: 1, rank: 1 },
    ]);
    expect(snap?.podium).toEqual([
      { nickname: 'AtomAce', score: 120, streak: 1, rank: 1 },
    ]);
  });

  it('defaults both boards to [] for legacy frames', () => {
    const snap = decodeSnapshot({ id: 's', state: 'LIVE', response_counts: {} });
    expect(snap?.scoreboard).toEqual([]);
    expect(snap?.podium).toEqual([]);
  });
});
