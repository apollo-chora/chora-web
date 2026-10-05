/**
 * CourseAuthoringComponent spec — A+ CJ#2 course shell.
 *
 * Dual-mode per route:
 *   new  — `/a/courses/new`            (create → publish → AWAITING_REVIEW)
 *   edit — `/a/courses/:courseId/edit` (PATCH ± publish on a rejected DRAFT)
 *
 * House conventions (chora-web CLAUDE.md §6 + ADR-176 Vitest runner):
 *   - GLOBAL Vitest API (describe/it/expect/beforeEach/afterEach/vi globals).
 *   - provideHttpClient + provideHttpClientTesting; BffClient prepends
 *     environment.bffBaseUrl so URLs are ABSOLUTE.
 *   - TestSetService.listTestSets is a REAL BFF GET (/api/v1/test-sets),
 *     driven via HttpTestingController.
 *   - ActivatedRoute mocked with snapshot.paramMap.get('courseId').
 *   - Translate pipe returns the raw i18n key with no translations loaded.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';

import { CourseAuthoringComponent } from './course-authoring.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { environment } from '../../../../../environments/environment';
import type { Course } from './course-authoring.model';
import type { TestSet } from '../../aplus/test-set-editor/test-set-editor.model';
import { DEFAULT_GRADING_CONFIG } from '../../aplus/test-set-editor/test-set-editor.model';

const TENANT_ID = '11111111-1111-7111-8111-111111111111';
const AUTHOR_GCID = '00000000-0000-7000-8000-000000001999';
const COURSE_ID = '01985e7f-1234-7abc-8def-00000000c001';
const TEST_SETS_PATH = `${environment.bffBaseUrl}/api/v1/test-sets`;
const COURSES_PATH = `${environment.bffBaseUrl}/api/v1/courses`;

function buildTestSet(overrides: Partial<TestSet> = {}): TestSet {
  return {
    test_set_id: 'ts-001',
    tenant_id: TENANT_ID,
    author_gcid: AUTHOR_GCID,
    title: 'Agile Estimation — Mid-Term',
    description: null,
    learner_facing_name: null,
    tags: [],
    state: 'PUBLISHED',
    total_points: 40,
    question_count: 5,
    revision_number: 1,
    parent_test_set_id: null,
    default_grading_config: DEFAULT_GRADING_CONFIG,
    deleted_at: null,
    created_at: '2026-05-15T08:00:00Z',
    updated_at: '2026-05-15T08:00:00Z',
    published_at: '2026-05-16T08:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

const STUB_TEST_SETS: readonly TestSet[] = [
  buildTestSet({ test_set_id: 'ts-001', title: 'Agile Estimation — Mid-Term' }),
  buildTestSet({
    test_set_id: 'ts-002',
    title: 'SOLID Principles — Final',
    question_count: 8,
    total_points: 80,
  }),
];

function buildCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: COURSE_ID,
    tenant_id: TENANT_ID,
    title: 'Intro to Agile',
    description: 'A gentle introduction',
    state: 'DRAFT',
    author_gcid: AUTHOR_GCID,
    learning_objectives: ['Understand sprints', 'Estimate velocity'],
    prerequisites: ['Basic project management'],
    test_set_ids: ['ts-001'],
    review_notes: 'Please expand the objectives section.',
    created_at: '2026-05-20T08:00:00Z',
    updated_at: '2026-05-20T08:00:00Z',
    ...overrides,
  };
}

interface SetupOptions {
  readonly courseId?: string;
}

function setup(opts: SetupOptions = {}): {
  fixture: ComponentFixture<CourseAuthoringComponent>;
  httpMock: HttpTestingController;
} {
  const route = {
    snapshot: {
      paramMap: {
        get: (key: string) =>
          key === 'courseId' ? opts.courseId ?? null : null,
      },
    },
  };

  TestBed.configureTestingModule({
    imports: [CourseAuthoringComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: 'a/dashboard', children: [] }]),
      TranslateService,
      { provide: ActivatedRoute, useValue: route },
    ],
  });

  const fixture = TestBed.createComponent(CourseAuthoringComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, httpMock };
}

/** Match the TestSetService.listTestSets GET regardless of query-param order. */
function expectTestSetsGet(httpMock: HttpTestingController) {
  return httpMock.expectOne(
    (req) => req.method === 'GET' && req.url === TEST_SETS_PATH,
  );
}

