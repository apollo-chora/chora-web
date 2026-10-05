import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { GoalKnowledgeService } from './goal-knowledge.service';
import type { GoalKnowledge } from '../discovery-graph/familiar-map.model';
import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';
import { isApiError } from '../../../../core/interceptors/api-error.model';
import { environment } from '../../../../../environments/environment';

const BFF = environment.bffBaseUrl;
const GOAL_ID = 'goal-1';
const KNOWLEDGE = `${BFF}/api/v1/me/goals/${GOAL_ID}/knowledge`;

/** The exact wire body chora-consumption serves (camelCase, carries NO English). */
function wire(over: Partial<GoalKnowledge> = {}): GoalKnowledge {
  return {
    goalId: GOAL_ID,
    goalTitle: 'Fractions e2e walk',
    familiarId: 'fam-1',
    familiarName: 'Ember',
    conceptsTotal: 4,
    conceptsMastered: 1,
    shakyConcepts: [
      { conceptKey: 'fractions', conceptLabel: 'Fractions', strength: 0.4 },
    ],
    hasMemory: true,
    memories: [
      {
        id: 'm1',
        memoryType: 'chat_turn',
        content: 'Asked about rocket stages',
        createdAt: '2026-07-14T10:00:00Z',
      },
    ],
    reflection: { text: 'I remember you asked about fractions.', status: 'fresh' },
    ...over,
  };
}

// The REAL errorInterceptor is registered on purpose. Without it,
// HttpTestingController hands the caller a bare HttpErrorResponse whose
// `.error` IS the body — a shape production NEVER produces, because the global
// interceptor turns every HTTP failure into an ApiError. That divergence is how
// the Far Sight error mapping shipped completely dead behind a green spec
// (CHO-1705, CHO-2051, and again on 2026-07-14). Drive the production error
// chain, or the spec proves nothing.
function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return {
    svc: TestBed.inject(GoalKnowledgeService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('GoalKnowledgeService (CHO-2118 tier 2)', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('GETs the goal-scoped knowledge read model', () => {
    const { svc, http } = setup();
    let got: GoalKnowledge | undefined;

    svc.get(GOAL_ID).subscribe((k) => (got = k));

    const req = http.expectOne(KNOWLEDGE);
    expect(req.request.method).toBe('GET');
    req.flush(wire());

    expect(got?.reflection.status).toBe('fresh');
    expect(got?.reflection.text).toContain('fractions');
    expect(got?.familiarName).toBe('Ember');
    expect(got?.conceptsMastered).toBe(1);
    http.verify();
  });

  it('url-encodes the goal id', () => {
    const { svc, http } = setup();
    svc.get('a/b').subscribe();
    http.expectOne(`${BFF}/api/v1/me/goals/a%2Fb/knowledge`).flush(wire());
    http.verify();
  });

  it('carries the "reflecting" status through verbatim (serve-stale-while-regen)', () => {
    const { svc, http } = setup();
    let got: GoalKnowledge | undefined;

    svc.get(GOAL_ID).subscribe((k) => (got = k));
    http
      .expectOne(KNOWLEDGE)
      .flush(wire({ reflection: { text: 'last good text', status: 'reflecting' } }));

    // The last good reflection is KEPT while a new one is synthesised — the
    // learner never sees a blank where prose used to be.
    expect(got?.reflection.status).toBe('reflecting');
    expect(got?.reflection.text).toBe('last good text');
    http.verify();
  });

  it('carries the honest "none" status (ADR-207 — never fabricate)', () => {
    const { svc, http } = setup();
    let got: GoalKnowledge | undefined;

    svc.get(GOAL_ID).subscribe((k) => (got = k));
    http
      .expectOne(KNOWLEDGE)
      .flush(wire({ hasMemory: false, memories: [], reflection: { text: '', status: 'none' } }));

    expect(got?.reflection.status).toBe('none');
    expect(got?.reflection.text).toBe('');
    http.verify();
  });

  it('surfaces a REAL ApiError (the production error chain), not a raw body', () => {
    const { svc, http } = setup();
    let err: unknown;

    svc.get(GOAL_ID).subscribe({ error: (e: unknown) => (err = e) });
    http
      .expectOne(KNOWLEDGE)
      .flush(
        { code: 'GOAL_KNOWLEDGE_UNAVAILABLE', message: 'read model offline' },
        { status: 503, statusText: 'Service Unavailable' },
      );

    expect(isApiError(err)).toBe(true);
    http.verify();
  });
});
