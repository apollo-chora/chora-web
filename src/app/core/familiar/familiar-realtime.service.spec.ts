import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import {
  FamiliarRealtimeService,
  type FamiliarStageTransition,
  type FamiliarSourceRevelationPayload,
} from './familiar-realtime.service';
import { RealtimeChannelService } from '../realtime/realtime-channel.service';
import { environment } from '../../../environments/environment';
import type { RealtimeFamiliarLeveledUp } from '../realtime/realtime-channel.model';

// Channel stub — the adapter only touches familiarLeveledUp$ + connect().
function makeChannelMock(): {
  familiarLeveledUp$: Subject<RealtimeFamiliarLeveledUp>;
  connect: ReturnType<typeof vi.fn>;
} {
  return { familiarLeveledUp$: new Subject<RealtimeFamiliarLeveledUp>(), connect: vi.fn() };
}

describe('FamiliarRealtimeService', () => {
  let svc: FamiliarRealtimeService;
  let channel: ReturnType<typeof makeChannelMock>;

  beforeEach(() => {
    channel = makeChannelMock();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        FamiliarRealtimeService,
        { provide: RealtimeChannelService, useValue: channel },
      ],
    });
    svc = TestBed.inject(FamiliarRealtimeService);
  });

  it('emits synthetic stage_up events to subscribers', () => {
    const received: { type: string; familiarId: string }[] = [];
    const sub = svc.stream$.subscribe((evt) =>
      received.push({ type: evt.type, familiarId: evt.familiarId }),
    );
    svc.emit({
      type: 'stage_up',
      familiarId: 'eira-001',
      stageFrom: 1,
      stageTo: 2,
      stageName: 'fledgling',
      unlockedTools: ['atom_search'],
      llmTierNew: 'flash-lite',
      occurredAt: new Date().toISOString(),
    });
    expect(received).toEqual([{ type: 'stage_up', familiarId: 'eira-001' }]);
    sub.unsubscribe();
  });

  it('shared subscription — multiple subscribers receive the same event', () => {
    const a: string[] = [];
    const b: string[] = [];
    const subA = svc.stream$.subscribe((e) => a.push(e.type));
    const subB = svc.stream$.subscribe((e) => b.push(e.type));
    svc.emit({
      type: 'breed_revealed',
      familiarId: 'eira-001',
      species: 'dragon',
      shinyVariant: false,
      rarity: 'common',
      rolledProbability: 25.0,
      occurredAt: new Date().toISOString(),
    });
    expect(a).toEqual(['breed_revealed']);
    expect(b).toEqual(['breed_revealed']);
    subA.unsubscribe();
    subB.unsubscribe();
  });

  it('disconnect is safe with no active bridge', () => {
    expect(() => svc.disconnect()).not.toThrow();
  });

  // ── Augmented coverage (globals API) ───────────────────────────────

  it('fans a stage_up emit into stageTransition$ with mapped stage fields', () => {
    const transitions: FamiliarStageTransition[] = [];
    const sub = svc.stageTransition$.subscribe((t) => transitions.push(t));
    svc.emit({
      type: 'stage_up',
      familiarId: 'eira-002',
      stageFrom: 2,
      stageTo: 3,
      stageName: 'awakened',
      unlockedTools: ['atom_search', 'web_research'],
      llmTierNew: 'flash',
      occurredAt: new Date().toISOString(),
    });
    expect(transitions).toEqual([
      { familiarId: 'eira-002', fromStage: 2, toStage: 3 },
    ]);
    sub.unsubscribe();
  });

  it('fans a source_revelation emit into sourceRevelation$ (breed empty, source = windowExpiresAt)', () => {
    const reveals: FamiliarSourceRevelationPayload[] = [];
    const sub = svc.sourceRevelation$.subscribe((r) => reveals.push(r));
    const expiry = '2026-06-30T12:00:00.000Z';
    svc.emit({
      type: 'source_revelation',
      familiarId: 'eira-003',
      windowExpiresAt: expiry,
      previewLlmTier: 'pro',
      occurredAt: new Date().toISOString(),
    });
    // Characterizes the intentional mapping: breed is NOT carried on the
    // SSE envelope (resolved later by the overlay), and `source` carries
    // the window-expiry timestamp.
    expect(reveals).toEqual([
      { familiarId: 'eira-003', breed: '', source: expiry },
    ]);
    sub.unsubscribe();
  });

  it('does NOT fan exp_awarded or breed_revealed into the typed overlay subjects', () => {
    const transitions: FamiliarStageTransition[] = [];
    const reveals: FamiliarSourceRevelationPayload[] = [];
    const subT = svc.stageTransition$.subscribe((t) => transitions.push(t));
    const subR = svc.sourceRevelation$.subscribe((r) => reveals.push(r));
    svc.emit({
      type: 'exp_awarded',
      familiarId: 'eira-004',
      expDelta: 25,
      expCumulativeAfter: 75,
      source: 'atom_completed',
      occurredAt: new Date().toISOString(),
    });
    svc.emit({
      type: 'breed_revealed',
      familiarId: 'eira-004',
      species: 'owl',
      shinyVariant: true,
      rarity: 'rare',
      rolledProbability: 5.0,
      occurredAt: new Date().toISOString(),
    });
    expect(transitions).toEqual([]);
    expect(reveals).toEqual([]);
    subT.unsubscribe();
    subR.unsubscribe();
  });

  it('emitStageTransition pushes directly onto stageTransition$ (dev seam)', () => {
    const transitions: FamiliarStageTransition[] = [];
    const sub = svc.stageTransition$.subscribe((t) => transitions.push(t));
    svc.emitStageTransition({
      familiarId: 'eira-005',
      fromStage: 4,
      toStage: 5,
    });
    expect(transitions).toEqual([
      { familiarId: 'eira-005', fromStage: 4, toStage: 5 },
    ]);
    sub.unsubscribe();
  });

  it('emitSourceRevelation pushes directly onto sourceRevelation$ (post-hatch seam)', () => {
    const reveals: FamiliarSourceRevelationPayload[] = [];
    const sub = svc.sourceRevelation$.subscribe((r) => reveals.push(r));
    svc.emitSourceRevelation({
      familiarId: 'eira-006',
      breed: 'phoenix',
      source: 'hatch_commit',
    });
    expect(reveals).toEqual([
      { familiarId: 'eira-006', breed: 'phoenix', source: 'hatch_commit' },
    ]);
    sub.unsubscribe();
  });

  it('events emitted with no stream$ subscribers are dropped (Subject semantics)', () => {
    // No subscriber yet — Subject does not replay.
    svc.emit({
      type: 'exp_awarded',
      familiarId: 'eira-007',
      expDelta: 10,
      expCumulativeAfter: 10,
      source: 'duel_win',
      occurredAt: new Date().toISOString(),
    });
    const received: string[] = [];
    const sub = svc.stream$.subscribe((e) => received.push(e.type));
    expect(received).toEqual([]);
    sub.unsubscribe();
  });

  it('emit reaches a stream$ subscriber that joins after the SSE connection is opened', () => {
    // First subscriber opens the (no-op in jsdom) SSE connection.
    const first: string[] = [];
    const subFirst = svc.stream$.subscribe((e) => first.push(e.type));
    // Second subscriber joins the shared stream.
    const second: string[] = [];
    const subSecond = svc.stream$.subscribe((e) => second.push(e.type));
    svc.emit({
      type: 'exp_awarded',
      familiarId: 'eira-008',
      expDelta: 5,
      expCumulativeAfter: 80,
      source: 'streak',
      occurredAt: new Date().toISOString(),
    });
    expect(first).toEqual(['exp_awarded']);
    expect(second).toEqual(['exp_awarded']);
    subFirst.unsubscribe();
    subSecond.unsubscribe();
  });

  it('disconnect is idempotent and safe to call when never connected', () => {
    expect(() => {
      svc.disconnect();
      svc.disconnect();
    }).not.toThrow();
  });
});

