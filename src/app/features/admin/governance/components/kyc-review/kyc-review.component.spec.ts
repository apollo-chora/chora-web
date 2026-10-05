import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { KycReviewComponent } from './kyc-review.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../../environments/environment';
import type { KYCVerification } from '../../models/governance.model';

const KYC_URL = `${environment.bffBaseUrl}/api/v1/governance/kyc`;

const STUB_KYC: readonly KYCVerification[] = [
  {
    id: 'kyc-1',
    gcid: 'gcid-aaa',
    document_type: 'national_id',
    status: 'pending',
    submitted_at: '2026-06-01T00:00:00Z',
    verified_at: null,
    expires_at: null,
  },
  {
    id: 'kyc-2',
    gcid: 'gcid-bbb',
    document_type: 'passport',
    status: 'verified',
    submitted_at: '2026-06-01T01:00:00Z',
    verified_at: '2026-06-02T01:00:00Z',
    expires_at: '2027-06-02T01:00:00Z',
  },
  {
    id: 'kyc-3',
    gcid: 'gcid-ccc',
    document_type: 'drivers_license',
    status: 'failed',
    submitted_at: '2026-06-01T02:00:00Z',
    verified_at: null,
    expires_at: null,
  },
];

describe('KycReviewComponent', () => {
  let component: KycReviewComponent;
  let fixture: ComponentFixture<KycReviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycReviewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(KycReviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="kyc-review"]');
    expect(el).toBeTruthy();
  });

  it('should compute canReview for pending status only', () => {
    expect(component.canReview({ id: '1', status: 'pending' } as KYCVerification)).toBe(true);
    expect(component.canReview({ id: '2', status: 'verified' } as KYCVerification)).toBe(false);
  });

  it('should compute statusClass correctly', () => {
    expect(component.statusClass('pending')).toBe('kyc-review__status--pending');
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
// Augmented coverage — data loading, render states, filters, actions, helpers
// ---------------------------------------------------------------------------

describe('KycReviewComponent — data loading + render', () => {
  let fixture: ComponentFixture<KycReviewComponent>;
  let component: KycReviewComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [KycReviewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(KycReviewComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('GETs the KYC list on init (correct absolute URL + verb)', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(KYC_URL);
    expect(req.request.method).toBe('GET');
    req.flush(STUB_KYC);
  });

  it('renders the skeleton loading state while the request is in flight', () => {
    fixture.detectChanges(); // triggers GET, state = loading (no flush yet)

    expect(component.loading()).toBe(true);
    const loadingEl = element.querySelector('[data-testid="kyc-loading"]');
    expect(loadingEl).not.toBeNull();
    // grid + empty must be absent during loading
    expect(element.querySelector('[data-testid="kyc-grid"]')).toBeNull();
    expect(element.querySelector('[data-testid="kyc-empty"]')).toBeNull();

    httpMock.expectOne(KYC_URL).flush(STUB_KYC);
  });

  it('renders one card per verification once loaded', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(STUB_KYC);
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    const grid = element.querySelector('[data-testid="kyc-grid"]');
    expect(grid).not.toBeNull();
    const cards = element.querySelectorAll('[data-testid^="kyc-kyc-"]');
    expect(cards.length).toBe(3);
    expect(element.querySelector('[data-testid="kyc-loading"]')).toBeNull();
  });

  it('shows the gcid + document type data inside each card', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(STUB_KYC);
    fixture.detectChanges();

    const card = element.querySelector('[data-testid="kyc-kyc-1"]');
    expect(card?.textContent).toContain('gcid-aaa');
    expect(card?.textContent).toContain('national_id');
  });

  it('renders approve + reject buttons only for pending verifications', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(STUB_KYC);
    fixture.detectChanges();

    // kyc-1 is pending → has action buttons
    expect(element.querySelector('[data-testid="btn-approve-kyc-kyc-1"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="btn-reject-kyc-kyc-1"]')).not.toBeNull();
    // kyc-2 is verified → no action buttons
    expect(element.querySelector('[data-testid="btn-approve-kyc-kyc-2"]')).toBeNull();
  });

  it('renders verified_at + expires_at meta only when present', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(STUB_KYC);
    fixture.detectChanges();

    const verifiedCard = element.querySelector('[data-testid="kyc-kyc-2"]');
    // verified card carries the (translated) verified + expires keys
    expect(verifiedCard?.textContent).toContain('admin.governance.verified');
    expect(verifiedCard?.textContent).toContain('admin.governance.expires');

    const pendingCard = element.querySelector('[data-testid="kyc-kyc-1"]');
    expect(pendingCard?.textContent).not.toContain('admin.governance.verified');
  });

  it('renders the empty state when the list is empty', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush([]);
    fixture.detectChanges();

    expect(component.isEmpty()).toBe(true);
    expect(element.querySelector('[data-testid="kyc-empty"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="kyc-grid"]')).toBeNull();
  });

  it('treats a 5xx load failure as a non-throwing empty state (error swallowed by service)', () => {
    fixture.detectChanges();
    httpMock
      .expectOne(KYC_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // The service catchError → of(null) means the component sees an empty
    // result, the kyc state goes to 'error', and the grid stays empty.
    expect(component.loading()).toBe(false);
    expect(component.isEmpty()).toBe(true);
    expect(component.filteredVerifications().length).toBe(0);
    expect(element.querySelector('[data-testid="kyc-empty"]')).not.toBeNull();
  });

  it('refetches the list when the refresh button is clicked', () => {
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(STUB_KYC);
    fixture.detectChanges();

    const refresh = element.querySelector('[data-testid="btn-refresh-kyc"]') as HTMLButtonElement;
    refresh.click();

    const req = httpMock.expectOne(KYC_URL);
    expect(req.request.method).toBe('GET');
    req.flush(STUB_KYC);
  });
});

