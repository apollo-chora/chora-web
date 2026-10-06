import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { StageCompletionComponent } from './stage-completion.component';
import { environment } from '../../../../../environments/environment';
import type { StageDetail } from '../../models/admission-learner.model';

// ---------------------------------------------------------------------------
// Original (pre-existing) suite — drives the component WITHOUT route params so
// ngOnInit never calls loadStageDetail (no HTTP). MUST stay green untouched.
// ---------------------------------------------------------------------------

describe('StageCompletionComponent', () => {
  let component: StageCompletionComponent;
  let fixture: ComponentFixture<StageCompletionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StageCompletionComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StageCompletionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with no stage detail', () => {
    expect(component.stageDetail()).toBeNull();
    expect(component.stageType()).toBeNull();
  });

  it('should track form field changes', () => {
    component.onFormFieldChange('field-1', 'test value');
    expect(component.formResponses()['field-1']).toBe('test value');
  });

  it('should select interview slot', () => {
    component.selectSlot('slot-123');
    expect(component.selectedSlotId()).toBe('slot-123');
  });

  it('should return correct scan status class', () => {
    const cleanDoc = {
      id: 'd1', filename: 'test.pdf', mime_type: 'application/pdf',
      size_bytes: 1024, scan_status: 'clean' as const, uploaded_at: '',
    };
    expect(component.getScanStatusClass(cleanDoc)).toBe('stage-completion__scan--clean');

    const rejectedDoc = { ...cleanDoc, scan_status: 'rejected' as const };
    expect(component.getScanStatusClass(rejectedDoc)).toBe('stage-completion__scan--rejected');

    const scanningDoc = { ...cleanDoc, scan_status: 'scanning' as const };
    expect(component.getScanStatusClass(scanningDoc)).toBe('stage-completion__scan--scanning');

    const pendingDoc = { ...cleanDoc, scan_status: 'pending' as const };
    expect(component.getScanStatusClass(pendingDoc)).toBe('stage-completion__scan--pending');
  });

  it('should not submit when canSubmit is false', () => {
    expect(component.canSubmit()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Augmented suite — drives the full load/render/interaction surface by
// providing a stub ActivatedRoute so ngOnInit loads stage detail over HTTP.
// ---------------------------------------------------------------------------

const APP_ID = 'pipe-1';
const STAGE_ID = 'stg-1';
const STAGE_URL = `${environment.bffBaseUrl}/api/v1/admissions/my-applications/${APP_ID}/stages/${STAGE_ID}`;

function makeStageDetail(overrides: Partial<StageDetail> = {}): StageDetail {
  return {
    stage_id: STAGE_ID,
    stage_name: 'Upload Transcript',
    stage_type: 'document_upload',
    instructions: 'Please upload your transcript.',
    documents: [],
    form_fields: [],
    form_responses: {},
    assessment_session_id: null,
    interview_slot: null,
    available_interview_slots: [],
    prerequisite_results: [],
    accepted_file_types: ['pdf', 'png'],
    max_file_size_mb: 5,
    ...overrides,
  };
}

/**
 * Build a fixture with a stub ActivatedRoute carrying pipelineId + stageId so
 * ngOnInit fires loadStageDetail → GET. The GET request is returned so callers
 * can flush success/error per scenario.
 */
function buildWithRoute(params: Record<string, string | null> = {
  pipelineId: APP_ID,
  stageId: STAGE_ID,
}): {
  fixture: ComponentFixture<StageCompletionComponent>;
  component: StageCompletionComponent;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [StageCompletionComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: {
              get: (key: string) => params[key] ?? null,
            },
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(StageCompletionComponent);
  const component = fixture.componentInstance;
  const httpMock = TestBed.inject(HttpTestingController);
  const element = fixture.nativeElement as HTMLElement;
  fixture.detectChanges(); // triggers ngOnInit → loadStageDetail
  return { fixture, component, httpMock, element };
}

describe('StageCompletionComponent — load + render', () => {
  it('renders the shell with back link and main region', () => {
    const { element, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail());
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="stage-completion"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="back-link"]')).not.toBeNull();
    httpMock.verify();
  });

  it('sets loading true while the GET is in flight, then false', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    expect(component.loading()).toBe(true);
    const req = httpMock.expectOne(STAGE_URL);
    expect(req.request.method).toBe('GET');
    req.flush(makeStageDetail());
    fixture.detectChanges();
    expect(component.loading()).toBe(false);
    httpMock.verify();
  });

  it('populates stageDetail and renders the title + instructions on success', () => {
    const { component, element, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail());
    fixture.detectChanges();
    expect(component.stageDetail()?.stage_name).toBe('Upload Transcript');
    const title = element.querySelector('[data-testid="stage-title"]');
    expect(title?.textContent).toContain('Upload Transcript');
    expect(element.textContent).toContain('Please upload your transcript.');
    httpMock.verify();
  });

  it('pre-fills form responses and selected slot from the loaded detail', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({
        stage_type: 'form',
        form_responses: { name: 'Ada' },
        interview_slot: {
          id: 'slot-x',
          start_time: '2026-06-10T09:00:00Z',
          end_time: '2026-06-10T09:30:00Z',
          location: null,
          meeting_url: null,
          booked: true,
        },
      }),
    );
    fixture.detectChanges();
    expect(component.formResponses()['name']).toBe('Ada');
    expect(component.selectedSlotId()).toBe('slot-x');
    httpMock.verify();
  });

  it('shows a toast and stops loading on a 500 error response', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock
      .expectOne(STAGE_URL)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(component.loading()).toBe(false);
    expect(component.stageDetail()).toBeNull();
    httpMock.verify();
  });

  it('does NOT fetch when route params are missing', () => {
    const { component, httpMock } = buildWithRoute({ pipelineId: null, stageId: null });
    httpMock.verify(); // no outstanding request
    expect(component.loading()).toBe(false);
    expect(component.pipelineId()).toBeNull();
  });
});

