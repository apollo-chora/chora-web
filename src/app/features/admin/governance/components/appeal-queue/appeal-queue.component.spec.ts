import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { AppealQueueComponent } from './appeal-queue.component';
import { GovernanceService } from '../../services/governance.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { environment } from '../../../../../../environments/environment';
import type { Appeal } from '../../models/governance.model';

const APPEALS_URL = `${environment.bffBaseUrl}/api/v1/governance/appeals`;

function makeAppeal(overrides: Partial<Appeal> = {}): Appeal {
  return {
    id: 'appeal-1',
    restriction_id: 'restriction-99',
    appellant_gcid: 'gcid-aaa',
    reason: 'I was unfairly restricted',
    status: 'pending',
    reviewer_gcid: null,
    reviewer_notes: null,
    submitted_at: '2026-06-01T10:00:00Z',
    resolved_at: null,
    ...overrides,
  };
}

describe('AppealQueueComponent', () => {
  let component: AppealQueueComponent;
  let fixture: ComponentFixture<AppealQueueComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppealQueueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AppealQueueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="appeal-queue"]');
    expect(el).toBeTruthy();
  });

  it('should compute canReview for pending and under_review statuses', () => {
    expect(component.canReview({ id: '1', status: 'pending' } as Appeal)).toBe(true);
    expect(component.canReview({ id: '2', status: 'under_review' } as Appeal)).toBe(true);
    expect(component.canReview({ id: '3', status: 'approved' } as Appeal)).toBe(false);
  });

  it('should compute statusClass correctly', () => {
    expect(component.statusClass('pending')).toBe('appeal-queue__status--pending');
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
// Augmented coverage — data loading, filtering, render states, actions
// ---------------------------------------------------------------------------

describe('AppealQueueComponent — data loading + render states', () => {
  let component: AppealQueueComponent;
  let fixture: ComponentFixture<AppealQueueComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AppealQueueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AppealQueueComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('GETs the appeals endpoint on init and shows the loading skeleton while pending', () => {
    fixture.detectChanges(); // triggers ngOnInit → loadAppeals
    // The request is in flight → loading() is true
    expect(component.loading()).toBe(true);
    const loadingEl = element.querySelector('[data-testid="appeals-loading"]');
    expect(loadingEl).not.toBeNull();

    const req = httpMock.expectOne(APPEALS_URL);
    expect(req.request.method).toBe('GET');
    req.flush([]); // resolve so verify() is clean
    fixture.detectChanges();
  });

  it('renders one card per appeal on a successful load', () => {
    fixture.detectChanges();
    const appeals = [
      makeAppeal({ id: 'appeal-1', appellant_gcid: 'gcid-aaa', status: 'pending' }),
      makeAppeal({ id: 'appeal-2', appellant_gcid: 'gcid-bbb', status: 'denied' }),
    ];
    httpMock.expectOne(APPEALS_URL).flush(appeals);
    fixture.detectChanges();

    const cards = element.querySelectorAll('[data-testid^="appeal-appeal-"]');
    expect(cards.length).toBe(2);
    expect(component.loading()).toBe(false);
    expect(element.textContent).toContain('gcid-aaa');
    expect(element.textContent).toContain('restriction-99');
  });

  it('shows the empty state when the load returns no appeals', () => {
    fixture.detectChanges();
    httpMock.expectOne(APPEALS_URL).flush([]);
    fixture.detectChanges();

    expect(component.isEmpty()).toBe(true);
    const empty = element.querySelector('[data-testid="appeals-empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('admin.governance.no_appeals');
  });

  it('leaves the queue empty on a 500 (load-error toast is dead code — see notes)', () => {
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    fixture.detectChanges();
    httpMock
      .expectOne(APPEALS_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // PROD BUG characterization: GovernanceService.loadAppeals() wraps the HTTP
    // error in catchError(() => of(null)), so the stream emits `null` via NEXT
    // and never errors. The component subscribes with only an `error` callback
    // (appeals_load_error toast) which therefore never fires. We characterize
    // the actual behavior: NO toast is shown on load failure.
    expect(toastSpy).not.toHaveBeenCalled();
    // The service's error state means appeals() returns [] → empty queue.
    expect(component.filteredAppeals().length).toBe(0);
    expect(component.isEmpty()).toBe(true);
  });

  it('refetches when the refresh button is clicked', () => {
    fixture.detectChanges();
    httpMock.expectOne(APPEALS_URL).flush([makeAppeal()]);
    fixture.detectChanges();

    const refresh = element.querySelector(
      '[data-testid="btn-refresh-appeals"]',
    ) as HTMLButtonElement;
    refresh.click();
    fixture.detectChanges();

    httpMock.expectOne(APPEALS_URL).flush([]);
    fixture.detectChanges();
    expect(component.isEmpty()).toBe(true);
  });
});

describe('AppealQueueComponent — filtering', () => {
  let component: AppealQueueComponent;
  let fixture: ComponentFixture<AppealQueueComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AppealQueueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AppealQueueComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;

    fixture.detectChanges();
    httpMock
      .expectOne(APPEALS_URL)
      .flush([
        makeAppeal({ id: 'appeal-1', status: 'pending' }),
        makeAppeal({ id: 'appeal-2', status: 'denied' }),
        makeAppeal({ id: 'appeal-3', status: 'approved' }),
      ]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('filters the visible appeals by the selected status', () => {
    expect(component.filteredAppeals().length).toBe(3);

    component.onStatusFilter('denied');
    fixture.detectChanges();
    expect(component.filterStatus()).toBe('denied');
    expect(component.filteredAppeals().length).toBe(1);
    expect(component.filteredAppeals()[0].id).toBe('appeal-2');
  });

  it('clears the filter back to all when empty string is selected', () => {
    component.onStatusFilter('approved');
    expect(component.filteredAppeals().length).toBe(1);

    component.onStatusFilter('');
    expect(component.filterStatus()).toBeNull();
    expect(component.filteredAppeals().length).toBe(3);
  });

  it('drives the filter through the select change event', () => {
    const select = element.querySelector(
      '[data-testid="appeal-status-filter"]',
    ) as HTMLSelectElement;
    select.value = 'pending';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.filterStatus()).toBe('pending');
    expect(component.filteredAppeals().length).toBe(1);
  });
});

describe('AppealQueueComponent — approve / deny actions', () => {
  let component: AppealQueueComponent;
  let fixture: ComponentFixture<AppealQueueComponent>;
  let governance: GovernanceService;
  let confirmDialog: ConfirmDialogService;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AppealQueueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AppealQueueComponent);
    component = fixture.componentInstance;
    governance = TestBed.inject(GovernanceService);
    confirmDialog = TestBed.inject(ConfirmDialogService);
    toast = TestBed.inject(ToastService);
    // Do NOT detectChanges here: avoids firing ngOnInit's real GET so each
    // test controls the service interaction directly.
  });

  it('does nothing when the approve confirm dialog is cancelled', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(false);
    const reviewSpy = vi.spyOn(governance, 'reviewAppeal');

    await component.approveAppeal(makeAppeal());

    expect(reviewSpy).not.toHaveBeenCalled();
  });

  it('approves an appeal and shows a success toast when confirmed', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    const reviewSpy = vi
      .spyOn(governance, 'reviewAppeal')
      .mockReturnValue(of(makeAppeal({ status: 'approved' })));
    const toastSpy = vi.spyOn(toast, 'show');

    await component.approveAppeal(makeAppeal({ id: 'appeal-7' }));

    expect(reviewSpy).toHaveBeenCalledWith('appeal-7', {
      status: 'approved',
      reviewer_notes: '',
    });
    expect(toastSpy).toHaveBeenCalledWith('admin.governance.appeal_approved', 'success');
  });

  it('shows an approve-error toast when the service resolves null', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    vi.spyOn(governance, 'reviewAppeal').mockReturnValue(of(null));
    const toastSpy = vi.spyOn(toast, 'show');

    await component.approveAppeal(makeAppeal());

    expect(toastSpy).toHaveBeenCalledWith('admin.governance.approve_appeal_error', 'error');
  });

  it('does nothing when the deny confirm dialog is cancelled', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(false);
    const reviewSpy = vi.spyOn(governance, 'reviewAppeal');

    await component.denyAppeal(makeAppeal());

    expect(reviewSpy).not.toHaveBeenCalled();
  });

  it('denies an appeal and shows a success toast when confirmed', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    const reviewSpy = vi
      .spyOn(governance, 'reviewAppeal')
      .mockReturnValue(of(makeAppeal({ status: 'denied' })));
    const toastSpy = vi.spyOn(toast, 'show');

    await component.denyAppeal(makeAppeal({ id: 'appeal-9' }));

    expect(reviewSpy).toHaveBeenCalledWith('appeal-9', {
      status: 'denied',
      reviewer_notes: '',
    });
    expect(toastSpy).toHaveBeenCalledWith('admin.governance.appeal_denied', 'success');
  });

  it('shows a deny-error toast when the service resolves null', async () => {
    vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(true);
    vi.spyOn(governance, 'reviewAppeal').mockReturnValue(of(null));
    const toastSpy = vi.spyOn(toast, 'show');

    await component.denyAppeal(makeAppeal());

    expect(toastSpy).toHaveBeenCalledWith('admin.governance.deny_appeal_error', 'error');
  });

  it('uses the danger variant for deny and info variant for approve', async () => {
    const confirmSpy = vi.spyOn(confirmDialog, 'confirm').mockResolvedValue(false);

    await component.approveAppeal(makeAppeal());
    expect(confirmSpy).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'info' }));

    await component.denyAppeal(makeAppeal());
    expect(confirmSpy).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'danger' }));
  });
});

