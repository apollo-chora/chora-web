import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminAtomService } from './admin-atom.service';
import { environment } from '../../../../../environments/environment';
import type {
  AdminAtom,
  AdminAtomListResponse,
  AtomRevision,
  RevisionListResponse,
  CreateAtomRequest,
  UpdateAtomRequest,
  CreateRevisionRequest,
} from '../models/admin-atom.model';

function buildAdminAtom(overrides: Partial<AdminAtom> = {}): AdminAtom {
  return {
    id: 'atom-001',
    tenant_id: 'tenant-001',
    atom_type: 'multiple_choice',
    difficulty: 3,
    language_code: 'en',
    tags: ['math', 'algebra'],
    status: 'draft',
    created_by: 'gcid-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    latest_revision: null,
    ...overrides,
  };
}

function buildRevision(overrides: Partial<AtomRevision> = {}): AtomRevision {
  return {
    id: 'rev-001',
    atom_id: 'atom-001',
    revision_number: 1,
    content: { stem: 'What is 2+2?', options: [{ id: 1, text: '4', is_correct: true }] },
    validation_rules: [{ rule_type: 'exact_match', expected: '1', tolerance: null, case_sensitive: false }],
    visibility_status: 'published',
    metadata: null,
    published_at: '2026-01-01T12:00:00Z',
    created_by: 'gcid-001',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('AdminAtomService', () => {
  let service: AdminAtomService;
  let httpMock: HttpTestingController;
  const baseUrl = environment.bffBaseUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AdminAtomService,
      ],
    });
    service = TestBed.inject(AdminAtomService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // getAtoms
  // -------------------------------------------------------------------------

  describe('getAtoms', () => {
    it('sends GET to /api/v1/atoms with no params', () => {
      service.getAtoms().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: [], page_info: { next_cursor: null, has_next: false } });
    });

    it('sends query params when provided', () => {
      service.getAtoms({
        cursor: 'cursor-abc',
        limit: 10,
        atom_type: 'multiple_choice',
        status: 'draft',
        topic_id: 'topic-001',
        difficulty: 3,
      }).subscribe();

      const req = httpMock.expectOne((r) =>
        r.url === `${baseUrl}/api/v1/atoms` && r.method === 'GET',
      );
      expect(req.request.params.get('cursor')).toBe('cursor-abc');
      expect(req.request.params.get('limit')).toBe('10');
      expect(req.request.params.get('atom_type')).toBe('multiple_choice');
      expect(req.request.params.get('status')).toBe('draft');
      expect(req.request.params.get('topic_id')).toBe('topic-001');
      expect(req.request.params.get('difficulty')).toBe('3');

      req.flush({
        data: [buildAdminAtom()],
        page_info: { next_cursor: 'cursor-next', has_next: true },
      } as AdminAtomListResponse);
    });

    it('returns atom list response', () => {
      let result: AdminAtomListResponse | undefined;
      service.getAtoms().subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms`);
      const response: AdminAtomListResponse = {
        data: [buildAdminAtom({ id: 'a1' }), buildAdminAtom({ id: 'a2' })],
        page_info: { next_cursor: 'c2', has_next: true },
      };
      req.flush(response);

      expect(result).toBeTruthy();
      expect(result!.data).toHaveLength(2);
      expect(result!.data[0].id).toBe('a1');
      expect(result!.page_info.has_next).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getAtom
  // -------------------------------------------------------------------------

  describe('getAtom', () => {
    it('sends GET to /api/v1/atoms/{id}', () => {
      let result: AdminAtom | undefined;
      service.getAtom('atom-001').subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001`);
      expect(req.request.method).toBe('GET');
      req.flush(buildAdminAtom());

      expect(result).toBeTruthy();
      expect(result!.id).toBe('atom-001');
    });

    it('encodes the atom ID', () => {
      service.getAtom('atom/special').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom%2Fspecial`);
      req.flush(buildAdminAtom({ id: 'atom/special' }));
    });
  });

  // -------------------------------------------------------------------------
  // createAtom
  // -------------------------------------------------------------------------

  describe('createAtom', () => {
    it('sends POST to /api/v1/atoms', () => {
      const request: CreateAtomRequest = {
        atom_type: 'fill_blank',
        difficulty: 2,
        language_code: 'en',
        tags: ['science'],
      };

      let result: AdminAtom | undefined;
      service.createAtom(request).subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(request);

      req.flush(buildAdminAtom({ atom_type: 'fill_blank', difficulty: 2 }));

      expect(result).toBeTruthy();
      expect(result!.atom_type).toBe('fill_blank');
    });
  });

  // -------------------------------------------------------------------------
  // updateAtom
  // -------------------------------------------------------------------------

  describe('updateAtom', () => {
    it('sends PUT to /api/v1/atoms/{id}', () => {
      const request: UpdateAtomRequest = {
        difficulty: 4,
        tags: ['updated'],
      };

      let result: AdminAtom | undefined;
      service.updateAtom('atom-001', request).subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(request);

      req.flush(buildAdminAtom({ difficulty: 4, tags: ['updated'] }));

      expect(result!.difficulty).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // deleteAtom
  // -------------------------------------------------------------------------

  describe('deleteAtom', () => {
    it('sends DELETE to /api/v1/atoms/{id}', () => {
      let completed = false;
      service.deleteAtom('atom-001').subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });

      expect(completed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // publishRevision
  // -------------------------------------------------------------------------

  describe('publishRevision', () => {
    it('sends POST to /api/v1/atoms/{atomId}/revisions/{revisionId}/publish', () => {
      let result: AtomRevision | undefined;
      service.publishRevision('atom-001', 'rev-001').subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001/revisions/rev-001/publish`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});

      req.flush(buildRevision({ visibility_status: 'published' }));

      expect(result).toBeTruthy();
      expect(result!.visibility_status).toBe('published');
    });
  });

  // -------------------------------------------------------------------------
  // createRevision
  // -------------------------------------------------------------------------

  describe('createRevision', () => {
    it('sends POST to /api/v1/atoms/{atomId}/revisions', () => {
      const request: CreateRevisionRequest = {
        content: { stem: 'New question', options: [] },
        validation_rules: [{ rule_type: 'exact_match', expected: '42', tolerance: null, case_sensitive: false }],
        publish: false,
      };

      let result: AtomRevision | undefined;
      service.createRevision('atom-001', request).subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001/revisions`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(request);

      req.flush(buildRevision({ revision_number: 2, visibility_status: 'draft' }));

      expect(result).toBeTruthy();
      expect(result!.revision_number).toBe(2);
      expect(result!.visibility_status).toBe('draft');
    });
  });

  // -------------------------------------------------------------------------
  // getRevisions
  // -------------------------------------------------------------------------

  describe('getRevisions', () => {
    it('sends GET to /api/v1/atoms/{atomId}/revisions', () => {
      let result: RevisionListResponse | undefined;
      service.getRevisions('atom-001').subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001/revisions`);
      expect(req.request.method).toBe('GET');

      const response: RevisionListResponse = {
        data: [buildRevision({ revision_number: 2 }), buildRevision({ revision_number: 1 })],
        page_info: { next_cursor: null, has_next: false },
      };
      req.flush(response);

      expect(result).toBeTruthy();
      expect(result!.data).toHaveLength(2);
      expect(result!.data[0].revision_number).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // getAtomProjection (CHO-1638) — learner-safe atom projection, unwrapped
  // -------------------------------------------------------------------------

  describe('getAtomProjection', () => {
    it('GETs /api/atoms/{id} and unwraps the { atom } envelope', () => {
      let result: { mcq_payload?: { question_id: string } | null } | undefined;
      service.getAtomProjection('atom-001').subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/atoms/atom-001`);
      expect(req.request.method).toBe('GET');
      req.flush({
        atom: {
          atom_id: 'atom-001',
          atom_type: 'multiple_choice',
          mcq_payload: { question_id: 'q-001', prompt: 'What is 2+2?' },
        },
      });

      expect(result?.mcq_payload?.question_id).toBe('q-001');
    });
  });

  // -------------------------------------------------------------------------
  // getQuestionImages (CHO-1638) — author question projection illustrations
  // -------------------------------------------------------------------------

  describe('getQuestionImages', () => {
    it('GETs /api/atoms/{id}/questions/{qid} and maps the mcq image URLs', () => {
      let result: { image_url: string | null; answer_image_url: string | null } | undefined;
      service.getQuestionImages('atom-001', 'q-001').subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/atoms/atom-001/questions/q-001`);
      expect(req.request.method).toBe('GET');
      req.flush({
        question: { mcq: { image_url: 'https://media/q.png', answer_image_url: 'https://media/a.png' } },
      });

      expect(result).toEqual({
        image_url: 'https://media/q.png',
        answer_image_url: 'https://media/a.png',
      });
    });

    it('maps missing illustrations to null', () => {
      let result: { image_url: string | null; answer_image_url: string | null } | undefined;
      service.getQuestionImages('atom-001', 'q-001').subscribe((r) => (result = r));

      httpMock.expectOne(`${baseUrl}/api/atoms/atom-001/questions/q-001`).flush({});

      expect(result).toEqual({ image_url: null, answer_image_url: null });
    });
  });
});