describe('StageCompletionComponent — stage type rendering', () => {
  function loadWith(detail: StageDetail) {
    const built = buildWithRoute();
    built.httpMock.expectOne(STAGE_URL).flush(detail);
    built.fixture.detectChanges();
    return built;
  }

  it('renders the document-upload section + drop zone', () => {
    const { element, httpMock } = loadWith(makeStageDetail({ stage_type: 'document_upload' }));
    expect(element.querySelector('[data-testid="document-upload-section"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="drop-zone"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="file-input"]')).not.toBeNull();
    httpMock.verify();
  });

  it('renders uploaded documents with scan badges', () => {
    const { element, httpMock } = loadWith(
      makeStageDetail({
        stage_type: 'document_upload',
        documents: [
          { id: 'd1', filename: 'cv.pdf', mime_type: 'application/pdf', size_bytes: 10, scan_status: 'clean', uploaded_at: '' },
        ],
      }),
    );
    expect(element.querySelector('[data-testid="uploaded-documents"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="doc-0"]')?.textContent).toContain('cv.pdf');
    httpMock.verify();
  });

  it('renders the form section with fields', () => {
    const { element, httpMock } = loadWith(
      makeStageDetail({
        stage_type: 'form',
        form_fields: [
          { id: 'f1', label: 'Full Name', type: 'text', required: true, options: [], placeholder: '', value: null },
          { id: 'f2', label: 'Bio', type: 'textarea', required: false, options: [], placeholder: '', value: null },
          { id: 'f3', label: 'Country', type: 'select', required: false, options: ['SG', 'MY'], placeholder: '', value: null },
          { id: 'f4', label: 'Agree', type: 'checkbox', required: false, options: [], placeholder: '', value: null },
          { id: 'f5', label: 'DOB', type: 'date', required: false, options: [], placeholder: '', value: null },
          { id: 'f6', label: 'Age', type: 'number', required: false, options: [], placeholder: '', value: null },
        ],
      }),
    );
    expect(element.querySelector('[data-testid="form-section"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="field-f1"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="field-f3"]')?.textContent).toContain('Country');
    httpMock.verify();
  });

  it('renders the assessment section with a launch button', () => {
    const { element, httpMock } = loadWith(
      makeStageDetail({ stage_type: 'assessment', assessment_session_id: 'sess-9' }),
    );
    expect(element.querySelector('[data-testid="assessment-section"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="launch-assessment-btn"]')).not.toBeNull();
    httpMock.verify();
  });

  it('renders available interview slots when none booked', () => {
    const { element, httpMock } = loadWith(
      makeStageDetail({
        stage_type: 'interview',
        available_interview_slots: [
          { id: 's1', start_time: '2026-06-10T09:00:00Z', end_time: '2026-06-10T09:30:00Z', location: 'Room A', meeting_url: null, booked: false },
          { id: 's2', start_time: '2026-06-10T10:00:00Z', end_time: '2026-06-10T10:30:00Z', location: null, meeting_url: null, booked: true },
        ],
      }),
    );
    expect(element.querySelector('[data-testid="interview-section"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="available-slots"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="slot-0"]')?.textContent).toContain('Room A');
    httpMock.verify();
  });

  it('renders the booked slot when one is already booked', () => {
    const { element, httpMock } = loadWith(
      makeStageDetail({
        stage_type: 'interview',
        interview_slot: {
          id: 's-booked',
          start_time: '2026-06-10T09:00:00Z',
          end_time: '2026-06-10T09:30:00Z',
          location: 'HQ',
          meeting_url: 'https://zoom.example/abc',
          booked: true,
        },
      }),
    );
    const booked = element.querySelector('[data-testid="booked-slot"]');
    expect(booked).not.toBeNull();
    expect(booked?.textContent).toContain('HQ');
    expect(booked?.querySelector('a')?.getAttribute('href')).toBe('https://zoom.example/abc');
    httpMock.verify();
  });

  it('renders prerequisite results + warning when a check fails', () => {
    const { element, httpMock } = loadWith(
      makeStageDetail({
        stage_type: 'prerequisite_check',
        prerequisite_results: [
          { id: 'p1', description: 'High school diploma', passed: true, detail: 'verified' },
          { id: 'p2', description: 'English test', passed: false, detail: 'missing' },
        ],
      }),
    );
    expect(element.querySelector('[data-testid="prerequisite-section"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="prereq-0"]')?.textContent).toContain('High school diploma');
    expect(element.querySelector('[data-testid="prereq-warning"]')).not.toBeNull();
    httpMock.verify();
  });

  it('renders the unknown-section fallback for an unrecognised stage type', () => {
    const { element, httpMock } = loadWith(
      makeStageDetail({ stage_type: 'decision' }),
    );
    expect(element.querySelector('[data-testid="unknown-section"]')).not.toBeNull();
    httpMock.verify();
  });

  it('renders validation errors when present', () => {
    const built = loadWith(makeStageDetail({ stage_type: 'assessment' }));
    built.component.validationErrors.set(['Field X is required']);
    built.fixture.detectChanges();
    const errs = built.element.querySelector('[data-testid="validation-errors"]');
    expect(errs?.textContent).toContain('Field X is required');
    built.httpMock.verify();
  });
});