describe('KycReviewComponent — filtering', () => {
  let fixture: ComponentFixture<KycReviewComponent>;
  let component: KycReviewComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [KycReviewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(KycReviewComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(STUB_KYC);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('starts with no filter (null) showing all rows', () => {
    expect(component.filterStatus()).toBeNull();
    expect(component.filteredVerifications().length).toBe(3);
  });

  it('filters by a chosen status', () => {
    component.onStatusFilter('pending');
    fixture.detectChanges();

    expect(component.filterStatus()).toBe('pending');
    const filtered = component.filteredVerifications();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('kyc-1');
    const cards = element.querySelectorAll('[data-testid^="kyc-kyc-"]');
    expect(cards.length).toBe(1);
  });

  it('clears the filter back to null when the empty option is chosen', () => {
    component.onStatusFilter('verified');
    fixture.detectChanges();
    expect(component.filteredVerifications().length).toBe(1);

    component.onStatusFilter('');
    fixture.detectChanges();
    expect(component.filterStatus()).toBeNull();
    expect(component.filteredVerifications().length).toBe(3);
  });

  it('drives the filter via the <select> change event', () => {
    const select = element.querySelector('[data-testid="kyc-status-filter"]') as HTMLSelectElement;
    select.value = 'failed';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.filterStatus()).toBe('failed');
    expect(component.filteredVerifications().length).toBe(1);
    expect(component.filteredVerifications()[0].id).toBe('kyc-3');
  });

  it('shows the empty state when a filter matches nothing', () => {
    component.onStatusFilter('expired');
    fixture.detectChanges();

    expect(component.filteredVerifications().length).toBe(0);
    expect(component.isEmpty()).toBe(true);
    expect(element.querySelector('[data-testid="kyc-empty"]')).not.toBeNull();
  });
});

describe('KycReviewComponent — approve / reject actions', () => {
  let fixture: ComponentFixture<KycReviewComponent>;
  let component: KycReviewComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  let confirmDialog: ConfirmDialogService;
  let toast: ToastService;

  const PENDING: KYCVerification = STUB_KYC[0];

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [KycReviewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(KycReviewComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
    confirmDialog = TestBed.inject(ConfirmDialogService);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(STUB_KYC);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('does nothing when the approve confirm dialog is declined', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(false);
    const toastSpy = vi.spyOn(toast, 'show');

    await component.approveKYC(PENDING);

    expect(confirmDialog.confirm).toHaveBeenCalledTimes(1);
    expect(toastSpy).not.toHaveBeenCalled();
    httpMock.expectNone(`${KYC_URL}/kyc-1`);
  });

  it('PUTs verified + shows success toast + refetches when approve is confirmed', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');

    await component.approveKYC(PENDING);

    const put = httpMock.expectOne(`${KYC_URL}/kyc-1`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ status: 'verified' });
    put.flush({ ...PENDING, status: 'verified' });

    // tap() on success refetches the list
    const refetch = httpMock.expectOne(KYC_URL);
    expect(refetch.request.method).toBe('GET');
    refetch.flush(STUB_KYC);

    expect(toastSpy).toHaveBeenCalledWith('admin.governance.kyc_approved', 'success');
  });

  it('shows the approve error toast when the PUT fails (service swallows error → null result)', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');

    await component.approveKYC(PENDING);

    httpMock
      .expectOne(`${KYC_URL}/kyc-1`)
      .flush({ error: 'nope' }, { status: 400, statusText: 'Bad Request' });

    // catchError → of(null): next(null) fires, NO refetch, error-branch toast.
    expect(toastSpy).toHaveBeenCalledWith('admin.governance.approve_kyc_error', 'error');
  });

  it('does nothing when the reject confirm dialog is declined', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(false);
    const toastSpy = vi.spyOn(toast, 'show');

    await component.rejectKYC(PENDING);

    expect(confirmDialog.confirm).toHaveBeenCalledTimes(1);
    expect(toastSpy).not.toHaveBeenCalled();
    httpMock.expectNone(`${KYC_URL}/kyc-1`);
  });

  it('PUTs failed + shows success toast + refetches when reject is confirmed', async () => {
    const confirmSpy = vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');

    await component.rejectKYC(PENDING);

    // reject uses the danger variant
    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' }));

    const put = httpMock.expectOne(`${KYC_URL}/kyc-1`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ status: 'failed' });
    put.flush({ ...PENDING, status: 'failed' });

    const refetch = httpMock.expectOne(KYC_URL);
    refetch.flush(STUB_KYC);

    expect(toastSpy).toHaveBeenCalledWith('admin.governance.kyc_rejected', 'success');
  });

  it('shows the reject error toast when the PUT fails', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');

    await component.rejectKYC(PENDING);

    httpMock
      .expectOne(`${KYC_URL}/kyc-1`)
      .flush({ error: 'nope' }, { status: 500, statusText: 'Server Error' });

    expect(toastSpy).toHaveBeenCalledWith('admin.governance.reject_kyc_error', 'error');
  });

  it('clicking the approve card button opens the confirm dialog', () => {
    const confirmSpy = vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(false);

    const btn = element.querySelector('[data-testid="btn-approve-kyc-kyc-1"]') as HTMLButtonElement;
    btn.click();

    expect(confirmSpy).toHaveBeenCalledWith(expect.objectContaining({ variant: 'info' }));
  });
});

