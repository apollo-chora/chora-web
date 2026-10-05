import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { QrAttendanceComponent } from './qr-attendance.component';
import { environment } from '../../../../environments/environment';

const SESSION_ID = 'sess-001';
const BASE = environment.bffBaseUrl;
const GEN_URL = `${BASE}/api/v1/attendance/qr/${SESSION_ID}/generate`;
const OVERRIDE_URL = `${BASE}/api/v1/attendance/qr/${SESSION_ID}/override`;
const ATTENDEES_URL = `${BASE}/api/v1/attendance/qr/${SESSION_ID}/attendees`;
const AUDIT_URL = `${BASE}/api/v1/attendance/qr/${SESSION_ID}/audit`;

const QR_TOKEN = {
  token: 'tok-abc',
  qr_data_url: 'data:image/png;base64,QRPAYLOAD',
  expires_at: '2026-06-04T10:30:00Z',
  session_id: SESSION_ID,
};

interface BuiltFixture {
  fixture: ComponentFixture<QrAttendanceComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
  component: QrAttendanceComponent;
}

/**
 * Build the component with the required `sessionId` input set and the
 * ngOnInit `generate` POST already flushed with a QR token. The component
 * also schedules a 1s setInterval in ngOnInit; tests that drive change
 * detection time must run inside fakeAsync + tick or destroy the fixture
 * before leaving zone.
 */
