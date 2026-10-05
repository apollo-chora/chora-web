import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NEVER } from 'rxjs';
import { CourseDetailAdminComponent } from './course-detail-admin.component';
import { CourseDetailAdminService } from './course-detail-admin.service';
import { CourseService } from '../course-authoring/course.service';
import { environment } from '../../../../../environments/environment';

interface BackendCourseStub {
  id: string;
  title: string;
  description?: string;
  state: 'DRAFT' | 'AWAITING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  author_gcid?: string;
  test_set_ids?: string[];
  price_sgd_cents?: number;
  sf_eligible?: boolean;
  instructor_gcids?: string[];
  scheduled_open_at?: string;
}

/**
 * The detail page fires TWO GETs to /api/v1/courses/{id}: the display
 * projection (CourseDetailAdminService) + the raw Course aggregate
 * (CourseService, for the real `state` + release-form seed). Flush every
 * matching GET with the same backend stub, returning the count observed.
 */
function flushCourseGets(
  httpMock: HttpTestingController,
  courseId: string,
  stub: BackendCourseStub,
): number {
  const url = `${environment.bffBaseUrl}/api/v1/courses/${encodeURIComponent(courseId)}`;
  const reqs = httpMock.match((r) => r.url === url && r.method === 'GET');
  reqs.forEach((r) => r.flush(stub));
  return reqs.length;
}

/**
 * An AWAITING_REVIEW course lazy-loads the tenant instructor roster for the
 * release checklist (CHO-2316). Flush that GET so httpMock.verify() stays
 * clean; pass gcids to populate the checklist for a rendering assertion.
 */
function flushInstructorRoster(
  httpMock: HttpTestingController,
  gcids: readonly string[] = [],
): number {
  const reqs = httpMock.match(
    (r) => r.method === 'GET' && r.url.includes('/api/v1/admin/tenant-members'),
  );
  reqs.forEach((r) =>
    r.flush({
      items: gcids.map((gcid) => ({
        gcid,
        email: `${gcid}@tenant.io`,
        display_name: `Instructor ${gcid}`,
        roles: ['INSTRUCTOR'],
        last_active_at: null,
      })),
      next_page_token: null,
    }),
  );
  return reqs.length;
}

/**
 * The page loads the real course content (CHO-2317) for every course. Flush
 * that GET (empty by default) so httpMock.verify() stays clean; pass items to
 * populate the grouped view.
 */
function flushCourseContent(
  httpMock: HttpTestingController,
  items: readonly {
    item_id: string;
    kind: string;
    title: string;
    position: number;
  }[] = [],
): number {
  const reqs = httpMock.match(
    (r) => r.method === 'GET' && /\/api\/v1\/courses\/[^/]+\/content$/.test(r.url),
  );
  reqs.forEach((r) =>
    r.flush({
      course_id: 'cspo-2026',
      items: items.map((it) => ({ ref: 'ref', ...it })),
    }),
  );
  return reqs.length;
}

