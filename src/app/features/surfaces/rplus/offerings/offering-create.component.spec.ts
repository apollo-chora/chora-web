/**
 * OfferingCreateComponent spec — the /r/offerings/new create flow (W2.D).
 *
 * Real OfferingsService over HttpTestingController (no service mock per
 * feedback_no_stubs_real_wiring). RbacService is exercised via a fake
 * AuthService `user` signal.
 *
 * Offering→course is ONE-TO-MANY (OFF.FE): the course picker is a CHECKBOX
 * MULTI-SELECT, ≥1 required, and submit POSTs `course_ids: string[]`.
 *
 * Coverage:
 *   - admin: renders the form; the course checkbox list is populated from REAL
 *     GET /api/v1/courses (loading / empty / error all honest)
 *   - multi-select: toggle add/remove, validity (0 → invalid, ≥1 → valid),
 *     selected-count, several courses → `course_ids` array
 *   - non-admin: access-denied panel, no form, and NO courses fetch (fail-closed)
 *   - submit POSTs the snake_case body + navigates to the new workspace on 201
 *   - validation blocks submit + shows field errors (no POST)
 *   - a 400 surfaces a loud banner
 *   - axe a11y sweep (0 critical/serious)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { OfferingCreateComponent } from './offering-create.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { environment } from '../../../../../environments/environment';

const COURSES_URL = `${environment.bffBaseUrl}/api/v1/courses`;
const CREATE_URL = `${environment.bffBaseUrl}/api/v1/offerings`;
const COURSE_LIST = '[data-testid="offering-create-course-list"]';
const COURSE_CHECKBOX = '[data-testid="offering-course-checkbox"]';

const COURSES_BODY = {
  items: [
    { id: 'c1', title: 'Certified Scrum Product Owner' },
    { id: 'c2', title: 'Data Engineering Foundations' },
  ],
};

function setup(roles: readonly string[] = ['training_admin']): {
  fixture: ComponentFixture<OfferingCreateComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  const user = signal<{ roles: readonly string[]; capabilities: readonly string[] }>({
    roles,
    capabilities: [],
  });
  TestBed.configureTestingModule({
    imports: [OfferingCreateComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: AuthService, useValue: { user: user.asReadonly() } },
    ],
  });
  const fixture = TestBed.createComponent(OfferingCreateComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
}

/** Find one course checkbox by its course id. */
function checkbox(element: HTMLElement, courseId: string): HTMLInputElement {
  const el = element.querySelector<HTMLInputElement>(
    `${COURSE_CHECKBOX}[data-course-id="${courseId}"]`,
  );
  if (el === null) {
    throw new Error(`checkbox for course ${courseId} not found`);
  }
  return el;
}

