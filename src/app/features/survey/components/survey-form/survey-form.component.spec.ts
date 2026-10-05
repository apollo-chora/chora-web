import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { SurveyFormComponent } from './survey-form.component';
import { SurveyService } from '../../services/survey.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';

const SURVEYS_PATH = `${environment.bffBaseUrl}/api/v1/surveys`;

// CHO-2353 - this is what chora-delivery ACTUALLY returns. The service maps it
// onto SurveyDetail, so the HTTP layer must be flushed with the WIRE shape.
// Flushing the model shape here is what let this spec stay green while the live
// form rendered no prompts and no inputs.
const STUB_WIRE = {
  id: 'survey-001',
  tenant_id: 'tenant-001',
  course_id: 'course-001',
  title: 'Post-Course Feedback',
  state: 'DISTRIBUTED',
  distributed_to: ['gcid-learner'],
  response_count: 0,
  created_at: '2026-05-26T01:00:00Z',
  updated_at: '2026-05-26T01:00:00Z',
  questions: [
    { question_id: 'q-rating', prompt: 'Rate the course', type: 'LIKERT' },
    { question_id: 'q-text', prompt: 'Any comments?', type: 'TEXT' },
    { question_id: 'q-choice', prompt: 'Favourite topic?', type: 'MCQ' },
    { question_id: 'q-scale', prompt: 'Likelihood to recommend', type: 'SCALE' },
  ],
};

