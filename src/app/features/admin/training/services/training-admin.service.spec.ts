import { expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import {
  TrainingAdminService,
  TrainingSession,
  LiveSessionData,
  ComplianceDashboardData,
  AtomSearchResult,
  CreateSessionRequest,
} from './training-admin.service';
import { environment } from '../../../../../environments/environment';

const TRAINING = `${environment.bffBaseUrl}/api/v1/training-admin`;
const ATOMS_SEARCH = `${environment.bffBaseUrl}/api/v1/atomic/atoms/search`;

function makeSession(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: 'sess-001',
    tenant_id: 'tenant-001',
    title: 'Scrum Fundamentals',
    description: 'Intro to agile',
    status: 'scheduled',
    scheduled_at: '2026-07-01T09:00:00Z',
    duration_minutes: 120,
    agenda: [],
    trainer_gcid: '00000000-0000-7000-8000-000000001999',
    max_participants: 30,
    venue_id: null,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function makeLiveData(): LiveSessionData {
  return {
    session: makeSession({ status: 'live' }),
    attendance_count: 18,
    total_expected: 25,
    current_agenda_index: 2,
    engagement_score: 0.82,
    late_arrivals: 3,
  };
}

function makeCompliance(): ComplianceDashboardData {
  return {
    departments: [
      {
        department_id: 'dept-1',
        department_name: 'Engineering',
        status: 'amber',
        completed_count: 7,
        required_count: 10,
        completion_pct: 70,
        deadline: '2026-08-01',
        days_remaining: 30,
        overdue_learners: 1,
      },
    ],
    overall_completion_pct: 70,
    total_overdue: 1,
    next_deadline: '2026-08-01',
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

  it('starts every signal in the idle state with empty computeds', () => {
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

  it('POSTs to /sessions and flips sessionState to success', async () => {
    const body: CreateSessionRequest = {
      title: 'Scrum Fundamentals',
      description: 'Intro to agile',
      scheduled_at: '2026-07-01T09:00:00Z',
      duration_minutes: 120,
      agenda: [],
      max_participants: 30,
    };
    const promise = firstValueFrom(service.createSession(body));

    // loading state is set synchronously before the HTTP completes
    expect(service.sessionState().status).toBe('loading');

    const req = httpMock.expectOne(`${TRAINING}/sessions`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    const session = makeSession();
    req.flush(session);

    const result = await promise;
    expect(result).toEqual(session);
    expect(service.sessionState().status).toBe('success');
    expect(service.currentSession()?.id).toBe('sess-001');
  });

  it('createSession 5xx error -> error state with SESSION_CREATE_FAILED and emits null', async () => {
    const promise = firstValueFrom(
      service.createSession({
        title: 't',
        description: 'd',
        scheduled_at: 's',
        duration_minutes: 10,
        agenda: [],
        max_participants: 5,
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
      expect(typeof state.error.message).toBe('string');
    }
    expect(service.currentSession()).toBeNull();
  });

  // -------------------------------------------------------------------------
  // getSession
  // -------------------------------------------------------------------------

  it('GETs a single session by url-encoded id and stores it', async () => {
    const promise = firstValueFrom(service.getSession('sess/with space'));
    expect(service.sessionState().status).toBe('loading');

    const req = httpMock.expectOne(
      `${TRAINING}/sessions/${encodeURIComponent('sess/with space')}`,
    );
    expect(req.request.method).toBe('GET');
    req.flush(makeSession({ id: 'sess/with space' }));

    const result = await promise;
    expect(result?.id).toBe('sess/with space');
    expect(service.currentSession()?.id).toBe('sess/with space');
  });

  it('getSession 404 -> error state SESSION_GET_FAILED', async () => {
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

  it('GETs the /live endpoint and stores LiveSessionData', async () => {
    const promise = firstValueFrom(service.getLiveSession('sess-001'));
    expect(service.liveSessionState().status).toBe('loading');

    const req = httpMock.expectOne(`${TRAINING}/sessions/sess-001/live`);
    expect(req.request.method).toBe('GET');
    const data = makeLiveData();
    req.flush(data);

    const result = await promise;
    expect(result).toEqual(data);
    expect(service.liveData()?.attendance_count).toBe(18);
    expect(service.liveData()?.engagement_score).toBe(0.82);
  });

  it('getLiveSession error -> LIVE_SESSION_FAILED and null', async () => {
    const promise = firstValueFrom(service.getLiveSession('sess-001'));
    httpMock
      .expectOne(`${TRAINING}/sessions/sess-001/live`)
      .flush('x', { status: 503, statusText: 'Unavailable' });

    expect(await promise).toBeNull();
    const state = service.liveSessionState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('LIVE_SESSION_FAILED');
    }
  });

  // -------------------------------------------------------------------------
  // advanceAgenda
  // -------------------------------------------------------------------------

  it('advanceAgenda POSTs /advance and updates liveSessionState on success', async () => {
    const promise = firstValueFrom(service.advanceAgenda('sess-001'));
    const req = httpMock.expectOne(`${TRAINING}/sessions/sess-001/advance`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    const data = makeLiveData();
    req.flush(data);

    const result = await promise;
    expect(result).toEqual(data);
    expect(service.liveData()?.current_agenda_index).toBe(2);
  });

  it('advanceAgenda swallows errors and emits null without touching liveSessionState', async () => {
    // start from a known success state
    const setup = firstValueFrom(service.getLiveSession('sess-001'));
    httpMock.expectOne(`${TRAINING}/sessions/sess-001/live`).flush(makeLiveData());
    await setup;
    expect(service.liveSessionState().status).toBe('success');

    const promise = firstValueFrom(service.advanceAgenda('sess-001'));
    httpMock
      .expectOne(`${TRAINING}/sessions/sess-001/advance`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    expect(await promise).toBeNull();
    // error path does NOT reset the live state
    expect(service.liveSessionState().status).toBe('success');
  });

  // -------------------------------------------------------------------------
  // getAttendance
  // -------------------------------------------------------------------------
  // NOTE (production behaviour, NOT a fix): getAttendance uses `tap` (which
  // does not transform the stream) so the cast to AttendanceRecord[] actually
  // leaks the raw `{ data: [...] }` wrapper at runtime. We characterize the
  // ACTUAL emitted value.

  it('getAttendance GETs /attendance and emits the raw wrapper object (tap does not map)', async () => {
    const promise = firstValueFrom(service.getAttendance('sess-001'));
    const req = httpMock.expectOne(`${TRAINING}/sessions/sess-001/attendance`);
    expect(req.request.method).toBe('GET');
    const records = [
      {
        gcid: 'g1',
        display_name: 'Alice',
        checked_in_at: '2026-07-01T09:05:00Z',
        is_late: false,
        is_manual_override: false,
      },
    ];
    req.flush({ data: records });

    const result = (await promise) as unknown as { data: unknown[] };
    // The cast claims AttendanceRecord[] but the runtime value is the wrapper.
    expect(result).toEqual({ data: records });
  });

  it('getAttendance error -> emits the fallback wrapper { data: [] }', async () => {
    const promise = firstValueFrom(service.getAttendance('sess-001'));
    httpMock
      .expectOne(`${TRAINING}/sessions/sess-001/attendance`)
      .flush('x', { status: 500, statusText: 'Server Error' });

    const result = (await promise) as unknown as { data: unknown[] };
    expect(result).toEqual({ data: [] });
  });

  // -------------------------------------------------------------------------
  // overrideAttendance
  // -------------------------------------------------------------------------
  // NOTE: `tap(() => true)` does not transform — the emitted value is the raw
  // HTTP body on success, and `false` only on the catchError path.

  it('overrideAttendance POSTs /attendance/override with the gcid body', async () => {
    const promise = firstValueFrom(
      service.overrideAttendance('sess-001', 'gcid-xyz'),
    );
    const req = httpMock.expectOne(
      `${TRAINING}/sessions/sess-001/attendance/override`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ gcid: 'gcid-xyz' });
    req.flush({ ok: true });

    // tap does not map -> success path emits the raw body, not `true`
    const result = await promise;
    expect(result as unknown).toEqual({ ok: true });
  });

  it('overrideAttendance returns false on error', async () => {
    const promise = firstValueFrom(
      service.overrideAttendance('sess-001', 'gcid-xyz'),
    );
    httpMock
      .expectOne(`${TRAINING}/sessions/sess-001/attendance/override`)
      .flush('x', { status: 500, statusText: 'Server Error' });
    expect(await promise).toBe(false);
  });

  // -------------------------------------------------------------------------
  // loadCompliance
  // -------------------------------------------------------------------------

  it('loadCompliance GETs /compliance and stores the dashboard', async () => {
    const promise = firstValueFrom(service.loadCompliance());
    expect(service.complianceState().status).toBe('loading');

    const req = httpMock.expectOne(`${TRAINING}/compliance`);
    expect(req.request.method).toBe('GET');
    const data = makeCompliance();
    req.flush(data);

    const result = await promise;
    expect(result).toEqual(data);
    expect(service.complianceData()?.overall_completion_pct).toBe(70);
    expect(service.complianceData()?.departments).toHaveLength(1);
  });

  it('loadCompliance error -> COMPLIANCE_LOAD_FAILED', async () => {
    const promise = firstValueFrom(service.loadCompliance());
    httpMock
      .expectOne(`${TRAINING}/compliance`)
      .flush('x', { status: 502, statusText: 'Bad Gateway' });

    expect(await promise).toBeNull();
    const state = service.complianceState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('COMPLIANCE_LOAD_FAILED');
    }
  });

  // -------------------------------------------------------------------------
  // scheduleRemediation
  // -------------------------------------------------------------------------

  it('scheduleRemediation POSTs /compliance/{dept}/remediate', async () => {
    const promise = firstValueFrom(service.scheduleRemediation('dept 1'));
    const req = httpMock.expectOne(
      `${TRAINING}/compliance/${encodeURIComponent('dept 1')}/remediate`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ scheduled: true });
    // tap does not map -> raw body emitted on success
    expect((await promise) as unknown).toEqual({ scheduled: true });
  });

  it('scheduleRemediation returns false on error', async () => {
    const promise = firstValueFrom(service.scheduleRemediation('dept-1'));
    httpMock
      .expectOne(`${TRAINING}/compliance/dept-1/remediate`)
      .flush('x', { status: 500, statusText: 'Server Error' });
    expect(await promise).toBe(false);
  });

  // -------------------------------------------------------------------------
  // searchAtoms
  // -------------------------------------------------------------------------

  it('searchAtoms GETs /atoms/search?q= and stores results', async () => {
    const promise = firstValueFrom(service.searchAtoms('binary search'));
    expect(service.atomSearchState().status).toBe('loading');

    const req = httpMock.expectOne(
      `${ATOMS_SEARCH}?q=${encodeURIComponent('binary search')}`,
    );
    expect(req.request.method).toBe('GET');
    const results: AtomSearchResult[] = [
      {
        id: 'atom-1',
        title: 'Binary Search',
        type: 'concept',
        topic_name: 'Algorithms',
        difficulty: 3,
      },
    ];
    req.flush({ data: results });

    await promise;
    const state = service.atomSearchState();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.results).toEqual(results);
    }
    expect(service.atomResults()).toEqual(results);
  });

  it('searchAtoms tolerates a missing data field (success with empty results)', async () => {
    const promise = firstValueFrom(service.searchAtoms('x'));
    httpMock
      .expectOne(`${ATOMS_SEARCH}?q=x`)
      .flush({});
    await promise;
    const state = service.atomSearchState();
    expect(state.status).toBe('success');
    expect(service.atomResults()).toEqual([]);
  });

  it('searchAtoms error -> ATOM_SEARCH_FAILED and emits fallback wrapper', async () => {
    const promise = firstValueFrom(service.searchAtoms('boom'));
    httpMock
      .expectOne(`${ATOMS_SEARCH}?q=boom`)
      .flush('x', { status: 500, statusText: 'Server Error' });

    const result = (await promise) as unknown as { data: unknown[] };
    expect(result).toEqual({ data: [] });
    const state = service.atomSearchState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error.code).toBe('ATOM_SEARCH_FAILED');
    }
    expect(service.atomResults()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // resetState
  // -------------------------------------------------------------------------

  it('resetState returns every signal to idle', async () => {
    // drive a couple of states to success first
    const p1 = firstValueFrom(service.getSession('s1'));
    httpMock.expectOne(`${TRAINING}/sessions/s1`).flush(makeSession());
    await p1;

    const p2 = firstValueFrom(service.loadCompliance());
    httpMock.expectOne(`${TRAINING}/compliance`).flush(makeCompliance());
    await p2;

    expect(service.sessionState().status).toBe('success');
    expect(service.complianceState().status).toBe('success');

    service.resetState();

    expect(service.sessionState().status).toBe('idle');
    expect(service.liveSessionState().status).toBe('idle');
    expect(service.complianceState().status).toBe('idle');
    expect(service.atomSearchState().status).toBe('idle');
    expect(service.currentSession()).toBeNull();
    expect(service.complianceData()).toBeNull();
  });
});
