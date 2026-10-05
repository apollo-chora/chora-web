import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RecommendationService } from './recommendation.service';
import { environment } from '../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders — match backend Go snake_case JSON exactly
// ---------------------------------------------------------------------------

function buildRecommendationResponse() {
  return {
    recommendations: [
      {
        atom_id: 'atom-001',
        score: 95,
        reason: 'High relevance to recent activity',
        topic_name: 'Algebra',
        difficulty: 'intermediate' as const,
      },
      {
        atom_id: 'atom-002',
        score: 82,
        reason: 'Prerequisite for your goal',
        topic_name: 'Calculus',
        difficulty: 'advanced' as const,
      },
    ],
    governance: { model_id: 'model-1', agent_id: 'recommender-v1' },
  };
}

function buildCuratedDoseResponse() {
  return {
    atoms: [
      {
        atom_id: 'atom-010',
        title: 'Quadratic Equations Basics',
        topic_name: 'Algebra',
        difficulty: 'beginner' as const,
        estimated_seconds: 300,
        source: 'ebbinghaus' as const,
      },
      {
        atom_id: 'atom-011',
        title: 'Trigonometric Identities',
        topic_name: 'Trigonometry',
        difficulty: 'intermediate' as const,
        estimated_seconds: 420,
        source: 'weakness' as const,
      },
    ],
    curation_rationale: 'Spaced repetition + weakness remediation',
    governance: { model_id: 'model-1', agent_id: 'curator-v1' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecommendationService', () => {
  let service: RecommendationService;
  let httpMock: HttpTestingController;
  const recommendUrl = `${environment.bffBaseUrl}/api/v1/engagement/agents/recommend`;
  const curateUrl = `${environment.bffBaseUrl}/api/v1/engagement/agents/daily-dose/curate`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        RecommendationService,
      ],
    });
    service = TestBed.inject(RecommendationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts with idle recommendation state', () => {
    expect(service.recommendationState().status).toBe('idle');
    expect(service.recommendations()).toEqual([]);
    expect(service.curatedAtoms()).toEqual([]);
    expect(service.curationRationale()).toBe('');
  });

  // -------------------------------------------------------------------------
  // loadRecommendations
  // -------------------------------------------------------------------------

  it('sets loading state when loadRecommendations is called', () => {
    service.loadRecommendations('gcid-001').subscribe();
    expect(service.recommendationState().status).toBe('loading');
    httpMock.expectOne(recommendUrl).flush(buildRecommendationResponse());
  });

  it('maps recommendation data on success', () => {
    service.loadRecommendations('gcid-001').subscribe();
    httpMock.expectOne(recommendUrl).flush(buildRecommendationResponse());

    expect(service.recommendationState().status).toBe('success');
    expect(service.recommendations().length).toBe(2);
    expect(service.recommendations()[0].atom_id).toBe('atom-001');
    expect(service.recommendations()[0].score).toBe(95);
    expect(service.recommendations()[0].difficulty).toBe('intermediate');
    expect(service.recommendations()[1].topic_name).toBe('Calculus');
  });

  it('sends topic_ids and limit when provided', () => {
    service.loadRecommendations('gcid-001', ['topic-1', 'topic-2'], 5).subscribe();

    const req = httpMock.expectOne(recommendUrl);
    expect(req.request.body).toEqual({
      gcid: 'gcid-001',
      topic_ids: ['topic-1', 'topic-2'],
      limit: 5,
    });
    req.flush(buildRecommendationResponse());
  });

  it('sets error state on recommendation failure', () => {
    service.loadRecommendations('gcid-001').subscribe();
    httpMock.expectOne(recommendUrl).error(new ProgressEvent('error'));

    expect(service.recommendationState().status).toBe('error');
    const state = service.recommendationState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('RECOMMENDATION_LOAD_FAILED');
    }
  });

  it('returns empty array from computed recommendations on error', () => {
    service.loadRecommendations('gcid-001').subscribe();
    httpMock.expectOne(recommendUrl).error(new ProgressEvent('error'));

    expect(service.recommendations()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // loadCuratedDailyDose
  // -------------------------------------------------------------------------

  it('sets loading state for curated dose', () => {
    service.loadCuratedDailyDose('gcid-001').subscribe();
    expect(service.curatedDoseState().status).toBe('loading');
    httpMock.expectOne(curateUrl).flush(buildCuratedDoseResponse());
  });

  it('maps curated dose data on success', () => {
    service.loadCuratedDailyDose('gcid-001').subscribe();
    httpMock.expectOne(curateUrl).flush(buildCuratedDoseResponse());

    expect(service.curatedDoseState().status).toBe('success');
    expect(service.curatedAtoms().length).toBe(2);
    expect(service.curatedAtoms()[0].title).toBe('Quadratic Equations Basics');
    expect(service.curatedAtoms()[0].source).toBe('ebbinghaus');
    expect(service.curationRationale()).toBe('Spaced repetition + weakness remediation');
  });

  it('sends limit param for curated dose', () => {
    service.loadCuratedDailyDose('gcid-001', 3).subscribe();

    const req = httpMock.expectOne(curateUrl);
    expect(req.request.body).toEqual({ gcid: 'gcid-001', limit: 3 });
    req.flush(buildCuratedDoseResponse());
  });

  it('sets error state on curated dose failure', () => {
    service.loadCuratedDailyDose('gcid-001').subscribe();
    httpMock.expectOne(curateUrl).error(new ProgressEvent('error'));

    expect(service.curatedDoseState().status).toBe('error');
    const state = service.curatedDoseState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('CURATED_DOSE_LOAD_FAILED');
    }
  });

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  it('resetState returns both states to idle', () => {
    service.loadRecommendations('gcid-001').subscribe();
    httpMock.expectOne(recommendUrl).flush(buildRecommendationResponse());

    service.loadCuratedDailyDose('gcid-001').subscribe();
    httpMock.expectOne(curateUrl).flush(buildCuratedDoseResponse());

    service.resetState();

    expect(service.recommendationState().status).toBe('idle');
    expect(service.curatedDoseState().status).toBe('idle');
    expect(service.recommendations()).toEqual([]);
    expect(service.curatedAtoms()).toEqual([]);
    expect(service.curationRationale()).toBe('');
  });
});
