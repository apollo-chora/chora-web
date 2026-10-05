import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { CplusDuelsService } from './cplus-duels.service';

const GCID = '01970000-0000-7000-9000-0000000000a1';

describe('CplusDuelsService', () => {
  let service: CplusDuelsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        CplusDuelsService,
      ],
    });
    service = TestBed.inject(CplusDuelsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('emits idle queue state initially', () => {
    expect(service.queueState().status).toBe('idle');
  });

  describe('enterQueue (POST /v1/duels/queue)', () => {
    it('transitions finding → stores expires_at from wire', async () => {
      const promise = service.enterQueue('queue-1');
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Idempotency-Key')).toBe('queue-1');
      req.flush({
        status: 'finding',
        expires_at: '2026-07-26T08:00:00Z',
      });
      const resp = await promise;
      expect(resp?.status).toBe('finding');
      const state = service.queueState();
      expect(state.status).toBe('finding');
      if (state.status === 'finding') {
        expect(state.expires_at).toBe('2026-07-26T08:00:00Z');
      }
    });

    it('sends interest_tags in the body', async () => {
      const promise = service.enterQueue('queue-2', ['inheritance', 'goroutines']);
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      expect(req.request.body).toEqual({ interest_tags: ['inheritance', 'goroutines'], question_count: 5, category: 'overall', mode: 'classic' });
      req.flush({ status: 'finding' });
      await promise;
    });

    it('sends question_count when provided (WS4)', async () => {
      const promise = service.enterQueue('queue-qc', ['inheritance'], 15);
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      expect(req.request.body).toEqual({ interest_tags: ['inheritance'], question_count: 15, category: 'overall', mode: 'classic' });
      req.flush({ status: 'finding' });
      await promise;
    });

    it('defaults question_count to 5 when omitted (WS4)', async () => {
      const promise = service.enterQueue('queue-qc-default');
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      expect(req.request.body).toEqual({ interest_tags: [], question_count: 5, category: 'overall', mode: 'classic' });
      req.flush({ status: 'finding' });
      await promise;
    });

    it('sends category when provided (WS1)', async () => {
      const promise = service.enterQueue('queue-cat', ['calculus'], 5, 'mathematics');
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      expect(req.request.body).toEqual({ interest_tags: ['calculus'], question_count: 5, category: 'mathematics', mode: 'classic' });
      req.flush({ status: 'finding' });
      await promise;
    });

    // f6f51296e added `mode` (and the conditional `blitz_variant`) to the
    // request body and shipped with NO service-level cover for either. The
    // four toEqual assertions above are exact-shape, so the new field broke
    // all four at once while nothing asserted the field it added. These two
    // close that gap so the same drift cannot recur silently.
    it('sends mode=blitz with its blitz_variant (WS blitz)', async () => {
      const promise = service.enterQueue('queue-blitz', [], 5, 'overall', 'blitz', 'timed');
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      expect(req.request.body).toEqual({
        interest_tags: [],
        question_count: 5,
        category: 'overall',
        mode: 'blitz',
        blitz_variant: 'timed',
      });
      req.flush({ status: 'finding' });
      await promise;
    });

    it('omits blitz_variant on a classic duel even when one is passed', async () => {
      // The variant is meaningless outside blitz, so the body must not carry
      // it - the guard is `mode === 'blitz' && blitzVariant`, not `blitzVariant`.
      const promise = service.enterQueue('queue-classic', [], 5, 'overall', 'classic', 'race');
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      expect(req.request.body).toEqual({
        interest_tags: [],
        question_count: 5,
        category: 'overall',
        mode: 'classic',
      });
      req.flush({ status: 'finding' });
      await promise;
    });

    it('500 → error state with cplus.duels i18n key', async () => {
      const promise = service.enterQueue('queue-3');
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      req.flush(
        { error: { code: 'INTERNAL', message: 'boom' } },
        { status: 500, statusText: 'Server Error' },
      );
      await promise;
      const state = service.queueState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toMatch(/^cplus\.duels\./);
      }
    });

    it('returns null on error (never throws)', async () => {
      const promise = service.enterQueue('queue-4');
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      req.flush({}, { status: 500, statusText: 'Server Error' });
      const resp = await promise;
      expect(resp).toBeNull();
    });
  });

  describe('cancelQueue (DELETE /v1/duels/queue)', () => {
    it('returns true + resets state to idle on success', async () => {
      const promise = service.cancelQueue();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      expect(req.request.method).toBe('DELETE');
      req.flush({ status: 'cancelled' });
      const ok = await promise;
      expect(ok).toBe(true);
      expect(service.queueState().status).toBe('idle');
    });

    it('returns false on error (fail-loud, no throw)', async () => {
      const promise = service.cancelQueue();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue'));
      req.flush({}, { status: 500, statusText: 'Server Error' });
      const ok = await promise;
      expect(ok).toBe(false);
    });
  });

  describe('heartbeat (POST /v1/duels/queue/heartbeat)', () => {
    it('returns the wire response + transitions to matched on match', async () => {
      const promise = service.heartbeat();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue/heartbeat'));
      expect(req.request.method).toBe('POST');
      req.flush({ status: 'matched', duel_id: 'duel-42' });
      const resp = await promise;
      expect(resp?.status).toBe('matched');
      expect(resp?.duel_id).toBe('duel-42');
      const state = service.queueState();
      expect(state.status).toBe('matched');
      if (state.status === 'matched') {
        expect(state.duel_id).toBe('duel-42');
      }
    });

    it('returns null on error (fail-loud, no throw)', async () => {
      const promise = service.heartbeat();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/queue/heartbeat'));
      req.flush({}, { status: 500, statusText: 'Server Error' });
      const resp = await promise;
      expect(resp).toBeNull();
    });
  });

  describe('loadMyRating (GET /v1/duels/my-rating)', () => {
    it('transitions loading → success with the wire DTO', async () => {
      const promise = service.loadMyRating();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/my-rating'));
      req.flush({
        gcid: GCID,
        rating: 1247,
        wins: 10,
        losses: 3,
        draws: 2,
        peak_elo: 1300,
        completed_courses: 5,
        course_bonus: 100,
        proficiency: 1347,
      });
      await promise;
      const state = service.ratingState();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.rating.rating).toBe(1247);
        expect(state.rating.proficiency).toBe(1347);
      }
    });

    it('500 → error state with cplus.duels i18n key', async () => {
      const promise = service.loadMyRating();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/my-rating'));
      req.flush(
        { error: { code: 'INTERNAL', message: 'boom' } },
        { status: 500, statusText: 'Server Error' },
      );
      await promise;
      const state = service.ratingState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.duels.error_upstream');
      }
    });
  });

  describe('loadLeaderboard (GET /v1/duels/leaderboard)', () => {
    it('transitions loading → success with entries', async () => {
      const promise = service.loadLeaderboard();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/leaderboard'));
      req.flush({
        entries: [
          { gcid: 'gcid-aria', rating: 1500, wins: 20, losses: 1, draws: 0, peak_elo: 1550 },
        ],
        computed_at: '2026-07-26T08:00:00Z',
      });
      await promise;
      const state = service.leaderboardState();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.entries.length).toBe(1);
        expect(state.entries[0].gcid).toBe('gcid-aria');
      }
    });

    it('passes ?category= when a category is provided (WS1)', async () => {
      const promise = service.loadLeaderboard('mathematics');
      const req = httpMock.expectOne((r) =>
        r.url.split('?')[0].endsWith('/v1/duels/leaderboard') && r.params.get('category') === 'mathematics',
      );
      req.flush({ entries: [], computed_at: '' });
      await promise;
    });

    it('does NOT pass ?category for overall (default)', async () => {
      const promise = service.loadLeaderboard('overall');
      const req = httpMock.expectOne((r) =>
        r.url.split('?')[0].endsWith('/v1/duels/leaderboard') && !r.params.has('category'),
      );
      req.flush({ entries: [], computed_at: '' });
      await promise;
    });
  });

  describe('errorKey mapping', () => {
    /** Helper: drive a request + flush the given status, return the error message. */
    async function errorMessageForStatus(status: number): Promise<string> {
      const promise = service.loadMyRating();
      const req = httpMock.expectOne((r) => r.url.endsWith('/v1/duels/my-rating'));
      req.flush({}, { status, statusText: 'Err' });
      await promise;
      const state = service.ratingState();
      if (state.status === 'error') {
        return state.error.message;
      }
      throw new Error('expected error state');
    }

    // 401 and 403 are different answers, not one. A 401 is recoverable by
    // signing in; a 403 is not, and telling a refused user to sign in sends
    // them through a screen that cannot fix their problem.
    it('401 → not-authenticated key', async () => {
      expect(await errorMessageForStatus(401)).toBe('cplus.duels.error_unauthenticated');
    });

    it('403 → forbidden key', async () => {
      expect(await errorMessageForStatus(403)).toBe('cplus.duels.error_forbidden');
    });

    it('404 → not_found key', async () => {
      expect(await errorMessageForStatus(404)).toBe('cplus.duels.error_not_found');
    });

    it('409 → conflict key', async () => {
      expect(await errorMessageForStatus(409)).toBe('cplus.duels.error_conflict');
    });

    it('5xx → upstream key', async () => {
      expect(await errorMessageForStatus(500)).toBe('cplus.duels.error_upstream');
      expect(await errorMessageForStatus(502)).toBe('cplus.duels.error_upstream');
    });

    it('other → generic key', async () => {
      expect(await errorMessageForStatus(418)).toBe('cplus.duels.error_generic');
    });
  });
});
