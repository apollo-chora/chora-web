import { describe, it, expect } from 'vitest';
import {
  buildTallyRows,
  decodeSnapshot,
  isSnapshotFrame,
  isVotingOpen,
  livePollVotePath,
  livePollWsPath,
  type LivePollSnapshot,
} from './live-poll-play.model';

describe('live-poll-play.model — isSnapshotFrame', () => {
  it('is true only for the snapshot frame type', () => {
    expect(isSnapshotFrame({ type: 'snapshot' })).toBe(true);
    expect(isSnapshotFrame({ type: 'event' })).toBe(false);
    expect(isSnapshotFrame({ type: 'vote_recorded' })).toBe(false);
  });
});

describe('live-poll-play.model — decodeSnapshot', () => {
  it('decodes the BE livePollSnapshotPayload shape', () => {
    const snap = decodeSnapshot({
      id: 'poll-1',
      tenant_id: 't-1',
      instructor_gcid: 'g-chen',
      question: 'Which planet is largest?',
      options: [
        { label: 'Jupiter', vote_count: 7 },
        { label: 'Saturn', vote_count: 2 },
      ],
      state: 'OPEN',
      opened_at: '2026-05-29T01:00:00Z',
      total_votes: 9,
    });
    expect(snap).not.toBeNull();
    expect(snap!.id).toBe('poll-1');
    expect(snap!.question).toBe('Which planet is largest?');
    expect(snap!.state).toBe('OPEN');
    expect(snap!.openedAt).toBe('2026-05-29T01:00:00Z');
    expect(snap!.closedAt).toBeNull();
    expect(snap!.options).toHaveLength(2);
    expect(snap!.options[0]).toEqual({ label: 'Jupiter', voteCount: 7 });
    expect(snap!.totalVotes).toBe(9);
  });

  it('defaults a malformed state to DRAFT', () => {
    const snap = decodeSnapshot({ id: 'p', state: 'WAT', options: [] });
    expect(snap!.state).toBe('DRAFT');
  });

  it('returns null for a non-object payload', () => {
    expect(decodeSnapshot(null)).toBeNull();
    expect(decodeSnapshot('nope')).toBeNull();
    expect(decodeSnapshot([1, 2])).toBeNull();
  });

  it('tolerates missing options + drops labelless options', () => {
    const snap = decodeSnapshot({
      id: 'p',
      state: 'OPEN',
      options: [{ vote_count: 3 }, { label: 'Ok', vote_count: 1 }],
    });
    expect(snap!.options).toEqual([{ label: 'Ok', voteCount: 1 }]);
    const noOpts = decodeSnapshot({ id: 'p', state: 'OPEN' });
    expect(noOpts!.options).toEqual([]);
  });

  it('coerces a missing vote_count to 0', () => {
    const snap = decodeSnapshot({
      id: 'p',
      state: 'OPEN',
      options: [{ label: 'A' }],
    });
    expect(snap!.options[0]!.voteCount).toBe(0);
  });
});

describe('live-poll-play.model — buildTallyRows', () => {
  const snap: LivePollSnapshot = {
    id: 'p',
    tenantId: 't',
    instructorGcid: 'g',
    question: 'Q?',
    options: [
      { label: 'Newton', voteCount: 3 },
      { label: 'Einstein', voteCount: 5 },
      { label: 'Bohr', voteCount: 2 },
    ],
    state: 'OPEN',
    openedAt: null,
    closedAt: null,
    totalVotes: 10,
  };

  it('builds one row per option in snapshot order with rounded percents', () => {
    const rows = buildTallyRows(snap);
    expect(rows.map((r) => r.label)).toEqual(['Newton', 'Einstein', 'Bohr']);
    expect(rows[0]).toEqual({ label: 'Newton', voteCount: 3, percent: 30 });
    expect(rows[1]).toEqual({ label: 'Einstein', voteCount: 5, percent: 50 });
  });

  it('returns [] for a null snapshot', () => {
    expect(buildTallyRows(null)).toEqual([]);
  });

  it('yields 0% rows (no NaN) when total votes is zero', () => {
    const zero: LivePollSnapshot = {
      ...snap,
      options: [
        { label: 'A', voteCount: 0 },
        { label: 'B', voteCount: 0 },
      ],
      totalVotes: 0,
    };
    const rows = buildTallyRows(zero);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.percent).toBe(0);
    expect(rows[1]!.percent).toBe(0);
  });
});

describe('live-poll-play.model — isVotingOpen', () => {
  function withState(state: LivePollSnapshot['state']): LivePollSnapshot {
    return {
      id: 'p',
      tenantId: 't',
      instructorGcid: 'g',
      question: 'Q?',
      options: [],
      state,
      openedAt: null,
      closedAt: null,
      totalVotes: 0,
    };
  }

  it('is true only when OPEN', () => {
    expect(isVotingOpen(withState('OPEN'))).toBe(true);
    expect(isVotingOpen(withState('DRAFT'))).toBe(false);
    expect(isVotingOpen(withState('CLOSED'))).toBe(false);
    expect(isVotingOpen(null)).toBe(false);
  });
});

describe('live-poll-play.model — path builders', () => {
  it('builds the per-poll WS path and url-encodes the id', () => {
    expect(livePollWsPath('poll-1')).toBe('/api/v1/live-polls/poll-1/ws');
    expect(livePollWsPath('a b')).toBe('/api/v1/live-polls/a%20b/ws');
  });

  it('builds the per-poll vote path and url-encodes the id', () => {
    expect(livePollVotePath('poll-1')).toBe('/api/v1/live-polls/poll-1/votes');
    expect(livePollVotePath('a/b')).toBe('/api/v1/live-polls/a%2Fb/votes');
  });
});