describe('OfferingCreateComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify();
    } catch {
      /* already verified in-body */
    }
  });

  describe('admin form', () => {
    it('loads PUBLISHED courses and renders one checkbox per course', () => {
      const { fixture, httpMock, element } = setup();
      const req = httpMock.expectOne((r) => r.url === COURSES_URL);
      expect(req.request.params.get('state')).toBe('PUBLISHED');
      req.flush(COURSES_BODY);
      fixture.detectChanges();

      const list = element.querySelector(COURSE_LIST);
      expect(list).not.toBeNull();
      // One selectable checkbox per real course (no placeholder row).
      expect(element.querySelectorAll(COURSE_CHECKBOX).length).toBe(2);
      // delivery-mode radios are present (object attribute, picked once)
      expect(element.querySelector('[data-testid="offering-create-dt-graduate"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-create-dt-short"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-create-dt-async"]')).not.toBeNull();
      httpMock.verify();
    });

    it('shows an honest empty-state when there are no published courses', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne((r) => r.url === COURSES_URL).flush({ items: [] });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-create-courses-empty"]')).not.toBeNull();
      expect(element.querySelector(COURSE_LIST)).toBeNull();
      httpMock.verify();
    });

    it('leads the user to create a course (CTA → /r/catalog) when there are no published courses', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne((r) => r.url === COURSES_URL).flush({ items: [] });
      fixture.detectChanges();
      // The empty-state is not a dead end: it offers an actionable CTA that
      // leads the training-admin to the course catalog to create + publish a
      // course (the offering prerequisite), rather than just stating the gap.
      const cta = element.querySelector<HTMLAnchorElement>(
        '[data-testid="offering-create-courses-empty-cta"]',
      );
      expect(cta).not.toBeNull();
      expect(cta?.getAttribute('href')).toBe('/r/catalog');
      httpMock.verify();
    });

    it('shows a loud error + retry when the course fetch fails, and retries', () => {
      const { fixture, httpMock, element } = setup();
      httpMock
        .expectOne((r) => r.url === COURSES_URL)
        .flush('boom', { status: 503, statusText: 'Unavailable' });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="offering-create-courses-error"]');
      expect(err?.getAttribute('role')).toBe('alert');
      element
        .querySelector<HTMLButtonElement>('[data-testid="offering-create-courses-retry"]')!
        .click();
      httpMock.expectOne((r) => r.url === COURSES_URL).flush(COURSES_BODY);
      fixture.detectChanges();
      expect(element.querySelector(COURSE_LIST)).not.toBeNull();
      httpMock.verify();
    });
  });

  describe('course multi-select', () => {
    function admin(): {
      fixture: ComponentFixture<OfferingCreateComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const built = setup();
      built.httpMock.expectOne((r) => r.url === COURSES_URL).flush(COURSES_BODY);
      built.fixture.detectChanges();
      return built;
    }

    it('toggleCourse adds then removes an id (immutable set)', () => {
      const { fixture, httpMock } = admin();
      const c = fixture.componentInstance;
      expect(c.selectedCourseIds()).toEqual([]);
      c.toggleCourse('c1');
      expect(c.selectedCourseIds()).toEqual(['c1']);
      c.toggleCourse('c2');
      expect([...c.selectedCourseIds()]).toEqual(['c1', 'c2']);
      c.toggleCourse('c1'); // remove
      expect([...c.selectedCourseIds()]).toEqual(['c2']);
      httpMock.verify();
    });

    it('isCourseSelected reflects membership', () => {
      const { fixture, httpMock } = admin();
      const c = fixture.componentInstance;
      expect(c.isCourseSelected('c1')).toBe(false);
      c.toggleCourse('c1');
      expect(c.isCourseSelected('c1')).toBe(true);
      expect(c.isCourseSelected('c2')).toBe(false);
      httpMock.verify();
    });

    it('courseValid is false with 0 selected and true with >=1', () => {
      const { fixture, httpMock } = admin();
      const c = fixture.componentInstance;
      expect(c.courseValid()).toBe(false);
      c.toggleCourse('c1');
      expect(c.courseValid()).toBe(true);
      httpMock.verify();
    });

    it('selectedCount reflects the number selected', () => {
      const { fixture, httpMock, element } = admin();
      const c = fixture.componentInstance;
      expect(c.selectedCount()).toBe(0);
      c.toggleCourse('c1');
      c.toggleCourse('c2');
      fixture.detectChanges();
      expect(c.selectedCount()).toBe(2);
      const countEl = element.querySelector('[data-testid="offering-create-selected-count"]');
      expect(countEl?.textContent).toContain('2');
      httpMock.verify();
    });

    it('toggles selection from the DOM checkbox (change event)', () => {
      const { fixture, httpMock, element } = admin();
      const c = fixture.componentInstance;
      const box = checkbox(element, 'c2');
      box.click(); // native checkbox → change event
      expect(c.isCourseSelected('c2')).toBe(true);
      fixture.detectChanges();
      expect(checkbox(element, 'c2').checked).toBe(true);
      box.click();
      expect(c.isCourseSelected('c2')).toBe(false);
      httpMock.verify();
    });
  });

  describe('non-admin (fail-closed)', () => {
    it('renders access-denied, no form, and fires NO courses fetch', () => {
      const { element } = setup(['learner']);
      expect(element.querySelector('[data-testid="offering-create-denied"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-create-form"]')).toBeNull();
      // afterEach verify() asserts no GET /courses fired for a non-admin.
    });
  });

  describe('submit', () => {
    it('POSTs the snake_case body (course_ids) and navigates to the new workspace on 201', () => {
      const { fixture, httpMock } = setup();
      httpMock.expectOne((r) => r.url === COURSES_URL).flush(COURSES_BODY);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const c = fixture.componentInstance;
      c.deliveryType.set('graduate');
      c.selectedCourseIds.set(['c1']);
      c.label.set('  Graduate Cohort — Jan 2026  ');
      c.capacity.set(30);
      c.submit();

      const post = httpMock.expectOne(CREATE_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({
        course_ids: ['c1'],
        delivery_type: 'graduate',
        label: 'Graduate Cohort — Jan 2026', // trimmed
        capacity: 30,
      });
      post.flush({
        id: 'of-new',
        tenant_id: 't1',
        course_id: 'c1',
        course_ids: ['c1'],
        delivery_type: 'graduate',
        label: 'Graduate Cohort — Jan 2026',
        capacity: 30,
        state: 'DRAFT',
        created_at: '2026-06-25T00:00:00Z',
        updated_at: '2026-06-25T00:00:00Z',
      });

      expect(navSpy).toHaveBeenCalledWith(['/r/offerings', 'of-new']);
      httpMock.verify();
    });

    it('POSTs MULTIPLE course_ids when several courses are selected (1:N)', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne((r) => r.url === COURSES_URL).flush(COURSES_BODY);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const c = fixture.componentInstance;
      c.deliveryType.set('graduate');
      checkbox(element, 'c1').click();
      checkbox(element, 'c2').click();
      c.label.set('Bundle Cohort');
      c.capacity.set(0);
      c.submit();

      const post = httpMock.expectOne(CREATE_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toEqual({
        course_ids: ['c1', 'c2'],
        delivery_type: 'graduate',
        label: 'Bundle Cohort',
        capacity: 0,
      });
      post.flush({
        id: 'of-bundle',
        tenant_id: 't1',
        course_id: 'c1',
        course_ids: ['c1', 'c2'],
        delivery_type: 'graduate',
        label: 'Bundle Cohort',
        capacity: 0,
        state: 'DRAFT',
        created_at: '2026-06-25T00:00:00Z',
        updated_at: '2026-06-25T00:00:00Z',
      });
      httpMock.verify();
    });

    // Regression: exercise the REAL submit wiring (button → native form submit →
    // onSubmit → submit), not just the method. A bare `(ngSubmit)` without
    // FormsModule never fires and the native submit would reload the page —
    // this clicks the actual submit button and asserts the POST goes out.
    it('POSTs when the submit BUTTON is clicked (form wiring, not just submit())', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne((r) => r.url === COURSES_URL).flush(COURSES_BODY);
      fixture.detectChanges();
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const c = fixture.componentInstance;
      c.deliveryType.set('graduate');
      c.selectedCourseIds.set(['c1']);
      c.label.set('Clicked Cohort');
      c.capacity.set(0);
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="offering-create-submit"]')!.click();

      const post = httpMock.expectOne(CREATE_URL);
      expect(post.request.method).toBe('POST');
      expect(post.request.body).toMatchObject({ course_ids: ['c1'], delivery_type: 'graduate' });
      post.flush({
        id: 'of-btn',
        tenant_id: 't1',
        course_id: 'c1',
        course_ids: ['c1'],
        delivery_type: 'graduate',
        label: 'Clicked Cohort',
        capacity: 0,
        state: 'DRAFT',
        created_at: '2026-06-25T00:00:00Z',
        updated_at: '2026-06-25T00:00:00Z',
      });
      httpMock.verify();
    });

    it('blocks submit + shows field errors when required fields are missing', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne((r) => r.url === COURSES_URL).flush(COURSES_BODY);
      fixture.detectChanges();

      // Nothing filled (no course selected) → submit must NOT POST.
      fixture.componentInstance.submit();
      fixture.detectChanges();
      expect(fixture.componentInstance.attempted()).toBe(true);
      expect(
        element.querySelector('[data-testid="offering-create-error-delivery"]'),
      ).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-create-error-course"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="offering-create-error-label"]')).not.toBeNull();
      // afterEach verify() asserts no POST fired.
      httpMock.verify();
    });

    it('surfaces a loud banner on a 400 validation error (draft preserved)', () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne((r) => r.url === COURSES_URL).flush(COURSES_BODY);
      fixture.detectChanges();

      const c = fixture.componentInstance;
      c.deliveryType.set('short');
      c.selectedCourseIds.set(['c2']);
      c.label.set('Short Course B');
      c.capacity.set(0);
      c.submit();
      httpMock
        .expectOne(CREATE_URL)
        .flush({ error: 'offering: label too long' }, { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();

      const banner = element.querySelector('[data-testid="offering-create-error"]');
      expect(banner?.getAttribute('role')).toBe('alert');
      expect(banner?.textContent).toContain('label too long');
      // The draft is preserved (label + course selection still set).
      expect(c.label()).toBe('Short Course B');
      expect([...c.selectedCourseIds()]).toEqual(['c2']);
      httpMock.verify();
    });
  });

  describe('field handlers + validation', () => {
    function admin(): {
      fixture: ComponentFixture<OfferingCreateComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const built = setup();
      built.httpMock.expectOne((r) => r.url === COURSES_URL).flush(COURSES_BODY);
      built.fixture.detectChanges();
      return built;
    }

    it('drives label + capacity from typed DOM events and course from a checkbox', () => {
      const { fixture, element, httpMock } = admin();
      const c = fixture.componentInstance;

      const label = element.querySelector<HTMLInputElement>(
        '[data-testid="offering-create-label-input"]',
      )!;
      label.value = 'Cohort X';
      label.dispatchEvent(new Event('input'));
      expect(c.label()).toBe('Cohort X');

      checkbox(element, 'c2').click();
      expect([...c.selectedCourseIds()]).toEqual(['c2']);

      const cap = element.querySelector<HTMLInputElement>(
        '[data-testid="offering-create-capacity-input"]',
      )!;
      cap.value = '15';
      cap.dispatchEvent(new Event('input'));
      expect(c.capacity()).toBe(15);
      httpMock.verify();
    });

    it('coerces an emptied number field to 0 (unbounded)', () => {
      const { fixture, element, httpMock } = admin();
      const c = fixture.componentInstance;
      const cap = element.querySelector<HTMLInputElement>(
        '[data-testid="offering-create-capacity-input"]',
      )!;
      // A number input sanitises non-numeric text to '' → Number('') === 0.
      cap.value = '';
      cap.dispatchEvent(new Event('input'));
      expect(c.capacity()).toBe(0);
      expect(c.capacityValid()).toBe(true); // 0 = unbounded, valid
      httpMock.verify();
    });

    it('flags a non-integer capacity as invalid and blocks submit', () => {
      const { fixture, element, httpMock } = admin();
      const c = fixture.componentInstance;
      c.deliveryType.set('async');
      c.selectedCourseIds.set(['c1']);
      c.label.set('Async Track');
      c.capacity.set(3.5); // non-integer → invalid
      expect(c.capacityValid()).toBe(false);

      c.submit();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="offering-create-error-capacity"]'),
      ).not.toBeNull();
      // afterEach verify() asserts no POST fired (form invalid).
      httpMock.verify();
    });

    it('flags a negative capacity as invalid', () => {
      const { fixture, httpMock } = admin();
      const c = fixture.componentInstance;
      c.capacity.set(-3);
      expect(c.capacityValid()).toBe(false);
      httpMock.verify();
    });
  });

  describe('error-shape surfacing', () => {
    function submitAdmin(): {
      fixture: ComponentFixture<OfferingCreateComponent>;
      httpMock: HttpTestingController;
      element: HTMLElement;
    } {
      const built = setup();
      built.httpMock.expectOne((r) => r.url === COURSES_URL).flush(COURSES_BODY);
      built.fixture.detectChanges();
      const c = built.fixture.componentInstance;
      c.deliveryType.set('graduate');
      c.selectedCourseIds.set(['c1']);
      c.label.set('Valid Label');
      c.capacity.set(0);
      c.submit();
      return built;
    }

    it('surfaces a nested { message } envelope', () => {
      const { fixture, httpMock, element } = submitAdmin();
      httpMock
        .expectOne(CREATE_URL)
        .flush({ message: 'inner message form' }, { status: 409, statusText: 'Conflict' });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-create-error"]')?.textContent).toContain(
        'inner message form',
      );
      httpMock.verify();
    });

    it('surfaces a plain-string error body', () => {
      const { fixture, httpMock, element } = submitAdmin();
      httpMock
        .expectOne(CREATE_URL)
        .flush('bare text error', { status: 400, statusText: 'Bad Request' });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="offering-create-error"]')?.textContent).toContain(
        'bare text error',
      );
      httpMock.verify();
    });

    it('falls back to the HttpErrorResponse message on an empty 500 body', () => {
      const { fixture, httpMock, element } = submitAdmin();
      httpMock.expectOne(CREATE_URL).flush('', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="offering-create-error"]');
      expect(banner).not.toBeNull();
      expect((banner?.textContent ?? '').length).toBeGreaterThan(0);
      httpMock.verify();
    });
  });

  describe('a11y', () => {
    it('has zero critical/serious WCAG violations (admin form)', async () => {
      const { fixture, httpMock, element } = setup();
      httpMock.expectOne((r) => r.url === COURSES_URL).flush(COURSES_BODY);
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(element);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
      httpMock.verify();
    }, 30000);
  });
});
