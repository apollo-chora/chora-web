import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ContentQualityService } from './content-quality.service';
import { environment } from '../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders — match backend Go snake_case JSON exactly
// ---------------------------------------------------------------------------

function buildDifficultyResponse() {
  return {
    atom_id: 'atom-500',
    difficulty_score: 3.2,
    confidence: 0.87,
    reasoning: 'Multi-step problem requiring conceptual understanding',
    governance: {
      model_id: 'model-1',
      agent_id: 'difficulty-scorer-v1',
      timestamp: '2026-03-15T10:00:00Z',
    },
  };
}

function buildAnalysisResponse() {
  return {
    atom_id: 'atom-500',
    taxonomy_tags: ['algebra', 'equations', 'quadratic'],
    blooms_level: 'apply' as const,
    readability_score: 0.72,
    quality_score: 0.85,
    estimated_minutes: 7,
    suggestions: ['Add worked example', 'Clarify step 3'],
    governance: {
      model_id: 'model-1',
      agent_id: 'content-analyzer-v1',
      timestamp: '2026-03-15T10:00:00Z',
    },
  };
}

function buildLowQualityAnalysis() {
  return {
    ...buildAnalysisResponse(),
    quality_score: 0.3,
    blooms_level: 'remember' as const,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContentQualityService', () => {
  let service: ContentQualityService;
  let httpMock: HttpTestingController;
  const difficultyUrl = `${environment.bffBaseUrl}/api/v1/atomic/agents/difficulty/score`;
  const analysisUrl = `${environment.bffBaseUrl}/api/v1/atomic/agents/content/analyze`;
  const testContent = { body: 'Solve for x: 2x + 3 = 7' };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ContentQualityService,
      ],
    });
    service = TestBed.inject(ContentQualityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts with idle quality state', () => {
    expect(service.qualityState().status).toBe('idle');
  });

  // -------------------------------------------------------------------------
  // scoreDifficulty (standalone)
  // -------------------------------------------------------------------------

  it('sends POST to difficulty endpoint', () => {
    service.scoreDifficulty('atom-500', testContent).subscribe();

    const req = httpMock.expectOne(difficultyUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ atom_id: 'atom-500', content: testContent });
    req.flush(buildDifficultyResponse());
  });

  it('returns difficulty data on success', () => {
    let result: unknown = null;
    service.scoreDifficulty('atom-500', testContent).subscribe(r => result = r);

    httpMock.expectOne(difficultyUrl).flush(buildDifficultyResponse());

    expect(result).not.toBeNull();
    const typed = result as ReturnType<typeof buildDifficultyResponse>;
    expect(typed.difficulty_score).toBe(3.2);
    expect(typed.confidence).toBe(0.87);
  });

  it('returns null on difficulty scoring error', () => {
    let result: unknown = 'not-null';
    service.scoreDifficulty('atom-500', testContent).subscribe(r => result = r);

    httpMock.expectOne(difficultyUrl).error(new ProgressEvent('error'));

    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // analyzeContent (standalone)
  // -------------------------------------------------------------------------

  it('sends POST to analyze endpoint', () => {
    service.analyzeContent('atom-500', testContent).subscribe();

    const req = httpMock.expectOne(analysisUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ atom_id: 'atom-500', content: testContent });
    req.flush(buildAnalysisResponse());
  });

  it('returns analysis data on success', () => {
    let result: unknown = null;
    service.analyzeContent('atom-500', testContent).subscribe(r => result = r);

    httpMock.expectOne(analysisUrl).flush(buildAnalysisResponse());

    const typed = result as ReturnType<typeof buildAnalysisResponse>;
    expect(typed.quality_score).toBe(0.85);
    expect(typed.blooms_level).toBe('apply');
    expect(typed.taxonomy_tags).toContain('algebra');
  });

  it('returns null on analysis error', () => {
    let result: unknown = 'not-null';
    service.analyzeContent('atom-500', testContent).subscribe(r => result = r);

    httpMock.expectOne(analysisUrl).error(new ProgressEvent('error'));

    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // loadQualityData (parallel merge)
  // -------------------------------------------------------------------------

  it('sets loading state and fires both requests', () => {
    service.loadQualityData('atom-500', testContent);

    expect(service.qualityState().status).toBe('loading');

    // Both requests should be pending
    const diffReq = httpMock.expectOne(difficultyUrl);
    const analysisReq = httpMock.expectOne(analysisUrl);

    diffReq.flush(buildDifficultyResponse());
    analysisReq.flush(buildAnalysisResponse());
  });

  it('merges both results into quality data on success', () => {
    service.loadQualityData('atom-500', testContent);

    httpMock.expectOne(difficultyUrl).flush(buildDifficultyResponse());
    httpMock.expectOne(analysisUrl).flush(buildAnalysisResponse());

    const state = service.qualityState();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.data.difficulty_score).toBe(3.2);
      expect(state.data.difficulty_confidence).toBe(0.87);
      expect(state.data.quality_score).toBe(0.85);
      expect(state.data.blooms_level).toBe('apply');
      expect(state.data.readability_score).toBe(0.72);
      expect(state.data.review_status).toBe('reviewed');
      expect(state.data.review_confidence).toBe(0.85);
    }
  });

  it('derives review_status as needs_revision for low quality', () => {
    service.loadQualityData('atom-500', testContent);

    httpMock.expectOne(difficultyUrl).flush(buildDifficultyResponse());
    httpMock.expectOne(analysisUrl).flush(buildLowQualityAnalysis());

    const state = service.qualityState();
    if (state.status === 'success') {
      expect(state.data.review_status).toBe('needs_revision');
    }
  });

  it('succeeds with partial data when difficulty fails', () => {
    service.loadQualityData('atom-500', testContent);

    httpMock.expectOne(difficultyUrl).error(new ProgressEvent('error'));
    httpMock.expectOne(analysisUrl).flush(buildAnalysisResponse());

    const state = service.qualityState();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.data.difficulty_score).toBeNull();
      expect(state.data.difficulty_confidence).toBeNull();
      expect(state.data.quality_score).toBe(0.85);
    }
  });

  it('succeeds with partial data when analysis fails', () => {
    service.loadQualityData('atom-500', testContent);

    httpMock.expectOne(difficultyUrl).flush(buildDifficultyResponse());
    httpMock.expectOne(analysisUrl).error(new ProgressEvent('error'));

    const state = service.qualityState();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.data.difficulty_score).toBe(3.2);
      expect(state.data.quality_score).toBeNull();
      expect(state.data.review_status).toBe('pending_review');
    }
  });

  it('sets error state when both requests fail', () => {
    service.loadQualityData('atom-500', testContent);

    httpMock.expectOne(difficultyUrl).error(new ProgressEvent('error'));
    httpMock.expectOne(analysisUrl).error(new ProgressEvent('error'));

    const state = service.qualityState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('QUALITY_LOAD_FAILED');
    }
  });

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  it('resetState returns to idle', () => {
    service.loadQualityData('atom-500', testContent);
    httpMock.expectOne(difficultyUrl).flush(buildDifficultyResponse());
    httpMock.expectOne(analysisUrl).flush(buildAnalysisResponse());

    service.resetState();

    expect(service.qualityState().status).toBe('idle');
  });
});
