/**
 * LiveQuizEntitySearchPort unit spec (CHO-2134). Exercises the real
 * BffClientService HTTP leg via HttpTestingController against the absolute
 * environment.bffBaseUrl URL (house convention). Confirms the port hits the
 * live-quizzes list route with the `q` title filter, maps `{id,title,state}` →
 * EntityRef{id,label,sublabel}, treats the response as a FLAT (unpaginated)
 * list (nextCursor = null; never a page_token), and fails loud on an HTTP error.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../../../../environments/environment';
import { LiveQuizEntitySearchPort } from './live-quiz-entity-search.port';
import type {
  EntityRef,
  EntitySearchPage,
} from '../../../../../shared/components/chora-entity-picker/entity-picker.model';

const BASE = environment.bffBaseUrl;
const LIVE_QUIZZES_URL = `${BASE}/api/v1/live-quizzes`;

describe('LiveQuizEntitySearchPort', () => {
  let port: LiveQuizEntitySearchPort;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    port = TestBed.inject(LiveQuizEntitySearchPort);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('declares the live_quiz entityType', () => {
    expect(port.entityType).toBe('live_quiz');
  });

  it('searches live-quizzes with q and maps {id,title,state} → EntityRef', () => {
    let page: EntitySearchPage | undefined;
    port.search('scrum', {}, null).subscribe((p) => (page = p));

    const req = httpMock.expectOne(
      (r) => r.method === 'GET' && r.url === LIVE_QUIZZES_URL,
    );
    expect(req.request.params.get('q')).toBe('scrum');
    // Flat, unpaginated list contract — never a page cursor / size param.
    expect(req.request.params.has('page_token')).toBe(false);
    expect(req.request.params.has('page_size')).toBe(false);

    req.flush({
      items: [
        { id: 'lq-1', title: 'CSPO Sprint Planning', state: 'PUBLISHED' },
        { id: 'lq-2', title: '', state: 'DRAFT' },
      ],
    });

    expect(page?.items).toEqual<EntityRef[]>([
      { id: 'lq-1', label: 'CSPO Sprint Planning', sublabel: 'PUBLISHED' },
      { id: 'lq-2', label: 'lq-2', sublabel: 'DRAFT' },
    ]);
  });

  it('treats the flat (unpaginated) response as a single page — nextCursor null', () => {
    let page: EntitySearchPage | undefined;
    port.search('daily', {}, null).subscribe((p) => (page = p));
    httpMock
      .expectOne((r) => r.url === LIVE_QUIZZES_URL)
      .flush({ items: [{ id: 'lq-9', title: 'Daily Standup', state: 'DRAFT' }] });
    expect(page?.nextCursor).toBeNull();
  });

  it('ignores the forward cursor (flat list has no pagination)', () => {
    port.search('bob', {}, 'cur-1').subscribe();
    const req = httpMock.expectOne((r) => r.url === LIVE_QUIZZES_URL);
    expect(req.request.params.has('page_token')).toBe(false);
    req.flush({ items: [] });
  });

  it('propagates a search error (fail-loud, never a silent empty page)', () => {
    let errored = false;
    port.search('err', {}, null).subscribe({ error: () => (errored = true) });
    httpMock
      .expectOne((r) => r.url === LIVE_QUIZZES_URL)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    expect(errored).toBe(true);
  });

  it('resolve returns id-as-label best-effort (no batch endpoint, no fabricated titles)', () => {
    let rows: readonly EntityRef[] | undefined;
    port.resolve(['lq-1', 'lq-2']).subscribe((r) => (rows = r));
    // Synchronous best-effort mapping — no HTTP (afterEach verify() asserts none).
    expect(rows).toEqual<EntityRef[]>([
      { id: 'lq-1', label: 'lq-1' },
      { id: 'lq-2', label: 'lq-2' },
    ]);
  });
});
