import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
  TestRequest,
} from '@angular/common/http/testing';

import { CplusLeaderboardsService } from './cplus-leaderboards.service';
import {
  LeaderboardEntry,
  LeaderboardPage,
} from '../models/cplus-leaderboards.model';

/** Wire-shape entry matching `leaderboardEntryJSON` (social_handlers.go L236). */
const WIRE_ENTRY: LeaderboardEntry = {
  gcid: 'gcid-phyllis-tan',
  score: 167,
  rank: 7,
};

describe('CplusLeaderboardsService', () => {
  let service: CplusLeaderboardsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        CplusLeaderboardsService,
      ],
    });
    service = TestBed.inject(CplusLeaderboardsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Drive loadBoard() and flush a page, returning the resolved entries. */
  async function loadBoardWith(
    entries: readonly LeaderboardEntry[],
    nextCursor = '',
    computedAt = '2026-06-19T10:00:00Z',
  ): Promise<readonly LeaderboardEntry[]> {
    const promise = service.loadBoard();
    const req = expectBoardRequest();
    const page: LeaderboardPage = {
      entries,
      computed_at: computedAt,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    };
    req.flush(page);
    return promise;
  }

  function expectBoardRequest(): TestRequest {
    return httpMock.expectOne((r) => r.url.endsWith('/v1/leaderboard'));
  }

  describe('loadBoard (real GET /v1/leaderboard)', () => {
    it('emits idle initially', () => {
      expect(service.state().status).toBe('idle');
    });

    it('GETs /v1/leaderboard via the BFF and transitions loading → success', async () => {
      const promise = service.loadBoard();
      const req = expectBoardRequest();
      expect(req.request.method).toBe('GET');
      req.flush({ entries: [WIRE_ENTRY], computed_at: '2026-06-19T10:00:00Z' });
      await promise;
      expect(service.state().status).toBe('success');
      expect(service.entries().length).toBe(1);
    });

    it('passes default scope=global, metric=xp, period=all-time, limit=20', async () => {
      const promise = service.loadBoard();
      const req = expectBoardRequest();
      expect(req.request.params.get('scope')).toBe('global');
      expect(req.request.params.get('metric')).toBe('xp');
      expect(req.request.params.get('period')).toBe('all-time');
      expect(req.request.params.get('limit')).toBe('20');
      req.flush({ entries: [], computed_at: '' });
      await promise;
    });

    it('passes custom scope/metric/period when supplied', async () => {
      const promise = service.loadBoard('tenant', 'duel_elo', 'monthly');
      const req = expectBoardRequest();
      expect(req.request.params.get('scope')).toBe('tenant');
      expect(req.request.params.get('metric')).toBe('duel_elo');
      expect(req.request.params.get('period')).toBe('monthly');
      req.flush({ entries: [], computed_at: '' });
      await promise;
    });

    it('passes scope_target_id for class/course scopes', async () => {
      const promise = service.loadBoard('class', 'xp', 'weekly', 'class-42');
      const req = expectBoardRequest();
      expect(req.request.params.get('scope_target_id')).toBe('class-42');
      req.flush({ entries: [], computed_at: '' });
      await promise;
    });

    it('does NOT pass scope_target_id for global/tenant scopes', async () => {
      const promise = service.loadBoard('global');
      const req = expectBoardRequest();
      expect(req.request.params.has('scope_target_id')).toBe(false);
      req.flush({ entries: [], computed_at: '' });
      await promise;
    });

    it('passes ?cursor for pagination via loadMore', async () => {
      await loadBoardWith([WIRE_ENTRY], 'cursor-page-2');
      const promise = service.loadMore();
      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/v1/leaderboard') && r.params.get('cursor') === 'cursor-page-2',
      );
      req.flush({ entries: [], computed_at: '' });
      await promise;
    });

    it('exposes wire DTOs verbatim — no fabricated rows', async () => {
      const entries = await loadBoardWith([WIRE_ENTRY]);
      const e = entries[0];
      expect(e.gcid).toBe(WIRE_ENTRY.gcid);
      expect(e.score).toBe(WIRE_ENTRY.score);
      expect(e.rank).toBe(WIRE_ENTRY.rank);
    });

    it('threads next_cursor through the service signal', async () => {
      expect(service.nextCursor()).toBe('');
      await loadBoardWith([WIRE_ENTRY], 'cursor-page-2');
      expect(service.nextCursor()).toBe('cursor-page-2');
    });

    it('renders an empty board as success with no entries', async () => {
      const entries = await loadBoardWith([]);
      expect(service.state().status).toBe('success');
      expect(entries).toEqual([]);
      expect(service.entries()).toEqual([]);
    });

    it('500 → error state with a cplus.leaderboards i18n key', async () => {
      const promise = service.loadBoard();
      const req = expectBoardRequest();
      req.flush(
        { error: { code: 'INTERNAL', message: 'boom' } },
        { status: 500, statusText: 'Server Error' },
      );
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toMatch(/^cplus\.leaderboards\./);
      }
    });

    it('401 → the not-authenticated key, which asks for a sign-in', async () => {
      const promise = service.loadBoard();
      const req = expectBoardRequest();
      req.flush(
        { error: { code: 'UNAUTHENTICATED', message: 'no session' } },
        { status: 401, statusText: 'Unauthorized' },
      );
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.leaderboards.error_unauthenticated');
      }
    });

    it('403 → the forbidden key, which never asks for a sign-in', async () => {
      const promise = service.loadBoard();
      const req = expectBoardRequest();
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'no' } },
        { status: 403, statusText: 'Forbidden' },
      );
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.leaderboards.error_forbidden');
      }
    });

    it('returns [] on error (never throws)', async () => {
      const promise = service.loadBoard();
      const req = expectBoardRequest();
      req.flush({}, { status: 500, statusText: 'Server Error' });
      const entries = await promise;
      expect(entries).toEqual([]);
    });
  });
});
