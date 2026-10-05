/**
 * CourseContentService spec — CHO-1612.
 *
 * Verifies:
 *   1. getMyCourseContent hits GET /api/v1/me/courses/{id}/content
 *   2. listContent hits GET /api/v1/courses/{id}/content
 *   3. addItem POSTs { kind, ref, title } to /api/v1/courses/{id}/content
 *   4. removeItem DELETEs /api/v1/courses/{id}/content/{itemId}
 *   5. reorder POSTs { ordered_item_ids } to .../reorder
 *   6. URL-encodes course IDs with special characters
 *   7. Response is forwarded as-is to the caller
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { CourseContentService } from './course-content.service';
import { environment } from '../../../../environments/environment';
import type { CourseContentResponse } from './course-content.model';

const BASE = environment.bffBaseUrl;
const COURSE_ID = 'c5301-0000-7000-8000-000000000001';

function buildResponse(
  overrides: Partial<CourseContentResponse> = {},
): CourseContentResponse {
  return {
    course_id: COURSE_ID,
    items: [],
    ...overrides,
  };
}

describe('CourseContentService', () => {
  let service: CourseContentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourseContentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ── getMyCourseContent ─────────────────────────────────────────────────

  describe('getMyCourseContent()', () => {
    it('issues GET /api/v1/me/courses/{courseId}/content', async () => {
      const promise = firstValueFrom(service.getMyCourseContent(COURSE_ID));
      const req = httpMock.expectOne(
        `${BASE}/api/v1/me/courses/${COURSE_ID}/content`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(buildResponse());
      await promise;
    });

    it('returns the BFF response envelope', async () => {
      const body = buildResponse({
        items: [
          {
            item_id: 'item-1',
            kind: 'atom',
            ref: '01000000-0000-7000-8000-000000000001',
            title: 'Intro',
            position: 1,
          },
        ],
      });
      const promise = firstValueFrom(service.getMyCourseContent(COURSE_ID));
      httpMock
        .expectOne(`${BASE}/api/v1/me/courses/${COURSE_ID}/content`)
        .flush(body);
      const result = await promise;
      expect(result.items.length).toBe(1);
      expect(result.items[0]!.kind).toBe('atom');
    });

    it('url-encodes courseId with special characters', async () => {
      const promise = firstValueFrom(
        service.getMyCourseContent('weird id/with space'),
      );
      httpMock
        .expectOne(
          `${BASE}/api/v1/me/courses/weird%20id%2Fwith%20space/content`,
        )
        .flush(buildResponse({ course_id: 'weird id/with space' }));
      await promise;
    });
  });

  // ── listContent ────────────────────────────────────────────────────────

  describe('listContent()', () => {
    it('issues GET /api/v1/courses/{courseId}/content', async () => {
      const promise = firstValueFrom(service.listContent(COURSE_ID));
      const req = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(buildResponse());
      await promise;
    });

    it('url-encodes courseId', async () => {
      const promise = firstValueFrom(service.listContent('id with spaces'));
      httpMock
        .expectOne(`${BASE}/api/v1/courses/id%20with%20spaces/content`)
        .flush(buildResponse());
      await promise;
    });
  });

  // ── addItem ────────────────────────────────────────────────────────────

  describe('addItem()', () => {
    it('POSTs { kind, ref, title } to /api/v1/courses/{courseId}/content', async () => {
      const promise = firstValueFrom(
        service.addItem(COURSE_ID, {
          kind: 'atom',
          ref: '01000000-0000-7000-8000-000000000099',
          title: 'New Atom',
        }),
      );
      const req = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        kind: 'atom',
        ref: '01000000-0000-7000-8000-000000000099',
        title: 'New Atom',
      });
      req.flush(buildResponse());
      await promise;
    });

    it('supports all ContentKind values', async () => {
      const kinds = [
        'atom',
        'video',
        'youtube',
        'document',
        'live_classroom',
        'assessment',
      ] as const;
      for (const kind of kinds) {
        const promise = firstValueFrom(
          service.addItem(COURSE_ID, { kind, ref: 'ref', title: 'T' }),
        );
        httpMock
          .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content`)
          .flush(buildResponse());
        const result = await promise;
        expect(result.course_id).toBe(COURSE_ID);
      }
    });
  });

  // ── removeItem ─────────────────────────────────────────────────────────

  describe('removeItem()', () => {
    it('issues DELETE /api/v1/courses/{courseId}/content/{itemId}', async () => {
      const promise = firstValueFrom(
        service.removeItem(COURSE_ID, 'item-abc'),
      );
      const req = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content/item-abc`,
      );
      expect(req.request.method).toBe('DELETE');
      req.flush(buildResponse());
      await promise;
    });

    it('url-encodes itemId', async () => {
      const promise = firstValueFrom(
        service.removeItem(COURSE_ID, 'item with/slash'),
      );
      httpMock
        .expectOne(
          `${BASE}/api/v1/courses/${COURSE_ID}/content/item%20with%2Fslash`,
        )
        .flush(buildResponse());
      await promise;
    });
  });

  // ── reorder ────────────────────────────────────────────────────────────

  describe('reorder()', () => {
    it('POSTs { ordered_item_ids } to .../content/reorder', async () => {
      const orderedIds = ['item-2', 'item-1', 'item-3'];
      const promise = firstValueFrom(service.reorder(COURSE_ID, orderedIds));
      const req = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content/reorder`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ ordered_item_ids: orderedIds });
      req.flush(buildResponse());
      await promise;
    });

    it('returns the full updated CourseContentResponse', async () => {
      const updated = buildResponse({
        items: [
          {
            item_id: 'item-2',
            kind: 'video',
            ref: 'https://example.com/video.mp4',
            title: 'Video',
            position: 1,
          },
        ],
      });
      const promise = firstValueFrom(
        service.reorder(COURSE_ID, ['item-2']),
      );
      httpMock
        .expectOne(`${BASE}/api/v1/courses/${COURSE_ID}/content/reorder`)
        .flush(updated);
      const result = await promise;
      expect(result.items[0]!.position).toBe(1);
    });
  });

  // ── mintUploadUrl + uploadToSignedUrl (L3 / CHO-1793) ──────────────────

  describe('mintUploadUrl()', () => {
    it('POSTs mime/size_bytes/filename to .../content/upload-url', async () => {
      const promise = firstValueFrom(
        service.mintUploadUrl(COURSE_ID, {
          mime: 'video/mp4',
          size_bytes: 2048,
          filename: 'lecture.mp4',
        }),
      );
      const req = httpMock.expectOne(
        `${BASE}/api/v1/courses/${COURSE_ID}/content/upload-url`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        mime: 'video/mp4',
        size_bytes: 2048,
        filename: 'lecture.mp4',
      });
      req.flush({
        upload_url: 'https://storage.googleapis.com/bucket/obj?sig=x',
        object_ref: 'gs://bucket/tenants/t/courses/c/obj.mp4',
        expires_at: '2026-06-19T16:00:00Z',
        max_size_bytes: 2147483648,
      });
      const out = await promise;
      expect(out.object_ref).toBe('gs://bucket/tenants/t/courses/c/obj.mp4');
    });
  });

  describe('uploadToSignedUrl()', () => {
    it('PUTs the file bytes to the absolute signed URL with the file Content-Type', async () => {
      const url = 'https://storage.googleapis.com/bucket/obj?sig=x';
      const file = new File(['data'], 'lecture.mp4', { type: 'video/mp4' });
      const promise = firstValueFrom(service.uploadToSignedUrl(url, file));
      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toBe(file);
      expect(req.request.headers.get('Content-Type')).toBe('video/mp4');
      req.flush(null);
      await promise;
    });

    it('falls back to application/octet-stream when the file has no type', async () => {
      const url = 'https://storage.googleapis.com/bucket/obj?sig=y';
      const file = new File(['data'], 'noext');
      const promise = firstValueFrom(service.uploadToSignedUrl(url, file));
      const req = httpMock.expectOne(url);
      expect(req.request.headers.get('Content-Type')).toBe('application/octet-stream');
      req.flush(null);
      await promise;
    });
  });
});