function setup(
  courseId: string,
  stub: BackendCourseStub,
): {
  fixture: ComponentFixture<CourseDetailAdminComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [CourseDetailAdminComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(CourseDetailAdminComponent);
  fixture.componentRef.setInput('courseId', courseId);
  const httpMock = TestBed.inject(HttpTestingController);
  // First CD: commits the signal input + fires the courseId effects.
  // Each effect subscribes synchronously to a BFF Observable; the
  // HttpTestingController intercepts the requests and we flush below.
  fixture.detectChanges();
  flushCourseGets(httpMock, courseId, stub);
  flushCourseContent(httpMock);
  // Second CD: re-renders the template now that the snapshots are set.
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('CourseDetailAdminComponent', () => {
  let fixture: ComponentFixture<CourseDetailAdminComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup('cspo-2026', {
      id: 'cspo-2026',
      title: 'Certified Scrum Product Owner',
      description: 'PO foundations',
      state: 'PUBLISHED',
      author_gcid: 'gcid-chen',
    });
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('surface root', () => {
    it('renders the surface-rplus accent', () => {
      const root = element.querySelector('[data-testid="rplus-course-detail"]');
      expect(root?.className).toContain('surface-rplus');
    });
  });

  describe('header', () => {
    it('shows the course title from the BFF response', () => {
      const title = element.querySelector('[data-testid="course-detail-title"]');
      expect(title?.textContent).toContain('Scrum Product Owner');
    });

    it('shows the derived course code', () => {
      const code = element.querySelector('[data-testid="course-detail-code"]');
      expect(code?.textContent).toContain('CSPO');
    });

    it('shows the Published status badge for PUBLISHED state', () => {
      const status = element.querySelector('[data-testid="course-detail-status"]');
      expect(status?.textContent?.trim()).toBe('Published');
      expect(status?.className).toContain('badge-success');
    });

    it('renders NEITHER a Publish New Version nor an Archive CTA', () => {
      // R1 slice 2, owner ruling. Both bound no `(click)` (six buttons in this
      // template, four click bindings), so both were dead on main for every
      // viewer while looking exactly as live as Manage curriculum beside them.
      //
      // Archive: removed because nothing can perform it. The delivery course
      // surface dispatches only publish / release / reject
      // (`course_cj2_handler.go:196-215`); no transition into ARCHIVED exists.
      //
      // Publish New Version: removed rather than wired, because the endpoint it
      // would reach does something else. `POST /api/v1/courses/{id}/publish` is
      // DRAFT to AWAITING_REVIEW, which is submit-for-review, and that step
      // already lives where drafting happens (the authoring form's "Save +
      // resubmit for review"). After R2b this screen is where review HAPPENS,
      // with Release as the publish. Wiring a button labelled "Publish New
      // Version" to a submit-for-review call would have made a control that
      // says one thing and does another.
      expect(element.querySelector('[data-testid="course-detail-publish"]')).toBeNull();
      expect(element.querySelector('[data-testid="course-detail-archive"]')).toBeNull();
    });
  });

  describe('KPIs that no read can serve (R1 slice 3a)', () => {
    // REPLACES the old "zero by design" block, whose assertions pinned the
    // defect: it asserted the tiles show 0, so the screen could print a zero
    // that meant "never built" and stay green.
    //
    // `completed`, `avgScorePercent` and the atoms published/draft tile are
    // GONE rather than zero. The mapper hardcoded all of them
    // (`course-detail-admin.service.ts:68-71`) and nothing on the wire answers
    // them: the only completion figures are learner-scoped and enrolment-gated
    // (`me_module_progress_handler.go`), and NO source carries an atom
    // publication status, not `test_set_ids` (bare ids) and not
    // `CourseContentItem` (no status field).
    //
    // The atoms tile is the sharpest case. This screen ALREADY fetches real
    // course content and renders it in the panel below, while the tile beside
    // it read a hardcoded empty array and printed "0 published / 0 draft". The
    // screen disagreed with itself. The tile asked a question nothing on the
    // wire answers, and printed a zero rather than saying so.
    //
    // `enrolled` STAYS and is served in 3b from the roster read that already
    // exists. It is the positive control here: without it, a change that
    // stripped the whole KPI row would pass.
    it('keeps the enrolled tile and drops the three unservable ones', () => {
      expect(
        element.querySelector('[data-testid="course-detail-enrolled"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="course-detail-completed"]'),
      ).toBeNull();
      expect(element.querySelector('[data-testid="course-detail-avg"]')).toBeNull();
      expect(
        element.querySelector('[data-testid="course-detail-atom-counts"]'),
      ).toBeNull();
    });

    it('drops the Cohorts panel, which no read can fill', () => {
      expect(
        element.querySelector('[data-testid="course-detail-cohorts"]'),
      ).toBeNull();
    });
  });

  describe('course content (CHO-2317)', () => {
    it('replaces the stub atom outline with the Course content section', () => {
      expect(
        element.querySelector('[data-testid="course-detail-content"]'),
      ).not.toBeNull();
      // the old stub atom-outline list is gone
      expect(
        element.querySelector('[data-testid="course-detail-atom-list"]'),
      ).toBeNull();
    });

    it('shows the empty state when the course has no content', () => {
      expect(
        element.querySelector('[data-testid="course-detail-content-empty"]'),
      ).not.toBeNull();
    });
  });

  describe('header — breadcrumb / summary / author / version', () => {
    it('renders the breadcrumb leaf with the course title', () => {
      const leaf = element.querySelector('[data-testid="course-detail-breadcrumb-leaf"]');
      expect(leaf?.textContent).toContain('Scrum Product Owner');
    });

    it('renders the course summary from the BFF description', () => {
      const summary = element.querySelector('.course-detail__summary');
      expect(summary?.textContent).toContain('PO foundations');
    });

    it('renders the author from author_gcid', () => {
      const author = element.querySelector('.course-detail__author');
      expect(author?.textContent).toContain('gcid-chen');
    });

    it('renders the hard-coded v1 version chip', () => {
      const version = element.querySelector('.course-detail__version');
      expect(version?.textContent?.trim()).toBe('v1');
    });

    it('renders the manage-curriculum CTA routed to the content editor', () => {
      const cta = element.querySelector('[data-testid="course-detail-manage-curriculum"]');
      expect(cta).not.toBeNull();
      // routerLink resolves to the content-editor path for this courseId
      expect(cta?.getAttribute('href')).toContain('cspo-2026');
      expect(cta?.getAttribute('href')).toContain('content');
    });
  });

  describe('learners empty state (backend exposes none yet)', () => {
    // The cohorts empty-state test is GONE with the panel (R1 slice 3a). An
    // always-empty panel saying "no cohorts scheduled" is a false claim, not an
    // empty state: nothing can ever fill it, because offerings are the cohorts
    // and the offering handler has no course filter.
    //
    // The learners one STAYS: `enrolledLearners` is servable from the roster
    // read and 3b wires it, so its empty state will become true rather than
    // permanent.
    it('renders the learners empty-state paragraph', () => {
      const empty = element.querySelector('.course-detail__learner-empty');
      expect(empty).not.toBeNull();
    });

    // The atom-counts chip test is GONE with the chip (R1 slice 3a). It
    // asserted the chip contains '0', which it always did and always would:
    // the tile read a hardcoded empty array while the panel below rendered the
    // real content. A test that pins a permanent zero is coverage for a defect.
  });

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations', async () => {
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    }, 30000);
  });
});

