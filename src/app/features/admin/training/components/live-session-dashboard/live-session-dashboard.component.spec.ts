import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { LiveSessionDashboardComponent } from './live-session-dashboard.component';
import { LiveSessionData, TrainingSession } from '../../services/training-admin.service';
import { environment } from '../../../../../../environments/environment';

// ---------------------------------------------------------------------------
// Fixtures + URL helpers
// ---------------------------------------------------------------------------

const SESSION_ID = 'sess-live-001';
const BASE = environment.bffBaseUrl;
const LIVE_URL = `${BASE}/api/v1/training-admin/sessions/${SESSION_ID}/live`;
const ADVANCE_URL = `${BASE}/api/v1/training-admin/sessions/${SESSION_ID}/advance`;
// The embedded chora-qr-attendance child fires a generate POST on init once
// liveData() is present (the panels render). It also schedules a 1s
// setInterval — destroying the fixture in afterEach clears it.
const QR_GEN_URL = `${BASE}/api/v1/attendance/qr/${SESSION_ID}/generate`;

const QR_TOKEN = {
  token: 'tok-1',
  qr_data_url: 'data:image/png;base64,QR',
  expires_at: '2026-06-04T10:30:00Z',
  session_id: SESSION_ID,
};

function makeSession(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: SESSION_ID,
    tenant_id: 'tenant-001',
    title: 'Workplace Safety Refresher',
    description: 'Annual compliance session',
    status: 'live',
    scheduled_at: '2026-06-04T09:00:00Z',
    duration_minutes: 90,
    agenda: [
      {
        atom_id: 'atom-a',
        atom_title: 'Fire Evacuation Basics',
        atom_type: 'video',
        order: 0,
        delivery_notes: 'Show the muster-point map.',
        duration_minutes: 20,
      },
      {
        atom_id: 'atom-b',
        atom_title: 'Hazard Reporting',
        atom_type: 'reading',
        order: 1,
        delivery_notes: '',
        duration_minutes: 15,
      },
      {
        atom_id: 'atom-c',
        atom_title: 'Quiz',
        atom_type: 'quiz',
        order: 2,
        delivery_notes: 'Collect scores.',
        duration_minutes: 10,
      },
    ],
    trainer_gcid: 'gcid-trainer',
    max_participants: 30,
    venue_id: 'venue-1',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

function makeLiveData(overrides: Partial<LiveSessionData> = {}): LiveSessionData {
  return {
    session: makeSession(overrides.session ? undefined : {}),
    attendance_count: 18,
    total_expected: 25,
    current_agenda_index: 1,
    engagement_score: 72,
    late_arrivals: 3,
    ...overrides,
  };
}

interface BuiltFixture {
  fixture: ComponentFixture<LiveSessionDashboardComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
  component: LiveSessionDashboardComponent;
}

/**
 * Build the dashboard with the route :sessionId param set. ngOnInit issues the
 * initial live GET (plus an interval(10000) refresh that does not fire within
 * a synchronous test). Pass `flushLive` with the live payload to flush the GET
 * and `flushQr` to flush the embedded QR child's generate POST that fires once
 * the panels render.
 */
function setup(
  options: {
    sessionId?: string;
    flushLive?: LiveSessionData | null;
    flushQr?: boolean;
  } = {},
): BuiltFixture {
  const { sessionId = SESSION_ID, flushLive, flushQr = true } = options;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [LiveSessionDashboardComponent, TranslateModule.forRoot()],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => sessionId } } },
      },
    ],
  });

  const fixture = TestBed.createComponent(LiveSessionDashboardComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges(); // ngOnInit → live GET (when sessionId present)

  if (flushLive !== undefined && sessionId) {
    const live = httpMock.expectOne(LIVE_URL);
    if (flushLive === null) {
      live.flush({ error: 'session not live' }, { status: 404, statusText: 'Not Found' });
    } else {
      live.flush(flushLive);
    }
    fixture.detectChanges();
    // Panels render only on success → the QR child generates its token.
    if (flushLive !== null && flushQr) {
      const matches = httpMock.match(QR_GEN_URL);
      matches.forEach((req) => req.flush(QR_TOKEN));
      fixture.detectChanges();
    }
  }

  return {
    fixture,
    httpMock,
    element: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

describe('LiveSessionDashboardComponent', () => {
  let fixture: ComponentFixture<LiveSessionDashboardComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: LiveSessionDashboardComponent;

  afterEach(() => {
    // The parent schedules interval(10000) and the embedded QR child a 1s
    // setInterval in ngOnInit; destroy clears both before the zone unwinds.
    fixture?.destroy();
    httpMock?.verify();
  });

  // -------------------------------------------------------------------------
  // ngOnInit + loading state
  // -------------------------------------------------------------------------

  describe('initialisation + loading state', () => {
    beforeEach(() => {
      // No flushLive → the initial GET stays pending → loading state.
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    afterEach(() => {
      // These loading-state tests leave the initial live GET pending on
      // purpose. Drain any still-open request as an error so panels never
      // render (no QR child request) and the outer verify() passes.
      httpMock.match(LIVE_URL).forEach((r) => {
        if (!r.cancelled) {
          r.flush({ error: 'drain' }, { status: 500, statusText: 'Server Error' });
        }
      });
    });

    it('creates the component', () => {
      expect(component).toBeTruthy();
    });

    it('captures the sessionId from the route snapshot', () => {
      expect(component.sessionId()).toBe(SESSION_ID);
    });

    it('renders the dashboard root section', () => {
      const root = element.querySelector('[data-testid="live-session-dashboard"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
    });

    it('shows the loading panel while the first live GET is pending', () => {
      const loading = element.querySelector('[data-testid="live-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('role')).toBe('status');
      expect(loading?.textContent).toContain('training.live-session.loading');
    });

    it('issues the live GET to the contract path', () => {
      // The pending request is asserted here (and re-flushed implicitly by
      // verify in afterEach would fail), so flush it now to drain it.
      const req = httpMock.expectOne(LIVE_URL);
      expect(req.request.method).toBe('GET');
      req.flush(makeLiveData());
      fixture.detectChanges();
      httpMock.match(QR_GEN_URL).forEach((r) => r.flush(QR_TOKEN));
    });

    it('does not render header/panels before data arrives', () => {
      expect(element.querySelector('[data-testid="live-header"]')).toBeNull();
      expect(element.querySelector('[data-testid="live-panels"]')).toBeNull();
      // Drain the pending GET so verify() passes.
      httpMock.expectOne(LIVE_URL).flush(makeLiveData());
      fixture.detectChanges();
      httpMock.match(QR_GEN_URL).forEach((r) => r.flush(QR_TOKEN));
    });
  });

  describe('missing sessionId guard', () => {
    it('does not fire any HTTP when the route param is empty', () => {
      const built = setup({ sessionId: '' });
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;

      expect(component.sessionId()).toBe('');
      httpMock.expectNone(LIVE_URL);
    });
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  describe('error state', () => {
    beforeEach(() => {
      const built = setup({ flushLive: null });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('renders the error panel with role=alert', () => {
      const err = element.querySelector('[data-testid="live-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(err?.textContent).toContain('training.live-session.error-title');
    });

    it('exposes the error message via liveError()', () => {
      expect(component.liveError().length).toBeGreaterThan(0);
      const p = element.querySelector('[data-testid="live-error"] p');
      expect(p?.textContent).toBe(component.liveError());
    });

    it('does not render the panels in the error state', () => {
      expect(element.querySelector('[data-testid="live-panels"]')).toBeNull();
      expect(element.querySelector('[data-testid="live-header"]')).toBeNull();
    });

    it('liveError() is empty string when state is not an error', () => {
      // Drive a fresh success build to characterise the non-error branch.
      const built = setup({ flushLive: makeLiveData() });
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;
      expect(component.liveError()).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Ready / success state — header + computed signals
  // -------------------------------------------------------------------------

  describe('ready state (header + stats)', () => {
    beforeEach(() => {
      const built = setup({ flushLive: makeLiveData() });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('renders the header with the session title', () => {
      const header = element.querySelector('[data-testid="live-header"]');
      expect(header).not.toBeNull();
      expect(header?.textContent).toContain('Workplace Safety Refresher');
    });

    it('exposes session() and agenda() from liveData', () => {
      expect(component.session()?.title).toBe('Workplace Safety Refresher');
      expect(component.agenda().length).toBe(3);
    });

    it('shows the attendance counter as count/total', () => {
      // attendanceCount starts at 0 until the QR child emits; total comes
      // straight from the live payload.
      const counter = element.querySelector('[data-testid="live-attendance-count"]');
      expect(counter?.textContent).toContain('0/25');
      expect(component.totalExpected()).toBe(25);
    });

    it('shows the engagement score percentage', () => {
      const eng = element.querySelector('[data-testid="live-engagement-score"]');
      expect(eng?.textContent).toContain('72');
      expect(component.engagementScore()).toBe(72);
    });

    it('applies the medium engagement class for a score of 72', () => {
      expect(component.engagementClass()).toBe('live-session-dashboard__engagement--medium');
      const eng = element.querySelector('[data-testid="live-engagement-score"]');
      expect(eng?.className).toContain('engagement--medium');
    });

    it('renders all three panels', () => {
      expect(element.querySelector('[data-testid="live-panels"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="agenda-panel"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="current-panel"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="attendance-panel"]')).not.toBeNull();
    });

    it('embeds the QR attendance component with the session id', () => {
      expect(element.querySelector('[data-testid="qr-attendance-embed"]')).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // engagementClass thresholds
  // -------------------------------------------------------------------------

  describe('engagementClass thresholds', () => {
    it('returns high for a score >= 80', () => {
      const built = setup({
        flushLive: makeLiveData({ engagement_score: 88 }),
      });
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;
      expect(component.engagementClass()).toBe('live-session-dashboard__engagement--high');
    });

    it('returns medium at the 50 boundary', () => {
      const built = setup({
        flushLive: makeLiveData({ engagement_score: 50 }),
      });
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;
      expect(component.engagementClass()).toBe('live-session-dashboard__engagement--medium');
    });

    it('returns low for a score below 50', () => {
      const built = setup({
        flushLive: makeLiveData({ engagement_score: 12 }),
      });
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;
      expect(component.engagementClass()).toBe('live-session-dashboard__engagement--low');
    });

    it('defaults engagementScore to 0 (low) when liveData is null', () => {
      const built = setup(); // pending → liveData() null
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;
      expect(component.engagementScore()).toBe(0);
      expect(component.engagementClass()).toBe('live-session-dashboard__engagement--low');
      // Drain the pending GET so verify passes.
      httpMock.expectOne(LIVE_URL).flush(makeLiveData());
      fixture.detectChanges();
      httpMock.match(QR_GEN_URL).forEach((r) => r.flush(QR_TOKEN));
    });
  });

  // -------------------------------------------------------------------------
  // Agenda panel + current atom
  // -------------------------------------------------------------------------

  describe('agenda panel + current atom', () => {
    beforeEach(() => {
      const built = setup({ flushLive: makeLiveData() }); // index = 1
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('renders one row per agenda item', () => {
      const rows = element.querySelectorAll('[data-testid^="agenda-item-"]');
      expect(rows.length).toBe(3);
    });

    it('marks the current agenda item (index 1)', () => {
      expect(component.isCurrentItem(1)).toBe(true);
      expect(component.isCurrentItem(0)).toBe(false);
      const current = element.querySelector('[data-testid="agenda-item-1"]');
      expect(current?.getAttribute('aria-current')).toBe('step');
      expect(current?.className).toContain('agenda-item--current');
    });

    it('marks items before the current index as completed', () => {
      expect(component.isCompletedItem(0)).toBe(true);
      expect(component.isCompletedItem(1)).toBe(false);
      expect(component.isCompletedItem(2)).toBe(false);
      const done = element.querySelector('[data-testid="agenda-item-0"]');
      expect(done?.className).toContain('agenda-item--completed');
    });

    it('renders the current atom in the center panel', () => {
      const atom = element.querySelector('[data-testid="current-atom"]');
      expect(atom).not.toBeNull();
      expect(atom?.textContent).toContain('Hazard Reporting');
      expect(atom?.textContent).toContain('reading');
      expect(component.currentAtom()?.atom_id).toBe('atom-b');
    });

    it('hides the delivery-notes block when the atom has no notes', () => {
      // index 1 (Hazard Reporting) has an empty delivery_notes string.
      expect(element.querySelector('[data-testid="delivery-notes"]')).toBeNull();
    });

    it('shows delivery notes when the current atom has them', () => {
      const built = setup({
        flushLive: makeLiveData({ current_agenda_index: 0 }),
      });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;

      const notes = element.querySelector('[data-testid="delivery-notes"]');
      expect(notes).not.toBeNull();
      expect(notes?.textContent).toContain('muster-point map');
    });
  });

  // -------------------------------------------------------------------------
  // currentAtom / isLastItem edge cases
  // -------------------------------------------------------------------------

  describe('currentAtom + isLastItem edges', () => {
    it('currentAtom is null and session-completed shows when index is past the agenda', () => {
      const built = setup({
        flushLive: makeLiveData({ current_agenda_index: 3 }),
      });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;

      expect(component.currentAtom()).toBeNull();
      expect(element.querySelector('[data-testid="session-completed"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="current-atom"]')).toBeNull();
      // No advance button when there is no current atom.
      expect(element.querySelector('[data-testid="advance-btn"]')).toBeNull();
    });

    it('isLastItem is true on the final agenda index', () => {
      const built = setup({
        flushLive: makeLiveData({ current_agenda_index: 2 }),
      });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;

      expect(component.isLastItem()).toBe(true);
      const btn = element.querySelector('[data-testid="advance-btn"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toContain('training.live-session.last-item');
    });

    it('isLastItem is false when not on the final index', () => {
      const built = setup({ flushLive: makeLiveData() }); // index 1 of 3
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;

      expect(component.isLastItem()).toBe(false);
      const btn = element.querySelector('[data-testid="advance-btn"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      expect(btn.textContent).toContain('training.live-session.next-atom');
    });
  });

  // -------------------------------------------------------------------------
  // advanceAgenda()
  // -------------------------------------------------------------------------

  describe('advanceAgenda()', () => {
    it('POSTs to the advance endpoint and updates the live state on success', () => {
      const built = setup({ flushLive: makeLiveData() }); // index 1
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;

      component.advanceAgenda();

      const req = httpMock.expectOne(ADVANCE_URL);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});

      req.flush(makeLiveData({ current_agenda_index: 2 }));
      fixture.detectChanges();
      // The QR child may regenerate its token after re-render; drain any.
      httpMock.match(QR_GEN_URL).forEach((r) => r.flush(QR_TOKEN));

      expect(component.currentAgendaIndex()).toBe(2);
      expect(component.currentAtom()?.atom_id).toBe('atom-c');
    });

    it('does not POST when already on the last item', () => {
      const built = setup({
        flushLive: makeLiveData({ current_agenda_index: 2 }),
      });
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;

      component.advanceAgenda();
      httpMock.expectNone(ADVANCE_URL);
    });

    it('does not POST when there is no sessionId', () => {
      const built = setup({ sessionId: '' });
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;

      component.advanceAgenda();
      httpMock.expectNone(ADVANCE_URL);
    });

    it('swallows an advance failure and leaves state intact', () => {
      const built = setup({ flushLive: makeLiveData() }); // index 1
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;

      component.advanceAgenda();
      httpMock
        .expectOne(ADVANCE_URL)
        .flush({ error: 'advance failed' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      // catchError → of(null): state unchanged, no error surfaced.
      expect(component.currentAgendaIndex()).toBe(1);
      expect(component.liveError()).toBe('');
    });

    it('clicking the advance button drives the POST', () => {
      const built = setup({ flushLive: makeLiveData() }); // index 1
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;

      const btn = element.querySelector('[data-testid="advance-btn"]') as HTMLButtonElement;
      btn.click();

      const req = httpMock.expectOne(ADVANCE_URL);
      expect(req.request.method).toBe('POST');
      req.flush(makeLiveData({ current_agenda_index: 2 }));
      fixture.detectChanges();
      httpMock.match(QR_GEN_URL).forEach((r) => r.flush(QR_TOKEN));
      expect(component.currentAgendaIndex()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // onAttendanceChanged + attendance counter wiring
  // -------------------------------------------------------------------------

  describe('onAttendanceChanged()', () => {
    beforeEach(() => {
      const built = setup({ flushLive: makeLiveData() });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = built.element;
      component = built.component;
    });

    it('updates the attendanceCount signal and the rendered counter', () => {
      component.onAttendanceChanged(21);
      fixture.detectChanges();

      expect(component.attendanceCount()).toBe(21);
      const counter = element.querySelector('[data-testid="live-attendance-count"]');
      expect(counter?.textContent).toContain('21/25');
    });
  });

  // -------------------------------------------------------------------------
  // ngOnDestroy
  // -------------------------------------------------------------------------

  describe('ngOnDestroy()', () => {
    it('resets the service live state on destroy', () => {
      const built = setup({ flushLive: makeLiveData() });
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;

      expect(component.liveData()).not.toBeNull();

      fixture.destroy();
      // resetState() flips liveSessionState back to idle → liveData() null.
      expect(component.liveData()).toBeNull();
      expect(component.liveSessionState().status).toBe('idle');

      // Null the local ref so afterEach does not double-destroy.
      fixture = undefined as unknown as ComponentFixture<LiveSessionDashboardComponent>;
    });
  });

  // -------------------------------------------------------------------------
  // null-session payload — exercises the `?? null` / `?.agenda ?? []` arms
  // -------------------------------------------------------------------------

  describe('liveData present but session null', () => {
    // The center-panel header renders `session()!.title` with a non-null
    // assertion, so flushing a null-session payload and then running change
    // detection would throw in the template. These tests read the computed
    // signals directly (signals are pull-based — they evaluate on read,
    // independent of change detection), characterising the defensive
    // `?? null` (L40) and `?.agenda ?? []` (L41) fallback arms which the
    // happy-path fixtures (always a present session) never reach.
    function buildWithNullSession(): {
      fix: ComponentFixture<LiveSessionDashboardComponent>;
      comp: LiveSessionDashboardComponent;
      mock: HttpTestingController;
    } {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [LiveSessionDashboardComponent, TranslateModule.forRoot()],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { paramMap: { get: () => SESSION_ID } } },
          },
        ],
      });
      const fix = TestBed.createComponent(LiveSessionDashboardComponent);
      const mock = TestBed.inject(HttpTestingController);
      fix.detectChanges(); // ngOnInit → live GET pending
      // Force a success payload whose session field is absent at runtime.
      const nullSessionPayload = {
        attendance_count: 0,
        total_expected: 9,
        current_agenda_index: 0,
        engagement_score: 0,
        late_arrivals: 0,
      } as unknown as LiveSessionData;
      mock.expectOne(LIVE_URL).flush(nullSessionPayload);
      // Deliberately NO detectChanges() here — reading the signals only.
      return { fix, comp: fix.componentInstance, mock };
    }

    it('session() falls back to null when the payload has no session', () => {
      const { fix, comp, mock } = buildWithNullSession();
      expect(comp.liveData()).not.toBeNull();
      expect(comp.session()).toBeNull();
      // Avoid the broken-template destroy path: reset state first so the
      // OnPush template re-renders as idle (no panels) on destroy.
      comp['trainingService'].resetState();
      fix.destroy();
      mock.verify();
      // Null the shared ref so the outer afterEach does not double-destroy.
      fixture = undefined as unknown as ComponentFixture<LiveSessionDashboardComponent>;
    });

    it('agenda() falls back to [] and currentAtom() is null with no session', () => {
      const { fix, comp, mock } = buildWithNullSession();
      expect(comp.agenda()).toEqual([]);
      // idx(0) < items.length(0) is false → currentAtom is null.
      expect(comp.currentAtom()).toBeNull();
      // currentAgendaIndex comes straight from the payload (0), totalExpected 9.
      expect(comp.currentAgendaIndex()).toBe(0);
      expect(comp.totalExpected()).toBe(9);
      comp['trainingService'].resetState();
      fix.destroy();
      mock.verify();
      fixture = undefined as unknown as ComponentFixture<LiveSessionDashboardComponent>;
    });

    it('isLastItem() is true for an empty agenda (0 >= -1)', () => {
      const { fix, comp, mock } = buildWithNullSession();
      // agenda().length - 1 === -1, currentAgendaIndex() === 0 → 0 >= -1 true.
      expect(comp.isLastItem()).toBe(true);
      comp['trainingService'].resetState();
      fix.destroy();
      mock.verify();
      fixture = undefined as unknown as ComponentFixture<LiveSessionDashboardComponent>;
    });

    it('advanceAgenda() does not POST when the (empty) agenda is on the last item', () => {
      const { fix, comp, mock } = buildWithNullSession();
      // sessionId is set, but isLastItem() is true → guard returns early.
      comp.advanceAgenda();
      mock.expectNone(ADVANCE_URL);
      comp['trainingService'].resetState();
      fix.destroy();
      mock.verify();
      fixture = undefined as unknown as ComponentFixture<LiveSessionDashboardComponent>;
    });
  });

  // -------------------------------------------------------------------------
  // isCurrentItem / isCompletedItem additional arms
  // -------------------------------------------------------------------------

  describe('isCurrentItem / isCompletedItem boolean arms', () => {
    it('isCurrentItem is false for non-matching indices; isCompletedItem true for earlier index', () => {
      const built = setup({
        flushLive: makeLiveData({ current_agenda_index: 2 }),
      });
      fixture = built.fixture;
      httpMock = built.httpMock;
      component = built.component;

      // current index 2 → only index 2 is current.
      expect(component.isCurrentItem(2)).toBe(true);
      expect(component.isCurrentItem(0)).toBe(false);
      expect(component.isCurrentItem(5)).toBe(false);
      // index 0 and 1 are before the current index → completed.
      expect(component.isCompletedItem(0)).toBe(true);
      expect(component.isCompletedItem(1)).toBe(true);
      // index 2 (current) and beyond are NOT completed.
      expect(component.isCompletedItem(2)).toBe(false);
      expect(component.isCompletedItem(3)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // a11y smoke
  // -------------------------------------------------------------------------

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations in the ready state', async () => {
      const built = setup({ flushLive: makeLiveData() });
      fixture = built.fixture;
      httpMock = built.httpMock;

      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });
});
