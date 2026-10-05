import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { EscalationTrackerComponent } from './escalation-tracker.component';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../../environments/environment';
import type { EscalationState } from '../../models/escalation.model';

const ESCALATION_URL = `${environment.bffBaseUrl}/api/v1/governance/escalation`;
const DE_ESCALATE_URL = `${environment.bffBaseUrl}/api/v1/governance/escalation/de-escalate`;

const STUB_ESCALATION: EscalationState = {
  current_tier: 'tier_2',
  warning_count: 2,
  thresholds: [
    {
      tier: 'tier_1',
      label_key: 'governance.tier_1_warning',
      warnings_required: 0,
      description_key: 'governance.tier_1_desc',
    },
    {
      tier: 'tier_2',
      label_key: 'governance.tier_2_limited',
      warnings_required: 2,
      description_key: 'governance.tier_2_desc',
    },
    {
      tier: 'tier_3',
      label_key: 'governance.tier_3_restricted',
      warnings_required: 3,
      description_key: 'governance.tier_3_desc',
    },
    {
      tier: 'tier_4',
      label_key: 'governance.tier_4_readonly',
      warnings_required: 5,
      description_key: 'governance.tier_4_desc',
    },
  ],
  history: [
    {
      id: 'esc-001',
      target_gcid: 'gcid-aaa',
      from_tier: 'tier_1',
      to_tier: 'tier_2',
      reason: 'Repeated policy violations',
      escalated_at: '2026-05-01T10:00:00Z',
      escalated_by: 'admin-001',
    },
    {
      id: 'esc-002',
      target_gcid: 'gcid-aaa',
      from_tier: 'tier_2',
      to_tier: 'tier_3',
      reason: 'Further violations',
      escalated_at: '2026-05-10T12:30:00Z',
      escalated_by: 'admin-002',
    },
  ],
};