// ---------------------------------------------------------------------------
// Status-badge variants + loading + HTTP error — drive the real service via
// HttpTestingController and flush varying backend `state` values.
// ---------------------------------------------------------------------------
function setupHttp(courseId: string): {
  fixture: ComponentFixture<CourseDetailAdminComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [CourseDetailAdminComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(CourseDetailAdminComponent);
  fixture.componentRef.setInput('courseId', courseId);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  flushCourseContent(httpMock);
  return { fixture, httpMock };
}

/** Create a PUBLISHED-course component with a populated content curriculum. */
function setupWithContent(
  items: readonly {
    item_id: string;
    kind: string;
    title: string;
    position: number;
  }[],
): { element: HTMLElement; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    imports: [CourseDetailAdminComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  });
  const fixture = TestBed.createComponent(CourseDetailAdminComponent);
  fixture.componentRef.setInput('courseId', 'cspo-2026');
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  flushCourseGets(httpMock, 'cspo-2026', {
    id: 'cspo-2026',
    title: 'Certified Scrum Product Owner',
    state: 'PUBLISHED',
  });
  flushCourseContent(httpMock, items);
  fixture.detectChanges();
  return { element: fixture.nativeElement as HTMLElement, httpMock };
}

describe('CourseDetailAdminComponent - Course content grouping (CHO-2317)', () => {
  afterEach(() => TestBed.resetTestingModule());

  const MIXED = [
    { item_id: 'i1', kind: 'video', title: 'Intro video', position: 1 },
    { item_id: 'i2', kind: 'assessment', title: 'Quiz 1', position: 2 },
    { item_id: 'i3', kind: 'atom', title: 'Reading', position: 3 },
    { item_id: 'i4', kind: 'video', title: 'Deep dive', position: 4 },
  ];

  it('groups content into named collections in a stable order (assessments, videos, atoms)', () => {
    TestBed.resetTestingModule();
    const { element, httpMock } = setupWithContent(MIXED);
    const groups = Array.from(
      element.querySelectorAll('[data-testid^="course-detail-content-group-"]'),
    ).map((g) => g.getAttribute('data-testid'));
    expect(groups).toEqual([
      'course-detail-content-group-assessment',
      'course-detail-content-group-video',
      'course-detail-content-group-atom',
    ]);
    httpMock.verify();
  });

  it('lists the two videos under the Videos group in position order', () => {
    TestBed.resetTestingModule();
    const { element, httpMock } = setupWithContent(MIXED);
    const videoGroup = element.querySelector(
      '[data-testid="course-detail-content-group-video"]',
    );
    const titles = Array.from(
      videoGroup!.querySelectorAll('.course-detail__content-item-title'),
    ).map((t) => t.textContent?.trim());
    expect(titles).toEqual(['Intro video', 'Deep dive']);
    httpMock.verify();
  });

  it('renders no reorder / add / remove controls (read-only overview)', () => {
    TestBed.resetTestingModule();
    const { element, httpMock } = setupWithContent(MIXED);
    expect(
      element.querySelector('[data-testid^="course-detail-atom-up-"]'),
    ).toBeNull();
    expect(element.querySelector('.course-detail__atom-controls')).toBeNull();
    httpMock.verify();
  });

  it('shows a fail-loud error + retry when the content GET fails', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CourseDetailAdminComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(CourseDetailAdminComponent);
    fixture.componentRef.setInput('courseId', 'cspo-2026');
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushCourseGets(httpMock, 'cspo-2026', {
      id: 'cspo-2026',
      title: 'X',
      state: 'PUBLISHED',
    });
    httpMock
      .match((r) => /\/content$/.test(r.url))
      .forEach((r) => r.flush({}, { status: 503, statusText: 'x' }));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(
      element.querySelector('[data-testid="course-detail-content-error"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="course-detail-content-retry"]'),
    ).not.toBeNull();
    httpMock.verify();
  });
});