describe('StageCompletionComponent — computed: canSubmit', () => {
  it('document_upload: false with no docs, true with docs', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail({ stage_type: 'document_upload' }));
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(false);

    component.stageDetail.set(
      makeStageDetail({
        stage_type: 'document_upload',
        documents: [{ id: 'd1', filename: 'a.pdf', mime_type: 'application/pdf', size_bytes: 1, scan_status: 'clean', uploaded_at: '' }],
      }),
    );
    expect(component.canSubmit()).toBe(true);
    httpMock.verify();
  });

  it('form: false until required fields are filled', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({
        stage_type: 'form',
        form_fields: [
          { id: 'r1', label: 'Name', type: 'text', required: true, options: [], placeholder: '', value: null },
          { id: 'o1', label: 'Notes', type: 'text', required: false, options: [], placeholder: '', value: null },
        ],
      }),
    );
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(false);

    component.onFormFieldChange('r1', 'Grace');
    expect(component.canSubmit()).toBe(true);
    httpMock.verify();
  });

  it('prerequisite_check: true only when all pass', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({
        stage_type: 'prerequisite_check',
        prerequisite_results: [
          { id: 'p1', description: 'a', passed: true, detail: '' },
          { id: 'p2', description: 'b', passed: false, detail: '' },
        ],
      }),
    );
    fixture.detectChanges();
    expect(component.allPrerequisitesPassed()).toBe(false);
    expect(component.canSubmit()).toBe(false);

    component.stageDetail.set(
      makeStageDetail({
        stage_type: 'prerequisite_check',
        prerequisite_results: [{ id: 'p1', description: 'a', passed: true, detail: '' }],
      }),
    );
    expect(component.allPrerequisitesPassed()).toBe(true);
    expect(component.canSubmit()).toBe(true);
    httpMock.verify();
  });

  it('interview: true when a slot is selected', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail({ stage_type: 'interview' }));
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(false);
    component.selectSlot('slot-1');
    expect(component.canSubmit()).toBe(true);
    httpMock.verify();
  });

  it('assessment: always true', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail({ stage_type: 'assessment' }));
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(true);
    httpMock.verify();
  });

  it('default (decision): true', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail({ stage_type: 'decision' }));
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(true);
    httpMock.verify();
  });

  it('computed accessors fall back to defaults when no detail', () => {
    const { component, httpMock } = buildWithRoute({ pipelineId: null, stageId: null });
    expect(component.documents()).toEqual([]);
    expect(component.formFields()).toEqual([]);
    expect(component.interviewSlots()).toEqual([]);
    expect(component.bookedSlot()).toBeNull();
    expect(component.prerequisiteResults()).toEqual([]);
    expect(component.acceptedTypes()).toEqual([]);
    expect(component.maxFileSizeMb()).toBe(10);
    expect(component.canSubmit()).toBe(false);
    httpMock.verify();
  });
});

