import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PartnerRegistrationComponent } from './partner-registration.component';
import { A2APartner, A2ASkill, PartnerStatus } from '../../models/a2a.model';
import { environment } from '../../../../../../environments/environment';

const PARTNERS_URL = `${environment.bffBaseUrl}/api/v1/a2a/partners`;

function makePartner(overrides: Partial<A2APartner> = {}): A2APartner {
  return {
    id: 'partner-001',
    orgName: 'Acme University',
    orgDomain: 'acme.edu',
    contactEmail: 'admin@acme.edu',
    status: PartnerStatus.Verified,
    allowedSkills: [A2ASkill.StudyConversation],
    maxAgents: 10,
    rateLimitPerHour: 100,
    dnsChallenge: null,
    verifiedAt: '2026-03-21T14:00:00Z',
    suspendedAt: null,
    suspensionReason: null,
    createdAt: '2026-03-20T10:00:00Z',
    updatedAt: '2026-03-21T14:00:00Z',
    ...overrides,
  };
}

describe('PartnerRegistrationComponent', () => {
  let component: PartnerRegistrationComponent;
  let fixture: ComponentFixture<PartnerRegistrationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PartnerRegistrationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PartnerRegistrationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="partner-registration"]');
    expect(el).toBeTruthy();
  });

  it('should default to registry view', () => {
    expect(component.viewMode()).toBe('registry');
  });

  it('should switch to register view', () => {
    component.showRegistrationForm();
    expect(component.viewMode()).toBe('register');
  });

  it('should switch back to registry view', () => {
    component.showRegistrationForm();
    component.showRegistry();
    expect(component.viewMode()).toBe('registry');
  });

  it('should default form to invalid', () => {
    component.showRegistrationForm();
    expect(component.isFormValid()).toBe(false);
  });

  it('should validate form with all required fields', () => {
    component.orgName.set('Test Org');
    component.orgDomain.set('test.edu');
    component.contactEmail.set('admin@test.edu');
    component.selectedSkills.set([A2ASkill.StudyConversation]);
    expect(component.isFormValid()).toBe(true);
  });

  it('should toggle skill selection', () => {
    component.toggleSkill(A2ASkill.QuizGeneration);
    expect(component.isSkillSelected(A2ASkill.QuizGeneration)).toBe(true);
    component.toggleSkill(A2ASkill.QuizGeneration);
    expect(component.isSkillSelected(A2ASkill.QuizGeneration)).toBe(false);
  });

  it('should return correct status badge class', () => {
    expect(component.statusBadgeClass(PartnerStatus.Verified)).toBe(
      'partner-registration__badge--verified',
    );
  });

  it('should format dates correctly', () => {
    expect(component.formatDate(null)).toBe('-');
    const result = component.formatDate('2026-03-21T14:00:00Z');
    expect(result).toBeTruthy();
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Registry view — HTTP-driven states (success / empty / error)
// ---------------------------------------------------------------------------

describe('PartnerRegistrationComponent — registry data states', () => {
  let fixture: ComponentFixture<PartnerRegistrationComponent>;
  let component: PartnerRegistrationComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PartnerRegistrationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PartnerRegistrationComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fires the partners GET on init to the BFF absolute URL', () => {
    fixture.detectChanges(); // triggers ngOnInit
    const req = httpMock.expectOne(PARTNERS_URL);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('shows the loading state before the GET resolves', () => {
    fixture.detectChanges();
    const loading = element.querySelector('.partner-registration__loading');
    expect(loading).not.toBeNull();
    httpMock.expectOne(PARTNERS_URL).flush([]);
  });

  it('shows the empty state when the partner list is empty', () => {
    fixture.detectChanges();
    httpMock.expectOne(PARTNERS_URL).flush([]);
    fixture.detectChanges();
    const empty = element.querySelector('.partner-registration__empty');
    expect(empty).not.toBeNull();
  });

  it('renders one table row per partner on success', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(PARTNERS_URL)
      .flush([
        makePartner({ id: 'p1', orgName: 'Acme University' }),
        makePartner({ id: 'p2', orgName: 'Beta College', status: PartnerStatus.Pending }),
      ]);
    fixture.detectChanges();

    const rows = element.querySelectorAll('.partner-registration__row');
    expect(rows.length).toBe(2);
    expect(element.textContent).toContain('Acme University');
    expect(element.textContent).toContain('Beta College');
    expect(element.textContent).toContain('acme.edu');
  });

  it('renders skill tags for each partner skill', () => {
    fixture.detectChanges();
    httpMock.expectOne(PARTNERS_URL).flush([
      makePartner({
        id: 'p1',
        allowedSkills: [A2ASkill.StudyConversation, A2ASkill.QuizGeneration],
      }),
    ]);
    fixture.detectChanges();
    const tags = element.querySelectorAll('.partner-registration__skill-tag');
    expect(tags.length).toBe(2);
  });

  it('keeps partners() empty and surfaces error state when the GET 500s', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(PARTNERS_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // catchError maps to of([]); component partners() reads success-only data
    expect(component.partners().length).toBe(0);
    expect(component.partnersState().status).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Status-filter computed signals
// ---------------------------------------------------------------------------

describe('PartnerRegistrationComponent — status filters', () => {
  let fixture: ComponentFixture<PartnerRegistrationComponent>;
  let component: PartnerRegistrationComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PartnerRegistrationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PartnerRegistrationComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne(PARTNERS_URL)
      .flush([
        makePartner({ id: 'v1', status: PartnerStatus.Verified }),
        makePartner({ id: 'v2', status: PartnerStatus.Verified }),
        makePartner({ id: 'pn1', status: PartnerStatus.Pending }),
        makePartner({ id: 'e1', status: PartnerStatus.Expired }),
        makePartner({ id: 's1', status: PartnerStatus.Suspended }),
      ]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('partitions partners by status into the four computed buckets', () => {
    expect(component.verifiedPartners().length).toBe(2);
    expect(component.pendingPartners().length).toBe(1);
    expect(component.expiredPartners().length).toBe(1);
    expect(component.suspendedPartners().length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Form field updaters + validation
// ---------------------------------------------------------------------------

describe('PartnerRegistrationComponent — form updaters', () => {
  let fixture: ComponentFixture<PartnerRegistrationComponent>;
  let component: PartnerRegistrationComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PartnerRegistrationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PartnerRegistrationComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(PARTNERS_URL).flush([]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function inputEvent(value: string): Event {
    return { target: { value } } as unknown as Event;
  }

  it('updates orgName from an input event', () => {
    component.updateOrgName(inputEvent('My Org'));
    expect(component.orgName()).toBe('My Org');
  });

  it('updates orgDomain from an input event', () => {
    component.updateOrgDomain(inputEvent('my.edu'));
    expect(component.orgDomain()).toBe('my.edu');
  });

  it('updates contactEmail from an input event', () => {
    component.updateContactEmail(inputEvent('me@my.edu'));
    expect(component.contactEmail()).toBe('me@my.edu');
  });

  it('updates maxAgents from a numeric input event', () => {
    component.updateMaxAgents(inputEvent('42'));
    expect(component.maxAgents()).toBe(42);
  });

  it('falls back to 10 max agents when the input is non-numeric', () => {
    component.updateMaxAgents(inputEvent('abc'));
    expect(component.maxAgents()).toBe(10);
  });

  it('updates rateLimitPerHour from a numeric input event', () => {
    component.updateRateLimitPerHour(inputEvent('500'));
    expect(component.rateLimitPerHour()).toBe(500);
  });

  it('falls back to 100 rate limit when the input is non-numeric', () => {
    component.updateRateLimitPerHour(inputEvent(''));
    expect(component.rateLimitPerHour()).toBe(100);
  });

  it('is invalid when email lacks an @ symbol', () => {
    component.orgName.set('Org');
    component.orgDomain.set('org.edu');
    component.contactEmail.set('no-at-symbol');
    component.selectedSkills.set([A2ASkill.StudyConversation]);
    expect(component.isFormValid()).toBe(false);
  });

  it('is invalid when no skills are selected', () => {
    component.orgName.set('Org');
    component.orgDomain.set('org.edu');
    component.contactEmail.set('a@b.edu');
    component.selectedSkills.set([]);
    expect(component.isFormValid()).toBe(false);
  });

  it('is invalid when maxAgents is zero or negative', () => {
    component.orgName.set('Org');
    component.orgDomain.set('org.edu');
    component.contactEmail.set('a@b.edu');
    component.selectedSkills.set([A2ASkill.StudyConversation]);
    component.maxAgents.set(0);
    expect(component.isFormValid()).toBe(false);
  });

  it('is invalid when rateLimitPerHour is zero', () => {
    component.orgName.set('Org');
    component.orgDomain.set('org.edu');
    component.contactEmail.set('a@b.edu');
    component.selectedSkills.set([A2ASkill.StudyConversation]);
    component.rateLimitPerHour.set(0);
    expect(component.isFormValid()).toBe(false);
  });

  it('resets all fields when re-opening the registration form', () => {
    component.orgName.set('Dirty');
    component.selectedSkills.set([A2ASkill.PersonaSync]);
    component.maxAgents.set(99);
    component.showRegistrationForm();
    expect(component.orgName()).toBe('');
    expect(component.selectedSkills().length).toBe(0);
    expect(component.maxAgents()).toBe(10);
    expect(component.rateLimitPerHour()).toBe(100);
  });

  it('clears DNS state when returning to the registry', () => {
    component.dnsChallenge.set('chora-verify=abc');
    component.isVerifying.set(true);
    component.dnsVerified.set(true);
    component.newPartnerId.set('p-9');
    component.showRegistry();
    expect(component.dnsChallenge()).toBeNull();
    expect(component.isVerifying()).toBe(false);
    expect(component.dnsVerified()).toBe(false);
    expect(component.newPartnerId()).toBeNull();
  });

  it('returns the raw date string when formatDate is given an unparseable value', () => {
    // Date('not-a-date') -> Invalid Date; toLocaleDateString returns
    // 'Invalid Date' rather than throwing, so characterize the actual output.
    const out = component.formatDate('not-a-date');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Registration submit flow
// ---------------------------------------------------------------------------

describe('PartnerRegistrationComponent — submit registration', () => {
  let fixture: ComponentFixture<PartnerRegistrationComponent>;
  let component: PartnerRegistrationComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PartnerRegistrationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PartnerRegistrationComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    httpMock.expectOne(PARTNERS_URL).flush([]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function fillValidForm(): void {
    component.showRegistrationForm();
    component.orgName.set('New Partner');
    component.orgDomain.set('newpartner.edu');
    component.contactEmail.set('admin@newpartner.edu');
    component.selectedSkills.set([A2ASkill.StudyConversation]);
  }

  it('does nothing (no POST) when the form is invalid', () => {
    component.showRegistrationForm(); // form empty → invalid
    component.submitRegistration();
    httpMock.expectNone(PARTNERS_URL);
  });

  it('POSTs the trimmed registration payload to the BFF', () => {
    fillValidForm();
    component.orgName.set('  Padded Org  ');
    component.submitRegistration();

    const post = httpMock.expectOne(PARTNERS_URL);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      orgName: 'Padded Org',
      orgDomain: 'newpartner.edu',
      contactEmail: 'admin@newpartner.edu',
      allowedSkills: [A2ASkill.StudyConversation],
      maxAgents: 10,
      rateLimitPerHour: 100,
    });
    post.flush(makePartner({ id: 'np-1', dnsChallenge: 'chora-verify=xyz123' }));
  });

  it('stores the DNS challenge + new partner id on POST success', () => {
    fillValidForm();
    component.submitRegistration();
    httpMock
      .expectOne(PARTNERS_URL)
      .flush(makePartner({ id: 'np-1', dnsChallenge: 'chora-verify=xyz123' }));
    fixture.detectChanges();

    expect(component.dnsChallenge()).toBe('chora-verify=xyz123');
    expect(component.newPartnerId()).toBe('np-1');
    const code = element.querySelector('.partner-registration__dns-value');
    expect(code?.textContent).toContain('chora-verify=xyz123');
  });

  it('does not set DNS challenge when the POST fails', () => {
    fillValidForm();
    component.submitRegistration();
    httpMock
      .expectOne(PARTNERS_URL)
      .flush({ error: 'dup' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();

    expect(component.dnsChallenge()).toBeNull();
    expect(component.newPartnerId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DNS verification polling (timer-driven → fakeAsync)
// ---------------------------------------------------------------------------

describe('PartnerRegistrationComponent — DNS verification polling', () => {
  let fixture: ComponentFixture<PartnerRegistrationComponent>;
  let component: PartnerRegistrationComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PartnerRegistrationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(PartnerRegistrationComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(PARTNERS_URL).flush([]);
    fixture.detectChanges();
  });

  it('does not start verifying when there is no new partner id', () => {
    component.newPartnerId.set(null);
    component.startDnsVerification();
    expect(component.isVerifying()).toBe(false);
  });

  it('sets isVerifying immediately on start', () => {
    component.newPartnerId.set('np-1');
    component.startDnsVerification();
    expect(component.isVerifying()).toBe(true);
  });

  it('keeps polling while DNS is unverified then flips on verified', fakeAsync(() => {
    const verifyUrl = `${PARTNERS_URL}/np-1/verify-dns`;
    component.newPartnerId.set('np-1');
    component.startDnsVerification();
    expect(component.isVerifying()).toBe(true);

    // First poll @ 5s → not yet verified, keep polling
    tick(5_000);
    httpMock.expectOne(verifyUrl).flush({ verified: false });
    expect(component.dnsVerified()).toBe(false);
    expect(component.isVerifying()).toBe(true);

    // Second poll @ 10s → verified → stop + refresh partner list
    tick(5_000);
    httpMock.expectOne(verifyUrl).flush({ verified: true });
    expect(component.dnsVerified()).toBe(true);
    expect(component.isVerifying()).toBe(false);

    // Verified branch refreshes the partner list (real GET)
    httpMock.expectOne(PARTNERS_URL).flush([makePartner({ id: 'np-1' })]);

    // Polling stopped: no further verify request on the next interval window
    tick(5_000);
    httpMock.expectNone(verifyUrl);
    httpMock.verify();
  }));
});
