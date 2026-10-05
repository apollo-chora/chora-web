import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { Observable, throwError } from 'rxjs';
import { PipelineBuilderComponent } from './pipeline-builder.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { AdmissionAdminService } from '../../services/admission-admin.service';
import { environment } from '../../../../../../environments/environment';
import type {
  PipelineTemplate,
  PipelineStage,
} from '../../models/admission.model';

const TEMPLATES_URL = `${environment.bffBaseUrl}/api/v1/admissions/templates`;

function makeStage(overrides: Partial<PipelineStage> = {}): PipelineStage {
  return {
    id: 'stage-loaded-1',
    name: 'Submit Docs',
    type: 'document_upload',
    order: 0,
    required: true,
    timeout_hours: 48,
    instructions: 'Upload your transcript',
    config: { accepted_file_types: ['pdf'], max_file_size_mb: 5 },
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<PipelineTemplate> = {}): PipelineTemplate {
  return {
    id: 'tmpl-001',
    name: 'Diploma Admission',
    description: 'Intake pipeline for the diploma programme',
    programme_id: 'prog-001',
    programme_name: 'Diploma in Music',
    stages: [makeStage(), makeStage({ id: 'stage-loaded-2', type: 'interview', order: 1 })],
    status: 'draft',
    open_date: '2026-06-01T00:00:00Z',
    close_date: '2026-07-01T00:00:00Z',
    max_concurrent_applications: 3,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-02T00:00:00Z',
    ...overrides,
  };
}

/** Build a minimal CdkDragDrop-shaped event without real CDK drag machinery. */
function dropEvent(previousIndex: number, currentIndex: number): CdkDragDrop<PipelineStage[]> {
  return {
    previousIndex,
    currentIndex,
    item: {} as never,
    container: {} as never,
    previousContainer: {} as never,
    isPointerOverContainer: true,
    distance: { x: 0, y: 0 },
    dropPoint: { x: 0, y: 0 },
    event: {} as never,
  } as CdkDragDrop<PipelineStage[]>;
}

describe('PipelineBuilderComponent', () => {
  let component: PipelineBuilderComponent;
  let fixture: ComponentFixture<PipelineBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PipelineBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PipelineBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with empty stages', () => {
    expect(component.stages().length).toBe(0);
  });

  it('should add a stage when addStage is called', () => {
    component.addStage('document_upload');
    expect(component.stages().length).toBe(1);
    expect(component.stages()[0].type).toBe('document_upload');
  });

  it('should remove a stage when removeStage is called', () => {
    component.addStage('form');
    component.addStage('assessment');
    component.removeStage(0);
    expect(component.stages().length).toBe(1);
    expect(component.stages()[0].type).toBe('assessment');
  });

  it('should select a stage', () => {
    component.addStage('interview');
    component.selectStage(0);
    expect(component.selectedStageIndex()).toBe(0);
    expect(component.selectedStage()?.type).toBe('interview');
  });

  it('should not allow save when no name is set', () => {
    component.addStage('form');
    expect(component.canSave()).toBe(false);
  });

  it('should allow save when name and stages are set', () => {
    component.templateName.set('Test Pipeline');
    component.addStage('form');
    expect(component.canSave()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Shell render + create-mode (no route id)
// ---------------------------------------------------------------------------

describe('PipelineBuilderComponent — shell render (create mode)', () => {
  let fixture: ComponentFixture<PipelineBuilderComponent>;
  let element: HTMLElement;
  let component: PipelineBuilderComponent;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PipelineBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PipelineBuilderComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders the root section with the pipeline-builder testid', () => {
    const root = element.querySelector('[data-testid="pipeline-builder"]');
    expect(root).not.toBeNull();
    expect(root?.tagName).toBe('SECTION');
  });

  it('is not in editing mode when no route id is present', () => {
    expect(component.isEditing()).toBe(false);
    expect(component.templateId()).toBeNull();
  });

  it('shows the new-template title key in create mode', () => {
    const title = element.querySelector('[data-testid="builder-title"]');
    expect(title?.textContent).toContain('admin.admissions.new_template');
  });

  it('does not render the loading skeleton when not loading', () => {
    expect(element.querySelector('[data-testid="builder-loading"]')).toBeNull();
  });

  it('renders the empty-stages placeholder before any stage is added', () => {
    expect(element.querySelector('[data-testid="empty-stages"]')).not.toBeNull();
  });

  it('renders a palette button per stage type', () => {
    const palette = element.querySelectorAll('[data-testid^="add-stage-"]');
    expect(palette.length).toBe(component.allStageTypes.length);
  });

  it('shows the no-selection placeholder in the config panel initially', () => {
    expect(
      element.querySelector('[data-testid="no-stage-selected"]'),
    ).not.toBeNull();
  });

  it('keeps the save button disabled when nothing is filled in', () => {
    const save = element.querySelector('[data-testid="save-btn"]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('adds a stage when a palette button is clicked', () => {
    const addForm = element.querySelector(
      '[data-testid="add-stage-form"]',
    ) as HTMLButtonElement;
    addForm.click();
    fixture.detectChanges();
    expect(component.stages().length).toBe(1);
    expect(component.stages()[0].type).toBe('form');
    // empty placeholder gone; stage item rendered
    expect(element.querySelector('[data-testid="empty-stages"]')).toBeNull();
    expect(element.querySelector('[data-testid="stage-item-0"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stage management logic (defaults, reorder, index bookkeeping)
// ---------------------------------------------------------------------------

describe('PipelineBuilderComponent — stage management', () => {
  let fixture: ComponentFixture<PipelineBuilderComponent>;
  let component: PipelineBuilderComponent;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PipelineBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PipelineBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('assigns default config for document_upload', () => {
    component.addStage('document_upload');
    expect(component.stages()[0].config).toEqual({
      accepted_file_types: ['pdf', 'jpg', 'png'],
      max_file_size_mb: 10,
    });
  });

  it('assigns default config for form, assessment, decision, prerequisite_check, interview', () => {
    component.addStage('form');
    component.addStage('assessment');
    component.addStage('decision');
    component.addStage('prerequisite_check');
    component.addStage('interview');
    const s = component.stages();
    expect(s[0].config).toEqual({ form_fields: [] });
    expect(s[1].config).toEqual({ linked_assessment_id: undefined });
    expect(s[2].config).toEqual({ reviewer_gcids: [] });
    expect(s[3].config).toEqual({ prerequisite_rules: [] });
    expect(s[4].config).toEqual({});
  });

  it('auto-selects the freshly added stage', () => {
    component.addStage('form');
    expect(component.selectedStageIndex()).toBe(0);
    component.addStage('interview');
    expect(component.selectedStageIndex()).toBe(1);
  });

  it('sets sequential order on add and re-orders after removal', () => {
    component.addStage('form');
    component.addStage('interview');
    component.addStage('decision');
    expect(component.stages().map((s) => s.order)).toEqual([0, 1, 2]);
    component.removeStage(1);
    expect(component.stages().map((s) => s.order)).toEqual([0, 1]);
    expect(component.stages().map((s) => s.type)).toEqual(['form', 'decision']);
  });

  it('clears selection when the selected stage is removed', () => {
    component.addStage('form');
    component.selectStage(0);
    component.removeStage(0);
    expect(component.selectedStageIndex()).toBeNull();
  });

  it('decrements selected index when a stage before it is removed', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.addStage('decision'); // 2
    component.selectStage(2);
    component.removeStage(0);
    expect(component.selectedStageIndex()).toBe(1);
  });

  it('leaves selected index unchanged when a stage after it is removed', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.addStage('decision'); // 2
    component.selectStage(0);
    component.removeStage(2);
    expect(component.selectedStageIndex()).toBe(0);
  });

  it('selectedStage returns null when index points past the array', () => {
    component.addStage('form');
    component.selectStage(5);
    expect(component.selectedStage()).toBeNull();
  });

  it('reorders stages on drop and renumbers order', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.addStage('decision'); // 2
    component.onStageDrop(dropEvent(0, 2));
    expect(component.stages().map((s) => s.type)).toEqual([
      'interview',
      'decision',
      'form',
    ]);
    expect(component.stages().map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('follows the dragged item when it is the selected one', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.addStage('decision'); // 2
    component.selectStage(0);
    component.onStageDrop(dropEvent(0, 2));
    expect(component.selectedStageIndex()).toBe(2);
  });

  it('shifts selected index down when an earlier item moves past it', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.addStage('decision'); // 2
    component.selectStage(1);
    component.onStageDrop(dropEvent(0, 2)); // 0 -> 2, selected (1) shifts to 0
    expect(component.selectedStageIndex()).toBe(0);
  });

  it('shifts selected index up when a later item moves before it', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.addStage('decision'); // 2
    component.selectStage(1);
    component.onStageDrop(dropEvent(2, 0)); // 2 -> 0, selected (1) shifts to 2
    expect(component.selectedStageIndex()).toBe(2);
  });

  it('leaves selection alone on drop when nothing is selected', () => {
    component.addStage('form');
    component.addStage('interview');
    // addStage auto-selects the new stage; clear it to exercise the null branch
    component.selectedStageIndex.set(null);
    component.onStageDrop(dropEvent(0, 1));
    expect(component.selectedStageIndex()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stage field + config mutators
// ---------------------------------------------------------------------------

describe('PipelineBuilderComponent — stage mutators', () => {
  let fixture: ComponentFixture<PipelineBuilderComponent>;
  let component: PipelineBuilderComponent;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PipelineBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PipelineBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.addStage('document_upload');
  });

  it('updates the stage name', () => {
    component.updateStageName(0, 'Transcript Upload');
    expect(component.stages()[0].name).toBe('Transcript Upload');
  });

  it('updates the required flag', () => {
    component.updateStageRequired(0, false);
    expect(component.stages()[0].required).toBe(false);
  });

  it('updates the timeout hours', () => {
    component.updateStageTimeout(0, 24);
    expect(component.stages()[0].timeout_hours).toBe(24);
    component.updateStageTimeout(0, null);
    expect(component.stages()[0].timeout_hours).toBeNull();
  });

  it('updates the instructions', () => {
    component.updateStageInstructions(0, 'Please upload a PDF');
    expect(component.stages()[0].instructions).toBe('Please upload a PDF');
  });

  it('merges partial config without clobbering existing keys', () => {
    component.updateStageConfig(0, { max_file_size_mb: 25 });
    expect(component.stages()[0].config.max_file_size_mb).toBe(25);
    // accepted_file_types default survives
    expect(component.stages()[0].config.accepted_file_types).toEqual([
      'pdf',
      'jpg',
      'png',
    ]);
  });

  it('parses accepted file types from a comma-separated string', () => {
    component.updateAcceptedFileTypes(0, 'pdf,  docx , , png ');
    expect(component.stages()[0].config.accepted_file_types).toEqual([
      'pdf',
      'docx',
      'png',
    ]);
  });

  it('sets accepted file types to an empty list for an empty string', () => {
    component.updateAcceptedFileTypes(0, '   ');
    expect(component.stages()[0].config.accepted_file_types).toEqual([]);
  });

  it('sets linked assessment id when non-empty', () => {
    component.updateLinkedAssessment(0, 'assess-123');
    expect(component.stages()[0].config.linked_assessment_id).toBe('assess-123');
  });

  it('clears linked assessment id to undefined for an empty string', () => {
    component.updateLinkedAssessment(0, '');
    expect(component.stages()[0].config.linked_assessment_id).toBeUndefined();
  });

  it('updates the max file size', () => {
    component.updateMaxFileSize(0, 50);
    expect(component.stages()[0].config.max_file_size_mb).toBe(50);
  });

  it('trackByIndex returns the index and trackByStageType returns the type', () => {
    expect(component.trackByIndex(3)).toBe(3);
    expect(component.trackByStageType(0, 'interview')).toBe('interview');
  });
});

// ---------------------------------------------------------------------------
// Config panel rendering for the selected stage
// ---------------------------------------------------------------------------

describe('PipelineBuilderComponent — config panel rendering', () => {
  let fixture: ComponentFixture<PipelineBuilderComponent>;
  let element: HTMLElement;
  let component: PipelineBuilderComponent;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PipelineBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PipelineBuilderComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('renders the document-upload config block for a selected upload stage', () => {
    component.addStage('document_upload');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="doc-upload-config"]')).not.toBeNull();
  });

  it('renders the assessment config block for a selected assessment stage', () => {
    component.addStage('assessment');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="assessment-config"]')).not.toBeNull();
  });

  it('renders the decision config block for a selected decision stage', () => {
    component.addStage('decision');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="decision-config"]')).not.toBeNull();
  });

  it('renders the generic config block for an interview stage', () => {
    component.addStage('interview');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="generic-config"]')).not.toBeNull();
  });

  it('shows the stage count badge in the stage list', () => {
    component.addStage('form');
    component.addStage('interview');
    fixture.detectChanges();
    const list = element.querySelector('[data-testid="stage-list"]');
    expect(list?.textContent).toContain('(2)');
  });

  it('shows the optional badge for a non-required stage in the list', () => {
    component.addStage('form');
    component.updateStageRequired(0, false);
    fixture.detectChanges();
    const item = element.querySelector('[data-testid="stage-item-0"]');
    expect(item?.textContent).toContain('admin.admissions.optional');
  });

  it('removes a stage when its remove button is clicked', () => {
    component.addStage('form');
    fixture.detectChanges();
    const remove = element.querySelector(
      '[data-testid="remove-stage-0"]',
    ) as HTMLButtonElement;
    remove.click();
    fixture.detectChanges();
    expect(component.stages().length).toBe(0);
    expect(element.querySelector('[data-testid="empty-stages"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Save flow (create) over HTTP
// ---------------------------------------------------------------------------

describe('PipelineBuilderComponent — save (create) flow', () => {
  let fixture: ComponentFixture<PipelineBuilderComponent>;
  let component: PipelineBuilderComponent;
  let httpMock: HttpTestingController;
  let router: Router;
  let toast: ToastService;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PipelineBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PipelineBuilderComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('does nothing when save is invoked while canSave is false', () => {
    component.save();
    httpMock.expectNone(TEMPLATES_URL);
    expect(component.saving()).toBe(false);
  });

  it('POSTs to the templates endpoint with the built payload', () => {
    component.templateName.set('New Pipeline');
    component.templateDescription.set('desc');
    component.maxConcurrentApplications.set(2);
    component.addStage('form');

    component.save();
    expect(component.saving()).toBe(true);

    const req = httpMock.expectOne(TEMPLATES_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('New Pipeline');
    expect(req.request.body.description).toBe('desc');
    expect(req.request.body.max_concurrent_applications).toBe(2);
    expect(req.request.body.stages.length).toBe(1);
    // status/id/timestamps are NOT part of the create payload
    expect(req.request.body.id).toBeUndefined();
    expect(req.request.body.status).toBeUndefined();

    req.flush(makeTemplate({ id: 'created-99' }));
    expect(component.saving()).toBe(false);
  });

  it('navigates to the edit route and toasts success after a successful create', () => {
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');

    component.templateName.set('New Pipeline');
    component.addStage('form');
    component.save();

    httpMock.expectOne(TEMPLATES_URL).flush(makeTemplate({ id: 'created-99' }));

    expect(toastSpy).toHaveBeenCalledWith(
      'admin.admissions.template_saved',
      'success',
    );
    expect(navSpy).toHaveBeenCalledWith([
      '/admin/admissions/templates',
      'created-99',
      'edit',
    ]);
    expect(component.saving()).toBe(false);
  });

  it('toasts a save error when the create returns null (4xx)', () => {
    const toastSpy = vi.spyOn(toast, 'show');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.templateName.set('New Pipeline');
    component.addStage('form');
    component.save();

    httpMock
      .expectOne(TEMPLATES_URL)
      .flush({ error: 'bad' }, { status: 400, statusText: 'Bad Request' });

    expect(component.saving()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.admissions.template_save_error',
      'error',
    );
    // create failed → no navigation
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('toasts a save error on a 5xx server failure', () => {
    const toastSpy = vi.spyOn(toast, 'show');

    component.templateName.set('New Pipeline');
    component.addStage('form');
    component.save();

    httpMock
      .expectOne(TEMPLATES_URL)
      .flush(
        { error: 'boom' },
        { status: 500, statusText: 'Internal Server Error' },
      );

    expect(component.saving()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.admissions.template_save_error',
      'error',
    );
  });
});

// ---------------------------------------------------------------------------
// Edit mode: route id triggers load + update-on-save
// ---------------------------------------------------------------------------

describe('PipelineBuilderComponent — edit mode (route id present)', () => {
  let fixture: ComponentFixture<PipelineBuilderComponent>;
  let component: PipelineBuilderComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  let router: Router;
  let toast: ToastService;

  const ROUTE_STUB = {
    snapshot: {
      paramMap: {
        get: (key: string) => (key === 'id' ? 'tmpl-001' : null),
      },
    },
  };

  async function configure(): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PipelineBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: ROUTE_STUB },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PipelineBuilderComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    toast = TestBed.inject(ToastService);
  }

  afterEach(() => httpMock.verify());

  it('shows the loading skeleton while the template GET is in flight', async () => {
    await configure();
    fixture.detectChanges(); // ngOnInit → loadTemplate → loading=true

    expect(component.isEditing()).toBe(true);
    expect(component.loading()).toBe(true);
    expect(element.querySelector('[data-testid="builder-loading"]')).not.toBeNull();

    httpMock
      .expectOne(`${TEMPLATES_URL}/tmpl-001`)
      .flush(makeTemplate());
  });

  it('GETs the template by id and hydrates the form', async () => {
    await configure();
    fixture.detectChanges();

    const req = httpMock.expectOne(`${TEMPLATES_URL}/tmpl-001`);
    expect(req.request.method).toBe('GET');
    req.flush(makeTemplate());

    fixture.detectChanges();
    expect(component.loading()).toBe(false);
    expect(component.templateName()).toBe('Diploma Admission');
    expect(component.templateDescription()).toBe(
      'Intake pipeline for the diploma programme',
    );
    expect(component.programmeId()).toBe('prog-001');
    expect(component.programmeName()).toBe('Diploma in Music');
    expect(component.openDate()).toBe('2026-06-01T00:00:00Z');
    expect(component.closeDate()).toBe('2026-07-01T00:00:00Z');
    expect(component.maxConcurrentApplications()).toBe(3);
    expect(component.stages().length).toBe(2);
  });

  it('shows the edit-template title once hydrated', async () => {
    await configure();
    fixture.detectChanges();
    httpMock.expectOne(`${TEMPLATES_URL}/tmpl-001`).flush(makeTemplate());
    fixture.detectChanges();

    const title = element.querySelector('[data-testid="builder-title"]');
    expect(title?.textContent).toContain('admin.admissions.edit_template');
  });

  // CHARACTERIZATION: AdmissionAdminService.loadTemplate's catchError maps the
  // HTTP failure to of(null), so the component's subscribe `next` handler fires
  // with `null` — its `error` branch (which would toast template_load_error) is
  // effectively dead for HTTP failures. The component just clears loading and
  // leaves the form untouched. We characterize the ACTUAL behavior here.
  it('clears loading without hydrating (and without an error toast) when the GET fails', async () => {
    await configure();
    const toastSpy = vi.spyOn(toast, 'show');
    fixture.detectChanges();

    httpMock
      .expectOne(`${TEMPLATES_URL}/tmpl-001`)
      .flush({ error: 'nope' }, { status: 404, statusText: 'Not Found' });

    fixture.detectChanges();
    expect(component.loading()).toBe(false);
    // service swallowed the error into of(null) → no toast, form stays empty
    expect(toastSpy).not.toHaveBeenCalled();
    expect(component.templateName()).toBe('');
    expect(component.stages().length).toBe(0);
  });

  it('PUTs to the template id endpoint on save in edit mode and does NOT navigate', async () => {
    await configure();
    fixture.detectChanges();
    httpMock.expectOne(`${TEMPLATES_URL}/tmpl-001`).flush(makeTemplate());
    fixture.detectChanges();

    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toastSpy = vi.spyOn(toast, 'show');

    component.save();
    const put = httpMock.expectOne(`${TEMPLATES_URL}/tmpl-001`);
    expect(put.request.method).toBe('PUT');
    put.flush(makeTemplate());

    expect(toastSpy).toHaveBeenCalledWith(
      'admin.admissions.template_saved',
      'success',
    );
    // editing → no navigation on success
    expect(navSpy).not.toHaveBeenCalled();
    expect(component.saving()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Uncovered conditional arms (branch-coverage augmentation)
// ---------------------------------------------------------------------------

describe('PipelineBuilderComponent — uncovered branches', () => {
  let fixture: ComponentFixture<PipelineBuilderComponent>;
  let component: PipelineBuilderComponent;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PipelineBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PipelineBuilderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // --- mutator .map() FALSE arm (i !== index leaves the stage untouched) ---
  // The existing mutator suite only ever has a single stage, so the `: s`
  // (non-matching) arm of each `map((s, i) => i === index ? ... : s)` is never
  // exercised. Here we add a second stage and mutate index 0 to drive it.

  it('updateStageName leaves non-matching stages untouched', () => {
    component.addStage('form'); // index 0
    component.addStage('interview'); // index 1
    component.updateStageName(0, 'First Stage');
    expect(component.stages()[0].name).toBe('First Stage');
    // index 1 unchanged (false arm of the ternary)
    expect(component.stages()[1].name).toBe('');
    expect(component.stages()[1].type).toBe('interview');
  });

  it('updateStageRequired leaves non-matching stages untouched', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.updateStageRequired(1, false);
    expect(component.stages()[1].required).toBe(false);
    // index 0 default required survives (false arm)
    expect(component.stages()[0].required).toBe(true);
  });

  it('updateStageTimeout leaves non-matching stages untouched', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.updateStageTimeout(0, 12);
    expect(component.stages()[0].timeout_hours).toBe(12);
    expect(component.stages()[1].timeout_hours).toBeNull();
  });

  it('updateStageInstructions leaves non-matching stages untouched', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.updateStageInstructions(1, 'Bring your CV');
    expect(component.stages()[1].instructions).toBe('Bring your CV');
    expect(component.stages()[0].instructions).toBe('');
  });

  it('updateStageConfig leaves non-matching stages untouched', () => {
    component.addStage('document_upload'); // 0
    component.addStage('assessment'); // 1
    component.updateStageConfig(0, { max_file_size_mb: 99 });
    expect(component.stages()[0].config.max_file_size_mb).toBe(99);
    // index 1 (assessment) config untouched — false arm of the ternary
    expect(component.stages()[1].config).toEqual({
      linked_assessment_id: undefined,
    });
  });

  // --- removeStage: `&&` left-operand short-circuit when nothing is selected ---
  // selectedStageIndex() === index is false (index is a number) AND the
  // `selectedStageIndex() !== null` left operand is false → no-op no-shift.

  it('removeStage is a no-op on selection when nothing is selected', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.selectedStageIndex.set(null);
    component.removeStage(0);
    expect(component.selectedStageIndex()).toBeNull();
    expect(component.stages().length).toBe(1);
    expect(component.stages()[0].type).toBe('interview');
  });

  // --- onStageDrop: selected set but outside both shift windows (final no-op) ---
  // selected !== previousIndex, NOT (selected > prev && selected <= curr),
  // NOT (selected < prev && selected >= curr) → index left unchanged.

  it('onStageDrop leaves the selected index unchanged when the move does not span it', () => {
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.addStage('decision'); // 2
    component.addStage('assessment'); // 3
    component.selectStage(3); // selection well past the moved range
    component.onStageDrop(dropEvent(0, 1)); // move 0->1, selected 3 untouched
    expect(component.selectedStageIndex()).toBe(3);
  });

  it('onStageDrop does not shift selection up when the later item lands at-or-after it', () => {
    // selected < previousIndex is TRUE but selected >= currentIndex is FALSE.
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.addStage('decision'); // 2
    component.selectStage(0); // selected 0
    component.onStageDrop(dropEvent(2, 1)); // 2->1, 0<2 true but 0>=1 false → no shift
    expect(component.selectedStageIndex()).toBe(0);
  });

  it('onStageDrop does not shift selection down when the earlier item lands before it', () => {
    // selected > previousIndex is TRUE but selected <= currentIndex is FALSE.
    component.addStage('form'); // 0
    component.addStage('interview'); // 1
    component.addStage('decision'); // 2
    component.selectStage(2); // selected 2
    component.onStageDrop(dropEvent(0, 1)); // 0->1, 2>0 true but 2<=1 false → no shift
    expect(component.selectedStageIndex()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// loadTemplate component-level error handler (dead via real HTTP — reachable
// only when the service observable actually errors). We swap in a stub service
// whose loadTemplate throws so the component's subscribe `error` branch runs.
// ---------------------------------------------------------------------------

describe('PipelineBuilderComponent — loadTemplate error branch', () => {
  let fixture: ComponentFixture<PipelineBuilderComponent>;
  let component: PipelineBuilderComponent;
  let toast: ToastService;

  const ROUTE_STUB = {
    snapshot: {
      paramMap: { get: (key: string) => (key === 'id' ? 'tmpl-err' : null) },
    },
  };

  class ThrowingAdmissionAdminService {
    loadTemplate(): Observable<PipelineTemplate | null> {
      return throwError(() => new Error('boom'));
    }
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PipelineBuilderComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: ROUTE_STUB },
        {
          provide: AdmissionAdminService,
          useClass: ThrowingAdmissionAdminService,
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PipelineBuilderComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
  });

  it('toasts the load error and clears loading when the service observable errors', () => {
    const toastSpy = vi.spyOn(toast, 'show');
    fixture.detectChanges(); // ngOnInit → loadTemplate → error

    expect(component.isEditing()).toBe(true);
    expect(component.loading()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith(
      'admin.admissions.template_load_error',
      'error',
    );
    // form never hydrated
    expect(component.templateName()).toBe('');
    expect(component.stages().length).toBe(0);
  });
});
