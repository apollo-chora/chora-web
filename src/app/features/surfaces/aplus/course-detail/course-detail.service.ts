/**
 * CourseDetailService — A+ course-detail provider (Phyllis demo Step 6).
 *
 * Wired LIVE 2026-05-14 (fail-loud, no-debts directive): calls the real
 * BFF routes
 *   GET  /api/courses/{id}              → chora-delivery course detail
 *   POST /api/courses/{id}/enrol        → chora-delivery free enrolment
 *   POST /api/v1/checkout/course        → chora-payments paid checkout (ADR-164)
 *
 * Per ADR-164 (PROPOSED 2026-05-24) the paid-checkout call now targets the
 * canonical chora-payments REST proxy on chora-gateway. The legacy
 * `/api/v1/courses/{id}/checkout` path (chora-delivery-routed) is dead post
 * Stage C cutover — chora-delivery dropped the Stripe SDK in commit
 * `1308e9e7` and its STRIPE_* envs were removed by infra in `57a697b9`.
 *
 * Exposes two signal-backed discriminated unions:
 *   - `state` (`CourseDetailState`: loading / success / error) for the
 *     course load, so the component renders a fail-loud banner instead
 *     of hanging on the loading branch when the BFF returns 5xx.
 *   - `enrolState` (`EnrolState`: idle / enrolling / enrolled / error)
 *     for the enrol action.
 *
 * `load()` / `enrol()` are idempotent — re-call them for the retry CTAs.
 * Per chora-web CLAUDE.md §16 (Security) we never surface raw back-end
 * error bodies; the component translates an i18n key.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  CourseCj2Detail,
  CourseDetail,
  CourseDetailState,
  EnrolState,
} from './course-detail.model';

/**
 * Minimal shape of GET /api/v1/me/enrolments — only the course_id is
 * needed here to decide whether the current learner already holds an
 * enrolment row for the displayed course. The full enrolment payload
 * lives in course-enrolment-success.component.ts (post-checkout poller).
 */
interface MeEnrolmentItem {
  readonly course_id: string;
}

interface MeEnrolmentsResponse {
  readonly items: readonly MeEnrolmentItem[];
}

@Injectable({ providedIn: 'root' })
export class CourseDetailService {
  private readonly bff = inject(BffClientService);

