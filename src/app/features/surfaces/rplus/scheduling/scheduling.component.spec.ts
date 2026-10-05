/**
 * SchedulingComponent spec — real-BFF wiring (post-fixture cutover).
 *
 * The component used to consume an inline CSPO fixture from
 * scheduling.service.ts. After the R+ Stage 3 real-BFF wiring the service
 * GETs /v1/scheduling/classes through BffClientService — this spec flushes
 * a real backend payload through HttpTestingController so the assertions
 * exercise the same code path the live FE will use.
 *
 * Pattern mirrors catalog.component.spec.ts: configure the testing module
 * with provideHttpClient + provideHttpClientTesting, flush a synthetic
 * `BackendScheduledClass[]` payload on the expected URL, then run all
 * DOM assertions against the post-flush fixture.
 *
 * Per feedback_no_stubs_real_wiring the empty-backend case is also tested:
 * zero sessions ⇒ zero session blocks (the grid + headers still render).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SchedulingComponent } from './scheduling.component';
import { environment } from '../../../../../environments/environment';

export const SCHED_ROOM_ID = '01985e7f-6666-7abc-8def-000000000401';

/**
 * Default published-courses payload flushed in setup(). Two courses so the
 * instructor-picker reset path (course change ⇒ drop an instructor the new
 * course doesn't carry) has something to switch between. `course-cspo`
 * matches the CSPO_BACKEND_WEEK course_id so the grid cards resolve a real
 * title rather than the opaque hex id.
 */
const DEFAULT_COURSES: readonly Record<string, unknown>[] = [
  {
    id: 'course-cspo',
    title: 'Certified Scrum Product Owner',
    description: 'CSPO',
    instructor_gcids: ['gcid-chen'],
    state: 'PUBLISHED',
  },
  {
    id: 'course-math',
    title: 'Mathematics 101',
    description: 'Math',
    instructor_gcids: ['gcid-lee'],
    state: 'PUBLISHED',
  },
];


interface FlushClass {
  id: string;
  tenant_id: string;
  course_id: string;
  instructor_gcid: string;
  room_id: string;
  room: string;
  starts_at: string;
  ends_at: string;
  max_capacity: number;
}

/** Six CSPO sessions Mon-Sat, mirroring the legacy fixture but as a REAL
 * backend payload that flushes through HttpTestingController. */
const CSPO_BACKEND_WEEK: readonly FlushClass[] = [
  {
    id: 'cls-s1',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    instructor_gcid: 'gcid-chen',
    room_id: SCHED_ROOM_ID,
    room: 'MTM HQ Room 401',
    starts_at: '2026-05-18T09:00:00+00:00',
    ends_at: '2026-05-18T12:00:00+00:00',
    max_capacity: 25,
  },
  {
    id: 'cls-s2',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    instructor_gcid: 'gcid-chen',
    room_id: SCHED_ROOM_ID,
    room: 'MTM HQ Room 401',
    starts_at: '2026-05-19T09:00:00+00:00',
    ends_at: '2026-05-19T12:00:00+00:00',
    max_capacity: 25,
  },
  {
    id: 'cls-s3',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    instructor_gcid: 'gcid-chen',
    room_id: SCHED_ROOM_ID,
    room: 'MTM HQ Room 401',
    starts_at: '2026-05-20T13:00:00+00:00',
    ends_at: '2026-05-20T16:00:00+00:00',
    max_capacity: 25,
  },
  {
    id: 'cls-s4',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    instructor_gcid: 'gcid-chen',
    room_id: SCHED_ROOM_ID,
    room: 'MTM HQ Room 401',
    starts_at: '2026-05-21T09:00:00+00:00',
    ends_at: '2026-05-21T12:00:00+00:00',
    max_capacity: 25,
  },
  {
    id: 'cls-s5',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    instructor_gcid: 'gcid-chen',
    room_id: SCHED_ROOM_ID,
    room: 'MTM HQ Room 401',
    starts_at: '2026-05-22T14:00:00+00:00',
    ends_at: '2026-05-22T17:00:00+00:00',
    max_capacity: 25,
  },
  {
    id: 'cls-s6',
    tenant_id: 'tenant-001',
    course_id: 'course-cspo',
    instructor_gcid: 'gcid-chen',
    room_id: SCHED_ROOM_ID,
    room: 'MTM HQ Room 401',
    starts_at: '2026-05-23T09:00:00+00:00',
    ends_at: '2026-05-23T12:00:00+00:00',
    max_capacity: 25,
  },
];

