import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { LiveSessionDashboardComponent } from './live-session-dashboard.component';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  TrainingAdminService,
  LiveSessionData,
  TrainingSession,
} from '../../services/training-admin.service';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function makeSession(
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    id: 'sess-001',
    tenant_id: 'tenant-001',
    title: 'Workplace Safety Onboarding',
    description: 'Mandatory safety briefing',
    status: 'live',
    scheduled_at: '2026-06-04T09:00:00Z',
    duration_minutes: 120,
    agenda: [
      {
        atom_id: 'atom-a',
        atom_title: 'Fire Evacuation',
        atom_type: 'video',
        order: 0,
        delivery_notes: 'Cover all exits',
        duration_minutes: 30,
      },
      {
        atom_id: 'atom-b',
        atom_title: 'First Aid Basics',
        atom_type: 'reading',
        order: 1,
        delivery_notes: '',
        duration_minutes: 45,
      },
      {
        atom_id: 'atom-c',
        atom_title: 'Hazard Reporting',
        atom_type: 'quiz',
        order: 2,
        delivery_notes: 'Discuss near-misses',
        duration_minutes: 45,
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

function makeLiveData(
  overrides: Partial<LiveSessionData> = {},
): LiveSessionData {
  return {
    session: makeSession(),
    attendance_count: 12,
    total_expected: 30,
    current_agenda_index: 1,
    engagement_score: 72,
    late_arrivals: 2,
    ...overrides,
  };
}

/**
 * A controllable BffClientService double. The embedded QrAttendanceComponent
 * also injects BffClientService (it POSTs a QR token on init + countdown via
 * setInterval); returning a never-completing Subject from `post`/`get` keeps
 * the child inert and non-flaky while still exercising the parent's real
 * TrainingAdminService HTTP wiring through the same double.
 */
function makeBffMock(): {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(() => new Subject()),
    post: vi.fn(() => new Subject()),
  };
}

interface Built {
  fixture: ComponentFixture<LiveSessionDashboardComponent>;
  component: LiveSessionDashboardComponent;
  element: HTMLElement;
  service: TrainingAdminService;
  bff: ReturnType<typeof makeBffMock>;
}

function setup(sessionId = 'sess-001'): Built {
  const bff = makeBffMock();
  TestBed.configureTestingModule({
    imports: [LiveSessionDashboardComponent, TranslateModule.forRoot()],
    providers: [
      { provide: BffClientService, useValue: bff },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: { get: () => sessionId } } },
      },
    ],
  });
  const fixture = TestBed.createComponent(LiveSessionDashboardComponent);
  const component = fixture.componentInstance;
  const element = fixture.nativeElement as HTMLElement;
  const service = TestBed.inject(TrainingAdminService);
  return { fixture, component, element, service, bff };
}

