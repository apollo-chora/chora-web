import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { A2AConsentService } from './a2a-consent.service';
import { environment } from '../../../../environments/environment';
import {
  A2AConsent,
  A2AActivityEntry,
  A2ATask,
  A2ASkill,
  ConsentScope,
  ConsentDuration,
  PartnerStatus,
  ConsentGrantRequest,
  ConsentScopeModification,
} from '../../admin/a2a/models/a2a.model';

const BASE = environment.bffBaseUrl;

function makeConsent(overrides: Partial<A2AConsent> = {}): A2AConsent {
  return {
    id: 'consent-1',
    partnerId: 'partner-1',
    partnerName: 'Acme Tutors',
    partnerStatus: PartnerStatus.Verified,
    agentName: 'StudyBuddy',
    skill: A2ASkill.StudyConversation,
    scope: ConsentScope.TopicsOnly,
    duration: ConsentDuration.SevenDays,
    grantedAt: '2026-06-01T00:00:00Z',
    expiresAt: '2026-06-08T00:00:00Z',
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function makeTask(overrides: Partial<A2ATask> = {}): A2ATask {
  return {
    id: 'task-1',
    partnerId: 'partner-1',
    partnerName: 'Acme Tutors',
    agentName: 'StudyBuddy',
    skill: A2ASkill.StudyConversation,
    status: 'active',
    startedAt: '2026-06-01T00:00:00Z',
    completedAt: null,
    ...overrides,
  };
}

function makeActivity(overrides: Partial<A2AActivityEntry> = {}): A2AActivityEntry {
  return {
    id: 'activity-1',
    consentId: 'consent-1',
    partnerId: 'partner-1',
    partnerName: 'Acme Tutors',
    agentName: 'StudyBuddy',
    skill: A2ASkill.StudyConversation,
    action: 'invoked',
    timestamp: '2026-06-01T01:00:00Z',
    details: {},
    ...overrides,
  };
}

describe('A2AConsentService', () => {
  let service: A2AConsentService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(A2AConsentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ---------------------------------------------------------------------------
  // Pre-existing tests (DO NOT MODIFY)
  // ---------------------------------------------------------------------------

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with loading state for grants', () => {
    expect(service.grantsState().status).toBe('loading');
  });

  it('should return empty array from grants computed when loading', () => {
    expect(service.grants()).toEqual([]);
  });

  it('should return empty array from activeGrants when loading', () => {
    expect(service.activeGrants()).toEqual([]);
  });

  it('should return false from hasActiveA2ASession when loading', () => {
    expect(service.hasActiveA2ASession()).toBe(false);
  });

  it('should set isSubmitting to false initially', () => {
    expect(service.isSubmitting()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Initial state of the other signals
  // ---------------------------------------------------------------------------

  it('initializes activityLogState + activeTasksState as loading', () => {
    expect(service.activityLogState().status).toBe('loading');
    expect(service.activeTasksState().status).toBe('loading');
  });

  it('returns empty arrays from activeTasks + activityLog computed when loading', () => {
    expect(service.activeTasks()).toEqual([]);
    expect(service.activityLog()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // getActiveGrants
  // ---------------------------------------------------------------------------

  it('GETs /api/v1/a2a/consents and populates grantsState on success', async () => {
    const grant = makeConsent();
    const promise = firstValueFrom(service.getActiveGrants());

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/consents`);
    expect(req.request.method).toBe('GET');
    req.flush([grant]);

    const data = await promise;
    expect(data).toEqual([grant]);
    expect(service.grantsState().status).toBe('success');
    expect(service.grants()).toEqual([grant]);
  });

  it('filters revoked grants out of activeGrants computed', async () => {
    const active = makeConsent({ id: 'a', revokedAt: null });
    const revoked = makeConsent({ id: 'b', revokedAt: '2026-06-02T00:00:00Z' });
    const promise = firstValueFrom(service.getActiveGrants());

    httpMock.expectOne(`${BASE}/api/v1/a2a/consents`).flush([active, revoked]);
    await promise;

    expect(service.grants()).toHaveLength(2);
    expect(service.activeGrants()).toEqual([active]);
  });

  it('sets grantsState to error and emits [] when getActiveGrants 5xx', async () => {
    const promise = firstValueFrom(service.getActiveGrants());

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/consents`)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    const data = await promise;
    expect(data).toEqual([]);
    const s = service.grantsState();
    expect(s.status).toBe('error');
    expect(service.grants()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // grantConsent
  // ---------------------------------------------------------------------------

  it('POSTs a new consent and appends it to a populated grantsState', async () => {
    // Seed grantsState with one existing grant.
    const existing = makeConsent({ id: 'existing' });
    const seedP = firstValueFrom(service.getActiveGrants());
    httpMock.expectOne(`${BASE}/api/v1/a2a/consents`).flush([existing]);
    await seedP;

    const request: ConsentGrantRequest = {
      partnerId: 'partner-1',
      agentName: 'StudyBuddy',
      skill: A2ASkill.StudyConversation,
      scope: ConsentScope.TopicsOnly,
      duration: ConsentDuration.SevenDays,
      webauthnCredential: 'cred-xyz',
    };
    const created = makeConsent({ id: 'new' });
    const promise = firstValueFrom(service.grantConsent(request));

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/consents`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(created);

    const result = await promise;
    expect(result).toEqual(created);
    expect(service.isSubmitting()).toBe(false);
    expect(service.grants().map((g) => g.id)).toEqual(['existing', 'new']);
  });

  it('does NOT append the grant when grantsState is still loading', async () => {
    const request: ConsentGrantRequest = {
      partnerId: 'p',
      agentName: 'a',
      skill: A2ASkill.QuizGeneration,
      scope: ConsentScope.FullPersona,
      duration: ConsentDuration.UntilRevoked,
      webauthnCredential: 'cred',
    };
    const created = makeConsent({ id: 'new' });
    const promise = firstValueFrom(service.grantConsent(request));

    httpMock.expectOne(`${BASE}/api/v1/a2a/consents`).flush(created);
    const result = await promise;

    // grantsState was loading (never fetched), so the list is not updated.
    expect(result).toEqual(created);
    expect(service.grantsState().status).toBe('loading');
    expect(service.grants()).toEqual([]);
  });

  it('returns null and resets isSubmitting when grantConsent fails', async () => {
    const request: ConsentGrantRequest = {
      partnerId: 'p',
      agentName: 'a',
      skill: A2ASkill.PersonaSync,
      scope: ConsentScope.LearningStyle,
      duration: ConsentDuration.ThirtyDays,
      webauthnCredential: 'cred',
    };
    const promise = firstValueFrom(service.grantConsent(request));

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/consents`)
      .flush('nope', { status: 400, statusText: 'Bad Request' });

    const result = await promise;
    expect(result).toBeNull();
    expect(service.isSubmitting()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // revokeConsent
  // ---------------------------------------------------------------------------

  it('POSTs revoke and replaces the matching consent in the list', async () => {
    const seed = makeConsent({ id: 'consent-1', revokedAt: null });
    const seedP = firstValueFrom(service.getActiveGrants());
    httpMock.expectOne(`${BASE}/api/v1/a2a/consents`).flush([seed]);
    await seedP;

    const revoked = makeConsent({ id: 'consent-1', revokedAt: '2026-06-03T00:00:00Z' });
    const promise = firstValueFrom(service.revokeConsent('consent-1'));

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/consents/consent-1/revoke`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(revoked);

    const result = await promise;
    expect(result).toEqual(revoked);
    expect(service.grants()[0]!.revokedAt).toBe('2026-06-03T00:00:00Z');
    expect(service.activeGrants()).toEqual([]);
    expect(service.isSubmitting()).toBe(false);
  });

  it('leaves grants untouched when revoking a non-matching id', async () => {
    const seed = makeConsent({ id: 'consent-1' });
    const seedP = firstValueFrom(service.getActiveGrants());
    httpMock.expectOne(`${BASE}/api/v1/a2a/consents`).flush([seed]);
    await seedP;

    const other = makeConsent({ id: 'consent-other', revokedAt: '2026-06-03T00:00:00Z' });
    const promise = firstValueFrom(service.revokeConsent('consent-other'));
    httpMock.expectOne(`${BASE}/api/v1/a2a/consents/consent-other/revoke`).flush(other);
    await promise;

    // The single existing grant is unchanged because ids do not match.
    expect(service.grants()).toEqual([seed]);
  });

  it('returns null and resets isSubmitting when revokeConsent fails', async () => {
    const promise = firstValueFrom(service.revokeConsent('consent-1'));

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/consents/consent-1/revoke`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    const result = await promise;
    expect(result).toBeNull();
    expect(service.isSubmitting()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // modifyScope
  // ---------------------------------------------------------------------------

  it('PUTs scope modification and updates the matching consent', async () => {
    const seed = makeConsent({ id: 'consent-1', scope: ConsentScope.TopicsOnly });
    const seedP = firstValueFrom(service.getActiveGrants());
    httpMock.expectOne(`${BASE}/api/v1/a2a/consents`).flush([seed]);
    await seedP;

    const modification: ConsentScopeModification = {
      consentId: 'consent-1',
      newScope: ConsentScope.FullPersona,
      webauthnCredential: 'cred',
    };
    const updated = makeConsent({ id: 'consent-1', scope: ConsentScope.FullPersona });
    const promise = firstValueFrom(service.modifyScope(modification));

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/consents/consent-1/scope`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(modification);
    req.flush(updated);

    const result = await promise;
    expect(result).toEqual(updated);
    expect(service.grants()[0]!.scope).toBe(ConsentScope.FullPersona);
    expect(service.isSubmitting()).toBe(false);
  });

  it('returns null and resets isSubmitting when modifyScope fails', async () => {
    const modification: ConsentScopeModification = {
      consentId: 'consent-1',
      newScope: ConsentScope.LearningStyle,
      webauthnCredential: 'cred',
    };
    const promise = firstValueFrom(service.modifyScope(modification));

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/consents/consent-1/scope`)
      .flush('err', { status: 403, statusText: 'Forbidden' });

    const result = await promise;
    expect(result).toBeNull();
    expect(service.isSubmitting()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // getActivityLog
  // ---------------------------------------------------------------------------

  it('GETs the activity log and populates activityLogState on success', async () => {
    const entry = makeActivity();
    const promise = firstValueFrom(service.getActivityLog('consent-1'));

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/consents/consent-1/activity`);
    expect(req.request.method).toBe('GET');
    req.flush([entry]);

    const data = await promise;
    expect(data).toEqual([entry]);
    expect(service.activityLogState().status).toBe('success');
    expect(service.activityLog()).toEqual([entry]);
  });

  it('sets activityLogState to error and emits [] when activity log fails', async () => {
    const promise = firstValueFrom(service.getActivityLog('consent-1'));

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/consents/consent-1/activity`)
      .flush('err', { status: 404, statusText: 'Not Found' });

    const data = await promise;
    expect(data).toEqual([]);
    expect(service.activityLogState().status).toBe('error');
    expect(service.activityLog()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // getActiveTasks
  // ---------------------------------------------------------------------------

  it('GETs active tasks and filters activeTasks computed to status="active"', async () => {
    const active = makeTask({ id: 't-active', status: 'active' });
    const completed = makeTask({ id: 't-done', status: 'completed' });
    const promise = firstValueFrom(service.getActiveTasks());

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/tasks/active`);
    expect(req.request.method).toBe('GET');
    req.flush([active, completed]);

    const data = await promise;
    expect(data).toHaveLength(2);
    expect(service.activeTasksState().status).toBe('success');
    expect(service.activeTasks()).toEqual([active]);
    expect(service.hasActiveA2ASession()).toBe(true);
  });

  it('reports no active session when no tasks are active', async () => {
    const completed = makeTask({ id: 't-done', status: 'completed' });
    const promise = firstValueFrom(service.getActiveTasks());

    httpMock.expectOne(`${BASE}/api/v1/a2a/tasks/active`).flush([completed]);
    await promise;

    expect(service.activeTasks()).toEqual([]);
    expect(service.hasActiveA2ASession()).toBe(false);
  });

  it('sets activeTasksState to error and emits [] when active tasks fails', async () => {
    const promise = firstValueFrom(service.getActiveTasks());

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/tasks/active`)
      .flush('err', { status: 503, statusText: 'Service Unavailable' });

    const data = await promise;
    expect(data).toEqual([]);
    expect(service.activeTasksState().status).toBe('error');
    expect(service.hasActiveA2ASession()).toBe(false);
  });
});