describe('CourseAuthoringComponent', () => {
  let fixture: ComponentFixture<CourseAuthoringComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: CourseAuthoringComponent;

  afterEach(() => {
    httpMock?.verify();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // NEW mode — /a/courses/new
  // ═══════════════════════════════════════════════════════════════════════
  describe('new mode', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = fixture.nativeElement as HTMLElement;
      component = fixture.componentInstance;
      fixture.detectChanges(); // ngOnInit → loadPublishedTestSets GET
      expectTestSetsGet(httpMock).flush({ items: STUB_TEST_SETS });
      fixture.detectChanges();
    });

    describe('shell render', () => {
      it('creates the component', () => {
        expect(component).toBeTruthy();
      });

      it('renders the surface-aplus root region', () => {
        const root = element.querySelector(
          '[data-testid="aplus-course-authoring"]',
        );
        expect(root).not.toBeNull();
        expect(root?.className).toContain('surface-aplus');
        expect(root?.tagName).toBe('SECTION');
      });

      it('is not in edit mode (no courseId param)', () => {
        expect(component.isEditMode()).toBe(false);
        expect(component.courseId()).toBeNull();
      });

      it('renders the create-mode title key (not the edit key)', () => {
        const title = element.querySelector(
          '#aplus-course-authoring-heading',
        );
        expect(title?.textContent).toContain('aplus.course_authoring.title');
        expect(title?.textContent).not.toContain('title_edit');
      });

      it('renders the primary submit CTA (no save-draft CTA in new mode)', () => {
        expect(
          element.querySelector('[data-testid="aplus-course-submit"]'),
        ).not.toBeNull();
        expect(
          element.querySelector('[data-testid="aplus-course-save-draft"]'),
        ).toBeNull();
      });

      it('does not render the review-notes block in new mode', () => {
        expect(
          element.querySelector('[data-testid="aplus-course-review-notes"]'),
        ).toBeNull();
      });

      it('does not render the edit-load loading/error blocks', () => {
        expect(
          element.querySelector('[data-testid="aplus-course-edit-loading"]'),
        ).toBeNull();
        expect(
          element.querySelector(
            '[data-testid="aplus-course-edit-load-error"]',
          ),
        ).toBeNull();
      });
    });

    describe('test-set picker', () => {
      it('renders one checkbox per published test-set', () => {
        const checks = element.querySelectorAll(
          '[data-testid^="aplus-course-test-set-"]',
        );
        expect(checks.length).toBe(2);
        expect(component.testSetsLoading()).toBe(false);
        expect(component.testSetsError()).toBeNull();
        expect(component.publishedTestSets().length).toBe(2);
      });

      it('renders test-set titles and meta', () => {
        const item = element.querySelector(
          '[data-testid="aplus-course-test-set-ts-001"]',
        );
        const li = item?.closest('li');
        expect(li?.textContent).toContain('Agile Estimation — Mid-Term');
        expect(li?.textContent).toContain('5q');
        expect(li?.textContent).toContain('40pts');
      });

      it('toggles a test-set selection on and off', () => {
        expect(component.isTestSetSelected('ts-001')).toBe(false);
        component.toggleTestSet('ts-001');
        expect(component.isTestSetSelected('ts-001')).toBe(true);
        expect(component.selectedTestSetIds()).toEqual(['ts-001']);
        component.toggleTestSet('ts-001');
        expect(component.isTestSetSelected('ts-001')).toBe(false);
        expect(component.selectedTestSetIds()).toEqual([]);
      });

      it('accumulates multiple test-set selections', () => {
        component.toggleTestSet('ts-001');
        component.toggleTestSet('ts-002');
        expect(component.selectedTestSetIds()).toEqual(['ts-001', 'ts-002']);
      });
    });

    describe('validation (canSubmit)', () => {
      it('disables submit when the form is empty', () => {
        expect(component.canSubmit()).toBe(false);
        const submit = element.querySelector(
          '[data-testid="aplus-course-submit"]',
        ) as HTMLButtonElement;
        expect(submit.disabled).toBe(true);
      });

      it('still disabled with title + objective but no test-set selected', () => {
        component.title.set('My Course');
        component.updateObjective(0, 'Learn things');
        expect(component.canSubmit()).toBe(false);
      });

      it('enables submit once title + objective + test-set are present', () => {
        component.title.set('My Course');
        component.updateObjective(0, 'Learn things');
        component.toggleTestSet('ts-001');
        expect(component.canSubmit()).toBe(true);
        fixture.detectChanges();
        const submit = element.querySelector(
          '[data-testid="aplus-course-submit"]',
        ) as HTMLButtonElement;
        expect(submit.disabled).toBe(false);
      });

      it('disables submit while an action is submitting', () => {
        component.title.set('My Course');
        component.updateObjective(0, 'Learn things');
        component.toggleTestSet('ts-001');
        expect(component.canSubmit()).toBe(true);
        component.action.set({ status: 'submitting' });
        expect(component.canSubmit()).toBe(false);
      });

      it('treats a whitespace-only title as invalid', () => {
        component.title.set('   ');
        component.updateObjective(0, 'Learn things');
        component.toggleTestSet('ts-001');
        expect(component.canSubmit()).toBe(false);
      });
    });

    describe('objective row management', () => {
      it('starts with a single empty objective row', () => {
        expect(component.objectives()).toEqual(['']);
      });

      it('adds, updates, and removes objective rows', () => {
        component.updateObjective(0, 'First');
        component.addObjective();
        component.updateObjective(1, 'Second');
        expect(component.objectives()).toEqual(['First', 'Second']);
        component.removeObjective(0);
        expect(component.objectives()).toEqual(['Second']);
      });

      it('never removes the last objective row (keeps one empty row)', () => {
        component.updateObjective(0, 'Only');
        component.removeObjective(0);
        expect(component.objectives()).toEqual(['']);
      });
    });

    describe('prerequisite row management', () => {
      it('starts with no prerequisites and shows the empty hint', () => {
        expect(component.prerequisites()).toEqual([]);
        const hint = element.querySelector('.course-authoring__hint');
        expect(hint?.textContent).toContain(
          'aplus.course_authoring.no_prerequisites',
        );
      });

      it('adds, updates, and removes prerequisite rows', () => {
        component.addPrerequisite();
        component.updatePrerequisite(0, 'Algebra');
        component.addPrerequisite();
        component.updatePrerequisite(1, 'Geometry');
        expect(component.prerequisites()).toEqual(['Algebra', 'Geometry']);
        component.removePrerequisite(0);
        expect(component.prerequisites()).toEqual(['Geometry']);
      });
    });

    describe('submitForReview — create + publish', () => {
      function fillValidForm(): void {
        component.title.set('  Intro to Agile  ');
        component.description.set('  A course  ');
        component.updateObjective(0, '  Understand sprints  ');
        component.addPrerequisite();
        component.updatePrerequisite(0, '  PM basics  ');
        component.toggleTestSet('ts-001');
        fixture.detectChanges();
      }

      it('POSTs a trimmed CreateCourseRequest then publishes, then navigates', () => {
        const router = TestBed.inject(Router);
        const navSpy = vi
          .spyOn(router, 'navigate')
          .mockResolvedValue(true);
        fillValidForm();

        component.submitForReview();
        expect(component.action().status).toBe('submitting');

        const post = httpMock.expectOne(COURSES_PATH);
        expect(post.request.method).toBe('POST');
        expect(post.request.body).toEqual({
          title: 'Intro to Agile',
          description: 'A course',
          learning_objectives: ['Understand sprints'],
          prerequisites: ['PM basics'],
          test_set_ids: ['ts-001'],
          // CHO-1795 — cert block always sent (disabled by default) so an edit
          // can clear a previously-defined cert.
          certification: { enabled: false },
        });
        post.flush(buildCourse({ id: COURSE_ID }));

        const publish = httpMock.expectOne(
          `${COURSES_PATH}/${COURSE_ID}/publish`,
        );
        expect(publish.request.method).toBe('POST');
        expect(publish.request.body).toEqual({});
        publish.flush(buildCourse({ id: COURSE_ID, state: 'AWAITING_REVIEW' }));

        expect(component.action().status).toBe('success');
        expect(navSpy).toHaveBeenCalledWith(['/a/dashboard'], {
          queryParams: { course_submitted: '1' },
        });
      });

      it('sends the full certification block when a cert is defined (CHO-1795)', () => {
        const router = TestBed.inject(Router);
        vi.spyOn(router, 'navigate').mockResolvedValue(true);
        fillValidForm();
        component.toggleCertEnabled(true);
        component.setCertType('COMPETENCY');
        component.setCertPassingScore('80');
        component.setCertRequireAllContent(true);
        fixture.detectChanges();

        component.submitForReview();
        const post = httpMock.expectOne(COURSES_PATH);
        expect(post.request.body.certification).toEqual({
          enabled: true,
          cert_type: 'COMPETENCY',
          passing_score_pct: 80,
          require_all_content: true,
        });
        post.flush(buildCourse({ id: COURSE_ID }));
        httpMock
          .expectOne(`${COURSES_PATH}/${COURSE_ID}/publish`)
          .flush(buildCourse({ id: COURSE_ID, state: 'AWAITING_REVIEW' }));
      });

      it('omits description when blank (undefined on the wire)', () => {
        component.title.set('Untitled but valid');
        component.updateObjective(0, 'Obj');
        component.toggleTestSet('ts-001');
        fixture.detectChanges();

        component.submitForReview();
        const post = httpMock.expectOne(COURSES_PATH);
        expect(post.request.body.description).toBeUndefined();
        post.flush(buildCourse());
        httpMock
          .expectOne(`${COURSES_PATH}/${COURSE_ID}/publish`)
          .flush(buildCourse({ state: 'AWAITING_REVIEW' }));
      });

      it('does nothing when canSubmit is false', () => {
        component.submitForReview();
        expect(component.action().status).toBe('idle');
        httpMock.expectNone(COURSES_PATH);
      });

      it('surfaces a 500 upstream error key and stays on page', () => {
        const router = TestBed.inject(Router);
        const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
        fillValidForm();

        component.submitForReview();
        httpMock
          .expectOne(COURSES_PATH)
          .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
        fixture.detectChanges();

        expect(component.action().status).toBe('error');
        expect(component.actionError()).toBe(
          'aplus.course_authoring.error_submit_upstream',
        );
        const err = element.querySelector(
          '[data-testid="aplus-course-error"]',
        );
        expect(err).not.toBeNull();
        expect(navSpy).not.toHaveBeenCalled();
      });

      it('maps a 401 to the unauthorised error key', () => {
        fillValidForm();
        component.submitForReview();
        httpMock
          .expectOne(COURSES_PATH)
          .flush(
            { error: 'nope' },
            { status: 401, statusText: 'Unauthorized' },
          );
        expect(component.actionError()).toBe(
          'aplus.course_authoring.error_unauthorised',
        );
      });

      it('maps a 409 to the conflict error key', () => {
        fillValidForm();
        component.submitForReview();
        httpMock
          .expectOne(COURSES_PATH)
          .flush(
            { error: 'conflict' },
            { status: 409, statusText: 'Conflict' },
          );
        expect(component.actionError()).toBe(
          'aplus.course_authoring.error_submit_conflict',
        );
      });

      it('maps an unknown/4xx (e.g. 400) to the generic error key', () => {
        fillValidForm();
        component.submitForReview();
        httpMock
          .expectOne(COURSES_PATH)
          .flush(
            { error: 'bad' },
            { status: 400, statusText: 'Bad Request' },
          );
        expect(component.actionError()).toBe(
          'aplus.course_authoring.error_submit_generic',
        );
      });
    });

    describe('saveDraft (new mode)', () => {
      it('is a no-op in new mode (no courseId)', () => {
        component.title.set('My Course');
        component.updateObjective(0, 'Learn');
        component.toggleTestSet('ts-001');
        expect(component.canSubmit()).toBe(true);
        component.saveDraft();
        expect(component.action().status).toBe('idle');
        httpMock.expectNone(`${COURSES_PATH}/${COURSE_ID}`);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Test-set picker — loading / error / empty
  // ═══════════════════════════════════════════════════════════════════════
  describe('test-set picker states', () => {
    it('shows the loading placeholder before the GET resolves', () => {
      TestBed.resetTestingModule();
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = fixture.nativeElement as HTMLElement;
      component = fixture.componentInstance;
      fixture.detectChanges(); // ngOnInit fires the GET, not yet flushed

      expect(component.testSetsLoading()).toBe(true);
      expect(
        element.querySelector(
          '[data-testid="aplus-course-test-sets-loading"]',
        ),
      ).not.toBeNull();

      expectTestSetsGet(httpMock).flush({ items: STUB_TEST_SETS });
      fixture.detectChanges();
      expect(component.testSetsLoading()).toBe(false);
    });

    it('renders the empty hint when no published test-sets exist', () => {
      TestBed.resetTestingModule();
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = fixture.nativeElement as HTMLElement;
      component = fixture.componentInstance;
      fixture.detectChanges();
      expectTestSetsGet(httpMock).flush({ items: [] });
      fixture.detectChanges();

      expect(component.publishedTestSets().length).toBe(0);
      const hint = element.textContent ?? '';
      expect(hint).toContain('aplus.course_authoring.no_published_test_sets');
    });

    it('renders a retryable error when the list GET 500s, then retries', () => {
      TestBed.resetTestingModule();
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = fixture.nativeElement as HTMLElement;
      component = fixture.componentInstance;
      fixture.detectChanges();
      expectTestSetsGet(httpMock).flush(
        { error: 'boom' },
        { status: 500, statusText: 'Server Error' },
      );
      fixture.detectChanges();

      expect(component.testSetsLoading()).toBe(false);
      expect(component.testSetsError()).toBe(
        'aplus.course_authoring.error_test_sets_upstream',
      );
      const retry = element.querySelector(
        '[data-testid="aplus-course-test-sets-retry"]',
      ) as HTMLButtonElement;
      expect(retry).not.toBeNull();

      // Retry re-fires the GET.
      retry.click();
      fixture.detectChanges();
      expect(component.testSetsLoading()).toBe(true);
      expectTestSetsGet(httpMock).flush({ items: STUB_TEST_SETS });
      fixture.detectChanges();
      expect(component.testSetsError()).toBeNull();
      expect(component.publishedTestSets().length).toBe(2);
    });

    it('maps a 401 on the list GET to the unauthorised key', () => {
      TestBed.resetTestingModule();
      const built = setup();
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = fixture.nativeElement as HTMLElement;
      component = fixture.componentInstance;
      fixture.detectChanges();
      expectTestSetsGet(httpMock).flush(
        { error: 'nope' },
        { status: 403, statusText: 'Forbidden' },
      );
      fixture.detectChanges();
      expect(component.testSetsError()).toBe(
        'aplus.course_authoring.error_unauthorised',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // EDIT mode — /a/courses/:courseId/edit
  // ═══════════════════════════════════════════════════════════════════════
  describe('edit mode', () => {
    beforeEach(() => {
      TestBed.resetTestingModule();
      const built = setup({ courseId: COURSE_ID });
      fixture = built.fixture;
      httpMock = built.httpMock;
      element = fixture.nativeElement as HTMLElement;
      component = fixture.componentInstance;
      fixture.detectChanges(); // ngOnInit → list GET + getCourse GET
    });

    function flushLoads(course: Course = buildCourse()): void {
      expectTestSetsGet(httpMock).flush({ items: STUB_TEST_SETS });
      httpMock.expectOne(`${COURSES_PATH}/${COURSE_ID}`).flush(course);
      fixture.detectChanges();
    }

    it('enters edit mode and exposes the courseId', () => {
      flushLoads();
      expect(component.isEditMode()).toBe(true);
      expect(component.courseId()).toBe(COURSE_ID);
    });

    it('shows the edit-loading placeholder while the course loads', () => {
      // list GET still outstanding; flush only it so verify() is clean,
      // but keep the course GET pending to observe the loading state.
      expect(component.editLoad()).toBe('loading');
      expect(
        element.querySelector('[data-testid="aplus-course-edit-loading"]'),
      ).not.toBeNull();
      // Now resolve both to satisfy httpMock.verify().
      expectTestSetsGet(httpMock).flush({ items: STUB_TEST_SETS });
      httpMock.expectOne(`${COURSES_PATH}/${COURSE_ID}`).flush(buildCourse());
    });

    it('prefills form fields from the loaded course', () => {
      flushLoads(
        buildCourse({
          title: 'Loaded Course',
          description: 'Loaded desc',
          learning_objectives: ['Obj A', 'Obj B'],
          prerequisites: ['Pre 1'],
          test_set_ids: ['ts-002'],
        }),
      );
      expect(component.title()).toBe('Loaded Course');
      expect(component.description()).toBe('Loaded desc');
      expect(component.objectives()).toEqual(['Obj A', 'Obj B']);
      expect(component.prerequisites()).toEqual(['Pre 1']);
      expect(component.selectedTestSetIds()).toEqual(['ts-002']);
      expect(component.editLoad()).toBe('idle');
    });

    it('hydrates the certification form from the loaded course (CHO-1795)', () => {
      flushLoads(
        buildCourse({
          certification: {
            enabled: true,
            cert_type: 'ACCREDITED',
            passing_score_pct: 65,
            require_all_content: false,
          },
        }),
      );
      expect(component.certEnabled()).toBe(true);
      expect(component.certType()).toBe('ACCREDITED');
      expect(component.certPassingScore()).toBe(65);
      expect(component.certRequireAllContent()).toBe(false);
    });

    it('selects the loaded cert_type option in the rendered <select> (CHO-1796)', () => {
      // RED-guard for the edit-page hydration bug: prefill sets the signal, but
      // a `[value]` binding on a native <select> with @for-rendered <option>s
      // does NOT reflect the value (the select's value binding runs before the
      // options register their values). The rendered <select> must show the
      // loaded cert_type, else re-saving silently clobbers it.
      flushLoads(
        buildCourse({
          certification: {
            enabled: true,
            cert_type: 'COMPETENCY',
            passing_score_pct: 70,
            require_all_content: true,
          },
        }),
      );
      const select = element.querySelector(
        '[data-testid="aplus-course-cert-type"]',
      ) as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.value).toBe('COMPETENCY');
      expect(select.options[select.selectedIndex]?.textContent?.trim()).toBe(
        'COMPETENCY',
      );
    });

    it('preserves the loaded cert_type on save when the select is untouched (CHO-1796)', () => {
      flushLoads(
        buildCourse({
          certification: {
            enabled: true,
            cert_type: 'COMPETENCY',
            passing_score_pct: 70,
            require_all_content: true,
          },
        }),
      );
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      // No cert interaction at all — just re-save the DRAFT.
      component.saveDraft();
      const patch = httpMock.expectOne(`${COURSES_PATH}/${COURSE_ID}`);
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body.certification).toEqual({
        enabled: true,
        cert_type: 'COMPETENCY',
        passing_score_pct: 70,
        require_all_content: true,
      });
      patch.flush(buildCourse());
    });

    it('falls back to a single empty objective row when the course has none', () => {
      flushLoads(
        buildCourse({
          learning_objectives: [],
          prerequisites: undefined,
          description: undefined,
        }),
      );
      expect(component.objectives()).toEqual(['']);
      expect(component.prerequisites()).toEqual([]);
      expect(component.description()).toBe('');
    });

    it('renders the review-notes block when the course was rejected with notes', () => {
      flushLoads(buildCourse({ review_notes: 'Add more detail please.' }));
      const notes = element.querySelector(
        '[data-testid="aplus-course-review-notes"]',
      );
      expect(notes).not.toBeNull();
      expect(notes?.textContent).toContain('Add more detail please.');
      expect(component.reviewNotes()).toBe('Add more detail please.');
    });

    it('does not render review-notes when the course has none', () => {
      flushLoads(buildCourse({ review_notes: undefined }));
      expect(
        element.querySelector('[data-testid="aplus-course-review-notes"]'),
      ).toBeNull();
      expect(component.reviewNotes()).toBeNull();
    });

    it('renders the edit-mode title key + save-draft CTA', () => {
      flushLoads();
      const title = element.querySelector('#aplus-course-authoring-heading');
      expect(title?.textContent).toContain(
        'aplus.course_authoring.title_edit',
      );
      expect(
        element.querySelector('[data-testid="aplus-course-save-draft"]'),
      ).not.toBeNull();
    });

    it('shows the edit-load error block when getCourse fails', () => {
      expectTestSetsGet(httpMock).flush({ items: STUB_TEST_SETS });
      httpMock
        .expectOne(`${COURSES_PATH}/${COURSE_ID}`)
        .flush(
          { error: 'gone' },
          { status: 500, statusText: 'Server Error' },
        );
      fixture.detectChanges();

      expect(component.editLoad()).toBe('error');
      expect(component.editLoadError()).toBe(
        'aplus.course_authoring.error_submit_upstream',
      );
      const errBlock = element.querySelector(
        '[data-testid="aplus-course-edit-load-error"]',
      );
      expect(errBlock).not.toBeNull();
    });

    describe('submitForReview — PATCH + publish (resubmit)', () => {
      it('PATCHes the update then publishes, navigating with resubmit banner', () => {
        flushLoads();
        const router = TestBed.inject(Router);
        const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

        component.title.set('Updated Title');
        component.updateObjective(0, 'New objective');
        component.toggleTestSet('ts-002'); // ts-001 already selected from load
        fixture.detectChanges();

        component.submitForReview();
        const patch = httpMock.expectOne(`${COURSES_PATH}/${COURSE_ID}`);
        expect(patch.request.method).toBe('PATCH');
        expect(patch.request.body.title).toBe('Updated Title');
        patch.flush(buildCourse({ id: COURSE_ID, title: 'Updated Title' }));

        const publish = httpMock.expectOne(
          `${COURSES_PATH}/${COURSE_ID}/publish`,
        );
        expect(publish.request.method).toBe('POST');
        publish.flush(buildCourse({ state: 'AWAITING_REVIEW' }));

        expect(component.action().status).toBe('success');
        expect(navSpy).toHaveBeenCalledWith(['/a/dashboard'], {
          queryParams: { course_resubmitted: '1' },
        });
      });

      it('surfaces an error when the resubmit PATCH fails', () => {
        flushLoads();
        component.title.set('Updated Title');
        component.updateObjective(0, 'New objective');
        fixture.detectChanges();

        component.submitForReview();
        httpMock
          .expectOne(`${COURSES_PATH}/${COURSE_ID}`)
          .flush(
            { error: 'boom' },
            { status: 500, statusText: 'Server Error' },
          );
        fixture.detectChanges();
        expect(component.action().status).toBe('error');
        expect(component.actionError()).toBe(
          'aplus.course_authoring.error_submit_upstream',
        );
      });
    });

    describe('saveDraft — PATCH only', () => {
      it('PATCHes the draft (no publish) and navigates with course_saved banner', () => {
        flushLoads();
        const router = TestBed.inject(Router);
        const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

        component.title.set('Draft Title');
        component.updateObjective(0, 'Draft objective');
        fixture.detectChanges();

        component.saveDraft();
        expect(component.action().status).toBe('submitting');
        const patch = httpMock.expectOne(`${COURSES_PATH}/${COURSE_ID}`);
        expect(patch.request.method).toBe('PATCH');
        patch.flush(buildCourse({ title: 'Draft Title' }));

        // No publish call.
        httpMock.expectNone(`${COURSES_PATH}/${COURSE_ID}/publish`);
        expect(component.action().status).toBe('success');
        expect(navSpy).toHaveBeenCalledWith(['/a/dashboard'], {
          queryParams: { course_saved: '1' },
        });
      });

      it('surfaces an error when the saveDraft PATCH fails', () => {
        flushLoads();
        component.title.set('Draft Title');
        component.updateObjective(0, 'Draft objective');
        fixture.detectChanges();

        component.saveDraft();
        httpMock
          .expectOne(`${COURSES_PATH}/${COURSE_ID}`)
          .flush(
            { error: 'conflict' },
            { status: 409, statusText: 'Conflict' },
          );
        fixture.detectChanges();
        expect(component.action().status).toBe('error');
        expect(component.actionError()).toBe(
          'aplus.course_authoring.error_submit_conflict',
        );
      });

      it('is a no-op when the form is invalid', () => {
        flushLoads();
        // Clear the title so canSubmit is false.
        component.title.set('');
        expect(component.canSubmit()).toBe(false);
        component.saveDraft();
        expect(component.action().status).toBe('idle');
        httpMock.expectNone(`${COURSES_PATH}/${COURSE_ID}/publish`);
      });
    });
  });
});
