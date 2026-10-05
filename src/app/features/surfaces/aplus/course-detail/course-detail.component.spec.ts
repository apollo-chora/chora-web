import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal, type Signal, type WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { CourseDetailComponent } from './course-detail.component';
import { CourseDetailService } from './course-detail.service';
import { TranslateService } from '../../../../core/services/translate.service';
import {
  formatPriceSgd,
  type CourseCj2Detail,
  type CourseDetail,
  type CourseDetailState,
  type EnrolState,
} from './course-detail.model';
import { buildCourseDetail } from '../../../../testing/builders/buildCourseDetail';

/**
 * A+ Course Detail component spec — Phyllis demo Step 6.
 *
 * Wired LIVE 2026-05-14: `CourseDetailService` is mocked with writable-signal
 * `state` + `enrolState` stubs so the fail-loud loading / error / success
 * branches and the enrol-action states can be exercised deterministically
 * without touching HTTP. Per chora-web CLAUDE.md §6 — test data via the
 * `buildCourseDetail` builder, never inline object literals.
 */

const COURSE_ID = '05000000-0000-7000-8000-0000000c5301';

class MockCourseDetailService {
  readonly _state: WritableSignal<CourseDetailState> = signal<CourseDetailState>({
    status: 'loading',
  });
  readonly state = this._state.asReadonly();
  readonly _enrolState: WritableSignal<EnrolState> = signal<EnrolState>({
    status: 'idle',
  });
  readonly enrolState = this._enrolState.asReadonly();

  /**
   * Convenience selectors mirroring the real service's `computed<…>(...)`
   * contract. The component reads `courseService.course` AND
   * `courseService.cj2` directly — both must be signal-callable on the
   * mock or `hasCj2Detail()` blows up on `this.cj2 is not a function`
   * during the first render of the success branch (post commit 46df8b71
   * the template short-circuits via `hasCj2Detail() && cj2()`).
   */
  readonly course: Signal<CourseDetail | null> = computed<CourseDetail | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.course : null;
  });
  readonly cj2: Signal<CourseCj2Detail | null> = computed<CourseCj2Detail | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.cj2 : null;
  });

  readonly _alreadyEnrolled: WritableSignal<boolean> = signal<boolean>(false);
  readonly alreadyEnrolled = this._alreadyEnrolled.asReadonly();

  setAlreadyEnrolled(v: boolean): void {
    this._alreadyEnrolled.set(v);
  }

  loadCalls: string[] = [];
  enrolCalls: string[] = [];
  enrolIsFreeCalls: boolean[] = [];
  enrolPriceCentsCalls: number[] = [];

  setState(s: CourseDetailState): void {
    this._state.set(s);
  }

  setEnrolState(s: EnrolState): void {
    this._enrolState.set(s);
  }

  load(id: string): void {
    this.loadCalls.push(id);
  }

  /**
   * ADR-164 chora-payments signature update: the real service now takes
   * (courseId, isFree, priceCents) — priceCents is forwarded to the new
   * /api/v1/checkout/course handler as `amount_cents`. The mock captures
   * all three args for assertion parity.
   */
  enrol(id: string, isFree?: boolean, priceCents?: number): void {
    this.enrolCalls.push(id);
    this.enrolIsFreeCalls.push(isFree ?? false);
    this.enrolPriceCentsCalls.push(priceCents ?? 0);
  }
}

function makeMock(): MockCourseDetailService {
  return new MockCourseDetailService();
}

/**
 * Configures the TestBed with a parametrised ActivatedRoute snapshot so the
 * route-derived branches (`courseId ?? ''` null-arm + `checkoutCancelled()`
 * `=== '1'`) can each be driven from a fresh component instance. `params` and
 * `queryParams` default to the happy-path values used by the base `setup()`.
 */
