import { expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { DailyDoseService } from './daily-dose.service';
import type { DailyDose } from './daily-dose.model';
import { environment } from '../../../../../environments/environment';

const DOSE_URL = `${environment.bffBaseUrl}/api/familiar/daily-dose`;
const GQL_URL = `${environment.bffBaseUrl}/api/v1/graphql`;
const AI_URL = `${environment.bffBaseUrl}/api/familiar/daily-dose/ai`;

function makeDose(): DailyDose {
  return {
    doseId: 'dose-1',
    servedOn: '2026-06-04',
    atoms: [],
    composition: { reviewPercent: 40, newPercent: 30, stretchPercent: 30 },
    totalXpAvailable: 100,
    nextDoseAt: '2026-06-05T00:00:00Z',
    familiarName: 'Pyra',
    familiarLevel: 3,
    familiarQuote: 'Keep going!',
  };
}

function makeStreakResponse() {
  return {
    data: {
      myStreak: {
        currentDays: 5,
        status: 'active',
        longestStreak: 12,
        lastActivityAt: '2026-06-03T10:00:00Z',
      },
    },
  };
}

describe('DailyDoseService', () => {
  let service: DailyDoseService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DailyDoseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Drain any pending progressive-enhancement AI enrichment call (fired after
    // every successful dose load). Flushed degraded so it is a no-op merge and
    // never interferes with the assertions of tests that don't target it.
    for (const req of httpMock.match((r) => r.url.endsWith('/api/familiar/daily-dose/ai'))) {
      if (!req.cancelled) {
        req.flush({ greeting: '', ai_picks: [], narrative: '', degraded: true });
      }
    }
    httpMock.verify();
  });

  it('starts in loading state before load() resolves', () => {
    // initial signal value is loading; dose() selector returns null
    expect(service.state().status).toBe('loading');
    expect(service.dose()).toBeNull();
  });

  it('sets loading immediately when load() is called', () => {
    service.load();
    // synchronously loading until both HTTP responses flush
    expect(service.state().status).toBe('loading');
    expect(service.dose()).toBeNull();

    // satisfy the in-flight requests so afterEach verify() passes
    httpMock.expectOne(DOSE_URL).flush(makeDose());
    httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
  });

  it('merges dose + streak on full success (streak != null ternary TRUE arm)', () => {
    service.load();

    httpMock.expectOne(DOSE_URL).flush(makeDose());
    httpMock.expectOne(GQL_URL).flush(makeStreakResponse());

    const s = service.state();
    expect(s.status).toBe('success');
    const dose = service.dose();
    expect(dose).not.toBeNull();
    expect(dose!.doseId).toBe('dose-1');
    expect(dose!.streak).toEqual({
      currentDays: 5,
      longestStreak: 12,
      lastActivityAt: '2026-06-03T10:00:00Z',
      status: 'active',
    });
  });

  it('GETs the dose endpoint and POSTs the streak query', () => {
    service.load();

    const doseReq = httpMock.expectOne(DOSE_URL);
    expect(doseReq.request.method).toBe('GET');
    doseReq.flush(makeDose());

    const gqlReq = httpMock.expectOne(GQL_URL);
    expect(gqlReq.request.method).toBe('POST');
    gqlReq.flush(makeStreakResponse());

    expect(service.state().status).toBe('success');
  });

  it('renders dose without streak when GraphQL streak errors (catchError -> null, ternary FALSE arm)', () => {
    service.load();

    httpMock.expectOne(DOSE_URL).flush(makeDose());
    // streak GraphQL call fails -> catchError(() => of(null))
    httpMock
      .expectOne(GQL_URL)
      .flush(null, { status: 500, statusText: 'Server Error' });

    const dose = service.dose();
    expect(service.state().status).toBe('success');
    expect(dose).not.toBeNull();
    expect(dose!.doseId).toBe('dose-1');
    expect(dose!.streak).toBeUndefined();
  });

  it('renders dose without streak when GraphQL returns errors-only body', () => {
    service.load();

    httpMock.expectOne(DOSE_URL).flush(makeDose());
    // data null + errors present -> GraphQLClientError thrown -> caught -> null
    httpMock.expectOne(GQL_URL).flush({
      data: null,
      errors: [{ message: 'boom' }],
    });

    expect(service.state().status).toBe('success');
    expect(service.dose()!.streak).toBeUndefined();
  });

  it('error state with engine-unavailable key on dose 503', () => {
    service.load();

    // Flush the streak first so it has emitted before forkJoin errors on the
    // dose request; otherwise the dose error cancels the in-flight GQL request.
    httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    httpMock
      .expectOne(DOSE_URL)
      .flush(null, { status: 503, statusText: 'Service Unavailable' });

    const s = service.state();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('aplus.daily_dose.error_engine_unavailable');
    }
    expect(service.dose()).toBeNull();
  });

  it('error state with upstream key on dose 500 (>=500, not 503)', () => {
    service.load();

    httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    httpMock
      .expectOne(DOSE_URL)
      .flush(null, { status: 500, statusText: 'Server Error' });

    const s = service.state();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('aplus.daily_dose.error_upstream');
    }
  });

  it('error state with unauthorised key on dose 401', () => {
    service.load();

    httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    httpMock
      .expectOne(DOSE_URL)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    const s = service.state();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('aplus.daily_dose.error_unauthorised');
    }
  });

  it('error state with unauthorised key on dose 403 (|| short-circuit second arm)', () => {
    service.load();

    httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    httpMock
      .expectOne(DOSE_URL)
      .flush(null, { status: 403, statusText: 'Forbidden' });

    const s = service.state();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('aplus.daily_dose.error_unauthorised');
    }
  });

  it('error state with generic key on dose 4xx that is not 401/403', () => {
    service.load();

    httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    httpMock
      .expectOne(DOSE_URL)
      .flush(null, { status: 404, statusText: 'Not Found' });

    const s = service.state();
    expect(s.status).toBe('error');
    if (s.status === 'error') {
      expect(s.error).toBe('aplus.daily_dose.error_generic');
    }
  });

  it('load() is safe to call repeatedly (resets to loading then resolves)', () => {
    // first cycle
    service.load();
    httpMock.expectOne(DOSE_URL).flush(makeDose());
    httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    expect(service.state().status).toBe('success');

    // second cycle resets to loading
    service.load();
    expect(service.state().status).toBe('loading');
    httpMock.expectOne(DOSE_URL).flush(makeDose());
    httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    expect(service.state().status).toBe('success');
  });

  // ── Focused mode (Growth Edge deep-link) ───────────────────────────
  //
  // Phase 2B: the dashboard links a learner to the Daily Dose scoped to one
  // Growth Edge via `?growth_edge_id=<id>`. The service forwards that id as a
  // `growth_edge_id` query param. When absent, the request MUST stay
  // byte-identical to today's legacy call (no params). The parallel streak
  // fetch is unchanged either way.
  describe('focused mode (growth_edge_id)', () => {
    it('load(growthEdgeId) carries growth_edge_id as a query param', () => {
      service.load('edge-1');

      // expectOne(string) matches urlWithParams; the focused request appends a
      // query string, so match on the bare path instead.
      const doseReq = httpMock.expectOne((r) => r.url === DOSE_URL);
      expect(doseReq.request.method).toBe('GET');
      expect(doseReq.request.params.get('growth_edge_id')).toBe('edge-1');
      expect(doseReq.request.urlWithParams).toContain('growth_edge_id=edge-1');
      doseReq.flush(makeDose());

      // streak fetch is unchanged.
      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
      expect(service.state().status).toBe('success');
    });

    it('load() with no arg issues the byte-identical legacy request (no growth_edge_id)', () => {
      service.load();

      const doseReq = httpMock.expectOne(DOSE_URL);
      // urlWithParams equals the bare URL ⇒ no query string was appended.
      expect(doseReq.request.urlWithParams).toBe(DOSE_URL);
      expect(doseReq.request.params.has('growth_edge_id')).toBe(false);
      doseReq.flush(makeDose());

      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
      expect(service.state().status).toBe('success');
    });

    it('treats a whitespace-only growthEdgeId as absent (no param)', () => {
      service.load('   ');

      const doseReq = httpMock.expectOne(DOSE_URL);
      expect(doseReq.request.urlWithParams).toBe(DOSE_URL);
      expect(doseReq.request.params.has('growth_edge_id')).toBe(false);
      doseReq.flush(makeDose());

      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    });
  });

  // ── Goal-scoped dose (goal_id) ──────────────────────────────────────
  //
  // The map deep-links into a dose scoped to one Goal via `?goal_id=<id>`.
  // The service forwards it as a `goal_id` query param, INDEPENDENTLY of
  // `growth_edge_id` (either, both, or neither may be present). When absent
  // the request MUST stay byte-identical to the legacy call.
  //
  // Assertions read `urlWithParams`, not just `params`: a param that is set
  // on the HttpParams but lost when the URL is rebuilt would otherwise pass.
  describe('goal-scoped dose (goal_id)', () => {
    it('load(undefined, goalId) carries goal_id as a query param', () => {
      service.load(undefined, 'goal-1');

      const doseReq = httpMock.expectOne((r) => r.url === DOSE_URL);
      expect(doseReq.request.method).toBe('GET');
      expect(doseReq.request.params.get('goal_id')).toBe('goal-1');
      expect(doseReq.request.urlWithParams).toContain('goal_id=goal-1');
      // Goal scoping alone must NOT imply a growth-edge scope.
      expect(doseReq.request.params.has('growth_edge_id')).toBe(false);
      doseReq.flush(makeDose());

      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
      expect(service.state().status).toBe('success');
    });

    it('carries BOTH growth_edge_id and goal_id when both are supplied', () => {
      service.load('edge-1', 'goal-1');

      const doseReq = httpMock.expectOne((r) => r.url === DOSE_URL);
      expect(doseReq.request.params.get('growth_edge_id')).toBe('edge-1');
      expect(doseReq.request.params.get('goal_id')).toBe('goal-1');
      expect(doseReq.request.urlWithParams).toContain('growth_edge_id=edge-1');
      expect(doseReq.request.urlWithParams).toContain('goal_id=goal-1');
      doseReq.flush(makeDose());

      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
      expect(service.state().status).toBe('success');
    });

    it('omits goal_id entirely when only a growth edge is supplied', () => {
      service.load('edge-1');

      const doseReq = httpMock.expectOne((r) => r.url === DOSE_URL);
      expect(doseReq.request.params.has('goal_id')).toBe(false);
      expect(doseReq.request.urlWithParams).not.toContain('goal_id');
      doseReq.flush(makeDose());

      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    });

    // ADR-242 D2: a goal-scoped response carries a `scope` block disclosing how
    // the served cards split three ways. The service casts the wire body, so
    // this pins the MODEL shape: the snake_case keys must survive unrenamed all
    // the way to the component, and an absent block must stay absent (never
    // defaulted to zeros, which would read as a real measured split).
    it('passes the goal-scope disclosure block through to the dose', () => {
      service.load(undefined, 'goal-1');

      httpMock.expectOne((r) => r.url === DOSE_URL).flush({
        ...makeDose(),
        scope: { goal_id: 'goal-1', from_goal: 3, on_topics: 1, broader: 1 },
      });
      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());

      expect(service.dose()?.scope).toEqual({
        goal_id: 'goal-1',
        from_goal: 3,
        on_topics: 1,
        broader: 1,
      });
    });

    it('leaves scope undefined when the response omits the block', () => {
      service.load(undefined, 'goal-1');

      httpMock.expectOne((r) => r.url === DOSE_URL).flush(makeDose());
      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());

      expect(service.dose()).not.toBeNull();
      expect(service.dose()?.scope).toBeUndefined();
    });

    it('treats a whitespace-only goalId as absent (byte-identical legacy call)', () => {
      service.load(undefined, '   ');

      const doseReq = httpMock.expectOne(DOSE_URL);
      expect(doseReq.request.urlWithParams).toBe(DOSE_URL);
      expect(doseReq.request.params.has('goal_id')).toBe(false);
      doseReq.flush(makeDose());

      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    });
  });

  // ── AI enrichment (GET /api/familiar/daily-dose/ai) ─────────────────
  //
  // Progressive enhancement (B2-C / ADR-196): once the deterministic dose is in
  // the success state the service fetches the REAL personalised Familiar
  // greeting (+ Recommender narrative) and publishes them to the aiGreeting /
  // aiNarrative signals. The call NEVER blocks the dose render and fails soft —
  // on error/degrade/empty the deterministic greeting stays.
  describe('AI enrichment (daily-dose/ai)', () => {
    /** Resolve the deterministic dose so the AI enrichment fires. */
    function resolveDose(): void {
      httpMock.expectOne(DOSE_URL).flush(makeDose());
      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
    }

    it('fires GET /daily-dose/ai only AFTER the deterministic dose succeeds', () => {
      service.load();
      // Progressive enhancement: nothing hits /ai until the dose resolves.
      expect(httpMock.match((r) => r.url === AI_URL).length).toBe(0);

      resolveDose();

      const aiReq = httpMock.expectOne((r) => r.url === AI_URL);
      expect(aiReq.request.method).toBe('GET');
      aiReq.flush({
        greeting: 'Welcome back, Phyllis.',
        ai_picks: [],
        narrative: '',
        degraded: false,
      });
      expect(service.aiGreeting()).toBe('Welcome back, Phyllis.');
    });

    it('publishes greeting + narrative to the signals on a non-degraded response', () => {
      service.load();
      resolveDose();
      httpMock.expectOne((r) => r.url === AI_URL).flush({
        greeting: "Eira here — let's revisit Sprint Review.",
        ai_picks: ['atom-rec-001', 'atom-rec-002'],
        narrative: 'Two Ebbinghaus-overdue atoms plus one fresh tile.',
        degraded: false,
      });
      expect(service.aiGreeting()).toBe("Eira here — let's revisit Sprint Review.");
      expect(service.aiNarrative()).toBe(
        'Two Ebbinghaus-overdue atoms plus one fresh tile.',
      );
      // Dose state is untouched by the enrichment (no effect re-run).
      expect(service.state().status).toBe('success');
    });

    it('keeps the deterministic greeting (signals null) when the response is degraded', () => {
      service.load();
      resolveDose();
      httpMock.expectOne((r) => r.url === AI_URL).flush({
        greeting: 'Eira here — templated fallback.',
        ai_picks: [],
        narrative: 'templated narrative',
        degraded: true,
      });
      expect(service.aiGreeting()).toBeNull();
      expect(service.aiNarrative()).toBeNull();
    });

    it('keeps the deterministic greeting when /daily-dose/ai errors (fail-soft, no throw)', () => {
      service.load();
      resolveDose();
      httpMock
        .expectOne((r) => r.url === AI_URL)
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      expect(service.aiGreeting()).toBeNull();
      // The dose is unaffected by the AI failure.
      expect(service.state().status).toBe('success');
    });

    it('ignores a whitespace-only greeting/narrative on a non-degraded response', () => {
      service.load();
      resolveDose();
      httpMock.expectOne((r) => r.url === AI_URL).flush({
        greeting: '   ',
        ai_picks: [],
        narrative: '   ',
        degraded: false,
      });
      expect(service.aiGreeting()).toBeNull();
      expect(service.aiNarrative()).toBeNull();
    });

    it('does NOT fire the AI call when the deterministic dose fails', () => {
      service.load();
      // Flush streak first so the dose error doesn't cancel the in-flight GQL.
      httpMock.expectOne(GQL_URL).flush(makeStreakResponse());
      httpMock
        .expectOne(DOSE_URL)
        .flush(null, { status: 503, statusText: 'Service Unavailable' });
      expect(service.state().status).toBe('error');
      expect(httpMock.match((r) => r.url === AI_URL).length).toBe(0);
    });

    it('resets aiGreeting/aiNarrative to null at the start of a new load()', () => {
      service.load();
      resolveDose();
      httpMock.expectOne((r) => r.url === AI_URL).flush({
        greeting: 'first',
        ai_picks: [],
        narrative: 'n',
        degraded: false,
      });
      expect(service.aiGreeting()).toBe('first');

      // A fresh load clears the previous enrichment immediately.
      service.load();
      expect(service.aiGreeting()).toBeNull();
      expect(service.aiNarrative()).toBeNull();

      // Drain cycle 2 so afterEach verify() is clean.
      resolveDose();
      httpMock.expectOne((r) => r.url === AI_URL).flush({
        greeting: '',
        ai_picks: [],
        narrative: '',
        degraded: true,
      });
    });
  });
});
