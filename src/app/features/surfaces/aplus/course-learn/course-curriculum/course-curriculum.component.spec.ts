/**
 * CourseCurriculumComponent spec — CHO-1612.
 *
 * Verifies:
 *   1. Loading state on init
 *   2. Ready state — renders all items with correct kind badges, icons, CTAs
 *   3. Atom items get a routerLink CTA to /a/atoms/{ref}/play
 *   4. Assessment items get a routerLink CTA to /a/me/assessments/{ref}
 *   5. Video/youtube/document/live_classroom items get an <a href> CTA
 *   6. Empty state when items array is empty
 *   7. Error state on HTTP failure + retry re-fetches
 *   8. kindLabelKey() returns the correct translation key per kind
 *   9. actionLabelKey() returns the correct translation key per kind
 *  10. icon() returns the correct icon name per kind
 */
// NB: describe/it/beforeEach/afterEach come from the GLOBAL Vitest API
// (globals:true), NOT an explicit `vitest` import — AnalogJS's setup-zone
// patches the globals to run each test body inside a ProxyZone, which is what
// Angular's fakeAsync()/tick() require. Importing them from 'vitest' would use
// the unpatched bindings and raise "Expected to be running in 'ProxyZone'".
import { expect } from 'vitest';
import {
  ComponentFixture,
  TestBed,
  fakeAsync,
} from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { CourseCurriculumComponent } from './course-curriculum.component';
import type { CourseContentItem } from '../../../../shared/course-content/course-content.model';
import { TranslateService } from '../../../../../core/services/translate.service';
import {
  buildCourseContentResponse,
  buildCourseContentItem,
} from '../../../../../testing/builders/buildCourseContent';

const COURSE_ID = '05000000-0000-7000-8000-0000000c5301';

