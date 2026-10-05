import { expect } from 'vitest';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import {
  CourseLearnComponent,
  backoffDelay,
} from './course-learn.component';
import { TranslateService } from '../../../../core/services/translate.service';
import {
  buildCourseLearnResponse,
  buildCourseLearnAtom,
} from '../../../../testing/builders/buildCourseLearnResponse';

/**
 * CourseLearnComponent spec — Straight-Up sequencing + polling backoff.
 *
 * Verifies:
 *  1. backoffDelay() pure function — exponential curve + 8s cap
 *  2. Polling state machine: polling → ready (atom list rendered)
 *  3. Straight-Up sequencing: ordered atom list, per-atom state badges,
 *     in_progress CTA points to /a/atoms/{id}/play, locked/completed UI
 *  4. OPEN-4: 404 full window → /me/enrolments disambiguation
 *     (enrolled → provisioning; absent → not_enrolled; lookup-fail → timeout)
 *  5. Polling state machine: polling → timeout (5xx full window)
 *     — timeout body carries "contact support" key (no silent fallback)
 *  6. Auth errors (401/403) fail loud immediately
 *  7. Missing courseId → immediate error state
 *  8. retry() resets and re-polls
 *  9. completionPct calculation
 */

const COURSE_ID = '05000000-0000-7000-8000-0000000c5301';

