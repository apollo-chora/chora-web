import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RetentionService } from './retention.service';
import { environment } from '../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders — match backend Go snake_case JSON exactly
// ---------------------------------------------------------------------------

function buildRetentionResponse() {
  return {
    retention_score: 62,
    at_risk_atoms: [
      {
        atom_id: 'atom-100',
        last_reviewed: '2026-03-10T10:00:00Z',
        predicted_retention: 35,
        topic_name: 'Organic Chemistry',
      },
      {
        atom_id: 'atom-101',
        last_reviewed: '2026-03-08T14:00:00Z',
        predicted_retention: 22,
        topic_name: 'Thermodynamics',
      },
    ],
    forgetting_curve_data: [
      { days_since_review: 1, predicted_retention: 90 },
      { days_since_review: 3, predicted_retention: 72 },
      { days_since_review: 7, predicted_retention: 50 },
      { days_since_review: 14, predicted_retention: 30 },
    ],
    governance: { model_id: 'model-1', agent_id: 'retention-v1' },
  };
}

function buildNudgeResponse() {
  return {
    nudge_type: 'streak_at_risk',
    message: 'Your 7-day streak ends tonight! Complete one atom to keep it alive.',
    urgency: 'high' as const,
    suggested_atoms: [
      { atom_id: 'atom-200', title: 'Quick Algebra Review', reason: 'Fastest to complete' },
      { atom_id: 'atom-201', title: 'Physics Refresher', reason: 'Weakest topic' },
    ],
    governance: { model_id: 'model-1', agent_id: 'nudger-v1' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RetentionService', () => {
  let service: RetentionService;
  let httpMock: HttpTestingController;
  const retentionUrl = `${environment.bffBaseUrl}/api/v1/engagement/agents/retention/predict`;
  const nudgeUrl = `${environment.bffBaseUrl}/api/v1/engagement/agents/streak/nudge`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        RetentionService,
      ],
    });
    service = TestBed.inject(RetentionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts with idle state for both retention and nudge', () => {
    expect(service.retentionState().status).toBe('idle');
    expect(service.nudgeState().status).toBe('idle');
    expect(service.retentionScore()).toBe(0);
    expect(service.atRiskAtoms()).toEqual([]);
    expect(service.forgettingCurve()).toEqual([]);
    expect(service.nudge()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // loadRetention
  // -------------------------------------------------------------------------

  it('sets loading state when loadRetention is called', () => {
    service.loadRetention('gcid-001').subscribe();
    expect(service.retentionState().status).toBe('loading');
    httpMock.expectOne(retentionUrl).flush(buildRetentionResponse());
  });

  it('maps retention prediction data on success', () => {
    service.loadRetention('gcid-001').subscribe();
    httpMock.expectOne(retentionUrl).flush(buildRetentionResponse());

    expect(service.retentionState().status).toBe('success');
    expect(service.retentionScore()).toBe(62);
    expect(service.atRiskAtoms().length).toBe(2);
    expect(service.atRiskAtoms()[0].atom_id).toBe('atom-100');
    expect(service.atRiskAtoms()[0].predicted_retention).toBe(35);
    expect(service.atRiskAtoms()[0].topic_name).toBe('Organic Chemistry');
  });

  it('maps forgetting curve data on success', () => {
    service.loadRetention('gcid-001').subscribe();
    httpMock.expectOne(retentionUrl).flush(buildRetentionResponse());

    const curve = service.forgettingCurve();
    expect(curve.length).toBe(4);
    expect(curve[0].days_since_review).toBe(1);
    expect(curve[0].predicted_retention).toBe(90);
    expect(curve[3].days_since_review).toBe(14);
    expect(curve[3].predicted_retention).toBe(30);
  });

  it('sends gcid in POST body', () => {
    service.loadRetention('gcid-test').subscribe();

    const req = httpMock.expectOne(retentionUrl);
    expect(req.request.body).toEqual({ gcid: 'gcid-test' });
    req.flush(buildRetentionResponse());
  });

  it('sets error state on retention failure', () => {
    service.loadRetention('gcid-001').subscribe();
    httpMock.expectOne(retentionUrl).error(new ProgressEvent('error'));

    expect(service.retentionState().status).toBe('error');
    const state = service.retentionState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('RETENTION_LOAD_FAILED');
    }
  });

  it('returns default computed values on error', () => {
    service.loadRetention('gcid-001').subscribe();
    httpMock.expectOne(retentionUrl).error(new ProgressEvent('error'));

    expect(service.retentionScore()).toBe(0);
    expect(service.atRiskAtoms()).toEqual([]);
    expect(service.forgettingCurve()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // loadNudge
  // -------------------------------------------------------------------------

  it('sets loading state when loadNudge is called', () => {
    service.loadNudge('gcid-001').subscribe();
    expect(service.nudgeState().status).toBe('loading');
    httpMock.expectOne(nudgeUrl).flush(buildNudgeResponse());
  });

  it('maps nudge data on success', () => {
    service.loadNudge('gcid-001').subscribe();
    httpMock.expectOne(nudgeUrl).flush(buildNudgeResponse());

    expect(service.nudgeState().status).toBe('success');
    const nudge = service.nudge();
    expect(nudge).not.toBeNull();
    expect(nudge!.nudge_type).toBe('streak_at_risk');
    expect(nudge!.message).toContain('7-day streak');
    expect(nudge!.urgency).toBe('high');
    expect(nudge!.suggested_atoms.length).toBe(2);
    expect(nudge!.suggested_atoms[0].title).toBe('Quick Algebra Review');
  });

  it('sets error state on nudge failure', () => {
    service.loadNudge('gcid-001').subscribe();
    httpMock.expectOne(nudgeUrl).error(new ProgressEvent('error'));

    expect(service.nudgeState().status).toBe('error');
    const state = service.nudgeState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('NUDGE_LOAD_FAILED');
    }
  });

  it('returns null nudge on error', () => {
    service.loadNudge('gcid-001').subscribe();
    httpMock.expectOne(nudgeUrl).error(new ProgressEvent('error'));

    expect(service.nudge()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // State reset
  // -------------------------------------------------------------------------

  it('resetState returns all states to idle', () => {
    service.loadRetention('gcid-001').subscribe();
    httpMock.expectOne(retentionUrl).flush(buildRetentionResponse());

    service.loadNudge('gcid-001').subscribe();
    httpMock.expectOne(nudgeUrl).flush(buildNudgeResponse());

    service.resetState();

    expect(service.retentionState().status).toBe('idle');
    expect(service.nudgeState().status).toBe('idle');
    expect(service.retentionScore()).toBe(0);
    expect(service.atRiskAtoms()).toEqual([]);
    expect(service.forgettingCurve()).toEqual([]);
    expect(service.nudge()).toBeNull();
  });
});
