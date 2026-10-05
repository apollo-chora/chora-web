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

import { CplusConnectionsService } from './cplus-connections.service';
import {
  ConnectionEntry,
  ConnectionsPage,
} from '../models/cplus-connections.model';

/**
 * Wire-shape connection entry — `gcid` + `created_at` only (mirrors the
 * `connection_handlers.go` list response).
 */
const WIRE_ENTRY: ConnectionEntry = {
  gcid: 'gcid-019700aa-abc',
  created_at: '2026-06-19T10:00:00Z',
};

const WIRE_ENTRY_2: ConnectionEntry = {
  gcid: 'gcid-019700bb-def',
  created_at: '2026-06-20T11:00:00Z',
};

describe('CplusConnectionsService', () => {
  let service: CplusConnectionsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        CplusConnectionsService,
      ],
    });
    service = TestBed.inject(CplusConnectionsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Drive loadConnections() and flush a page, returning the resolved entries. */
  async function loadConnectionsWith(
    type: 'following' | 'followers' | 'blocked',
    connections: readonly ConnectionEntry[],
    nextCursor = '',
  ): Promise<readonly ConnectionEntry[]> {
    const promise = service.loadConnections(type);
    const req = expectConnectionsRequest();
    const page: ConnectionsPage = {
      connections,
      ...(nextCursor ? { next_cursor: nextCursor } : {}),
    };
    req.flush(page);
    return promise;
  }

  function expectConnectionsRequest(): TestRequest {
    return httpMock.expectOne((r) => r.url.endsWith('/v1/connections'));
  }

  describe('loadConnections (real GET /v1/connections)', () => {
    it('emits idle initially', () => {
      expect(service.state().status).toBe('idle');
    });

    it('GETs /v1/connections via the BFF and transitions loading → success', async () => {
      const promise = service.loadConnections('following');
      const req = expectConnectionsRequest();
      expect(req.request.method).toBe('GET');
      req.flush({ connections: [WIRE_ENTRY] });
      await promise;
      expect(service.state().status).toBe('success');
      expect(service.connections().length).toBe(1);
    });

    it('passes type=following by default', async () => {
      const promise = service.loadConnections('following');
      const req = expectConnectionsRequest();
      expect(req.request.params.get('type')).toBe('following');
      req.flush({ connections: [] });
      await promise;
    });

    it('passes type=followers when requested', async () => {
      const promise = service.loadConnections('followers');
      const req = expectConnectionsRequest();
      expect(req.request.params.get('type')).toBe('followers');
      req.flush({ connections: [] });
      await promise;
    });

    it('passes type=blocked when requested', async () => {
      const promise = service.loadConnections('blocked');
      const req = expectConnectionsRequest();
      expect(req.request.params.get('type')).toBe('blocked');
      req.flush({ connections: [] });
      await promise;
    });

    it('passes limit=20 by default', async () => {
      const promise = service.loadConnections('following');
      const req = expectConnectionsRequest();
      expect(req.request.params.get('limit')).toBe('20');
      req.flush({ connections: [] });
      await promise;
    });

    it('passes a custom limit when supplied', async () => {
      const promise = service.loadConnections('following', undefined, 50);
      const req = expectConnectionsRequest();
      expect(req.request.params.get('limit')).toBe('50');
      req.flush({ connections: [] });
      await promise;
    });

    it('passes ?cursor when loadConnections is called with one', async () => {
      const promise = service.loadConnections('following', 'cursor-abc');
      const req = httpMock.expectOne(
        (r) =>
          r.url.endsWith('/v1/connections') &&
          r.params.get('cursor') === 'cursor-abc',
      );
      req.flush({ connections: [] });
      await promise;
      expect(service.state().status).toBe('success');
    });

    it('does NOT pass cursor param on the first page', async () => {
      const promise = service.loadConnections('following');
      const req = expectConnectionsRequest();
      expect(req.request.params.has('cursor')).toBe(false);
      req.flush({ connections: [] });
      await promise;
    });

    it('exposes wire DTOs verbatim — no fabricated fields', async () => {
      const entries = await loadConnectionsWith('following', [
        WIRE_ENTRY,
        WIRE_ENTRY_2,
      ]);
      expect(entries[0].gcid).toBe(WIRE_ENTRY.gcid);
      expect(entries[0].created_at).toBe(WIRE_ENTRY.created_at);
      expect(entries[1].gcid).toBe(WIRE_ENTRY_2.gcid);
      expect(entries[1].created_at).toBe(WIRE_ENTRY_2.created_at);
    });

    it('threads next_cursor through the service signal', async () => {
      expect(service.nextCursor()).toBe('');
      await loadConnectionsWith('following', [WIRE_ENTRY], 'cursor-page-2');
      expect(service.nextCursor()).toBe('cursor-page-2');
    });

    it('renders an empty connections list as success with no entries', async () => {
      const entries = await loadConnectionsWith('following', []);
      expect(service.state().status).toBe('success');
      expect(entries).toEqual([]);
      expect(service.connections()).toEqual([]);
    });

    it('500 → error state with a cplus.connections i18n key', async () => {
      const promise = service.loadConnections('following');
      const req = expectConnectionsRequest();
      req.flush(
        { error: { code: 'INTERNAL', message: 'boom' } },
        { status: 500, statusText: 'Server Error' },
      );
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.connections.error_upstream');
      }
    });

    it('401 → the not-authenticated key, which asks for a sign-in', async () => {
      const promise = service.loadConnections('following');
      const req = expectConnectionsRequest();
      req.flush(
        { error: { code: 'UNAUTHENTICATED', message: 'no session' } },
        { status: 401, statusText: 'Unauthorized' },
      );
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.connections.error_unauthenticated');
      }
    });

    it('403 → the forbidden key, which never asks for a sign-in', async () => {
      const promise = service.loadConnections('following');
      const req = expectConnectionsRequest();
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'no' } },
        { status: 403, statusText: 'Forbidden' },
      );
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.connections.error_forbidden');
      }
    });

    it('404 → error state with the generic connections i18n key', async () => {
      const promise = service.loadConnections('following');
      const req = expectConnectionsRequest();
      req.flush(
        { error: { code: 'NOT_FOUND', message: 'nope' } },
        { status: 404, statusText: 'Not Found' },
      );
      await promise;
      const state = service.state();
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.connections.error_generic');
      }
    });

    it('returns [] on error (never throws)', async () => {
      const promise = service.loadConnections('following');
      const req = expectConnectionsRequest();
      req.flush({}, { status: 500, statusText: 'Server Error' });
      const entries = await promise;
      expect(entries).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Relation sets (action-availability derivation — following + blocked only)
  // ---------------------------------------------------------------------------

  describe('loadRelationSets', () => {
    it('loads following + blocked into lookup sets', async () => {
      const promise = service.loadRelationSets();

      const lists = httpMock.match((r) => r.url.endsWith('/v1/connections'));
      expect(lists.length).toBe(2);
      for (const req of lists) {
        const type = req.request.params.get('type');
        if (type === 'following') {
          req.flush({ connections: [{ gcid: 'g-following', created_at: '' }] });
        } else if (type === 'blocked') {
          req.flush({ connections: [{ gcid: 'g-blocked', created_at: '' }] });
        } else {
          throw new Error(`unexpected type ${type}`);
        }
      }

      await promise;
      const sets = service.relationSets();
      expect(sets.following.has('g-following')).toBe(true);
      expect(sets.blocked.has('g-blocked')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Hybrid suggestions (GET /v1/connections/suggestions)
  // ---------------------------------------------------------------------------

  describe('loadSuggestions (GET /v1/connections/suggestions)', () => {
    function expectSuggestionsGet(): TestRequest {
      return httpMock.expectOne(
        (r) =>
          r.method === 'GET' &&
          r.url.endsWith('/v1/connections/suggestions'),
      );
    }

    it('exposes the hybrid wire rows verbatim (shared tags + mutual follows)', async () => {
      const promise = service.loadSuggestions();
      expectSuggestionsGet().flush({
        suggestions: [
          {
            gcid: 'gcid-fof-1',
            display_name: 'Aria',
            shared_tags: ['golang', 'rust'],
            mutual_follows: 3,
          },
          {
            gcid: 'gcid-fof-2',
            shared_tags: [],
            mutual_follows: 0,
          },
        ],
      });
      await promise;
      const state = service.suggestionsState();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.suggestions[0].gcid).toBe('gcid-fof-1');
        expect(state.suggestions[0].display_name).toBe('Aria');
        expect(state.suggestions[0].shared_tags).toEqual(['golang', 'rust']);
        expect(state.suggestions[0].mutual_follows).toBe(3);
        expect(state.suggestions[1].mutual_follows).toBe(0);
        expect(state.suggestions.length).toBe(2);
      }
    });

    it('500 → error state with the upstream key (fail-loud, no fabricated rows)', async () => {
      const promise = service.loadSuggestions();
      expectSuggestionsGet().flush({}, { status: 500, statusText: 'Server Error' });
      await promise;
      const state = service.suggestionsState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.connections.error_upstream');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Relationship writes (follow / block plane only)
  // ---------------------------------------------------------------------------

  describe('relationship writes', () => {
    const target = 'gcid-target-1';

    it('follow POSTs /v1/connections/follows with {gcid}', async () => {
      const promise = service.follow(target);
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/v1/connections/follows'),
      );
      expect(req.request.body).toEqual({ gcid: target });
      req.flush({ gcid: target, created: true, created_at: '' }, { status: 201, statusText: 'Created' });
      expect(await promise).toBe(true);
      expect(service.actionState().status).toBe('idle');
    });

    it('unfollow DELETEs /v1/connections/follows/{gcid}', async () => {
      const promise = service.unfollow(target);
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'DELETE' &&
          r.url.endsWith(`/v1/connections/follows/${target}`),
      );
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await promise).toBe(true);
    });

    it('block POSTs /v1/connections/blocks with {gcid}', async () => {
      const promise = service.block(target);
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/v1/connections/blocks'),
      );
      expect(req.request.body).toEqual({ gcid: target });
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await promise).toBe(true);
    });

    it('unblock DELETEs /v1/connections/blocks/{gcid}', async () => {
      const promise = service.unblock(target);
      httpMock
        .expectOne(
          (r) =>
            r.method === 'DELETE' &&
            r.url.endsWith(`/v1/connections/blocks/${target}`),
        )
        .flush(null, { status: 204, statusText: 'No Content' });
      expect(await promise).toBe(true);
    });

    it('409 refusal → error action state with the refusal key (never a fake success)', async () => {
      const promise = service.follow(target);
      httpMock
        .expectOne((r) => r.url.endsWith('/v1/connections/follows'))
        .flush(
          { error: 'connection not permitted between these members' },
          { status: 409, statusText: 'Conflict' },
        );
      expect(await promise).toBe(false);
      const state = service.actionState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.action).toBe('follow');
        expect(state.gcid).toBe(target);
        expect(state.error.message).toBe('cplus.connections.error_refused');
      }
    });

    it('500 on a write → error action state with the upstream key', async () => {
      const promise = service.block(target);
      httpMock
        .expectOne((r) => r.url.endsWith('/v1/connections/blocks'))
        .flush({}, { status: 500, statusText: 'Server Error' });
      expect(await promise).toBe(false);
      const state = service.actionState();
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.connections.error_upstream');
      }
    });
  });
});
