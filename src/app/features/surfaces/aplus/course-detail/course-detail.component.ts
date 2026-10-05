/**
 * CourseDetailComponent — A+ course-detail page (Phyllis demo Step 6).
 *
 * Wired LIVE 2026-05-14 to the real BFF endpoints via `CourseDetailService`
 * (`GET /api/courses/{id}` + `POST /api/courses/{id}/enrol`). Renders ONLY
 * the fields the BE actually returns — no synthesized course codes /
 * overview copy / objectives / prerequisites / financial breakdown /
 * schedule slots. Fail-loud: a loading panel, an error banner with a retry
 * CTA, then the success view.
 *
 * Phyllis demo Step 6 happy path:
 *   1. Phyllis (Learner) lands on `/a/courses/{id}` from the catalog
 *   2. The course-detail view renders the real published course
 *   3. The "Enrol" CTA fires `POST /api/courses/{id}/enrol`
 *
 * The enrol endpoint currently returns a non-contract HTML 403 in PROD —
 * the FE is correctly wired to it and shows the fail-loud error path
 * honestly (no-debts directive 2026-05-14).
 *
 * Domain vocabulary anchors: `LearningAtom` (the unit a course's syllabus
 * is composed of), `TenantEntitlement` (cross-tenant public visibility) —
 * per `domain-vocabulary` skill.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { CourseDetailService } from './course-detail.service';
import { CourseDetail, formatPriceSgd } from './course-detail.model';

@Component({
  selector: 'chora-aplus-course-detail',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-detail.component.html',
  styleUrl: './course-detail.component.scss',
})
export class CourseDetailComponent {
  private readonly courseService = inject(CourseDetailService);
  private readonly route = inject(ActivatedRoute);

  /** Route-provided course id (the `courses/:courseId` segment). */
  readonly courseId = this.route.snapshot.paramMap.get('courseId') ?? '';

  /** Fail-loud discriminated state from the service (loading/success/error). */
  readonly state = this.courseService.state;
  readonly isLoading = computed<boolean>(
    () => this.state().status === 'loading',
  );
  readonly isError = computed<boolean>(() => this.state().status === 'error');
  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  /** Success-state course (or `null`). */
  readonly course = this.courseService.course;

  /** CJ#2 enrichment (or `null` for legacy seeded courses). */
  readonly cj2 = this.courseService.cj2;

  /** Has any CJ#2 enrichment field actually populated? Drives whether the
   *  "About this course" rich-section is rendered. */
  readonly hasCj2Detail = computed<boolean>(() => {
    const x = this.cj2();
    if (!x) return false;
    return Boolean(
      x.description ||
        (x.learning_objectives && x.learning_objectives.length > 0) ||
        (x.prerequisites && x.prerequisites.length > 0) ||
        (x.test_set_ids && x.test_set_ids.length > 0) ||
        x.scheduled_open_at,
    );
  });

  /** Enrol-action discriminated state (idle/enrolling/enrolled/error). */
  readonly enrolState = this.courseService.enrolState;
  readonly isEnrolling = computed<boolean>(
    () => this.enrolState().status === 'enrolling',
  );
  readonly isEnrolled = computed<boolean>(
    () => this.enrolState().status === 'enrolled',
  );
  readonly enrolErrorKey = computed<string>(() => {
    const s = this.enrolState();
    return s.status === 'error' ? s.error : '';
  });

  /** Load-time enrolment status — true if the learner already has a row in
   *  chora_delivery.course_enrollments for this course. Drives the
   *  "Open course" CTA so a returning learner doesn't see "Pay with
   *  Stripe" on a course they're already in. */
  readonly alreadyEnrolled = this.courseService.alreadyEnrolled;

  /** Combined "should show enrolled UI" — either the current-session enrol
   *  action just succeeded OR the load-time check found an existing row. */
  readonly showEnrolledState = computed<boolean>(
    () => this.alreadyEnrolled() || this.isEnrolled(),
  );

  constructor() {
    this.courseService.load(this.courseId);
  }

  // ── Actions ───────────────────────────────────────────────────────
  /** Retry CTA — re-fires the course-detail BFF call. */
  retry(): void {
    this.courseService.load(this.courseId);
  }

  /** Enrol CTA. Branches on `course.is_free`:
   *  - free: direct enrol via POST /api/courses/{id}/enrol
   *  - paid: Stripe Checkout flow via POST /api/v1/checkout/course
   *    (chora-payments REST proxy, ADR-164) */
  enrol(): void {
    const c = this.course();
    if (!c) return;
    this.courseService.enrol(this.courseId, c.is_free, c.price_sgd_cents);
  }

  readonly isRedirecting = computed<boolean>(
    () => this.enrolState().status === 'redirecting',
  );

  /** Was the user bounced back from a cancelled Stripe Checkout? Drives
   *  an informational banner on the course-detail page. */
  readonly checkoutCancelled = computed<boolean>(
    () => this.route.snapshot.queryParamMap.get('checkout_cancelled') === '1',
  );

  // ── Display helpers ───────────────────────────────────────────────
  priceLabel(course: CourseDetail): string {
    return formatPriceSgd(course.price_sgd_cents);
  }
}
