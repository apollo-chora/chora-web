import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { DecisionPanelComponent } from './decision-panel.component';
import { AdmissionAdminService } from '../../services/admission-admin.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../../environments/environment';
import type {
  ApplicationSummary,
  ApplicationDetail,
  ApplicationDecision,
  ReviewerNote,
} from '../../models/admission.model';

const APPS_URL = `${environment.bffBaseUrl}/api/v1/admissions/applications`;

function makeSummary(over: Partial<ApplicationSummary> = {}): ApplicationSummary {
  return {
    id: 'app-1',
    pipeline_id: 'pipe-1',
    pipeline_name: 'STEM Fellowship 2026',
    learner_gcid: 'gcid-1',
    learner_name: 'Ada Lovelace',
    programme_name: 'Advanced Computing',
    status: 'under_review',
    current_stage_id: 'stage-2',
    current_stage_name: 'Assessment',
    completed_stages: 2,
    total_stages: 4,
    submitted_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-02T00:00:00Z',
    ...over,
  };
}

function makeDetail(over: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    ...makeSummary(),
    stages: [
      {
        stage_id: 'stage-1',
        stage_name: 'Document Upload',
        stage_type: 'document_upload',
        status: 'completed',
        documents: [
          {
            id: 'doc-1',
            filename: 'transcript.pdf',
            mime_type: 'application/pdf',
            size_bytes: 12000,
            uploaded_at: '2026-05-01T00:00:00Z',
            preview_url: 'https://files.example/doc-1',
          },
        ],
        assessment_score: null,
        form_responses: null,
        completed_at: '2026-05-01T01:00:00Z',
      },
      {
        stage_id: 'stage-2',
        stage_name: 'Assessment',
        stage_type: 'assessment',
        status: 'completed',
        documents: [],
        assessment_score: 88,
        form_responses: null,
        completed_at: '2026-05-01T02:00:00Z',
      },
    ],
    decision: null,
    reviewer_notes: [],
    ...over,
  };
}

function makeDecision(over: Partial<ApplicationDecision> = {}): ApplicationDecision {
  return {
    id: 'dec-1',
    application_id: 'app-1',
    decision: 'approved',
    reason_code: null,
    reason_detail: null,
    reviewer_gcid: 'rev-1',
    reviewer_name: 'Reviewer One',
    decided_at: '2026-05-03T00:00:00Z',
    next_intake_date: null,
    ...over,
  };
}

function makeNote(over: Partial<ReviewerNote> = {}): ReviewerNote {
  return {
    id: 'note-1',
    reviewer_gcid: 'rev-1',
    reviewer_name: 'Reviewer One',
    note: 'Strong candidate.',
    created_at: '2026-05-03T00:00:00Z',
    ...over,
  };
}

describe('DecisionPanelComponent', () => {
  let component: DecisionPanelComponent;
  let fixture: ComponentFixture<DecisionPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisionPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DecisionPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with no selection', () => {
    expect(component.selectedApplication()).toBeNull();
    expect(component.hasSelection()).toBe(false);
  });

  it('should toggle bulk mode', () => {
    expect(component.bulkMode()).toBe(false);
    component.toggleBulkMode();
    expect(component.bulkMode()).toBe(true);
    component.toggleBulkMode();
    expect(component.bulkMode()).toBe(false);
  });

  it('should clear bulk selections when exiting bulk mode', () => {
    component.toggleBulkMode();
    component.toggleBulkSelect('app-1');
    component.toggleBulkSelect('app-2');
    expect(component.bulkSelectedCount()).toBe(2);

    component.toggleBulkMode();
    expect(component.bulkSelectedCount()).toBe(0);
  });

  it('should toggle bulk selection for individual apps', () => {
    component.toggleBulkMode();
    component.toggleBulkSelect('app-1');
    expect(component.isBulkSelected('app-1')).toBe(true);

    component.toggleBulkSelect('app-1');
    expect(component.isBulkSelected('app-1')).toBe(false);
  });

  it('should return correct status classes', () => {
    expect(component.getStatusClass('in_progress')).toBe('decision-panel__status--in-progress');
    expect(component.getStatusClass('under_review')).toBe('decision-panel__status--under-review');
    expect(component.getStatusClass('decided')).toBe('decision-panel__status--decided');
    expect(component.getStatusClass('withdrawn')).toBe('decision-panel__status--withdrawn');
    expect(component.getStatusClass('unknown')).toBe('decision-panel__status--default');
  });
});

