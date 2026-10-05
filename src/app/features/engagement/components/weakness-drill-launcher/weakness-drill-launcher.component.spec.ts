import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { WeaknessDrillLauncherComponent } from './weakness-drill-launcher.component';
import { environment } from '../../../../../environments/environment';

// ---------------------------------------------------------------------------
// Backend-shaped stubs
// ---------------------------------------------------------------------------

const DRILL_PATH = '/api/v1/engagement/drills';

const STUB_TOPIC = {
  topic_id: 'topic-fractions',
  topic_name: 'Fractions & Ratios',
  retention_pct: 42,
  weak_atom_count: 3,
  weak_atoms: [
    {
      atom_id: 'atom-001',
      atom_title: 'Adding Unlike Denominators',
      atom_type: 'concept',
      retention_pct: 18,
      last_reviewed_at: '2026-05-30T10:00:00Z',
      difficulty: 3,
    },
    {
      atom_id: 'atom-002',
      atom_title: 'Simplifying Fractions',
      atom_type: 'drill',
      retention_pct: 55,
      last_reviewed_at: null,
      difficulty: 2,
    },
    {
      atom_id: 'atom-003',
      atom_title: 'Ratio Word Problems',
      atom_type: 'concept',
      retention_pct: 70,
      last_reviewed_at: '2026-05-29T08:00:00Z',
      difficulty: 4,
    },
  ],
};

const STUB_SESSION = {
  session_id: 'session-xyz',
  topic_id: 'topic-fractions',
  atom_count: 3,
  difficulty_modifier: 0.8,
  redirect_url: '/learning/session/session-xyz',
};

// A mutable param holder so each suite can control the route :topicId.
let currentTopicId: string | null = 'topic-fractions';

function configure(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WeaknessDrillLauncherComponent, TranslateModule.forRoot()],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { paramMap: { get: () => currentTopicId } },
        },
      },
    ],
  });
}