describe('SurveyFormComponent', () => {
  let component: SurveyFormComponent;
  let fixture: ComponentFixture<SurveyFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SurveyFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SurveyFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="survey-form"]');
    expect(el).toBeTruthy();
  });

  it('should start with empty answers', () => {
    expect(Object.keys(component.answers()).length).toBe(0);
  });

  it('should start with submitting as false', () => {
    expect(component.submitting()).toBe(false);
  });

  it('should compute progressPercent as 0 when no questions', () => {
    expect(component.progressPercent()).toBe(0);
  });

  it('should compute totalQuestions as 0 when no survey loaded', () => {
    expect(component.totalQuestions()).toBe(0);
  });

  it('should compute canSubmit as false when no survey loaded', () => {
    expect(component.canSubmit()).toBe(false);
  });

  it('should set rating answer correctly', () => {
    component.setRatingAnswer('q1', 4);
    expect(component.answers()['q1']).toBe(4);
  });

  it('should set text answer correctly', () => {
    const event = { target: { value: 'Some text' } } as unknown as Event;
    component.setTextAnswer('q2', event);
    expect(component.answers()['q2']).toBe('Some text');
  });

  it('should set multiple choice answer correctly', () => {
    component.setMultipleChoiceAnswer('q3', 'Option A');
    expect(component.answers()['q3']).toBe('Option A');
  });

  it('should set scale answer correctly', () => {
    component.setScaleAnswer('q4', 7);
    expect(component.answers()['q4']).toBe(7);
  });

  it('should return correct rating value', () => {
    component.setRatingAnswer('q1', 3);
    expect(component.getRatingValue('q1')).toBe(3);
    expect(component.getRatingValue('nonexistent')).toBe(0);
  });

  it('should return correct text value', () => {
    const event = { target: { value: 'Hello' } } as unknown as Event;
    component.setTextAnswer('q2', event);
    expect(component.getTextValue('q2')).toBe('Hello');
    expect(component.getTextValue('nonexistent')).toBe('');
  });

  it('should return correct choice value', () => {
    component.setMultipleChoiceAnswer('q3', 'B');
    expect(component.getChoiceValue('q3')).toBe('B');
    expect(component.getChoiceValue('nonexistent')).toBe('');
  });

  it('should return correct scale value', () => {
    component.setScaleAnswer('q4', 5);
    expect(component.getScaleValue('q4')).toBe(5);
    expect(component.getScaleValue('nonexistent')).toBe(0);
  });

  it('should return rating range as [1,2,3,4,5]', () => {
    expect(component.getRatingRange()).toEqual([1, 2, 3, 4, 5]);
  });

  it('should extract choices from question options', () => {
    const question = {
      id: 'q1',
      question_text: 'Test?',
      question_type: 'multiple_choice' as const,
      options: { choices: ['A', 'B', 'C'] },
      order_index: 0,
      required: false,
    };
    expect(component.getChoices(question)).toEqual(['A', 'B', 'C']);
  });

  it('should return empty array for question without choices', () => {
    const question = {
      id: 'q1',
      question_text: 'Test?',
      question_type: 'multiple_choice' as const,
      options: {},
      order_index: 0,
      required: false,
    };
    expect(component.getChoices(question)).toEqual([]);
  });

  it('should get scale min and max from question options', () => {
    const question = {
      id: 'q1',
      question_text: 'Test?',
      question_type: 'scale' as const,
      options: { min: 1, max: 10 },
      order_index: 0,
      required: false,
    };
    expect(component.getScaleMin(question)).toBe(1);
    expect(component.getScaleMax(question)).toBe(10);
  });

  it('should generate scale range correctly', () => {
    const question = {
      id: 'q1',
      question_text: 'Test?',
      question_type: 'scale' as const,
      options: { min: 1, max: 5 },
      order_index: 0,
      required: false,
    };
    expect(component.getScaleRange(question)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should compute answeredCount correctly', () => {
    component.setRatingAnswer('q1', 3);
    component.setMultipleChoiceAnswer('q2', 'A');
    expect(component.answeredCount()).toBe(2);
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Default-route (no surveyId) shell behaviour
  // ---------------------------------------------------------------------------

  it('should render loading skeleton when detail state is loading', () => {
    const service = TestBed.inject(SurveyService);
    // Drive the service directly into loading via a non-flushed load.
    const httpMock = TestBed.inject(HttpTestingController);
    service.loadSurveyDetail('survey-loading').subscribe();
    fixture.detectChanges();
    const loadingEl = fixture.nativeElement.querySelector('[data-testid="survey-form-loading"]');
    expect(loadingEl).toBeTruthy();
    // Clean up the open request.
    httpMock.expectOne(`${SURVEYS_PATH}/survey-loading`).flush(STUB_WIRE);
  });

  it('should not render content while no survey is loaded', () => {
    const titleEl = fixture.nativeElement.querySelector('[data-testid="survey-form-title"]');
    expect(titleEl).toBeNull();
  });

  it('should expose surveyDetailState idle initially', () => {
    expect(component.surveyDetailState().status).toBe('idle');
  });

  it('should have empty questions array when no detail', () => {
    expect(component.questions()).toEqual([]);
  });

  it('should expose responseState idle initially', () => {
    expect(component.responseState().status).toBe('idle');
  });

  it('should compute hasValidationErrors false when no errors', () => {
    expect(component.hasValidationErrors()).toBe(false);
  });

  it('should clear validation error when answering a question', () => {
    component.validationErrors.set({ q1: 'survey.validation_required' });
    expect(component.hasValidationErrors()).toBe(true);
    component.setRatingAnswer('q1', 4);
    expect(component.hasValidationErrors()).toBe(false);
  });

  it('getAnswer returns null for an unanswered question', () => {
    expect(component.getAnswer('missing')).toBeNull();
    component.setRatingAnswer('q1', 2);
    expect(component.getAnswer('q1')).toBe(2);
  });

  it('answeredCount ignores empty-string answers', () => {
    const event = { target: { value: '' } } as unknown as Event;
    component.setTextAnswer('q-text', event);
    expect(component.answeredCount()).toBe(0);
  });

  it('getScaleMin/getScaleMax fall back to defaults when options missing', () => {
    const question = {
      id: 'q1',
      question_text: 'Test?',
      question_type: 'scale' as const,
      options: {},
      order_index: 0,
      required: false,
    };
    expect(component.getScaleMin(question)).toBe(1);
    expect(component.getScaleMax(question)).toBe(10);
  });

  it('trackByQuestionId returns the question id', () => {
    const question = {
      id: 'q-track',
      question_text: 'Test?',
      question_type: 'text' as const,
      options: {},
      order_index: 0,
      required: false,
    };
    expect(component.trackByQuestionId(0, question)).toBe('q-track');
  });

  it('trackByValue returns the value', () => {
    expect(component.trackByValue(0, 5)).toBe(5);
    expect(component.trackByValue(1, 'choice')).toBe('choice');
  });

  it('submitSurvey is a no-op (no submitting flag) when validation fails', () => {
    const service = TestBed.inject(SurveyService);
    const httpMock = TestBed.inject(HttpTestingController);
    // Load a detail with a required question that is unanswered.
    service.loadSurveyDetail('survey-001').subscribe();
    httpMock.expectOne(`${SURVEYS_PATH}/survey-001`).flush(STUB_WIRE);
    fixture.detectChanges();

    // CHO-2353 - the delivery contract marks no question required, so the guard
    // that must hold is "at least one answer", not per-question requiredness.
    expect(component.canSubmit()).toBe(false);
    component.submitSurvey();
    // Blank submission refused -> no request, submitting stays false.
    httpMock.expectNone(`${SURVEYS_PATH}/survey-001/responses`);
    expect(component.submitting()).toBe(false);
    expect(component.blankSubmission()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Loaded-survey lifecycle (custom ActivatedRoute with surveyId)
// ---------------------------------------------------------------------------

describe('SurveyFormComponent (with surveyId route)', () => {
  let component: SurveyFormComponent;
  let fixture: ComponentFixture<SurveyFormComponent>;
  let httpMock: HttpTestingController;

  function configure(surveyId: string | null): void {
    TestBed.configureTestingModule({
      imports: [SurveyFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (key: string) => (key === 'surveyId' ? surveyId : null) },
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(SurveyFormComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  }

  it('loads survey detail on init and renders header + questions', () => {
    configure('survey-001');
    fixture.detectChanges(); // triggers ngOnInit
    httpMock.expectOne(`${SURVEYS_PATH}/survey-001`).flush(STUB_WIRE);
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('[data-testid="survey-form-title"]');
    expect(title.textContent).toContain('Post-Course Feedback');

    // 4 question fieldsets rendered.
    expect(component.totalQuestions()).toBe(4);
    const ratingGroup = fixture.nativeElement.querySelector(
      '[data-testid="rating-group-q-rating"]',
    );
    const textInput = fixture.nativeElement.querySelector('[data-testid="text-input-q-text"]');
    const choiceGroup = fixture.nativeElement.querySelector(
      '[data-testid="choice-group-q-choice"]',
    );
    const scaleGroup = fixture.nativeElement.querySelector('[data-testid="scale-group-q-scale"]');
    expect(ratingGroup).toBeTruthy();
    expect(textInput).toBeTruthy();
    expect(choiceGroup).toBeTruthy();
    expect(scaleGroup).toBeTruthy();
    httpMock.verify();
  });

  it('renders error state on detail load failure', () => {
    configure('survey-err');
    fixture.detectChanges();
    httpMock
      .expectOne(`${SURVEYS_PATH}/survey-err`)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.surveyDetailState().status).toBe('error');
    const errorEl = fixture.nativeElement.querySelector('[data-testid="survey-form-error"]');
    expect(errorEl).toBeTruthy();
    httpMock.verify();
  });

  it('does NOT load detail when surveyId is missing', () => {
    configure(null);
    fixture.detectChanges();
    httpMock.expectNone(`${SURVEYS_PATH}/`);
    httpMock.verify();
    expect(component.surveyDetailState().status).toBe('idle');
  });

  it('canSubmit becomes true once all required questions answered', () => {
    configure('survey-001');
    fixture.detectChanges();
    httpMock.expectOne(`${SURVEYS_PATH}/survey-001`).flush(STUB_WIRE);
    fixture.detectChanges();

    // Blank -> cannot submit; a single answer is enough to enable it.
    expect(component.canSubmit()).toBe(false);
    component.setRatingAnswer('q-rating', 4);
    expect(component.canSubmit()).toBe(true);
    component.setScaleAnswer('q-scale', 3);
    expect(component.canSubmit()).toBe(true);
    httpMock.verify();
  });

  it('progressPercent reflects answered required+optional questions', () => {
    configure('survey-001');
    fixture.detectChanges();
    httpMock.expectOne(`${SURVEYS_PATH}/survey-001`).flush(STUB_WIRE);
    fixture.detectChanges();

    // 4 total questions; answer 2 => 50%.
    component.setRatingAnswer('q-rating', 5);
    component.setScaleAnswer('q-scale', 2);
    expect(component.progressPercent()).toBe(50);
    httpMock.verify();
  });

  it('submitSurvey success: navigates to complete + shows success toast', () => {
    configure('survey-001');
    const toast = TestBed.inject(ToastService);
    const router = TestBed.inject(Router);
    const toastSpy = vi.spyOn(toast, 'show');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.detectChanges();
    httpMock.expectOne(`${SURVEYS_PATH}/survey-001`).flush(STUB_WIRE);
    fixture.detectChanges();

    // Answer required questions so validation passes.
    component.setRatingAnswer('q-rating', 4);
    component.setScaleAnswer('q-scale', 3);

    component.submitSurvey();
    expect(component.submitting()).toBe(true);

    const req = httpMock.expectOne(`${SURVEYS_PATH}/survey-001/responses`);
    expect(req.request.method).toBe('POST');
    // The wire takes an ARRAY of {question_id, value} with string values.
    expect(req.request.body).toEqual({
      answers: [
        { question_id: 'q-rating', value: '4' },
        { question_id: 'q-scale', value: '3' },
      ],
    });
    req.flush({
      id: 'resp-1',
      survey_id: 'survey-001',
      gcid: 'gcid-x',
      answers: { 'q-rating': 4, 'q-scale': 3 },
      completed_at: '2026-05-26T03:00:00Z',
    });

    expect(component.submitting()).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith('survey.submit_success', 'success');
    expect(navSpy).toHaveBeenCalledWith(['/survey', 'survey-001', 'complete']);
    httpMock.verify();
  });

  it('submitSurvey on HTTP failure: service swallows error so submit-success path is skipped (no toast, no nav, submitting cleared)', () => {
    // CHARACTERIZATION: SurveyService.submitResponse uses catchError -> of(null),
    // so the component subscribe `error` callback never fires on a 4xx/5xx.
    // Instead `next(null)` runs: submitting cleared, but `result` is falsy so
    // NEITHER the success toast/navigation NOR the error toast is shown.
    configure('survey-001');
    const toast = TestBed.inject(ToastService);
    const router = TestBed.inject(Router);
    const toastSpy = vi.spyOn(toast, 'show');
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.detectChanges();
    httpMock.expectOne(`${SURVEYS_PATH}/survey-001`).flush(STUB_WIRE);
    fixture.detectChanges();

    component.setRatingAnswer('q-rating', 4);
    component.setScaleAnswer('q-scale', 3);

    component.submitSurvey();
    expect(component.submitting()).toBe(true);

    httpMock
      .expectOne(`${SURVEYS_PATH}/survey-001/responses`)
      .flush({ message: 'nope' }, { status: 400, statusText: 'Bad Request' });

    expect(component.submitting()).toBe(false);
    // No success toast and no navigation because result is null.
    expect(toastSpy).not.toHaveBeenCalledWith('survey.submit_success', 'success');
    expect(navSpy).not.toHaveBeenCalled();
    // The service records its own error state.
    expect(component.responseState().status).toBe('error');
    httpMock.verify();
  });

  it('ngOnDestroy unsubscribes without throwing', () => {
    configure('survey-001');
    fixture.detectChanges();
    httpMock.expectOne(`${SURVEYS_PATH}/survey-001`).flush(STUB_WIRE);
    fixture.detectChanges();
    expect(() => fixture.destroy()).not.toThrow();
    httpMock.verify();
  });
});
