/**
 * StudyService spec — CHO-2217 (WP2 Study surface).
 *
 * Covers:
 * - loadStudyLists(): GET /api/v1/me/learning-paths → success / error
 * - The ADR-233 D2 discriminator is POSITIVE (`source_type === 'collection'`).
 *   The negative form (`!== 'course'`) sweeps every legacy `ad_hoc` path in as
 *   a study list — the BE guards the same invariant in
 *   TestGetMeLearningPaths_StudyListDiscriminatorIsPositive_ADR233_D2.
 * - Fail-loud: 4xx / 5xx / gateway-not-wired map to explicit error keys.
 * - httpMock.verify() asserts no unexpected requests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { StudyService } from './study.service';
import type { MeLearningPath, MeLearningPathListResponse } from './study.model';

const PATH_URL = '/api/v1/me/learning-paths';

const COLLECTION_ID = '30000000-0000-7000-8000-000000000003';
const COURSE_ID = '50000000-0000-7000-8000-000000000009';

function buildPath(overrides: Partial<MeLearningPath> = {}): MeLearningPath {
  return {
    path_id: '60000000-0000-7000-8000-000000000001',
    title: 'OSI model',
    atom_ids: ['70000000-0000-7000-8000-000000000001'],
    current_index: 0,
    total_atoms: 1,
    progress_percent: 0,
    completed: false,
    ...overrides,
  };
}

describe('StudyService', () => {
  let service: StudyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StudyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('GETs /api/v1/me/learning-paths', () => {
    service.loadStudyLists();
    const req = httpMock.expectOne((r) => r.url.endsWith(PATH_URL));
    expect(req.request.method).toBe('GET');
    req.flush({ items: [] } satisfies MeLearningPathListResponse);
  });

  it('keeps ONLY source_type === "collection" (ADR-233 D2 positive discriminator)', () => {
    service.loadStudyLists();
    const req = httpMock.expectOne((r) => r.url.endsWith(PATH_URL));
    req.flush({
      items: [
        buildPath({
          path_id: 'p-collection',
          source_type: 'collection',
          source_id: COLLECTION_ID,
        }),
        buildPath({
          path_id: 'p-course',
          source_type: 'course',
          source_id: COURSE_ID,
          course_id: COURSE_ID,
        }),
        // 🔴 The trap the BE names: a legacy ad_hoc path carries NO course_id,
        // so a `!== "course"` filter admits it as a study list. It is not one.
        buildPath({ path_id: 'p-adhoc', source_type: 'ad_hoc' }),
      ],
    } satisfies MeLearningPathListResponse);

    expect(service.studyLists().map((p) => p.path_id)).toEqual(['p-collection']);
  });

  it('excludes a path whose source_type is absent from the wire (omitempty)', () => {
    // `source_type` is `json:",omitempty"`. A pre-migration row serialises to
    // NOTHING, arriving as undefined. Undefined is not a collection.
    service.loadStudyLists();
    const req = httpMock.expectOne((r) => r.url.endsWith(PATH_URL));
    req.flush({ items: [buildPath({ path_id: 'p-legacy' })] });

    expect(service.studyLists()).toEqual([]);
  });

  it('exposes success state with the filtered items', () => {
    service.loadStudyLists();
    const req = httpMock.expectOne((r) => r.url.endsWith(PATH_URL));
    req.flush({
      items: [buildPath({ source_type: 'collection', source_id: COLLECTION_ID })],
    } satisfies MeLearningPathListResponse);

    const state = service.listState();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.items).toHaveLength(1);
    }
  });

  it('fails loud on 500 (no silent empty list)', () => {
    service.loadStudyLists();
    const req = httpMock.expectOne((r) => r.url.endsWith(PATH_URL));
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    const state = service.listState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.study.error_upstream');
    }
    expect(service.studyLists()).toEqual([]);
  });

  it('maps 401 to an explicit session error key', () => {
    service.loadStudyLists();
    const req = httpMock.expectOne((r) => r.url.endsWith(PATH_URL));
    req.flush({ error: 'nope' }, { status: 401, statusText: 'Unauthorized' });

    const state = service.listState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBe('aplus.study.error_unauthorised');
    }
  });
});