describe('LiveSessionDashboardComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('shell + loading', () => {
    it('creates the component', () => {
      const { fixture, component } = setup();
      fixture.detectChanges();
      expect(component).toBeTruthy();
    });

    it('renders the dashboard root', () => {
      const { fixture, element } = setup();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="live-session-dashboard"]'),
      ).not.toBeNull();
    });

    it('shows the loading state while the first fetch is in flight', () => {
      // bff.get returns a never-completing Subject → state stays 'loading'.
      const { fixture, element } = setup();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="live-loading"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="live-header"]'),
      ).toBeNull();
    });

    it('captures the sessionId from the route param', () => {
      const { fixture, component } = setup('sess-xyz');
      fixture.detectChanges();
      expect(component.sessionId()).toBe('sess-xyz');
    });

    it('does not fetch when the route has no sessionId', () => {
      const { fixture, component, bff } = setup('');
      fixture.detectChanges();
      expect(component.sessionId()).toBe('');
      // ngOnInit returns early — no GET (and no interval subscription).
      expect(bff.get).not.toHaveBeenCalled();
    });

    it('issues the live-session GET to the contract path on init', () => {
      const { fixture, bff } = setup('sess-001');
      fixture.detectChanges();
      expect(bff.get).toHaveBeenCalledWith(
        '/api/v1/training-admin/sessions/sess-001/live',
      );
    });
  });

  describe('ready state', () => {
    function ready(overrides: Partial<LiveSessionData> = {}): Built {
      const built = setup();
      built.bff.get.mockReturnValue(of(makeLiveData(overrides)));
      built.fixture.detectChanges();
      return built;
    }

    it('renders the header with the session title', () => {
      const { element } = ready();
      const header = element.querySelector('[data-testid="live-header"]');
      expect(header).not.toBeNull();
      expect(header?.textContent).toContain('Workplace Safety Onboarding');
      expect(element.querySelector('[data-testid="live-loading"]')).toBeNull();
    });

    it('shows the attendance counter (count / total)', () => {
      const { element } = ready();
      const counter = element.querySelector(
        '[data-testid="live-attendance-count"]',
      );
      // attendanceCount() starts at 0 until QR child emits; total from data.
      expect(counter?.textContent).toContain('0/30');
    });

    it('shows the engagement score', () => {
      const { element } = ready({ engagement_score: 72 });
      const score = element.querySelector(
        '[data-testid="live-engagement-score"]',
      );
      expect(score?.textContent).toContain('72%');
    });

    it('renders all three panels', () => {
      const { element } = ready();
      expect(element.querySelector('[data-testid="live-panels"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="agenda-panel"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="current-panel"]')).not.toBeNull();
      expect(
        element.querySelector('[data-testid="attendance-panel"]'),
      ).not.toBeNull();
    });

    it('renders one agenda item per agenda entry', () => {
      const { element } = ready();
      const items = element.querySelectorAll(
        '[data-testid^="agenda-item-"]',
      );
      expect(items.length).toBe(3);
      expect(
        element.querySelector('[data-testid="agenda-item-0"]')?.textContent,
      ).toContain('Fire Evacuation');
    });

    it('marks the current agenda item with the current modifier + aria-current', () => {
      const { element } = ready({ current_agenda_index: 1 });
      const current = element.querySelector('[data-testid="agenda-item-1"]');
      expect(
        current?.classList.contains(
          'live-session-dashboard__agenda-item--current',
        ),
      ).toBe(true);
      expect(current?.getAttribute('aria-current')).toBe('step');
    });

    it('marks earlier agenda items as completed', () => {
      const { element } = ready({ current_agenda_index: 2 });
      const completed = element.querySelector('[data-testid="agenda-item-0"]');
      expect(
        completed?.classList.contains(
          'live-session-dashboard__agenda-item--completed',
        ),
      ).toBe(true);
    });
  });

  describe('current atom panel', () => {
    function ready(overrides: Partial<LiveSessionData> = {}): Built {
      const built = setup();
      built.bff.get.mockReturnValue(of(makeLiveData(overrides)));
      built.fixture.detectChanges();
      return built;
    }

    it('renders the current atom title + type', () => {
      const { element } = ready({ current_agenda_index: 0 });
      const atom = element.querySelector('[data-testid="current-atom"]');
      expect(atom?.textContent).toContain('Fire Evacuation');
      expect(atom?.textContent).toContain('video');
    });

    it('renders delivery notes when present', () => {
      const { element } = ready({ current_agenda_index: 0 });
      const notes = element.querySelector('[data-testid="delivery-notes"]');
      expect(notes).not.toBeNull();
      expect(notes?.textContent).toContain('Cover all exits');
    });

    it('omits the delivery-notes block when the atom has no notes', () => {
      const { element } = ready({ current_agenda_index: 1 }); // atom-b has ''
      expect(
        element.querySelector('[data-testid="delivery-notes"]'),
      ).toBeNull();
    });

    it('shows the next-atom button enabled when not on the last item', () => {
      const { element, component } = ready({ current_agenda_index: 0 });
      const btn = element.querySelector(
        '[data-testid="advance-btn"]',
      ) as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.disabled).toBe(false);
      expect(component.isLastItem()).toBe(false);
      expect(btn.textContent).toContain('training.live-session.next-atom');
    });

    it('disables the advance button + shows last-item label on the final atom', () => {
      const { element, component } = ready({ current_agenda_index: 2 });
      const btn = element.querySelector(
        '[data-testid="advance-btn"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(component.isLastItem()).toBe(true);
      expect(btn.textContent).toContain('training.live-session.last-item');
    });

    it('shows the session-completed message when the index runs past the agenda', () => {
      const { element } = ready({ current_agenda_index: 3 });
      expect(
        element.querySelector('[data-testid="current-atom"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="session-completed"]'),
      ).not.toBeNull();
    });
  });

  describe('error state', () => {
    it('renders the error panel + message when the fetch 5xx-fails', () => {
      const { fixture, element, component, bff } = setup();
      // TrainingAdminService.getLiveSession catches the error and sets the
      // discriminated 'error' state carrying err.message. The bff double
      // throws so the catchError branch runs on the initial fetch.
      bff.get.mockReturnValue(
        throwError(() => new Error('Internal Server Error')),
      );
      fixture.detectChanges();

      const err = element.querySelector('[data-testid="live-error"]');
      expect(err).not.toBeNull();
      expect(err?.textContent).toContain('Internal Server Error');
      expect(component.liveError()).toBe('Internal Server Error');
      expect(
        element.querySelector('[data-testid="live-loading"]'),
      ).toBeNull();
    });

    it('liveError() is empty when not in the error state', () => {
      const { fixture, component } = setup();
      fixture.detectChanges();
      expect(component.liveError()).toBe('');
    });
  });

  describe('computed signals', () => {
    it('engagementClass() is high at >= 80', () => {
      const { component, service } = setup();
      (service as unknown as {
        _liveSessionState: { set: (v: unknown) => void };
      })._liveSessionState.set({
        status: 'success',
        data: makeLiveData({ engagement_score: 85 }),
      });
      expect(component.engagementClass()).toBe(
        'live-session-dashboard__engagement--high',
      );
    });

    it('engagementClass() is medium between 50 and 79', () => {
      const { component, service } = setup();
      (service as unknown as {
        _liveSessionState: { set: (v: unknown) => void };
      })._liveSessionState.set({
        status: 'success',
        data: makeLiveData({ engagement_score: 60 }),
      });
      expect(component.engagementClass()).toBe(
        'live-session-dashboard__engagement--medium',
      );
    });

    it('engagementClass() is low below 50', () => {
      const { component, service } = setup();
      (service as unknown as {
        _liveSessionState: { set: (v: unknown) => void };
      })._liveSessionState.set({
        status: 'success',
        data: makeLiveData({ engagement_score: 20 }),
      });
      expect(component.engagementClass()).toBe(
        'live-session-dashboard__engagement--low',
      );
    });

    it('exposes safe defaults when liveData is null', () => {
      const { component } = setup();
      expect(component.session()).toBeNull();
      expect(component.agenda()).toEqual([]);
      expect(component.currentAgendaIndex()).toBe(0);
      expect(component.currentAtom()).toBeNull();
      expect(component.engagementScore()).toBe(0);
      expect(component.totalExpected()).toBe(0);
      // length - 1 === -1, idx 0 >= -1 → true on an empty agenda
      expect(component.isLastItem()).toBe(true);
      expect(component.engagementClass()).toBe(
        'live-session-dashboard__engagement--low',
      );
    });

    it('currentAtom() resolves the entry at the current index', () => {
      const { component, service } = setup();
      (service as unknown as {
        _liveSessionState: { set: (v: unknown) => void };
      })._liveSessionState.set({
        status: 'success',
        data: makeLiveData({ current_agenda_index: 2 }),
      });
      expect(component.currentAtom()?.atom_title).toBe('Hazard Reporting');
    });
  });

  describe('interactions', () => {
    function ready(overrides: Partial<LiveSessionData> = {}): Built {
      const built = setup();
      built.bff.get.mockReturnValue(of(makeLiveData(overrides)));
      built.fixture.detectChanges();
      return built;
    }

    it('advanceAgenda() POSTs to the advance endpoint when not last', () => {
      const { component, bff } = ready({ current_agenda_index: 0 });
      bff.post.mockReturnValue(of(makeLiveData({ current_agenda_index: 1 })));
      component.advanceAgenda();
      expect(bff.post).toHaveBeenCalledWith(
        '/api/v1/training-admin/sessions/sess-001/advance',
        {},
      );
    });

    it('advanceAgenda() advances the live state on success', () => {
      const { component, bff, fixture } = ready({ current_agenda_index: 0 });
      bff.post.mockReturnValue(of(makeLiveData({ current_agenda_index: 1 })));
      component.advanceAgenda();
      fixture.detectChanges();
      expect(component.currentAgendaIndex()).toBe(1);
      expect(component.currentAtom()?.atom_title).toBe('First Aid Basics');
    });

    it('advanceAgenda() is a no-op on the last item (no advance POST)', () => {
      const { component, bff } = ready({ current_agenda_index: 2 });
      component.advanceAgenda();
      // The embedded QR child POSTs a token on init; the advance path must
      // NOT fire — assert no call to the advance endpoint specifically.
      const advanceCalls = bff.post.mock.calls.filter((c) =>
        String(c[0]).endsWith('/advance'),
      );
      expect(advanceCalls.length).toBe(0);
    });

    it('advanceAgenda() does nothing when there is no sessionId', () => {
      const built = setup('');
      built.fixture.detectChanges();
      built.component.advanceAgenda();
      expect(built.bff.post).not.toHaveBeenCalled();
    });

    it('clicking the advance button triggers a POST', () => {
      const { element, bff } = ready({ current_agenda_index: 0 });
      bff.post.mockReturnValue(of(makeLiveData({ current_agenda_index: 1 })));
      const btn = element.querySelector(
        '[data-testid="advance-btn"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(bff.post).toHaveBeenCalledWith(
        '/api/v1/training-admin/sessions/sess-001/advance',
        {},
      );
    });

    it('onAttendanceChanged() updates the attendance counter shown in the header', () => {
      const { component, element, fixture } = ready();
      component.onAttendanceChanged(17);
      fixture.detectChanges();
      expect(component.attendanceCount()).toBe(17);
      expect(
        element.querySelector('[data-testid="live-attendance-count"]')
          ?.textContent,
      ).toContain('17/30');
    });

    it('isCurrentItem()/isCompletedItem() reflect the current index', () => {
      const { component } = ready({ current_agenda_index: 1 });
      expect(component.isCompletedItem(0)).toBe(true);
      expect(component.isCurrentItem(1)).toBe(true);
      expect(component.isCurrentItem(0)).toBe(false);
      expect(component.isCompletedItem(2)).toBe(false);
    });
  });

  describe('lifecycle + polling', () => {
    it('resets the service state on destroy', () => {
      const { fixture, service } = setup();
      service.getLiveSession = vi.fn(() => of(null));
      const resetSpy = vi.spyOn(service, 'resetState');
      fixture.detectChanges();
      fixture.destroy();
      expect(resetSpy).toHaveBeenCalled();
    });

    it('re-polls the live session every 10s via the interval', fakeAsync(() => {
      const { fixture, bff } = setup('sess-001');
      bff.get.mockReturnValue(of(makeLiveData()));
      fixture.detectChanges();
      const initialCalls = bff.get.mock.calls.length;
      // The auto-refresh interval ticks at 10_000ms.
      tick(10000);
      expect(bff.get.mock.calls.length).toBeGreaterThan(initialCalls);
      fixture.destroy();
    }));

    it('swallows a polling error without crashing the dashboard', fakeAsync(() => {
      const { fixture, bff, element } = setup('sess-001');
      // First (initial) call succeeds, the polled call rejects.
      bff.get
        .mockReturnValueOnce(of(makeLiveData()))
        .mockReturnValue(throwError(() => new Error('flaky network')));
      fixture.detectChanges();
      tick(10000);
      fixture.detectChanges();
      // The dashboard still renders (interval catchError → of(null) keeps state).
      expect(
        element.querySelector('[data-testid="live-session-dashboard"]'),
      ).not.toBeNull();
      fixture.destroy();
    }));
  });
});