describe('CourseDetailAdminComponent — status badge variants', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the Draft warning badge for DRAFT state', () => {
    TestBed.resetTestingModule();
    const { fixture, httpMock } = setupHttp('c-draft');
    flushCourseGets(httpMock, 'c-draft', {
      id: 'c-draft',
      title: 'Draft Course',
      state: 'DRAFT',
    });
    fixture.detectChanges();

    const status = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="course-detail-status"]',
    );
    expect(status?.textContent?.trim()).toBe('Draft');
    expect(status?.className).toContain('badge-warning');
    httpMock.verify();
  });

  it('maps AWAITING_REVIEW backend state to the Awaiting Review info badge', () => {
    TestBed.resetTestingModule();
    const { fixture, httpMock } = setupHttp('c-review');
    flushCourseGets(httpMock, 'c-review', {
      id: 'c-review',
      title: 'Review Course',
      state: 'AWAITING_REVIEW',
    });
    fixture.detectChanges();
    flushInstructorRoster(httpMock);

    const status = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="course-detail-status"]',
    );
    expect(status?.textContent?.trim()).toBe('Awaiting Review');
    expect(status?.className).toContain('badge-info');
    httpMock.verify();
  });

  it('shows a load-error state (not an endless spinner) when the course GET 404s (CHO-2256)', () => {
    TestBed.resetTestingModule();
    const { fixture, httpMock } = setupHttp('c-404');
    const reqs = httpMock.match(
      (r) => r.url === `${environment.bffBaseUrl}/api/v1/courses/c-404` && r.method === 'GET',
    );
    // Both projection GETs (display + raw) 404 — the legacy-course case.
    expect(reqs.length).toBeGreaterThan(0);
    reqs.forEach((r) =>
      r.flush({ error: 'Not Found' }, { status: 404, statusText: 'Not Found' }),
    );
    fixture.detectChanges();

    // The display load flipped loadError, so the page fails loud instead of
    // spinning forever; the error state renders and the spinner is gone.
    expect(fixture.componentInstance.loadError()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="course-detail-load-error"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="course-detail-loading"]')).toBeFalsy();
    httpMock.verify();
  });

  it('shows the Archived neutral badge for ARCHIVED state', () => {
    TestBed.resetTestingModule();
    const { fixture, httpMock } = setupHttp('c-arch');
    flushCourseGets(httpMock, 'c-arch', {
      id: 'c-arch',
      title: 'Archived Course',
      state: 'ARCHIVED',
    });
    fixture.detectChanges();

    const status = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="course-detail-status"]',
    );
    expect(status?.textContent?.trim()).toBe('Archived');
    expect(status?.className).toContain('badge-neutral');
    httpMock.verify();
  });

  it('falls back to em-dash author when author_gcid is absent', () => {
    TestBed.resetTestingModule();
    const { fixture, httpMock } = setupHttp('c-noauthor');
    flushCourseGets(httpMock, 'c-noauthor', {
      id: 'c-noauthor',
      title: 'No Author Course',
      state: 'PUBLISHED',
    });
    fixture.detectChanges();

    const author = (fixture.nativeElement as HTMLElement).querySelector('.course-detail__author');
    expect(author?.textContent).toContain('–');
    httpMock.verify();
  });
});

