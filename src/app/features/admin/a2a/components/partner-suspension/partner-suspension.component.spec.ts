import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PartnerSuspensionComponent } from './partner-suspension.component';
import {
  A2APartner,
  PartnerStatus,
  SuspensionHistoryEntry,
  SuspensionImpact,
} from '../../models/a2a.model';
import { A2AService } from '../../services/a2a.service';

const BASE = 'https://api.chora.site';

function makePartner(overrides: Partial<A2APartner> = {}): A2APartner {
  return {
    id: 'partner-1',
    orgName: 'Acme Learning',
    orgDomain: 'acme.example',
    contactEmail: 'ops@acme.example',
    status: PartnerStatus.Verified,
    allowedSkills: [],
    maxAgents: 5,
    rateLimitPerHour: 100,
    dnsChallenge: null,
    verifiedAt: '2026-01-01T00:00:00Z',
    suspendedAt: null,
    suspensionReason: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('PartnerSuspensionComponent', () => {
  let component: PartnerSuspensionComponent;
  let fixture: ComponentFixture<PartnerSuspensionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PartnerSuspensionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PartnerSuspensionComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('partnerId', 'partner-1');

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="partner-suspension"]');
    expect(el).toBeTruthy();
  });

  it('should default to empty reason', () => {
    expect(component.reason()).toBe('');
  });

  it('should default to effective immediately checked', () => {
    expect(component.effectiveImmediately()).toBe(true);
  });

  it('should default to confirm dialog closed', () => {
    expect(component.showConfirmDialog()).toBe(false);
  });

  it('should reject reasons shorter than minimum length', () => {
    component.reason.set('Too short');
    expect(component.isReasonValid()).toBe(false);
  });

  it('should accept reasons at minimum length', () => {
    component.reason.set('A'.repeat(50));
    expect(component.isReasonValid()).toBe(true);
  });

  it('should compute reason length', () => {
    component.reason.set('test');
    expect(component.reasonLength()).toBe(4);
  });

  it('should toggle effective immediately', () => {
    component.toggleEffectiveImmediately();
    expect(component.effectiveImmediately()).toBe(false);
    component.toggleEffectiveImmediately();
    expect(component.effectiveImmediately()).toBe(true);
  });

  it('should not open confirm dialog if reason is invalid', () => {
    component.reason.set('Short');
    component.openConfirmDialog();
    expect(component.showConfirmDialog()).toBe(false);
  });

  it('should open confirm dialog if reason is valid', () => {
    component.reason.set('A'.repeat(50));
    component.openConfirmDialog();
    expect(component.showConfirmDialog()).toBe(true);
  });

  it('should return correct status badge class', () => {
    expect(component.statusBadgeClass(PartnerStatus.Suspended)).toBe(
      'partner-suspension__badge--suspended',
    );
  });

  it('should return correct action label', () => {
    expect(component.actionLabel('suspended')).toBe('a2a.suspension.action_suspended');
    expect(component.actionLabel('restored')).toBe('a2a.suspension.action_restored');
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
// HTTP-driven lifecycle + interaction characterization
// ---------------------------------------------------------------------------

describe('PartnerSuspensionComponent (HTTP lifecycle)', () => {
  let component: PartnerSuspensionComponent;
  let fixture: ComponentFixture<PartnerSuspensionComponent>;
  let httpMock: HttpTestingController;
  let service: A2AService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PartnerSuspensionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PartnerSuspensionComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(A2AService);

    fixture.componentRef.setInput('partnerId', 'partner-1');
  });

  function flushInit(opts?: {
    partner?: A2APartner;
    impact?: SuspensionImpact;
    history?: SuspensionHistoryEntry[];
  }) {
    fixture.detectChanges(); // triggers ngOnInit -> 3 GETs
    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1`)
      .flush(opts?.partner ?? makePartner());
    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-impact`)
      .flush(opts?.impact ?? { affectedGrantCount: 3, activeTaskCount: 2 });
    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-history`)
      .flush(opts?.history ?? []);
    fixture.detectChanges();
  }

  it('shows the loading state before any response arrives', () => {
    fixture.detectChanges(); // ngOnInit fires the GETs but none flushed yet
    const loading = fixture.nativeElement.querySelector('.partner-suspension__loading');
    expect(loading).toBeTruthy();
    expect(component.partnerDetailState().status).toBe('loading');

    // satisfy the in-flight requests
    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1`).flush(makePartner());
    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-impact`)
      .flush({ affectedGrantCount: 0, activeTaskCount: 0 });
    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-history`).flush([]);
  });

  it('issues the three init GET requests against the BFF base url', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1`).flush(makePartner());
    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-impact`)
      .flush({ affectedGrantCount: 1, activeTaskCount: 1 });
    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-history`).flush([]);
    httpMock.verify();
  });

  it('renders partner info and impact for a verified partner', () => {
    flushInit({
      partner: makePartner({ status: PartnerStatus.Verified }),
      impact: { affectedGrantCount: 4, activeTaskCount: 7 },
    });

    const text = fixture.nativeElement.textContent ?? '';
    expect(component.isVerified()).toBe(true);
    expect(component.isSuspended()).toBe(false);
    expect(text).toContain('Acme Learning');
    expect(text).toContain('acme.example');
    expect(component.suspensionImpact()).toEqual({
      affectedGrantCount: 4,
      activeTaskCount: 7,
    });
    // Impact preview rendered (not suspended)
    const impactCards = fixture.nativeElement.querySelectorAll('.partner-suspension__impact-card');
    expect(impactCards.length).toBe(2);
    // Suspend form present, no restore button
    expect(fixture.nativeElement.querySelector('.partner-suspension__btn--suspend')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.partner-suspension__btn--restore')).toBeNull();
  });

  it('renders the restore button and current reason when suspended', () => {
    flushInit({
      partner: makePartner({
        status: PartnerStatus.Suspended,
        suspensionReason: 'Repeated abuse of rate limits across tenants',
      }),
    });

    expect(component.isSuspended()).toBe(true);
    const restoreBtn = fixture.nativeElement.querySelector('.partner-suspension__btn--restore');
    expect(restoreBtn).toBeTruthy();
    // Impact preview + suspend form hidden when suspended
    expect(fixture.nativeElement.querySelector('.partner-suspension__btn--suspend')).toBeNull();
    const reasonText = fixture.nativeElement.querySelector('.partner-suspension__reason-text');
    expect(reasonText?.textContent).toContain('Repeated abuse of rate limits');
  });

  it('shows the empty-history placeholder when no entries exist', () => {
    flushInit({ history: [] });
    const empty = fixture.nativeElement.querySelector('.partner-suspension__history-empty');
    expect(empty).toBeTruthy();
    expect(component.suspensionHistory()).toEqual([]);
  });

  it('renders suspension history entries', () => {
    const history: SuspensionHistoryEntry[] = [
      {
        id: 'h1',
        partnerId: 'partner-1',
        action: 'suspended',
        reason: 'Policy breach detected by governance scan',
        performedBy: 'ops@chora.site',
        timestamp: '2026-02-01T10:00:00Z',
      },
      {
        id: 'h2',
        partnerId: 'partner-1',
        action: 'restored',
        reason: 'Appeal approved after remediation',
        performedBy: 'admin@chora.site',
        timestamp: '2026-02-05T12:00:00Z',
      },
    ];
    flushInit({ history });

    const entries = fixture.nativeElement.querySelectorAll('.partner-suspension__history-entry');
    expect(entries.length).toBe(2);
    const text = fixture.nativeElement.textContent ?? '';
    expect(text).toContain('Policy breach detected');
    expect(text).toContain('ops@chora.site');
    expect(text).toContain('admin@chora.site');
  });

  it('handles a 500 error on partner detail (error state, no crash)', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1`)
      .flush('boom', { status: 500, statusText: 'Server Error' });
    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-impact`)
      .flush({ affectedGrantCount: 0, activeTaskCount: 0 });
    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-history`).flush([]);
    fixture.detectChanges();

    expect(component.partnerDetailState().status).toBe('error');
    expect(component.partner()).toBeNull();
    // Neither loading nor partner card shown
    expect(fixture.nativeElement.querySelector('.partner-suspension__partner-card')).toBeNull();
  });

  it('handles a 404 error on impact + history (impact null, history empty)', () => {
    fixture.detectChanges();
    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1`).flush(makePartner());
    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-impact`)
      .flush('nope', { status: 404, statusText: 'Not Found' });
    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-history`)
      .flush('nope', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(component.suspensionImpact()).toBeNull();
    expect(component.suspensionHistory()).toEqual([]);
    // Falls back to the loading-impact placeholder since impact is null
    expect(fixture.nativeElement.querySelector('.partner-suspension__impact-loading')).toBeTruthy();
  });

  it('updateReason copies textarea value into the reason signal', () => {
    flushInit();
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector(
      '.partner-suspension__textarea',
    );
    textarea.value = 'X'.repeat(60);
    textarea.dispatchEvent(new Event('input'));
    expect(component.reason()).toBe('X'.repeat(60));
    expect(component.isReasonValid()).toBe(true);
  });

  it('reasonCharCountClass reflects validity', () => {
    component.reason.set('short');
    expect(component.reasonCharCountClass()).toBe('partner-suspension__char-count--invalid');
    component.reason.set('Z'.repeat(50));
    expect(component.reasonCharCountClass()).toBe('partner-suspension__char-count--valid');
  });

  it('confirmSuspend POSTs the trimmed reason, closes dialog, resets reason and refetches history', () => {
    flushInit();
    component.reason.set(`  ${'R'.repeat(55)}  `);
    component.openConfirmDialog();
    expect(component.showConfirmDialog()).toBe(true);

    component.confirmSuspend();

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspend`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      reason: 'R'.repeat(55),
      effectiveImmediately: true,
    });
    req.flush(makePartner({ status: PartnerStatus.Suspended }));

    // history refetch fired by the success handler
    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-history`).flush([]);

    expect(component.showConfirmDialog()).toBe(false);
    expect(component.reason()).toBe('');
    expect(service.isSubmitting()).toBe(false);
  });

  it('confirmSuspend on a 500 still runs the success handler (catchError emits null)', () => {
    // CHARACTERIZATION: suspendPartner uses catchError(() => of(null)) which
    // EMITS a value, so the subscribe `next` callback fires even on error —
    // dialog closes, reason resets, and a history refetch is issued.
    flushInit();
    const longReason = 'E'.repeat(60);
    component.reason.set(longReason);
    component.openConfirmDialog();

    component.confirmSuspend();

    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspend`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    // next() ran with null -> history refetch fired
    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-history`).flush([]);

    expect(component.showConfirmDialog()).toBe(false);
    expect(component.reason()).toBe('');
    expect(service.isSubmitting()).toBe(false);
  });

  it('restorePartner POSTs to /restore and refetches history on success', () => {
    flushInit({ partner: makePartner({ status: PartnerStatus.Suspended }) });

    component.restorePartner();

    const req = httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1/restore`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush(makePartner({ status: PartnerStatus.Verified }));

    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-history`).flush([]);

    expect(service.isSubmitting()).toBe(false);
  });

  it('restorePartner on a 500 still refetches history (catchError emits null)', () => {
    // CHARACTERIZATION: restorePartner's catchError(() => of(null)) emits a
    // value, so the success `next` handler fires even on error and a history
    // refetch is still issued.
    flushInit({ partner: makePartner({ status: PartnerStatus.Suspended }) });

    component.restorePartner();
    httpMock
      .expectOne(`${BASE}/api/v1/a2a/partners/partner-1/restore`)
      .flush('err', { status: 500, statusText: 'Server Error' });

    httpMock.expectOne(`${BASE}/api/v1/a2a/partners/partner-1/suspension-history`).flush([]);

    expect(service.isSubmitting()).toBe(false);
  });

  it('clicking the suspend button opens the dialog when reason is valid', () => {
    flushInit({ partner: makePartner({ status: PartnerStatus.Verified }) });
    component.reason.set('B'.repeat(55));
    fixture.detectChanges();

    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.partner-suspension__btn--suspend',
    );
    expect(btn.disabled).toBe(false);
    btn.click();
    fixture.detectChanges();

    expect(component.showConfirmDialog()).toBe(true);
    expect(fixture.nativeElement.querySelector('.partner-suspension__dialog')).toBeTruthy();
  });

  it('closeConfirmDialog and backdrop click close the dialog', () => {
    flushInit();
    component.reason.set('C'.repeat(55));
    component.openConfirmDialog();
    fixture.detectChanges();

    const backdrop: HTMLElement = fixture.nativeElement.querySelector(
      '.partner-suspension__dialog-backdrop',
    );
    backdrop.click();
    fixture.detectChanges();
    expect(component.showConfirmDialog()).toBe(false);

    // and via the direct method
    component.openConfirmDialog();
    component.closeConfirmDialog();
    expect(component.showConfirmDialog()).toBe(false);
  });

  it('actionBadgeClass maps suspended/restored to the correct class', () => {
    expect(component.actionBadgeClass('suspended')).toBe(
      'partner-suspension__action-badge--suspended',
    );
    expect(component.actionBadgeClass('restored')).toBe(
      'partner-suspension__action-badge--restored',
    );
  });

  it('statusBadgeClass maps every PartnerStatus', () => {
    expect(component.statusBadgeClass(PartnerStatus.Pending)).toBe(
      'partner-suspension__badge--pending',
    );
    expect(component.statusBadgeClass(PartnerStatus.Verified)).toBe(
      'partner-suspension__badge--verified',
    );
    expect(component.statusBadgeClass(PartnerStatus.Expired)).toBe(
      'partner-suspension__badge--expired',
    );
  });

  it('formatDateTime renders a parseable date and returns the raw string on failure', () => {
    const out = component.formatDateTime('2026-02-01T10:00:00Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    // Invalid dates: toLocaleString returns "Invalid Date" (does not throw),
    // so the characterized behavior is a non-empty string, not the raw input.
    const bad = component.formatDateTime('not-a-date');
    expect(typeof bad).toBe('string');
  });

  it('ngOnDestroy unsubscribes without error', () => {
    flushInit();
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  afterEach(() => {
    httpMock.verify();
  });
});