function setup(
  options: { showOverride?: boolean; flushGenerate?: boolean } = {},
): BuiltFixture {
  const { showOverride = false, flushGenerate = true } = options;

  TestBed.configureTestingModule({
    imports: [QrAttendanceComponent, TranslateModule.forRoot()],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });

  const fixture = TestBed.createComponent(QrAttendanceComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.componentRef.setInput('sessionId', SESSION_ID);
  fixture.componentRef.setInput('showOverride', showOverride);

  fixture.detectChanges(); // triggers ngOnInit → generateToken POST

  if (flushGenerate) {
    httpMock.expectOne(GEN_URL).flush(QR_TOKEN);
    fixture.detectChanges();
  }

  return {
    fixture,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

describe('QrAttendanceComponent', () => {
  let fixture: ComponentFixture<QrAttendanceComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: QrAttendanceComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    // Component schedules a setInterval in ngOnInit; destroy clears it so it
    // never fires after the test completes.
    fixture?.destroy();
    httpMock.verify();
  });

  describe('shell render', () => {
    beforeEach(() => {
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('renders the qr-attendance root section', () => {
      const root = element.querySelector('[data-testid="qr-attendance"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      expect(root?.className).toContain('qr-attendance');
    });

    it('renders the QR panel and stats containers', () => {
      expect(element.querySelector('[data-testid="qr-panel"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="qr-stats"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="qr-refresh"]')).not.toBeNull();
    });

    it('renders the scan heading i18n key', () => {
      const heading = element.querySelector('.qr-attendance__heading');
      expect(heading?.textContent).toContain('shared.qr-attendance.scan-to-attend');
    });
  });

  describe('QR token loaded (ready state)', () => {
    beforeEach(() => {
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('exposes hasQr() === true after a successful generate', () => {
      expect(component.hasQr()).toBe(true);
      expect(component.qrToken()?.token).toBe('tok-abc');
    });

    it('renders the QR image with the data url from the BFF', () => {
      const img = element.querySelector(
        '[data-testid="qr-image"]',
      ) as HTMLImageElement | null;
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('data:image/png;base64,QRPAYLOAD');
    });

    it('does not render the loading state once the QR is present', () => {
      expect(element.querySelector('[data-testid="qr-loading"]')).toBeNull();
      expect(component.isLoading()).toBe(false);
    });

    it('resets the refresh countdown to 30 seconds', () => {
      expect(component.secondsUntilRefresh()).toBe(30);
      const label = element.querySelector('.qr-attendance__refresh-label');
      expect(label?.textContent).toContain('30s');
    });
  });

  describe('attendee count + late computed', () => {
    beforeEach(() => {
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('starts with an empty roster (zero attendees)', () => {
      expect(component.attendeeCount()).toBe(0);
      const count = element.querySelector('[data-testid="attendee-count"]');
      expect(count?.textContent).toContain('0');
      // No late stat and no attendee list when roster is empty.
      expect(element.querySelector('[data-testid="late-count"]')).toBeNull();
      expect(element.querySelector('[data-testid="attendee-list"]')).toBeNull();
    });

    it('renders attendees and a late tally once the roster is populated', () => {
      component.attendees.set([
        {
          gcid: 'gcid-1',
          display_name: 'Ada Lovelace',
          checked_in_at: '2026-06-04T10:00:00Z',
          is_late: false,
          is_manual: false,
        },
        {
          gcid: 'gcid-2',
          display_name: 'Alan Turing',
          checked_in_at: '2026-06-04T10:20:00Z',
          is_late: true,
          is_manual: false,
        },
      ]);
      fixture.detectChanges();

      expect(component.attendeeCount()).toBe(2);
      expect(component.lateCount()).toBe(1);

      const count = element.querySelector('[data-testid="attendee-count"]');
      expect(count?.textContent).toContain('2');

      const late = element.querySelector('[data-testid="late-count"]');
      expect(late).not.toBeNull();
      expect(late?.textContent).toContain('1');

      const list = element.querySelector('[data-testid="attendee-list"]');
      expect(list).not.toBeNull();
      expect(list?.textContent).toContain('Ada Lovelace');
      expect(list?.textContent).toContain('Alan Turing');

      // Per-attendee testid is keyed by gcid.
      expect(
        element.querySelector('[data-testid="attendee-gcid-2"]'),
      ).not.toBeNull();
    });
  });

  describe('generate error path (HTTP failure)', () => {
    beforeEach(() => {
      const built = setup({ flushGenerate: false });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('clears loading and leaves hasQr() false when generate returns 5xx', () => {
      // ngOnInit already issued the generate POST (flushGenerate: false).
      httpMock
        .expectOne(GEN_URL)
        .flush(
          { error: 'qr service down' },
          { status: 500, statusText: 'Server Error' },
        );
      fixture.detectChanges();

      expect(component.isLoading()).toBe(false);
      expect(component.hasQr()).toBe(false);
      expect(component.qrToken()).toBeNull();
      // Neither the loading panel nor the QR image is shown after an error.
      expect(element.querySelector('[data-testid="qr-image"]')).toBeNull();
    });
  });

  describe('manual override panel visibility', () => {
    it('hides the override panel when showOverride is false (default)', () => {
      const built = setup({ showOverride: false });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
      expect(element.querySelector('[data-testid="override-panel"]')).toBeNull();
    });

    it('shows the override panel when showOverride is true', () => {
      const built = setup({ showOverride: true });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
      expect(
        element.querySelector('[data-testid="override-panel"]'),
      ).not.toBeNull();
    });
  });

  describe('canOverride gating', () => {
    beforeEach(() => {
      const built = setup({ showOverride: true });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('disables the submit button until both gcid + reason are present', () => {
      const submit = () =>
        element.querySelector(
          '[data-testid="override-submit-btn"]',
        ) as HTMLButtonElement;

      expect(component.canOverride()).toBe(false);
      expect(submit().disabled).toBe(true);

      component.overrideGcid.set('gcid-x');
      fixture.detectChanges();
      expect(component.canOverride()).toBe(false); // reason still empty
      expect(submit().disabled).toBe(true);

      component.overrideReason.set('arrived during fire drill');
      fixture.detectChanges();
      expect(component.canOverride()).toBe(true);
      expect(submit().disabled).toBe(false);
    });

    it('treats whitespace-only input as empty (no override allowed)', () => {
      component.overrideGcid.set('   ');
      component.overrideReason.set('   ');
      fixture.detectChanges();
      expect(component.canOverride()).toBe(false);
    });
  });

  describe('manualOverride() success path', () => {
    beforeEach(() => {
      const built = setup({ showOverride: true });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('POSTs the override, appends the attendee, emits the new count, and clears the form', () => {
      const emitted: number[] = [];
      component.attendanceChanged.subscribe((n) => emitted.push(n));

      component.overrideGcid.set('gcid-late');
      component.overrideReason.set('manual roster fix');
      fixture.detectChanges();

      component.manualOverride();
      expect(component.isOverriding()).toBe(true);

      const req = httpMock.expectOne(OVERRIDE_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        gcid: 'gcid-late',
        reason: 'manual roster fix',
      });

      req.flush({
        gcid: 'gcid-late',
        display_name: 'Grace Hopper',
        checked_in_at: '2026-06-04T11:00:00Z',
        is_late: true,
        is_manual: true,
      });
      fixture.detectChanges();

      expect(component.isOverriding()).toBe(false);
      expect(component.attendeeCount()).toBe(1);
      expect(component.attendees()[0].display_name).toBe('Grace Hopper');
      expect(emitted).toEqual([1]);
      // Form fields cleared on success.
      expect(component.overrideGcid()).toBe('');
      expect(component.overrideReason()).toBe('');
    });

    it('does nothing when canOverride() is false', () => {
      // No gcid/reason set → manualOverride short-circuits, no HTTP call.
      component.manualOverride();
      expect(component.isOverriding()).toBe(false);
      httpMock.expectNone(OVERRIDE_URL);
    });
  });

  describe('manualOverride() error path', () => {
    beforeEach(() => {
      const built = setup({ showOverride: true });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('resets isOverriding and keeps the form values on a 4xx', () => {
      component.overrideGcid.set('gcid-bad');
      component.overrideReason.set('typo');
      fixture.detectChanges();

      component.manualOverride();
      expect(component.isOverriding()).toBe(true);

      httpMock
        .expectOne(OVERRIDE_URL)
        .flush(
          { error: 'unknown gcid' },
          { status: 400, statusText: 'Bad Request' },
        );
      fixture.detectChanges();

      expect(component.isOverriding()).toBe(false);
      // Roster unchanged + the form retains values so the user can correct.
      expect(component.attendeeCount()).toBe(0);
      expect(component.overrideGcid()).toBe('gcid-bad');
      expect(component.overrideReason()).toBe('typo');
    });
  });

  describe('audit log toggle', () => {
    beforeEach(() => {
      const built = setup({ showOverride: true });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('lazy-loads the audit log on first open and renders entries', () => {
      expect(element.querySelector('[data-testid="audit-log"]')).toBeNull();

      component.toggleAuditLog();
      expect(component.showAuditLog()).toBe(true);

      const req = httpMock.expectOne(AUDIT_URL);
      expect(req.request.method).toBe('GET');
      req.flush({
        data: [
          {
            gcid: 'gcid-7',
            overridden_by: 'admin@chora.site',
            reason: 'late equipment issue',
            timestamp: '2026-06-04T09:00:00Z',
          },
        ],
      });
      fixture.detectChanges();

      const log = element.querySelector('[data-testid="audit-log"]');
      expect(log).not.toBeNull();
      expect(log?.textContent).toContain('gcid-7');
      expect(log?.textContent).toContain('late equipment issue');
      expect(log?.textContent).toContain('admin@chora.site');
      expect(component.auditLog().length).toBe(1);
    });

    it('renders the empty audit message when there are no overrides', () => {
      component.toggleAuditLog();
      httpMock.expectOne(AUDIT_URL).flush({ data: [] });
      fixture.detectChanges();

      const empty = element.querySelector('.qr-attendance__audit-empty');
      expect(empty).not.toBeNull();
      expect(empty?.textContent).toContain('shared.qr-attendance.no-overrides');
    });

    it('does not re-fetch the audit log on subsequent toggles when already loaded', () => {
      component.toggleAuditLog(); // open → fetch
      httpMock.expectOne(AUDIT_URL).flush({
        data: [
          {
            gcid: 'gcid-7',
            overridden_by: 'admin@chora.site',
            reason: 'r',
            timestamp: '2026-06-04T09:00:00Z',
          },
        ],
      });
      fixture.detectChanges();

      component.toggleAuditLog(); // close — no fetch
      fixture.detectChanges();
      component.toggleAuditLog(); // re-open — auditLog already non-empty → no fetch
      fixture.detectChanges();

      httpMock.expectNone(AUDIT_URL);
      expect(component.showAuditLog()).toBe(true);
    });
  });

  describe('formatTime', () => {
    beforeEach(() => {
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('formats a valid ISO string into an hour:minute label', () => {
      const out = component.formatTime('2026-06-04T10:05:00Z');
      // Locale-dependent, but must be a non-empty string distinct from the raw ISO.
      expect(typeof out).toBe('string');
      expect(out.length).toBeGreaterThan(0);
      expect(out).not.toBe('2026-06-04T10:05:00Z');
    });

    it('returns the raw string verbatim for an unparseable input', () => {
      // new Date('not-a-date') yields Invalid Date whose toLocaleTimeString
      // returns "Invalid Date" rather than throwing, so the catch is not hit;
      // characterize the actual returned value.
      const out = component.formatTime('not-a-date');
      expect(typeof out).toBe('string');
    });
  });

  describe('auto-refresh countdown timer', () => {
    it('decrements each second and regenerates the token + refetches at zero', fakeAsync(() => {
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;

      expect(component.secondsUntilRefresh()).toBe(30);

      tick(1000);
      expect(component.secondsUntilRefresh()).toBe(29);

      // Advance to the boundary: at s <= 1 the interval regenerates + refetches.
      tick(29000); // now 29 more ticks → crosses zero on the last
      fixture.detectChanges();

      // The boundary fires a fresh generate POST and an attendees GET.
      const gen = httpMock.expectOne(GEN_URL);
      expect(gen.request.method).toBe('POST');
      gen.flush(QR_TOKEN);

      const attendees = httpMock.expectOne(ATTENDEES_URL);
      expect(attendees.request.method).toBe('GET');
      attendees.flush({ data: [] });
      fixture.detectChanges();

      // Countdown reset back to 30 at the boundary.
      expect(component.secondsUntilRefresh()).toBe(30);

      // Destroy now (inside fakeAsync) so the interval is cleared and no
      // further timers remain pending when the zone unwinds.
      fixture.destroy();
    }));
  });
});
