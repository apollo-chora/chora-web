import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AtomService, AtomFilterParams } from './atom.service';
import { environment } from '../../../../environments/environment';
import type { LearningAtom, ValidationResult, AtomConnection } from '../models/atom.models';

function buildAtom(overrides: Partial<LearningAtom> = {}): LearningAtom {
  return {
    id: 'atom-001',
    tenant_id: 'tenant-001',
    atom_type: 'multiple_choice',
    difficulty: 3,
    language_code: 'en',
    tags: ['math', 'algebra'],
    status: 'published',
    created_by: 'gcid-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    latest_revision: {
      id: 'rev-001',
      atom_id: 'atom-001',
      revision_number: 1,
      content: { stem: 'What is 2+2?', options: [{ id: 1, text: '4' }] },
      validation_rules: [{
        rule_type: 'exact_match',
        expected: '1',
        tolerance: null,
        case_sensitive: false,
      }],
      published_at: '2026-01-01T12:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

describe('AtomService', () => {
  let service: AtomService;
  let httpMock: HttpTestingController;
  const baseUrl = environment.bffBaseUrl;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AtomService,
      ],
    });
    service = TestBed.inject(AtomService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts with idle atom state', () => {
    expect(service.atomState()).toEqual({ status: 'idle' });
  });

  it('starts with idle list state', () => {
    expect(service.listState()).toEqual({ status: 'idle' });
  });

  it('starts with idle validation state', () => {
    expect(service.validationState()).toEqual({ status: 'idle' });
  });

  it('currentAtom is null when idle', () => {
    expect(service.currentAtom()).toBeNull();
  });

  it('atoms is empty when idle', () => {
    expect(service.atoms()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // loadAtom (REST — GET /api/v1/atoms/{id})
  // -------------------------------------------------------------------------

  describe('loadAtom', () => {
    it('sets loading state then success on valid response', () => {
      let result: LearningAtom | null = null;
      service.loadAtom('atom-001').subscribe((a) => (result = a));

      expect(service.atomState().status).toBe('loading');

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001`);
      expect(req.request.method).toBe('GET');

      req.flush(buildAtom());

      expect(service.atomState().status).toBe('success');
      expect(result).toBeTruthy();
      expect(result!.id).toBe('atom-001');
      expect(result!.atom_type).toBe('multiple_choice');
      expect(result!.status).toBe('published');
      expect(result!.latest_revision).toBeTruthy();
      expect(result!.latest_revision!.revision_number).toBe(1);
    });

    it('returns atom data in snake_case format', () => {
      let result: LearningAtom | null = null;
      service.loadAtom('atom-001').subscribe((a) => (result = a));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001`);
      req.flush(buildAtom());

      expect(result!.tenant_id).toBe('tenant-001');
      expect(result!.language_code).toBe('en');
      expect(result!.created_by).toBe('gcid-001');
      expect(result!.latest_revision!.atom_id).toBe('atom-001');
      expect(result!.latest_revision!.validation_rules[0].rule_type).toBe('exact_match');
      expect(result!.latest_revision!.validation_rules[0].case_sensitive).toBe(false);
    });

    it('sets error state when atom is null', () => {
      service.loadAtom('not-found').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/not-found`);
      req.flush(null);

      expect(service.atomState().status).toBe('error');
      const state = service.atomState();
      if (state.status === 'error') {
        expect(state.error.code).toBe('ATOM_NOT_FOUND');
      }
    });

    it('sets error state on network error', () => {
      service.loadAtom('atom-001').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001`);
      req.error(new ProgressEvent('error'));

      expect(service.atomState().status).toBe('error');
    });

    it('handles atom with no latest revision', () => {
      let result: LearningAtom | null = null;
      service.loadAtom('atom-002').subscribe((a) => (result = a));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-002`);
      req.flush(buildAtom({ id: 'atom-002', latest_revision: null }));

      expect(result!.latest_revision).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // loadAtoms (REST — GET /api/v1/atoms)
  // -------------------------------------------------------------------------

  describe('loadAtoms', () => {
    it('sends filter params as query string', () => {
      const params: AtomFilterParams = {
        topicId: 'topic-001',
        atomType: 'multiple_choice',
        difficulty: 3,
        status: 'published',
        cursor: 'cursor-abc',
        limit: 10,
      };
      service.loadAtoms(params).subscribe();

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/atoms'));
      expect(req.request.method).toBe('GET');

      req.flush({
        data: [],
        page_info: { has_next: false },
      });
    });

    it('maps atom list response correctly', () => {
      service.loadAtoms().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms`);
      req.flush({
        data: [
          buildAtom({ id: 'a1' }),
          buildAtom({ id: 'a2' }),
        ],
        page_info: { has_next: true, cursor: 'c2' },
      });

      expect(service.listState().status).toBe('success');
      expect(service.atoms()).toHaveLength(2);
      expect(service.atoms()[0].id).toBe('a1');
      expect(service.atoms()[1].id).toBe('a2');

      const state = service.listState();
      if (state.status === 'success') {
        expect(state.pageInfo.has_next_page).toBe(true);
      }
    });

    it('handles empty atom list', () => {
      service.loadAtoms().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms`);
      req.flush({
        data: [],
        page_info: { has_next: false },
      });

      expect(service.atoms()).toEqual([]);
    });

    it('sets error on network failure', () => {
      service.loadAtoms().subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms`);
      req.error(new ProgressEvent('error'));

      expect(service.listState().status).toBe('error');
    });

    // --- branch: res.data ?? [] when `data` is absent (nullish arm) ---
    it('defaults to empty atoms when response omits data field', () => {
      let result: AtomConnection | null = null;
      service.loadAtoms().subscribe((c) => (result = c));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms`);
      // No `data` key at all -> res.data ?? [] takes the [] arm.
      req.flush({ page_info: { has_next: true } });

      expect(service.listState().status).toBe('success');
      expect(service.atoms()).toEqual([]);
      expect(result).toBeTruthy();
      expect(result!.edges).toEqual([]);
      expect(result!.total_count).toBe(0);
      // atoms.length > 0 ? ... : null -> FALSE arm for both cursors
      expect(result!.page_info.start_cursor).toBeNull();
      expect(result!.page_info.end_cursor).toBeNull();
      // page_info present, has_next true -> ?? passes through truthy
      expect(result!.page_info.has_next_page).toBe(true);
    });

    // --- branch: res.page_info?.has_next short-circuit when page_info absent ---
    it('defaults has_next_page to false when page_info is omitted (optional-chain short-circuit)', () => {
      let result: AtomConnection | null = null;
      service.loadAtoms().subscribe((c) => (result = c));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms`);
      // No `page_info` -> res.page_info?.has_next is undefined -> ?? false.
      req.flush({ data: [buildAtom({ id: 'solo' })] });

      expect(result).toBeTruthy();
      expect(result!.page_info.has_next_page).toBe(false);
      // non-empty atoms -> cursor TRUE arms
      expect(result!.page_info.start_cursor).toBe('solo');
      expect(result!.page_info.end_cursor).toBe('solo');
      expect(result!.total_count).toBe(1);
    });

    // --- branch: page_info present but has_next absent -> ?? false fallback ---
    it('defaults has_next_page to false when page_info lacks has_next', () => {
      let result: AtomConnection | null = null;
      service.loadAtoms({ topicId: 'only-topic' }).subscribe((c) => (result = c));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms?topic_id=only-topic`);
      req.flush({ data: [buildAtom({ id: 'x1' }), buildAtom({ id: 'x2' })], page_info: {} });

      expect(result).toBeTruthy();
      // page_info present but has_next undefined -> ?? false
      expect(result!.page_info.has_next_page).toBe(false);
      expect(result!.page_info.start_cursor).toBe('x1');
      expect(result!.page_info.end_cursor).toBe('x2');
    });

    // --- branch: each individual filter guard exercised in isolation ---
    it('appends only the difficulty filter when only difficulty is set', () => {
      service.loadAtoms({ difficulty: 5 }).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms?difficulty=5`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: [], page_info: { has_next: false } });
    });

    it('appends only the cursor filter when only cursor is set', () => {
      service.loadAtoms({ cursor: 'cur-42' }).subscribe();
      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms?cursor=cur-42`);
      expect(req.request.method).toBe('GET');
      req.flush({ data: [], page_info: { has_next: false } });
    });
  });

  // -------------------------------------------------------------------------
  // validateAnswer (REST — POST /api/v1/atoms/{atomId}/validate)
  // -------------------------------------------------------------------------

  describe('validateAnswer', () => {
    it('sends POST with correct body', () => {
      service.validateAnswer('atom-001', {
        answer: { selected_option: 1 },
        revision_id: 'rev-001',
        time_spent_seconds: 30,
      }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001/validate`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.answer).toEqual({ selected_option: 1 });

      req.flush({
        correct: true,
        atom_id: 'atom-001',
        revision_id: 'rev-001',
        explanation: 'Correct! 2+2=4',
        expected_answer: { selected_option: 1 },
        confidence: null,
        rule_type: 'exact_match',
      } as ValidationResult);
    });

    it('maps validation result from REST response', () => {
      let result: ValidationResult | null = null;
      service.validateAnswer('atom-001', {
        answer: { selected_option: 1 },
      }).subscribe((r) => (result = r));

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001/validate`);
      req.flush({
        correct: true,
        atom_id: 'atom-001',
        revision_id: 'rev-001',
        explanation: 'Well done!',
        expected_answer: null,
        confidence: null,
        rule_type: 'exact_match',
      } as ValidationResult);

      expect(result).toBeTruthy();
      expect(result!.correct).toBe(true);
      expect(result!.atom_id).toBe('atom-001');
      expect(result!.rule_type).toBe('exact_match');
      expect(service.validationState().status).toBe('success');
    });

    it('sets submitting state before response', () => {
      service.validateAnswer('atom-001', { answer: {} }).subscribe();
      expect(service.validationState().status).toBe('submitting');

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001/validate`);
      req.flush({
        correct: false,
        atom_id: 'atom-001',
        revision_id: 'rev-001',
        explanation: null,
        expected_answer: null,
        confidence: null,
        rule_type: 'exact_match',
      } as ValidationResult);
    });

    it('sets error on failure', () => {
      service.validateAnswer('atom-001', { answer: {} }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001/validate`);
      req.error(new ProgressEvent('error'));

      expect(service.validationState().status).toBe('error');
    });
  });

  // -------------------------------------------------------------------------
  // validateAnswerRest
  // -------------------------------------------------------------------------

  describe('validateAnswerRest', () => {
    it('posts to REST endpoint', () => {
      service.validateAnswerRest('atom-001', {
        answer: { selected_option: 2 },
      }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001/validate`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.answer).toEqual({ selected_option: 2 });

      req.flush({
        correct: false,
        atom_id: 'atom-001',
        revision_id: 'rev-001',
        explanation: 'Incorrect',
        expected_answer: { selected_option: 1 },
        confidence: null,
        rule_type: 'exact_match',
      } as ValidationResult);

      expect(service.validationState().status).toBe('success');
    });
  });

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  describe('state reset', () => {
    it('resetAtomState returns to idle', () => {
      service.loadAtom('atom-001').subscribe();
      const req = httpMock.expectOne(`${baseUrl}/api/v1/atoms/atom-001`);
      req.flush(buildAtom());

      expect(service.atomState().status).toBe('success');
      service.resetAtomState();
      expect(service.atomState().status).toBe('idle');
      expect(service.currentAtom()).toBeNull();
    });

    it('resetListState returns to idle', () => {
      service.resetListState();
      expect(service.listState()).toEqual({ status: 'idle' });
    });

    it('resetValidationState returns to idle', () => {
      service.resetValidationState();
      expect(service.validationState()).toEqual({ status: 'idle' });
    });
  });
});