describe('CourseDetailAdminComponent — loading + error', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the loading placeholder before the BFF response arrives', () => {
    TestBed.resetTestingModule();
    const { fixture, httpMock } = setupHttp('c-pending');
    // No flush yet → courseSnapshot still null → loading branch.
    const loading = (fixture.nativeElement as HTMLElement).querySelector('.course-detail__loading');
    expect(loading).not.toBeNull();
    // header should NOT be present while loading
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="course-detail-title"]'),
    ).toBeNull();
    // flush so verify() is clean
    flushCourseGets(httpMock, 'c-pending', {
      id: 'c-pending',
      title: 'Pending',
      state: 'PUBLISHED',
    });
    httpMock.verify();
  });

  it('keeps the loading placeholder when getCourse errors (stubbed service)', () => {
    // PRODUCTION-CHARACTERIZATION: the component effect subscribes WITHOUT an
    // error handler, so a real failed GET would escape as an unhandled
    // HttpErrorResponse (no catchError anywhere in the chain — a robustness
    // gap; see prodBugFlag). To characterize the *view* under an error
    // (no error UI → stays on the loading branch) without leaking an
    // unhandled rejection into the runner, we stub getCourse to return an
    // observable that NEVER emits and never errors (NEVER), so courseSnapshot
    // stays null exactly as it would after a swallowed error.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CourseDetailAdminComponent],
      providers: [
        provideRouter([]),
        {
          provide: CourseDetailAdminService,
          useValue: { getCourse: () => NEVER },
        },
        {
          provide: CourseService,
          useValue: { getCourse: () => NEVER },
        },
      ],
    });
    const fixture = TestBed.createComponent(CourseDetailAdminComponent);
    fixture.componentRef.setInput('courseId', 'c-err');
    fixture.detectChanges();

    const loading = (fixture.nativeElement as HTMLElement).querySelector('.course-detail__loading');
    expect(loading).not.toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="course-detail-title"]'),
    ).toBeNull();
  });

  it('getCourse error propagates as an HttpErrorResponse at the service boundary', () => {
    // Characterizes the exact GET path/verb the component delegates to, with a
    // proper error handler so no unhandled rejection escapes. Confirms the
    // service itself does NOT swallow the error (component-side gap is the
    // unguarded subscribe).
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(CourseDetailAdminService);
    const httpMock = TestBed.inject(HttpTestingController);

    let errorStatus: number | undefined;
    service.getCourse('c-err').subscribe({
      next: () => {
        throw new Error('should not emit on error');
      },
      error: (e: { status?: number }) => {
        errorStatus = e.status;
      },
    });

    httpMock
      .expectOne(`${environment.bffBaseUrl}/api/v1/courses/c-err`)
      .flush({ error: 'internal' }, { status: 500, statusText: 'Server Error' });

    expect(errorStatus).toBe(500);
    httpMock.verify();
  });
});

// ---------------------------------------------------------------------------
// Per-course review block (release / reject). The R+ Course Review queue moved
// from a global sidebar route to THIS per-course detail action: when the course
// is AWAITING_REVIEW the admin sets a price + roster and releases it, or rejects
// it back to the instructor. Ported from course-review.component.spec.ts.
// ---------------------------------------------------------------------------
const REVIEW_STUB: BackendCourseStub = {
  id: 'cspo-2026',
  title: 'Certified Scrum Product Owner',
  description: 'PO foundations',
  state: 'AWAITING_REVIEW',
  author_gcid: 'gcid-chen',
};

const GET_URL = `${environment.bffBaseUrl}/api/v1/courses/cspo-2026`;
const RELEASE_URL = `${GET_URL}/release`;
const REJECT_URL = `${GET_URL}/reject`;

