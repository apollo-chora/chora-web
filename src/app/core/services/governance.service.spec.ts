import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  GovernanceService,
  GOVERNANCE_POLL_INTERVAL_MS,
  badgeVariant,
  isLive,
  isStale,
  hasData,
  dataOrNull,
  type DashboardData,
  type DimensionsData,
  type AgentsData,
  type A2aData,
  type CostData,
  type GovernanceData,
  type GovernanceState,
  type AgentEvalData,
  type EvalEvidenceData,
  type PromptsData,
} from './governance.service';
import { environment } from '../../../environments/environment';

describe('GovernanceService', () => {
  let service: GovernanceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        GovernanceService,
      ],
    });
    service = TestBed.inject(GovernanceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('configuration', () => {
    it('exposes the canonical 30s poll interval (anchor #4)', () => {
      expect(GOVERNANCE_POLL_INTERVAL_MS).toBe(30_000);
    });
  });

  describe('dashboard()', () => {
    it('issues immediate first fetch (startWith pattern, no 30s wait)', () => {
      const sig = service.dashboard();
      expect(sig().state).toBe('loading');

      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/dashboard`);
      expect(req.request.method).toBe('GET');

      const payload: DashboardData = {
        fetched_at: '2026-05-26T10:00:00Z',
        posture: [
          { num: 1, label: 'accountability', score: 72, status: 'partial' },
          { num: 2, label: 'transparency', score: 58, status: 'attention' },
          { num: 3, label: 'safety_and_robustness', score: 81, status: 'partial' },
          { num: 4, label: 'fairness_and_human_oversight', score: 64, status: 'attention' },
        ],
        all_baseline_achieved: false,
      };
      req.flush(payload);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        expect(result.data.posture.length).toBe(4);
        expect(result.data.posture[0].label).toBe('accountability');
      }
    });

    it('classifies 401 as unauthorized', () => {
      const sig = service.dashboard();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/dashboard`);
      req.flush('', { status: 401, statusText: 'Unauthorized' });

      const result = sig();
      expect(result.state).toBe('error');
      if (result.state === 'error') {
        expect(result.error.kind).toBe('unauthorized');
        expect(result.error.status).toBe(401);
      }
    });

    it('classifies 403 as forbidden with auditor-required message', () => {
      const sig = service.dashboard();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/dashboard`);
      req.flush('', { status: 403, statusText: 'Forbidden' });

      const result = sig();
      expect(result.state).toBe('error');
      if (result.state === 'error') {
        expect(result.error.kind).toBe('forbidden');
        expect(result.error.messageKey).toContain('auditor');
      }
    });

    it('falls back to error when 5xx hits without cached data', () => {
      const sig = service.dashboard();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/dashboard`);
      req.flush('', { status: 503, statusText: 'Service Unavailable' });

      const result = sig();
      expect(result.state).toBe('error');
      if (result.state === 'error') {
        expect(result.error.kind).toBe('server');
      }
    });
  });

  describe('agents()', () => {
    it('returns the crews+agents hierarchy shape', () => {
      const sig = service.agents();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/agents`);

      const payload: AgentsData = {
        fetched_at: '2026-05-26T10:00:00Z',
        crews: [
          {
            crew_name: 'mcq_ai_assist',
            crew_id: 'crew-1',
            has_recent_activity: true,
            agents: [
              {
                agent_id: 'qgen_question',
                role: 'question generator',
                engine_id: '8635637442075951104',
                cloud_trace_template_url: 'https://console.cloud.google.com/traces',
                stats: {
                  invocations_24h: 12,
                  p95_latency_ms: 1450,
                  refusal_rate: 0.02,
                },
              },
            ],
          },
        ],
      };
      req.flush(payload);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        expect(result.data.crews.length).toBe(1);
        expect(result.data.crews[0].agents[0].engine_id).toBe('8635637442075951104');
      }
    });
  });

  describe('agentEval()', () => {
    it('polls /bff/oplus/eval-runs and returns the crew-run index', () => {
      const sig = service.agentEval();
      expect(sig().state).toBe('loading');

      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/eval-runs`);
      expect(req.request.method).toBe('GET');

      const payload: AgentEvalData = {
        fetched_at: '2026-06-06T21:00:00Z',
        runs: [
          {
            candidate_label: 'depbump0607',
            last_recorded_at: '2026-06-06T20:59:00Z',
            bigquery_url: null,
            members: [
              {
                experiment: 'chora-agent-eval-qgen-question',
                member_label: 'qgen-question',
                vertex_experiment_url: null,
                autorater_metrics: [{ metric: 'safety', count: 4, avg_score: 1 }],
                adversarial: { total: 6, blocked: 6, leaked: 0 },
              },
            ],
          },
        ],
      };
      req.flush(payload);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        expect(result.data.runs[0].candidate_label).toBe('depbump0607');
        expect(result.data.runs[0].members[0].adversarial?.blocked).toBe(6);
      }
    });
  });

  describe('agentEvalEvidence()', () => {
    it('fetches per-row evidence for one crew run with a path-encoded label', () => {
      let received: EvalEvidenceData | undefined;
      service.agentEvalEvidence('dep bump/07').subscribe((d) => (received = d));

      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/bff/oplus/eval-runs/dep%20bump%2F07`,
      );
      expect(req.request.method).toBe('GET');
      req.flush({ candidate_label: 'dep bump/07', rows: [] });

      expect(received?.candidate_label).toBe('dep bump/07');
    });
  });

  describe('prompts() - ADR-197 prompt-versioning read slice (CHO-2364)', () => {
    /** Canonical five-agent wire body (snake_case, exactly the BFF shape). */
    const WIRE: PromptsData = {
      agents: [
        {
          agent_id: 'qgen_question',
          crew_name: 'qgen',
          evidence_kind: 'decisions',
          decisions_total: 42,
          last_decision_at: '2026-07-24T09:00:00Z',
          latest_prompt_version: 'v1',
          latest_prompt_source: 'embedded',
          versions: [
            {
              prompt_version: 'v1',
              prompt_source: 'embedded',
              decisions: 42,
              last_seen: '2026-07-24T09:00:00Z',
            },
          ],
          use_cases: [
            {
              key: 'ai_assist_single',
              decisions: 28,
              last_seen: '2026-07-24T09:00:00Z',
              latest_prompt_version: 'v1',
              latest_prompt_source: 'embedded',
            },
            {
              key: 'batch',
              decisions: 14,
              last_seen: '2026-07-20T18:00:00Z',
              latest_prompt_version: 'v1',
              latest_prompt_source: 'embedded',
            },
            { key: 'daily_dose', decisions: 0 },
          ],
        },
        {
          agent_id: 'qgen_critic',
          crew_name: 'qgen',
          evidence_kind: 'decisions',
          decisions_total: 41,
          last_decision_at: '2026-07-24T09:01:00Z',
          latest_prompt_version: 'v1',
          latest_prompt_source: 'embedded',
          versions: [
            {
              prompt_version: 'v1',
              prompt_source: 'embedded',
              decisions: 41,
              last_seen: '2026-07-24T09:01:00Z',
            },
          ],
          use_cases: [
            {
              key: 'ai_assist_single',
              decisions: 27,
              last_seen: '2026-07-24T09:01:00Z',
              latest_prompt_version: 'v1',
              latest_prompt_source: 'embedded',
            },
            {
              key: 'batch',
              decisions: 14,
              last_seen: '2026-07-20T18:01:00Z',
              latest_prompt_version: 'v1',
              latest_prompt_source: 'embedded',
            },
            { key: 'daily_dose', decisions: 0 },
          ],
        },
        {
          agent_id: 'oe_evaluator',
          crew_name: 'oe_grading',
          evidence_kind: 'decisions',
          decisions_total: 7,
          last_decision_at: '2026-07-25T14:30:00Z',
          latest_prompt_version: 'v1',
          latest_prompt_source: 'embedded',
          versions: [
            {
              prompt_version: 'v1',
              prompt_source: 'embedded',
              decisions: 7,
              last_seen: '2026-07-25T14:30:00Z',
            },
          ],
        },
        {
          agent_id: 'oe_moderator',
          crew_name: 'oe_grading',
          evidence_kind: 'decisions',
          decisions_total: 0,
          versions: [],
        },
        {
          agent_id: 'familiar',
          crew_name: 'familiar',
          evidence_kind: 'ritual_stamps',
          runs_total: 12,
          last_run_at: '2026-07-26T08:00:00Z',
          versions: [
            { prompt_version: 'v1', runs: 12, last_seen: '2026-07-26T08:00:00Z' },
          ],
        },
      ],
    };

    it('polls /bff/oplus/prompts and parses the five-agent wire shape', () => {
      const sig = service.prompts();
      expect(sig().state).toBe('loading');

      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/prompts`);
      expect(req.request.method).toBe('GET');
      req.flush(WIRE);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        expect(result.data.agents.length).toBe(5);
        const q = result.data.agents[0];
        expect(q.agent_id).toBe('qgen_question');
        expect(q.crew_name).toBe('qgen');
        if (q.evidence_kind !== 'decisions') {
          expect.unreachable('qgen_question must be a decisions-kind row');
        }
        expect(q.decisions_total).toBe(42);
        expect(q.latest_prompt_version).toBe('v1');
        expect(q.latest_prompt_source).toBe('embedded');
        expect(q.versions[0].prompt_source).toBe('embedded');
        expect(q.use_cases?.length).toBe(3);
        expect(q.use_cases?.[0].key).toBe('ai_assist_single');

        const familiar = result.data.agents[4];
        if (familiar.evidence_kind !== 'ritual_stamps') {
          expect.unreachable('familiar must be a ritual_stamps row');
        }
        expect(familiar.runs_total).toBe(12);
        expect(familiar.versions[0].runs).toBe(12);
        expect(familiar.versions[0].prompt_version).toBe('v1');
      }
    });

    it('parses a zero-evidence row with the latest_*/last_* keys OMITTED', () => {
      const sig = service.prompts();
      httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/prompts`).flush(WIRE);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        const bare = result.data.agents[3];
        expect(bare.agent_id).toBe('oe_moderator');
        if (bare.evidence_kind !== 'decisions') {
          expect.unreachable('oe_moderator must be a decisions-kind row');
        }
        expect(bare.decisions_total).toBe(0);
        expect(bare.versions.length).toBe(0);
        // Omitted on the wire means undefined here - never a fabricated value.
        expect(bare.latest_prompt_version).toBeUndefined();
        expect(bare.latest_prompt_source).toBeUndefined();
        expect(bare.last_decision_at).toBeUndefined();
        expect(bare.use_cases).toBeUndefined();
      }
    });

    it('parses the zero-decision use-case row with its optional keys OMITTED', () => {
      const sig = service.prompts();
      httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/prompts`).flush(WIRE);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        const q = result.data.agents[0];
        if (q.evidence_kind !== 'decisions') {
          expect.unreachable('qgen_question must be a decisions-kind row');
        }
        const dose = q.use_cases?.find((u) => u.key === 'daily_dose');
        expect(dose).toBeDefined();
        expect(dose?.decisions).toBe(0);
        expect(dose?.latest_prompt_version).toBeUndefined();
        expect(dose?.latest_prompt_source).toBeUndefined();
        expect(dose?.last_seen).toBeUndefined();
      }
    });

    it('classifies 403 as forbidden (auditor-gated like the other five routes)', () => {
      const sig = service.prompts();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/prompts`);
      req.flush('', { status: 403, statusText: 'Forbidden' });

      const result = sig();
      expect(result.state).toBe('error');
      if (result.state === 'error') {
        expect(result.error.kind).toBe('forbidden');
        expect(result.error.messageKey).toContain('auditor');
      }
    });

    it('memoises prompts() - second call reuses the signal, no extra fetch', () => {
      const a = service.prompts();
      const b = service.prompts();
      expect(a).toBe(b);
      const reqs = httpMock.match(`${environment.bffBaseUrl}/bff/oplus/prompts`);
      expect(reqs.length).toBe(1);
      reqs[0].flush({ agents: [] } satisfies PromptsData);
    });

    it('retryPrompts() re-issues the GET immediately, without waiting for the 30s tick', () => {
      const sig = service.prompts();
      httpMock
        .expectOne(`${environment.bffBaseUrl}/bff/oplus/prompts`)
        .flush('', { status: 503, statusText: 'Service Unavailable' });
      expect(sig().state).toBe('error');

      service.retryPrompts();
      const retry = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/prompts`);
      retry.flush(WIRE);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        expect(result.data.agents.length).toBe(5);
      }
    });
  });

  describe('in-body error envelope (chora-gateway graceful-degradation)', () => {
    afterEach(() => {
      // Restore real timers in case a fake-timer scenario above left them
      // installed — keeps the rest of the suite on the real RxJS scheduler.
      vi.useRealTimers();
    });

    it('classifies a 200 {state:"error"} body as error when no cache exists (a)', () => {
      const sig = service.dimensions();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/dimensions`);
      // chora-gateway returns HTTP 200 with the degradation envelope when an
      // upstream collapses (e.g. mesh-authz 403 on /api/imda/dimensions/*).
      req.flush({ state: 'error', fetched_at: '2026-05-26T10:00:00Z', error: 'x' });

      const result = sig();
      expect(result.state).toBe('error');
      if (result.state === 'error') {
        expect(result.error.kind).toBe('server');
        expect(result.error.messageKey).toBe('oplus.errors.upstream');
      }
    });

    it('falls back to stale with the cached payload on a later error envelope (b)', () => {
      // Fake timers so the second 30s poll fires deterministically. Install
      // BEFORE the first getter call so the `interval` subscription is built
      // under fake timers.
      vi.useFakeTimers();
      const sig = service.dimensions();

      // First poll (startWith(0)) succeeds — populates the per-route cache.
      const first = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/dimensions`);
      const livePayload: DimensionsData = {
        fetched_at: '2026-05-26T10:00:00Z',
        dimensions: [
          {
            num: 1,
            label: 'accountability',
            score: 72,
            status: 'partial',
            rubric_items: [],
          },
        ],
      };
      first.flush(livePayload);
      expect(sig().state).toBe('live');

      // Advance to the next poll; it returns the degradation envelope.
      vi.advanceTimersByTime(GOVERNANCE_POLL_INTERVAL_MS);
      const second = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/dimensions`);
      second.flush({ state: 'error', fetched_at: '2026-05-26T10:00:30Z', error: 'x' });

      const result = sig();
      expect(result.state).toBe('stale');
      if (result.state === 'stale') {
        // The last-good payload is preserved, not blanked.
        expect(result.data.dimensions[0].label).toBe('accountability');
      }
    });

    it('treats a normal {state:"live"} body as live (c)', () => {
      const sig = service.dimensions();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/dimensions`);
      const payload: DimensionsData = {
        fetched_at: '2026-05-26T10:00:00Z',
        dimensions: [
          {
            num: 1,
            label: 'accountability',
            score: 72,
            status: 'partial',
            rubric_items: [],
          },
        ],
      };
      req.flush(payload);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        expect(result.data.dimensions.length).toBe(1);
      }
    });

    it('does NOT classify the a2a {state:"pending"} body as error (d)', () => {
      const sig = service.a2a();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/a2a`);
      // 'pending' !== 'error' — the a2a route legitimately returns a pending
      // envelope, which must flow through as live so the component reads `mode`.
      const payload: A2aData = {
        mode: 'pending',
        fetched_at: '2026-05-26T10:00:00Z',
        contracts: [],
        external_agents: [],
        invocations: [],
      };
      req.flush(payload);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        expect(result.data.mode).toBe('pending');
      }
    });

    it('treats the costs raw object (no state field) as live (e)', () => {
      const sig = service.costs();
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/costs`);
      // The costs route returns a raw object with NO `state` field (errors
      // surface as HTTP 503), so the guard never triggers.
      const payload: CostData = {
        fetched_at: '2026-05-26T10:00:00Z',
        cumulative_cost_usd: 12.48,
        by_model: [],
        by_agent: [],
      };
      req.flush(payload);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        expect(result.data.cumulative_cost_usd).toBe(12.48);
      }
    });

    it('default cost range is all-time and hits the unqualified URL', () => {
      service.costs();
      httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/costs`).flush({
        fetched_at: '2026-06-29T10:00:00Z',
        cumulative_cost_usd: 1,
        by_model: [],
        by_agent: [],
      } satisfies CostData);
      expect(service.costRange()()).toBe('all');
    });

    it('setCostRange re-polls costs with ?range=<window>', () => {
      const sig = service.costs();
      httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/costs`).flush({
        fetched_at: '2026-06-29T10:00:00Z',
        cumulative_cost_usd: 1,
        by_model: [],
        by_agent: [],
      } satisfies CostData);

      service.setCostRange('month');
      expect(service.costRange()()).toBe('month');
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/bff/oplus/costs?range=month`,
      );
      req.flush({
        fetched_at: '2026-06-29T10:05:00Z',
        cumulative_cost_usd: 2,
        by_model: [],
        by_agent: [],
      } satisfies CostData);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        expect(result.data.cumulative_cost_usd).toBe(2);
      }
    });
  });

  describe('helper guards + variant mapping', () => {
    it('badgeVariant maps live→live, stale→stale, error→offline, loading→loading', () => {
      const live: GovernanceState<number> = {
        state: 'live',
        data: 1,
        fetchedAt: new Date(),
      };
      const stale: GovernanceState<number> = {
        state: 'stale',
        data: 1,
        since: new Date(),
      };
      const error: GovernanceState<number> = {
        state: 'error',
        error: { kind: 'unknown', messageKey: 'x' },
      };
      const loading: GovernanceState<number> = { state: 'loading' };

      expect(badgeVariant(live)).toBe('live');
      expect(badgeVariant(stale)).toBe('stale');
      expect(badgeVariant(error)).toBe('offline');
      expect(badgeVariant(loading)).toBe('loading');
    });

    it('isLive + isStale + hasData narrow correctly', () => {
      const live: GovernanceState<number> = {
        state: 'live',
        data: 42,
        fetchedAt: new Date(),
      };
      const stale: GovernanceState<number> = {
        state: 'stale',
        data: 100,
        since: new Date(),
      };
      const err: GovernanceState<number> = {
        state: 'error',
        error: { kind: 'unknown', messageKey: 'x' },
      };

      expect(isLive(live)).toBe(true);
      expect(isLive(stale)).toBe(false);
      expect(isStale(stale)).toBe(true);
      expect(isStale(live)).toBe(false);
      expect(hasData(live)).toBe(true);
      expect(hasData(stale)).toBe(true);
      expect(hasData(err)).toBe(false);
    });
  });

  describe('dataOrNull', () => {
    it('returns null for loading + error states', () => {
      const sig = service.dashboard();
      const data = dataOrNull(sig);
      expect(data()).toBeNull();

      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/dashboard`);
      req.flush('', { status: 500, statusText: 'Server Error' });

      expect(data()).toBeNull();
    });

    it('exposes the payload for live states', () => {
      const sig = service.dashboard();
      const data = dataOrNull(sig);
      const req = httpMock.expectOne(`${environment.bffBaseUrl}/bff/oplus/dashboard`);
      const payload: DashboardData = {
        fetched_at: '2026-05-26T10:00:00Z',
        posture: [],
        all_baseline_achieved: false,
      };
      req.flush(payload);
      expect(data()).not.toBeNull();
      expect(data()?.fetched_at).toBe('2026-05-26T10:00:00Z');
    });
  });

  describe('lazy signal creation', () => {
    it('returns the same signal instance on repeated dashboard() calls', () => {
      const a = service.dashboard();
      const b = service.dashboard();
      expect(a).toBe(b);
      // Only one HTTP request should have been issued.
      const reqs = httpMock.match(`${environment.bffBaseUrl}/bff/oplus/dashboard`);
      expect(reqs.length).toBe(1);
      reqs[0].flush({
        fetched_at: '',
        posture: [],
        all_baseline_achieved: false,
      });
    });

    // ── Else-arm (memoised) of every lazy getter: second call must return
    //    the SAME cached signal and issue NO second HTTP request. This drives
    //    the `if (this._x === undefined)` FALSE arm for each route getter. ──

    it('memoises dimensions() — second call reuses the signal, no extra fetch', () => {
      const a = service.dimensions();
      const b = service.dimensions();
      expect(a).toBe(b);
      const reqs = httpMock.match(`${environment.bffBaseUrl}/bff/oplus/dimensions`);
      expect(reqs.length).toBe(1);
      reqs[0].flush({ fetched_at: '', dimensions: [] });
    });

    it('memoises agents() — second call reuses the signal, no extra fetch', () => {
      const a = service.agents();
      const b = service.agents();
      expect(a).toBe(b);
      const reqs = httpMock.match(`${environment.bffBaseUrl}/bff/oplus/agents`);
      expect(reqs.length).toBe(1);
      reqs[0].flush({ fetched_at: '', crews: [] });
    });

    it('memoises a2a() — second call reuses the signal, no extra fetch', () => {
      const a = service.a2a();
      const b = service.a2a();
      expect(a).toBe(b);
      const reqs = httpMock.match(`${environment.bffBaseUrl}/bff/oplus/a2a`);
      expect(reqs.length).toBe(1);
      reqs[0].flush({
        mode: 'live',
        fetched_at: '',
        contracts: [],
        external_agents: [],
        invocations: [],
      });
    });

    it('memoises costs() — second call reuses the signal, no extra fetch', () => {
      const a = service.costs();
      const b = service.costs();
      expect(a).toBe(b);
      const reqs = httpMock.match(`${environment.bffBaseUrl}/bff/oplus/costs`);
      expect(reqs.length).toBe(1);
      reqs[0].flush({
        fetched_at: '',
        cumulative_cost_usd: 0,
        by_model: [],
        by_agent: [],
      });
    });
  });

  describe('governance() route', () => {
    // governance() is the one lazy getter never previously exercised — this
    // drives BOTH arms of its `if (this._governance === undefined)` guard and
    // the route's GET wiring + live mapping.
    it('issues the GET and maps a successful body to live', () => {
      const sig = service.governance();
      expect(sig().state).toBe('loading');

      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/bff/oplus/governance`,
      );
      expect(req.request.method).toBe('GET');

      const payload: GovernanceData = {
        fetched_at: '2026-05-26T10:00:00Z',
        decisions: [
          {
            id: 'd1',
            workflow_id: 'wf1',
            agent: 'critic',
            agent_slug: 'critic',
            decision_type: 'accept',
            model: 'gemini-2.5-pro',
            timestamp: '2026-05-26T09:59:00Z',
            trace_id: 'abc123',
          },
        ],
        hitl_pending: [],
        data_lineage: [],
      };
      req.flush(payload);

      const result = sig();
      expect(result.state).toBe('live');
      if (result.state === 'live') {
        expect(result.data.decisions[0].agent_slug).toBe('critic');
      }
    });

    it('memoises governance() — second call reuses the signal (else arm)', () => {
      const a = service.governance();
      const b = service.governance();
      expect(a).toBe(b);
      const reqs = httpMock.match(
        `${environment.bffBaseUrl}/bff/oplus/governance`,
      );
      expect(reqs.length).toBe(1);
      reqs[0].flush({ fetched_at: '', decisions: [], hitl_pending: [], data_lineage: [] });
    });
  });

  describe('classifyError — remaining HTTP status arms', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('classifies a numeric non-401/403/5xx status (404) as unknown', () => {
      // status >= 500 is FALSE and status is a number → unknown kind branch.
      const sig = service.dashboard();
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}/bff/oplus/dashboard`,
      );
      req.flush('', { status: 404, statusText: 'Not Found' });

      const result = sig();
      expect(result.state).toBe('error');
      if (result.state === 'error') {
        expect(result.error.kind).toBe('unknown');
        expect(result.error.messageKey).toBe('oplus.errors.generic');
        expect(result.error.status).toBe(404);
      }
    });

    it('falls back to STALE on a 5xx when a prior payload is cached', () => {
      // Install fake timers BEFORE the first getter so the interval timer is
      // deterministic, then advance to the second poll which 503s.
      vi.useFakeTimers();
      const sig = service.dashboard();

      const first = httpMock.expectOne(
        `${environment.bffBaseUrl}/bff/oplus/dashboard`,
      );
      const livePayload: DashboardData = {
        fetched_at: '2026-05-26T10:00:00Z',
        posture: [
          { num: 1, label: 'accountability', score: 72, status: 'partial' },
        ],
        all_baseline_achieved: false,
      };
      first.flush(livePayload);
      expect(sig().state).toBe('live');

      vi.advanceTimersByTime(GOVERNANCE_POLL_INTERVAL_MS);
      const second = httpMock.expectOne(
        `${environment.bffBaseUrl}/bff/oplus/dashboard`,
      );
      second.flush('', { status: 503, statusText: 'Service Unavailable' });

      const result = sig();
      // 5xx WITH cache → stale (last-good payload preserved, not blanked).
      expect(result.state).toBe('stale');
      if (result.state === 'stale') {
        expect(result.data.posture[0].label).toBe('accountability');
      }
    });
  });

  describe('classifyError — defensive non-HTTP error arms (characterization)', () => {
    // The catchError path always receives an HttpErrorResponse with a numeric
    // `status` (0 for transport failures), so the network/undefined-status and
    // non-numeric-status arms of classifyError + extractStatus are unreachable
    // through the live HTTP pipe. They are defensive guards. We characterize
    // them by invoking the private methods directly via a typed structural
    // cast (no `any`), keeping the spec green and the branches covered.
    interface ErrorClassifier {
      classifyError<T>(err: unknown, cached: T | null): GovernanceState<T>;
      extractStatus(err: unknown): number | undefined;
    }
    let probe: ErrorClassifier;

    beforeEach(() => {
      probe = service as unknown as ErrorClassifier;
    });

    it('maps an error WITHOUT a numeric status to the network kind', () => {
      // err is a plain object lacking `status` → extractStatus returns
      // undefined → classifyError falls through to the network branch.
      const result = probe.classifyError({ message: 'boom' }, null);
      expect(result.state).toBe('error');
      if (result.state === 'error') {
        expect(result.error.kind).toBe('network');
        expect(result.error.messageKey).toBe('oplus.errors.network');
        expect(result.error.status).toBeUndefined();
      }
    });

    it('extractStatus returns undefined for null, non-object, and non-number status', () => {
      // null short-circuits the `err !== null` guard (false arm).
      expect(probe.extractStatus(null)).toBeUndefined();
      // a primitive (string) fails `typeof err === 'object'` (false arm).
      expect(probe.extractStatus('not-an-object')).toBeUndefined();
      // object without a `status` property fails `'status' in err`.
      expect(probe.extractStatus({ foo: 1 })).toBeUndefined();
      // `status` present but NOT a number fails the inner `typeof s === 'number'`.
      expect(probe.extractStatus({ status: 'oops' })).toBeUndefined();
      // through-case: a numeric status flows through.
      expect(probe.extractStatus({ status: 418 })).toBe(418);
    });
  });
});
