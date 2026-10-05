import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  HttpTestingController,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { PipelinePublicationComponent } from './pipeline-publication.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../../environments/environment';
import type { PipelineTemplate } from '../../models/admission.model';

const TEMPLATES_URL = `${environment.bffBaseUrl}/api/v1/admissions/templates`;

function makeTemplate(overrides: Partial<PipelineTemplate> = {}): PipelineTemplate {
  return {
    id: 'tpl-1',
    name: 'Autumn Intake Pipeline',
    description: 'Standard admissions flow',
    programme_id: 'prog-1',
    programme_name: 'Computer Science',
    stages: [
      {
        id: 'stage-1',
        name: 'Upload Transcripts',
        type: 'document_upload',
        order: 0,
        required: true,
        timeout_hours: null,
        instructions: '',
        config: {},
      },
      {
        id: 'stage-2',
        name: '',
        type: 'interview',
        order: 1,
        required: false,
        timeout_hours: null,
        instructions: '',
        config: {},
      },
    ],
    status: 'draft',
    open_date: null,
    close_date: null,
    max_concurrent_applications: 100,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    ...overrides,
  };
}

describe('PipelinePublicationComponent', () => {
  let component: PipelinePublicationComponent;
  let fixture: ComponentFixture<PipelinePublicationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PipelinePublicationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PipelinePublicationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not allow publish without confirmation', () => {
    expect(component.canPublish()).toBe(false);
  });

  it('should add cohort IDs', () => {
    component.cohortInput.set('cohort-1');
    component.addCohort();
    expect(component.notificationCohortIds()).toEqual(['cohort-1']);
    expect(component.cohortInput()).toBe('');
  });

  it('should not add duplicate cohort IDs', () => {
    component.cohortInput.set('cohort-1');
    component.addCohort();
    component.cohortInput.set('cohort-1');
    component.addCohort();
    expect(component.notificationCohortIds().length).toBe(1);
  });

  it('should remove cohort by index', () => {
    component.cohortInput.set('cohort-1');
    component.addCohort();
    component.cohortInput.set('cohort-2');
    component.addCohort();
    component.removeCohort(0);
    expect(component.notificationCohortIds()).toEqual(['cohort-2']);
  });
});

// ---------------------------------------------------------------------------
// AUGMENTED COVERAGE
// ---------------------------------------------------------------------------

describe('PipelinePublicationComponent — shell (no route id)', () => {
  let fixture: ComponentFixture<PipelinePublicationComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PipelinePublicationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    fixture = TestBed.createComponent(PipelinePublicationComponent);
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders the publication root with the title key', () => {
    const root = element.querySelector('[data-testid="pipeline-publication"]');
    expect(root).not.toBeNull();
    expect(root?.tagName).toBe('SECTION');
    const title = element.querySelector('[data-testid="publication-title"]');
    expect(title?.textContent).toContain('admin.admissions.publication_title');
  });

  it('does not fetch a template when the route has no id', () => {
    // No route param → loadTemplate never called → no HTTP and not loading.
    expect(component(fixture).loading()).toBe(false);
    expect(component(fixture).template()).toBeNull();
    // afterEach verify() asserts no stray request fired.
  });

  it('does not render the summary/settings when there is no template', () => {
    expect(
      element.querySelector('[data-testid="pipeline-summary"]'),
    ).toBeNull();
    expect(
      element.querySelector('[data-testid="publication-settings"]'),
    ).toBeNull();
  });

  it('stageSummary is empty with no template', () => {
    expect(component(fixture).stageSummary()).toEqual([]);
  });

  it('trackByIndex returns the index', () => {
    expect(component(fixture).trackByIndex(3)).toBe(3);
  });
});

function component(
  f: ComponentFixture<PipelinePublicationComponent>,
): PipelinePublicationComponent {
  return f.componentInstance;
}