function setup(courseId: string = COURSE_ID): {
  fixture: ComponentFixture<CourseCurriculumComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [CourseCurriculumComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(CourseCurriculumComponent);
  fixture.componentRef.setInput('courseId', courseId);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
}

function flushContent(
  httpMock: HttpTestingController,
  body: object | null,
  status = 200,
): void {
  const req = httpMock.expectOne((r) =>
    r.url.includes('/api/v1/me/courses/') && r.url.includes('/content'),
  );
  if (status !== 200) {
    req.flush(body, { status, statusText: String(status) });
  } else {
    req.flush(body);
  }
  drainModuleProgress(httpMock);
}

// W7 CHO-2074 — the module-progress GET fires alongside the content GET on load;
// drain it (default: empty modules) or httpMock.verify() trips.
function drainModuleProgress(
  httpMock: HttpTestingController,
  modules: readonly object[] = [],
): void {
  for (const req of httpMock.match((r) => r.url.includes('/api/v1/me/module-progress'))) {
    req.flush({ course_id: 'c1', modules });
  }
}

// W7 CHO-2074 left the module-progress GET undrained in many pre-existing tests,
// tripping httpMock.verify(). Route every verify through a drain-then-verify so
// the (idempotent) drain clears the outstanding module-progress request first.
function verifyClean(httpMock: HttpTestingController): void {
  drainModuleProgress(httpMock);
  httpMock.verify();
}

describe('CourseCurriculumComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    // Allow each test to verify and destroy its own httpMock/fixture.
  });

  describe('loading state', () => {
    it('shows the loading panel on first render', () => {
      const { fixture, element, httpMock } = setup();
      const loading = element.querySelector('[data-testid="curriculum-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('aria-busy')).toBe('true');
      httpMock.expectOne((r) => r.url.includes('/content'));
      drainModuleProgress(httpMock);
      verifyClean(httpMock);
      fixture.destroy();
    });
  });

  describe('ready state', () => {
    it('renders an item row for each item returned', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushContent(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      const rows = element.querySelectorAll('[data-testid^="curriculum-item-"][data-kind]');
      // Default builder has 3 items
      expect(rows.length).toBe(3);
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('renders the learner module-completion summary + bar (CHO-2074)', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      // Flush /content, then the module-progress GET with one completed module.
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/courses/') && r.url.includes('/content'))
        .flush(buildCourseContentResponse());
      drainModuleProgress(httpMock, [
        {
          module_id: 'mod-1',
          title: 'Unit 1',
          position: 0,
          total: 1,
          completed_count: 1,
          is_complete: true,
        },
      ]);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="course-module-progress"]')).not.toBeNull();
      const mod = element.querySelector('[data-testid="module-progress-mod-1"]');
      expect(mod).not.toBeNull();
      // The count renders verbatim (not translated) → "1/1".
      expect(mod?.querySelector('.curriculum__module-count')?.textContent).toContain('1/1');
      expect(mod?.classList.contains('curriculum__module--complete')).toBe(true);
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('renders the item title inside each row', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const response = buildCourseContentResponse({
        items: [
          buildCourseContentItem({ title: 'Introduction to Scrum', item_id: 'x1' }),
        ],
      });
      flushContent(httpMock, response);
      fixture.detectChanges();
      const title = element.querySelector('[data-testid="curriculum-item-title-x1"]');
      expect(title?.textContent).toContain('Introduction to Scrum');
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('renders an atom CTA as a routerLink pointing to /play', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const response = buildCourseContentResponse({
        items: [
          buildCourseContentItem({
            item_id: 'i-atom',
            kind: 'atom',
            ref: '01000000-0000-7000-8000-000000000077',
            position: 1,
          }),
        ],
      });
      flushContent(httpMock, response);
      fixture.detectChanges();
      const cta = element.querySelector('[data-testid="curriculum-item-cta-i-atom"]');
      expect(cta).not.toBeNull();
      expect(cta?.getAttribute('href')).toContain('/a/atoms/');
      expect(cta?.getAttribute('href')).toContain('/play');
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('renders an assessment CTA as a routerLink to /a/me/assessments/{ref}', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const response = buildCourseContentResponse({
        items: [
          buildCourseContentItem({
            item_id: 'i-asmt',
            kind: 'assessment',
            ref: '07000000-0000-7000-8000-000000000055',
            position: 1,
          }),
        ],
      });
      flushContent(httpMock, response);
      fixture.detectChanges();
      const cta = element.querySelector('[data-testid="curriculum-item-cta-i-asmt"]');
      expect(cta).not.toBeNull();
      expect(cta?.getAttribute('href')).toContain('/a/me/assessments/');
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('renders a video CTA as an <a href> with target=_blank', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const ref = 'https://cdn.example.com/video.mp4';
      const response = buildCourseContentResponse({
        items: [
          buildCourseContentItem({
            item_id: 'i-video',
            kind: 'video',
            ref,
            position: 1,
          }),
        ],
      });
      flushContent(httpMock, response);
      fixture.detectChanges();
      const cta = element.querySelector('[data-testid="curriculum-item-cta-i-video"]');
      expect(cta).not.toBeNull();
      expect(cta?.getAttribute('href')).toBe(ref);
      expect(cta?.getAttribute('target')).toBe('_blank');
      expect(cta?.getAttribute('rel')).toContain('noopener');
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('renders a youtube CTA as an <a href> with target=_blank', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const ref = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      const response = buildCourseContentResponse({
        items: [
          buildCourseContentItem({
            item_id: 'i-yt',
            kind: 'youtube',
            ref,
            position: 1,
          }),
        ],
      });
      flushContent(httpMock, response);
      fixture.detectChanges();
      const cta = element.querySelector('[data-testid="curriculum-item-cta-i-yt"]');
      expect(cta?.getAttribute('href')).toBe(ref);
      expect(cta?.getAttribute('target')).toBe('_blank');
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('renders live_classroom as a non-link instructor-led indicator (no broken UUID href)', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      // A live_classroom ref is a LiveQuiz TEMPLATE id (UUIDv7), not a URL — it
      // must never be rendered as an <a href> (that produced a broken link).
      const ref = '019e0000-0000-7000-8000-000000000abc';
      const response = buildCourseContentResponse({
        items: [
          buildCourseContentItem({
            item_id: 'i-lc',
            kind: 'live_classroom',
            ref,
            position: 1,
          }),
        ],
      });
      flushContent(httpMock, response);
      fixture.detectChanges();
      // No external-link CTA for live_classroom…
      expect(element.querySelector('[data-testid="curriculum-item-cta-i-lc"]')).toBeNull();
      // …instead a non-interactive live-session indicator (never the raw UUID as href).
      const live = element.querySelector('[data-testid="curriculum-item-live-i-lc"]');
      expect(live).toBeTruthy();
      expect(live?.tagName.toLowerCase()).not.toBe('a');
      expect(live?.getAttribute('href')).toBeNull();
      expect(element.innerHTML).not.toContain(ref);
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('attaches data-kind attribute to each item row', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const response = buildCourseContentResponse({
        items: [
          buildCourseContentItem({ item_id: 'i1', kind: 'atom', position: 1 }),
          buildCourseContentItem({ item_id: 'i2', kind: 'video', position: 2 }),
        ],
      });
      flushContent(httpMock, response);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="curriculum-item-i1"]')?.getAttribute('data-kind'),
      ).toBe('atom');
      expect(
        element.querySelector('[data-testid="curriculum-item-i2"]')?.getAttribute('data-kind'),
      ).toBe('video');
      verifyClean(httpMock);
      fixture.destroy();
    }));
  });

  describe('empty state', () => {
    it('shows the empty panel when items array is empty', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushContent(httpMock, { course_id: COURSE_ID, items: [] });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="curriculum-empty"]'),
      ).not.toBeNull();
      verifyClean(httpMock);
      fixture.destroy();
    }));
  });

  describe('error state', () => {
    it('shows the error panel on HTTP failure', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushContent(httpMock, null, 500);
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="curriculum-error"]'),
      ).not.toBeNull();
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('retry button re-issues the GET request', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushContent(httpMock, null, 500);
      fixture.detectChanges();

      const retry = element.querySelector<HTMLButtonElement>(
        '[data-testid="curriculum-retry"]',
      );
      expect(retry).not.toBeNull();
      retry!.click();
      fixture.detectChanges();

      // Should show loading again and issue a new request
      expect(
        element.querySelector('[data-testid="curriculum-loading"]'),
      ).not.toBeNull();

      // Flush the retry request with success
      flushContent(httpMock, buildCourseContentResponse());
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="curriculum-loading"]'),
      ).toBeNull();
      verifyClean(httpMock);
      fixture.destroy();
    }));
  });

  describe('kindLabelKey()', () => {
    it('returns the kind-specific translation key', () => {
      const { fixture, httpMock } = setup();
      const component = fixture.componentInstance;
      const item = buildCourseContentItem({ kind: 'video' });
      expect(component.kindLabelKey(item)).toBe('aplus.course_curriculum.kind_video');
      httpMock.expectOne((r) => r.url.includes('/content'));
      drainModuleProgress(httpMock);
      verifyClean(httpMock);
      fixture.destroy();
    });
  });

  describe('actionLabelKey()', () => {
    it('returns the action key for atom', () => {
      const { fixture, httpMock } = setup();
      const component = fixture.componentInstance;
      const item = buildCourseContentItem({ kind: 'atom' });
      expect(component.actionLabelKey(item)).toBe('aplus.course_curriculum.action_atom');
      httpMock.expectOne((r) => r.url.includes('/content'));
      drainModuleProgress(httpMock);
      verifyClean(httpMock);
      fixture.destroy();
    });

    it('returns the action key for live_classroom', () => {
      const { fixture, httpMock } = setup();
      const component = fixture.componentInstance;
      const item = buildCourseContentItem({ kind: 'live_classroom' });
      expect(component.actionLabelKey(item)).toBe('aplus.course_curriculum.action_live_classroom');
      httpMock.expectOne((r) => r.url.includes('/content'));
      drainModuleProgress(httpMock);
      verifyClean(httpMock);
      fixture.destroy();
    });
  });

  describe('icon()', () => {
    it('returns "atom" for atom kind', () => {
      const { fixture, httpMock } = setup();
      const item = buildCourseContentItem({ kind: 'atom' });
      expect(fixture.componentInstance.icon(item)).toBe('atom');
      httpMock.expectOne((r) => r.url.includes('/content'));
      drainModuleProgress(httpMock);
      verifyClean(httpMock);
      fixture.destroy();
    });
  });

  describe('surface shell', () => {
    it('root element has surface-aplus class', () => {
      const { fixture, element, httpMock } = setup();
      const root = element.querySelector('[data-testid="aplus-course-curriculum"]');
      expect(root?.className).toContain('surface-aplus');
      httpMock.expectOne((r) => r.url.includes('/content'));
      drainModuleProgress(httpMock);
      verifyClean(httpMock);
      fixture.destroy();
    });
  });

  // ── Branch-coverage augmentation ─────────────────────────────────────────
  // Exercises the remaining uncovered conditional arms directly on the public
  // helper methods: the full actionLabelKey() switch, every icon() case, and
  // both operands of the isExternalLink() OR expression (incl. its short-circuit
  // and its false outcome). Each test drains the in-flight ngOnInit GET so the
  // HttpTestingController stays clean (afterEach verify() per house style).

  describe('actionLabelKey() — full switch coverage', () => {
    const cases: readonly [CourseContentItem['kind'], string][] = [
      ['atom', 'aplus.course_curriculum.action_atom'],
      ['video', 'aplus.course_curriculum.action_video'],
      ['youtube', 'aplus.course_curriculum.action_youtube'],
      ['document', 'aplus.course_curriculum.action_document'],
      ['live_classroom', 'aplus.course_curriculum.action_live_classroom'],
      ['assessment', 'aplus.course_curriculum.action_assessment'],
    ];

    for (const [kind, expected] of cases) {
      it(`returns "${expected}" for the ${kind} case`, () => {
        const { fixture, httpMock } = setup();
        const item = buildCourseContentItem({ kind });
        expect(fixture.componentInstance.actionLabelKey(item)).toBe(expected);
        httpMock.expectOne((r) => r.url.includes('/content'));
        verifyClean(httpMock);
        fixture.destroy();
      });
    }
  });

  describe('icon() — every kind branch', () => {
    const cases: readonly [CourseContentItem['kind'], string][] = [
      ['atom', 'atom'],
      ['video', 'circle-play'],
      ['youtube', 'brands fa-youtube'],
      ['document', 'file-lines'],
      ['live_classroom', 'chalkboard-user'],
      ['assessment', 'clipboard-check'],
    ];

    for (const [kind, expected] of cases) {
      it(`maps ${kind} to "${expected}"`, () => {
        const { fixture, httpMock } = setup();
        const item = buildCourseContentItem({ kind });
        expect(fixture.componentInstance.icon(item)).toBe(expected);
        httpMock.expectOne((r) => r.url.includes('/content'));
        verifyClean(httpMock);
        fixture.destroy();
      });
    }
  });

  describe('isExternalLink() — both OR operands + outcomes', () => {
    // TRUE via isUrlRef() short-circuit (left operand truthy).
    const urlKinds: readonly CourseContentItem['kind'][] = [
      'video',
      'youtube',
      'document',
    ];
    for (const kind of urlKinds) {
      it(`is true for ${kind} via the isUrlRef short-circuit`, () => {
        const { fixture, httpMock } = setup();
        const item = buildCourseContentItem({ kind });
        expect(fixture.componentInstance.isExternalLink(item)).toBe(true);
        httpMock.expectOne((r) => r.url.includes('/content'));
        verifyClean(httpMock);
        fixture.destroy();
      });
    }

    it('is false for live_classroom (a LiveQuiz template id, not a URL ref)', () => {
      const { fixture, httpMock } = setup();
      const item = buildCourseContentItem({ kind: 'live_classroom' });
      expect(fixture.componentInstance.isExternalLink(item)).toBe(false);
      httpMock.expectOne((r) => r.url.includes('/content'));
      drainModuleProgress(httpMock);
      verifyClean(httpMock);
      fixture.destroy();
    });

    // FALSE outcome: both operands false (UUID-ref, non-live kinds).
    const internalKinds: readonly CourseContentItem['kind'][] = [
      'atom',
      'assessment',
    ];
    for (const kind of internalKinds) {
      it(`is false for ${kind} (both OR operands false)`, () => {
        const { fixture, httpMock } = setup();
        const item = buildCourseContentItem({ kind });
        expect(fixture.componentInstance.isExternalLink(item)).toBe(false);
        httpMock.expectOne((r) => r.url.includes('/content'));
        verifyClean(httpMock);
        fixture.destroy();
      });
    }
  });

  describe('routerLink command builders', () => {
    it('atomPlayLink() returns the AtomAttempt player command array', () => {
      const { fixture, httpMock } = setup();
      const item = buildCourseContentItem({
        kind: 'atom',
        ref: '01000000-0000-7000-8000-0000000000aa',
      });
      expect(fixture.componentInstance.atomPlayLink(item)).toEqual([
        '/a/atoms',
        '01000000-0000-7000-8000-0000000000aa',
        'play',
      ]);
      httpMock.expectOne((r) => r.url.includes('/content'));
      drainModuleProgress(httpMock);
      verifyClean(httpMock);
      fixture.destroy();
    });

    it('assessmentLink() returns the assessment command array', () => {
      const { fixture, httpMock } = setup();
      const item = buildCourseContentItem({
        kind: 'assessment',
        ref: '07000000-0000-7000-8000-0000000000bb',
      });
      expect(fixture.componentInstance.assessmentLink(item)).toEqual([
        '/a/me/assessments',
        '07000000-0000-7000-8000-0000000000bb',
      ]);
      httpMock.expectOne((r) => r.url.includes('/content'));
      drainModuleProgress(httpMock);
      verifyClean(httpMock);
      fixture.destroy();
    });
  });

  describe('state-derived computed signals', () => {
    it('items() falsy arm yields [] while loading; truthy arm yields the list when ready', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      const component = fixture.componentInstance;
      // In-flight: status === 'loading' → items() ternary falsy arm.
      expect(component.items()).toEqual([]);
      expect(component.errorMessage()).toBe('');
      expect(component.isLoading()).toBe(true);

      const response = buildCourseContentResponse({
        items: [buildCourseContentItem({ item_id: 'only-1', kind: 'atom' })],
      });
      flushContent(httpMock, response);
      fixture.detectChanges();

      // status === 'ready' → items() ternary truthy arm.
      expect(component.isReady()).toBe(true);
      expect(component.items().length).toBe(1);
      // errorMessage() falsy arm preserved when not in error.
      expect(component.errorMessage()).toBe('');
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('errorMessage() truthy arm exposes the i18n key on failure', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      const component = fixture.componentInstance;
      flushContent(httpMock, null, 500);
      fixture.detectChanges();

      expect(component.isError()).toBe(true);
      expect(component.errorMessage()).toBe('aplus.course_curriculum.error_load');
      // items() falsy arm under an error state.
      expect(component.items()).toEqual([]);
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('empty response drives isEmpty() true and the other status flags false', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      const component = fixture.componentInstance;
      flushContent(httpMock, { course_id: COURSE_ID, items: [] });
      fixture.detectChanges();

      expect(component.isEmpty()).toBe(true);
      expect(component.isReady()).toBe(false);
      expect(component.isError()).toBe(false);
      expect(component.isLoading()).toBe(false);
      verifyClean(httpMock);
      fixture.destroy();
    }));
  });

  // ── Grouped-by-kind view (CHO-2321) ──────────────────────────────────────
  // The learner curriculum groups its heterogeneous items by kind (Assessments
  // / Videos / YouTube / Documents / Live classes / Atoms), mirroring the R+
  // admin Course-content view (CHO-2317). Groups appear in a fixed order and
  // only for kinds actually present; items within a group sort by position.
  describe('grouped-by-kind view (CHO-2321)', () => {
    it('buckets items into a group per present kind (and none for absent kinds)', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      // Default builder → atom + video + assessment.
      flushContent(httpMock, buildCourseContentResponse());
      fixture.detectChanges();

      expect(element.querySelector('[data-testid="curriculum-group-assessment"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="curriculum-group-video"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="curriculum-group-atom"]')).not.toBeNull();
      // Absent kinds render no group (no empty buckets).
      expect(element.querySelector('[data-testid="curriculum-group-document"]')).toBeNull();
      expect(element.querySelector('[data-testid="curriculum-group-youtube"]')).toBeNull();
      expect(element.querySelector('[data-testid="curriculum-group-live_classroom"]')).toBeNull();
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('still renders one item row per item, regardless of grouping', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushContent(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      const rows = element.querySelectorAll('[data-testid^="curriculum-item-"][data-kind]');
      expect(rows.length).toBe(3);
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('orders the groups assessment → video → atom (CONTENT_KIND_ORDER)', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushContent(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      const order = Array.from(
        element.querySelectorAll('[data-testid^="curriculum-group-"]'),
      ).map((g) => g.getAttribute('data-testid'));
      expect(order).toEqual([
        'curriculum-group-assessment',
        'curriculum-group-video',
        'curriculum-group-atom',
      ]);
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('sorts items within a group by position (not response order)', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const response = buildCourseContentResponse({
        items: [
          buildCourseContentItem({
            item_id: 'v-b',
            kind: 'video',
            ref: 'https://cdn.example.com/b.mp4',
            title: 'B',
            position: 4,
          }),
          buildCourseContentItem({
            item_id: 'v-a',
            kind: 'video',
            ref: 'https://cdn.example.com/a.mp4',
            title: 'A',
            position: 2,
          }),
        ],
      });
      flushContent(httpMock, response);
      fixture.detectChanges();
      const group = element.querySelector('[data-testid="curriculum-group-video"]')!;
      const ids = Array.from(
        group.querySelectorAll('[data-testid^="curriculum-item-"][data-kind]'),
      ).map((li) => li.getAttribute('data-testid'));
      expect(ids).toEqual(['curriculum-item-v-a', 'curriculum-item-v-b']);
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('renders a group heading element per present kind', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      flushContent(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="curriculum-heading-assessment"]'),
      ).not.toBeNull();
      expect(
        element.querySelector('[data-testid="curriculum-heading-atom"]'),
      ).not.toBeNull();
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('exposes contentGroups(): ordered, non-empty groups with a group_{kind} label key', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      flushContent(httpMock, buildCourseContentResponse());
      fixture.detectChanges();
      const groups = fixture.componentInstance.contentGroups();
      expect(groups.map((g) => g.kind)).toEqual(['assessment', 'video', 'atom']);
      expect(groups.every((g) => g.items.length > 0)).toBe(true);
      expect(groups[0].labelKey).toBe('aplus.course_curriculum.group_assessment');
      verifyClean(httpMock);
      fixture.destroy();
    }));

    it('contentGroups() is empty while not in the ready state', () => {
      const { fixture, httpMock } = setup(); // in-flight → loading
      expect(fixture.componentInstance.contentGroups()).toEqual([]);
      httpMock.expectOne((r) => r.url.includes('/content'));
      drainModuleProgress(httpMock);
      verifyClean(httpMock);
      fixture.destroy();
    });
  });
});
