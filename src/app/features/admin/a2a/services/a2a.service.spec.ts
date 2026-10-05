import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { A2AService } from './a2a.service';
import { environment } from '../../../../../environments/environment';
import {
  A2APartner,
  PartnerStatus,
  A2ASkill,
  PartnerRegistration,
  PartnerSuspension,
  SuspensionImpact,
  SuspensionHistoryEntry,
} from '../models/a2a.model';

const BASE = environment.bffBaseUrl;

function makePartner(overrides: Partial<A2APartner> = {}): A2APartner {
  return {
    id: 'partner-1',
    orgName: 'Acme Tutors',
    orgDomain: 'acme.example',
    contactEmail: 'admin@acme.example',
    status: PartnerStatus.Pending,
    allowedSkills: [A2ASkill.StudyConversation],
    maxAgents: 5,
    rateLimitPerHour: 1000,
    dnsChallenge: 'chora-verify=abc123',
    verifiedAt: null,
    suspendedAt: null,
    suspensionReason: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('A2AService', () => {
  let service: A2AService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(A2AService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ---------------------------------------------------------------------------
  // Pre-existing tests (DO NOT WEAKEN)
  // ---------------------------------------------------------------------------

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with loading state for partners', () => {
    expect(service.partnersState().status).toBe('loading');
  });

  it('should return empty array from partners computed when loading', () => {
    expect(service.partners()).toEqual([]);
  });

  it('should return null from partnerDetail computed when loading', () => {
    expect(service.partnerDetail()).toBeNull();
  });

  it('should set isSubmitting to false initially', () => {
    expect(service.isSubmitting()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // getPartners
  // ---------------------------------------------------------------------------

  it('GETs /api/v1/a2a/partners and stores success state', async () => {
    const partners = [makePartner(), makePartner({ id: 'partner-2', orgName: 'Beta' })];
    const promise = firstValueFrom(service.getPartners());

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/partners`);
    expect(req.request.method).toBe('GET');
    req.flush(partners);

    const result = await promise;
    expect(result).toEqual(partners);
    expect(service.partnersState().status).toBe('success');
    expect(service.partners()).toHaveLength(2);
    expect(service.partners()[0]!.orgName).toBe('Acme Tutors');
  });

  it('getPartners catches a 500 error, sets error state, returns []', async () => {
    const promise = firstValueFrom(service.getPartners());

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners`)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    const result = await promise;
    expect(result).toEqual([]);
    const state = service.partnersState();
    expect(state.status).toBe('error');
    if (state.status === 'error') {
      expect(state.error).toBeTruthy();
    }
    // computed falls back to [] on error
    expect(service.partners()).toEqual([]);
  });

  it('getPartners sets loading state synchronously before the request resolves', () => {
    service.partnersState.set({ status: 'success', data: [makePartner()] });
    firstValueFrom(service.getPartners());
    expect(service.partnersState().status).toBe('loading');
    httpMock.expectOne(`${BASE}/api/v1/a2a/partners`).flush([]);
  });

  // ---------------------------------------------------------------------------
  // getPartnerDetail
  // ---------------------------------------------------------------------------

  it('GETs /api/v1/a2a/partners/{id} and stores detail success state', async () => {
    const partner = makePartner({ id: 'p-77' });
    const promise = firstValueFrom(service.getPartnerDetail('p-77'));

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/partners/p-77`);
    expect(req.request.method).toBe('GET');
    req.flush(partner);

    const result = await promise;
    expect(result).toEqual(partner);
    expect(service.partnerDetailState().status).toBe('success');
    expect(service.partnerDetail()).toEqual(partner);
  });

  it('getPartnerDetail catches a 404, sets error state, returns null', async () => {
    const promise = firstValueFrom(service.getPartnerDetail('missing'));

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/missing`)
      .flush('nope', { status: 404, statusText: 'Not Found' });

    const result = await promise;
    expect(result).toBeNull();
    expect(service.partnerDetailState().status).toBe('error');
    expect(service.partnerDetail()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // registerPartner
  // ---------------------------------------------------------------------------

  const registration: PartnerRegistration = {
    orgName: 'New Org',
    orgDomain: 'neworg.example',
    contactEmail: 'hi@neworg.example',
    allowedSkills: [A2ASkill.QuizGeneration],
    maxAgents: 3,
    rateLimitPerHour: 500,
  };

  it('POSTs registration to /api/v1/a2a/partners and appends to existing list', async () => {
    const existing = makePartner({ id: 'existing' });
    service.partnersState.set({ status: 'success', data: [existing] });

    const created = makePartner({ id: 'created', orgName: 'New Org' });
    const promise = firstValueFrom(service.registerPartner(registration));

    expect(service.isSubmitting()).toBe(true);

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/partners`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(registration);
    req.flush(created);

    const result = await promise;
    expect(result).toEqual(created);
    expect(service.isSubmitting()).toBe(false);
    expect(service.partners()).toHaveLength(2);
    expect(service.partners().map((p) => p.id)).toContain('created');
  });

  it('registerPartner does NOT append when partners list is not yet successfully loaded', async () => {
    // default state is 'loading'
    const created = makePartner({ id: 'created' });
    const promise = firstValueFrom(service.registerPartner(registration));

    httpMock.expectOne(`${BASE}/api/v1/a2a/partners`).flush(created);

    const result = await promise;
    expect(result).toEqual(created);
    // list still loading -> computed returns []
    expect(service.partners()).toEqual([]);
    expect(service.isSubmitting()).toBe(false);
  });

  it('registerPartner catches a 422 error, resets isSubmitting, sets partners error state', async () => {
    const promise = firstValueFrom(service.registerPartner(registration));
    expect(service.isSubmitting()).toBe(true);

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners`)
      .flush('invalid', { status: 422, statusText: 'Unprocessable' });

    const result = await promise;
    expect(result).toBeNull();
    expect(service.isSubmitting()).toBe(false);
    expect(service.partnersState().status).toBe('error');
  });

  // ---------------------------------------------------------------------------
  // checkDnsVerification
  // ---------------------------------------------------------------------------

  it('GETs verify-dns and stores verified=true success state', async () => {
    const promise = firstValueFrom(service.checkDnsVerification('p-9'));

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/partners/p-9/verify-dns`);
    expect(req.request.method).toBe('GET');
    req.flush({ verified: true });

    const result = await promise;
    expect(result).toEqual({ verified: true });
    const state = service.dnsVerificationState();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.data.verified).toBe(true);
    }
  });

  it('checkDnsVerification catches an error, sets error state, returns null', async () => {
    const promise = firstValueFrom(service.checkDnsVerification('p-9'));

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/p-9/verify-dns`)
      .flush('dns fail', { status: 503, statusText: 'Unavailable' });

    const result = await promise;
    expect(result).toBeNull();
    expect(service.dnsVerificationState().status).toBe('error');
  });

  // ---------------------------------------------------------------------------
  // getSuspensionImpact
  // ---------------------------------------------------------------------------

  it('GETs suspension-impact and stores success state', async () => {
    const impact: SuspensionImpact = { affectedGrantCount: 4, activeTaskCount: 2 };
    const promise = firstValueFrom(service.getSuspensionImpact('p-3'));

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/partners/p-3/suspension-impact`);
    expect(req.request.method).toBe('GET');
    req.flush(impact);

    const result = await promise;
    expect(result).toEqual(impact);
    const state = service.suspensionImpactState();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.data.affectedGrantCount).toBe(4);
    }
  });

  it('getSuspensionImpact catches an error, sets error state, returns null', async () => {
    const promise = firstValueFrom(service.getSuspensionImpact('p-3'));

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/p-3/suspension-impact`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    const result = await promise;
    expect(result).toBeNull();
    expect(service.suspensionImpactState().status).toBe('error');
  });

  // ---------------------------------------------------------------------------
  // suspendPartner
  // ---------------------------------------------------------------------------

  const suspension: PartnerSuspension = {
    reason: 'TOS violation',
    effectiveImmediately: true,
  };

  it('POSTs suspend, updates detail state AND the matching partner in the list', async () => {
    const a = makePartner({ id: 'p-a', status: PartnerStatus.Verified });
    const b = makePartner({ id: 'p-b', status: PartnerStatus.Verified });
    service.partnersState.set({ status: 'success', data: [a, b] });

    const suspended = makePartner({ id: 'p-a', status: PartnerStatus.Suspended });
    const promise = firstValueFrom(service.suspendPartner('p-a', suspension));
    expect(service.isSubmitting()).toBe(true);

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/partners/p-a/suspend`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(suspension);
    req.flush(suspended);

    const result = await promise;
    expect(result).toEqual(suspended);
    expect(service.isSubmitting()).toBe(false);
    expect(service.partnerDetail()).toEqual(suspended);
    // updatePartnerInList swapped only the matching id
    const list = service.partners();
    expect(list.find((p) => p.id === 'p-a')!.status).toBe(PartnerStatus.Suspended);
    expect(list.find((p) => p.id === 'p-b')!.status).toBe(PartnerStatus.Verified);
  });

  it('suspendPartner catches an error, resets isSubmitting, returns null (no state mutation)', async () => {
    const promise = firstValueFrom(service.suspendPartner('p-a', suspension));
    expect(service.isSubmitting()).toBe(true);

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/p-a/suspend`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    const result = await promise;
    expect(result).toBeNull();
    expect(service.isSubmitting()).toBe(false);
    // detail state untouched on error -> still loading
    expect(service.partnerDetailState().status).toBe('loading');
  });

  it('suspendPartner success leaves list untouched when list not loaded (updatePartnerInList no-op)', async () => {
    // partners still loading
    const suspended = makePartner({ id: 'p-a', status: PartnerStatus.Suspended });
    const promise = firstValueFrom(service.suspendPartner('p-a', suspension));

    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/p-a/suspend`).flush(suspended);

    await promise;
    expect(service.partnersState().status).toBe('loading');
    expect(service.partnerDetail()).toEqual(suspended);
  });

  // ---------------------------------------------------------------------------
  // restorePartner
  // ---------------------------------------------------------------------------

  it('POSTs restore with empty body, updates detail + list', async () => {
    const a = makePartner({ id: 'p-a', status: PartnerStatus.Suspended });
    service.partnersState.set({ status: 'success', data: [a] });

    const restored = makePartner({ id: 'p-a', status: PartnerStatus.Verified });
    const promise = firstValueFrom(service.restorePartner('p-a'));
    expect(service.isSubmitting()).toBe(true);

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/partners/p-a/restore`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(restored);

    const result = await promise;
    expect(result).toEqual(restored);
    expect(service.isSubmitting()).toBe(false);
    expect(service.partnerDetail()).toEqual(restored);
    expect(service.partners()[0]!.status).toBe(PartnerStatus.Verified);
  });

  it('restorePartner catches an error, resets isSubmitting, returns null', async () => {
    const promise = firstValueFrom(service.restorePartner('p-a'));
    expect(service.isSubmitting()).toBe(true);

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/p-a/restore`)
      .flush('err', { status: 409, statusText: 'Conflict' });

    const result = await promise;
    expect(result).toBeNull();
    expect(service.isSubmitting()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // getSuspensionHistory
  // ---------------------------------------------------------------------------

  it('GETs suspension-history and stores success state', async () => {
    const history: SuspensionHistoryEntry[] = [
      {
        id: 'h-1',
        partnerId: 'p-a',
        action: 'suspended',
        reason: 'TOS violation',
        performedBy: 'admin@chora',
        timestamp: '2026-02-01T00:00:00Z',
      },
    ];
    const promise = firstValueFrom(service.getSuspensionHistory('p-a'));

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/partners/p-a/suspension-history`);
    expect(req.request.method).toBe('GET');
    req.flush(history);

    const result = await promise;
    expect(result).toEqual(history);
    const state = service.suspensionHistoryState();
    expect(state.status).toBe('success');
    if (state.status === 'success') {
      expect(state.data).toHaveLength(1);
      expect(state.data[0]!.action).toBe('suspended');
    }
  });

  it('getSuspensionHistory catches an error, sets error state, returns []', async () => {
    const promise = firstValueFrom(service.getSuspensionHistory('p-a'));

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/p-a/suspension-history`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    const result = await promise;
    expect(result).toEqual([]);
    expect(service.suspensionHistoryState().status).toBe('error');
  });
});