function setup(): {
  fixture: ComponentFixture<SchedulingComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [SchedulingComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(SchedulingComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  // First detectChanges kicks off the service's GET — flush an empty
  // payload by default; per-test setups override after setup() returns.
  fixture.detectChanges();
  // CHO-2299: the component also loads the durable room catalogue for the
  // booking picker. Flush it here with two rooms so every test has a bookable
  // option; a test that wants the error or empty branch can override.
  httpMock
    .expectOne(`${environment.bffBaseUrl}/api/v1/rooms`)
    .flush({ rooms: [{ id: SCHED_ROOM_ID, name: 'MTM HQ Room 401', capacity: 40 }] });
  // The component also loads the published-course catalogue for the course
  // picker (Goal 1) + instructor picker (Goal 2) + grid-card title resolution
  // (Goal 3). Flush it with the default two-course payload.
  httpMock
    .expectOne((r) => r.url === `${environment.bffBaseUrl}/api/v1/courses`)
    .flush({ items: DEFAULT_COURSES });
  fixture.detectChanges();
  return { fixture, httpMock };
}

/** Flush the in-flight scheduling GET with the supplied payload + re-run
 * change detection so the component re-renders against the new data. */
function flushWeek(
  httpMock: HttpTestingController,
  fixture: ComponentFixture<SchedulingComponent>,
  items: readonly FlushClass[],
): void {
  const req = httpMock.expectOne(
    (r) => r.url === `${environment.bffBaseUrl}/v1/scheduling/classes`,
  );
  req.flush({ items });
  fixture.detectChanges();
}

describe('SchedulingComponent', () => {
  let fixture: ComponentFixture<SchedulingComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setup();
    fixture = s.fixture;
    httpMock = s.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('surface accent + branding', () => {
    it('renders the surface-rplus accent class on root', () => {
      flushWeek(httpMock, fixture, []);
      const root = element.querySelector('[data-testid="rplus-scheduling"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('does NOT render C+ Circle+ branding (Stage 1 regression scrubbed)', () => {
      flushWeek(httpMock, fixture, []);
      // Guard against both the legacy "Connect+" and the current "Circle+"
      // C+ literals as defence-in-depth.
      expect(element.textContent).not.toContain('C+ Connect+');
      expect(element.textContent).not.toContain('C+ Circle+');
      expect(element.textContent).not.toContain('curiosity meets connection');
      expect(element.textContent).not.toContain('your curiosity, your circle');
    });
  });

  describe('header', () => {
    it('renders the Asia/Singapore timezone label', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const tz = element.querySelector('[data-testid="scheduling-tz"]');
      expect(tz?.textContent).toContain('SGT');
    });

    it('renders the "+ Add Session" CTA', () => {
      flushWeek(httpMock, fixture, []);
      const cta = element.querySelector('[data-testid="scheduling-add-cta"]');
      expect(cta).not.toBeNull();
      expect(cta?.tagName).toBe('BUTTON');
    });
  });

  describe('week grid', () => {
    it('renders 7 day columns Mon-Sun', () => {
      flushWeek(httpMock, fixture, []);
      const cols = element.querySelectorAll('[data-testid^="scheduling-day-"]');
      expect(cols.length).toBe(7);
    });

    it('renders hourly time-slot rows even when the backend has no classes', () => {
      flushWeek(httpMock, fixture, []);
      const slots = element.querySelectorAll('[data-testid^="scheduling-hour-"]');
      expect(slots.length).toBeGreaterThanOrEqual(9);
    });

    it('places 6 session blocks Mon-Sat when the backend returns the CSPO week', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const blocks = element.querySelectorAll('[data-testid^="scheduling-session-"]');
      expect(blocks.length).toBe(6);
    });

    it('renders an empty grid (no session blocks) when the backend list is empty', () => {
      flushWeek(httpMock, fixture, []);
      const blocks = element.querySelectorAll('[data-testid^="scheduling-session-"]');
      // Per feedback_no_stubs_real_wiring: zero classes ⇒ zero blocks; the
      // empty-state grid + headers still render.
      expect(blocks.length).toBe(0);
    });

    it('shows the venue (MTM HQ Room 401) on session blocks', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const block = element.querySelector('[data-testid="scheduling-session-cls-s1"]');
      expect(block?.textContent).toContain('MTM HQ Room 401');
    });

    it('shows the instructor gcid on session blocks', () => {
      // Instructor display name is not wired (no people lookup) so the
      // component renders the genuine gcid per feedback_no_stubs_real_wiring.
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const block = element.querySelector('[data-testid="scheduling-session-cls-s1"]');
      expect(block?.textContent).toContain('gcid-chen');
    });
  });

  describe('readable session cards (Goal 3)', () => {
    it('resolves the real course title from the courses list (not the opaque id twice)', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const block = element.querySelector('[data-testid="scheduling-session-cls-s1"]');
      // course-cspo resolves to the real title flushed by DEFAULT_COURSES.
      expect(block?.textContent).toContain('Certified Scrum Product Owner');
    });

    it('shows the max capacity and does NOT fabricate a "0 enrolled" count', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const block = element.querySelector('[data-testid="scheduling-session-cls-s1"]');
      // max_capacity: 25 is a real wire value; enrolment count is not on the
      // wire so it must not be rendered.
      expect(block?.textContent).toContain('25');
      expect(block?.textContent).not.toContain('enrolled');
    });

    it('gives each card a meaningful aria-label (course + instructor + room + time)', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const block = element.querySelector('[data-testid="scheduling-session-cls-s1"]');
      const aria = block?.getAttribute('aria-label') ?? '';
      expect(aria).toContain('Certified Scrum Product Owner');
      expect(aria).toContain('gcid-chen');
      expect(aria).toContain('MTM HQ Room 401');
      expect(aria).toContain('09:00');
    });

    it('falls back gracefully: unresolved course → code, empty room → rooms() lookup, no capacity → no capacity row', () => {
      // course_id is not in the PUBLISHED catalogue, the wire room name is
      // blank (legacy row), and max_capacity is 0. The card must still resolve
      // the room from the rooms() catalogue via room_id and never render a
      // capacity row for a zero budget.
      flushWeek(httpMock, fixture, [
        {
          id: 'cls-fallback',
          tenant_id: 'tenant-001',
          course_id: 'course-archived-not-in-catalogue',
          instructor_gcid: 'gcid-chen',
          room_id: SCHED_ROOM_ID,
          room: '',
          starts_at: '2026-05-18T09:00:00+00:00',
          ends_at: '2026-05-18T12:00:00+00:00',
          max_capacity: 0,
        },
      ]);
      const block = element.querySelector('[data-testid="scheduling-session-cls-fallback"]');
      // Unresolved course ⇒ the short code, rendered exactly once.
      expect(block?.querySelector('.scheduling__session-title')?.textContent?.trim()).toBe(
        'COURSE-A',
      );
      // Room resolved from the rooms() catalogue by room_id (wire name blank).
      expect(block?.textContent).toContain('MTM HQ Room 401');
      // Zero capacity ⇒ the capacity row (its fa-users icon) is not rendered.
      expect(block?.querySelector('.fa-users')).toBeNull();
    });
  });

  describe('a11y', () => {
    // The calendar deliberately does NOT claim role="grid". It has no arrow-key
    // or roving-tabindex navigation (which the APG requires of a grid) and its
    // cells were all empty + aria-hidden, so the grid role promised a keyboard
    // contract and a cell population that never existed. The day/hour scaffold
    // is a visual ruler; the sessions are the content.
    it('keeps the day/hour scaffold out of the a11y tree as a visual ruler', () => {
      flushWeek(httpMock, fixture, []);
      const grid = element.querySelector('[data-testid="scheduling-grid"]');
      expect(grid?.getAttribute('role')).toBeNull();
      expect(element.querySelectorAll('[role="columnheader"]').length).toBe(0);
      expect(element.querySelector('.scheduling__grid-head')?.getAttribute('aria-hidden')).toBe(
        'true',
      );
    });

    it('exposes the sessions as a labelled list, each naming its own day', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const list = element.querySelector('.scheduling__sessions');
      expect(list?.getAttribute('role')).toBe('list');
      expect(list?.hasAttribute('aria-label')).toBe(true);

      const sessions = element.querySelectorAll('[role="listitem"]');
      expect(sessions.length).toBeGreaterThan(0);
      // The day was previously conveyed by column position only, which a screen
      // reader cannot perceive; it must now be in the accessible name.
      const first = sessions[0];
      const day = first.getAttribute('data-day');
      expect(day).toBeTruthy();
      expect(first.getAttribute('aria-label')).toContain(`rplus.scheduling.day.${day}`);
    });

    it('has zero critical/serious axe-core violations', async () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    }, 30000);
  });

  describe('create form (CHO-1626)', () => {
    const URL = `${environment.bffBaseUrl}/v1/scheduling/classes`;

    it('opens the create form on the "Add Session" CTA', () => {
      flushWeek(httpMock, fixture, []);
      expect(element.querySelector('[data-testid="scheduling-form"]')).toBeNull();
      (element.querySelector('[data-testid="scheduling-add-cta"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="scheduling-form"]')).not.toBeNull();
    });

    it('POSTs the snake_case payload, closes the form, and reloads the week', () => {
      flushWeek(httpMock, fixture, []);
      const c = fixture.componentInstance;
      c.formOpen.set(true);
      c.courseIdInput.set('course-cspo');
      c.instructorGcidInput.set('gcid-chen');
      c.roomIdInput.set(SCHED_ROOM_ID);
      c.dateInput.set('2026-05-19');
      c.startTimeInput.set('09:00');
      c.endTimeInput.set('12:00');
      c.maxCapacityInput.set(25);
      fixture.detectChanges();

      c.onCreate();
      fixture.detectChanges();

      const post = httpMock.expectOne((r) => r.url === URL && r.method === 'POST');
      expect(post.request.body).toEqual({
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: SCHED_ROOM_ID,
        starts_at: '2026-05-19T09:00:00Z',
        ends_at: '2026-05-19T12:00:00Z',
        max_capacity: 25,
      });
      post.flush({
        id: 'cls-new',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: SCHED_ROOM_ID,
    room: 'MTM HQ Room 401',
        starts_at: '2026-05-19T09:00:00Z',
        ends_at: '2026-05-19T12:00:00Z',
        max_capacity: 25,
      });
      fixture.detectChanges();

      // Form closes on success.
      expect(element.querySelector('[data-testid="scheduling-form"]')).toBeNull();
      // Week reload fires (reloadKey → switchMap).
      const reload = httpMock.expectOne((r) => r.url === URL && r.method === 'GET');
      reload.flush({ items: [] });
      fixture.detectChanges();
    });

    it('surfaces a fail-loud banner on a 4xx and keeps the form open', () => {
      flushWeek(httpMock, fixture, []);
      const c = fixture.componentInstance;
      c.formOpen.set(true);
      c.courseIdInput.set('course-cspo');
      c.instructorGcidInput.set('gcid-chen');
      c.roomIdInput.set(SCHED_ROOM_ID);
      c.dateInput.set('2026-05-19');
      c.startTimeInput.set('12:00');
      c.endTimeInput.set('09:00'); // ends before starts → backend 422
      c.maxCapacityInput.set(10);
      fixture.detectChanges();

      c.onCreate();
      fixture.detectChanges();

      const post = httpMock.expectOne((r) => r.url === URL && r.method === 'POST');
      post.flush(
        { error: 'ends_at must be after starts_at' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      fixture.detectChanges();

      // Banner shows + form stays open; no reload GET fires (verify() asserts).
      expect(element.querySelector('[data-testid="scheduling-error"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="scheduling-form"]')).not.toBeNull();
    });

    it('surfaces the server-provided error.message on a 409 collision (never the HTTP code)', () => {
      flushWeek(httpMock, fixture, []);
      const c = fixture.componentInstance;
      c.formOpen.set(true);
      c.courseIdInput.set('course-cspo');
      c.instructorGcidInput.set('gcid-chen');
      c.roomIdInput.set(SCHED_ROOM_ID);
      c.dateInput.set('2026-05-19');
      c.startTimeInput.set('09:00');
      c.endTimeInput.set('12:00');
      c.maxCapacityInput.set(10);
      fixture.detectChanges();

      c.onCreate();
      fixture.detectChanges();

      const post = httpMock.expectOne((r) => r.url === URL && r.method === 'POST');
      post.flush(
        {
          error: {
            code: 'room_double_booked',
            message:
              'that room is already booked for an overlapping time; pick another room or time',
          },
        },
        { status: 409, statusText: 'Conflict' },
      );
      fixture.detectChanges();

      const banner = element.querySelector('[data-testid="scheduling-error"]');
      expect(banner?.textContent).toContain('that room is already booked');
      // The raw HTTP status must never leak when a human message exists.
      expect(banner?.textContent).not.toContain('409');
      expect(banner?.textContent).not.toContain('HTTP');
    });

    it('falls back to a role-specific message on a 403 with no server body', () => {
      flushWeek(httpMock, fixture, []);
      const c = fixture.componentInstance;
      c.formOpen.set(true);
      c.courseIdInput.set('course-cspo');
      c.instructorGcidInput.set('gcid-chen');
      c.roomIdInput.set(SCHED_ROOM_ID);
      c.dateInput.set('2026-05-19');
      c.startTimeInput.set('09:00');
      c.endTimeInput.set('12:00');
      c.maxCapacityInput.set(10);
      fixture.detectChanges();

      c.onCreate();
      fixture.detectChanges();

      const post = httpMock.expectOne((r) => r.url === URL && r.method === 'POST');
      post.flush({}, { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();

      const banner = element.querySelector('[data-testid="scheduling-error"]');
      // In the test env TranslateService.instant echoes the key back, so we
      // assert the forbidden fallback key rather than the resolved copy.
      expect(banner?.textContent).toContain('error_forbidden');
      expect(banner?.textContent).not.toContain('403');
    });

    it('surfaces a top-level {message} error body when the envelope is flat', () => {
      flushWeek(httpMock, fixture, []);
      const c = fixture.componentInstance;
      c.formOpen.set(true);
      c.courseIdInput.set('course-cspo');
      c.instructorGcidInput.set('gcid-chen');
      c.roomIdInput.set(SCHED_ROOM_ID);
      c.dateInput.set('2026-05-19');
      c.startTimeInput.set('09:00');
      c.endTimeInput.set('12:00');
      c.maxCapacityInput.set(10);
      fixture.detectChanges();

      c.onCreate();
      fixture.detectChanges();

      const post = httpMock.expectOne((r) => r.url === URL && r.method === 'POST');
      post.flush(
        { message: 'the tenant is over its class quota' },
        { status: 400, statusText: 'Bad Request' },
      );
      fixture.detectChanges();

      const banner = element.querySelector('[data-testid="scheduling-error"]');
      expect(banner?.textContent).toContain('the tenant is over its class quota');
    });
  });

  describe('course picker (Goal 1)', () => {
    it('replaces the free-text course field with a <select> populated from the catalogue', () => {
      flushWeek(httpMock, fixture, []);
      const c = fixture.componentInstance;
      c.formOpen.set(true);
      fixture.detectChanges();
      const select = element.querySelector('[data-testid="scheduling-course-id"]');
      expect(select?.tagName).toBe('SELECT');
      expect(select?.textContent).toContain('Certified Scrum Product Owner');
      expect(select?.textContent).toContain('Mathematics 101');
    });
  });

  describe('instructor picker (Goal 2)', () => {
    it('disables the instructor <select> until a course is chosen', async () => {
      flushWeek(httpMock, fixture, []);
      const c = fixture.componentInstance;
      c.formOpen.set(true);
      fixture.detectChanges();
      // Template-driven ngModel applies [disabled] on a microtask, so wait for
      // the form to stabilise before reading the DOM disabled property.
      await fixture.whenStable();
      const select = element.querySelector(
        '[data-testid="scheduling-instructor-gcid"]',
      ) as HTMLSelectElement;
      expect(select.tagName).toBe('SELECT');
      expect(select.disabled).toBe(true);
    });

    it('populates instructor options from the chosen course', () => {
      flushWeek(httpMock, fixture, []);
      const c = fixture.componentInstance;
      c.formOpen.set(true);
      c.onCourseChange('course-cspo');
      fixture.detectChanges();
      const select = element.querySelector(
        '[data-testid="scheduling-instructor-gcid"]',
      ) as HTMLSelectElement;
      expect(select.disabled).toBe(false);
      expect(select.textContent).toContain('gcid-chen');
    });

    it('resets the selected instructor when the course changes to one lacking that instructor', () => {
      flushWeek(httpMock, fixture, []);
      const c = fixture.componentInstance;
      c.formOpen.set(true);
      c.onCourseChange('course-cspo');
      c.instructorGcidInput.set('gcid-chen');
      fixture.detectChanges();
      // course-math carries gcid-lee, not gcid-chen ⇒ the stale pick is dropped.
      c.onCourseChange('course-math');
      fixture.detectChanges();
      expect(c.instructorGcidInput()).toBe('');
    });
  });

  // ── CHO-2333: room-lane side-by-side layout for overlapping sessions ──────
  describe('overlap → room lanes (CHO-2333)', () => {
    /** Two Monday sessions whose grid rows overlap (09:00-12:00 vs 10:00-11:00). */
    const OVERLAP_WEEK: readonly FlushClass[] = [
      {
        id: 'cls-a',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: SCHED_ROOM_ID,
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-18T09:00:00+00:00',
        ends_at: '2026-05-18T12:00:00+00:00',
        max_capacity: 25,
      },
      {
        id: 'cls-b',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: SCHED_ROOM_ID,
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-18T10:00:00+00:00',
        ends_at: '2026-05-18T11:00:00+00:00',
        max_capacity: 25,
      },
    ];

    it('splits overlapping same-day sessions into two lanes with distinct lane indices', () => {
      flushWeek(httpMock, fixture, OVERLAP_WEEK);
      const a = element.querySelector('[data-testid="scheduling-session-cls-a"]');
      const b = element.querySelector('[data-testid="scheduling-session-cls-b"]');
      expect(a?.getAttribute('data-lanes')).toBe('2');
      expect(b?.getAttribute('data-lanes')).toBe('2');
      // No card hides another: they occupy different sub-columns.
      expect(a?.getAttribute('data-lane')).not.toBe(b?.getAttribute('data-lane'));
    });

    it('keeps a lone session full-width (a single lane)', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const s1 = element.querySelector('[data-testid="scheduling-session-cls-s1"]');
      // cls-s1 is the only Monday session ⇒ one lane, full width.
      expect(s1?.getAttribute('data-lanes')).toBe('1');
      expect(s1?.getAttribute('data-lane')).toBe('0');
    });
  });

  // ── CHO-2334: detail-on-click + reschedule + cancel ──────────────────────
  describe('session detail dialog (CHO-2334)', () => {
    const RESCHED = (id: string) =>
      `${environment.bffBaseUrl}/v1/scheduling/classes/${id}/reschedule`;
    const CANCEL = (id: string) =>
      `${environment.bffBaseUrl}/v1/scheduling/classes/${id}/cancel`;
    const WEEK = `${environment.bffBaseUrl}/v1/scheduling/classes`;

    function openFirst(): void {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const trigger = element.querySelector(
        '[data-testid="scheduling-open-cls-s1"]',
      ) as HTMLButtonElement;
      trigger.click();
      fixture.detectChanges();
    }

    it('opens an accessible dialog on card click showing course/instructor/room/date/time/capacity', () => {
      openFirst();
      const dialog = element.querySelector('[data-testid="scheduling-detail"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('role')).toBe('dialog');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      const text = dialog?.textContent ?? '';
      expect(text).toContain('Certified Scrum Product Owner'); // course title
      expect(text).toContain('gcid-chen'); // instructor
      expect(text).toContain('MTM HQ Room 401'); // room
      expect(text).toContain('09:00'); // time range
      expect(text).toContain('12:00');
      expect(text).toContain('25'); // capacity
    });

    it('moves focus to the dialog close button on open', () => {
      openFirst();
      const close = element.querySelector('[data-testid="scheduling-detail-close"]');
      expect(document.activeElement).toBe(close);
    });

    it('closes on the close button', () => {
      openFirst();
      (
        element.querySelector('[data-testid="scheduling-detail-close"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="scheduling-detail"]')).toBeNull();
    });

    it('closes on Escape', () => {
      openFirst();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="scheduling-detail"]')).toBeNull();
    });

    it('closes on a backdrop click but not on a click inside the panel', () => {
      openFirst();
      // Click inside the panel: stays open.
      (
        element.querySelector('[data-testid="scheduling-detail-panel"]') as HTMLElement
      ).click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="scheduling-detail"]')).not.toBeNull();
      // Click the backdrop overlay itself: closes.
      const overlay = element.querySelector('[data-testid="scheduling-detail"]') as HTMLElement;
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="scheduling-detail"]')).toBeNull();
    });

    it('reschedules: prefilled form POSTs the new window, closes, and reloads the week', () => {
      openFirst();
      (
        element.querySelector(
          '[data-testid="scheduling-detail-reschedule"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      const c = fixture.componentInstance;
      // Prefilled from the session; move the window to 10:00-13:00.
      expect(c.rsRoomId()).toBe(SCHED_ROOM_ID);
      c.rsDate.set('2026-05-18');
      c.rsStart.set('10:00');
      c.rsEnd.set('13:00');
      fixture.detectChanges();

      (
        element.querySelector(
          '[data-testid="scheduling-reschedule-submit"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      const post = httpMock.expectOne((r) => r.url === RESCHED('cls-s1') && r.method === 'POST');
      expect(post.request.body).toEqual({
        starts_at: '2026-05-18T10:00:00Z',
        ends_at: '2026-05-18T13:00:00Z',
        room_id: SCHED_ROOM_ID,
      });
      post.flush({
        id: 'cls-s1',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: SCHED_ROOM_ID,
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-18T10:00:00Z',
        ends_at: '2026-05-18T13:00:00Z',
        max_capacity: 25,
      });
      fixture.detectChanges();

      // Dialog closes + the week reloads.
      expect(element.querySelector('[data-testid="scheduling-detail"]')).toBeNull();
      httpMock.expectOne((r) => r.url === WEEK && r.method === 'GET').flush({ items: [] });
      fixture.detectChanges();
    });

    it('surfaces the server 409 message inside the dialog and keeps it open', () => {
      openFirst();
      const c = fixture.componentInstance;
      c.openReschedule();
      c.rsDate.set('2026-05-18');
      c.rsStart.set('10:00');
      c.rsEnd.set('13:00');
      fixture.detectChanges();
      c.onReschedule();
      fixture.detectChanges();

      const post = httpMock.expectOne((r) => r.url === RESCHED('cls-s1'));
      post.flush(
        {
          error: {
            code: 'room_double_booked',
            message: 'that room is already booked for an overlapping time; pick another room or time',
          },
        },
        { status: 409, statusText: 'Conflict' },
      );
      fixture.detectChanges();

      const err = element.querySelector('[data-testid="scheduling-reschedule-error"]');
      expect(err?.textContent).toContain('that room is already booked');
      expect(err?.textContent).not.toContain('409');
      // Dialog stays open so the user can pick another time.
      expect(element.querySelector('[data-testid="scheduling-detail"]')).not.toBeNull();
    });

    it('cancels via an IN-APP confirm (never the native confirm) then reloads', () => {
      const nativeConfirm = vi.spyOn(window, 'confirm');
      openFirst();
      // Request cancel → an in-app confirm appears; no request fires yet.
      (
        element.querySelector('[data-testid="scheduling-detail-cancel"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(nativeConfirm).not.toHaveBeenCalled();
      expect(element.querySelector('[data-testid="scheduling-cancel-confirm"]')).not.toBeNull();

      // Confirm → POST cancel, dialog closes, week reloads.
      (
        element.querySelector(
          '[data-testid="scheduling-cancel-confirm-yes"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      const post = httpMock.expectOne((r) => r.url === CANCEL('cls-s1') && r.method === 'POST');
      post.flush({
        id: 'cls-s1',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: SCHED_ROOM_ID,
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-18T09:00:00Z',
        ends_at: '2026-05-18T12:00:00Z',
        max_capacity: 25,
        deleted_at: '2026-05-17T00:00:00Z',
      });
      fixture.detectChanges();

      expect(element.querySelector('[data-testid="scheduling-detail"]')).toBeNull();
      httpMock.expectOne((r) => r.url === WEEK && r.method === 'GET').flush({ items: [] });
      fixture.detectChanges();
      nativeConfirm.mockRestore();
    });

    it('backs out of a cancel confirm without firing a request', () => {
      openFirst();
      fixture.componentInstance.requestCancel();
      fixture.detectChanges();
      fixture.componentInstance.dismissCancel();
      fixture.detectChanges();
      expect(fixture.componentInstance.confirmingCancel()).toBe(false);
      // No cancel request is outstanding (afterEach httpMock.verify() would fail).
      expect(element.querySelector('[data-testid="scheduling-detail"]')).not.toBeNull();
    });

    // Regression: cancelling session A must CLOSE the dialog and clear the
    // selection, even when the week reload still returns OTHER sessions. The
    // dialog must never rebind to a different remaining session (observed live:
    // cancel A → dialog stayed open showing B).
    it('closes the dialog on cancel-success even when the reload still returns other sessions', () => {
      openFirst(); // opens cls-s1
      fixture.componentInstance.requestCancel();
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="scheduling-cancel-confirm-yes"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();

      httpMock.expectOne((r) => r.url === CANCEL('cls-s1') && r.method === 'POST').flush({
        id: 'cls-s1',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: SCHED_ROOM_ID,
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-18T09:00:00Z',
        ends_at: '2026-05-18T12:00:00Z',
        max_capacity: 25,
        deleted_at: '2026-05-17T00:00:00Z',
      });
      fixture.detectChanges();

      // Reload returns a DIFFERENT remaining session (cls-s2). The dialog must
      // be closed and the selection cleared, never rebound to cls-s2.
      httpMock
        .expectOne((r) => r.url === WEEK && r.method === 'GET')
        .flush({ items: [CSPO_BACKEND_WEEK[1]] });
      fixture.detectChanges();

      expect(element.querySelector('[data-testid="scheduling-detail"]')).toBeNull();
      expect(fixture.componentInstance.selectedCard()).toBeNull();
    });

    // Regression sibling: a successful reschedule must likewise close the dialog
    // and clear the selection, even with other sessions still on the reloaded week.
    it('closes the dialog on reschedule-success even when the reload still returns other sessions', () => {
      openFirst(); // opens cls-s1
      const c = fixture.componentInstance;
      c.openReschedule();
      c.rsDate.set('2026-05-18');
      c.rsStart.set('10:00');
      c.rsEnd.set('13:00');
      fixture.detectChanges();
      c.onReschedule();
      fixture.detectChanges();

      httpMock.expectOne((r) => r.url === RESCHED('cls-s1') && r.method === 'POST').flush({
        id: 'cls-s1',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: SCHED_ROOM_ID,
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-18T10:00:00Z',
        ends_at: '2026-05-18T13:00:00Z',
        max_capacity: 25,
      });
      fixture.detectChanges();

      httpMock
        .expectOne((r) => r.url === WEEK && r.method === 'GET')
        .flush({ items: [CSPO_BACKEND_WEEK[1]] });
      fixture.detectChanges();

      expect(element.querySelector('[data-testid="scheduling-detail"]')).toBeNull();
      expect(fixture.componentInstance.selectedCard()).toBeNull();
    });
  });

  // ── CHO-2334: drag-to-reschedule ──────────────────────────────────────────
  describe('drag-to-reschedule (CHO-2334)', () => {
    function fakeDragEvent(): DragEvent {
      const data: Record<string, string> = {};
      return {
        preventDefault: () => undefined,
        dataTransfer: {
          effectAllowed: '',
          dropEffect: '',
          setData: (k: string, v: string) => {
            data[k] = v;
          },
          getData: (k: string) => data[k] ?? '',
        },
      } as unknown as DragEvent;
    }

    it('drops a card onto a new (day, hour) slot → reschedule preserving duration', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const c = fixture.componentInstance;
      const card = c
        .dayColumns()
        .flatMap((col) => col.sessions)
        .find((s) => s.sessionId === 'cls-s1')!;
      expect(card).toBeTruthy();

      c.onCardDragStart(card, fakeDragEvent());
      // Drop cls-s1 (Mon 09:00-12:00, 3h) onto Wednesday 14:00.
      c.onSlotDrop('wednesday', '14:00', fakeDragEvent());
      fixture.detectChanges();

      const post = httpMock.expectOne(
        (r) =>
          r.url === `${environment.bffBaseUrl}/v1/scheduling/classes/cls-s1/reschedule` &&
          r.method === 'POST',
      );
      expect(post.request.body).toEqual({
        starts_at: '2026-05-20T14:00:00Z',
        ends_at: '2026-05-20T17:00:00Z',
        room_id: SCHED_ROOM_ID,
      });
      post.flush({
        id: 'cls-s1',
        tenant_id: 'tenant-001',
        course_id: 'course-cspo',
        instructor_gcid: 'gcid-chen',
        room_id: SCHED_ROOM_ID,
        room: 'MTM HQ Room 401',
        starts_at: '2026-05-20T14:00:00Z',
        ends_at: '2026-05-20T17:00:00Z',
        max_capacity: 25,
      });
      fixture.detectChanges();

      // Week reloads after a successful drop.
      httpMock
        .expectOne(
          (r) =>
            r.url === `${environment.bffBaseUrl}/v1/scheduling/classes` && r.method === 'GET',
        )
        .flush({ items: [] });
      fixture.detectChanges();
    });

    it('is a no-op when no card is being dragged', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      // No onCardDragStart first → drop must not fire a request (verify() asserts).
      fixture.componentInstance.onSlotDrop('wednesday', '14:00', fakeDragEvent());
      fixture.detectChanges();
      expect(true).toBe(true);
    });

    it('highlights the hovered hour cell as the live drop target while dragging', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const c = fixture.componentInstance;
      const card = c
        .dayColumns()
        .flatMap((col) => col.sessions)
        .find((s) => s.sessionId === 'cls-s1')!;

      c.onCardDragStart(card, fakeDragEvent());
      c.onSlotDragOver('wednesday', '14:00', fakeDragEvent());
      fixture.detectChanges();

      // Exactly one cell is marked, and it is the (day, hour) under the pointer.
      expect(c.isDropTarget('wednesday', '14:00')).toBe(true);
      expect(c.isDropTarget('thursday', '14:00')).toBe(false);
      expect(c.isDropTarget('wednesday', '15:00')).toBe(false);
      expect(element.querySelectorAll('.scheduling__cell--drop').length).toBe(1);

      // Leaving that cell clears the highlight.
      c.onSlotDragLeave('wednesday', '14:00');
      fixture.detectChanges();
      expect(element.querySelectorAll('.scheduling__cell--drop').length).toBe(0);
    });

    it('clears the drop-target highlight when the drag ends and when it drops', () => {
      flushWeek(httpMock, fixture, CSPO_BACKEND_WEEK);
      const c = fixture.componentInstance;
      const card = c
        .dayColumns()
        .flatMap((col) => col.sessions)
        .find((s) => s.sessionId === 'cls-s1')!;

      // Drag end (e.g. Escape / cancelled drop) drops the highlight.
      c.onCardDragStart(card, fakeDragEvent());
      c.onSlotDragOver('monday', '09:00', fakeDragEvent());
      fixture.detectChanges();
      expect(element.querySelectorAll('.scheduling__cell--drop').length).toBe(1);
      c.onCardDragEnd();
      fixture.detectChanges();
      expect(c.dropTarget()).toBeNull();
      expect(element.querySelectorAll('.scheduling__cell--drop').length).toBe(0);

      // A real drop also clears the highlight (before the reschedule request).
      c.onCardDragStart(card, fakeDragEvent());
      c.onSlotDragOver('tuesday', '10:00', fakeDragEvent());
      fixture.detectChanges();
      expect(element.querySelectorAll('.scheduling__cell--drop').length).toBe(1);
      c.onSlotDrop('tuesday', '10:00', fakeDragEvent());
      fixture.detectChanges();
      expect(c.dropTarget()).toBeNull();

      // Drop fired a reschedule POST (cls-s1 3h → Tue 10:00-13:00); flush it +
      // the reload so httpMock.verify() stays clean.
      httpMock
        .expectOne(
          (r) =>
            r.url === `${environment.bffBaseUrl}/v1/scheduling/classes/cls-s1/reschedule` &&
            r.method === 'POST',
        )
        .flush({
          id: 'cls-s1',
          tenant_id: 'tenant-001',
          course_id: 'course-cspo',
          instructor_gcid: 'gcid-chen',
          room_id: SCHED_ROOM_ID,
          room: 'MTM HQ Room 401',
          starts_at: '2026-05-19T10:00:00Z',
          ends_at: '2026-05-19T13:00:00Z',
          max_capacity: 25,
        });
      fixture.detectChanges();
      httpMock
        .expectOne(
          (r) =>
            r.url === `${environment.bffBaseUrl}/v1/scheduling/classes` && r.method === 'GET',
        )
        .flush({ items: [] });
      fixture.detectChanges();
    });
  });
});