describe('StageCompletionComponent — document upload', () => {
  function makeFile(name: string, sizeBytes: number): File {
    const file = new File(['x'], name, { type: 'application/pdf' });
    Object.defineProperty(file, 'size', { value: sizeBytes });
    return file;
  }

  function loadUploadStage() {
    const built = buildWithRoute();
    built.httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({ stage_type: 'document_upload', accepted_file_types: ['pdf'], max_file_size_mb: 1 }),
    );
    built.fixture.detectChanges();
    return built;
  }

  it('rejects an oversized file without making an HTTP call', () => {
    const { component, httpMock, fixture } = loadUploadStage();
    const tooBig = makeFile('big.pdf', 2 * 1024 * 1024); // 2MB > 1MB max
    const event = { target: { files: [tooBig] } } as unknown as Event;
    component.onFileSelected(event);
    fixture.detectChanges();
    expect(component.uploading()).toBe(false);
    httpMock.verify(); // no POST to documents
  });

  it('rejects a disallowed file type without making an HTTP call', () => {
    const { component, httpMock, fixture } = loadUploadStage();
    const wrongType = makeFile('notes.txt', 100);
    const event = { target: { files: [wrongType] } } as unknown as Event;
    component.onFileSelected(event);
    fixture.detectChanges();
    expect(component.uploading()).toBe(false);
    httpMock.verify();
  });

  it('uploads a valid file and appends the returned document', () => {
    const { component, httpMock, fixture } = loadUploadStage();
    const ok = makeFile('transcript.pdf', 500);
    component.onFileSelected({ target: { files: [ok] } } as unknown as Event);
    expect(component.uploading()).toBe(true);
    expect(component.uploadProgress()).toBe('transcript.pdf');

    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/admissions/my-applications/${APP_ID}/stages/${STAGE_ID}/documents`,
    );
    expect(req.request.method).toBe('POST');
    req.flush({
      id: 'doc-new',
      filename: 'transcript.pdf',
      mime_type: 'application/pdf',
      size_bytes: 500,
      scan_status: 'pending',
      uploaded_at: '2026-06-04T00:00:00Z',
    });
    fixture.detectChanges();

    expect(component.uploading()).toBe(false);
    expect(component.uploadProgress()).toBeNull();
    expect(component.documents().length).toBe(1);
    expect(component.documents()[0].id).toBe('doc-new');
    httpMock.verify();
  });

  it('clears uploading state and toasts on an upload error', () => {
    const { component, httpMock, fixture } = loadUploadStage();
    const ok = makeFile('transcript.pdf', 500);
    component.onFileSelected({ target: { files: [ok] } } as unknown as Event);

    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/admissions/my-applications/${APP_ID}/stages/${STAGE_ID}/documents`)
      .flush({ error: 'scan failed' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.uploading()).toBe(false);
    expect(component.uploadProgress()).toBeNull();
    expect(component.documents().length).toBe(0);
    httpMock.verify();
  });

  it('ignores onFileSelected when no file is chosen', () => {
    const { component, httpMock } = loadUploadStage();
    component.onFileSelected({ target: { files: [] } } as unknown as Event);
    expect(component.uploading()).toBe(false);
    httpMock.verify();
  });

  it('onDrop uploads the dropped file', () => {
    const { component, httpMock } = loadUploadStage();
    const ok = makeFile('dropped.pdf', 300);
    const dropEvent = {
      preventDefault: () => { /* noop */ },
      stopPropagation: () => { /* noop */ },
      dataTransfer: { files: [ok] },
    } as unknown as DragEvent;
    component.onDrop(dropEvent);
    expect(component.dragOver()).toBe(false);
    expect(component.uploading()).toBe(true);
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/admissions/my-applications/${APP_ID}/stages/${STAGE_ID}/documents`)
      .flush(null);
    httpMock.verify();
  });

  it('onDrop with no files leaves upload idle', () => {
    const { component, httpMock } = loadUploadStage();
    const dropEvent = {
      preventDefault: () => { /* noop */ },
      stopPropagation: () => { /* noop */ },
      dataTransfer: { files: [] },
    } as unknown as DragEvent;
    component.onDrop(dropEvent);
    expect(component.uploading()).toBe(false);
    httpMock.verify();
  });

  it('onDragOver sets dragOver, onDragLeave clears it', () => {
    const { component, httpMock } = loadUploadStage();
    const evt = { preventDefault: () => { /* noop */ }, stopPropagation: () => { /* noop */ } } as unknown as DragEvent;
    component.onDragOver(evt);
    expect(component.dragOver()).toBe(true);
    component.onDragLeave(evt);
    expect(component.dragOver()).toBe(false);
    httpMock.verify();
  });

  it('onKeyActivateUpload triggers a click on Enter/Space, ignores others', () => {
    const { component, httpMock } = loadUploadStage();
    let clicked = 0;
    component.fileInputRef = {
      nativeElement: { click: () => clicked++ },
    } as unknown as typeof component.fileInputRef;

    component.onKeyActivateUpload({ key: 'Enter', preventDefault: () => { /* noop */ } } as KeyboardEvent);
    component.onKeyActivateUpload({ key: ' ', preventDefault: () => { /* noop */ } } as KeyboardEvent);
    component.onKeyActivateUpload({ key: 'a', preventDefault: () => { /* noop */ } } as KeyboardEvent);
    expect(clicked).toBe(2);
    httpMock.verify();
  });

  it('uploadFile is a no-op when app/stage id missing', () => {
    const { component, httpMock } = buildWithRoute({ pipelineId: null, stageId: null });
    // No detail loaded; onDrop drives uploadFile which should early-return.
    const ok = makeFile('x.pdf', 100);
    component.onDrop({
      preventDefault: () => { /* noop */ },
      stopPropagation: () => { /* noop */ },
      dataTransfer: { files: [ok] },
    } as unknown as DragEvent);
    expect(component.uploading()).toBe(false);
    httpMock.verify();
  });
});

describe('StageCompletionComponent — submit + navigation', () => {
  it('submits a form stage with form_responses and navigates on success', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({
        stage_type: 'form',
        form_fields: [{ id: 'r1', label: 'Name', type: 'text', required: true, options: [], placeholder: '', value: null }],
      }),
    );
    fixture.detectChanges();
    component.onFormFieldChange('r1', 'Linus');

    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.submitStage();
    expect(component.submitting()).toBe(true);

    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/admissions/my-applications/${APP_ID}/stages/${STAGE_ID}/submit`,
    );
    expect(req.request.method).toBe('POST');
    expect(req.request.body.stage_id).toBe(STAGE_ID);
    expect(req.request.body.form_responses).toEqual({ r1: 'Linus' });
    expect(req.request.body.interview_slot_id).toBeUndefined();
    req.flush({ id: 'app-1', pipeline_id: APP_ID, pipeline_name: 'P', programme_name: null, stages: [], current_stage_index: 0, started_at: '', updated_at: '' });
    fixture.detectChanges();

    expect(component.submitting()).toBe(false);
    expect(navSpy).toHaveBeenCalledWith(['/admissions/apply', APP_ID]);
    httpMock.verify();
  });

  it('submits an interview stage with interview_slot_id', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail({ stage_type: 'interview' }));
    fixture.detectChanges();
    component.selectSlot('slot-77');

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.submitStage();
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/admissions/my-applications/${APP_ID}/stages/${STAGE_ID}/submit`,
    );
    expect(req.request.body.interview_slot_id).toBe('slot-77');
    expect(req.request.body.form_responses).toBeUndefined();
    req.flush(null); // null result → submit_error path, no nav
    fixture.detectChanges();
    expect(component.submitting()).toBe(false);
    httpMock.verify();
  });

  it('clears submitting and toasts on a submit HTTP error', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail({ stage_type: 'assessment' }));
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.submitStage();
    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/admissions/my-applications/${APP_ID}/stages/${STAGE_ID}/submit`)
      .flush({ error: 'nope' }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(component.submitting()).toBe(false);
    expect(navSpy).not.toHaveBeenCalled();
    httpMock.verify();
  });

  it('does not submit when canSubmit is false', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({
        stage_type: 'form',
        form_fields: [{ id: 'r1', label: 'Name', type: 'text', required: true, options: [], placeholder: '', value: null }],
      }),
    );
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(false);
    component.submitStage();
    expect(component.submitting()).toBe(false);
    httpMock.verify(); // no submit POST
  });

  it('does not double-submit while already submitting', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail({ stage_type: 'assessment' }));
    fixture.detectChanges();

    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    component.submitStage(); // fires the POST
    const first = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/admissions/my-applications/${APP_ID}/stages/${STAGE_ID}/submit`,
    );
    component.submitStage(); // submitting() true → guarded, no second POST
    first.flush(null);
    fixture.detectChanges();
    httpMock.verify();
  });

  it('launchAssessment navigates when a session id is present', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({ stage_type: 'assessment', assessment_session_id: 'sess-42' }),
    );
    fixture.detectChanges();
    const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.launchAssessment();
    expect(navSpy).toHaveBeenCalledWith(['/learning/assessment', 'sess-42']);
    httpMock.verify();
  });

  it('launchAssessment is a no-op without a session id', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({ stage_type: 'assessment', assessment_session_id: null }),
    );
    fixture.detectChanges();
    const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.launchAssessment();
    expect(navSpy).not.toHaveBeenCalled();
    httpMock.verify();
  });

  it('goBack navigates to the pipeline apply route', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail());
    fixture.detectChanges();
    const navSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.goBack();
    expect(navSpy).toHaveBeenCalledWith(['/admissions/apply', APP_ID]);
    httpMock.verify();
  });
});

describe('StageCompletionComponent — trackBy helpers', () => {
  let component: StageCompletionComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [StageCompletionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    component = TestBed.createComponent(StageCompletionComponent).componentInstance;
  });

  it('trackByDocId returns the doc id', () => {
    expect(
      component.trackByDocId(0, { id: 'd9', filename: '', mime_type: '', size_bytes: 0, scan_status: 'clean', uploaded_at: '' }),
    ).toBe('d9');
  });

  it('trackByFieldId returns the field id', () => {
    expect(
      component.trackByFieldId(0, { id: 'fz', label: '', type: 'text', required: false, options: [], placeholder: '', value: null }),
    ).toBe('fz');
  });

  it('trackBySlotId returns the slot id', () => {
    expect(
      component.trackBySlotId(0, { id: 's5', start_time: '', end_time: '', location: null, meeting_url: null, booked: false }),
    ).toBe('s5');
  });

  it('trackByResultId returns the result id', () => {
    expect(
      component.trackByResultId(0, { id: 'r3', description: '', passed: true, detail: '' }),
    ).toBe('r3');
  });

  it('ngOnDestroy unsubscribes without error', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Augmented suite (branch-coverage top-up) — targets the conditional arms the
// suites above leave uncovered. No source changes; characterization only.
// ---------------------------------------------------------------------------

describe('StageCompletionComponent — uncovered branch arms', () => {
  // loadStageDetail next handler: `if (detail)` FALSE arm (server returns null
  // body). State must stay null while loading flips back to false.
  it('handles a null stage-detail body without populating state', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(null);
    fixture.detectChanges();
    expect(component.stageDetail()).toBeNull();
    expect(component.loading()).toBe(false);
    httpMock.verify();
  });

  // loadStageDetail: detail present but WITHOUT form_responses / interview_slot
  // — exercises the FALSE arm of both inner `if` guards (no pre-fill happens).
  it('does not pre-fill when the detail omits form_responses and interview_slot', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({
        stage_type: 'form',
        // form_responses cast to a falsy value to drive the `if (...)` FALSE arm.
        form_responses: undefined as unknown as Record<string, unknown>,
        interview_slot: null,
      }),
    );
    fixture.detectChanges();
    expect(component.formResponses()).toEqual({});
    expect(component.selectedSlotId()).toBeNull();
    httpMock.verify();
  });

  // canSubmit interview branch: the SECOND OR arm — selectedSlotId is null but a
  // slot is already booked (bookedSlot() !== null).
  it('canSubmit interview: true via booked slot alone (selectedSlotId null)', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(makeStageDetail({ stage_type: 'interview' }));
    fixture.detectChanges();
    // Set a detail whose interview_slot is booked, WITHOUT touching selectedSlotId.
    component.stageDetail.set(
      makeStageDetail({
        stage_type: 'interview',
        interview_slot: {
          id: 's-booked',
          start_time: '',
          end_time: '',
          location: null,
          meeting_url: null,
          booked: true,
        },
      }),
    );
    expect(component.selectedSlotId()).toBeNull();
    expect(component.bookedSlot()).not.toBeNull();
    expect(component.canSubmit()).toBe(true);
    httpMock.verify();
  });

  // uploadFile: `acceptedTypes().length > 0` FALSE arm — when no accepted types
  // are configured the type check is skipped and the upload proceeds.
  it('uploads any extension when accepted_file_types is empty', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({
        stage_type: 'document_upload',
        accepted_file_types: [],
        max_file_size_mb: 10,
      }),
    );
    fixture.detectChanges();

    const odd = new File(['x'], 'archive.xyz', { type: 'application/octet-stream' });
    Object.defineProperty(odd, 'size', { value: 100 });
    component.onFileSelected({ target: { files: [odd] } } as unknown as Event);

    // Type check skipped → upload starts.
    expect(component.uploading()).toBe(true);
    httpMock
      .expectOne(
        `${environment.bffBaseUrl}/api/v1/admissions/my-applications/${APP_ID}/stages/${STAGE_ID}/documents`,
      )
      .flush(null);
    httpMock.verify();
  });

  // uploadFile: file name with NO extension exercises the `?? ''` / `?.toLowerCase`
  // path against a non-empty accepted-types list (extension '' not in list → reject).
  it('rejects an extensionless file when accepted types are configured', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({
        stage_type: 'document_upload',
        accepted_file_types: ['pdf'],
        max_file_size_mb: 10,
      }),
    );
    fixture.detectChanges();

    const noExt = new File(['x'], 'README', { type: 'text/plain' });
    Object.defineProperty(noExt, 'size', { value: 50 });
    component.onFileSelected({ target: { files: [noExt] } } as unknown as Event);

    expect(component.uploading()).toBe(false);
    httpMock.verify(); // no POST — rejected on type mismatch
  });

  // onKeyActivateUpload: the `fileInputRef?.nativeElement?.click()` optional-chain
  // SHORT-CIRCUIT — fileInputRef is undefined, so no throw and nothing clicked.
  it('onKeyActivateUpload is safe when fileInputRef is undefined', () => {
    const { component, httpMock } = buildWithRoute({ pipelineId: null, stageId: null });
    // fileInputRef is a ViewChild that is never resolved here (no upload section rendered).
    expect(() =>
      component.onKeyActivateUpload({ key: 'Enter', preventDefault: () => { /* noop */ } } as KeyboardEvent),
    ).not.toThrow();
    httpMock.verify();
  });

  // onFileSelected: `input.files` null (not an empty list) — FALSE arm of the guard.
  it('ignores onFileSelected when files is null', () => {
    const { component, httpMock } = buildWithRoute({ pipelineId: null, stageId: null });
    component.onFileSelected({ target: { files: null } } as unknown as Event);
    expect(component.uploading()).toBe(false);
    httpMock.verify();
  });

  // onDrop: `event.dataTransfer?.files` short-circuit when dataTransfer is null.
  it('onDrop with null dataTransfer leaves upload idle', () => {
    const { component, httpMock } = buildWithRoute({ pipelineId: null, stageId: null });
    component.onDrop({
      preventDefault: () => { /* noop */ },
      stopPropagation: () => { /* noop */ },
      dataTransfer: null,
    } as unknown as DragEvent);
    expect(component.uploading()).toBe(false);
    expect(component.dragOver()).toBe(false);
    httpMock.verify();
  });

  // areRequiredFieldsFilled: distinct falsy arms — a required field whose value is
  // the empty string ('' fails) and another whose value is explicitly null.
  it('canSubmit form: required field with empty-string or null value is unfilled', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({
        stage_type: 'form',
        form_fields: [
          { id: 'r1', label: 'Name', type: 'text', required: true, options: [], placeholder: '', value: null },
        ],
        form_responses: { r1: '' }, // empty string → unfilled
      }),
    );
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(false);

    component.onFormFieldChange('r1', null); // null → still unfilled
    expect(component.canSubmit()).toBe(false);

    component.onFormFieldChange('r1', 'Maya'); // filled
    expect(component.canSubmit()).toBe(true);
    httpMock.verify();
  });

  // submitStage interview branch: `this.selectedSlotId() ?? undefined` nullish arm —
  // an interview stage submitted with NO slot selected sends interview_slot_id undefined.
  // canSubmit is forced true via a pre-booked slot so the guard does not short-circuit.
  it('submits an interview stage with undefined slot id when none is selected', () => {
    const { component, httpMock, fixture } = buildWithRoute();
    httpMock.expectOne(STAGE_URL).flush(
      makeStageDetail({
        stage_type: 'interview',
        interview_slot: {
          id: 's-booked',
          start_time: '',
          end_time: '',
          location: null,
          meeting_url: null,
          booked: true,
        },
      }),
    );
    fixture.detectChanges();
    // bookedSlot satisfies canSubmit; selectedSlotId stays null after load? It is
    // pre-filled from interview_slot, so clear it to drive the `?? undefined` arm.
    component.selectedSlotId.set(null);
    expect(component.canSubmit()).toBe(true);

    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.submitStage();
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}/api/v1/admissions/my-applications/${APP_ID}/stages/${STAGE_ID}/submit`,
    );
    expect(req.request.body.interview_slot_id).toBeUndefined();
    req.flush(null);
    fixture.detectChanges();
    expect(component.submitting()).toBe(false);
    httpMock.verify();
  });

  // submitStage early-return: app/stage ids missing. Force canSubmit true so the
  // FIRST guard passes, then the `if (!appId || !stgId) return` guard fires.
  it('submitStage early-returns when app/stage ids are missing', () => {
    const { component, httpMock, fixture } = buildWithRoute({ pipelineId: null, stageId: null });
    // No load happened (null params). Force an assessment detail (canSubmit true)
    // while applicationId()/stageId() remain null.
    component.stageDetail.set(makeStageDetail({ stage_type: 'assessment' }));
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(true);
    expect(component.applicationId()).toBeNull();
    component.submitStage();
    expect(component.submitting()).toBe(false);
    httpMock.verify(); // no submit POST
  });
});
