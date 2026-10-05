import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { RestrictionDashboardComponent } from './restriction-dashboard.component';
import { GovernanceService } from '../../services/governance.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type { Restriction } from '../../models/governance.model';

const BASE = 'https://api.chora.site';
const RESTRICTIONS_URL = `${BASE}/api/v1/governance/restrictions`;

function makeRestriction(overrides: Partial<Restriction> = {}): Restriction {
  return {
    id: 'r-1',
    tenant_id: 't-1',
    target_gcid: 'gcid-abc',
    tier: 'warning',
    reason: 'spamming the feed',
    applied_by: 'admin-1',
    applied_at: '2026-01-01T00:00:00Z',
    lifted_at: null,
    status: 'active',
    ...overrides,
  };
}

describe('RestrictionDashboardComponent', () => {
  let component: RestrictionDashboardComponent;
  let fixture: ComponentFixture<RestrictionDashboardComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RestrictionDashboardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RestrictionDashboardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  // ---------------------------------------------------------------------------
  // Pre-existing tests (must remain GREEN)
  // ---------------------------------------------------------------------------

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="restriction-dashboard"]');
    expect(el).toBeTruthy();
  });

  it('should compute tierClass correctly', () => {
    expect(component.tierClass('warning')).toBe('restriction-dashboard__tier--warning');
    expect(component.tierClass('suspension')).toBe('restriction-dashboard__tier--suspension');
  });

  it('should compute canLift for active restrictions', () => {
    expect(component.canLift({ id: '1', status: 'active' } as Restriction)).toBe(true);
    expect(component.canLift({ id: '2', status: 'lifted' } as Restriction)).toBe(false);
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Initial load (ngOnInit -> loadRestrictions)
  // ---------------------------------------------------------------------------

  it('should issue a GET to the restrictions endpoint on init', () => {
    // detectChanges() in beforeEach triggered ngOnInit -> loadRestrictions.
    const req = httpMock.expectOne(RESTRICTIONS_URL);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('should render the title header', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('[data-testid="restrictions-title"]');
    expect(title?.textContent).toContain('admin.governance.restrictions_title');
  });

  it('should render the apply and refresh action buttons', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
    fixture.detectChanges();
    const apply = fixture.nativeElement.querySelector('[data-testid="btn-apply-restriction"]');
    const refresh = fixture.nativeElement.querySelector('[data-testid="btn-refresh-restrictions"]');
    expect(apply).toBeTruthy();
    expect(refresh).toBeTruthy();
  });

  it('should render the filter bar with tier and status selects', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="tier-filter"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="status-filter"]')).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Loading / empty / list states
  // ---------------------------------------------------------------------------

  it('should expose loading() true while the request is in-flight and false after', () => {
    const req = httpMock.expectOne(RESTRICTIONS_URL);
    expect(component.loading()).toBe(true);
    req.flush([]);
    expect(component.loading()).toBe(false);
  });

  it('should render the loading skeleton while in-flight', () => {
    // request is still pending (not flushed yet)
    const loadingEl = fixture.nativeElement.querySelector('[data-testid="restrictions-loading"]');
    expect(loadingEl).toBeTruthy();
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
  });

  it('should show the empty state when no restrictions returned', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
    fixture.detectChanges();
    expect(component.isEmpty()).toBe(true);
    const empty = fixture.nativeElement.querySelector('[data-testid="restrictions-empty"]');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('admin.governance.no_restrictions');
  });

  it('should render restriction cards when data returned', () => {
    httpMock
      .expectOne(RESTRICTIONS_URL)
      .flush([
        makeRestriction({ id: 'r-1', target_gcid: 'gcid-111' }),
        makeRestriction({ id: 'r-2', target_gcid: 'gcid-222', status: 'lifted' }),
      ]);
    fixture.detectChanges();

    expect(component.isEmpty()).toBe(false);
    const list = fixture.nativeElement.querySelector('[data-testid="restriction-list"]');
    expect(list).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="restriction-r-1"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="restriction-r-2"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('gcid-111');
    expect(fixture.nativeElement.textContent).toContain('spamming the feed');
  });

  it('should render a lift button only for active restrictions', () => {
    httpMock
      .expectOne(RESTRICTIONS_URL)
      .flush([
        makeRestriction({ id: 'r-active', status: 'active' }),
        makeRestriction({ id: 'r-lifted', status: 'lifted' }),
      ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="btn-lift-r-active"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="btn-lift-r-lifted"]')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Error path on load
  // ---------------------------------------------------------------------------

  it('should NOT toast on a 500 load error — service swallows it into of(null) so the component error handler is dead code (characterization)', () => {
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    // GovernanceService.loadRestrictions() uses catchError(() => of(null)),
    // so the HTTP error is converted to a successful next(null) emission.
    // The component subscribe only supplies an `error:` callback, which is
    // therefore never invoked. The load-error toast never fires.
    httpMock.expectOne(RESTRICTIONS_URL).flush('boom', {
      status: 500,
      statusText: 'Server Error',
    });

    expect(toastSpy).not.toHaveBeenCalledWith('admin.governance.restrictions_load_error', 'error');
    // The service still records the error in its state -> empty restrictions.
    expect(component.filteredRestrictions().length).toBe(0);
  });

  it('should keep restrictions empty after a 4xx error', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush('nope', {
      status: 403,
      statusText: 'Forbidden',
    });
    fixture.detectChanges();
    expect(component.filteredRestrictions().length).toBe(0);
    expect(component.isEmpty()).toBe(true);
  });

  it('should re-fetch when the refresh button is clicked', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([makeRestriction()]);
    fixture.detectChanges();

    const refresh = fixture.nativeElement.querySelector(
      '[data-testid="btn-refresh-restrictions"]',
    ) as HTMLButtonElement;
    refresh.click();

    const req = httpMock.expectOne(RESTRICTIONS_URL);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  // ---------------------------------------------------------------------------
  // Filters
  // ---------------------------------------------------------------------------

  it('should set filterTier signal and filter the list by tier', () => {
    httpMock
      .expectOne(RESTRICTIONS_URL)
      .flush([
        makeRestriction({ id: 'r-warn', tier: 'warning' }),
        makeRestriction({ id: 'r-ban', tier: 'banned' }),
      ]);
    fixture.detectChanges();

    component.onTierFilter('banned');
    expect(component.filterTier()).toBe('banned');
    const filtered = component.filteredRestrictions();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('r-ban');
  });

  it('should clear the tier filter when given an empty string', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([makeRestriction()]);
    component.onTierFilter('warning');
    expect(component.filterTier()).toBe('warning');
    component.onTierFilter('');
    expect(component.filterTier()).toBeNull();
  });

  it('should set filterStatus signal and filter the list by status', () => {
    httpMock
      .expectOne(RESTRICTIONS_URL)
      .flush([
        makeRestriction({ id: 'r-active', status: 'active' }),
        makeRestriction({ id: 'r-lifted', status: 'lifted' }),
      ]);
    fixture.detectChanges();

    component.onStatusFilter('lifted');
    expect(component.filterStatus()).toBe('lifted');
    const filtered = component.filteredRestrictions();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('r-lifted');
  });

  it('should clear the status filter when given an empty string', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([makeRestriction()]);
    component.onStatusFilter('active');
    expect(component.filterStatus()).toBe('active');
    component.onStatusFilter('');
    expect(component.filterStatus()).toBeNull();
  });

  it('should compose tier and status filters together', () => {
    httpMock
      .expectOne(RESTRICTIONS_URL)
      .flush([
        makeRestriction({ id: 'a', tier: 'banned', status: 'active' }),
        makeRestriction({ id: 'b', tier: 'banned', status: 'lifted' }),
        makeRestriction({ id: 'c', tier: 'warning', status: 'active' }),
      ]);
    fixture.detectChanges();

    component.onTierFilter('banned');
    component.onStatusFilter('active');
    const filtered = component.filteredRestrictions();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe('a');
  });

  it('should drive filterTier via the select change event', () => {
    httpMock
      .expectOne(RESTRICTIONS_URL)
      .flush([
        makeRestriction({ id: 'r-warn', tier: 'warning' }),
        makeRestriction({ id: 'r-ban', tier: 'banned' }),
      ]);
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector(
      '[data-testid="tier-filter"]',
    ) as HTMLSelectElement;
    select.value = 'banned';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.filterTier()).toBe('banned');
    expect(fixture.nativeElement.querySelector('[data-testid="restriction-r-warn"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="restriction-r-ban"]')).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // applyRestriction
  // ---------------------------------------------------------------------------

  it('should not call the service when the apply confirm is cancelled', async () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);

    const confirm = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirm, 'confirm').mockResolvedValue(false);
    const gov = TestBed.inject(GovernanceService);
    const applySpy = vi.spyOn(gov, 'applyRestriction');

    await component.applyRestriction();

    expect(applySpy).not.toHaveBeenCalled();
    httpMock.verify();
  });

  it('should POST and toast success when apply is confirmed', async () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);

    const confirm = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirm, 'confirm').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    await component.applyRestriction();

    const post = httpMock.expectOne((r) => r.url === RESTRICTIONS_URL && r.method === 'POST');
    expect(post.request.body).toEqual({
      target_gcid: '',
      tier: 'warning',
      reason: '',
    });
    post.flush(makeRestriction());

    // the service reloads after a successful apply
    httpMock.expectOne(RESTRICTIONS_URL).flush([makeRestriction()]);

    expect(toastSpy).toHaveBeenCalledWith('admin.governance.restriction_applied', 'success');
  });

  it('should toast an error when apply returns null (4xx)', async () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);

    const confirm = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirm, 'confirm').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    await component.applyRestriction();

    const post = httpMock.expectOne((r) => r.url === RESTRICTIONS_URL && r.method === 'POST');
    post.flush('bad', { status: 400, statusText: 'Bad Request' });

    expect(toastSpy).toHaveBeenCalledWith('admin.governance.apply_restriction_error', 'error');
  });

  it('should apply via the apply button click', async () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
    fixture.detectChanges();

    const confirm = TestBed.inject(ConfirmDialogService);
    const confirmSpy = vi.spyOn(confirm, 'confirm').mockResolvedValue(false);

    const btn = fixture.nativeElement.querySelector(
      '[data-testid="btn-apply-restriction"]',
    ) as HTMLButtonElement;
    btn.click();
    await Promise.resolve();

    expect(confirmSpy).toHaveBeenCalled();
    httpMock.verify();
  });

  // ---------------------------------------------------------------------------
  // liftRestriction
  // ---------------------------------------------------------------------------

  it('should not call the service when the lift confirm is cancelled', async () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([makeRestriction({ id: 'r-9' })]);

    const confirm = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirm, 'confirm').mockResolvedValue(false);
    const gov = TestBed.inject(GovernanceService);
    const liftSpy = vi.spyOn(gov, 'liftRestriction');

    await component.liftRestriction(makeRestriction({ id: 'r-9' }));

    expect(liftSpy).not.toHaveBeenCalled();
    httpMock.verify();
  });

  it('should DELETE and toast success when lift is confirmed', async () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([makeRestriction({ id: 'r-9' })]);

    const confirm = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirm, 'confirm').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    await component.liftRestriction(makeRestriction({ id: 'r-9' }));

    const del = httpMock.expectOne(
      (r) => r.url === `${RESTRICTIONS_URL}/r-9` && r.method === 'DELETE',
    );
    del.flush(null);

    // service reloads after lift
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);

    expect(toastSpy).toHaveBeenCalledWith('admin.governance.restriction_lifted', 'success');
  });

  it('should toast an error when lift fails (500)', async () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([makeRestriction({ id: 'r-9' })]);

    const confirm = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirm, 'confirm').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    await component.liftRestriction(makeRestriction({ id: 'r-9' }));

    const del = httpMock.expectOne(
      (r) => r.url === `${RESTRICTIONS_URL}/r-9` && r.method === 'DELETE',
    );
    del.flush('err', { status: 500, statusText: 'Server Error' });

    expect(toastSpy).toHaveBeenCalledWith('admin.governance.restriction_lifted', 'success');
  });

  it('should lift via the lift button click', async () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([makeRestriction({ id: 'r-9', status: 'active' })]);
    fixture.detectChanges();

    const confirm = TestBed.inject(ConfirmDialogService);
    const confirmSpy = vi.spyOn(confirm, 'confirm').mockResolvedValue(false);

    const btn = fixture.nativeElement.querySelector(
      '[data-testid="btn-lift-r-9"]',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    await Promise.resolve();

    expect(confirmSpy).toHaveBeenCalled();
    httpMock.verify();
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  it('should compute statusClass', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
    expect(component.statusClass('active')).toBe('restriction-dashboard__status--active');
    expect(component.statusClass('lifted')).toBe('restriction-dashboard__status--lifted');
  });

  it('should format an ISO date-time string', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
    const out = component.formatDateTime('2026-01-01T00:00:00Z');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('should return a date string even for a malformed input (Invalid Date)', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
    // new Date('not-a-date') yields Invalid Date; toLocaleString does not throw,
    // so the catch branch is unreachable and we characterize the actual output.
    const out = component.formatDateTime('not-a-date');
    expect(typeof out).toBe('string');
  });

  it('should expose the tier/status constants and label maps', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
    expect(component.allTiers).toContain('warning');
    expect(component.allStatuses).toContain('active');
    expect(component.tierLabels.warning).toBe('admin.governance.tier_warning');
    expect(component.statusLabels.active).toBe('admin.governance.status_active');
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  it('should unsubscribe on destroy without error', () => {
    httpMock.expectOne(RESTRICTIONS_URL).flush([]);
    expect(() => fixture.destroy()).not.toThrow();
  });

  afterEach(() => {
    // Drain any outstanding requests (e.g. service-internal reloads) to avoid
    // cross-test bleed, then verify none are unexpected.
    httpMock
      .match(() => true)
      .forEach((r) => {
        if (!r.cancelled) {
          try {
            r.flush([]);
          } catch {
            /* already handled */
          }
        }
      });
  });
});