  private readonly _state = signal<CourseDetailState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  /** Convenience selector: the course when success, else `null`. */
  readonly course = computed<CourseDetail | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.course : null;
  });

  /** Convenience selector: the CJ#2 enrichment when success + present. */
  readonly cj2 = computed<CourseCj2Detail | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.cj2 : null;
  });

  private readonly _enrolState = signal<EnrolState>({ status: 'idle' });
  readonly enrolState = this._enrolState.asReadonly();

  /**
   * `alreadyEnrolled` reflects whether the current learner ALREADY has a
   * course_enrollments row for this course (load-time check), independent
   * of the current-session `_enrolState` action signal. Drives the
   * "Open course" CTA on the detail page so a returning learner doesn't
   * see "Pay with Stripe" on a course they're already enrolled in.
   *
   * Defaults false until `load()` resolves the /api/v1/me/enrolments call.
   * An unauthenticated 401 collapses to false (fail-soft — the upstream
   * route is JWT-gated so the FE only renders this page for authed users
   * anyway; an anonymous reader sees the Pay CTA which then 401s on click).
   */
  private readonly _alreadyEnrolled = signal<boolean>(false);
  readonly alreadyEnrolled = this._alreadyEnrolled.asReadonly();

  /**
   * Fetch the course detail and publish to `state`. Called by the
   * component constructor + by the retry CTA. Safe to call repeatedly.
   *
   * Parallel-fetches the legacy catalog-shape `/api/courses/{id}` AND
   * the CJ#2 rich aggregate `/api/v1/courses/{id}`. The legacy call is
   * fail-loud; the CJ#2 call is best-effort (null on failure so pre-CJ#2
   * seeded courses still render via the legacy path).
   */
  load(courseId: string): void {
    this._state.set({ status: 'loading' });
    this._alreadyEnrolled.set(false);
    const encoded = encodeURIComponent(courseId);
    const legacy$ = this.bff.get<CourseDetail>(`/api/courses/${encoded}`);
    const cj2$ = this.bff
      .get<CourseCj2Detail>(`/api/v1/courses/${encoded}`)
      .pipe(catchError(() => of<CourseCj2Detail | null>(null)));
    // /api/v1/me/enrolments is best-effort — a 401 (anonymous reader) or
    // 5xx collapses to "not enrolled" so the page still renders the Pay
    // CTA fail-loud on the actual enrol action rather than blocking the
    // load on an enrolment-status lookup.
    const enrolments$ = this.bff
      .get<MeEnrolmentsResponse>(
        `/api/v1/me/enrolments?course_id=${encoded}`,
      )
      .pipe(catchError(() => of<MeEnrolmentsResponse | null>(null)));
    forkJoin({ course: legacy$, cj2: cj2$, enrolments: enrolments$ })
      .pipe(
        take(1),
        map(
          ({ course, cj2, enrolments }): CourseDetailState => {
            // Set the already-enrolled flag as a side-effect of the
            // resolved forkJoin — the component renders off the signal,
            // not the mapped state, so this stays inside the pipe.
            const enrolled = Boolean(
              enrolments?.items.some((e) => e.course_id === courseId),
            );
            this._alreadyEnrolled.set(enrolled);
            return { status: 'success', course, cj2 };
          },
        ),
        catchError((err: unknown) =>
          of<CourseDetailState>({
            status: 'error',
            error: this.errorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._state.set(s));
  }

  /**
   * Enrol the current learner in the given course. Branches on `isFree`:
   *   - free: POST /api/courses/{id}/enrol → direct same-identity enrol
   *   - paid: POST /api/v1/checkout/course → chora-payments REST proxy
   *     (ADR-164) → returns `stripe_checkout_url` → `window.location.href = …`
   *
   * `priceCents` is the catalog price; required for the paid branch (the
   * chora-payments handler cross-verifies against the actual Course row).
   * Pass 0 for the free branch — unused.
   *
   * Safe to call repeatedly (retry CTA). A 2xx free-enrol is success;
   * a 2xx checkout response triggers a navigation. The post-checkout
   * landing at /a/courses/{id}/enrolled verifies the enrolment.
   */
  enrol(courseId: string, isFree: boolean, priceCents: number): void {
    this._enrolState.set({ status: 'enrolling' });
    if (isFree) {
      this.bff
        .post<unknown>(
          '/api/courses/' + encodeURIComponent(courseId) + '/enrol',
          {},
        )
        .pipe(
          take(1),
          map((): EnrolState => ({ status: 'enrolled' })),
          catchError((err: unknown) =>
            of<EnrolState>({
              status: 'error',
              error: this.errorKey(err),
            }),
          ),
        )
        .subscribe((s) => this._enrolState.set(s));
      return;
    }
    // Paid: chora-payments Stripe Checkout Session flow (ADR-164).
    // Stripe substitutes the literal `{CHECKOUT_SESSION_ID}` token in
    // `success_url` before redirecting the browser; the success component
    // reads it from `?session_id=…` to drive enrolment-row polling.
    const origin = window.location.origin;
    const encodedId = encodeURIComponent(courseId);
    const body: CheckoutSessionRequest = {
      course_id: courseId,
      amount_cents: priceCents,
      currency: 'SGD',
      success_url:
        origin +
        '/a/courses/' +
        encodedId +
        '/enrolled?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:
        origin + '/a/courses/' + encodedId + '?checkout_cancelled=1',
    };
    this.bff
      .post<CheckoutSessionResponse>('/api/v1/checkout/course', body)
      .pipe(
        take(1),
        map(
          (res): EnrolState => ({
            status: 'redirecting',
            checkoutUrl: res.stripe_checkout_url,
          }),
        ),
        catchError((err: unknown) =>
          of<EnrolState>({
            status: 'error',
            error: this.errorKey(err),
          }),
        ),
      )
      .subscribe((s) => {
        this._enrolState.set(s);
        if (s.status === 'redirecting') {
          // Briefly show the redirecting state, then hard-navigate to
          // Stripe Checkout. Use href (not replace) so the back button
          // returns to the course-detail page after the user cancels.
          window.location.href = s.checkoutUrl;
        }
      });
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'aplus.course_detail.error_not_found';
      if (e.status >= 500) return 'aplus.course_detail.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.course_detail.error_unauthorised';
      }
    }
    return 'aplus.course_detail.error_generic';
  }
}