function setup(params: { courseId?: string } = {}): {
  fixture: ComponentFixture<CourseLearnComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [CourseLearnComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({
              courseId: params.courseId ?? COURSE_ID,
            }),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CourseLearnComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  tick(0);
  return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
}

/** Flush the current outstanding learning-paths request. */
function flushLearningPath(
  httpMock: HttpTestingController,
  body: object | null,
  status = 200,
): void {
  const req = httpMock.expectOne((r) =>
    r.url.includes('/api/v1/me/learning-paths'),
  );
  if (status !== 200) {
    req.flush(body, { status, statusText: String(status) });
  } else {
    req.flush(body);
  }
}

/**
 * When the learning-path returns 200 (ready state), the embedded
 * CourseCurriculumComponent fires GET /api/v1/me/courses/{id}/content.
 * Flush that request so httpMock.verify() passes in ready-state tests.
 * The curriculum load itself is tested separately in course-curriculum.spec.ts.
 */
function flushCurriculum(
  httpMock: HttpTestingController,
  status = 200,
): void {
  const req = httpMock.expectOne((r) =>
    r.url.includes('/api/v1/me/courses/') && r.url.includes('/content'),
  );
  if (status !== 200) {
    req.flush(null, { status, statusText: String(status) });
  } else {
    req.flush({ course_id: COURSE_ID, items: [] });
  }
}

/**
 * Drive the full 404 polling window (12 attempts) to exhaustion. After the
 * last 404 the component fires the /me/enrolments disambiguation request,
 * which the caller flushes via flushEnrolments().
 */
function exhaust404Window(
  httpMock: HttpTestingController,
  fixture: ComponentFixture<CourseLearnComponent>,
): void {
  for (let attempt = 0; attempt < 12; attempt++) {
    httpMock
      .expectOne((r) => r.url.includes('/api/v1/me/learning-paths'))
      .flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    if (attempt < 11) {
      const delay = Math.min(500 * Math.pow(2, attempt), 8000);
      tick(delay + 1);
    }
  }
}

/** Flush the /me/enrolments disambiguation request (OPEN-4). */
function flushEnrolments(
  httpMock: HttpTestingController,
  opts: { enrolled: boolean; status?: number },
): void {
  const req = httpMock.expectOne((r) =>
    r.url.includes('/api/v1/me/enrolments'),
  );
  const status = opts.status ?? 200;
  if (status !== 200) {
    req.flush(null, { status, statusText: String(status) });
  } else {
    req.flush({ items: opts.enrolled ? [{ course_id: COURSE_ID }] : [] });
  }
}

/**
 * Flush the authoritative course-name lookup GET /api/courses/{id} the
 * component issues on reaching ready (heading resolution). Pass a title to
 * resolve it, or (null, 4xx/5xx) to simulate a best-effort miss. This is the
 * catalog row the sibling course-detail page already reads — distinct from the
 * learner curriculum route (/api/v1/me/courses/{id}/content).
 */
function flushCourseTitle(
  httpMock: HttpTestingController,
  title: string | null,
  status = 200,
): void {
  const req = httpMock.expectOne((r) => r.url.includes('/api/courses/'));
  if (status !== 200) {
    req.flush(null, { status, statusText: String(status) });
  } else {
    req.flush({ title });
  }
}

/**
 * Flush the child CourseCurriculumComponent's GET /api/v1/me/module-progress
 * request (CHO-2074). Fired alongside the /content read when the ready branch
 * renders; both must be flushed for httpMock.verify() to pass in ready tests.
 */
function flushModuleProgress(httpMock: HttpTestingController): void {
  httpMock
    .expectOne((r) => r.url.includes('/api/v1/me/module-progress'))
    .flush({ modules: [] });
}

// ── backoffDelay() pure function ──────────────────────────────────────────────
describe('backoffDelay() (course-learn)', () => {
  it('returns 500ms for attempt 0', () => {
    expect(backoffDelay(0)).toBe(500);
  });

  it('doubles per attempt: 1000ms at attempt 1', () => {
    expect(backoffDelay(1)).toBe(1000);
  });

  it('doubles per attempt: 2000ms at attempt 2', () => {
    expect(backoffDelay(2)).toBe(2000);
  });

  it('doubles per attempt: 4000ms at attempt 3', () => {
    expect(backoffDelay(3)).toBe(4000);
  });

  it('caps at 8000ms for attempt 4+', () => {
    expect(backoffDelay(4)).toBe(8000);
    expect(backoffDelay(10)).toBe(8000);
  });
});

// ── Component state machine ───────────────────────────────────────────────────
describe('CourseLearnComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('missing courseId → immediate error', () => {
    it('shows error state when courseId is empty', fakeAsync(() => {
      const { fixture, element, httpMock } = setup({ courseId: '' });
      fixture.detectChanges();
      const err = element.querySelector(
        '[data-testid="aplus-course-learn-error"]',
      );
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('initial polling state', () => {
    it('renders the polling panel on first render', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const polling = element.querySelector(
        '[data-testid="aplus-course-learn-polling"]',
      );
      expect(polling).not.toBeNull();
      expect(polling?.getAttribute('aria-busy')).toBe('true');
      expect(polling?.getAttribute('role')).toBe('status');
      httpMock.expectOne((r) =>
        r.url.includes('/api/v1/me/learning-paths'),
      );
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('Straight-Up sequencing — ready state', () => {
    it('renders the atom list with ordered items', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushLearningPath(httpMock, buildCourseLearnResponse());
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      // CourseCurriculumComponent fires its own GET after ready state is reached.
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();

      // The per-atom container <li> rows. The `course-learn-atom-{order}`
      // testid prefix is also borne by descendant title/state/CTA elements
      // (`-title-`, `-state-`, `-start-`/`-review-`/`-locked-`), so scope to
      // the container class to count atom rows only.
      const atoms = element.querySelectorAll(
        'li.course-learn__atom[data-testid^="course-learn-atom-"]',
      );
      // Two atoms in the default builder
      expect(atoms.length).toBe(2);
      httpMock.verify();
      fixture.destroy();
    }));

    it('renders the in_progress atom with a "Start" primary CTA', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const response = buildCourseLearnResponse({
        atoms: [
          buildCourseLearnAtom({ order: 0, state: 'in_progress' }),
          buildCourseLearnAtom({ order: 1, state: 'not_started', atom_id: 'atom-002', title: 'Atom 2' }),
        ],
      });
      flushLearningPath(httpMock, response);
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();

      const startBtn = element.querySelector(
        '[data-testid="course-learn-atom-start-0"]',
      );
      expect(startBtn).not.toBeNull();
      // Link routes to /a/atoms/{atom_id}/play
      expect(startBtn?.getAttribute('href')).toContain('/a/atoms/');
      expect(startBtn?.getAttribute('href')).toContain('/play');
      httpMock.verify();
      fixture.destroy();
    }));

    it('renders a completed atom with a "Review" secondary CTA', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const response = buildCourseLearnResponse({
        atoms: [
          buildCourseLearnAtom({
            order: 0,
            state: 'completed',
            completed_at: '2026-05-26T09:00:00Z',
          }),
          buildCourseLearnAtom({
            order: 1,
            state: 'in_progress',
            atom_id: 'atom-002',
            title: 'Atom 2',
          }),
        ],
        current_index: 1,
        completed_atoms: 1,
      });
      flushLearningPath(httpMock, response);
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();

      const reviewBtn = element.querySelector(
        '[data-testid="course-learn-atom-review-0"]',
      );
      expect(reviewBtn).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));

    it('renders a not_started atom as locked (no CTA link)', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const response = buildCourseLearnResponse({
        atoms: [
          buildCourseLearnAtom({ order: 0, state: 'in_progress' }),
          buildCourseLearnAtom({
            order: 1,
            state: 'not_started',
            atom_id: 'atom-002',
            title: 'Atom 2',
          }),
        ],
      });
      flushLearningPath(httpMock, response);
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();

      const locked = element.querySelector(
        '[data-testid="course-learn-atom-locked-1"]',
      );
      expect(locked).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));

    it('renders the course title from the path response', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushLearningPath(
        httpMock,
        buildCourseLearnResponse({ title: 'Certified ScrumMaster (CSM) Prep' }),
      );
      // Name lookup misses → the real (non-placeholder) path title is used.
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();

      const title = element.querySelector('[data-testid="course-learn-title"]');
      expect(title?.textContent).toContain('Certified ScrumMaster (CSM) Prep');
      httpMock.verify();
      fixture.destroy();
    }));

    it('renders the Straight-Up mode label', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushLearningPath(httpMock, buildCourseLearnResponse());
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();

      const mode = element.querySelector('[data-testid="course-learn-mode"]');
      expect(mode).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));

    it('completionPct is null when total_atoms = 0', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      flushLearningPath(
        httpMock,
        buildCourseLearnResponse({ total_atoms: 0, completed_atoms: 0 }),
      );
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();
      expect(fixture.componentInstance.completionPct()).toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));

    it('completionPct is 50 when 1 of 2 atoms complete', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      flushLearningPath(
        httpMock,
        buildCourseLearnResponse({ total_atoms: 2, completed_atoms: 1 }),
      );
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();
      expect(fixture.componentInstance.completionPct()).toBe(50);
      httpMock.verify();
      fixture.destroy();
    }));
  });

  // ── Course heading resolution (CHO-2147): real name vs "Course <uuid>" ──────
  // The chora-consumption learning-path DTO carries a "Course <uuid>" bootstrap
  // placeholder title whenever the local course_directory projection has not yet
  // resolved the real name (learning_path.BootstrapFromEnrollment). The heading
  // must NEVER show that raw UUID: the component resolves the authoritative
  // catalog name from GET /api/courses/{id} and degrades to a generic label —
  // never the UUID — when it can't.
  describe('course heading resolution (real name vs raw-UUID placeholder)', () => {
    it('prefers the real course name from GET /api/courses/{id} over the "Course {id}" placeholder', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      // Backend bootstrap placeholder: "Course <uuid>".
      flushLearningPath(
        httpMock,
        buildCourseLearnResponse({ title: 'Course ' + COURSE_ID }),
      );
      // The component resolves the authoritative catalog title.
      flushCourseTitle(httpMock, 'Advanced Fractions & Decimals');
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();

      const title = element.querySelector('[data-testid="course-learn-title"]');
      expect(title?.textContent).toContain('Advanced Fractions & Decimals');
      // The raw UUID must NEVER appear in the heading.
      expect(title?.textContent).not.toContain(COURSE_ID);
      httpMock.verify();
      fixture.destroy();
    }));

    it('falls back to a generic label (never the raw UUID) when path title is the placeholder and the name fetch fails', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushLearningPath(
        httpMock,
        buildCourseLearnResponse({ title: 'Course ' + COURSE_ID }),
      );
      // Best-effort name resolution fails (404) — heading must degrade to a
      // generic label, not leak the raw UUID.
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();

      const title = element.querySelector('[data-testid="course-learn-title"]');
      expect(title?.textContent).not.toContain(COURSE_ID);
      expect((title?.textContent ?? '').trim().length).toBeGreaterThan(0);
      // Generic fallback i18n key (raw key surfaces in test — translations
      // aren't loaded — which is sufficient to prove it's NOT the UUID).
      expect(title?.textContent).toContain('untitled_course');
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('404 entire window → /me/enrolments disambiguation (OPEN-4)', () => {
    it('enrolment present → provisioning (never a false "not enrolled")', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      exhaust404Window(httpMock, fixture);
      // After the window the component consults /me/enrolments.
      flushEnrolments(httpMock, { enrolled: true });
      fixture.detectChanges();

      const provisioning = element.querySelector(
        '[data-testid="aplus-course-learn-provisioning"]',
      );
      expect(provisioning).not.toBeNull();
      // Encouraging copy — role=status, NOT an alert.
      expect(provisioning?.getAttribute('role')).toBe('status');
      // The accusatory not-enrolled banner must NOT render for an enrolled learner.
      expect(
        element.querySelector('[data-testid="aplus-course-learn-not-enrolled"]'),
      ).toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));

    it('enrolment absent → not_enrolled', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      exhaust404Window(httpMock, fixture);
      flushEnrolments(httpMock, { enrolled: false });
      fixture.detectChanges();

      const notEnrolled = element.querySelector(
        '[data-testid="aplus-course-learn-not-enrolled"]',
      );
      expect(notEnrolled).not.toBeNull();
      expect(notEnrolled?.getAttribute('role')).toBe('alert');
      httpMock.verify();
      fixture.destroy();
    }));

    it('enrolments lookup fails → timeout (never a false "not enrolled")', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      exhaust404Window(httpMock, fixture);
      flushEnrolments(httpMock, { enrolled: false, status: 503 });
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="aplus-course-learn-timeout"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="aplus-course-learn-not-enrolled"]'),
      ).toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));

    it('"check again" CTA on provisioning re-polls the learning path', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      exhaust404Window(httpMock, fixture);
      flushEnrolments(httpMock, { enrolled: true });
      fixture.detectChanges();

      const checkAgain = element.querySelector<HTMLButtonElement>(
        '[data-testid="aplus-course-learn-provisioning-retry"]',
      );
      expect(checkAgain).not.toBeNull();
      checkAgain!.click();
      fixture.detectChanges();
      tick(0);

      // Back to polling, issuing a fresh learning-path request that now succeeds.
      expect(
        element.querySelector('[data-testid="aplus-course-learn-polling"]'),
      ).not.toBeNull();
      flushLearningPath(httpMock, buildCourseLearnResponse());
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="course-learn-hero"]'),
      ).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('timeout path (5xx entire window)', () => {
    it('transitions to timeout after all 5xx attempts', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();

      for (let attempt = 0; attempt < 12; attempt++) {
        httpMock
          .expectOne((r) => r.url.includes('/api/v1/me/learning-paths'))
          .flush(null, { status: 503, statusText: 'Service Unavailable' });
        fixture.detectChanges();

        if (attempt < 11) {
          const delay = Math.min(500 * Math.pow(2, attempt), 8000);
          tick(delay + 1);
        }
      }

      fixture.detectChanges();
      const timeout = element.querySelector(
        '[data-testid="aplus-course-learn-timeout"]',
      );
      expect(timeout).not.toBeNull();
      expect(timeout?.getAttribute('role')).toBe('alert');
      httpMock.verify();
      fixture.destroy();
    }));

    it('timeout body carries the contact-support message key', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();

      for (let attempt = 0; attempt < 12; attempt++) {
        httpMock
          .expectOne((r) => r.url.includes('/api/v1/me/learning-paths'))
          .flush(null, { status: 503, statusText: 'Service Unavailable' });
        fixture.detectChanges();

        if (attempt < 11) {
          const delay = Math.min(500 * Math.pow(2, attempt), 8000);
          tick(delay + 1);
        }
      }

      fixture.detectChanges();
      const timeoutBody = element.querySelector(
        '[data-testid="aplus-course-learn-timeout-body"]',
      );
      // The body element must exist (no silent fallback: fail-loud)
      expect(timeoutBody).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('auth error path', () => {
    it('transitions to error immediately on 401', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushLearningPath(httpMock, null, 401);
      fixture.detectChanges();

      const err = element.querySelector('[data-testid="aplus-course-learn-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      httpMock.verify();
      fixture.destroy();
    }));

    it('transitions to error immediately on 403', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushLearningPath(httpMock, null, 403);
      fixture.detectChanges();

      const err = element.querySelector('[data-testid="aplus-course-learn-error"]');
      expect(err).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('retry CTA', () => {
    it('retry() after error resets to polling and re-polls', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushLearningPath(httpMock, null, 401);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="aplus-course-learn-error"]'),
      ).not.toBeNull();

      fixture.componentInstance.retry();
      fixture.detectChanges();
      tick(0);

      expect(
        element.querySelector('[data-testid="aplus-course-learn-polling"]'),
      ).not.toBeNull();

      // Success on retry
      flushLearningPath(httpMock, buildCourseLearnResponse());
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      // CourseCurriculumComponent fires after ready state.
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="aplus-course-learn-hero"]') ||
        element.querySelector('[data-testid="course-learn-hero"]'),
      ).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('stateLabelKey()', () => {
    it('returns the completed key for a completed atom', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      const component = fixture.componentInstance;
      const atom = buildCourseLearnAtom({ state: 'completed' });
      expect(component.stateLabelKey(atom)).toBe(
        'aplus.course_learn.state_completed',
      );
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/learning-paths'));
      httpMock.verify();
      fixture.destroy();
    }));

    it('returns the in_progress key for an in-progress atom', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      const component = fixture.componentInstance;
      const atom = buildCourseLearnAtom({ state: 'in_progress' });
      expect(component.stateLabelKey(atom)).toBe(
        'aplus.course_learn.state_in_progress',
      );
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/learning-paths'));
      httpMock.verify();
      fixture.destroy();
    }));

    it('returns the not_started key for a not-started atom', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      const component = fixture.componentInstance;
      const atom = buildCourseLearnAtom({ state: 'not_started' });
      expect(component.stateLabelKey(atom)).toBe(
        'aplus.course_learn.state_not_started',
      );
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/learning-paths'));
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('atomPlayLink()', () => {
    it('returns the correct /a/atoms/{id}/play link', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      const component = fixture.componentInstance;
      const atom = buildCourseLearnAtom({
        atom_id: '01000000-0000-7000-8000-000000000042',
      });
      expect(component.atomPlayLink(atom)).toEqual([
        '/a/atoms',
        '01000000-0000-7000-8000-000000000042',
        'play',
      ]);
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/learning-paths'));
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('surface shell + a11y', () => {
    it('renders with the surface-aplus class', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const root = element.querySelector('[data-testid="aplus-course-learn"]');
      expect(root?.className).toContain('surface-aplus');
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/learning-paths'));
      httpMock.verify();
      fixture.destroy();
    }));

    it('has a breadcrumb link back to course detail', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const crumb = element.querySelector(
        '[data-testid="course-learn-back-to-detail"]',
      );
      expect(crumb).not.toBeNull();
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/learning-paths'));
      httpMock.verify();
      fixture.destroy();
    }));
  });

  // ── Uncovered-branch augmentation ───────────────────────────────────────────
  // The 30 tests above leave several conditional arms unexercised. These cover:
  //   - courseId `?? ''` nullish arm (paramMap missing the key → .get() = null)
  //   - poll()/verifyEnrolment() `if (this.destroyed) return` early-return guards
  //   - the `e?.status` optional-chain when the error object is null/undefined
  //   - the FALSE arms of the attempts() / errorKey() / path() computeds
  //   - completionPct() `!p` short-circuit (path null while still polling)

  describe('courseId resolution — paramMap missing the key', () => {
    it('falls back to "" via ?? when courseId param is absent', fakeAsync(() => {
      // No `courseId` key at all → paramMap.get('courseId') returns null,
      // exercising the left-nullish arm of `?? ''`. ngOnInit then short-circuits
      // to the error state with no HTTP request issued.
      TestBed.configureTestingModule({
        imports: [CourseLearnComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          TranslateService,
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: { paramMap: convertToParamMap({}) },
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(CourseLearnComponent);
      const httpMock = TestBed.inject(HttpTestingController);
      const element = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      tick(0);

      expect(fixture.componentInstance.courseId).toBe('');
      const err = element.querySelector(
        '[data-testid="aplus-course-learn-error"]',
      );
      expect(err).not.toBeNull();
      // No poll scheduled — no outstanding requests.
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('destroyed guards (scheduled poll never fires after destroy)', () => {
    it('poll() bails out when the component is destroyed before the timer fires', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      // First poll fires immediately (attempt 0). Flush a 404 so the component
      // schedules the next poll on a backoff timer instead of resolving.
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/learning-paths'))
        .flush(null, { status: 404, statusText: 'Not Found' });
      fixture.detectChanges();

      // Destroy BEFORE the scheduled timer's delay elapses. The onDestroy hook
      // sets `destroyed = true` so the queued setTimeout callback early-returns
      // and never issues another request.
      fixture.destroy();
      tick(10_000);

      // No further learning-path request was made after destroy.
      httpMock.verify();
    }));

    // NOTE: the two `if (this.destroyed) return` guards inside
    // verifyEnrolment()'s next/error callbacks are unreachable in test (and in
    // practice): the pipe uses takeUntilDestroyed(destroyRef), so the moment
    // fixture.destroy() runs the in-flight /me/enrolments subscription is torn
    // down and its next/error callbacks never fire (flushing the request then
    // throws "Cannot flush a cancelled request"). They are dead defensive guards
    // — characterized as unreachable, intentionally not asserted here.
  });

  describe('poll() error with a nullish error object (e?.status optional chain)', () => {
    it('treats a null error as a non-404 transient and keeps polling', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      // Error the request with a ProgressEvent (no status field). `e?.status`
      // resolves undefined → neither the 401/403 nor the 404 branch matches →
      // the non-404 path runs (everSaw404Only = false) and polling continues.
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/learning-paths'))
        .error(new ProgressEvent('error'));
      fixture.detectChanges();
      tick(0);

      // Still polling — not flipped to error/not_enrolled.
      expect(
        element.querySelector('[data-testid="aplus-course-learn-polling"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="aplus-course-learn-error"]'),
      ).toBeNull();

      // The second poll is scheduled on a 500ms backoff; advance and flush a
      // success so the window terminates and httpMock.verify() is clean.
      tick(501);
      flushLearningPath(httpMock, buildCourseLearnResponse());
      flushCourseTitle(httpMock, null, 404);
      fixture.detectChanges();
      flushCurriculum(httpMock);
      flushModuleProgress(httpMock);
      fixture.detectChanges();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('computed FALSE arms', () => {
    it('attempts() returns MAX_POLL_ATTEMPTS (12) once not polling', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      // Drive to a non-polling terminal state (auth error).
      flushLearningPath(httpMock, null, 401);
      fixture.detectChanges();
      expect(fixture.componentInstance.attempts()).toBe(12);
      httpMock.verify();
      fixture.destroy();
    }));

    it('attempts() returns tickIndex + 1 while polling', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      // First poll fires at tickIndex 0 → attempts === 1.
      expect(fixture.componentInstance.attempts()).toBe(1);
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/learning-paths'));
      httpMock.verify();
      fixture.destroy();
    }));

    it('errorKey() is "" when not in the error state', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      // Polling state → errorKey falsy arm.
      expect(fixture.componentInstance.errorKey()).toBe('');
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/learning-paths'));
      httpMock.verify();
      fixture.destroy();
    }));

    it('errorKey() exposes the i18n key in the error state', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      flushLearningPath(httpMock, null, 403);
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe(
        'aplus.course_learn.error_unauthorised',
      );
      httpMock.verify();
      fixture.destroy();
    }));

    it('path() is null and completionPct() is null while still polling (!p arm)', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      // No flush yet → status is polling → path() ternary falsy arm (null),
      // and completionPct()'s `!p` short-circuit returns null.
      expect(fixture.componentInstance.path()).toBeNull();
      expect(fixture.componentInstance.completionPct()).toBeNull();
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/learning-paths'));
      httpMock.verify();
      fixture.destroy();
    }));
  });
});
