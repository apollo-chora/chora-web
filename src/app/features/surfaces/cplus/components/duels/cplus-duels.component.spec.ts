// describe/it/beforeEach/afterEach come from the GLOBAL Vitest API
// (globals:true) so AnalogJS setup-zone wraps each test body in a
// ProxyZone — required by Angular fakeAsync()/tick(). An explicit
// 'vitest' import would use unpatched bindings -> "Expected to be
// running in 'ProxyZone'".
import { expect, vi } from 'vitest';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { CplusDuelsComponent } from './cplus-duels.component';
import { CplusDuelsService } from '../../services/cplus-duels.service';
import { AuthService } from '../../../../../core/auth/auth.service';

const CHALLENGER_GCID = 'gcid-challenger-aaaa';
const OPPONENT_GCID = 'gcid-opponent-bbbb';

/**
 * In-process WebSocket stub. The component constructs `new WebSocket(url)`
 * via the browser API; we patch the global WebSocket constructor so the
 * component gets a fake whose callbacks we can drive from the test.
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  static lastUrl = '';
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 0;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this as unknown as FakeWebSocket);
    FakeWebSocket.lastUrl = url;
    // Defer onopen so the component can attach handlers first.
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
  }
}

/** Build a WS message frame matching the backend Message envelope. */
function wsFrame(kind: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ duel_id: 'duel-1', kind, payload });
}

