import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ModerationLogComponent } from './moderation-log.component';
import { GovernanceService } from '../../services/governance.service';
import { environment } from '../../../../../../environments/environment';
import type { ContentModerationAction } from '../../models/governance.model';

const MODERATION_URL = `${environment.bffBaseUrl}/api/v1/governance/moderation`;

const ACTIONS: ContentModerationAction[] = [
  {
    id: 'mod-1',
    content_id: 'atom-100',
    content_type: 'atom',
    action: 'warn',
    reason: 'Borderline phrasing',
    moderator_gcid: 'gcid-mod-aaa',
    created_at: '2026-01-01T14:30:45Z',
  },
  {
    id: 'mod-2',
    content_id: 'post-200',
    content_type: 'post',
    action: 'hide',
    reason: 'Off-topic',
    moderator_gcid: 'gcid-mod-bbb',
    created_at: '2026-01-02T09:15:00Z',
  },
  {
    id: 'mod-3',
    content_id: 'comment-300',
    content_type: 'comment',
    action: 'escalate',
    reason: 'Reported by multiple users',
    moderator_gcid: 'gcid-mod-ccc',
    created_at: '2026-01-03T22:05:10Z',
  },
];

describe('ModerationLogComponent', () => {
  let component: ModerationLogComponent;
  let fixture: ComponentFixture<ModerationLogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModerationLogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ModerationLogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // -------------------------------------------------------------------------
  // Pre-existing tests (must stay green)
  // -------------------------------------------------------------------------

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="moderation-log"]');
    expect(el).toBeTruthy();
  });

  it('should compute actionClass correctly', () => {
    expect(component.actionClass('flag')).toBe('moderation-log__action--flag');
    expect(component.actionClass('remove')).toBe('moderation-log__action--remove');
  });

  it('should format timestamps', () => {
    const result = component.formatTimestamp('2026-01-01T14:30:45Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Initial load (ngOnInit) — HTTP wiring
  // -------------------------------------------------------------------------

  it('should fire a GET to the moderation endpoint on init', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const req = httpMock.expectOne(MODERATION_URL);
    expect(req.request.method).toBe('GET');
    req.flush([]);
    httpMock.verify();
  });

  it('should expose loading() while the initial request is in flight', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    // ngOnInit already set status to 'loading' before the response arrives.
    expect(component.loading()).toBe(true);
    const req = httpMock.expectOne(MODERATION_URL);
    req.flush([]);
    expect(component.loading()).toBe(false);
    httpMock.verify();
  });

  it('should render skeleton rows while loading', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const loadingEl = fixture.nativeElement.querySelector('[data-testid="moderation-loading"]');
    expect(loadingEl).toBeTruthy();
    const skeletons = loadingEl.querySelectorAll('.moderation-log__skeleton-row');
    expect(skeletons.length).toBe(4);
    httpMock.expectOne(MODERATION_URL).flush([]);
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Success state — list rendering
  // -------------------------------------------------------------------------

  it('should render the moderation list on success', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);
    fixture.detectChanges();

    const list = fixture.nativeElement.querySelector('[data-testid="moderation-list"]');
    expect(list).toBeTruthy();

    const entries = list.querySelectorAll('.moderation-log__entry');
    expect(entries.length).toBe(3);

    expect(component.filteredActions().length).toBe(3);
    expect(component.isEmpty()).toBe(false);
    expect(component.loading()).toBe(false);
    httpMock.verify();
  });

  it('should render entry content (reason, content_type, moderator) as real data', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);
    fixture.detectChanges();

    const list = fixture.nativeElement.querySelector('[data-testid="moderation-list"]');
    const text = list.textContent ?? '';
    expect(text).toContain('Borderline phrasing');
    expect(text).toContain('atom');
    expect(text).toContain('atom-100');
    expect(text).toContain('gcid-mod-aaa');
    httpMock.verify();
  });

  it('should set a stable data-testid per entry', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="moderation-mod-1"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="moderation-mod-2"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="moderation-mod-3"]')).toBeTruthy();
    httpMock.verify();
  });

  it('should apply the action class on each entry action badge', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.moderation-log__action--warn')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.moderation-log__action--hide')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.moderation-log__action--escalate')).toBeTruthy();
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('should show the empty state when the list is empty', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush([]);
    fixture.detectChanges();

    expect(component.isEmpty()).toBe(true);
    const emptyEl = fixture.nativeElement.querySelector('[data-testid="moderation-empty"]');
    expect(emptyEl).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="moderation-list"]')).toBeFalsy();
    httpMock.verify();
  });

  it('should not be empty while loading even with no data', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    // Still loading (response not flushed yet) -> isEmpty must be false.
    expect(component.loading()).toBe(true);
    expect(component.isEmpty()).toBe(false);
    httpMock.expectOne(MODERATION_URL).flush([]);
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Error state (4xx / 5xx) — characterize behavior
  // -------------------------------------------------------------------------

  it('should swallow a 500 error and surface as empty (not loading)', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // Service catchError sets moderationState to 'error'; component derives
    // empty list + not-loading from that.
    expect(component.loading()).toBe(false);
    expect(component.filteredActions().length).toBe(0);
    expect(component.isEmpty()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="moderation-empty"]')).toBeTruthy();
    httpMock.verify();
  });

  it('should swallow a 404 error the same way', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush('nope', { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.isEmpty()).toBe(true);
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  it('should filter the list by action type via onActionFilter', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);
    fixture.detectChanges();

    component.onActionFilter('hide');
    expect(component.filterAction()).toBe('hide');
    expect(component.filteredActions().length).toBe(1);
    expect(component.filteredActions()[0].id).toBe('mod-2');
    httpMock.verify();
  });

  it('should clear the filter when given an empty string', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);
    fixture.detectChanges();

    component.onActionFilter('warn');
    expect(component.filterAction()).toBe('warn');
    expect(component.filteredActions().length).toBe(1);

    component.onActionFilter('');
    expect(component.filterAction()).toBeNull();
    expect(component.filteredActions().length).toBe(3);
    httpMock.verify();
  });

  it('should re-render the list when the filter changes', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);
    fixture.detectChanges();

    component.onActionFilter('escalate');
    fixture.detectChanges();

    const entries = fixture.nativeElement.querySelectorAll('.moderation-log__entry');
    expect(entries.length).toBe(1);
    expect(fixture.nativeElement.querySelector('[data-testid="moderation-mod-3"]')).toBeTruthy();
    httpMock.verify();
  });

  it('should become empty when filter matches nothing', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    // Only "warn" actions present; filter to "restrict" -> no matches.
    httpMock.expectOne(MODERATION_URL).flush([ACTIONS[0]]);
    fixture.detectChanges();

    component.onActionFilter('restrict');
    fixture.detectChanges();

    expect(component.filteredActions().length).toBe(0);
    expect(component.isEmpty()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="moderation-empty"]')).toBeTruthy();
    httpMock.verify();
  });

  it('should reflect the filter selection through the select change handler', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector(
      '[data-testid="action-filter"]',
    );
    expect(select).toBeTruthy();
    select.value = 'warn';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.filterAction()).toBe('warn');
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Refresh button -> re-fetch
  // -------------------------------------------------------------------------

  it('should re-fetch on refresh button click', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);
    fixture.detectChanges();

    const refreshBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="btn-refresh-moderation"]',
    );
    expect(refreshBtn).toBeTruthy();
    refreshBtn.click();

    const req2 = httpMock.expectOne(MODERATION_URL);
    expect(req2.request.method).toBe('GET');
    req2.flush(ACTIONS);
    httpMock.verify();
  });

  it('should re-fetch when loadModerationLog is called directly', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush([]);

    component.loadModerationLog();
    const req2 = httpMock.expectOne(MODERATION_URL);
    req2.flush(ACTIONS);
    expect(component.filteredActions().length).toBe(3);
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Constants / helpers
  // -------------------------------------------------------------------------

  it('should expose all moderation actions and their labels', () => {
    expect(component.allActions).toEqual(['warn', 'hide', 'restrict', 'escalate']);
    expect(component.actionLabels.warn).toBe('admin.governance.moderation_warn');
    expect(component.actionLabels.escalate).toBe('admin.governance.moderation_escalate');
  });

  it('should render a select option per moderation action', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush([]);
    fixture.detectChanges();

    const options = fixture.nativeElement.querySelectorAll('[data-testid="action-filter"] option');
    // 1 "all actions" + 4 action types
    expect(options.length).toBe(5);
    httpMock.verify();
  });

  it('formatDateTime should return a non-empty string for a valid ISO date', () => {
    const out = component.formatDateTime('2026-01-01T14:30:45Z');
    expect(out).toBeTruthy();
    expect(typeof out).toBe('string');
  });

  it('formatDateTime should not throw on a garbage string', () => {
    // Date('not-a-date') yields Invalid Date; toLocaleString returns
    // 'Invalid Date' (does not throw), so the input is not echoed back.
    const out = component.formatDateTime('not-a-date');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('formatTimestamp should not throw on a garbage string', () => {
    const out = component.formatTimestamp('garbage');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Service integration through computed signal
  // -------------------------------------------------------------------------

  it('filteredActions should mirror the service moderationActions when unfiltered', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const svc = TestBed.inject(GovernanceService);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);

    expect(component.filterAction()).toBeNull();
    expect(component.filteredActions()).toEqual(svc.moderationActions());
    expect(svc.moderationActions().length).toBe(3);
    httpMock.verify();
  });

  // -------------------------------------------------------------------------
  // Lifecycle teardown
  // -------------------------------------------------------------------------

  it('should unsubscribe on destroy without error', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(MODERATION_URL).flush(ACTIONS);
    expect(() => fixture.destroy()).not.toThrow();
    httpMock.verify();
  });
});
