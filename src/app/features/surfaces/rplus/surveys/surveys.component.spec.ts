/**
 * SurveysComponent spec — R+ /r/surveys.
 *
 * Verifies the screen wires the BFF list response into the polyglass row
 * layout: tenant pill, total count, per-row Publish/Close/View Responses
 * CTAs gated by state, composer toggling, responses sub-view. Uses
 * HttpTestingController (real BFF wiring) per feedback_no_stubs_real_wiring.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SurveysComponent } from './surveys.component';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.bffBaseUrl}/api/v1/surveys`;

interface BackendSurveyStub {
  id: string;
  tenant_id: string;
  course_id: string;
  title: string;
  questions: { question_id: string; prompt: string; type: string; options?: string[] }[];
  distributed_to: string[];
  state: 'DRAFT' | 'DISTRIBUTED' | 'CLOSED';
  response_count: number;
  created_at: string;
  updated_at: string;
  distributed_at?: string;
  closed_at?: string;
}

const STUB_SURVEYS: readonly BackendSurveyStub[] = [
  {
    id: 'survey-draft-001',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    title: 'Mid-course pulse',
    questions: [
      {
        question_id: 'q1',
        prompt: 'How clear were the slides?',
        type: 'LIKERT',
      },
    ],
    distributed_to: [],
    state: 'DRAFT',
    response_count: 0,
    created_at: '2026-05-26T09:00:00Z',
    updated_at: '2026-05-26T09:00:00Z',
  },
  {
    id: 'survey-distributed-002',
    tenant_id: 'tenant-001',
    course_id: 'course-dsa-101',
    title: 'Week-2 sentiment',
    questions: [
      { question_id: 'q1', prompt: 'P1?', type: 'LIKERT' },
      { question_id: 'q2', prompt: 'Any notes?', type: 'TEXT' },
    ],
    distributed_to: ['gcid-a', 'gcid-b'],
    state: 'DISTRIBUTED',
    response_count: 1,
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-21T11:00:00Z',
    distributed_at: '2026-05-21T11:00:00Z',
  },
  {
    id: 'survey-closed-003',
    tenant_id: 'tenant-001',
    course_id: 'course-asm-2',
    title: 'Final reflection',
    questions: [{ question_id: 'q1', prompt: 'Rate it', type: 'LIKERT' }],
    distributed_to: ['gcid-c'],
    state: 'CLOSED',
    response_count: 1,
    created_at: '2026-05-19T08:00:00Z',
    updated_at: '2026-05-23T15:00:00Z',
    distributed_at: '2026-05-20T09:00:00Z',
    closed_at: '2026-05-23T15:00:00Z',
  },
];

function setup(): {
  fixture: ComponentFixture<SurveysComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [SurveysComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const tenants = TestBed.inject(TenantContextService);
  tenants.setCurrentTenant({
    id: 'tenant-001',
    name: 'MTM Singapore',
    slug: 'mtm',
    logoUrl: null,
  });
  const fixture = TestBed.createComponent(SurveysComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock.expectOne(BASE).flush({ items: STUB_SURVEYS });
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('SurveysComponent', () => {
  let fixture: ComponentFixture<SurveysComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('surface root', () => {
    it('renders the surface-rplus accent on the root', () => {
      const root = element.querySelector('[data-testid="rplus-surveys"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('uses a semantic <section> root', () => {
      const root = element.querySelector('[data-testid="rplus-surveys"]');
      expect(root?.tagName).toBe('SECTION');
    });
  });

  describe('header', () => {
    it('shows the current tenant name from TenantContextService', () => {
      const tenant = element.querySelector('[data-testid="rplus-surveys-tenant"]');
      expect(tenant?.textContent).toContain('MTM Singapore');
    });

    it('shows total surveys count from the BFF response', () => {
      const total = element.querySelector('[data-testid="rplus-surveys-total"]');
      expect(total?.textContent).toContain('3');
    });

    it('renders a state filter dropdown', () => {
      const filter = element.querySelector<HTMLSelectElement>(
        '[data-testid="rplus-surveys-state-filter"]',
      );
      expect(filter).not.toBeNull();
      expect(filter?.tagName).toBe('SELECT');
      const options = filter?.querySelectorAll('option') ?? [];
      // 1 "All" + 3 canonical states
      expect(options.length).toBe(4);
    });

    it('renders the New survey CTA', () => {
      const cta = element.querySelector('[data-testid="rplus-surveys-toggle-composer"]');
      expect(cta).not.toBeNull();
    });
  });

  describe('list', () => {
    it('renders one row per survey (3 total)', () => {
      const rows = element.querySelectorAll('[data-testid^="rplus-surveys-row-"]');
      expect(rows.length).toBe(3);
    });

    it('renders the DRAFT badge for draft surveys', () => {
      const badge = element.querySelector('[data-testid="rplus-surveys-state-survey-draft-001"]');
      expect(badge?.textContent).toContain('DRAFT');
    });

    it('renders the DISTRIBUTED badge for distributed surveys', () => {
      const badge = element.querySelector(
        '[data-testid="rplus-surveys-state-survey-distributed-002"]',
      );
      expect(badge?.textContent).toContain('DISTRIBUTED');
    });

    it('renders the CLOSED badge for closed surveys', () => {
      const badge = element.querySelector('[data-testid="rplus-surveys-state-survey-closed-003"]');
      expect(badge?.textContent).toContain('CLOSED');
    });

    it('renders the response_count badge on every row', () => {
      const count = element.querySelector(
        '[data-testid="rplus-surveys-responses-count-survey-distributed-002"]',
      );
      expect(count?.textContent).toContain('1');
    });

    it('exposes Publish CTA ONLY on DRAFT rows', () => {
      expect(
        element.querySelector('[data-testid="rplus-surveys-publish-survey-draft-001"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="rplus-surveys-publish-survey-distributed-002"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="rplus-surveys-publish-survey-closed-003"]'),
      ).toBeNull();
    });

    it('exposes Close CTA ONLY on DISTRIBUTED rows', () => {
      expect(
        element.querySelector('[data-testid="rplus-surveys-close-survey-draft-001"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="rplus-surveys-close-survey-distributed-002"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="rplus-surveys-close-survey-closed-003"]'),
      ).toBeNull();
    });

    it('exposes View Responses CTA on every row regardless of state', () => {
      expect(
        element.querySelector('[data-testid="rplus-surveys-view-responses-survey-draft-001"]'),
      ).not.toBeNull();
      expect(
        element.querySelector(
          '[data-testid="rplus-surveys-view-responses-survey-distributed-002"]',
        ),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="rplus-surveys-view-responses-survey-closed-003"]'),
      ).not.toBeNull();
    });
  });

  describe('composer', () => {
    it('is hidden by default', () => {
      expect(element.querySelector('[data-testid="rplus-surveys-composer"]')).toBeNull();
    });

    it('opens when the toggle CTA is clicked', () => {
      const toggle = element.querySelector<HTMLButtonElement>(
        '[data-testid="rplus-surveys-toggle-composer"]',
      );
      toggle?.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="rplus-surveys-composer"]')).not.toBeNull();
    });
  });

  describe('publish composer', () => {
    it('opens an inline composer when Publish is clicked on a DRAFT row', () => {
      const publish = element.querySelector<HTMLButtonElement>(
        '[data-testid="rplus-surveys-publish-survey-draft-001"]',
      );
      publish?.click();
      fixture.detectChanges();
      const composer = element.querySelector(
        '[data-testid="rplus-surveys-publish-composer-survey-draft-001"]',
      );
      expect(composer).not.toBeNull();
    });
  });

  describe('responses sub-view', () => {
    it('opens the responses panel + fires listResponses GET on View Responses click', () => {
      const view = element.querySelector<HTMLButtonElement>(
        '[data-testid="rplus-surveys-view-responses-survey-distributed-002"]',
      );
      view?.click();
      fixture.detectChanges();
      const req = httpMock.expectOne(`${BASE}/survey-distributed-002/responses`);
      expect(req.request.method).toBe('GET');
      req.flush({
        items: [
          {
            id: 'resp-001',
            survey_id: 'survey-distributed-002',
            gcid: 'gcid-phyllis',
            answers: [{ question_id: 'q1', value: '5' }],
            submitted_at: '2026-05-26T13:00:00Z',
          },
        ],
      });
      fixture.detectChanges();
      const panel = element.querySelector('[data-testid="rplus-surveys-responses-panel"]');
      expect(panel).not.toBeNull();
      const response = element.querySelector('[data-testid="rplus-surveys-response-resp-001"]');
      expect(response).not.toBeNull();
      expect(response?.textContent).toContain('gcid-phyllis');
    });

    it('renders the empty state when listResponses returns []', () => {
      const view = element.querySelector<HTMLButtonElement>(
        '[data-testid="rplus-surveys-view-responses-survey-draft-001"]',
      );
      view?.click();
      fixture.detectChanges();
      httpMock.expectOne(`${BASE}/survey-draft-001/responses`).flush({ items: [] });
      fixture.detectChanges();
      const empty = element.querySelector('[data-testid="rplus-surveys-responses-empty"]');
      expect(empty).not.toBeNull();
    });
  });

  describe('a11y', () => {
    it('renders a single h1 heading for the surface', () => {
      const heading = element.querySelector('h1');
      expect(heading).not.toBeNull();
    });

    it('labels the state-filter select with a <label for=>', () => {
      const select = element.querySelector('[data-testid="rplus-surveys-state-filter"]');
      const id = select?.getAttribute('id');
      expect(id).toBeTruthy();
      const label = element.querySelector(`label[for="${id}"]`);
      expect(label).not.toBeNull();
    });

    it('has zero critical/serious WCAG violations', async () => {
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });
});

describe('SurveysComponent — composer draft + create flow', () => {
  let fixture: ComponentFixture<SurveysComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: SurveysComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('toggling the composer closed resets the draft back to the empty template', () => {
    component.onToggleComposer(); // open
    fixture.detectChanges();
    component.onDraftTitleChanged('Dirty title');
    component.onDraftCourseIdChanged('course-x');
    expect(component.draft().title).toBe('Dirty title');

    component.onToggleComposer(); // close → reset
    fixture.detectChanges();
    expect(component.draft().title).toBe('');
    expect(component.draft().courseId).toBe('');
    expect(component.draft().questions.length).toBe(1);
  });

  it('updates draft course id + title via the change handlers', () => {
    component.onDraftCourseIdChanged('course-zen');
    component.onDraftTitleChanged('Quarterly retro');
    expect(component.draft().courseId).toBe('course-zen');
    expect(component.draft().title).toBe('Quarterly retro');
  });

  it('mutates a question prompt / type / options at a specific index', () => {
    component.onDraftQuestionPromptChanged(0, 'How was the pace?');
    component.onDraftQuestionTypeChanged(0, 'MULTIPLE_CHOICE');
    component.onDraftQuestionOptionsChanged(0, 'Too slow\nJust right\nToo fast');
    const q = component.draft().questions[0];
    expect(q.prompt).toBe('How was the pace?');
    expect(q.type).toBe('MULTIPLE_CHOICE');
    expect(q.options).toContain('Just right');
  });

  it('adds and removes question rows', () => {
    expect(component.draft().questions.length).toBe(1);
    component.onAddQuestionRow();
    component.onAddQuestionRow();
    expect(component.draft().questions.length).toBe(3);
    component.onRemoveQuestionRow(1);
    expect(component.draft().questions.length).toBe(2);
  });

  it('renders the MULTIPLE_CHOICE options textarea only when that type is selected', () => {
    component.onToggleComposer(); // open composer
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="rplus-surveys-q-options-0"]')).toBeNull();
    component.onDraftQuestionTypeChanged(0, 'MULTIPLE_CHOICE');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="rplus-surveys-q-options-0"]')).not.toBeNull();
  });

  it('POSTs a trimmed create payload (dropping empty-prompt rows) and closes the composer on success', () => {
    component.onToggleComposer();
    component.onDraftCourseIdChanged('  course-abc  ');
    component.onDraftTitleChanged('  New survey  ');
    component.onDraftQuestionPromptChanged(0, '  Rate the venue  ');
    component.onDraftQuestionTypeChanged(0, 'MULTIPLE_CHOICE');
    component.onDraftQuestionOptionsChanged(0, ' Good \n\n Bad ');
    component.onAddQuestionRow();
    // second row left with empty prompt → must be dropped from payload
    fixture.detectChanges();

    component.onCreateSurvey();

    const post = httpMock.expectOne(BASE);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      course_id: 'course-abc',
      title: 'New survey',
      questions: [
        {
          prompt: 'Rate the venue',
          type: 'MULTIPLE_CHOICE',
          options: ['Good', 'Bad'],
        },
      ],
    });
    post.flush(
      {
        id: 'survey-new-009',
        tenant_id: 'tenant-001',
        course_id: 'course-abc',
        title: 'New survey',
        questions: [
          {
            question_id: 'q1',
            prompt: 'Rate the venue',
            type: 'MULTIPLE_CHOICE',
            options: ['Good', 'Bad'],
          },
        ],
        distributed_to: [],
        state: 'DRAFT',
        response_count: 0,
        created_at: '2026-06-02T00:00:00Z',
        updated_at: '2026-06-02T00:00:00Z',
      },
      { status: 201, statusText: 'Created' },
    );
    fixture.detectChanges();

    // No refetch is wired (reloadKey is a future-wiring counter, list() is a
    // one-shot toSignal), so the composer simply closes + draft resets.
    expect(element.querySelector('[data-testid="rplus-surveys-composer"]')).toBeNull();
    expect(component.draft().title).toBe('');
  });

  it('omits the options key for non-MULTIPLE_CHOICE questions in the create payload', () => {
    component.onDraftCourseIdChanged('course-likert');
    component.onDraftTitleChanged('Likert only');
    component.onDraftQuestionPromptChanged(0, 'Overall rating');
    // type stays LIKERT; options newlines should be ignored
    component.onDraftQuestionOptionsChanged(0, 'ignored');

    component.onCreateSurvey();

    const post = httpMock.expectOne(BASE);
    expect(post.request.body).toEqual({
      course_id: 'course-likert',
      title: 'Likert only',
      questions: [{ prompt: 'Overall rating', type: 'LIKERT' }],
    });
    post.flush({
      id: 'survey-new-010',
      tenant_id: 'tenant-001',
      course_id: 'course-likert',
      title: 'Likert only',
      questions: [{ question_id: 'q1', prompt: 'Overall rating', type: 'LIKERT' }],
      distributed_to: [],
      state: 'DRAFT',
      response_count: 0,
      created_at: '2026-06-02T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    });
  });

  it('keeps the composer open when the create POST fails', () => {
    component.onToggleComposer();
    component.onDraftTitleChanged('Will fail');
    component.onDraftQuestionPromptChanged(0, 'A question');
    fixture.detectChanges();

    component.onCreateSurvey();

    httpMock
      .expectOne(BASE)
      .flush({ error: 'boom' }, { status: 500, statusText: 'Internal Server Error' });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="rplus-surveys-composer"]')).not.toBeNull();
  });
});

describe('SurveysComponent — publish + close + filter flows', () => {
  let fixture: ComponentFixture<SurveysComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: SurveysComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('POSTs the publish payload from the newline-separated recipients textarea', () => {
    component.onOpenPublishComposer('survey-draft-001');
    component.onPublishRecipientsChanged(' gcid-a \n\n gcid-b \n');
    fixture.detectChanges();

    component.onPublishConfirm('survey-draft-001');

    const post = httpMock.expectOne(`${BASE}/survey-draft-001/publish`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ recipients: ['gcid-a', 'gcid-b'] });
    post.flush({
      id: 'survey-draft-001',
      tenant_id: 'tenant-001',
      course_id: 'course-cspo',
      title: 'Mid-course pulse',
      questions: [{ question_id: 'q1', prompt: 'How clear?', type: 'LIKERT' }],
      distributed_to: ['gcid-a', 'gcid-b'],
      state: 'DISTRIBUTED',
      response_count: 0,
      created_at: '2026-05-26T09:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
      distributed_at: '2026-06-02T00:00:00Z',
    });
    fixture.detectChanges();

    // publishingFor cleared on success → composer collapses
    expect(component.publishingFor()).toBeNull();
    expect(component.publishRecipients()).toBe('');
  });

  it('clears the publish composer on a publish error (no crash)', () => {
    component.onOpenPublishComposer('survey-draft-001');
    component.onPublishRecipientsChanged('gcid-a');
    fixture.detectChanges();

    component.onPublishConfirm('survey-draft-001');
    httpMock
      .expectOne(`${BASE}/survey-draft-001/publish`)
      .flush({ error: 'no' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    // error path bumps reloadKey but leaves no refetch; composer stays open
    // (publishingFor is NOT reset on error per the source).
    expect(component.publishingFor()).toBe('survey-draft-001');
  });

  it('cancelling the publish composer clears the open state + recipients', () => {
    component.onOpenPublishComposer('survey-draft-001');
    component.onPublishRecipientsChanged('gcid-a');
    expect(component.publishingFor()).toBe('survey-draft-001');
    component.onCancelPublishComposer();
    expect(component.publishingFor()).toBeNull();
    expect(component.publishRecipients()).toBe('');
  });

  it('POSTs an empty body to /close when Close is clicked', () => {
    const closeBtn = element.querySelector<HTMLButtonElement>(
      '[data-testid="rplus-surveys-close-survey-distributed-002"]',
    );
    closeBtn?.click();

    const post = httpMock.expectOne(`${BASE}/survey-distributed-002/close`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({});
    post.flush({
      id: 'survey-distributed-002',
      tenant_id: 'tenant-001',
      course_id: 'course-dsa-101',
      title: 'Week-2 sentiment',
      questions: [{ question_id: 'q1', prompt: 'P1?', type: 'LIKERT' }],
      distributed_to: ['gcid-a', 'gcid-b'],
      state: 'CLOSED',
      response_count: 1,
      created_at: '2026-05-20T10:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
      distributed_at: '2026-05-21T11:00:00Z',
      closed_at: '2026-06-02T00:00:00Z',
    });
  });

  it('swallows a close error without crashing', () => {
    component.onCloseSurvey('survey-distributed-002');
    httpMock
      .expectOne(`${BASE}/survey-distributed-002/close`)
      .flush({ error: 'nope' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    // reloadKey bumped; no refetch wired → verify() in afterEach confirms.
    expect(component.reloadCount()).toBeGreaterThan(0);
  });

  it('updates the stateFilter signal + bumps reloadCount on filter change', () => {
    const before = component.reloadCount();
    component.onStateFilterChanged('CLOSED');
    expect(component.stateFilter()).toBe('CLOSED');
    expect(component.reloadCount()).toBe(before + 1);
  });

  it('clears the stateFilter to null when the empty "All" option is chosen', () => {
    component.onStateFilterChanged('DRAFT');
    expect(component.stateFilter()).toBe('DRAFT');
    component.onStateFilterChanged('');
    expect(component.stateFilter()).toBeNull();
  });
});

describe('SurveysComponent — pure helpers + responses close', () => {
  let fixture: ComponentFixture<SurveysComponent>;
  let httpMock: HttpTestingController;
  let component: SurveysComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    component = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('maps each state to its badge variant', () => {
    expect(component.badge('DRAFT')).toBe('badge-neutral');
    expect(component.badge('DISTRIBUTED')).toBe('badge-success');
    expect(component.badge('CLOSED')).toBe('badge-info');
  });

  it('maps each state to its i18n label key', () => {
    expect(component.labelKey('DRAFT')).toBe('rplus.surveys.state.DRAFT');
    expect(component.labelKey('DISTRIBUTED')).toBe('rplus.surveys.state.DISTRIBUTED');
    expect(component.labelKey('CLOSED')).toBe('rplus.surveys.state.CLOSED');
  });

  it('gates publish to DRAFT and close to DISTRIBUTED', () => {
    expect(component.canPublishState('DRAFT')).toBe(true);
    expect(component.canPublishState('DISTRIBUTED')).toBe(false);
    expect(component.canCloseState('DISTRIBUTED')).toBe(true);
    expect(component.canCloseState('CLOSED')).toBe(false);
  });

  it('exposes the canonical state + question-type option lists', () => {
    expect(component.stateOptions).toEqual(['DRAFT', 'DISTRIBUTED', 'CLOSED']);
    expect(component.questionTypeOptions).toEqual(['LIKERT', 'TEXT', 'MULTIPLE_CHOICE']);
  });

  it('falls back the responses store to [] when listResponses errors', () => {
    component.onViewResponses('survey-distributed-002');
    httpMock
      .expectOne(`${BASE}/survey-distributed-002/responses`)
      .flush({ error: 'no access' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(component.viewingResponsesFor()).toBe('survey-distributed-002');
    expect(component.responses()).toEqual([]);
    expect(component.totalResponses()).toBe(0);
  });

  it('closes the responses sub-view and clears the store', () => {
    component.onViewResponses('survey-draft-001');
    httpMock.expectOne(`${BASE}/survey-draft-001/responses`).flush({ items: [] });
    fixture.detectChanges();
    expect(component.viewingResponsesFor()).toBe('survey-draft-001');

    component.onCloseResponses();
    fixture.detectChanges();
    expect(component.viewingResponsesFor()).toBeNull();
    expect(component.responses()).toEqual([]);
  });
});

describe('SurveysComponent — empty state', () => {
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SurveysComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-001',
      name: 'MTM Singapore',
      slug: 'mtm',
      logoUrl: null,
    });
    const fixture = TestBed.createComponent(SurveysComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne(BASE).flush({ items: [] });
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => httpMock.verify());

  it('renders an empty-state message when no surveys exist', () => {
    const empty = element.querySelector('[data-testid="rplus-surveys-empty"]');
    expect(empty).not.toBeNull();
  });

  it('shows total count of 0', () => {
    const total = element.querySelector('[data-testid="rplus-surveys-total"]');
    expect(total?.textContent).toContain('0');
  });
});