// ── Channel bridging (ADR-183 adapter) ──────────────────────────────────
//
// The adapter no longer opens its own EventSource — it bridges the SHARED
// learner channel. These specs pin the bridge semantics: leveled_up frames
// map onto stageTransition$, the channel opens only when the realtime flag
// is on, and disconnect() unbridges without closing the shared channel.
describe('FamiliarRealtimeService — channel bridging', () => {
  let svc: FamiliarRealtimeService;
  let channel: ReturnType<typeof makeChannelMock>;

  beforeEach(() => {
    channel = makeChannelMock();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        FamiliarRealtimeService,
        { provide: RealtimeChannelService, useValue: channel },
      ],
    });
    svc = TestBed.inject(FamiliarRealtimeService);
    environment.realtimeEnabled = false;
  });

  afterEach(() => {
    environment.realtimeEnabled = false;
  });

  it('maps a channel leveled_up frame onto stageTransition$ (snake→camel, from_stage??0)', () => {
    const transitions: FamiliarStageTransition[] = [];
    const subStream = svc.stream$.subscribe(); // arms the bridge
    const subT = svc.stageTransition$.subscribe((t) => transitions.push(t));

    channel.familiarLeveledUp$.next({ familiar_id: 'ch-001', from_stage: 2, to_stage: 3 });
    channel.familiarLeveledUp$.next({ familiar_id: 'ch-002', to_stage: 1 }); // from_stage absent

    expect(transitions).toEqual([
      { familiarId: 'ch-001', fromStage: 2, toStage: 3 },
      { familiarId: 'ch-002', fromStage: 0, toStage: 1 },
    ]);
    subStream.unsubscribe();
    subT.unsubscribe();
  });

  it('bridges the channel ONCE for any number of stream$ subscribers', () => {
    const transitions: FamiliarStageTransition[] = [];
    const subA = svc.stream$.subscribe();
    const subB = svc.stream$.subscribe();
    const subT = svc.stageTransition$.subscribe((t) => transitions.push(t));

    channel.familiarLeveledUp$.next({ familiar_id: 'once', to_stage: 2 });
    expect(transitions).toHaveLength(1); // not duplicated per subscriber

    subA.unsubscribe();
    subB.unsubscribe();
    subT.unsubscribe();
  });

  it('does NOT open the shared channel when the realtime flag is off', () => {
    const sub = svc.stream$.subscribe();
    expect(channel.connect).not.toHaveBeenCalled();
    sub.unsubscribe();
  });

  it('opens the shared channel when the realtime flag is on', () => {
    environment.realtimeEnabled = true;
    const sub = svc.stream$.subscribe();
    expect(channel.connect).toHaveBeenCalledTimes(1);
    sub.unsubscribe();
  });

  it('disconnect() unbridges; a re-subscribe re-bridges without double emission', () => {
    const transitions: FamiliarStageTransition[] = [];
    const subT = svc.stageTransition$.subscribe((t) => transitions.push(t));

    const subA = svc.stream$.subscribe();
    channel.familiarLeveledUp$.next({ familiar_id: 'x', to_stage: 2 });
    expect(transitions).toHaveLength(1);

    subA.unsubscribe();
    svc.disconnect();
    // Unbridged → channel frames no longer fan out.
    channel.familiarLeveledUp$.next({ familiar_id: 'x', to_stage: 3 });
    expect(transitions).toHaveLength(1);

    // Re-subscribe re-bridges exactly once.
    const subB = svc.stream$.subscribe();
    channel.familiarLeveledUp$.next({ familiar_id: 'x', to_stage: 4 });
    expect(transitions).toHaveLength(2);
    subB.unsubscribe();
    subT.unsubscribe();
  });
});
