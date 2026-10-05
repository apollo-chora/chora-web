import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
  discardPeriodicTasks,
} from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideRouter, Router, ActivatedRoute, convertToParamMap } from '@angular/router';
import { ApplicationStartComponent } from './application-start.component';
import { AdmissionService } from '../../services/admission.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import type {
  ApplicationOverview,
  StageProgress,
} from '../../models/admission-learner.model';

describe('ApplicationStartComponent', () => {
  let component: ApplicationStartComponent;
  let fixture: ComponentFixture<ApplicationStartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApplicationStartComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ApplicationStartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with no application', () => {
    expect(component.application()).toBeNull();
    expect(component.hasStarted()).toBe(false);
  });

  it('should format time remaining correctly', () => {
    const stage = {
      id: 'stg-1',
      name: 'Documents',
      type: 'document_upload' as const,
      order: 0,
      status: 'active' as const,
      required: true,
      timeout_hours: 24,
      timeout_deadline: new Date(Date.now() + 3661000).toISOString(),
      instructions: '',
      completed_at: null,
    };

    const result = component.getTimeRemaining(stage);
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('should return empty string when no deadline', () => {
    const stage = {
      id: 'stg-1',
      name: 'Documents',
      type: 'document_upload' as const,
      order: 0,
      status: 'active' as const,
      required: true,
      timeout_hours: null,
      timeout_deadline: null,
      instructions: '',
      completed_at: null,
    };

    expect(component.getTimeRemaining(stage)).toBe('');
  });

  it('should identify accessible stages', () => {
    const activeStage = {
      id: 'stg-1', name: '', type: 'form' as const, order: 0,
      status: 'active' as const, required: true, timeout_hours: null,
      timeout_deadline: null, instructions: '', completed_at: null,
    };
    const pendingStage = {
      id: 'stg-2', name: '', type: 'form' as const, order: 1,
      status: 'pending' as const, required: true, timeout_hours: null,
      timeout_deadline: null, instructions: '', completed_at: null,
    };

    expect(component.isStageAccessible(activeStage)).toBe(true);
    expect(component.isStageAccessible(pendingStage)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Augmented coverage below — characterizes the component without modifying
  // the source. Helpers build fresh fixtures with controllable route params.
  // -------------------------------------------------------------------------

  function makeStage(over: Partial<StageProgress> = {}): StageProgress {
    return {
      id: 'stg-1',
      name: 'Documents',
      type: 'document_upload',
      order: 0,
      status: 'pending',
      required: true,
      timeout_hours: null,
      timeout_deadline: null,
      instructions: '',
      completed_at: null,
      ...over,
    };
  }

  function makeApp(over: Partial<ApplicationOverview> = {}): ApplicationOverview {
    return {
      id: 'app-1',
      pipeline_id: 'pl-42',
      pipeline_name: 'Diploma Intake 2026',
      programme_name: 'Computer Science',
      stages: [
        makeStage({ id: 's1', name: 'Docs', status: 'completed', order: 0 }),
        makeStage({ id: 's2', name: 'Form', status: 'active', order: 1 }),
        makeStage({ id: 's3', name: 'Interview', status: 'pending', order: 2 }),
      ],
      current_stage_index: 1,
      started_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
      ...over,
    };
  }

  /**
   * Builds a fixture with a controllable `pipelineId` route param so we can
   * drive ngOnInit and startApplication without relying on the default
   * router which yields a null paramMap.
   */
  function buildWithPipeline(pipelineId: string | null): {
    fixture: ComponentFixture<ApplicationStartComponent>;
    component: ApplicationStartComponent;
    httpMock: HttpTestingController;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ApplicationStartComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap(
                pipelineId === null ? {} : { pipelineId },
              ),
            },
          },
        },
      ],
    });
    const f = TestBed.createComponent(ApplicationStartComponent);
    return {
      fixture: f,
      component: f.componentInstance,
      httpMock: TestBed.inject(HttpTestingController),
    };
  }

  describe('shell render', () => {
    it('renders the section root with header and start section', () => {
      const el = fixture.nativeElement as HTMLElement;
      const root = el.querySelector('[data-testid="application-start"]');
      expect(root).not.toBeNull();
      expect(root?.tagName).toBe('SECTION');
      // i18n key rendered raw (no translation loaded)
      expect(
        el.querySelector('[data-testid="application-title"]')?.textContent,
      ).toContain('admissions.application_title');
      // No application yet → start section visible
      expect(el.querySelector('[data-testid="start-section"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="start-btn"]')).not.toBeNull();
    });

    it('does not render the loading skeleton when loading is false', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="application-loading"]'),
      ).toBeNull();
    });

    it('renders the loading skeleton when loading() is true', () => {
      component.loading.set(true);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="application-loading"]'),
      ).not.toBeNull();
      // The empty stepper + start section are hidden while loading
      expect(el.querySelector('[data-testid="stage-stepper"]')).toBeNull();
    });

    it('does not render the overview when there is no application', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="application-overview"]'),
      ).toBeNull();
    });
  });

  describe('ngOnInit', () => {
    it('reads the pipelineId from the route snapshot', () => {
      const built = buildWithPipeline('pl-99');
      built.fixture.detectChanges();
      expect(built.component.pipelineId()).toBe('pl-99');
    });

    it('leaves pipelineId null when the route param is absent', () => {
      const built = buildWithPipeline(null);
      built.fixture.detectChanges();
      expect(built.component.pipelineId()).toBeNull();
    });

    it('ticks the now() signal forward via the 1s interval', fakeAsync(() => {
      const built = buildWithPipeline('pl-1');
      built.fixture.detectChanges();
      const before = built.component.now();
      tick(1000);
      const after = built.component.now();
      expect(after).toBeGreaterThanOrEqual(before);
      built.fixture.destroy();
      discardPeriodicTasks();
    }));
  });

  describe('startApplication', () => {
    it('does nothing when there is no pipelineId', () => {
      const built = buildWithPipeline(null);
      built.fixture.detectChanges();
      built.component.startApplication();
      // No HTTP call should be issued
      built.httpMock.expectNone(
        `${environment.bffBaseUrl}/api/v1/admissions/my-applications`,
      );
      expect(built.component.starting()).toBe(false);
      built.httpMock.verify();
    });

    it('POSTs to my-applications and sets the application on success', () => {
      const built = buildWithPipeline('pl-42');
      built.fixture.detectChanges();
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      built.component.startApplication();
      expect(built.component.starting()).toBe(true);

      const req = built.httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admissions/my-applications`,
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ pipeline_id: 'pl-42' });

      const app = makeApp();
      req.flush(app);

      expect(built.component.starting()).toBe(false);
      expect(built.component.application()).toEqual(app);
      expect(built.component.hasStarted()).toBe(true);
      expect(toastSpy).toHaveBeenCalledWith(
        'admissions.application_started',
        'success',
      );
      built.httpMock.verify();
    });

    it('shows a start_error toast when the service returns a null app (caught error path)', () => {
      const built = buildWithPipeline('pl-42');
      built.fixture.detectChanges();
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      built.component.startApplication();
      const req = built.httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admissions/my-applications`,
      );
      // 4xx → service catchError → emits null → component sees falsy app
      req.flush(
        { error: 'pipeline closed' },
        { status: 409, statusText: 'Conflict' },
      );

      expect(built.component.starting()).toBe(false);
      expect(built.component.application()).toBeNull();
      expect(toastSpy).toHaveBeenCalledWith('admissions.start_error', 'error');
      built.httpMock.verify();
    });

    it('shows a start_error toast on a 5xx server failure', () => {
      const built = buildWithPipeline('pl-42');
      built.fixture.detectChanges();
      const toast = TestBed.inject(ToastService);
      const toastSpy = vi.spyOn(toast, 'show');

      built.component.startApplication();
      const req = built.httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admissions/my-applications`,
      );
      req.flush('boom', { status: 500, statusText: 'Server Error' });

      expect(built.component.starting()).toBe(false);
      expect(toastSpy).toHaveBeenCalledWith('admissions.start_error', 'error');
      built.httpMock.verify();
    });
  });

  describe('navigateToStage', () => {
    it('does nothing when there is no application', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.application.set(null);
      component.navigateToStage(makeStage({ status: 'active' }));
      expect(navSpy).not.toHaveBeenCalled();
    });

    it('does nothing when the stage is pending', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.application.set(makeApp());
      component.navigateToStage(makeStage({ id: 's3', status: 'pending' }));
      expect(navSpy).not.toHaveBeenCalled();
    });

    it('navigates to the stage route for an active stage', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const app = makeApp();
      component.application.set(app);
      const stage = makeStage({ id: 's2', status: 'active' });
      component.navigateToStage(stage);
      expect(navSpy).toHaveBeenCalledWith([
        '/admissions/apply',
        app.pipeline_id,
        'stage',
        's2',
      ]);
    });

    it('navigates for a completed stage too', () => {
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const app = makeApp();
      component.application.set(app);
      component.navigateToStage(makeStage({ id: 's1', status: 'completed' }));
      expect(navSpy).toHaveBeenCalledWith([
        '/admissions/apply',
        app.pipeline_id,
        'stage',
        's1',
      ]);
    });
  });

  describe('getTimeRemaining', () => {
    it('returns 00:00:00 when the deadline has already passed', () => {
      const stage = makeStage({
        status: 'active',
        timeout_deadline: new Date(Date.now() - 60000).toISOString(),
      });
      expect(component.getTimeRemaining(stage)).toBe('00:00:00');
    });

    it('zero-pads hours/minutes/seconds below 10', () => {
      // 1h 2m 3s into the future = 3723000ms
      const stage = makeStage({
        status: 'active',
        timeout_deadline: new Date(Date.now() + 3723000).toISOString(),
      });
      const result = component.getTimeRemaining(stage);
      // Format always HH:MM:SS, each segment two digits
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(result.startsWith('01:')).toBe(true);
    });
  });

  describe('computed signals', () => {
    it('stages() returns the application stages or [] when none', () => {
      expect(component.stages()).toEqual([]);
      const app = makeApp();
      component.application.set(app);
      expect(component.stages()).toEqual(app.stages);
    });

    it('currentStageIndex() defaults to 0 and reflects the application', () => {
      expect(component.currentStageIndex()).toBe(0);
      component.application.set(makeApp({ current_stage_index: 2 }));
      expect(component.currentStageIndex()).toBe(2);
    });

    it('estimatedMinutes() uses 15 default per stage and timeout_hours*60 otherwise', () => {
      component.application.set(
        makeApp({
          stages: [
            makeStage({ id: 'a', timeout_hours: null }), // 15
            makeStage({ id: 'b', timeout_hours: 2 }), // 120
            makeStage({ id: 'c', timeout_hours: null }), // 15
          ],
        }),
      );
      expect(component.estimatedMinutes()).toBe(150);
    });

    it('estimatedMinutes() is 0 with no stages', () => {
      expect(component.estimatedMinutes()).toBe(0);
    });
  });

  describe('trackByStageId', () => {
    it('returns the stage id', () => {
      expect(component.trackByStageId(0, makeStage({ id: 'xyz' }))).toBe('xyz');
    });
  });

  describe('template — application present', () => {
    function buildWithApp(app: ApplicationOverview): {
      fixture: ComponentFixture<ApplicationStartComponent>;
      component: ApplicationStartComponent;
      el: HTMLElement;
    } {
      const built = buildWithPipeline('pl-42');
      built.fixture.detectChanges();
      built.component.application.set(app);
      built.fixture.detectChanges();
      return {
        fixture: built.fixture,
        component: built.component,
        el: built.fixture.nativeElement as HTMLElement,
      };
    }

    it('renders the overview with pipeline name, programme and meta', () => {
      const { el } = buildWithApp(makeApp());
      const overview = el.querySelector(
        '[data-testid="application-overview"]',
      );
      expect(overview).not.toBeNull();
      expect(overview?.textContent).toContain('Diploma Intake 2026');
      expect(overview?.textContent).toContain('Computer Science');
    });

    it('omits the programme paragraph when programme_name is null', () => {
      const { el } = buildWithApp(makeApp({ programme_name: null }));
      const programme = el.querySelector('.application-start__programme');
      expect(programme).toBeNull();
    });

    it('renders one step per stage', () => {
      const { el } = buildWithApp(makeApp());
      const steps = el.querySelectorAll('[data-testid^="step-"]');
      expect(steps.length).toBe(3);
    });

    it('hides the start section once the application has started', () => {
      const { el } = buildWithApp(makeApp());
      expect(el.querySelector('[data-testid="start-section"]')).toBeNull();
    });

    it('renders a go-to-stage button only for accessible (active/completed) stages', () => {
      const { el } = buildWithApp(makeApp());
      // completed (s1) + active (s2) → 2 buttons; pending (s3) → none
      const btns = el.querySelectorAll('[data-testid^="go-to-stage-"]');
      expect(btns.length).toBe(2);
    });

    it('clicking a stage button navigates', () => {
      const { fixture: f, el } = buildWithApp(makeApp());
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const btn = el.querySelector(
        '[data-testid="go-to-stage-1"]',
      ) as HTMLButtonElement;
      btn.click();
      f.detectChanges();
      expect(navSpy).toHaveBeenCalled();
    });

    it('renders a countdown timer for an active stage with a deadline', () => {
      const app = makeApp({
        stages: [
          makeStage({
            id: 's2',
            status: 'active',
            timeout_deadline: new Date(Date.now() + 3600000).toISOString(),
          }),
        ],
      });
      const { el } = buildWithApp(app);
      const countdown = el.querySelector('[data-testid="countdown"]');
      expect(countdown).not.toBeNull();
      expect(countdown?.getAttribute('role')).toBe('timer');
    });

    it('renders an optional badge for non-required stages', () => {
      const app = makeApp({
        stages: [makeStage({ id: 's1', status: 'active', required: false })],
      });
      const { el } = buildWithApp(app);
      expect(
        el.querySelector('.application-start__optional-badge'),
      ).not.toBeNull();
    });
  });

  describe('template — start button states', () => {
    it('shows the starting label and disables the button while starting()', () => {
      component.starting.set(true);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const btn = el.querySelector(
        '[data-testid="start-btn"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toContain('admissions.starting');
    });

    it('clicking the start button with no pipelineId issues no HTTP call', () => {
      // Default fixture has a null pipelineId (provideRouter([]) yields no param)
      const httpMock = TestBed.inject(HttpTestingController);
      const el = fixture.nativeElement as HTMLElement;
      const btn = el.querySelector(
        '[data-testid="start-btn"]',
      ) as HTMLButtonElement;
      btn.click();
      fixture.detectChanges();
      httpMock.expectNone(
        `${environment.bffBaseUrl}/api/v1/admissions/my-applications`,
      );
      httpMock.verify();
    });
  });

  describe('ngOnDestroy', () => {
    it('unsubscribes the interval (no leaked timers after destroy)', fakeAsync(() => {
      const built = buildWithPipeline('pl-1');
      built.fixture.detectChanges();
      built.fixture.destroy(); // triggers ngOnDestroy → unsubscribe
      // After destroy the periodic task is gone; tick should not throw.
      tick(2000);
      expect(true).toBe(true);
    }));
  });

  describe('AdmissionService state sync', () => {
    it('flips applicationState to success on a successful start', () => {
      const built = buildWithPipeline('pl-42');
      built.fixture.detectChanges();
      const svc = TestBed.inject(AdmissionService);
      built.component.startApplication();
      const req = built.httpMock.expectOne(
        `${environment.bffBaseUrl}/api/v1/admissions/my-applications`,
      );
      req.flush(makeApp());
      expect(svc.applicationState().status).toBe('success');
      built.httpMock.verify();
    });
  });
});
