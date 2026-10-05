import { describe, expect, it } from 'vitest';

import {
  wiredSinksOf,
  RITUAL_STEP_CAP_BASE,
  RITUAL_STEP_CAP_LONG_WEAVING,
  RUN_STATUS_RUNNING,
  isListRitualRunsResponse,
  isListRitualsResponse,
  isRitual,
  isRitualRun,
  isRunTerminal,
  ritualStepCap,
  type Ritual,
  type RitualRun,
} from './familiar-ritual.model';

const validRitual: Ritual = {
  ritualId: 'r1',
  familiarId: 'f1',
  name: 'Warm-up',
  trigger: 'manual',
  sink: 'chat',
  enabled: false,
  publishedPriceUnits: 20,
  currentRevision: 0,
  steps: [{ skillKey: 'weakness_sight' }],
  createdAt: '2026-07-09T00:00:00Z',
  updatedAt: '2026-07-09T00:00:00Z',
};

const validRun: RitualRun = {
  runId: 'run1',
  ritualId: 'r1',
  revisionNo: 1,
  status: 'completed',
  manaCharged: 20,
  startedAt: '2026-07-09T01:00:00Z',
};

describe('familiar-ritual model guards', () => {
  it('isRitual accepts a well-formed ritual', () => {
    expect(isRitual(validRitual)).toBe(true);
  });

  it('isRitual rejects non-objects and missing/typed-wrong fields', () => {
    expect(isRitual(null)).toBe(false);
    expect(isRitual('nope')).toBe(false);
    expect(isRitual({ ...validRitual, enabled: 'yes' })).toBe(false);
    expect(isRitual({ ...validRitual, steps: [{ notAKey: 1 }] })).toBe(false);
    const { ritualId: _drop, ...noId } = validRitual;
    expect(isRitual(noId)).toBe(false);
  });

  it('isRitualRun accepts a well-formed run and rejects malformed', () => {
    expect(isRitualRun(validRun)).toBe(true);
    expect(isRitualRun({ ...validRun, manaCharged: '20' })).toBe(false);
    expect(isRitualRun(undefined)).toBe(false);
  });

  it('isListRitualsResponse validates the {rituals:[]} envelope', () => {
    expect(isListRitualsResponse({ rituals: [validRitual] })).toBe(true);
    expect(isListRitualsResponse({ rituals: [{ bad: true }] })).toBe(false);
    expect(isListRitualsResponse({ notRituals: [] })).toBe(false);
  });

  it('isListRitualRunsResponse validates the {runs:[]} envelope', () => {
    expect(isListRitualRunsResponse({ runs: [validRun] })).toBe(true);
    expect(isListRitualRunsResponse({ runs: 'nope' })).toBe(false);
  });

  it('ritualStepCap reflects the long_weaving craft', () => {
    expect(ritualStepCap(false)).toBe(RITUAL_STEP_CAP_BASE);
    expect(ritualStepCap(true)).toBe(RITUAL_STEP_CAP_LONG_WEAVING);
  });

  // CHO-2145: the run POST acks 202 'running' and the steps finish server-side,
  // so the FE branches on the run status — poll while running, render when
  // terminal. `running` is the ONLY non-terminal state.
  it('isRunTerminal treats every state except running as terminal', () => {
    expect(isRunTerminal(RUN_STATUS_RUNNING)).toBe(false);
    expect(isRunTerminal('completed')).toBe(true);
    expect(isRunTerminal('failed')).toBe(true);
    expect(isRunTerminal('blocked')).toBe(true);
    expect(isRunTerminal('skipped_budget')).toBe(true);
  });

  // Defensive: an unknown status must STOP the poll, never spin forever on a
  // state this client does not understand.
  it('isRunTerminal treats an unknown status as terminal (never poll forever)', () => {
    expect(isRunTerminal('some_future_state')).toBe(true);
    expect(isRunTerminal('')).toBe(true);
  });
});

describe('wired ritual sinks are served, not guessed (B3b)', () => {
  it('reads the wired set off the list response', () => {
    expect(wiredSinksOf({ rituals: [], wiredSinks: ['chat'] }).sinks).toEqual(['chat']);
    expect(wiredSinksOf({ rituals: [], wiredSinks: ['chat', 'memory_note'] }).sinks).toEqual([
      'chat',
      'memory_note',
    ]);
  });

  it('greys everything when the server serves no wired set', () => {
    // Fail closed: a server that does not answer is a server we cannot make
    // claims for, and publish would refuse all six anyway.
    expect(wiredSinksOf({ rituals: [] }).sinks).toEqual([]);
    expect(wiredSinksOf({ rituals: [], wiredSinks: null }).sinks).toEqual([]);
    expect(wiredSinksOf(undefined).sinks).toEqual([]);
  });

  it('distinguishes an ABSENT field from a SERVED empty one', () => {
    // Both grey every sink, but they are different facts and the learner is
    // owed different words. This is ADR-252 D6's actual principle: distinguish
    // by the message, never by an empty result. Collapsing them was the defect
    // the orchestrator caught in the first cut of B3b.
    expect(wiredSinksOf({ rituals: [] }).reported).toBe(false);
    expect(wiredSinksOf({ rituals: [], wiredSinks: null }).reported).toBe(false);
    expect(wiredSinksOf('not an object').reported).toBe(false);

    expect(wiredSinksOf({ rituals: [], wiredSinks: [] }).reported).toBe(true);
    expect(wiredSinksOf({ rituals: [], wiredSinks: ['chat'] }).reported).toBe(true);
  });

  it('a served list that filters down to nothing still counts as REPORTED', () => {
    // The server answered; every value it named was simply outside the closed
    // list. That is "nothing is wired here", not "the server did not answer".
    const r = wiredSinksOf({ rituals: [], wiredSinks: ['webhook'] });
    expect(r.sinks).toEqual([]);
    expect(r.reported).toBe(true);
  });

  it('drops anything the server sends that is not a closed-list sink', () => {
    // The server is the authority on WIRED, not on what a sink IS: the closed
    // list is ADR-218 D9 and a value outside it cannot be rendered.
    expect(wiredSinksOf({ rituals: [], wiredSinks: ['chat', 'webhook'] }).sinks).toEqual(['chat']);
  });

  it('still validates the list envelope', () => {
    expect(isListRitualsResponse({ rituals: [], wiredSinks: ['chat'] })).toBe(true);
    // wiredSinks is additive: a response without it stays valid, so an older
    // server does not read as malformed.
    expect(isListRitualsResponse({ rituals: [] })).toBe(true);
  });
});