function setupReview(
  stub: BackendCourseStub,
  instructors: readonly string[] = [],
): {
  fixture: ComponentFixture<CourseDetailAdminComponent>;
  httpMock: HttpTestingController;
  component: CourseDetailAdminComponent;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [CourseDetailAdminComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(CourseDetailAdminComponent);
  fixture.componentRef.setInput('courseId', 'cspo-2026');
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  flushCourseGets(httpMock, 'cspo-2026', stub);
  flushCourseContent(httpMock);
  fixture.detectChanges();
  // AWAITING_REVIEW opens the release panel, which lazy-loads the instructor
  // roster; flush it (empty by default) so verify() stays clean.
  if (stub.state === 'AWAITING_REVIEW') {
    flushInstructorRoster(httpMock, instructors);
    fixture.detectChanges();
  }
  return {
    fixture,
    httpMock,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
  };
}

describe('CourseDetailAdminComponent — review block visibility', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the release + reject forms only when the course is AWAITING_REVIEW', () => {
    TestBed.resetTestingModule();
    const { element, component, httpMock } = setupReview(REVIEW_STUB);
    expect(component.isAwaitingReview()).toBe(true);
    expect(element.querySelector('[data-testid="course-detail-review"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="course-detail-release"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="course-detail-reject"]')).not.toBeNull();
    httpMock.verify();
  });

  it('hides the review block when the course is PUBLISHED', () => {
    TestBed.resetTestingModule();
    const { element, component, httpMock } = setupReview({
      ...REVIEW_STUB,
      state: 'PUBLISHED',
    });
    expect(component.isAwaitingReview()).toBe(false);
    expect(element.querySelector('[data-testid="course-detail-review"]')).toBeNull();
    expect(element.querySelector('[data-testid="course-detail-release"]')).toBeNull();
    httpMock.verify();
  });

  it('has zero critical/serious WCAG violations with the review block open', async () => {
    TestBed.resetTestingModule();
    const { fixture, httpMock } = setupReview(REVIEW_STUB);
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    httpMock.verify();
  }, 30000);
});

describe('CourseDetailAdminComponent - instructor checklist (CHO-2316)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders one checkbox per tenant instructor, none pre-checked', () => {
    TestBed.resetTestingModule();
    const { element, httpMock } = setupReview(REVIEW_STUB, ['gcid-a', 'gcid-b']);
    const boxes = element.querySelectorAll(
      '[data-testid="course-detail-instructor-list"] input[type="checkbox"]',
    );
    expect(boxes.length).toBe(2);
    expect(
      Array.from(boxes).every((b) => !(b as HTMLInputElement).checked),
    ).toBe(true);
    httpMock.verify();
  });

  it('pre-checks instructors already on the course', () => {
    TestBed.resetTestingModule();
    const { element, httpMock } = setupReview(
      { ...REVIEW_STUB, instructor_gcids: ['gcid-a'] },
      ['gcid-a', 'gcid-b'],
    );
    const boxA = element.querySelector(
      '[data-testid="course-detail-instructor-gcid-a"]',
    ) as HTMLInputElement;
    const boxB = element.querySelector(
      '[data-testid="course-detail-instructor-gcid-b"]',
    ) as HTMLInputElement;
    expect(boxA.checked).toBe(true);
    expect(boxB.checked).toBe(false);
    httpMock.verify();
  });

  it('ticking an instructor adds its gcid to the release selection', () => {
    TestBed.resetTestingModule();
    const { fixture, element, component, httpMock } = setupReview(REVIEW_STUB, [
      'gcid-a',
    ]);
    const box = element.querySelector(
      '[data-testid="course-detail-instructor-gcid-a"]',
    ) as HTMLInputElement;
    box.click();
    fixture.detectChanges();
    expect(component.releaseDraft().instructorGcids).toEqual(['gcid-a']);
    expect(component.canRelease()).toBe(true);
    httpMock.verify();
  });

  it('shows a fail-honest empty state when the tenant has no instructors', () => {
    TestBed.resetTestingModule();
    const { element, httpMock } = setupReview(REVIEW_STUB, []);
    expect(
      element.querySelector('[data-testid="course-detail-instructors-empty"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="course-detail-instructor-list"]'),
    ).toBeNull();
    httpMock.verify();
  });

  it('shows a fail-loud error + retry when the roster GET fails', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CourseDetailAdminComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    const fixture = TestBed.createComponent(CourseDetailAdminComponent);
    fixture.componentRef.setInput('courseId', 'cspo-2026');
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushCourseGets(httpMock, 'cspo-2026', REVIEW_STUB);
    flushCourseContent(httpMock);
    fixture.detectChanges();
    // Fail the roster GET instead of flushing a list.
    httpMock
      .match((r) => r.url.includes('/api/v1/admin/tenant-members'))
      .forEach((r) =>
        r.flush({}, { status: 503, statusText: 'Service Unavailable' }),
      );
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(
      element.querySelector('[data-testid="course-detail-instructors-error"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="course-detail-instructors-retry"]'),
    ).not.toBeNull();
    httpMock.verify();
  });
});

