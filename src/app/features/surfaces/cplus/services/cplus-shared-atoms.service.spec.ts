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

import { CplusSharedAtomsService } from './cplus-shared-atoms.service';
import {
  SharedAtomFeedEntry,
  SharedAtomsFeedPage,
} from '../models/cplus-shared-atoms.model';

/**
 * Wire-shape card matching `sharedAtomCard` (share_handlers.go L165).
 */
const WIRE_CARD: SharedAtomFeedEntry = {
  share_entry_id: '019700aa-0000-7000-8000-000000000001',
  author_gcid: 'gcid-019700aa-abc',
  author_display_name: 'Phyllis Tan',
  atom_id: '019700bb-0000-7000-8000-0000000000ff',
  atom_revision_id: 'rev-001',
  atom_stem_preview: 'Bayesian inference — priors and posteriors',
  question_type: 'multiple_choice',
  caption: 'Priors finally clicked!',
  license_terms: 'cc_by_sa',
  reaction_count: 12,
  created_at: '2026-06-19T10:00:00Z',
};

const WIRE_CARD_NO_CAPTION: SharedAtomFeedEntry = {
  ...WIRE_CARD,
  share_entry_id: '019700aa-0000-7000-8000-000000000002',
  caption: undefined,
  license_terms: 'free',
  royalty_rate: undefined,
};

describe('CplusSharedAtomsService', () => {
  let service: CplusSharedAtomsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        CplusSharedAtomsService,
      ],
    });
    service = TestBed.inject(CplusSharedAtomsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Drive loadFeed() and flush a page, returning the resolved cards. */
  async function loadFeedWith(
    cards: readonly SharedAtomFeedEntry[],
    nextCursor = '',
  ): Promise<readonly SharedAtomFeedEntry[]> {
    const promise = service.loadFeed();
    const req = expectFeedRequest();
    const page: SharedAtomsFeedPage = { cards, ...(nextCursor ? { next_cursor: nextCursor } : {}) };
    req.flush(page);
    return promise;
  }

  function expectFeedRequest(): TestRequest {
    return httpMock.expectOne((r) => r.url.endsWith('/v1/feed/shared-atoms'));
  }

  describe('loadFeed (real GET /v1/feed/shared-atoms)', () => {
    it('emits idle initially', () => {
      expect(service.state().status).toBe('idle');
    });

    it('GETs /v1/feed/shared-atoms via the BFF and transitions loading → success', async () => {
      const promise = service.loadFeed();
      const req = expectFeedRequest();
      expect(req.request.method).toBe('GET');
      req.flush({ cards: [WIRE_CARD] });
      await promise;
      expect(service.state().status).toBe('success');
      expect(service.cards().length).toBe(1);
    });

    it('passes limit=20 by default', async () => {
      const promise = service.loadFeed();
      const req = expectFeedRequest();
      expect(req.request.params.get('limit')).toBe('20');
      req.flush({ cards: [] });
      await promise;
    });

    it('passes a custom limit when supplied', async () => {
      const promise = service.loadFeed('tenant', 50);
      const req = expectFeedRequest();
      expect(req.request.params.get('limit')).toBe('50');
      req.flush({ cards: [] });
      await promise;
    });

    it('passes scope param on the request', async () => {
      const promise = service.loadFeed('global');
      const req = expectFeedRequest();
      expect(req.request.params.get('scope')).toBe('global');
      req.flush({ cards: [] });
      await promise;
    });

    it('passes ?cursor when loadMore is called after initial load', async () => {
      await loadFeedWith([WIRE_CARD], 'cursor-page-2');
      const promise = service.loadMore();
      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/v1/feed/shared-atoms') && r.params.get('cursor') === 'cursor-page-2',
      );
      req.flush({ cards: [] });
      await promise;
      expect(service.state().status).toBe('success');
    });

    it('does NOT pass cursor param on the first page', async () => {
      const promise = service.loadFeed();
      const req = expectFeedRequest();
      expect(req.request.params.has('cursor')).toBe(false);
      req.flush({ cards: [] });
      await promise;
    });

    it('exposes wire DTOs verbatim — no fabricated fields', async () => {
      const cards = await loadFeedWith([WIRE_CARD]);
      const c = cards[0];
      expect(c.share_entry_id).toBe(WIRE_CARD.share_entry_id);
      expect(c.author_gcid).toBe(WIRE_CARD.author_gcid);
      expect(c.author_display_name).toBe(WIRE_CARD.author_display_name);
      expect(c.atom_id).toBe(WIRE_CARD.atom_id);
      expect(c.atom_stem_preview).toBe(WIRE_CARD.atom_stem_preview);
      expect(c.license_terms).toBe(WIRE_CARD.license_terms);
      expect(c.reaction_count).toBe(WIRE_CARD.reaction_count);
      expect(c.created_at).toBe(WIRE_CARD.created_at);
    });

    it('threads next_cursor through the service signal', async () => {
      expect(service.nextCursor()).toBe('');
      await loadFeedWith([WIRE_CARD], 'cursor-page-2');
      expect(service.nextCursor()).toBe('cursor-page-2');
    });

    it('renders an empty feed as success with no cards', async () => {
      const cards = await loadFeedWith([]);
      expect(service.state().status).toBe('success');
      expect(cards).toEqual([]);
      expect(service.cards()).toEqual([]);
    });

    it('handles cards without optional caption/royalty_rate', async () => {
      const cards = await loadFeedWith([WIRE_CARD_NO_CAPTION]);
      expect(cards[0].caption).toBeUndefined();
      expect(cards[0].royalty_rate).toBeUndefined();
    });

    it('500 → error state with a cplus.feed i18n key', async () => {
      const promise = service.loadFeed();
      const req = expectFeedRequest();
      req.flush(
        { error: { code: 'INTERNAL', message: 'boom' } },
        { status: 500, statusText: 'Server Error' },
      );
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toMatch(/^cplus\.feed\./);
      }
    });

    it('401 → the not-authenticated key, which asks for a sign-in', async () => {
      const promise = service.loadFeed();
      const req = expectFeedRequest();
      req.flush(
        { error: { code: 'UNAUTHENTICATED', message: 'no session' } },
        { status: 401, statusText: 'Unauthorized' },
      );
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.feed.error_unauthenticated');
      }
    });

    it('403 → the forbidden key, which never asks for a sign-in', async () => {
      const promise = service.loadFeed();
      const req = expectFeedRequest();
      req.flush(
        { error: { code: 'FORBIDDEN', message: 'no' } },
        { status: 403, statusText: 'Forbidden' },
      );
      await promise;
      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.feed.error_forbidden');
      }
    });

    it('404 → error state with the generic feed i18n key', async () => {
      const promise = service.loadFeed();
      const req = expectFeedRequest();
      req.flush(
        { error: { code: 'NOT_FOUND', message: 'nope' } },
        { status: 404, statusText: 'Not Found' },
      );
      await promise;
      const state = service.state();
      if (state.status === 'error') {
        expect(state.error.message).toBe('cplus.feed.error_generic');
      }
    });

    it('returns [] on error (never throws)', async () => {
      const promise = service.loadFeed();
      const req = expectFeedRequest();
      req.flush({}, { status: 500, statusText: 'Server Error' });
      const cards = await promise;
      expect(cards).toEqual([]);
    });
  });
});