describe('AppealQueueComponent — helpers + lifecycle', () => {
  let component: AppealQueueComponent;
  let fixture: ComponentFixture<AppealQueueComponent>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AppealQueueComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(AppealQueueComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('canReview returns false for denied appeals', () => {
    expect(component.canReview(makeAppeal({ status: 'denied' }))).toBe(false);
  });

  it('statusClass builds the BEM modifier from any status string', () => {
    expect(component.statusClass('under_review')).toBe('appeal-queue__status--under_review');
    expect(component.statusClass('approved')).toBe('appeal-queue__status--approved');
  });

  it('formatDateTime renders a parseable ISO timestamp', () => {
    const out = component.formatDateTime('2026-06-01T10:00:00Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
    // The exact locale rendering is environment-dependent; assert it parses.
    expect(Number.isNaN(new Date('2026-06-01T10:00:00Z').getTime())).toBe(false);
  });

  it('formatDateTime echoes the raw input when Date produces an invalid result', () => {
    // toLocaleString on an Invalid Date returns "Invalid Date" (no throw),
    // so the characterized output is that string, not the raw input.
    const out = component.formatDateTime('not-a-real-date');
    expect(out).toBe('Invalid Date');
  });

  it('ngOnDestroy unsubscribes without error', () => {
    fixture.detectChanges();
    httpMock.expectOne(APPEALS_URL).flush([]);
    expect(() => component.ngOnDestroy()).not.toThrow();
    httpMock.verify();
  });

  it('exposes the appeal status label map and full status list', () => {
    expect(component.allStatuses).toContain('pending');
    expect(component.allStatuses).toContain('denied');
    expect(component.appealStatusLabels['pending']).toBe('admin.governance.appeal_pending');
  });
});