// =============================================================================
// ORIGINAL SUITE — preserved verbatim. These tests do not flush the init GET,
// so no httpMock.verify() is asserted here (matches pre-augmentation behavior).
// =============================================================================
describe('EscalationTrackerComponent', () => {
  let component: EscalationTrackerComponent;
  let fixture: ComponentFixture<EscalationTrackerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EscalationTrackerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(EscalationTrackerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="escalation-tracker"]');
    expect(el).toBeTruthy();
  });

  it('should return correct tier class', () => {
    expect(component.tierClass('tier_1')).toBe('escalation-tracker__tier--tier_1');
    expect(component.tierClass('tier_3')).toBe('escalation-tracker__tier--tier_3');
  });

  it('should default to tier_1 when no data loaded', () => {
    expect(component.currentTier()).toBe('tier_1');
  });

  it('should have 0 warning count by default', () => {
    expect(component.warningCount()).toBe(0);
  });

  it('should identify current tier correctly', () => {
    expect(component.isCurrentTier('tier_1')).toBe(true);
    expect(component.isCurrentTier('tier_2')).toBe(false);
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

// =============================================================================
// AUGMENTED SUITE — drives the BFF HTTP surface + de-escalation interactions.
// =============================================================================
describe('EscalationTrackerComponent — data + interactions', () => {
  let fixture: ComponentFixture<EscalationTrackerComponent>;
  let component: EscalationTrackerComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  function build(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [EscalationTrackerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(EscalationTrackerComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  }

  function loadSuccess(data: EscalationState = STUB_ESCALATION): void {
    fixture.detectChanges(); // triggers ngOnInit → loadEscalation GET
    const req = httpMock.expectOne(ESCALATION_URL);
    expect(req.request.method).toBe('GET');
    req.flush(data);
    fixture.detectChanges();
  }

  beforeEach(() => build());

  // ---- loading state -------------------------------------------------------
  describe('loading state', () => {
    it('issues a GET to the escalation endpoint on init', () => {
      fixture.detectChanges();
      const req = httpMock.expectOne(ESCALATION_URL);
      expect(req.request.method).toBe('GET');
      req.flush(STUB_ESCALATION);
      httpMock.verify();
    });

    it('renders the loading skeleton while the request is in flight', () => {
      fixture.detectChanges();
      httpMock.expectOne(ESCALATION_URL); // leave un-flushed → still loading
      expect(component.isLoading()).toBe(true);
      const loading = element.querySelector('[data-testid="escalation-loading"]');
      expect(loading).not.toBeNull();
      // success content not yet rendered
      expect(element.querySelector('[data-testid="current-tier"]')).toBeNull();
    });
  });

  // ---- success state -------------------------------------------------------
  describe('success state', () => {
    beforeEach(() => loadSuccess());

    afterEach(() => httpMock.verify());

    it('clears the loading state after a successful response', () => {
      expect(component.isLoading()).toBe(false);
      expect(element.querySelector('[data-testid="escalation-loading"]')).toBeNull();
    });

    it('exposes the loaded escalation via the computed signal', () => {
      expect(component.escalation()).toEqual(STUB_ESCALATION);
      expect(component.state().status).toBe('success');
    });

    it('renders the current tier with its tier class', () => {
      const current = element.querySelector('[data-testid="current-tier"]');
      expect(current).not.toBeNull();
      const value = current?.querySelector('.escalation-tracker__current-value');
      expect(value?.className).toContain('escalation-tracker__tier--tier_2');
      // translate pipe returns the raw key in tests
      expect(value?.textContent).toContain('governance.tier_2_limited');
    });

    it('reflects current_tier + warning_count from the payload', () => {
      expect(component.currentTier()).toBe('tier_2');
      expect(component.warningCount()).toBe(2);
    });

    it('renders the warning progress bar with the right aria bounds', () => {
      const progress = element.querySelector('[data-testid="warning-progress"]');
      expect(progress).not.toBeNull();
      const track = progress?.querySelector('[role="progressbar"]');
      expect(track?.getAttribute('aria-valuenow')).toBe('2');
      expect(track?.getAttribute('aria-valuemax')).toBe('3'); // tier_3 needs 3
    });

    it('renders one threshold item per threshold', () => {
      const items = element.querySelectorAll('[data-testid="threshold-item"]');
      expect(items.length).toBe(STUB_ESCALATION.thresholds.length);
    });

    it('marks the current tier threshold item as current', () => {
      const items = Array.from(element.querySelectorAll('[data-testid="threshold-item"]'));
      const currentItems = items.filter((i) =>
        i.classList.contains('escalation-tracker__threshold-item--current'),
      );
      expect(currentItems.length).toBe(1);
    });

    it('renders one history row per escalation entry with the reason', () => {
      const rows = element.querySelectorAll('[data-testid="history-row"]');
      expect(rows.length).toBe(2);
      const table = element.querySelector('[data-testid="escalation-history"]');
      expect(table?.textContent).toContain('Repeated policy violations');
      expect(table?.textContent).toContain('Further violations');
    });

    it('enables the de-escalate button when above tier_1', () => {
      const btn = element.querySelector('[data-testid="btn-de-escalate"]') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.disabled).toBe(false);
    });
  });

  // ---- computed: nextThreshold + progressPercent ---------------------------
  describe('next-threshold + progress computeds', () => {
    afterEach(() => httpMock.verify());

    it('selects the next tier threshold above the current tier', () => {
      loadSuccess(); // tier_2 current
      const next = component.nextThreshold();
      expect(next?.tier).toBe('tier_3');
      expect(next?.warnings_required).toBe(3);
    });

    it('computes progressPercent as warnings/required clamped to 100', () => {
      loadSuccess(); // 2 / 3 ≈ 66.67
      expect(component.progressPercent()).toBeCloseTo((2 / 3) * 100, 4);
    });

    it('clamps progressPercent at 100 when warnings exceed required', () => {
      loadSuccess({ ...STUB_ESCALATION, warning_count: 10 });
      expect(component.progressPercent()).toBe(100);
    });

    it('returns null nextThreshold + 100 progress at the top tier (tier_4)', () => {
      loadSuccess({ ...STUB_ESCALATION, current_tier: 'tier_4' });
      expect(component.nextThreshold()).toBeNull();
      expect(component.progressPercent()).toBe(100);
      // no progress bar rendered when there is no next threshold
      expect(element.querySelector('[data-testid="warning-progress"]')).toBeNull();
    });

    it('returns 100 progress when the next threshold requires 0 warnings', () => {
      loadSuccess({
        ...STUB_ESCALATION,
        current_tier: 'tier_1',
        thresholds: [
          {
            tier: 'tier_2',
            label_key: 'governance.tier_2_limited',
            warnings_required: 0,
            description_key: 'd',
          },
        ],
      });
      expect(component.nextThreshold()?.warnings_required).toBe(0);
      expect(component.progressPercent()).toBe(100);
    });

    it('returns null nextThreshold when no threshold matches the next tier', () => {
      loadSuccess({
        ...STUB_ESCALATION,
        current_tier: 'tier_1',
        thresholds: [], // nothing matches tier_2
      });
      expect(component.nextThreshold()).toBeNull();
      expect(component.progressPercent()).toBe(100);
    });
  });

  // ---- empty-ish payload ---------------------------------------------------
  describe('minimal payload', () => {
    afterEach(() => httpMock.verify());

    it('hides thresholds + history sections when both are empty', () => {
      loadSuccess({
        current_tier: 'tier_1',
        warning_count: 0,
        thresholds: [],
        history: [],
      });
      expect(element.querySelector('[data-testid="thresholds"]')).toBeNull();
      expect(element.querySelector('[data-testid="escalation-history"]')).toBeNull();
      // de-escalation controls still render
      expect(element.querySelector('[data-testid="de-escalation-controls"]')).not.toBeNull();
    });

    it('disables the de-escalate button at tier_1', () => {
      loadSuccess({
        current_tier: 'tier_1',
        warning_count: 0,
        thresholds: [],
        history: [],
      });
      const btn = element.querySelector('[data-testid="btn-de-escalate"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });
  });

  // ---- error state ---------------------------------------------------------
  describe('error state', () => {
    it('renders the error banner when the load fails (5xx)', () => {
      fixture.detectChanges();
      httpMock
        .expectOne(ESCALATION_URL)
        .flush({ error: 'boom' }, { status: 500, statusText: 'Internal Server Error' });
      fixture.detectChanges();

      expect(component.isError()).toBe(true);
      expect(component.escalation()).toBeNull();
      const err = element.querySelector('[data-testid="escalation-error"]');
      expect(err).not.toBeNull();
      const s = component.state();
      expect(s.status).toBe('error');
      if (s.status === 'error') {
        expect(s.error.code).toBe('ESCALATION_LOAD_FAILED');
      }
      httpMock.verify();
    });

    it('falls back to tier_1 defaults on error', () => {
      fixture.detectChanges();
      httpMock.expectOne(ESCALATION_URL).flush('nope', { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      expect(component.currentTier()).toBe('tier_1');
      expect(component.warningCount()).toBe(0);
      expect(component.thresholds()).toEqual([]);
      expect(component.history()).toEqual([]);
      httpMock.verify();
    });
  });

  // ---- de-escalation flow --------------------------------------------------
  describe('de-escalation flow', () => {
    it('does nothing when the confirmation is cancelled', async () => {
      loadSuccess();
      const confirmSvc = TestBed.inject(ConfirmDialogService);
      const confirmSpy = vi.spyOn(confirmSvc, 'confirm').mockResolvedValue(false);

      await component.deEscalate();

      expect(confirmSpy).toHaveBeenCalledOnce();
      expect(component.deEscalating()).toBe(false);
      // No POST should have fired.
      httpMock.verify();
    });

    it('POSTs de-escalate, toasts success, then refetches when confirmed', async () => {
      loadSuccess();
      const confirmSvc = TestBed.inject(ConfirmDialogService);
      const toast = TestBed.inject(ToastService);
      vi.spyOn(confirmSvc, 'confirm').mockResolvedValue(true);
      const toastSpy = vi.spyOn(toast, 'show');

      const promise = component.deEscalate();
      // deEscalate awaits the confirm() Promise before issuing the POST;
      // let that microtask settle so the request is queued.
      await Promise.resolve();

      const post = httpMock.expectOne(DE_ESCALATE_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({});
      post.flush(null);
      await promise;

      // success → loadEscalation refetch (GET)
      fixture.detectChanges();
      httpMock.expectOne(ESCALATION_URL).flush(STUB_ESCALATION);
      fixture.detectChanges();

      expect(component.deEscalating()).toBe(false);
      expect(toastSpy).toHaveBeenCalledWith('admin.governance.de_escalated', 'success');
      httpMock.verify();
    });

    it('toasts an error and clears the busy flag when the POST fails', async () => {
      loadSuccess();
      const confirmSvc = TestBed.inject(ConfirmDialogService);
      const toast = TestBed.inject(ToastService);
      vi.spyOn(confirmSvc, 'confirm').mockResolvedValue(true);
      const toastSpy = vi.spyOn(toast, 'show');

      const promise = component.deEscalate();
      await Promise.resolve(); // settle the confirm() microtask

      httpMock
        .expectOne(DE_ESCALATE_URL)
        .flush('fail', { status: 500, statusText: 'Server Error' });
      await promise;

      expect(component.deEscalating()).toBe(false);
      expect(toastSpy).toHaveBeenCalledWith('admin.governance.de_escalate_error', 'error');
      // No refetch should fire on the error path.
      httpMock.verify();
    });

    it('clicking the enabled button invokes the confirm dialog', async () => {
      loadSuccess();
      const confirmSvc = TestBed.inject(ConfirmDialogService);
      const confirmSpy = vi.spyOn(confirmSvc, 'confirm').mockResolvedValue(false);

      const btn = element.querySelector('[data-testid="btn-de-escalate"]') as HTMLButtonElement;
      btn.click();
      await Promise.resolve();

      expect(confirmSpy).toHaveBeenCalledOnce();
      httpMock.verify();
    });
  });

  // ---- helpers -------------------------------------------------------------
  describe('helpers', () => {
    afterEach(() => httpMock.verify());

    it('formatDate renders a locale string for a valid ISO date', () => {
      loadSuccess();
      const out = component.formatDate('2026-05-01T10:00:00Z');
      expect(out).not.toBe('2026-05-01T10:00:00Z');
      expect(out.length).toBeGreaterThan(0);
    });

    it('formatDate returns a non-empty string for an unparseable input', () => {
      loadSuccess();
      // new Date('not-a-date') yields Invalid Date; toLocaleString does not
      // throw, so the catch is not hit — characterize the actual output.
      const out = component.formatDate('not-a-date');
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
    });

    it('isCurrentTier reflects the loaded tier', () => {
      loadSuccess(); // tier_2
      expect(component.isCurrentTier('tier_2')).toBe(true);
      expect(component.isCurrentTier('tier_1')).toBe(false);
      expect(component.isCurrentTier('tier_3')).toBe(false);
    });

    it('tierClass builds the BEM modifier for any tier string', () => {
      loadSuccess();
      expect(component.tierClass('tier_4')).toBe('escalation-tracker__tier--tier_4');
    });
  });

  // ---- lifecycle -----------------------------------------------------------
  describe('lifecycle', () => {
    it('ngOnDestroy unsubscribes without error', () => {
      loadSuccess();
      expect(() => fixture.destroy()).not.toThrow();
      httpMock.verify();
    });
  });
});