describe('PipelinePublicationComponent — template load', () => {
  let fixture: ComponentFixture<PipelinePublicationComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  let cmp: PipelinePublicationComponent;

  function buildWithRoute(): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PipelinePublicationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: (k: string) => (k === 'id' ? 'tpl-1' : null) } },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(PipelinePublicationComponent);
    cmp = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => httpMock.verify());

  it('issues a GET to the template endpoint and shows the loading skeleton', () => {
    buildWithRoute();
    fixture.detectChanges(); // ngOnInit → loadTemplate
    expect(cmp.loading()).toBe(true);

    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="publication-loading"]'),
    ).not.toBeNull();

    const req = httpMock.expectOne(`${TEMPLATES_URL}/tpl-1`);
    expect(req.request.method).toBe('GET');
    req.flush(makeTemplate());
  });

  it('renders the summary, stages, and programme on a successful load', () => {
    buildWithRoute();
    fixture.detectChanges();
    httpMock.expectOne(`${TEMPLATES_URL}/tpl-1`).flush(makeTemplate());
    fixture.detectChanges();

    expect(cmp.loading()).toBe(false);
    expect(cmp.template()?.id).toBe('tpl-1');

    const summary = element.querySelector('[data-testid="pipeline-summary"]');
    expect(summary).not.toBeNull();

    const name = element.querySelector('[data-testid="summary-name"]');
    expect(name?.textContent).toContain('Autumn Intake Pipeline');

    const programme = element.querySelector('[data-testid="summary-programme"]');
    expect(programme?.textContent).toContain('Computer Science');

    const count = element.querySelector('[data-testid="summary-stage-count"]');
    expect(count?.textContent).toContain('2');

    // Two stage rows rendered (data-testid="summary-stage-0|1").
    expect(
      element.querySelector('[data-testid="summary-stage-0"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="summary-stage-1"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="summary-stage-2"]'),
    ).toBeNull();
  });

  it('computes stageSummary with order numbering and name fallback', () => {
    buildWithRoute();
    fixture.detectChanges();
    httpMock.expectOne(`${TEMPLATES_URL}/tpl-1`).flush(makeTemplate());
    fixture.detectChanges();

    const summary = cmp.stageSummary();
    expect(summary.length).toBe(2);
    expect(summary[0]).toEqual({
      order: 1,
      name: 'Upload Transcripts',
      type: 'document_upload',
      required: true,
    });
    // Empty name falls back to "Stage N".
    expect(summary[1].name).toBe('Stage 2');
    expect(summary[1].order).toBe(2);
    expect(summary[1].required).toBe(false);
  });

  it('hides the programme row when programme_name is null', () => {
    buildWithRoute();
    fixture.detectChanges();
    httpMock
      .expectOne(`${TEMPLATES_URL}/tpl-1`)
      .flush(makeTemplate({ programme_name: null }));
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="summary-programme"]'),
    ).toBeNull();
  });

  it('seeds the openDate signal from the template open_date', () => {
    buildWithRoute();
    fixture.detectChanges();
    httpMock
      .expectOne(`${TEMPLATES_URL}/tpl-1`)
      .flush(makeTemplate({ open_date: '2026-09-01T09:00' }));
    fixture.detectChanges();

    expect(cmp.openDate()).toBe('2026-09-01T09:00');
  });

  it('leaves openDate empty when the template has no open_date', () => {
    buildWithRoute();
    fixture.detectChanges();
    httpMock
      .expectOne(`${TEMPLATES_URL}/tpl-1`)
      .flush(makeTemplate({ open_date: null }));
    fixture.detectChanges();

    expect(cmp.openDate()).toBe('');
  });

  it('clears loading without an error toast on a 500 load failure (service swallows the error to of(null))', () => {
    // CHARACTERIZATION: AdmissionAdminService.loadTemplate catches HTTP errors
    // with catchError → of(null), so the component's `error` callback never
    // fires for a server error — instead `next(null)` runs. The component's
    // error branch (and its template_load_error toast) is therefore unreachable
    // for HTTP failures; only loading is cleared and template stays null.
    buildWithRoute();
    const toast = TestBed.inject(ToastService);
    const spy = vi.spyOn(toast, 'show');

    fixture.detectChanges();
    httpMock
      .expectOne(`${TEMPLATES_URL}/tpl-1`)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(cmp.loading()).toBe(false);
    expect(cmp.template()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing on load when the service yields a null body', () => {
    buildWithRoute();
    fixture.detectChanges();
    // 204 / null body → service maps to null → template stays null, loading clears.
    httpMock.expectOne(`${TEMPLATES_URL}/tpl-1`).flush(null);
    fixture.detectChanges();

    expect(cmp.loading()).toBe(false);
    expect(cmp.template()).toBeNull();
  });
});

