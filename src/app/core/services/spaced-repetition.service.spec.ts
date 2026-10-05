/**
 * SpacedRepetitionService spec — WS-12.
 *
 * Covers:
 *   - submitFeedback: happy path → returns SpacedRepetitionFeedbackResponse
 *   - submitFeedback: fail-loud on 5xx (no silent fallback)
 *   - submitFeedback: fail-loud on 4xx
 *   - submitFeedback: rejects missing atomId
 *   - retentionStateFromCategory: maps all three categories
 *   - retentionColorVar: returns correct CSS variable string
 *   - retentionIconClass: maps all retention states to FA class
 */
import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import {
  SpacedRepetitionService,
  retentionStateFromCategory,
  retentionColorVar,
  retentionIconClass,
} from './spaced-repetition.service';
import { environment } from '../../../environments/environment';

const STUB_RESPONSE = {
  next_review_at: '2026-05-27T06:00:00Z',
  ease_factor: 2.5,
  interval_days: 3,
};

function setup(): { svc: SpacedRepetitionService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      SpacedRepetitionService,
    ],
  });
  return {
    svc: TestBed.inject(SpacedRepetitionService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('SpacedRepetitionService', () => {
  afterEach(() => {
    // The pure-helper tests never call setup(), so the HttpTestingController
    // provider may be absent; inject optionally and only verify when present.
    const httpMock = TestBed.inject(HttpTestingController, null, { optional: true });
    httpMock?.verify();
    TestBed.resetTestingModule();
  });

  describe('submitFeedback', () => {
    it('POSTs to /api/atoms/{id}/feedback and returns the response', () => {
      const { svc, httpMock } = setup();
      let result: Parameters<NonNullable<Parameters<ReturnType<typeof svc.submitFeedback>['subscribe']>[0]>>[0] | undefined;
      svc
        .submitFeedback('atom-abc-123', { session_id: 'sess-1', recall_quality: 4 })
        .subscribe((r) => { result = r; });
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/atoms/atom-abc-123/feedback`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ session_id: 'sess-1', recall_quality: 4 });
      req.flush(STUB_RESPONSE);
      expect(result).toEqual(STUB_RESPONSE);
    });

    it('URL-encodes the atomId', () => {
      const { svc, httpMock } = setup();
      svc
        .submitFeedback('atom with spaces', { session_id: 's', recall_quality: 3 })
        .subscribe({ error: () => undefined });
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/api/atoms/atom%20with%20spaces/feedback`,
      );
      req.flush(STUB_RESPONSE);
    });

    it('propagates 5xx fail-loud — no silent fallback', () => {
      const { svc, httpMock } = setup();
      let capturedError: Error | undefined;
      svc
        .submitFeedback('atom-xyz', { session_id: 's', recall_quality: 2 })
        .subscribe({ error: (e: Error) => { capturedError = e; } });
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/atoms/atom-xyz/feedback`)
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      expect(capturedError).toBeDefined();
      expect(capturedError?.message).toContain('503');
    });

    it('propagates 4xx fail-loud', () => {
      const { svc, httpMock } = setup();
      let capturedError: Error | undefined;
      svc
        .submitFeedback('atom-xyz', { session_id: 's', recall_quality: 1 })
        .subscribe({ error: (e: Error) => { capturedError = e; } });
      httpMock
        .expectOne(`${environment.bffBaseUrl}/api/atoms/atom-xyz/feedback`)
        .flush(null, { status: 404, statusText: 'Not Found' });
      expect(capturedError).toBeDefined();
      expect(capturedError?.message).toContain('404');
    });

    it('rejects an empty atomId immediately without issuing HTTP', () => {
      const { svc, httpMock } = setup();
      let capturedError: Error | undefined;
      svc
        .submitFeedback('', { session_id: 's', recall_quality: 5 })
        .subscribe({ error: (e: Error) => { capturedError = e; } });
      httpMock.expectNone(`${environment.bffBaseUrl}/api/atoms//feedback`);
      expect(capturedError).toBeDefined();
      expect(capturedError?.message).toContain('atomId is required');
    });
  });

  describe('retentionStateFromCategory', () => {
    it('maps review → low (Ebbinghaus overdue)', () => {
      expect(retentionStateFromCategory('review')).toBe('low');
    });

    it('maps stretch → medium (weakness/spaced-rep lag)', () => {
      expect(retentionStateFromCategory('stretch')).toBe('medium');
    });

    it('maps new → unknown (no history yet)', () => {
      expect(retentionStateFromCategory('new')).toBe('unknown');
    });
  });

  describe('retentionColorVar', () => {
    it('returns var(--chora-retention-high) for high', () => {
      expect(retentionColorVar('high')).toBe('var(--chora-retention-high)');
    });

    it('returns var(--chora-retention-low) for low', () => {
      expect(retentionColorVar('low')).toBe('var(--chora-retention-low)');
    });

    it('returns var(--chora-retention-unknown) for unknown', () => {
      expect(retentionColorVar('unknown')).toBe('var(--chora-retention-unknown)');
    });
  });

  describe('retentionIconClass', () => {
    it('returns fa-circle-check for high', () => {
      expect(retentionIconClass('high')).toContain('fa-circle-check');
    });

    it('returns fa-circle-exclamation for low', () => {
      expect(retentionIconClass('low')).toContain('fa-circle-exclamation');
    });

    it('returns fa-circle-question for unknown', () => {
      expect(retentionIconClass('unknown')).toContain('fa-circle-question');
    });

    it('returns fa-circle-half-stroke for medium', () => {
      expect(retentionIconClass('medium')).toContain('fa-circle-half-stroke');
    });
  });
});
