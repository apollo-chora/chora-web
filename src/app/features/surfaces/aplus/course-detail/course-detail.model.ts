/**
 * Course Detail model — A+ course-detail page (Phyllis demo Step 6).
 *
 * Wired LIVE 2026-05-14 to the real BFF endpoints:
 *   GET  /api/courses/{id}        → chora-gateway → chora-delivery
 *   POST /api/courses/{id}/enrol  → chora-gateway → chora-delivery
 *
 * The interface mirrors the wire shape EXACTLY (snake_case, as the BE
 * serialises it) — the SAME field set as `CatalogCourse`. No synthesized
 * / enriched fields: `instructor_name` is often `''`, `tags` / counts are
 * often empty/0 straight from the BE — that is the real data state and
 * the UI renders it honestly (fail-loud, no-debts directive 2026-05-14).
 *
 * The wave-3 rich `CourseDetail` (courseCode / overview / objectives /
 * prerequisites / financialLines / schedules / …) plus `EnrolmentState`,
 * `ObjectiveRow`, `PrerequisiteRow`, `FinancialLine`, `ScheduleSlot`,
 * `seatsBadgeKey`, `seatsBadgeClass` have been DROPPED — the BE provides
 * NONE of those fields.
 */

/** A single course as returned by `GET /api/courses/{id}`. */
export interface CourseDetail {
  /** Course aggregate id (UUIDv7). */
  readonly id: string;
  readonly title: string;
  /** Publishing tenant id (UUIDv7) — public courses cross tenant by design. */
  readonly tenant_id: string;
  /** Instructor GCID — opaque, not a display field. */
  readonly instructor_gcid: string;
  /** Public-display instructor name — often `''` from BE; never faked. */
  readonly instructor_name: string;
  readonly is_free: boolean;
  /** Course fee in SGD cents (0 when free). */
  readonly price_sgd_cents: number;
  readonly public: boolean;
  readonly visibility: string;
  /** SkillsFuture-eligible flag. */
  readonly sf_eligible: boolean;
  readonly enrolled_count: number;
  readonly syllabus_outline_count: number;
  readonly tags: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Optional CJ#2-aggregate fields surfaced alongside the legacy catalog
 * row when `GET /api/v1/courses/{id}` returns 2xx. Populated by a parallel
 * fetch in CourseDetailService.load. Carries learning_objectives /
 * prerequisites / test_set_ids count / scheduled_open_at / description.
 * Null when the CJ#2 read fails (pre-CJ#2 seeded courses) — UI falls
 * back gracefully to the catalog-row fields only.
 */
export interface CourseCj2Detail {
  readonly description?: string;
  readonly learning_objectives?: readonly string[];
  readonly prerequisites?: readonly string[];
  readonly test_set_ids?: readonly string[];
  readonly scheduled_open_at?: string;
  readonly published_at?: string;
  readonly instructor_gcids?: readonly string[];
}

/**
 * Discriminated-union state for the course-detail load. Mirrors the
 * `AsyncState<T>` fail-loud pattern used across chora-web (see
 * `catalog.model.ts`). `error` is an i18n key — never a raw BE body.
 *
 * `cj2` carries the optional rich-aggregate fields when `/api/v1/courses/{id}`
 * also returns 2xx; `null` for pre-CJ#2 seeded courses or auth-gated
 * failures (the legacy row is still rendered).
 */
export type CourseDetailState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly course: CourseDetail;
      readonly cj2: CourseCj2Detail | null;
    }
  | { readonly status: 'error'; readonly error: string };

/**
 * Discriminated-union state for the enrol action.
 *
 * Two distinct flows:
 *   - **Free courses** (`is_free === true`): POST /api/courses/{id}/enrol →
 *     direct same-identity enrol. Successful 2xx → status `'enrolled'`.
 *   - **Paid courses** (`is_free === false` + `price_sgd_cents > 0`):
 *     POST /api/v1/checkout/course → chora-gateway proxies to chora-payments
 *     PaymentService.CreateCourseCheckoutSession (ADR-164). Returns a Stripe
 *     Checkout URL the FE redirects to via `window.location.href`; status
 *     briefly becomes `'redirecting'` before the navigation flushes. The
 *     Stripe success redirect lands at /a/courses/{id}/enrolled?session_id=…
 *     where the EnrolmentSuccessComponent verifies the enrolment.
 *
 * `error` is an i18n key — never a raw BE body.
 */
export type EnrolState =
  | { readonly status: 'idle' }
  | { readonly status: 'enrolling' }
  | { readonly status: 'enrolled' }
  | { readonly status: 'redirecting'; readonly checkoutUrl: string }
  | { readonly status: 'error'; readonly error: string };

/**
 * Request body for POST /api/v1/checkout/course (ADR-164). Forwarded as-is
 * to chora-payments PaymentService.CreateCourseCheckoutSession over gRPC.
 * `amount_cents` is the catalog price (chora-payments cross-verifies).
 * `currency` is the 3-letter ISO code. `success_url` MUST contain the literal
 * `{CHECKOUT_SESSION_ID}` placeholder that Stripe substitutes before redirect.
 */
export interface CheckoutSessionRequest {
  readonly course_id: string;
  readonly amount_cents: number;
  readonly currency: string;
  readonly success_url: string;
  readonly cancel_url: string;
}

/**
 * Response shape from POST /api/v1/checkout/course — chora-payments canonical
 * envelope (ADR-164). All 5 Purchase aggregates converge on this shape.
 * `state` is a snake-case enum string (e.g. `checkout_started`).
 */
export interface CheckoutSessionResponse {
  readonly purchase_id: string;
  readonly stripe_session_id: string;
  readonly stripe_checkout_url: string;
  readonly state: string;
}

/** Display helper: SGD-cents → `SGD 0` / `SGD 580` style label. */
export function formatPriceSgd(priceCents: number): string {
  if (priceCents === 0) {
    return 'SGD 0';
  }
  const dollars = priceCents / 100;
  return `SGD ${dollars.toLocaleString('en-SG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