// ---------------------------------------------------------------------------
// Augmented coverage — HTTP-driven via HttpTestingController. The component
// loads applications in ngOnInit (first detectChanges). The AdmissionAdmin
// service goes through BffClientService → real HttpClient.
// ---------------------------------------------------------------------------
describe('DecisionPanelComponent — applications queue', () => {
  let fixture: ComponentFixture<DecisionPanelComponent>;
  let component: DecisionPanelComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DecisionPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(DecisionPanelComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders the shell with title + bulk toggle before data loads', () => {
    // ngOnInit fires loadApplications → loading() true → skeleton shown
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="decision-panel"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="review-title"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="bulk-mode-toggle"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="review-loading"]')).not.toBeNull();
    expect(component.loading()).toBe(true);

    httpMock.expectOne(APPS_URL).flush([]);
    fixture.detectChanges();
  });

  it('issues a GET to the applications path and populates the queue on success', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(APPS_URL);
    expect(req.request.method).toBe('GET');
    req.flush([makeSummary({ id: 'app-1' }), makeSummary({ id: 'app-2', learner_name: 'Grace Hopper' })]);
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.applications().length).toBe(2);
    const items = element.querySelectorAll('[data-testid^="queue-item-"]');
    expect(items.length).toBe(2);
    expect(element.textContent).toContain('Ada Lovelace');
    expect(element.textContent).toContain('Grace Hopper');
  });

  it('renders the empty-queue state when no applications come back', () => {
    fixture.detectChanges();
    httpMock.expectOne(APPS_URL).flush([]);
    fixture.detectChanges();

    expect(component.applications().length).toBe(0);
    expect(element.querySelector('[data-testid="empty-queue"]')).not.toBeNull();
    // With no selection, the detail pane shows the no-selection prompt.
    expect(element.querySelector('[data-testid="no-selection"]')).not.toBeNull();
  });

  it('does not overwrite the list when the GET resolves to null (404)', () => {
    // Service swallows HTTP errors → of(null); the component "next" runs with
    // apps == null, so applications() stays at its initial empty array and
    // loading flips false (no error toast, no list mutation).
    fixture.detectChanges();
    httpMock
      .expectOne(APPS_URL)
      .flush({ error: 'not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.applications()).toEqual([]);
  });
});

