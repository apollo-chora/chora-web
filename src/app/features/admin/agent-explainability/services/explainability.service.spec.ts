import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ExplainabilityService } from './explainability.service';
import type { InvestigationRequest, InvestigationResponse } from './explainability.service';
import { environment } from '../../../../../environments/environment';

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

function buildInvestigationRequest(): InvestigationRequest {
  return {
    agent_name: 'Recommender',
    verdict: 'approved',
  };
}

function buildInvestigationResponse(): InvestigationResponse {
  return {
    investigations: [
      {
        decision_id: 'dec-001',
        agent_name: 'Recommender',
        verdict: 'approved',
        reasoning_steps: [
          {
            step_number: 1,
            description: 'Checked learner history',
            evidence: 'Learner completed 12 algebra atoms with 85% accuracy',
            confidence: 0.92,
          },
          {
            step_number: 2,
            description: 'Evaluated content relevance',
            evidence: 'Target atom is prerequisite-aligned with learner path',
            confidence: 0.88,
          },
        ],
        reasoning_summary: 'Recommendation approved based on learner history and content alignment.',
        policy_references: [
          {
            name: 'Content Safety Policy',
            description: 'All recommended content must pass safety screening.',
            trigger_reason: 'Routine safety check — passed.',
          },
        ],
        timestamp: '2026-03-15T10:30:00Z',
      },
      {
        decision_id: 'dec-002',
        agent_name: 'Nudger',
        verdict: 'denied',
        reasoning_steps: [
          {
            step_number: 1,
            description: 'Checked notification frequency',
            evidence: 'Learner received 3 nudges today already',
            confidence: 0.95,
          },
        ],
        reasoning_summary: 'Nudge denied to prevent notification fatigue.',
        policy_references: [
          {
            name: 'Notification Rate Limit',
            description: 'Max 3 nudges per learner per 24 hours.',
            trigger_reason: 'Rate limit exceeded.',
          },
        ],
        timestamp: '2026-03-15T11:00:00Z',
      },
    ],
    governance: { model: 'gpt-4o', audit_id: 'audit-gov-001' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExplainabilityService', () => {
  let service: ExplainabilityService;
  let httpMock: HttpTestingController;
  const investigateUrl = `${environment.bffBaseUrl}/api/v1/governance/agents/investigate`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ExplainabilityService,
      ],
    });
    service = TestBed.inject(ExplainabilityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts with idle state', () => {
    expect(service.investigationState().status).toBe('idle');
    expect(service.investigations()).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // investigate
  // -----------------------------------------------------------------------

  it('sets loading state when investigate is called', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    expect(service.investigationState().status).toBe('loading');
    httpMock.expectOne(investigateUrl).flush(buildInvestigationResponse());
  });

  it('sends POST with correct body', () => {
    const request = buildInvestigationRequest();
    service.investigate(request).subscribe();

    const req = httpMock.expectOne(investigateUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(buildInvestigationResponse());
  });

  it('maps investigations on success', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).flush(buildInvestigationResponse());

    expect(service.investigationState().status).toBe('success');
    expect(service.investigations().length).toBe(2);
  });

  it('maps first investigation correctly', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).flush(buildInvestigationResponse());

    const first = service.investigations()[0];
    expect(first.decision_id).toBe('dec-001');
    expect(first.agent_name).toBe('Recommender');
    expect(first.verdict).toBe('approved');
    expect(first.reasoning_steps.length).toBe(2);
    expect(first.policy_references.length).toBe(1);
  });

  it('maps reasoning steps correctly', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).flush(buildInvestigationResponse());

    const step = service.investigations()[0].reasoning_steps[0];
    expect(step.step_number).toBe(1);
    expect(step.description).toBe('Checked learner history');
    expect(step.confidence).toBe(0.92);
  });

  it('maps policy references correctly', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).flush(buildInvestigationResponse());

    const policy = service.investigations()[0].policy_references[0];
    expect(policy.name).toBe('Content Safety Policy');
    expect(policy.trigger_reason).toContain('passed');
  });

  it('sets error state on investigate failure', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).error(new ProgressEvent('error'));

    expect(service.investigationState().status).toBe('error');
    const state = service.investigationState();
    if (state.status === 'error') {
      expect(state.error.code).toBe('INVESTIGATION_FAILED');
    }
  });

  it('returns null on error', () => {
    let result: InvestigationResponse | null | undefined;
    service.investigate(buildInvestigationRequest()).subscribe((r) => {
      result = r;
    });
    httpMock.expectOne(investigateUrl).error(new ProgressEvent('error'));

    expect(result).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  it('reset returns to idle', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).flush(buildInvestigationResponse());
    expect(service.investigationState().status).toBe('success');

    service.reset();
    expect(service.investigationState().status).toBe('idle');
    expect(service.investigations()).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Request shaping — full filter set + minimal request
  // -----------------------------------------------------------------------

  it('sends the full filter set in the POST body', () => {
    const request: InvestigationRequest = {
      agent_name: 'Nudger',
      date_from: '2026-03-01',
      date_to: '2026-03-31',
      verdict: 'escalated',
    };
    service.investigate(request).subscribe();

    const req = httpMock.expectOne(investigateUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(buildInvestigationResponse());
  });

  it('sends an empty body when given an empty request object', () => {
    service.investigate({}).subscribe();

    const req = httpMock.expectOne(investigateUrl);
    expect(req.request.body).toEqual({});
    req.flush(buildInvestigationResponse());
  });

  // -----------------------------------------------------------------------
  // Success — second investigation + full state payload
  // -----------------------------------------------------------------------

  it('emits the response object to the subscriber on success', () => {
    let emitted: InvestigationResponse | null | undefined;
    const response = buildInvestigationResponse();
    service.investigate(buildInvestigationRequest()).subscribe((r) => {
      emitted = r;
    });
    httpMock.expectOne(investigateUrl).flush(response);

    expect(emitted).toEqual(response);
  });

  it('exposes the governance metadata in the success state', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).flush(buildInvestigationResponse());

    const state = service.investigationState();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.data.governance).toEqual({
        model: 'gpt-4o',
        audit_id: 'audit-gov-001',
      });
    }
  });

  it('maps the second (denied) investigation correctly', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).flush(buildInvestigationResponse());

    const second = service.investigations()[1];
    expect(second.decision_id).toBe('dec-002');
    expect(second.agent_name).toBe('Nudger');
    expect(second.verdict).toBe('denied');
    expect(second.reasoning_steps.length).toBe(1);
    expect(second.reasoning_summary).toContain('notification fatigue');
  });

  it('handles an empty investigations list on success', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock
      .expectOne(investigateUrl)
      .flush({ investigations: [], governance: {} });

    expect(service.investigationState().status).toBe('success');
    expect(service.investigations()).toEqual([]);
  });

  it('overwrites previous results on a subsequent investigate call', () => {
    // first call → success
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).flush(buildInvestigationResponse());
    expect(service.investigations().length).toBe(2);

    // second call → loading, then a fresh single-result success
    service.investigate(buildInvestigationRequest()).subscribe();
    expect(service.investigationState().status).toBe('loading');
    expect(service.investigations()).toEqual([]);

    httpMock.expectOne(investigateUrl).flush({
      investigations: [
        {
          decision_id: 'dec-999',
          agent_name: 'Planner',
          verdict: 'inconclusive',
          reasoning_steps: [],
          reasoning_summary: 'Insufficient signal.',
          policy_references: [],
          timestamp: '2026-03-16T09:00:00Z',
        },
      ],
      governance: {},
    });

    expect(service.investigations().length).toBe(1);
    expect(service.investigations()[0].decision_id).toBe('dec-999');
    expect(service.investigations()[0].verdict).toBe('inconclusive');
  });

  // -----------------------------------------------------------------------
  // computed investigations() returns [] outside of success
  // -----------------------------------------------------------------------

  it('investigations() is empty while loading', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    expect(service.investigationState().status).toBe('loading');
    expect(service.investigations()).toEqual([]);
    httpMock.expectOne(investigateUrl).flush(buildInvestigationResponse());
  });

  // -----------------------------------------------------------------------
  // Error paths — 4xx / 5xx + message propagation
  // -----------------------------------------------------------------------

  it('sets error state on a 4xx response', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock
      .expectOne(investigateUrl)
      .flush('Bad Request', { status: 400, statusText: 'Bad Request' });

    const state = service.investigationState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('INVESTIGATION_FAILED');
      expect(typeof state.error.message).toBe('string');
    }
    expect(service.investigations()).toEqual([]);
  });

  it('sets error state on a 5xx response', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock
      .expectOne(investigateUrl)
      .flush('Boom', { status: 500, statusText: 'Internal Server Error' });

    const state = service.investigationState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('INVESTIGATION_FAILED');
    }
  });

  it('propagates the error message into the error state', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock
      .expectOne(investigateUrl)
      .flush('nope', { status: 503, statusText: 'Service Unavailable' });

    const state = service.investigationState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      // BffClient surfaces an Error; message is non-empty
      expect(state.error.message.length).toBeGreaterThan(0);
    }
  });

  it('investigations() is empty after an error', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).error(new ProgressEvent('error'));
    expect(service.investigations()).toEqual([]);
  });

  it('can recover to idle via reset after an error', () => {
    service.investigate(buildInvestigationRequest()).subscribe();
    httpMock.expectOne(investigateUrl).error(new ProgressEvent('error'));
    expect(service.investigationState().status).toBe('error');

    service.reset();
    expect(service.investigationState().status).toBe('idle');
    expect(service.investigations()).toEqual([]);
  });
});