describe('KycReviewComponent — helpers + lifecycle', () => {
  let fixture: ComponentFixture<KycReviewComponent>;
  let component: KycReviewComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [KycReviewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(KycReviewComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(KYC_URL).flush(STUB_KYC);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('formatDateTime returns a non-empty rendering for a valid ISO string', () => {
    const out = component.formatDateTime('2026-06-01T00:00:00Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('formatDateTime echoes back a value it cannot parse without throwing', () => {
    // new Date('not-a-date') yields Invalid Date; toLocaleString does not throw
    // in jsdom, so this characterizes the actual (non-throwing) output.
    const out = component.formatDateTime('not-a-date');
    expect(typeof out).toBe('string');
  });

  it('canReview is false for verified / failed / expired statuses', () => {
    expect(component.canReview({ id: 'x', status: 'failed' } as KYCVerification)).toBe(false);
    expect(component.canReview({ id: 'x', status: 'expired' } as KYCVerification)).toBe(false);
  });

  it('statusClass builds a BEM modifier for any status', () => {
    expect(component.statusClass('verified')).toBe('kyc-review__status--verified');
    expect(component.statusClass('expired')).toBe('kyc-review__status--expired');
  });

  it('exposes the canonical KYC status list + label map', () => {
    expect(component.allStatuses).toEqual(['pending', 'verified', 'failed', 'expired']);
    expect(component.kycStatusLabels.pending).toBe('admin.governance.kyc_pending');
  });

  it('ngOnDestroy unsubscribes without error', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});