describe('DecisionPanelComponent — application detail', () => {
  let fixture: ComponentFixture<DecisionPanelComponent>;
  let component: DecisionPanelComponent;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DecisionPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(DecisionPanelComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    // initial list load
    fixture.detectChanges();
    httpMock.expectOne(APPS_URL).flush([makeSummary({ id: 'app-1' })]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('loads + renders detail (learner info, stages, score, documents) on selectApplication', () => {
    component.selectApplication(makeSummary({ id: 'app-1' }));
    expect(component.selectedApplicationId()).toBe('app-1');
    expect(component.loadingDetail()).toBe(true);

    const detailReq = httpMock.expectOne(`${APPS_URL}/app-1`);
    expect(detailReq.request.method).toBe('GET');
    detailReq.flush(makeDetail());
    fixture.detectChanges();

    expect(component.loadingDetail()).toBe(false);
    expect(component.selectedApplication()).not.toBeNull();
    expect(component.hasSelection()).toBe(true);

    expect(element.querySelector('[data-testid="learner-info"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="stages-summary"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="documents-section"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="decision-actions"]')).not.toBeNull();
    // assessment score rendered
    expect(element.textContent).toContain('88');
    // document filename rendered
    expect(element.textContent).toContain('transcript.pdf');
  });

  it('does NOT load detail when in bulk mode (selectApplication is a no-op)', () => {
    component.toggleBulkMode();
    component.selectApplication(makeSummary({ id: 'app-1' }));
    expect(component.selectedApplicationId()).toBeNull();
    expect(component.loadingDetail()).toBe(false);
    // verify() in afterEach asserts no detail GET was issued
  });

  it('keeps selection null when the detail GET resolves null (500 swallowed)', () => {
    component.selectApplication(makeSummary({ id: 'app-1' }));
    httpMock
      .expectOne(`${APPS_URL}/app-1`)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.loadingDetail()).toBe(false);
    expect(component.selectedApplication()).toBeNull();
  });
});

describe('DecisionPanelComponent — decisions (single)', () => {
  let fixture: ComponentFixture<DecisionPanelComponent>;
  let component: DecisionPanelComponent;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DecisionPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(DecisionPanelComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    // initial list load
    fixture.detectChanges();
    httpMock.expectOne(APPS_URL).flush([makeSummary({ id: 'app-1' })]);
    fixture.detectChanges();
    // select the application
    component.selectApplication(makeSummary({ id: 'app-1' }));
    httpMock.expectOne(`${APPS_URL}/app-1`).flush(makeDetail());
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('is a no-op when no application is selected', () => {
    component.selectedApplication.set(null);
    const spy = vi.spyOn(toast, 'show');
    component.makeDecision('approved');
    expect(component.deciding()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    // no POST issued (verify in afterEach)
  });

  it('POSTs an approve decision, toasts success, clears selection, and refetches', () => {
    const spy = vi.spyOn(toast, 'show');
    component.makeDecision('approved');
    expect(component.deciding()).toBe(true);

    const post = httpMock.expectOne(`${APPS_URL}/app-1/decision`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      decision: 'approved',
      reason_code: null,
      reason_detail: null,
    });
    post.flush(makeDecision({ decision: 'approved' }));

    expect(component.deciding()).toBe(false);
    expect(spy).toHaveBeenCalledWith('admin.admissions.decision_recorded', 'success');
    expect(component.selectedApplication()).toBeNull();
    expect(component.selectedApplicationId()).toBeNull();

    // refetch fires (loadApplications again)
    httpMock.expectOne(APPS_URL).flush([]);
    fixture.detectChanges();
  });

  it('includes reason_code + reason_detail when rejecting', () => {
    component.rejectReasonCode.set('ineligible');
    component.rejectReasonDetail.set('Below cutoff');
    component.makeDecision('rejected');

    const post = httpMock.expectOne(`${APPS_URL}/app-1/decision`);
    expect(post.request.body).toEqual({
      decision: 'rejected',
      reason_code: 'ineligible',
      reason_detail: 'Below cutoff',
    });
    post.flush(makeDecision({ decision: 'rejected', reason_code: 'ineligible' }));

    // form reset after success
    expect(component.rejectReasonCode()).toBeNull();
    expect(component.rejectReasonDetail()).toBe('');

    httpMock.expectOne(APPS_URL).flush([]);
    fixture.detectChanges();
  });

  it('sends null reason_detail when rejecting with an empty detail string', () => {
    component.rejectReasonCode.set('other');
    component.rejectReasonDetail.set('');
    component.makeDecision('rejected');

    const post = httpMock.expectOne(`${APPS_URL}/app-1/decision`);
    expect(post.request.body).toEqual({
      decision: 'rejected',
      reason_code: 'other',
      reason_detail: null,
    });
    post.flush(makeDecision({ decision: 'rejected' }));
    httpMock.expectOne(APPS_URL).flush([]);
    fixture.detectChanges();
  });

  it('toasts an error and does NOT refetch when the decision POST fails (service swallows → null)', () => {
    const spy = vi.spyOn(toast, 'show');
    component.makeDecision('deferred');

    httpMock
      .expectOne(`${APPS_URL}/app-1/decision`)
      .flush({ error: 'denied' }, { status: 403, statusText: 'Forbidden' });

    expect(component.deciding()).toBe(false);
    expect(spy).toHaveBeenCalledWith('admin.admissions.decision_error', 'error');
    // selection stays (no success path) and NO refetch GET fired
    expect(component.selectedApplication()).not.toBeNull();
  });
});

describe('DecisionPanelComponent — bulk decisions', () => {
  let fixture: ComponentFixture<DecisionPanelComponent>;
  let component: DecisionPanelComponent;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DecisionPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(DecisionPanelComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne(APPS_URL).flush([makeSummary({ id: 'app-1' }), makeSummary({ id: 'app-2' })]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('is a no-op when bulk mode is on but nothing is selected', () => {
    component.toggleBulkMode();
    const spy = vi.spyOn(toast, 'show');
    component.makeDecision('approved');
    expect(component.deciding()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    // no bulk-decision POST (verify in afterEach)
  });

  it('POSTs the bulk-decision payload, toasts success, clears selection, refetches', () => {
    component.toggleBulkMode();
    component.toggleBulkSelect('app-1');
    component.toggleBulkSelect('app-2');
    fixture.detectChanges();

    const spy = vi.spyOn(toast, 'show');
    component.makeDecision('approved');
    expect(component.deciding()).toBe(true);

    const post = httpMock.expectOne(`${APPS_URL}/bulk-decision`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      application_ids: ['app-1', 'app-2'],
      decision: 'approved',
      reason_code: null,
      reason_detail: null,
    });
    post.flush([makeDecision({ application_id: 'app-1' }), makeDecision({ application_id: 'app-2' })]);

    expect(component.deciding()).toBe(false);
    expect(spy).toHaveBeenCalledWith('admin.admissions.bulk_decision_recorded', 'success');
    expect(component.bulkSelectedCount()).toBe(0);

    httpMock.expectOne(APPS_URL).flush([]);
    fixture.detectChanges();
  });

  it('renders the bulk-actions panel when bulk mode has selections', () => {
    component.toggleBulkMode();
    component.toggleBulkSelect('app-1');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="bulk-actions"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="bulk-approve-btn"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="bulk-reject-btn"]')).not.toBeNull();
  });

  it('toasts an error when the bulk-decision POST fails (service swallows → null)', () => {
    component.toggleBulkMode();
    component.toggleBulkSelect('app-1');
    const spy = vi.spyOn(toast, 'show');
    component.makeDecision('rejected');

    httpMock
      .expectOne(`${APPS_URL}/bulk-decision`)
      .flush({ error: 'nope' }, { status: 500, statusText: 'Server Error' });

    expect(component.deciding()).toBe(false);
    expect(spy).toHaveBeenCalledWith('admin.admissions.decision_error', 'error');
    // selection NOT cleared on failure
    expect(component.bulkSelectedCount()).toBe(1);
  });
});

describe('DecisionPanelComponent — reviewer notes', () => {
  let fixture: ComponentFixture<DecisionPanelComponent>;
  let component: DecisionPanelComponent;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DecisionPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(DecisionPanelComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
    httpMock.expectOne(APPS_URL).flush([makeSummary({ id: 'app-1' })]);
    fixture.detectChanges();
    component.selectApplication(makeSummary({ id: 'app-1' }));
    httpMock.expectOne(`${APPS_URL}/app-1`).flush(makeDetail());
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('is a no-op when the note is blank', () => {
    component.reviewerNote.set('   ');
    component.addNote();
    expect(component.addingNote()).toBe(false);
    // no POST (verify in afterEach)
  });

  it('is a no-op when no application is selected', () => {
    component.selectedApplication.set(null);
    component.reviewerNote.set('A note');
    component.addNote();
    expect(component.addingNote()).toBe(false);
  });

  it('POSTs the note, appends it to the detail, and clears the input on success', () => {
    component.reviewerNote.set('  Looks great  ');
    component.addNote();
    expect(component.addingNote()).toBe(true);

    const post = httpMock.expectOne(`${APPS_URL}/app-1/notes`);
    expect(post.request.method).toBe('POST');
    // note is trimmed before send
    expect(post.request.body).toEqual({ note: 'Looks great' });
    post.flush(makeNote({ id: 'note-1', note: 'Looks great' }));

    expect(component.addingNote()).toBe(false);
    expect(component.selectedApplication()?.reviewer_notes.length).toBe(1);
    expect(component.selectedApplication()?.reviewer_notes[0].id).toBe('note-1');
    expect(component.reviewerNote()).toBe('');
  });

  it('silently no-ops (no toast, note NOT appended) when the note POST returns null via HTTP error', () => {
    // The service catches the HTTP error → of(null), so addNote's `next` runs
    // with result == null: addingNote flips false, but the `if (result)` guard
    // skips the append AND the input clear. No error toast is shown on this
    // path (the `error:` handler is only reached if the service truly throws —
    // see the "service error branches" suite). Characterizing actual behavior.
    const spy = vi.spyOn(toast, 'show');
    component.reviewerNote.set('Will fail');
    component.addNote();

    httpMock
      .expectOne(`${APPS_URL}/app-1/notes`)
      .flush({ error: 'oops' }, { status: 500, statusText: 'Server Error' });

    expect(component.addingNote()).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    // note not appended, and input is preserved (not cleared)
    expect(component.selectedApplication()?.reviewer_notes.length).toBe(0);
    expect(component.reviewerNote()).toBe('Will fail');
  });
});

// ---------------------------------------------------------------------------
// Error-callback branches: the service catches HTTP errors and emits of(null),
// so the component's subscribe `error:` handlers are only reachable by stubbing
// the service to return a throwing observable. These exercise the toast paths.
// ---------------------------------------------------------------------------
describe('DecisionPanelComponent — service error branches (stubbed)', () => {
  function buildWith(serviceOverrides: Partial<AdmissionAdminService>): {
    component: DecisionPanelComponent;
    toast: ToastService;
  } {
    TestBed.resetTestingModule();
    const stub = {
      getApplications: () => of([] as ApplicationSummary[]),
      getApplicationDetail: () => of(null),
      recordDecision: () => of(null),
      bulkDecision: () => of(null),
      addReviewerNote: () => of(null),
      ...serviceOverrides,
    };
    TestBed.configureTestingModule({
      imports: [DecisionPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdmissionAdminService, useValue: stub },
      ],
    });
    const fixture = TestBed.createComponent(DecisionPanelComponent);
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    fixture.detectChanges(); // ngOnInit
    return { component, toast };
  }

  it('shows a load-error toast when getApplications throws', () => {
    TestBed.resetTestingModule();
    const stub = {
      getApplications: () => throwError(() => new Error('network down')),
      getApplicationDetail: () => of(null),
      recordDecision: () => of(null),
      bulkDecision: () => of(null),
      addReviewerNote: () => of(null),
    } as unknown as AdmissionAdminService;
    TestBed.configureTestingModule({
      imports: [DecisionPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AdmissionAdminService, useValue: stub },
      ],
    });
    const fixture = TestBed.createComponent(DecisionPanelComponent);
    const component = fixture.componentInstance;
    const toast = TestBed.inject(ToastService);
    const spy = vi.spyOn(toast, 'show');
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(spy).toHaveBeenCalledWith('admin.admissions.applications_load_error', 'error');
  });

  it('shows a detail-error toast when getApplicationDetail throws', () => {
    const { component, toast } = buildWith({
      getApplicationDetail: () => throwError(() => new Error('boom')),
    });
    const spy = vi.spyOn(toast, 'show');

    component.selectApplication(makeSummary({ id: 'app-9' }));

    expect(component.loadingDetail()).toBe(false);
    expect(spy).toHaveBeenCalledWith('admin.admissions.detail_load_error', 'error');
  });

  it('shows a decision-error toast when recordDecision throws', () => {
    const { component, toast } = buildWith({
      recordDecision: () => throwError(() => new Error('boom')),
    });
    component.selectedApplication.set(makeDetail());
    const spy = vi.spyOn(toast, 'show');

    component.makeDecision('approved');

    expect(component.deciding()).toBe(false);
    expect(spy).toHaveBeenCalledWith('admin.admissions.decision_error', 'error');
  });

  it('shows a decision-error toast when bulkDecision throws', () => {
    const { component, toast } = buildWith({
      bulkDecision: () => throwError(() => new Error('boom')),
    });
    component.toggleBulkMode();
    component.toggleBulkSelect('app-1');
    const spy = vi.spyOn(toast, 'show');

    component.makeDecision('rejected');

    expect(component.deciding()).toBe(false);
    expect(spy).toHaveBeenCalledWith('admin.admissions.decision_error', 'error');
  });

  it('shows a note-error toast when addReviewerNote throws', () => {
    const { component, toast } = buildWith({
      addReviewerNote: () => throwError(() => new Error('boom')),
    });
    component.selectedApplication.set(makeDetail());
    component.reviewerNote.set('A note');
    const spy = vi.spyOn(toast, 'show');

    component.addNote();

    expect(component.addingNote()).toBe(false);
    expect(spy).toHaveBeenCalledWith('admin.admissions.note_error', 'error');
  });
});

describe('DecisionPanelComponent — lifecycle', () => {
  it('unsubscribes on destroy without error', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DecisionPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DecisionPanelComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(APPS_URL).flush([]);
    fixture.detectChanges();

    expect(() => fixture.destroy()).not.toThrow();
    httpMock.verify();
  });

  it('trackByAppId returns the application id and trackByIndex returns the index', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DecisionPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(DecisionPanelComponent);
    const component = fixture.componentInstance;
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(APPS_URL).flush([]);

    expect(component.trackByAppId(0, makeSummary({ id: 'app-xyz' }))).toBe('app-xyz');
    expect(component.trackByIndex(5)).toBe(5);
    httpMock.verify();
  });
});