describe('CourseDetailAdminComponent — release / reject validation', () => {
  let fixture: ComponentFixture<CourseDetailAdminComponent>;
  let httpMock: HttpTestingController;
  let component: CourseDetailAdminComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setupReview(REVIEW_STUB);
    fixture = built.fixture;
    httpMock = built.httpMock;
    component = built.component;
    element = built.element;
    component.updateRelease('instructorGcids', ['gcid-admin']);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('allows release with a valid price + non-empty roster', () => {
    expect(component.canRelease()).toBe(true);
  });

  it('blocks release when the roster is empty', () => {
    component.updateRelease('instructorGcids', []);
    expect(component.canRelease()).toBe(false);
  });

  it('blocks release when the price is not a number', () => {
    component.updateRelease('priceSgdDollars', 'abc');
    expect(component.canRelease()).toBe(false);
  });

  it('blocks release when the price is negative', () => {
    component.updateRelease('priceSgdDollars', '-5');
    expect(component.canRelease()).toBe(false);
  });

  it('allows a zero (free) price', () => {
    component.updateRelease('priceSgdDollars', '0');
    expect(component.canRelease()).toBe(true);
  });

  it('blocks release while a submit is in flight', () => {
    component.releaseAction.set({ status: 'submitting' });
    expect(component.canRelease()).toBe(false);
  });

  it('blocks reject when the reason is blank', () => {
    component.rejectReason.set('   ');
    expect(component.canReject()).toBe(false);
  });

  it('allows reject with a non-empty reason', () => {
    component.rejectReason.set('Needs more atoms');
    expect(component.canReject()).toBe(true);
  });

  it('reflects the disabled state on the release + reject CTAs in the DOM', () => {
    component.updateRelease('instructorGcids', []);
    fixture.detectChanges();
    const releaseCta = element.querySelector(
      '[data-testid="course-detail-release"]',
    ) as HTMLButtonElement;
    const rejectCta = element.querySelector(
      '[data-testid="course-detail-reject"]',
    ) as HTMLButtonElement;
    expect(releaseCta.disabled).toBe(true); // empty roster
    expect(rejectCta.disabled).toBe(true); // blank reason
  });
});