function setupWithRoute(opts: {
  params?: Record<string, string>;
  queryParams?: Record<string, string>;
}): {
  fixture: ComponentFixture<CourseDetailComponent>;
  mock: MockCourseDetailService;
} {
  const mock = makeMock();
  TestBed.configureTestingModule({
    imports: [CourseDetailComponent],
    providers: [
      provideRouter([{ path: 'a/catalog', children: [] }]),
      TranslateService,
      { provide: CourseDetailService, useValue: mock },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(opts.params ?? { courseId: COURSE_ID }),
            queryParamMap: convertToParamMap(opts.queryParams ?? {}),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CourseDetailComponent);
  fixture.detectChanges();
  return { fixture, mock };
}

function setup(): {
  fixture: ComponentFixture<CourseDetailComponent>;
  mock: MockCourseDetailService;
} {
  return setupWithRoute({ params: { courseId: COURSE_ID } });
}

describe('CourseDetailComponent (Phyllis Step 6 — real BFF wiring)', () => {
  let fixture: ComponentFixture<CourseDetailComponent>;
  let element: HTMLElement;
  let mock: MockCourseDetailService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const result = setup();
    fixture = result.fixture;
    mock = result.mock;
    element = fixture.nativeElement as HTMLElement;
  });

  describe('surface shell + load on construct', () => {
    it('renders with the surface-aplus accent class', () => {
      const root = element.querySelector('[data-testid="aplus-course-detail"]');
      expect(root?.className).toContain('surface-aplus');
    });

    it('calls CourseDetailService.load() exactly once with the route id', () => {
      expect(mock.loadCalls).toEqual([COURSE_ID]);
    });
  });

  describe('loading state', () => {
    it('renders the loading panel while the service is loading', () => {
      const loading = element.querySelector('[data-testid="aplus-course-detail-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('aria-busy')).toBe('true');
      expect(loading?.getAttribute('role')).toBe('status');
    });
  });

  describe('error state (fail-loud)', () => {
    beforeEach(() => {
      mock.setState({
        status: 'error',
        error: 'aplus.course_detail.error_not_found',
      });
      fixture.detectChanges();
    });

    it('renders the fail-loud error banner with role=alert', () => {
      const err = element.querySelector('[data-testid="aplus-course-detail-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
    });

    it('renders a retry button that re-calls load() with the route id', () => {
      const retry = element.querySelector(
        '[data-testid="aplus-course-detail-retry"]',
      ) as HTMLButtonElement;
      expect(retry).not.toBeNull();
      retry.click();
      expect(mock.loadCalls).toEqual([COURSE_ID, COURSE_ID]);
    });
  });

  describe('success state — real-field rendering', () => {
    it('renders the course title', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({
          id: COURSE_ID,
          title: 'Certified ScrumMaster (CSM) Prep',
        }),
        cj2: null,
      });
      fixture.detectChanges();
      const title = element.querySelector('[data-testid="course-detail-title"]');
      expect(title?.textContent).toContain('Certified ScrumMaster (CSM) Prep');
    });

    it('renders the free badge for a free course', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ is_free: true }),
        cj2: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="course-detail-free-badge"]')).not.toBeNull();
    });

    it('renders the price label for a paid course', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ is_free: false, price_sgd_cents: 58000 }),
        cj2: null,
      });
      fixture.detectChanges();
      const price = element.querySelector('[data-testid="course-detail-price"]');
      expect(price?.textContent?.trim()).toBe('SGD 580');
    });

    it('renders the SkillsFuture badge only for sf_eligible courses', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ sf_eligible: false }),
        cj2: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="course-detail-sf-badge"]')).toBeNull();

      mock.setState({
        status: 'success',
        course: buildCourseDetail({ sf_eligible: true }),
        cj2: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="course-detail-sf-badge"]')).not.toBeNull();
    });

    it('renders the enrolled count', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ enrolled_count: 42 }),
        cj2: null,
      });
      fixture.detectChanges();
      const enrolled = element.querySelector('[data-testid="course-detail-enrolled-count"]');
      expect(enrolled?.textContent).toContain('42');
    });

    it('renders the visibility', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ visibility: 'public' }),
        cj2: null,
      });
      fixture.detectChanges();
      const vis = element.querySelector('[data-testid="course-detail-visibility"]');
      expect(vis?.textContent).toContain('public');
    });

    it('renders a back-to-catalog link', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail(),
        cj2: null,
      });
      fixture.detectChanges();
      const back = element.querySelector('[data-testid="course-detail-back-to-catalog"]');
      expect(back).not.toBeNull();
    });
  });

  describe('honest empty-field rendering', () => {
    it('does NOT render a faked instructor when instructor_name is ""', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ instructor_name: '' }),
        cj2: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="course-detail-instructor"]')).toBeNull();
    });

    it('renders the instructor only when BE actually provides a name', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ instructor_name: 'Dr Tan' }),
        cj2: null,
      });
      fixture.detectChanges();
      const inst = element.querySelector('[data-testid="course-detail-instructor"]');
      expect(inst?.textContent).toContain('Dr Tan');
    });

    it('hides the modules row when syllabus_outline_count is 0', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ syllabus_outline_count: 0 }),
        cj2: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="course-detail-modules"]')).toBeNull();
    });

    it('renders the modules row when syllabus_outline_count > 0', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ syllabus_outline_count: 5 }),
        cj2: null,
      });
      fixture.detectChanges();
      const modules = element.querySelector('[data-testid="course-detail-modules"]');
      expect(modules?.textContent).toContain('5');
    });

    it('renders tag chips only when tags are present', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ tags: [] }),
        cj2: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="course-detail-tags"]')).toBeNull();

      mock.setState({
        status: 'success',
        course: buildCourseDetail({ tags: ['agile', 'scrum'] }),
        cj2: null,
      });
      fixture.detectChanges();
      const tags = element.querySelector('[data-testid="course-detail-tags"]');
      expect(tags?.textContent).toContain('agile');
      expect(tags?.textContent).toContain('scrum');
    });
  });

  describe('enrol action', () => {
    beforeEach(() => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ id: COURSE_ID }),
        cj2: null,
      });
      fixture.detectChanges();
    });

    it('renders an enabled Enrol button while idle', () => {
      const btn = element.querySelector(
        '[data-testid="course-detail-enrol-btn"]',
      ) as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.disabled).toBe(false);
    });

    it('clicking Enrol calls service.enrol() with the route id', () => {
      const btn = element.querySelector(
        '[data-testid="course-detail-enrol-btn"]',
      ) as HTMLButtonElement;
      btn.click();
      expect(mock.enrolCalls).toEqual([COURSE_ID]);
    });

    it('disables the Enrol button while enrolling', () => {
      mock.setEnrolState({ status: 'enrolling' });
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="course-detail-enrol-btn"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('renders a success confirmation when enrolled', () => {
      mock.setEnrolState({ status: 'enrolled' });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="course-detail-enrol-success"]')).not.toBeNull();
    });

    it('renders a fail-loud inline error (role=alert) when enrol errors', () => {
      mock.setEnrolState({
        status: 'error',
        error: 'aplus.course_detail.error_unauthorised',
      });
      fixture.detectChanges();
      const err = element.querySelector('[data-testid="course-detail-enrol-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
    });

    it('re-enables the Enrol button after an enrol error so the learner can retry', () => {
      mock.setEnrolState({
        status: 'error',
        error: 'aplus.course_detail.error_unauthorised',
      });
      fixture.detectChanges();
      const btn = element.querySelector(
        '[data-testid="course-detail-enrol-btn"]',
      ) as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.disabled).toBe(false);
      btn.click();
      expect(mock.enrolCalls).toEqual([COURSE_ID]);
    });
  });

  describe('helpers', () => {
    it('formatPriceSgd renders 0 as "SGD 0"', () => {
      expect(formatPriceSgd(0)).toBe('SGD 0');
    });

    it('formatPriceSgd renders 58000 cents as SGD 580', () => {
      expect(formatPriceSgd(58000)).toBe('SGD 580');
    });
  });

  // ── Branch-coverage augmentation (computed signals + guards) ────────
  // These exercise the FALSE arms / through-cases of the component's
  // conditional logic that the success/error rendering tests above don't
  // reach. Each test below targets a specific uncovered branch.

  describe('computed: errorKey() / enrolErrorKey() non-error arms', () => {
    it('errorKey() returns "" when state is NOT error (success)', () => {
      // ternary `s.status === 'error' ? s.error : ''` — falsy arm.
      mock.setState({
        status: 'success',
        course: buildCourseDetail(),
        cj2: null,
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('');
    });

    it('errorKey() returns the i18n key when state IS error', () => {
      mock.setState({
        status: 'error',
        error: 'aplus.course_detail.error_upstream',
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.errorKey()).toBe('aplus.course_detail.error_upstream');
    });

    it('enrolErrorKey() returns "" when enrolState is NOT error (idle)', () => {
      // default _enrolState is idle — the `: ''` arm of the ternary.
      expect(fixture.componentInstance.enrolErrorKey()).toBe('');
    });

    it('enrolErrorKey() returns the i18n key when enrolState IS error', () => {
      mock.setEnrolState({
        status: 'error',
        error: 'aplus.course_detail.error_unauthorised',
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.enrolErrorKey()).toBe(
        'aplus.course_detail.error_unauthorised',
      );
    });
  });

  describe('computed: hasCj2Detail() — every OR operand + all-falsy', () => {
    function successWithCj2(cj2: CourseCj2Detail | null): void {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ id: COURSE_ID }),
        cj2,
      });
      fixture.detectChanges();
    }

    it('returns false when cj2 is null (the !x early return)', () => {
      successWithCj2(null);
      expect(fixture.componentInstance.hasCj2Detail()).toBe(false);
    });

    it('returns false when cj2 is present but every field is empty', () => {
      // Drives the Boolean(...) chain where ALL OR operands are falsy.
      successWithCj2({
        description: '',
        learning_objectives: [],
        prerequisites: [],
        test_set_ids: [],
        scheduled_open_at: '',
      });
      expect(fixture.componentInstance.hasCj2Detail()).toBe(false);
      expect(element.querySelector('[data-testid="course-detail-cj2"]')).toBeNull();
    });

    it('returns true on description alone (first OR operand truthy)', () => {
      successWithCj2({ description: 'A rich course description.' });
      expect(fixture.componentInstance.hasCj2Detail()).toBe(true);
      const desc = element.querySelector('[data-testid="course-detail-description"]');
      expect(desc?.textContent).toContain('A rich course description.');
    });

    it('returns true on learning_objectives (length > 0 operand)', () => {
      successWithCj2({ learning_objectives: ['Understand Scrum'] });
      expect(fixture.componentInstance.hasCj2Detail()).toBe(true);
      const block = element.querySelector('[data-testid="course-detail-objectives-block"]');
      expect(block?.textContent).toContain('Understand Scrum');
    });

    it('returns true on prerequisites (length > 0 operand)', () => {
      successWithCj2({ prerequisites: ['Basic project management'] });
      expect(fixture.componentInstance.hasCj2Detail()).toBe(true);
      const block = element.querySelector('[data-testid="course-detail-prereqs-block"]');
      expect(block?.textContent).toContain('Basic project management');
    });

    it('returns true on test_set_ids (length > 0 operand)', () => {
      successWithCj2({ test_set_ids: ['ts-1', 'ts-2'] });
      expect(fixture.componentInstance.hasCj2Detail()).toBe(true);
      const count = element.querySelector('[data-testid="course-detail-testsets-count"]');
      expect(count?.textContent).toContain('2');
    });

    it('returns true on scheduled_open_at (last OR operand)', () => {
      successWithCj2({ scheduled_open_at: '2026-07-01T00:00:00Z' });
      expect(fixture.componentInstance.hasCj2Detail()).toBe(true);
      const sched = element.querySelector('[data-testid="course-detail-scheduled"]');
      expect(sched?.textContent).toContain('2026-07-01T00:00:00Z');
    });
  });

  describe('computed: showEnrolledState() — || short-circuit + through', () => {
    beforeEach(() => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ id: COURSE_ID, is_free: false }),
        cj2: null,
      });
      fixture.detectChanges();
    });

    it('is true when alreadyEnrolled() is true (short-circuits before isEnrolled)', () => {
      mock.setAlreadyEnrolled(true);
      fixture.detectChanges();
      expect(fixture.componentInstance.showEnrolledState()).toBe(true);
      // Open-course CTA replaces the Pay button.
      expect(element.querySelector('[data-testid="course-detail-open-course-btn"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="course-detail-enrol-btn"]')).toBeNull();
    });

    it('is true via the isEnrolled() through-case when alreadyEnrolled is false', () => {
      mock.setAlreadyEnrolled(false);
      mock.setEnrolState({ status: 'enrolled' });
      fixture.detectChanges();
      expect(fixture.componentInstance.showEnrolledState()).toBe(true);
    });

    it('is false when neither alreadyEnrolled nor isEnrolled (both falsy)', () => {
      mock.setAlreadyEnrolled(false);
      mock.setEnrolState({ status: 'idle' });
      fixture.detectChanges();
      expect(fixture.componentInstance.showEnrolledState()).toBe(false);
      // Paid + not enrolled → the pay-price-note renders.
      expect(element.querySelector('[data-testid="course-detail-pay-price-note"]')).not.toBeNull();
    });
  });

  describe('computed: isRedirecting() + paid enrol CTA states', () => {
    beforeEach(() => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({ id: COURSE_ID, is_free: false, price_sgd_cents: 58000 }),
        cj2: null,
      });
      fixture.detectChanges();
    });

    it('isRedirecting() is true and disables the CTA when redirecting to Stripe', () => {
      mock.setEnrolState({
        status: 'redirecting',
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
      });
      fixture.detectChanges();
      expect(fixture.componentInstance.isRedirecting()).toBe(true);
      const btn = element.querySelector(
        '[data-testid="course-detail-enrol-btn"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toContain('redirecting_to_stripe');
    });

    it('isRedirecting() is false for the idle paid state', () => {
      expect(fixture.componentInstance.isRedirecting()).toBe(false);
    });
  });

  describe('enrol() guard — early return when no course loaded', () => {
    it('does NOT call service.enrol() when course() is null (loading state)', () => {
      // state is still 'loading' (default) → course() === null → `if (!c) return`.
      expect(fixture.componentInstance.course()).toBeNull();
      fixture.componentInstance.enrol();
      expect(mock.enrolCalls).toEqual([]);
    });

    it('calls service.enrol() forwarding is_free + price_sgd_cents when course present', () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({
          id: COURSE_ID,
          is_free: false,
          price_sgd_cents: 58000,
        }),
        cj2: null,
      });
      fixture.detectChanges();
      fixture.componentInstance.enrol();
      expect(mock.enrolCalls).toEqual([COURSE_ID]);
      expect(mock.enrolIsFreeCalls).toEqual([false]);
      expect(mock.enrolPriceCentsCalls).toEqual([58000]);
    });
  });

  describe('route-derived branches (fresh ActivatedRoute snapshots)', () => {
    it('courseId falls back to "" when the route has no courseId param', () => {
      // Drives the `?? ''` nullish-coalescing fallback arm.
      TestBed.resetTestingModule();
      const { fixture: f, mock: m } = setupWithRoute({ params: {} });
      expect(f.componentInstance.courseId).toBe('');
      // load() is still called once with the empty id.
      expect(m.loadCalls).toEqual(['']);
    });

    it('checkoutCancelled() is true and renders the banner when ?checkout_cancelled=1', () => {
      TestBed.resetTestingModule();
      const { fixture: f, mock: m } = setupWithRoute({
        params: { courseId: COURSE_ID },
        queryParams: { checkout_cancelled: '1' },
      });
      m.setState({
        status: 'success',
        course: buildCourseDetail({ id: COURSE_ID }),
        cj2: null,
      });
      f.detectChanges();
      expect(f.componentInstance.checkoutCancelled()).toBe(true);
      const el = f.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="course-detail-checkout-cancelled"]')).not.toBeNull();
    });

    it('checkoutCancelled() is false when the query param is absent', () => {
      // base setup has an empty queryParamMap → `=== '1'` is false.
      expect(fixture.componentInstance.checkoutCancelled()).toBe(false);
    });
  });

  describe('a11y (axe-core)', () => {
    it('has zero critical/serious WCAG violations on the success view', async () => {
      mock.setState({
        status: 'success',
        course: buildCourseDetail({
          id: COURSE_ID,
          title: 'Accessible Course',
          instructor_name: 'Dr Tan',
          tags: ['agile'],
          syllabus_outline_count: 3,
          sf_eligible: true,
        }),
        cj2: null,
      });
      fixture.detectChanges();
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });
});