describe('WeaknessDrillLauncherComponent', () => {
  let fixture: ComponentFixture<WeaknessDrillLauncherComponent>;
  let component: WeaknessDrillLauncherComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  // Drive the happy path: route has a topicId, GET resolves to STUB_TOPIC.
  function setupSuccess(): void {
    currentTopicId = 'topic-fractions';
    configure();
    fixture = TestBed.createComponent(WeaknessDrillLauncherComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges(); // ngOnInit fires loadDrillTopic
    httpMock
      .expectOne(`${environment.bffBaseUrl}${DRILL_PATH}/topic-fractions`)
      .flush(STUB_TOPIC);
    fixture.detectChanges();
  }

  afterEach(() => {
    if (httpMock) {
      httpMock.verify();
    }
  });

  describe('initialisation', () => {
    it('creates the component', () => {
      setupSuccess();
      expect(component).toBeTruthy();
    });

    it('renders the root surface container', () => {
      setupSuccess();
      const root = element.querySelector(
        '[data-testid="weakness-drill-launcher"]',
      );
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
    });

    it('does NOT fire any HTTP call when the route has no topicId', () => {
      currentTopicId = null;
      configure();
      fixture = TestBed.createComponent(WeaknessDrillLauncherComponent);
      component = fixture.componentInstance;
      element = fixture.nativeElement as HTMLElement;
      httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      // No request issued (verify() in afterEach asserts none outstanding).
      httpMock.verify();
      // State remains idle → nothing rendered.
      expect(component.drillState().status).toBe('idle');
      expect(
        element.querySelector('[data-testid="drill-header"]'),
      ).toBeNull();
    });

    it('issues a GET against the exact drill path with the encoded topicId', () => {
      currentTopicId = 'topic with space';
      configure();
      fixture = TestBed.createComponent(WeaknessDrillLauncherComponent);
      element = fixture.nativeElement as HTMLElement;
      httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}${DRILL_PATH}/topic%20with%20space`,
      );
      expect(req.request.method).toBe('GET');
      req.flush(STUB_TOPIC);
      fixture.detectChanges();
    });
  });

  describe('loading state', () => {
    it('shows the loading indicator before the GET resolves', () => {
      currentTopicId = 'topic-fractions';
      configure();
      fixture = TestBed.createComponent(WeaknessDrillLauncherComponent);
      component = fixture.componentInstance;
      element = fixture.nativeElement as HTMLElement;
      httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();

      expect(component.drillState().status).toBe('loading');
      const loading = element.querySelector('[data-testid="drill-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('role')).toBe('status');
      expect(loading?.textContent).toContain('engagement.drill.loading');

      // flush the pending request so afterEach verify() is clean
      httpMock
        .expectOne(`${environment.bffBaseUrl}${DRILL_PATH}/topic-fractions`)
        .flush(STUB_TOPIC);
      fixture.detectChanges();
    });
  });

  describe('success state', () => {
    beforeEach(() => setupSuccess());

    it('sets drillState to success and exposes the topic via the computed', () => {
      expect(component.drillState().status).toBe('success');
      expect(component.topic()?.topic_id).toBe('topic-fractions');
    });

    it('renders the header with the translated title key and topic name', () => {
      const header = element.querySelector('[data-testid="drill-header"]');
      expect(header).not.toBeNull();
      expect(header?.textContent).toContain('engagement.drill.title');
      expect(header?.textContent).toContain('Fractions & Ratios');
    });

    it('renders the retention summary with the topic retention percentage', () => {
      const summary = element.querySelector('[data-testid="drill-summary"]');
      expect(summary).not.toBeNull();
      expect(summary?.textContent).toContain('42%');
    });

    it('renders the weak-atom count from the atomCount computed', () => {
      expect(component.atomCount()).toBe(3);
      const summary = element.querySelector('[data-testid="drill-summary"]');
      // count value "3" appears in the second stat
      expect(summary?.textContent).toContain('3');
    });

    it('renders one list item per weak atom', () => {
      const atomsBlock = element.querySelector('[data-testid="drill-atoms"]');
      expect(atomsBlock).not.toBeNull();
      const items = element.querySelectorAll(
        '[data-testid^="drill-atom-atom-"]',
      );
      expect(items.length).toBe(3);
    });

    it('renders each atom title, type and retention percentage', () => {
      const first = element.querySelector(
        '[data-testid="drill-atom-atom-001"]',
      );
      expect(first?.textContent).toContain('Adding Unlike Denominators');
      expect(first?.textContent).toContain('concept');
      expect(first?.textContent).toContain('18%');
    });

    it('renders the launch button enabled with the atom count', () => {
      const btn = element.querySelector(
        '[data-testid="drill-launch-btn"]',
      ) as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.disabled).toBe(false);
      expect(btn.textContent).toContain('engagement.drill.start');
      expect(btn.textContent).toContain('3');
    });

    it('exposes weakAtoms computed equal to the topic atoms', () => {
      expect(component.weakAtoms().length).toBe(3);
      expect(component.weakAtoms()[0].atom_id).toBe('atom-001');
    });

    it('keeps drillError empty when there is no error', () => {
      expect(component.drillError()).toBe('');
    });
  });

  describe('empty atoms state', () => {
    beforeEach(() => {
      currentTopicId = 'topic-empty';
      configure();
      fixture = TestBed.createComponent(WeaknessDrillLauncherComponent);
      component = fixture.componentInstance;
      element = fixture.nativeElement as HTMLElement;
      httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      httpMock
        .expectOne(`${environment.bffBaseUrl}${DRILL_PATH}/topic-empty`)
        .flush({ ...STUB_TOPIC, weak_atoms: [], weak_atom_count: 0 });
      fixture.detectChanges();
    });

    it('reports zero atomCount', () => {
      expect(component.atomCount()).toBe(0);
      expect(component.weakAtoms()).toEqual([]);
    });

    it('disables the launch button when there are no atoms', () => {
      const btn = element.querySelector(
        '[data-testid="drill-launch-btn"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('renders no atom list items', () => {
      const items = element.querySelectorAll(
        '[data-testid^="drill-atom-atom-"]',
      );
      expect(items.length).toBe(0);
    });
  });

  describe('error state', () => {
    beforeEach(() => {
      currentTopicId = 'topic-fractions';
      configure();
      fixture = TestBed.createComponent(WeaknessDrillLauncherComponent);
      component = fixture.componentInstance;
      element = fixture.nativeElement as HTMLElement;
      httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      httpMock
        .expectOne(`${environment.bffBaseUrl}${DRILL_PATH}/topic-fractions`)
        .flush(
          { error: 'topic not found' },
          { status: 404, statusText: 'Not Found' },
        );
      fixture.detectChanges();
    });

    it('moves drillState to error', () => {
      expect(component.drillState().status).toBe('error');
    });

    it('renders the error block with an alert role and the title key', () => {
      const err = element.querySelector('[data-testid="drill-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(err?.textContent).toContain('engagement.drill.error-title');
    });

    it('exposes the error message via the drillError computed', () => {
      expect(component.drillError().length).toBeGreaterThan(0);
      const err = element.querySelector('[data-testid="drill-error"]');
      expect(err?.textContent).toContain(component.drillError());
    });

    it('does NOT render the success header when in error', () => {
      expect(
        element.querySelector('[data-testid="drill-header"]'),
      ).toBeNull();
    });
  });

  describe('retentionClass', () => {
    beforeEach(() => setupSuccess());

    it('returns the critical class below 30', () => {
      expect(component.retentionClass(0)).toBe(
        'weakness-drill-launcher__retention--critical',
      );
      expect(component.retentionClass(29)).toBe(
        'weakness-drill-launcher__retention--critical',
      );
    });

    it('returns the low class between 30 and 59', () => {
      expect(component.retentionClass(30)).toBe(
        'weakness-drill-launcher__retention--low',
      );
      expect(component.retentionClass(59)).toBe(
        'weakness-drill-launcher__retention--low',
      );
    });

    it('returns the moderate class at 60 and above', () => {
      expect(component.retentionClass(60)).toBe(
        'weakness-drill-launcher__retention--moderate',
      );
      expect(component.retentionClass(100)).toBe(
        'weakness-drill-launcher__retention--moderate',
      );
    });
  });

  describe('launchDrill — success', () => {
    let router: Router;
    let navigateSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      setupSuccess();
      router = TestBed.inject(Router);
      navigateSpy = vi.fn().mockResolvedValue(true);
      // override navigate to avoid real route resolution in jsdom
      (router as unknown as { navigate: unknown }).navigate = navigateSpy;
    });

    it('sets launching state and POSTs to the start endpoint', () => {
      component.launchDrill();
      expect(component.isLaunching()).toBe(true);

      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}${DRILL_PATH}/topic-fractions/start`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(STUB_SESSION);
    });

    it('navigates to the session redirect_url on success', () => {
      component.launchDrill();
      httpMock
        .expectOne(
          `${environment.bffBaseUrl}${DRILL_PATH}/topic-fractions/start`,
        )
        .flush(STUB_SESSION);

      expect(navigateSpy).toHaveBeenCalledWith([
        '/learning/session/session-xyz',
      ]);
      expect(component.launchState().status).toBe('success');
      expect(component.isLaunching()).toBe(false);
    });

    it('shows the launching label on the button while in flight', () => {
      component.launchDrill();
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="drill-launch-btn"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toContain('engagement.drill.launching');

      httpMock
        .expectOne(
          `${environment.bffBaseUrl}${DRILL_PATH}/topic-fractions/start`,
        )
        .flush(STUB_SESSION);
    });

    it('triggers launch via the button click', () => {
      const btn = element.querySelector(
        '[data-testid="drill-launch-btn"]',
      ) as HTMLButtonElement;
      btn.click();

      httpMock
        .expectOne(
          `${environment.bffBaseUrl}${DRILL_PATH}/topic-fractions/start`,
        )
        .flush(STUB_SESSION);
      expect(navigateSpy).toHaveBeenCalled();
    });

    it('ignores a second launch while one is already in flight', () => {
      component.launchDrill();
      // first POST pending; a second call must be a no-op
      component.launchDrill();
      // only one outstanding request
      httpMock
        .expectOne(
          `${environment.bffBaseUrl}${DRILL_PATH}/topic-fractions/start`,
        )
        .flush(STUB_SESSION);
    });
  });

  describe('launchDrill — error', () => {
    beforeEach(() => setupSuccess());

    it('moves launchState to error and surfaces the launch-error banner', () => {
      component.launchDrill();
      httpMock
        .expectOne(
          `${environment.bffBaseUrl}${DRILL_PATH}/topic-fractions/start`,
        )
        .flush(
          { error: 'boom' },
          { status: 500, statusText: 'Server Error' },
        );
      fixture.detectChanges();

      expect(component.launchState().status).toBe('error');
      expect(component.isLaunching()).toBe(false);
      const banner = element.querySelector(
        '[data-testid="drill-launch-error"]',
      );
      expect(banner).not.toBeNull();
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(banner?.textContent).toContain('engagement.drill.launch-failed');
    });
  });

  describe('launchDrill — guarded when no topicId', () => {
    it('does nothing when topicId is empty (no POST issued)', () => {
      currentTopicId = '';
      configure();
      fixture = TestBed.createComponent(WeaknessDrillLauncherComponent);
      component = fixture.componentInstance;
      element = fixture.nativeElement as HTMLElement;
      httpMock = TestBed.inject(HttpTestingController);
      fixture.detectChanges(); // ngOnInit returns early — no GET

      component.launchDrill();
      // no POST queued
      httpMock.verify();
      expect(component.launchState().status).toBe('idle');
    });
  });

  describe('lifecycle', () => {
    it('unsubscribes on destroy without error', () => {
      setupSuccess();
      expect(() => fixture.destroy()).not.toThrow();
    });
  });
});