describe('CourseDetailAdminComponent — release submission', () => {
  let fixture: ComponentFixture<CourseDetailAdminComponent>;
  let httpMock: HttpTestingController;
  let component: CourseDetailAdminComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setupReview(REVIEW_STUB);
    fixture = built.fixture;
    httpMock = built.httpMock;
    component = built.component;
    element = built.element;
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('POSTs the release request with cents-converted price + parsed roster, then refetches', () => {
    component.updateRelease('priceSgdDollars', '49.50');
    component.updateRelease('sfEligible', true);
    component.updateRelease('instructorGcids', ['gcid-a', 'gcid-b', 'gcid-c']);
    component.updateRelease('scheduledOpenAt', '2026-07-01T09:00');
    fixture.detectChanges();

    component.release('cspo-2026');

    const post = httpMock.expectOne(
      (r) => r.url === RELEASE_URL && r.method === 'POST',
    );
    expect(post.request.body.price_sgd_cents).toBe(4950);
    expect(post.request.body.sf_eligible).toBe(true);
    expect(post.request.body.instructor_gcids).toEqual(['gcid-a', 'gcid-b', 'gcid-c']);
    expect(typeof post.request.body.scheduled_open_at).toBe('string');
    post.flush({ ...REVIEW_STUB, state: 'PUBLISHED' });
    fixture.detectChanges();

    // success → reload → two refetch GETs (display + raw projections).
    expect(flushCourseGets(httpMock, 'cspo-2026', { ...REVIEW_STUB, state: 'PUBLISHED' })).toBe(2);
    flushCourseContent(httpMock);
    fixture.detectChanges();

    expect(component.releaseAction().status).toBe('success');
    expect(component.isAwaitingReview()).toBe(false);
    expect(element.querySelector('[data-testid="course-detail-review"]')).toBeNull();
  });

  it('omits scheduled_open_at when no schedule is set', () => {
    component.updateRelease('instructorGcids', ['gcid-a']);
    component.release('cspo-2026');
    const post = httpMock.expectOne((r) => r.url === RELEASE_URL);
    expect(post.request.body.scheduled_open_at).toBeUndefined();
    post.flush({ ...REVIEW_STUB, state: 'PUBLISHED' });
    fixture.detectChanges();
    flushCourseGets(httpMock, 'cspo-2026', { ...REVIEW_STUB, state: 'PUBLISHED' });
    flushCourseContent(httpMock);
    fixture.detectChanges();
  });

  it('does nothing when release is invoked while canRelease is false', () => {
    component.updateRelease('instructorGcids', []);
    component.release('cspo-2026');
    // No POST issued — verify() in afterEach asserts no stray request.
    expect(component.releaseAction().status).toBe('idle');
  });

  it('surfaces a 409 conflict error key and keeps the review block open', () => {
    component.updateRelease('instructorGcids', ['gcid-a']);
    component.release('cspo-2026');
    httpMock
      .expectOne((r) => r.url === RELEASE_URL)
      .flush({}, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(component.releaseError()).toBe('rplus.course_review.error_release_conflict');
    expect(component.isAwaitingReview()).toBe(true);
    const err = element.querySelector('[data-testid="course-detail-release-error"]');
    expect(err?.textContent).toContain('rplus.course_review.error_release_conflict');
  });

  it('maps a 404 release error to the not_found key', () => {
    component.updateRelease('instructorGcids', ['gcid-a']);
    component.release('cspo-2026');
    httpMock
      .expectOne((r) => r.url === RELEASE_URL)
      .flush({}, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(component.releaseError()).toBe('rplus.course_review.error_release_not_found');
  });

  it('maps an unknown (no-status) release error to the generic key', () => {
    component.updateRelease('instructorGcids', ['gcid-a']);
    component.release('cspo-2026');
    httpMock
      .expectOne((r) => r.url === RELEASE_URL)
      .error(new ProgressEvent('network'));
    fixture.detectChanges();
    expect(component.releaseError()).toBe('rplus.course_review.error_release_generic');
  });

  it('maps a 5xx release error to the upstream key', () => {
    component.updateRelease('instructorGcids', ['gcid-a']);
    component.release('cspo-2026');
    httpMock
      .expectOne((r) => r.url === RELEASE_URL)
      .flush({}, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(component.releaseError()).toBe('rplus.course_review.error_release_upstream');
  });
});

describe('CourseDetailAdminComponent — reject submission', () => {
  let fixture: ComponentFixture<CourseDetailAdminComponent>;
  let httpMock: HttpTestingController;
  let component: CourseDetailAdminComponent;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setupReview(REVIEW_STUB);
    fixture = built.fixture;
    httpMock = built.httpMock;
    component = built.component;
    element = built.element;
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('POSTs the trimmed review notes, then refetches + clears the form', () => {
    component.rejectReason.set('  Add a worked example  ');
    component.reject('cspo-2026');
    const post = httpMock.expectOne(
      (r) => r.url === REJECT_URL && r.method === 'POST',
    );
    expect(post.request.body.review_notes).toBe('Add a worked example');
    post.flush({ ...REVIEW_STUB, state: 'DRAFT' });
    fixture.detectChanges();

    expect(flushCourseGets(httpMock, 'cspo-2026', { ...REVIEW_STUB, state: 'DRAFT' })).toBe(2);
    flushCourseContent(httpMock);
    fixture.detectChanges();

    expect(component.rejectAction().status).toBe('success');
    expect(component.rejectReason()).toBe('');
  });

  it('does nothing when reject is invoked with a blank reason', () => {
    component.rejectReason.set('');
    component.reject('cspo-2026');
    expect(component.rejectAction().status).toBe('idle');
  });

  it('surfaces a 403 unauthorised error key and keeps the review block open', () => {
    component.rejectReason.set('Reject please');
    component.reject('cspo-2026');
    httpMock
      .expectOne((r) => r.url === REJECT_URL)
      .flush({}, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(component.rejectError()).toBe('rplus.course_review.error_forbidden');
    expect(component.isAwaitingReview()).toBe(true);
    const err = element.querySelector('[data-testid="course-detail-reject-error"]');
    expect(err?.textContent).toContain('rplus.course_review.error_forbidden');
  });

  it('maps a 409 reject error to the conflict key', () => {
    component.rejectReason.set('Reject please');
    component.reject('cspo-2026');
    httpMock
      .expectOne((r) => r.url === REJECT_URL)
      .flush({}, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(component.rejectError()).toBe('rplus.course_review.error_reject_conflict');
  });

  it('maps a 401 reject error to the session-expired key, not the 403 one', () => {
    // The pair is the point. 401 and 403 shared one key until R50, under a
    // sentence that named a role requirement the backend does not enforce.
    component.rejectReason.set('Reject please');
    component.reject('cspo-2026');
    httpMock
      .expectOne((r) => r.url === REJECT_URL)
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(component.rejectError()).toBe('rplus.course_review.error_session_expired');
  });
});
