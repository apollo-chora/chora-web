import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import {
  TrainingAdminService,
  type TrainingSession,
  type CreateSessionRequest,
  type LiveSessionData,
  type ComplianceDashboardData,
  type AtomSearchResult,
} from './training-admin.service';
import { environment } from '../../../../environments/environment';

const BASE = environment.bffBaseUrl;
const TRAINING = `${BASE}/api/v1/training-admin`;

function makeSession(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: 'sess-001',
    tenant_id: 'tenant-001',
    title: 'Scrum Foundations',
    description: 'Intro to Scrum',
    status: 'scheduled',
    scheduled_at: '2026-07-01T09:00:00Z',
    duration_minutes: 120,
    agenda: [],
    trainer_gcid: '00000000-0000-7000-8000-000000000001',
    max_participants: 20,
    venue_id: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function makeLiveData(): LiveSessionData {
  return {
    session: makeSession({ status: 'live' }),
    attendance_count: 12,
    total_expected: 20,
    current_agenda_index: 2,
    engagement_score: 0.87,
    late_arrivals: 3,
  };
}

function makeCompliance(): ComplianceDashboardData {
  return {
    departments: [
      {
        department_id: 'dept-eng',
        department_name: 'Engineering',
        status: 'amber',
        completed_count: 8,
        required_count: 10,
        completion_pct: 80,
        deadline: '2026-08-01T00:00:00Z',
        days_remaining: 30,
        overdue_learners: 2,
      },
    ],
    overall_completion_pct: 80,
    total_overdue: 2,
    next_deadline: '2026-08-01T00:00:00Z',
  };
}

describe('TrainingAdminService', () => {
  let service: TrainingAdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TrainingAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts all signal states idle with empty computed views', () => {
    expect(service.sessionState().status).toBe('idle');
    expect(service.liveSessionState().status).toBe('idle');
    expect(service.complianceState().status).toBe('idle');
    expect(service.atomSearchState().status).toBe('idle');

    expect(service.currentSession()).toBeNull();
    expect(service.liveData()).toBeNull();
    expect(service.complianceData()).toBeNull();
    expect(service.atomResults()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // createSession
  // -------------------------------------------------------------------------

  it('createSession sets loading then success and POSTs the session body', async () => {
    const body: CreateSessionRequest = {
      title: 'Scrum Foundations',
      description: 'Intro to Scrum',
      scheduled_at: '2026-07-01T09:00:00Z',
      duration_minutes: 120,
      agenda: [],
      max_participants: 20,
    };
    const promise = firstValueFrom(service.createSession(body));

    // synchronous loading state before flush
    expect(service.sessionState().status).toBe('loading');

    const req = httpMock.expectOne(`${TRAINING}/sessions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);

    const session = makeSession();
    req.flush(session);

    const result = await promise;
    expect(result).toEqual(session);
    expect(service.sessionState()).toEqual({ status: 'success', session });
    expect(service.currentSession()).toEqual(session);
  });

  it('createSession captures a 500 error into error state and emits null', async () => {
    const promise = firstValueFrom(
      service.createSession({
        title: 'X',
        description: '',
        scheduled_at: '2026-07-01T09:00:00Z',
        duration_minutes: 60,
        agenda: [],
        max_participants: 10,
      }),
    );

    httpMock
      .expectOne(`${TRAINING}/sessions`)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    const result = await promise;
    expect(result).toBeNull();

    const state = service.sessionState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('SESSION_CREATE_FAILED');
    }
    expect(service.currentSession()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // getSession
  // -------------------------------------------------------------------------

  it('getSession GETs the URL-encoded session path and stores success', async () => {
    const promise = firstValueFrom(service.getSession('sess/with space'));

    expect(service.sessionState().status).toBe('loading');

    const req = httpMock.expectOne(
      `${TRAINING}/sessions/${encodeURIComponent('sess/with space')}`,
    );
    expect(req.request.method).toBe('GET');

    const session = makeSession({ id: 'sess/with space' });
    req.flush(session);

    const result = await promise;
    expect(result).toEqual(session);
    expect(service.currentSession()).toEqual(session);
  });

  it('getSession captures a 404 error into error state and emits null', async () => {
    const promise = firstValueFrom(service.getSession('missing'));

    httpMock
      .expectOne(`${TRAINING}/sessions/missing`)
      .flush('nope', { status: 404, statusText: 'Not Found' });

    const result = await promise;
    expect(result).toBeNull();
    const state = service.sessionState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('SESSION_GET_FAILED');
    }
  });

  // -------------------------------------------------------------------------
  // getLiveSession
  // -------------------------------------------------------------------------

  it('getLiveSession GETs the /live path and stores success data', async () => {
    const promise = firstValueFrom(service.getLiveSession('sess-001'));

    expect(service.liveSessionState().status).toBe('loading');

    const req = httpMock.expectOne(`${TRAINING}/sessions/sess-001/live`);
    expect(req.request.method).toBe('GET');

    const data = makeLiveData();
    req.flush(data);

    const result = await promise;
    expect(result).toEqual(data);
    expect(service.liveData()).toEqual(data);
  });

  it('getLiveSession captures error into LIVE_SESSION_FAILED and emits null', async () => {
    const promise = firstValueFrom(service.getLiveSession('sess-001'));

    httpMock
      .expectOne(`${TRAINING}/sessions/sess-001/live`)
      .flush('err', { status: 503, statusText: 'Unavailable' });

    const result = await promise;
    expect(result).toBeNull();
    const state = service.liveSessionState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('LIVE_SESSION_FAILED');
    }
  });

  // -------------------------------------------------------------------------
  // advanceAgenda
  // -------------------------------------------------------------------------

  it('advanceAgenda POSTs an empty body and stores success live data', async () => {
    const promise = firstValueFrom(service.advanceAgenda('sess-001'));

    const req = httpMock.expectOne(`${TRAINING}/sessions/sess-001/advance`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});

    const data = makeLiveData();
    req.flush(data);

    const result = await promise;
    expect(result).toEqual(data);
    expect(service.liveData()).toEqual(data);
  });

  it('advanceAgenda swallows errors and emits null without touching state', async () => {
    const promise = firstValueFrom(service.advanceAgenda('sess-001'));

    httpMock
      .expectOne(`${TRAINING}/sessions/sess-001/advance`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    const result = await promise;
    expect(result).toBeNull();
    // catchError returns of(null) without setting an error state
    expect(service.liveSessionState().status).toBe('idle');
  });

  // -------------------------------------------------------------------------
  // getAttendance — characterizes a PRODUCTION BUG (see notes)
  // -------------------------------------------------------------------------

  it('getAttendance GETs the /attendance path (returns wrapper object — prod bug)', async () => {
    const records = [
      {
        gcid: 'g-1',
        display_name: 'Alice',
        checked_in_at: '2026-07-01T09:05:00Z',
        is_late: false,
        is_manual_override: false,
      },
    ];
    const promise = firstValueFrom(service.getAttendance('sess-001'));

    const req = httpMock.expectOne(`${TRAINING}/sessions/sess-001/attendance`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: records });

    const result = (await promise) as unknown as { data: typeof records };
    // BUG: the `.data` unwrap is done with `tap` (a no-op), so the wrapper
    // object leaks through instead of the AttendanceRecord[] the type claims.
    expect(result).toEqual({ data: records });
    expect(result.data[0]!.display_name).toBe('Alice');
  });

  it('getAttendance returns { data: [] } on error (caught)', async () => {
    const promise = firstValueFrom(service.getAttendance('sess-001'));

    httpMock
      .expectOne(`${TRAINING}/sessions/sess-001/attendance`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    const result = (await promise) as unknown as { data: unknown[] };
    expect(result).toEqual({ data: [] });
  });

  // -------------------------------------------------------------------------
  // overrideAttendance — characterizes a PRODUCTION BUG (see notes)
  // -------------------------------------------------------------------------

  it('overrideAttendance POSTs the gcid (returns raw body, not boolean — prod bug)', async () => {
    const promise = firstValueFrom(
      service.overrideAttendance('sess-001', 'g-1'),
    );

    const req = httpMock.expectOne(
      `${TRAINING}/sessions/sess-001/attendance/override`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ gcid: 'g-1' });

    req.flush({ ok: true });

    // BUG: tap(() => true) is a no-op, so the raw response body is emitted
    // rather than the `true` the boolean return type implies.
    const result = (await promise) as unknown;
    expect(result).toEqual({ ok: true });
  });

  it('overrideAttendance emits false on error', async () => {
    const promise = firstValueFrom(
      service.overrideAttendance('sess-001', 'g-1'),
    );

    httpMock
      .expectOne(`${TRAINING}/sessions/sess-001/attendance/override`)
      .flush('err', { status: 400, statusText: 'Bad Request' });

    expect(await promise).toBe(false);
  });

  // -------------------------------------------------------------------------
  // loadCompliance
  // -------------------------------------------------------------------------

  it('loadCompliance GETs /compliance, sets loading then success', async () => {
    const promise = firstValueFrom(service.loadCompliance());

    expect(service.complianceState().status).toBe('loading');

    const req = httpMock.expectOne(`${TRAINING}/compliance`);
    expect(req.request.method).toBe('GET');

    const data = makeCompliance();
    req.flush(data);

    const result = await promise;
    expect(result).toEqual(data);
    expect(service.complianceData()).toEqual(data);
    expect(service.complianceData()!.departments[0]!.department_name).toBe(
      'Engineering',
    );
  });

  it('loadCompliance captures error into COMPLIANCE_LOAD_FAILED and emits null', async () => {
    const promise = firstValueFrom(service.loadCompliance());

    httpMock
      .expectOne(`${TRAINING}/compliance`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    const result = await promise;
    expect(result).toBeNull();
    const state = service.complianceState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('COMPLIANCE_LOAD_FAILED');
    }
    expect(service.complianceData()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // scheduleRemediation — characterizes a PRODUCTION BUG (see notes)
  // -------------------------------------------------------------------------

  it('scheduleRemediation POSTs the remediate path (returns raw body — prod bug)', async () => {
    const promise = firstValueFrom(
      service.scheduleRemediation('dept eng'),
    );

    const req = httpMock.expectOne(
      `${TRAINING}/compliance/${encodeURIComponent('dept eng')}/remediate`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});

    req.flush({ scheduled: true });

    // BUG: tap(() => true) no-op leaks the raw body.
    const result = (await promise) as unknown;
    expect(result).toEqual({ scheduled: true });
  });

  it('scheduleRemediation emits false on error', async () => {
    const promise = firstValueFrom(service.scheduleRemediation('dept-eng'));

    httpMock
      .expectOne(`${TRAINING}/compliance/dept-eng/remediate`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    expect(await promise).toBe(false);
  });

  // -------------------------------------------------------------------------
  // searchAtoms — state is correct; the returned observable leaks the wrapper
  // -------------------------------------------------------------------------

  it('searchAtoms GETs the encoded query and updates atomSearchState success', async () => {
    const results: AtomSearchResult[] = [
      { id: 'a-1', title: 'Sprint Planning', type: 'concept', topic_name: 'Scrum', difficulty: 2 },
    ];
    const promise = firstValueFrom(service.searchAtoms('scrum basics'));

    expect(service.atomSearchState().status).toBe('loading');

    const req = httpMock.expectOne(
      `${BASE}/api/v1/atomic/atoms/search?q=${encodeURIComponent('scrum basics')}`,
    );
    expect(req.request.method).toBe('GET');
    req.flush({ data: results });

    // The returned observable leaks the wrapper object (tap no-op), but the
    // signal state (and atomResults computed) correctly hold the array.
    await promise;
    expect(service.atomSearchState()).toEqual({
      status: 'success',
      results,
    });
    expect(service.atomResults()).toEqual(results);
    expect(service.atomResults()[0]!.title).toBe('Sprint Planning');
  });

  it('searchAtoms defaults to [] results when the payload omits data', async () => {
    const promise = firstValueFrom(service.searchAtoms('empty'));

    httpMock
      .expectOne(`${BASE}/api/v1/atomic/atoms/search?q=empty`)
      .flush({});

    await promise;
    expect(service.atomResults()).toEqual([]);
    expect(service.atomSearchState().status).toBe('success');
  });

  it('searchAtoms captures error into ATOM_SEARCH_FAILED and yields empty results', async () => {
    const promise = firstValueFrom(service.searchAtoms('boom'));

    httpMock
      .expectOne(`${BASE}/api/v1/atomic/atoms/search?q=boom`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    await promise;
    const state = service.atomSearchState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('ATOM_SEARCH_FAILED');
    }
    // computed falls back to [] for non-success states
    expect(service.atomResults()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // resetState
  // -------------------------------------------------------------------------

  it('resetState returns every signal to idle', async () => {
    const promise = firstValueFrom(service.loadCompliance());
    httpMock.expectOne(`${TRAINING}/compliance`).flush(makeCompliance());
    await promise;
    expect(service.complianceState().status).toBe('success');

    service.resetState();

    expect(service.sessionState().status).toBe('idle');
    expect(service.liveSessionState().status).toBe('idle');
    expect(service.complianceState().status).toBe('idle');
    expect(service.atomSearchState().status).toBe('idle');
    expect(service.complianceData()).toBeNull();
  });
});