describe('PipelinePublicationComponent — publish flow', () => {
  let fixture: ComponentFixture<PipelinePublicationComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  let cmp: PipelinePublicationComponent;
  let router: Router;
  let toast: ToastService;

  function arrange(openDate = '2026-09-01T09:00'): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PipelinePublicationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: (k: string) => (k === 'id' ? 'tpl-1' : null) } },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(PipelinePublicationComponent);
    cmp = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    toast = TestBed.inject(ToastService);

    fixture.detectChanges(); // ngOnInit load
    httpMock.expectOne(`${TEMPLATES_URL}/tpl-1`).flush(makeTemplate({ open_date: openDate }));
    fixture.detectChanges();
  }

  afterEach(() => httpMock.verify());

  it('canPublish is true once an open date is set and confirm is checked', () => {
    arrange();
    expect(cmp.canPublish()).toBe(false); // confirm not yet checked
    cmp.confirmChecked.set(true);
    expect(cmp.canPublish()).toBe(true);
  });

  it('keeps canPublish false while a publish is in flight', () => {
    arrange();
    cmp.confirmChecked.set(true);
    cmp.publishing.set(true);
    expect(cmp.canPublish()).toBe(false);
  });

  it('POSTs the publication request and navigates home on success', () => {
    arrange();
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');
    cmp.confirmChecked.set(true);
    cmp.cohortInput.set('cohort-9');
    cmp.addCohort();

    cmp.publish();
    expect(cmp.publishing()).toBe(true);

    const req = httpMock.expectOne(`${TEMPLATES_URL}/tpl-1/publish`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      open_date: '2026-09-01T09:00',
      notification_cohort_ids: ['cohort-9'],
    });
    req.flush(makeTemplate({ status: 'published' }));

    expect(cmp.publishing()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.admissions.publish_success',
      'success',
    );
    expect(nav).toHaveBeenCalledWith(['/admin/admissions']);
  });

  it('shows the publish error toast and does NOT navigate on a null body', () => {
    arrange();
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');
    cmp.confirmChecked.set(true);

    cmp.publish();
    httpMock.expectOne(`${TEMPLATES_URL}/tpl-1/publish`).flush(null);

    expect(cmp.publishing()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.admissions.publish_error',
      'error',
    );
    expect(nav).not.toHaveBeenCalled();
  });

  it('shows the publish error toast on a 500 from the publish call (service maps error → null body)', () => {
    // The service swallows the 500 to of(null), so this exercises the same
    // next(null) → publish_error path as the explicit null-body case above.
    arrange();
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');
    cmp.confirmChecked.set(true);

    cmp.publish();
    httpMock
      .expectOne(`${TEMPLATES_URL}/tpl-1/publish`)
      .flush({ error: 'nope' }, { status: 500, statusText: 'Server Error' });

    expect(cmp.publishing()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.admissions.publish_error',
      'error',
    );
    expect(nav).not.toHaveBeenCalled();
  });

  it('publish() is a no-op when canPublish is false', () => {
    arrange();
    // confirm NOT checked → canPublish false → early return, no HTTP.
    cmp.publish();
    expect(cmp.publishing()).toBe(false);
    // afterEach verify() asserts no publish request fired.
  });

  it('disables the publish button until canPublish is satisfied', () => {
    arrange();
    const btn = element.querySelector(
      '[data-testid="publish-btn"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    cmp.confirmChecked.set(true);
    fixture.detectChanges();
    expect(btn.disabled).toBe(false);
  });

  it('shows the publishing label on the button while in flight', () => {
    arrange();
    cmp.confirmChecked.set(true);
    cmp.publishing.set(true);
    fixture.detectChanges();
    const btn = element.querySelector('[data-testid="publish-btn"]');
    expect(btn?.textContent).toContain('admin.admissions.publishing');
  });
});

describe('PipelinePublicationComponent — navigation', () => {
  function buildWithRoute(
    paramGet: (k: string) => string | null,
  ): {
    cmp: PipelinePublicationComponent;
    fixture: ComponentFixture<PipelinePublicationComponent>;
    httpMock: HttpTestingController;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PipelinePublicationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: paramGet } } },
        },
      ],
    });
    const fixture = TestBed.createComponent(PipelinePublicationComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    return { cmp: fixture.componentInstance, fixture, httpMock };
  }

  it('goBack navigates to the template edit route when a template is loaded', () => {
    const { cmp, fixture, httpMock } = buildWithRoute((k) =>
      k === 'id' ? 'tpl-1' : null,
    );
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.detectChanges();
    httpMock.expectOne(`${TEMPLATES_URL}/tpl-1`).flush(makeTemplate());
    fixture.detectChanges();

    cmp.goBack();
    expect(nav).toHaveBeenCalledWith([
      '/admin/admissions/templates',
      'tpl-1',
      'edit',
    ]);
    httpMock.verify();
  });

  it('goBack navigates to the admissions home when no template is loaded', () => {
    const { cmp, fixture, httpMock } = buildWithRoute(() => null);
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.detectChanges(); // no id → no load
    cmp.goBack();
    expect(nav).toHaveBeenCalledWith(['/admin/admissions']);
    httpMock.verify();
  });

  it('ngOnDestroy unsubscribes without throwing', () => {
    const { cmp, fixture, httpMock } = buildWithRoute(() => null);
    fixture.detectChanges();
    expect(() => cmp.ngOnDestroy()).not.toThrow();
    httpMock.verify();
  });
});
