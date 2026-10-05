import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  HttpParams,
} from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import {
  GrowthEdgesService,
  GrowthEdge,
  GrowthEdgesPage,
  GrowthEdgeUploadJob,
  PendingReviewItem,
} from './growth-edges.service';

const BASE = 'https://api.chora.site/api/v1/me/growth-edges';

function edgeFixture(over: Partial<GrowthEdge> = {}): GrowthEdge {
  return {
    id: 'e1',
    concept_key: 'multiplication-tables',
    concept_label: 'Multiplication Tables',
    category: 'Arithmetic',
    tags: ['math', 'multiplication'],
    strength: 0.8,
    sources: ['explicit'],
    descriptor: { summary: 'shaky on 7x8' },
    cached_drill_atom_ids: [],
    status: 'active',
    first_seen_at: '2026-06-10T00:00:00Z',
    last_evidenced_at: '2026-06-10T00:00:00Z',
    ...over,
  };
}

describe('GrowthEdgesService', () => {
  let service: GrowthEdgesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GrowthEdgesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GET list with no params hits the BFF path', () => {
    let page: GrowthEdgesPage | undefined;
    service.list().subscribe((p) => (page = p));
    const req = http.expectOne((r) => r.url === BASE && r.method === 'GET');
    expect(req.request.params.keys().length).toBe(0);
    req.flush({ items: [edgeFixture()], next_page_token: undefined });
    expect(page?.items[0].concept_label).toBe('Multiplication Tables');
  });

  it('GET list serialises filter/sort/page query params', () => {
    service
      .list({
        min_strength: 0.3,
        include_grown: true,
        sort: 'strength_desc',
        page_size: 20,
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === BASE);
    const p: HttpParams = req.request.params;
    expect(p.get('min_strength')).toBe('0.3');
    expect(p.get('include_grown')).toBe('true');
    expect(p.get('sort')).toBe('strength_desc');
    expect(p.get('page_size')).toBe('20');
    req.flush({ items: [] });
  });

  it('listAll follows next_page_token across pages and accumulates items', () => {
    let page: GrowthEdgesPage | undefined;
    service
      .listAll({ sort: 'strength_desc', include_grown: true })
      .subscribe((p) => (page = p));

    // Page 1: carries a token → service auto-fetches page 2.
    const r1 = http.expectOne((r) => r.url === BASE && !r.params.has('page_token'));
    expect(r1.request.params.get('sort')).toBe('strength_desc');
    expect(r1.request.params.get('include_grown')).toBe('true');
    r1.flush({ items: [edgeFixture({ id: 'e1' })], next_page_token: 'tok-2' });

    // Page 2: same filters carried forward + the cursor; no token → last page.
    const r2 = http.expectOne(
      (r) => r.url === BASE && r.params.get('page_token') === 'tok-2',
    );
    expect(r2.request.params.get('sort')).toBe('strength_desc');
    r2.flush({ items: [edgeFixture({ id: 'e2' })] });

    expect(page?.items.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(page?.next_page_token).toBeUndefined();
  });

  it('listAll stops after one request when there is no next_page_token', () => {
    let page: GrowthEdgesPage | undefined;
    service.listAll().subscribe((p) => (page = p));
    const req = http.expectOne((r) => r.url === BASE);
    req.flush({ items: [edgeFixture()] }); // no token
    expect(page?.items.length).toBe(1);
    // afterEach http.verify() asserts no second request was issued.
  });

  it('GET read one edge', () => {
    service.read('e1').subscribe();
    const req = http.expectOne(`${BASE}/e1`);
    expect(req.request.method).toBe('GET');
    req.flush(edgeFixture());
  });

  it('DELETE dismisses an edge', () => {
    service.dismiss('e1').subscribe();
    const req = http.expectOne(`${BASE}/e1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('POST upload sends multipart FormData with file + upload_kind + context', () => {
    const file = new File(['marks'], 'past-test.png', { type: 'image/png' });
    let job: GrowthEdgeUploadJob | undefined;
    service
      .upload(file, 'marked_test', 'P6 math')
      .subscribe((j) => (job = j));
    const req = http.expectOne(`${BASE}/uploads`);
    expect(req.request.method).toBe('POST');
    const form = req.request.body as FormData;
    expect(form instanceof FormData).toBe(true);
    expect(form.get('file')).toBeInstanceOf(File);
    expect(form.get('upload_kind')).toBe('marked_test');
    expect(form.get('context_hint')).toBe('P6 math');
    // The browser sets the multipart Content-Type/boundary — we must NOT set it.
    expect(req.request.headers.has('Content-Type')).toBe(false);
    req.flush(
      { upload_id: 'u1', status: 'QUEUED' },
      { status: 202, statusText: 'Accepted' },
    );
    expect(job?.status).toBe('QUEUED');
  });

  it('POST upload omits empty context_hint', () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    service.upload(file, 'notes', '   ').subscribe();
    const req = http.expectOne(`${BASE}/uploads`);
    const form = req.request.body as FormData;
    expect(form.get('context_hint')).toBeNull();
    req.flush({ upload_id: 'u2', status: 'QUEUED' });
  });

  it('POST upload sends goal_id + concept_id for a goal-scoped diagnose (ADR-238)', () => {
    // goalId + conceptId append AFTER the legacy contextHint arg (back-compat with
    // the existing 3-arg contextHint caller above), so pass undefined for it here.
    const file = new File(['marks'], 'past-test.png', { type: 'image/png' });
    let job: GrowthEdgeUploadJob | undefined;
    service
      .upload(file, 'marked_test', undefined, 'g-1', 'c-1')
      .subscribe((j) => (job = j));
    const req = http.expectOne(`${BASE}/uploads`);
    expect(req.request.method).toBe('POST');
    const form = req.request.body as FormData;
    expect(form.get('goal_id')).toBe('g-1');
    expect(form.get('concept_id')).toBe('c-1');
    expect(form.get('upload_kind')).toBe('marked_test');
    // No inline Content-Type — the browser stamps the multipart boundary.
    expect(req.request.headers.has('Content-Type')).toBe(false);
    req.flush(
      { upload_id: 'u3', status: 'QUEUED' },
      { status: 202, statusText: 'Accepted' },
    );
    expect(job?.status).toBe('QUEUED');
  });

  it('POST upload omits goal_id/concept_id when not supplied (back-compat)', () => {
    const file = new File(['x'], 'scribble.png', { type: 'image/png' });
    service.upload(file, 'scribble').subscribe();
    const req = http.expectOne(`${BASE}/uploads`);
    const form = req.request.body as FormData;
    expect(form.get('goal_id')).toBeNull();
    expect(form.get('concept_id')).toBeNull();
    req.flush({ upload_id: 'u4', status: 'QUEUED' });
  });

  it('GET poll an upload job', () => {
    let job: GrowthEdgeUploadJob | undefined;
    service.pollUpload('u1').subscribe((j) => (job = j));
    const req = http.expectOne(`${BASE}/uploads/u1`);
    expect(req.request.method).toBe('GET');
    req.flush({
      upload_id: 'u1',
      status: 'COMPLETED',
      upserted_growth_edge_ids: ['e1', 'e2'],
    });
    expect(job?.status).toBe('COMPLETED');
    expect(job?.upserted_growth_edge_ids?.length).toBe(2);
  });

  // ── listAwaitingReview (C4 slice 2 item 2) ──────────────────────────
  //
  // The collection is read-only as `?status=awaiting_review`: the handler
  // REFUSES a bare GET (growth_edge_pending_reviews.go:59), because answering
  // it would be the learner's whole upload history, a much larger read nothing
  // renders. So the query is fixed here rather than being a caller's choice,
  // and there is nothing for a caller to get wrong.

  it('GETs the parked diagnoses with the status filter the handler requires', () => {
    let items: readonly PendingReviewItem[] | undefined;
    service.listAwaitingReview().subscribe((i) => (items = i));

    const req = http.expectOne((r) => r.url === `${BASE}/uploads`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('awaiting_review');

    req.flush({
      items: [
        {
          upload_id: 'u-1',
          upload_kind: 'marked_test',
          status: 'AWAITING_REVIEW',
          goal_id: 'g-1',
          created_at: '2026-09-01T00:00:00Z',
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items?.[0].upload_id).toBe('u-1');
    expect(items?.[0].goal_id).toBe('g-1');
  });

  it('returns an empty list, never undefined, when nothing is parked', () => {
    // A learner with no parked diagnosis is the common case, and a caller that
    // has to guard against undefined will eventually forget to.
    let items: readonly PendingReviewItem[] | undefined;
    service.listAwaitingReview().subscribe((i) => (items = i));
    http.expectOne((r) => r.url === `${BASE}/uploads`).flush({});
    expect(items).toEqual([]);
  });

  it('does not send a goal filter the collection does not accept', () => {
    // Goal scoping is the CALLER's, done on goal_id in the payload: the handler
    // takes only ?status, so sending anything else would be a query parameter
    // no route reads.
    service.listAwaitingReview().subscribe();
    const req = http.expectOne((r) => r.url === `${BASE}/uploads`);
    expect(req.request.params.keys()).toEqual(['status']);
    req.flush({ items: [] });
  });

});
