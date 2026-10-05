import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ContentTranslationService } from './content-translation.service';
import type {
  TranslationRequest,
  TranslationResponse,
  BatchTranslationRequest,
  BatchTranslationResponse,
} from './content-translation.service';
import { environment } from '../../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

function buildTranslationRequest(): TranslationRequest {
  return {
    content_id: 'atom-001',
    source_language: 'en',
    target_language: 'zh-CN',
  };
}

function buildTranslationResponse(): TranslationResponse {
  return {
    content_id: 'atom-001',
    source_language: 'en',
    target_language: 'zh-CN',
    translated_content: 'Translated content in Chinese',
    confidence: 0.92,
    word_count: 150,
    governance: { model: 'gpt-4o', audit_id: 'audit-001' },
  };
}

function buildBatchRequest(): BatchTranslationRequest {
  return {
    content_ids: ['atom-001', 'atom-002', 'atom-003'],
    source_language: 'en',
    target_language: 'ms-MY',
  };
}

function buildBatchResponse(): BatchTranslationResponse {
  return {
    job_id: 'batch-job-001',
    status: 'in_progress',
    results: [
      { content_id: 'atom-001', status: 'completed', translated_content: 'Translated 1', confidence: 0.9 },
      { content_id: 'atom-002', status: 'in_progress' },
      { content_id: 'atom-003', status: 'queued' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContentTranslationService', () => {
  let service: ContentTranslationService;
  let httpMock: HttpTestingController;
  const translateUrl = `${environment.bffBaseUrl}/api/v1/cms/agents/translate`;
  const batchUrl = `${environment.bffBaseUrl}/api/v1/cms/agents/translate/batch`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ContentTranslationService,
      ],
    });
    service = TestBed.inject(ContentTranslationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts with idle translation state', () => {
    expect(service.translationState().status).toBe('idle');
    expect(service.translationResult()).toBeNull();
  });

  it('starts with idle batch state', () => {
    expect(service.batchState().status).toBe('idle');
    expect(service.batchResult()).toBeNull();
  });

  // -----------------------------------------------------------------------
  // translate
  // -----------------------------------------------------------------------

  it('sets loading state when translate is called', () => {
    service.translate(buildTranslationRequest()).subscribe();
    expect(service.translationState().status).toBe('loading');
    httpMock.expectOne(translateUrl).flush(buildTranslationResponse());
  });

  it('sends POST with correct body', () => {
    const request = buildTranslationRequest();
    service.translate(request).subscribe();

    const req = httpMock.expectOne(translateUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(buildTranslationResponse());
  });

  it('maps translation result on success', () => {
    service.translate(buildTranslationRequest()).subscribe();
    httpMock.expectOne(translateUrl).flush(buildTranslationResponse());

    expect(service.translationState().status).toBe('success');
    expect(service.translationResult()?.translated_content).toBe('Translated content in Chinese');
    expect(service.translationResult()?.confidence).toBe(0.92);
    expect(service.translationResult()?.word_count).toBe(150);
  });

  it('sets error state on translate failure', () => {
    service.translate(buildTranslationRequest()).subscribe();
    httpMock.expectOne(translateUrl).error(new ProgressEvent('error'));

    expect(service.translationState().status).toBe('error');
    const state = service.translationState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('TRANSLATION_FAILED');
    }
  });

  // -----------------------------------------------------------------------
  // batchTranslate
  // -----------------------------------------------------------------------

  it('sets loading state when batchTranslate is called', () => {
    service.batchTranslate(buildBatchRequest()).subscribe();
    expect(service.batchState().status).toBe('loading');
    httpMock.expectOne(batchUrl).flush(buildBatchResponse());
  });

  it('sends POST with correct batch body', () => {
    const request = buildBatchRequest();
    service.batchTranslate(request).subscribe();

    const req = httpMock.expectOne(batchUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(buildBatchResponse());
  });

  it('maps batch result on success', () => {
    service.batchTranslate(buildBatchRequest()).subscribe();
    httpMock.expectOne(batchUrl).flush(buildBatchResponse());

    expect(service.batchState().status).toBe('success');
    expect(service.batchResult()?.job_id).toBe('batch-job-001');
    expect(service.batchResult()?.results.length).toBe(3);
  });

  it('sets error state on batch failure', () => {
    service.batchTranslate(buildBatchRequest()).subscribe();
    httpMock.expectOne(batchUrl).error(new ProgressEvent('error'));

    expect(service.batchState().status).toBe('error');
    const state = service.batchState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('BATCH_TRANSLATION_FAILED');
    }
  });

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  it('resetTranslation returns to idle', () => {
    service.translate(buildTranslationRequest()).subscribe();
    httpMock.expectOne(translateUrl).flush(buildTranslationResponse());
    expect(service.translationState().status).toBe('success');

    service.resetTranslation();
    expect(service.translationState().status).toBe('idle');
    expect(service.translationResult()).toBeNull();
  });

  it('resetBatch returns to idle', () => {
    service.batchTranslate(buildBatchRequest()).subscribe();
    httpMock.expectOne(batchUrl).flush(buildBatchResponse());
    expect(service.batchState().status).toBe('success');

    service.resetBatch();
    expect(service.batchState().status).toBe('idle');
    expect(service.batchResult()).toBeNull();
  });
});