describe('CplusDuelsComponent', () => {
  let fixture: ComponentFixture<CplusDuelsComponent>;
  let component: CplusDuelsComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let originalWebSocket: typeof WebSocket;

  beforeEach(async () => {
    FakeWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
      FakeWebSocket as unknown as typeof WebSocket;

    await TestBed.configureTestingModule({
      imports: [CplusDuelsComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusDuelsComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
    httpMock.verify();
  });

  /** Set the auth gcid + flush the two ngOnInit requests (my-rating, leaderboard). */
  function initAs(gcid: string): void {
    (auth as unknown as { gcid: () => string }).gcid = () => gcid;
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.endsWith('/v1/duels/my-rating')).flush({
      gcid,
      rating: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      peak_elo: 1200,
      completed_courses: 0,
      course_bonus: 0,
      proficiency: 1200,
    });
    httpMock.expectOne((r) => r.url.endsWith('/v1/duels/leaderboard')).flush({
      entries: [],
      computed_at: '2026-07-26T08:00:00Z',
    });
  }

  /** Drive findMatch → flush queue enter → step becomes 'searching'. */
  async function enterSearching(): Promise<void> {
    const p = component.findMatch();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
    req.flush({ status: 'finding', expires_at: '2026-07-26T08:10:00Z' });
    await p;
    fixture.detectChanges();
  }

  /** Simulate a matched heartbeat → step becomes 'arena', WS connects. */
  async function enterArena(duelId = 'duel-1'): Promise<void> {
    // The component's heartbeat() is private (driven by the 10s poll
    // interval in production). Drive the injected service directly,
    // then invoke the component's private enterArena via a typed cast —
    // this mirrors what the polling loop does on a matched status.
    const duelsService = TestBed.inject(CplusDuelsService);
    const p = duelsService.heartbeat();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue/heartbeat'));
    req.flush({ status: 'matched', duel_id: duelId });
    await p;
    // Invoke the private enterArena path the same way the heartbeat
    // callback does (the component reads queueState() for the duel_id).
    (component as unknown as { enterArena: (id: string) => void }).enterArena(duelId);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('creates', () => {
    initAs(CHALLENGER_GCID);
    expect(component).toBeTruthy();
  });

  it('starts in the lobby step', () => {
    initAs(CHALLENGER_GCID);
    expect(component.step()).toBe('lobby');
  });

  it('transitions lobby → searching on findMatch', async () => {
    initAs(CHALLENGER_GCID);
    await enterSearching();
    expect(component.step()).toBe('searching');
  });

  it('transitions searching → arena on matched heartbeat', async () => {
    initAs(CHALLENGER_GCID);
    await enterSearching();
    await enterArena('duel-99');
    expect(component.step()).toBe('arena');
    expect(component.duelId()).toBe('duel-99');
  });

  describe('WS score mapping (Bug 4 — opponent sees challenger score as "me")', () => {
    it('maps score_challenger → scoreMe when the viewer IS the challenger', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');

      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({ data: wsFrame('snapshot', {
        score_challenger: 30,
        score_opponent: 10,
        total_rounds: 5,
        challenger_gcid: CHALLENGER_GCID,
        opponent_gcid: OPPONENT_GCID,
      }) });
      fixture.detectChanges();

      expect(component.scoreMe()).toBe(30);
      expect(component.scoreOpponent()).toBe(10);
    });

    it('maps score_opponent → scoreMe when the viewer IS the opponent', async () => {
      initAs(OPPONENT_GCID);
      await enterSearching();
      await enterArena('duel-1');

      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({ data: wsFrame('snapshot', {
        score_challenger: 30,
        score_opponent: 10,
        total_rounds: 5,
        challenger_gcid: CHALLENGER_GCID,
        opponent_gcid: OPPONENT_GCID,
      }) });
      fixture.detectChanges();

      // Bug 4: before the fix, the opponent's client unconditionally set
      // scoreMe = score_challenger (30), showing the challenger's score
      // as their own. The fix must swap based on which GCID the viewer is.
      expect(component.scoreMe()).toBe(10);
      expect(component.scoreOpponent()).toBe(30);
    });

    it('maps round_resolved scores by viewer role too', async () => {
      initAs(OPPONENT_GCID);
      await enterSearching();
      await enterArena('duel-1');

      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({ data: wsFrame('round_resolved', {
        round_no: 1,
        gcid: CHALLENGER_GCID,
        correct: true,
        combo_multiplier: 2,
        points_awarded: 20,
        current_combo: 1,
        speed_bonus: 5,
        duel_status: 'in_progress',
        score_challenger: 25,
        score_opponent: 0,
      }) });
      fixture.detectChanges();

      expect(component.scoreMe()).toBe(0);
      expect(component.scoreOpponent()).toBe(25);
    });

    it('maps duel_completed scores by viewer role too', async () => {
      initAs(OPPONENT_GCID);
      await enterSearching();
      await enterArena('duel-1');

      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({ data: wsFrame('duel_completed', {
        winner_gcid: CHALLENGER_GCID,
        score_challenger: 50,
        score_opponent: 20,
      }) });
      fixture.detectChanges();

      expect(component.scoreMe()).toBe(20);
      expect(component.scoreOpponent()).toBe(50);
      expect(component.duelOutcome()).toBe('loss');
    });
  });

  describe('round countdown clock-skew correction', () => {
    it('syncs the offset from server_now on the round_start frame itself', async () => {
      initAs(CHALLENGER_GCID);
      // Deliberately NO `now` on the queue response — skew correction
      // must not depend on queue responses carrying a server clock.
      await enterSearching();
      await enterArena('duel-1');

      // Server clock 405s AHEAD of the client: deadline_at = serverNow+15s
      // lands 420s in the client's future. The frame's server_now lets the
      // FE compute the true offset and show the real remaining (0:15),
      // not the raw 7:00.
      const serverNow = Date.now() + 405_000;
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({ data: wsFrame('round_start', {
        round_no: 1,
        atom_id: 'atom-1',
        question: 'What is 2+2?',
        options: ['3', '4', '5'],
        timer_sec: 15,
        deadline_at: new Date(serverNow + 15_000).toISOString(),
        server_now: new Date(serverNow).toISOString(),
      }) });
      fixture.detectChanges();

      expect(component.roundCountdown()).toBe('0:15');
    });

    it('derives the server offset from the queue response now field', async () => {
      initAs(CHALLENGER_GCID);
      // Server 405s ahead: expires_at + now are both server-clock stamps.
      const serverNow = Date.now() + 405_000;
      const p = component.findMatch();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      req.flush({
        status: 'finding',
        expires_at: new Date(serverNow + 60_000).toISOString(),
        now: new Date(serverNow).toISOString(),
      });
      await p;
      fixture.detectChanges();

      // Search countdown must show ~1:00 (the real TTL), not ~7:45.
      expect(component.searchCountdown()).toBe('1:00');
    });
  });

  describe('round_timeout result badge', () => {
    it('shows a time-up result (not "incorrect") when the server timer fires', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');

      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({ data: wsFrame('round_start', {
        round_no: 1,
        atom_id: 'atom-1',
        question: 'What is 2+2?',
        options: ['3', '4', '5'],
        timer_sec: 15,
        deadline_at: new Date(Date.now() + 15_000).toISOString(),
      }) });
      ws.onmessage?.({ data: wsFrame('round_timeout', {
        round_no: 1,
        score_challenger: 0,
        score_opponent: 0,
      }) });
      fixture.detectChanges();

      expect(component.lastResult()).toEqual({ correct: false, points: 0, timeout: true });
      const badge = element.querySelector('.cplus-duels-arena__result');
      // Dev-mode translate pipe renders the raw key for unloaded locales.
      expect(badge?.textContent).toContain('cplus.duels.timeout');
      expect(badge?.textContent).not.toContain('cplus.duels.incorrect');
    });

    it('advances to the next question when the server pushes the next round_start after a timeout', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');

      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({ data: wsFrame('round_start', {
        round_no: 1,
        atom_id: 'atom-1',
        question: 'What is 2+2?',
        options: ['3', '4', '5'],
        timer_sec: 15,
        deadline_at: new Date(Date.now() + 15_000).toISOString(),
      }) });
      ws.onmessage?.({ data: wsFrame('round_timeout', {
        round_no: 1,
        score_challenger: 0,
        score_opponent: 0,
      }) });
      fixture.detectChanges();
      expect(component.question()).toBe('What is 2+2?');

      // The sweeper pushes the next round_start right after round_timeout.
      ws.onmessage?.({ data: wsFrame('round_start', {
        round_no: 2,
        atom_id: 'atom-2',
        question: 'What is 3+3?',
        options: ['5', '6', '7'],
        timer_sec: 15,
        deadline_at: new Date(Date.now() + 15_000).toISOString(),
      }) });
      fixture.detectChanges();

      expect(component.currentRound()).toBe(2);
      expect(component.question()).toBe('What is 3+3?');
      expect(component.lastResult()).toBeNull();
    });
  });

  describe('selectAnswer (Bug 2 — answer_time_ms never sent)', () => {
    it('sends answer_time_ms so the speed bonus is live', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      // The FakeWebSocket defers onopen via setTimeout(0); flush it so
      // the component's wsConnected signal is set + readyState is OPEN
      // before we call selectAnswer.
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();

      // Drive a round_start so currentRound is set.
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({ data: wsFrame('round_start', {
        round_no: 1,
        atom_id: 'atom-1',
        question: 'What is 2+2?',
        options: ['3', '4', '5'],
        timer_sec: 30,
      }) });
      fixture.detectChanges();

      // The component computes Math.max(0, Date.now() - roundStartedAtMs), so
      // 0 is a value production DELIBERATELY allows. round_start and
      // selectAnswer run in the same tick here, so on a fast machine both
      // Date.now() calls land in the same millisecond and the elapsed time is
      // legitimately 0. Asserting "> 0" therefore asserted something the code
      // permits, and failed 4 runs out of 6 in isolation.
      //
      // Pinning the clock across the two reads makes the elapsed time exact,
      // which is STRONGER than "> 0": it proves the value is genuinely
      // measured from the round start and carried onto the wire, rather than
      // merely being some non-zero number.
      const nowSpy = vi.spyOn(Date, 'now');
      const roundStartMs = Date.UTC(2026, 0, 15, 9, 0, 0);
      nowSpy.mockReturnValue(roundStartMs);
      ws.onmessage?.({ data: wsFrame('round_start', {
        round_no: 2,
        atom_id: 'atom-2',
        question: 'What is 2+2?',
        options: ['3', '4', '5'],
        timer_sec: 30,
      }) });
      fixture.detectChanges();

      const sentBefore = ws.sent.length;
      nowSpy.mockReturnValue(roundStartMs + 250);
      component.selectAnswer('4');
      fixture.detectChanges();
      nowSpy.mockRestore();

      expect(ws.sent.length).toBe(sentBefore + 1);
      const frame = JSON.parse(ws.sent[ws.sent.length - 1]);
      expect(frame.answer).toBe('4');
      expect(frame.round_no).toBe(2);
      // Bug 2: before the fix, answer_time_ms was absent, so the speed bonus
      // was dead. It must be present AND equal the real elapsed time.
      expect(frame.answer_time_ms).toBeTypeOf('number');
      expect(frame.answer_time_ms).toBe(250);
    });
  });

  describe('matchmaking error paths', () => {
    it('surfaces queue failures into searchError', async () => {
      initAs(CHALLENGER_GCID);
      const p = component.findMatch();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      req.flush({}, { status: 500, statusText: 'Server Error' });
      await p;
      fixture.detectChanges();
      expect(component.step()).toBe('lobby');
      expect(component.searchError()).toBe('cplus.duels.error_upstream');
    });

    it('ignores a non-finding response and stays in the lobby', async () => {
      initAs(CHALLENGER_GCID);
      const p = component.findMatch();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      req.flush({ status: 'idle' });
      await p;
      fixture.detectChanges();
      expect(component.step()).toBe('lobby');
      expect(component.searchError()).toBeNull();
    });

    it('ignores a garbage server now when syncing the clock offset', async () => {
      initAs(CHALLENGER_GCID);
      // Freeze Date.now so the 1s countdown interval cannot tick the string
      // between the flush and the assertion (race on a busy machine).
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        const p = component.findMatch();
        const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
        req.flush({
          status: 'finding',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          now: 'garbage',
        });
        await p;
        fixture.detectChanges();
        // The garbage clock leaves the offset at 0 → the raw ~1:00 TTL is
        // shown instead of a skewed value.
        expect(component.searchCountdown()).toBe('1:00');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('mode / preset / category selection', () => {
    it('selectMode toggles blitz mode and isBlitz', () => {
      initAs(CHALLENGER_GCID);
      expect(component.isBlitz).toBe(false);
      component.selectMode('blitz');
      expect(component.selectedMode()).toBe('blitz');
      expect(component.isBlitz).toBe(true);
      component.selectMode('classic');
      expect(component.isBlitz).toBe(false);
    });

    it('selectPreset + selectBlitzVariant update the queue settings', () => {
      initAs(CHALLENGER_GCID);
      component.selectPreset('marathon');
      expect(component.selectedPreset()).toBe('marathon');
      component.selectBlitzVariant('race');
      expect(component.selectedBlitzVariant()).toBe('race');
    });

    it('selectCategory reloads the leaderboard with the category param', async () => {
      initAs(CHALLENGER_GCID);
      component.selectCategory('programming');
      const req = httpMock.expectOne(
        (r) =>
          r.url.endsWith('/v1/duels/leaderboard') && r.params.get('category') === 'programming',
      );
      req.flush({ entries: [], computed_at: '2026-07-26T08:00:00Z' });
      await fixture.whenStable();
      expect(component.selectedCategory()).toBe('programming');
    });
  });

  describe('cancelMatchmaking', () => {
    it('leaves the queue and returns to the lobby', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      const p = component.cancelMatchmaking();
      const req = httpMock.expectOne(
        (r) => r.method === 'DELETE' && r.url.endsWith('/v1/duels/queue'),
      );
      req.flush(null, { status: 204, statusText: 'No Content' });
      await p;
      fixture.detectChanges();
      expect(component.step()).toBe('lobby');
      expect(component.searchCountdown()).toBe('');
      expect(TestBed.inject(CplusDuelsService).queueState().status).toBe('idle');
    });

    it('tolerates a failing queue-cancel', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      const p = component.cancelMatchmaking();
      const req = httpMock.expectOne(
        (r) => r.method === 'DELETE' && r.url.endsWith('/v1/duels/queue'),
      );
      req.flush({}, { status: 500, statusText: 'Server Error' });
      await p;
      fixture.detectChanges();
      expect(component.step()).toBe('lobby');
    });
  });

  describe('live heartbeat interval', () => {
    /**
     * Drive the heartbeat response path the way the interval callback does.
     * The callback's own `await duelsService.heartbeat()` continuation cannot
     * be reached from inside a fakeAsync body in this runner (response
     * continuations are delivered outside the fake zone), so the tests run in
     * the async/whenStable style used elsewhere in this file and invoke the
     * exact branch methods the callback would — enterArena / handleTimeout /
     * startCountdown — after flushing the real heartbeat POST through the
     * service (the same shape as the `enterArena` helper above).
     */
    async function driveHeartbeat(
      resp: { status: string; duel_id?: string; expires_at?: string; now?: string },
      branch: 'matched' | 'expired' | 'finding',
    ): Promise<void> {
      const duelsService = TestBed.inject(CplusDuelsService);
      const p = duelsService.heartbeat();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue/heartbeat'));
      req.flush(resp);
      const c = component as unknown as {
        enterArena: (id: string) => void;
        handleTimeout: () => void;
        syncServerOffset: (now?: string) => void;
        startCountdown: (expiresAt?: string) => void;
      };
      if (branch === 'matched') {
        c.enterArena(resp.duel_id as string);
      } else if (branch === 'expired') {
        c.handleTimeout();
      } else {
        c.syncServerOffset(resp.now);
        c.startCountdown(resp.expires_at);
      }
      fixture.detectChanges();
      await p;
    }

    it('enters the arena when the heartbeat reports matched', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await driveHeartbeat({ status: 'matched', duel_id: 'duel-hb-1' }, 'matched');
      expect(component.step()).toBe('arena');
      expect(component.duelId()).toBe('duel-hb-1');
      expect(FakeWebSocket.lastUrl).toContain('/v1/duels/duel-hb-1/ws');
    });

    it('returns to the lobby when the heartbeat reports expired', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await driveHeartbeat({ status: 'expired' }, 'expired');
      expect(component.step()).toBe('lobby');
      expect(component.searchError()).toBe('cplus.duels.no_match');
      expect(TestBed.inject(CplusDuelsService).queueState().status).toBe('idle');
    });

    it('refreshes the search countdown when the heartbeat re-queues with a fresh deadline', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      // Server clock stamped at the same instant as the client (`now` echoed
      // back) — a fresh deadline 60.5s out renders as 1:00.
      const now = new Date();
      await driveHeartbeat(
        {
          status: 'finding',
          expires_at: new Date(now.getTime() + 60_500).toISOString(),
          now: now.toISOString(),
        },
        'finding',
      );
      expect(component.searchCountdown()).toBe('1:00');
    });
  });

  describe('WS frames: outcomes + errors', () => {
    it('surfaces a WS error frame while the duel is live', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({ data: wsFrame('error', { message: 'duel not found' }) });
      fixture.detectChanges();
      expect(component.searchError()).toBe('duel not found');
    });

    it('ignores a WS error frame after the duel completed', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('duel_completed', {
          winner_gcid: CHALLENGER_GCID,
          score_challenger: 10,
          score_opponent: 0,
        }),
      });
      fixture.detectChanges();
      expect(component.duelOutcome()).toBe('win');
      ws.onmessage?.({ data: wsFrame('error', { message: 'boom' }) });
      fixture.detectChanges();
      expect(component.searchError()).toBeNull();
    });

    it('maps an empty winner to a draw', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('duel_completed', {
          winner_gcid: '',
          score_challenger: 5,
          score_opponent: 5,
        }),
      });
      fixture.detectChanges();
      expect(component.duelOutcome()).toBe('draw');
    });
  });

  describe('blitz frames', () => {
    it('loads all questions + starts the overall countdown from blitz_start', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      const serverStart = Date.now() + 405_000;
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('blitz_start', {
          questions: [
            { round_no: 1, atom_id: 'atom-1', question: 'Q1?', options: ['a', 'b'] },
            { round_no: 2, atom_id: 'atom-2', question: 'Q2?', options: ['c', 'd'] },
          ],
          time_limit_sec: 10,
          started_at: new Date(serverStart).toISOString(),
          server_now: new Date(serverStart).toISOString(),
        }),
      });
      fixture.detectChanges();
      expect(component.blitzQuestions()).toHaveLength(2);
      expect(component.blitzQuestions()[0]).toEqual({
        round_no: 1,
        atom_id: 'atom-1',
        question: 'Q1?',
        options: ['a', 'b'],
      });
      expect(component.blitzTimeLimitSec()).toBe(10);
      expect(component.blitzAnswered().size).toBe(0);
      expect(component.blitzCountdown()).toBe('0:10');
    });

    it('skips the countdown when started_at is unparseable', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('blitz_start', {
          questions: [],
          time_limit_sec: 10,
          started_at: 'not-a-date',
        }),
      });
      fixture.detectChanges();
      expect(component.blitzQuestions()).toEqual([]);
      expect(component.blitzCountdown()).toBe('');
    });

    it('records answered rounds + scores from blitz_answer_resolved', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('snapshot', {
          challenger_gcid: CHALLENGER_GCID,
          score_challenger: 0,
          score_opponent: 0,
          total_rounds: 2,
        }),
      });
      ws.onmessage?.({ data: wsFrame('blitz_start', { questions: [], time_limit_sec: 30 }) });
      ws.onmessage?.({
        data: wsFrame('blitz_answer_resolved', {
          round_no: 1,
          correct: true,
          points_awarded: 10,
          current_combo: 3,
          score_challenger: 40,
          score_opponent: 30,
          duel_status: 'in_progress',
        }),
      });
      fixture.detectChanges();
      expect(component.blitzAnswered().has(1)).toBe(true);
      expect(component.blitzResults().get(1)).toEqual({ correct: true, points: 10 });
      expect(component.scoreMe()).toBe(40);
      expect(component.scoreOpponent()).toBe(30);
      expect(component.comboMe()).toBe(3);
      expect(component.hypeMessage()).toBe('🔥 3x streak! You\u2019re on fire!');
    });

    it('maps blitz completion to win, draw, then loss by winner', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('blitz_answer_resolved', {
          round_no: 1,
          correct: false,
          points_awarded: 0,
          score_challenger: 40,
          score_opponent: 30,
          duel_status: 'completed',
          winner_gcid: CHALLENGER_GCID,
        }),
      });
      fixture.detectChanges();
      expect(component.duelOutcome()).toBe('win');
      ws.onmessage?.({
        data: wsFrame('blitz_answer_resolved', {
          round_no: 2,
          correct: false,
          points_awarded: 0,
          score_challenger: 5,
          score_opponent: 5,
          duel_status: 'completed',
          winner_gcid: '',
        }),
      });
      fixture.detectChanges();
      expect(component.duelOutcome()).toBe('draw');
      ws.onmessage?.({
        data: wsFrame('blitz_answer_resolved', {
          round_no: 3,
          correct: false,
          points_awarded: 0,
          score_challenger: 30,
          score_opponent: 40,
          duel_status: 'completed',
          winner_gcid: OPPONENT_GCID,
        }),
      });
      fixture.detectChanges();
      expect(component.duelOutcome()).toBe('loss');
    });
  });

  describe('hype messages', () => {
    async function inArena(): Promise<void> {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
    }

    /** Drive snapshot + round_start (hype inputs), then assert on a resolved round. */
    function resolveRound(
      payload: Record<string, unknown>,
      roundNo = 1,
      snapshot: Record<string, unknown> = {},
    ): void {
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('snapshot', {
          challenger_gcid: CHALLENGER_GCID,
          score_challenger: 0,
          score_opponent: 0,
          total_rounds: 5,
          ...snapshot,
        }),
      });
      ws.onmessage?.({
        data: wsFrame('round_start', {
          round_no: roundNo,
          question: 'Q',
          options: [],
          deadline_at: new Date(Date.now() + 15_000).toISOString(),
        }),
      });
      ws.onmessage?.({ data: wsFrame('round_resolved', payload) });
      fixture.detectChanges();
    }

    it('streak hype when combo >= 3', async () => {
      await inArena();
      resolveRound(
        { round_no: 1, correct: true, points_awarded: 10, score_challenger: 20, score_opponent: 10, duel_status: 'in_progress' },
        1,
        { combo_challenger: 3 },
      );
      expect(component.hypeMessage()).toBe('🔥 3x streak! You\u2019re on fire!');
    });

    it('dominating hype when ahead by more than 30', async () => {
      await inArena();
      resolveRound(
        { round_no: 1, correct: true, points_awarded: 10, score_challenger: 60, score_opponent: 20, duel_status: 'in_progress' },
        1,
        { combo_challenger: 0 },
      );
      expect(component.hypeMessage()).toBe('Dominating! 40 points ahead — keep pushing!');
    });

    it('lead hype when ahead by a little', async () => {
      await inArena();
      resolveRound(
        { round_no: 1, correct: true, points_awarded: 10, score_challenger: 30, score_opponent: 25, duel_status: 'in_progress' },
        1,
        { combo_challenger: 0 },
      );
      expect(component.hypeMessage()).toBe('You\u2019re in the lead! Stay sharp!');
    });

    it('tied hype when scores are equal', async () => {
      await inArena();
      resolveRound(
        { round_no: 1, correct: true, points_awarded: 10, score_challenger: 30, score_opponent: 30, duel_status: 'in_progress' },
        1,
        { combo_challenger: 0 },
      );
      expect(component.hypeMessage()).toBe('All tied up — break the deadlock!');
    });

    it('comeback-copy when close behind', async () => {
      await inArena();
      resolveRound(
        { round_no: 1, correct: true, points_awarded: 10, score_challenger: 20, score_opponent: 30, duel_status: 'in_progress' },
        1,
        { combo_challenger: 0 },
      );
      expect(component.hypeMessage()).toBe('Almost there — just 10 points behind!');
    });

    it('praise fallback for a solid correct answer', async () => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0);
      try {
        await inArena();
        resolveRound(
          { round_no: 1, correct: true, points_awarded: 10, score_challenger: 10, score_opponent: 50, duel_status: 'in_progress' },
          1,
          { combo_challenger: 0 },
        );
        expect(component.hypeMessage()).toBe('Cracked it!');
      } finally {
        random.mockRestore();
      }
    });

    it('comeback hype when losing by more than 40', async () => {
      await inArena();
      resolveRound(
        { round_no: 1, correct: false, points_awarded: 0, score_challenger: 30, score_opponent: 80, duel_status: 'in_progress' },
        1,
        { combo_challenger: 5 },
      );
      expect(component.hypeMessage()).toBe('Tough one — but the comeback starts now!');
    });

    it('encouragement hype when losing by 15–40', async () => {
      await inArena();
      resolveRound(
        { round_no: 1, correct: false, points_awarded: 0, score_challenger: 30, score_opponent: 55, duel_status: 'in_progress' },
        1,
        { combo_challenger: 5 },
      );
      expect(component.hypeMessage()).toBe(
        'That\u2019s okay — 25 points is nothing. Next one is yours!',
      );
    });

    it('reset-encouragement on an early-round miss with no combo', async () => {
      await inArena();
      resolveRound(
        { round_no: 2, correct: false, points_awarded: 0, score_challenger: 30, score_opponent: 35, duel_status: 'in_progress' },
        2,
        { combo_challenger: 0 },
      );
      expect(component.hypeMessage()).toBe('Shake it off — reset and charge the next one!');
    });

    it('generic encouragement fallback for a wrong answer', async () => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0);
      try {
        await inArena();
        resolveRound(
          { round_no: 1, correct: false, points_awarded: 0, score_challenger: 50, score_opponent: 30, duel_status: 'in_progress' },
          1,
          { combo_challenger: 5 },
        );
        expect(component.hypeMessage()).toBe('No stress — next question is yours!');
      } finally {
        random.mockRestore();
      }
    });

    it('blitz hype counts remaining questions (plural)', async () => {
      await inArena();
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('snapshot', {
          challenger_gcid: CHALLENGER_GCID,
          score_challenger: 0,
          score_opponent: 0,
          total_rounds: 5,
        }),
      });
      ws.onmessage?.({
        data: wsFrame('blitz_answer_resolved', {
          round_no: 1,
          correct: true,
          points_awarded: 10,
          current_combo: 0,
          score_challenger: 0,
          score_opponent: 10,
          duel_status: 'in_progress',
        }),
      });
      fixture.detectChanges();
      expect(component.hypeMessage()).toBe('Nice! 5 questions left — go go go!');
    });

    it('blitz hype uses the singular when one question remains', async () => {
      await inArena();
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('snapshot', {
          challenger_gcid: CHALLENGER_GCID,
          score_challenger: 0,
          score_opponent: 0,
          total_rounds: 2,
        }),
      });
      ws.onmessage?.({
        data: wsFrame('round_start', {
          round_no: 1,
          question: 'Q',
          options: [],
          deadline_at: new Date(Date.now() + 15_000).toISOString(),
        }),
      });
      ws.onmessage?.({
        data: wsFrame('blitz_answer_resolved', {
          round_no: 1,
          correct: true,
          points_awarded: 10,
          current_combo: 0,
          score_challenger: 0,
          score_opponent: 10,
          duel_status: 'in_progress',
        }),
      });
      fixture.detectChanges();
      expect(component.hypeMessage()).toBe('Nice! 1 question left — go go go!');
    });
  });

  describe('answer sending', () => {
    it('does not send an answer while the socket is not open', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      const ws = FakeWebSocket.instances[0];
      ws.close(); // readyState 3 — the component still holds the reference
      component.selectAnswer('4');
      expect(ws.sent).toHaveLength(0);
    });

    it('falls back to answer_time_ms = 0 when no round_start arrived', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      await new Promise((resolve) => setTimeout(resolve, 0));
      const ws = FakeWebSocket.instances[0];
      component.selectAnswer('4');
      const frame = JSON.parse(ws.sent[0]);
      expect(frame.round_no).toBe(0);
      expect(frame.answer).toBe('4');
      expect(frame.answer_time_ms).toBe(0);
    });

    it('selectBlitzAnswer sends the frame with the elapsed time fallback', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      await new Promise((resolve) => setTimeout(resolve, 0));
      const ws = FakeWebSocket.instances[0];
      component.selectBlitzAnswer(3, 'option-b');
      expect(ws.sent).toHaveLength(1);
      const frame = JSON.parse(ws.sent[0]);
      expect(frame.round_no).toBe(3);
      expect(frame.answer).toBe('option-b');
      expect(frame.answer_time_ms).toBe(0); // no blitz_start → fallback 0
    });

    it('selectBlitzAnswer ignores rounds already answered', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      await new Promise((resolve) => setTimeout(resolve, 0));
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({ data: wsFrame('blitz_start', { questions: [], time_limit_sec: 0 }) });
      ws.onmessage?.({
        data: wsFrame('blitz_answer_resolved', {
          round_no: 1,
          correct: false,
          points_awarded: 0,
          score_challenger: 0,
          score_opponent: 0,
          duel_status: 'in_progress',
        }),
      });
      component.selectBlitzAnswer(1, 'x');
      expect(ws.sent).toHaveLength(0);
      component.selectBlitzAnswer(2, 'y');
      expect(ws.sent).toHaveLength(1);
      expect(JSON.parse(ws.sent[0]).round_no).toBe(2);
    });
  });

  describe('reconnect + countdown edges', () => {
    it('shows 0:00 when the matchmaking deadline already passed', async () => {
      initAs(CHALLENGER_GCID);
      const p = component.findMatch();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      req.flush({
        status: 'finding',
        expires_at: new Date(Date.now() - 5_000).toISOString(),
      });
      await p;
      fixture.detectChanges();
      expect(component.searchCountdown()).toBe('0:00');
    });

    it('stops the round countdown when the deadline already passed', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('round_start', {
          round_no: 1,
          question: 'Q',
          options: [],
          deadline_at: new Date(Date.now() - 1_000).toISOString(),
        }),
      });
      fixture.detectChanges();
      // An expired deadline ticks to 0:00 and then stops + clears the timer.
      expect(component.roundCountdown()).toBe('');
    });

    it('does not open a WS when the user is not in the arena', async () => {
      initAs(CHALLENGER_GCID);
      (component as unknown as { connectWebSocket: (id: string) => void }).connectWebSocket(
        'duel-1',
      );
      expect(FakeWebSocket.instances).toHaveLength(0);
    });

    it('does not reconnect after the duel completed', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('duel_completed', { winner_gcid: CHALLENGER_GCID }),
      });
      fixture.detectChanges();
      ws.onclose?.();
      const before = FakeWebSocket.instances.length;
      (component as unknown as { connectWebSocket: (id: string) => void }).connectWebSocket(
        'duel-2',
      );
      expect(FakeWebSocket.instances.length).toBe(before);
      expect(component.duelOutcome()).toBe('win');
    });

    it('gives up reconnecting after MAX_RECONNECT_ATTEMPTS', fakeAsync(() => {
      initAs(CHALLENGER_GCID);
      const c = component as unknown as { scheduleReconnect: (duelId: string) => void };
      for (let i = 0; i < 6; i++) {
        c.scheduleReconnect('duel-1');
      }
      expect(component.wsReconnecting()).toBe(false);
      expect(component.connectionLost()).toBe(true);
    }));

    it('schedules a reconnection when the WS drops mid-duel', fakeAsync(() => {
      initAs(CHALLENGER_GCID);
      void component.findMatch();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      req.flush({ status: 'finding', expires_at: new Date(Date.now() + 60_000).toISOString() });
      flushMicrotasks();
      const duelsService = TestBed.inject(CplusDuelsService);
      duelsService.heartbeat();
      const hbReq = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue/heartbeat'));
      hbReq.flush({ status: 'matched', duel_id: 'duel-1' });
      flushMicrotasks();
      (component as unknown as { enterArena: (id: string) => void }).enterArena('duel-1');
      fixture.detectChanges();
      FakeWebSocket.instances[0].onclose?.();
      expect(component.wsReconnecting()).toBe(true);
      tick(1000);
      expect(FakeWebSocket.instances).toHaveLength(2);
      expect(FakeWebSocket.lastUrl).toContain('/v1/duels/duel-1/ws');
    }));
  });

  describe('backToLobby', () => {
    it('resets arena state, closes the WS, and reloads rating + leaderboard', async () => {
      initAs(CHALLENGER_GCID);
      await enterSearching();
      await enterArena('duel-1');
      // Settle the deferred FakeWebSocket onopen so it cannot re-arm
      // wsConnected after backToLobby closes the socket.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const ws = FakeWebSocket.instances[0];
      ws.onmessage?.({
        data: wsFrame('snapshot', {
          challenger_gcid: CHALLENGER_GCID,
          score_challenger: 5,
          score_opponent: 3,
          total_rounds: 3,
        }),
      });
      ws.onmessage?.({
        data: wsFrame('round_start', {
          round_no: 1,
          question: 'Q',
          options: [],
          deadline_at: new Date(Date.now() + 15_000).toISOString(),
        }),
      });
      component.backToLobby();
      httpMock
        .expectOne((r) => r.url.endsWith('/v1/duels/my-rating'))
        .flush({ gcid: CHALLENGER_GCID, rating: 1200 });
      httpMock.expectOne((r) => r.url.endsWith('/v1/duels/leaderboard')).flush({ entries: [] });
      await fixture.whenStable();
      expect(component.step()).toBe('lobby');
      expect(component.duelOutcome()).toBeNull();
      expect(component.connectionLost()).toBe(false);
      expect(component.blitzQuestions()).toEqual([]);
      expect(component.hypeMessage()).toBeNull();
      expect(component.wsConnected()).toBe(false);
      expect((component as unknown as { ws: WebSocket | null }).ws).toBeNull();
    });
  });

  describe('misc helpers', () => {
    it('shortGcid truncates a full gcid and preserves degenerate values', () => {
      initAs(CHALLENGER_GCID);
      expect(component.shortGcid('gcid-019700aa-bbccddee')).toBe('gcid-019700aa');
      expect(component.shortGcid('gcid-')).toBe('gcid-');
    });
  });
});
