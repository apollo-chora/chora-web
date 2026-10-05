import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { CourseDetailService } from './course-detail.service';
import { buildCourseDetail } from '../../../../testing/builders/buildCourseDetail';

/**
 * CourseDetailService spec — A+ course-detail page (Phyllis demo Step 6).
 *
 * Wired LIVE 2026-05-14 to GET /api/courses/{id} + POST /api/courses/{id}/enrol.
 * The wave-3 fixture (`CSPO_DETAIL_FIXTURE`) + the enrol `delay(0)` mock are
 * gone — these tests flush the REAL wire shape through HttpTestingController
 * and assert the fail-loud discriminated state. Per chora-web CLAUDE.md §6 —
 * `httpMock.verify()` in afterEach.
 *
 * The enrol endpoint currently returns a non-contract HTML 403 in PROD —
 * the spec asserts the FE handles that honestly (`enrolState` → error),
 * never mocking a success-response shape.
 *
 * CJ#2 drift (commit 46df8b71): load() now forkJoin-fetches both the
 * legacy `/api/courses/{id}` AND the CJ#2 rich `/api/v1/courses/{id}`.
 * Each load() therefore generates 2 outstanding requests; `flushCj2`
 * helper drains the CJ#2 leg (best-effort path) so httpMock.verify()
 * passes.
 */

const COURSE_ID = '05000000-0000-7000-8000-0000000c5301';

function setup(): {
  service: CourseDetailService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(CourseDetailService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

/**
 * Drain the parallel CJ#2 fetch with a 404 so the best-effort branch
 * resolves to `cj2: null`. Distinguishes by `/api/v1/courses/` substring
 * (the legacy leg uses `/api/courses/` without the `v1` segment).
 *
 * NOTE: when the legacy leg errors first, forkJoin unsubscribes from the
 * CJ#2 leg → the HttpTestingController marks that request `cancelled`.
 * `match()` still returns cancelled requests (drains them out of `open`),
 * but `flush()` THROWS `Cannot flush a cancelled request.` if invoked
 * on a cancelled one. Skip cancelled requests — `match()` already
 * removed them from the open queue, so `httpMock.verify()` passes.
 */
function flushCj2(httpMock: HttpTestingController): void {
  const sideReqs = httpMock.match(
    (r) =>
      r.url.includes('/api/v1/courses/') ||
      r.url.includes('/api/v1/me/enrolments'),
  );
  for (const req of sideReqs) {
    if (req.cancelled) continue;
    req.flush(null, { status: 404, statusText: 'Not Found' });
  }
}

describe('CourseDetailService (Phyllis Step 6 — real BFF wiring)', () => {
  let service: CourseDetailService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const result = setup();
    service = result.service;
    httpMock = result.httpMock;
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ── load() ──────────────────────────────────────────────────────────
  describe('load()', () => {
    it('issues GET /api/courses/{id} (URI-encoded) on load()', () => {
      service.load(COURSE_ID);
      const req = httpMock.expectOne(
        (r) =>
          r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
      );
      expect(req.request.method).toBe('GET');
      expect(req.request.url).toContain(`/api/courses/${encodeURIComponent(COURSE_ID)}`);
      req.flush(buildCourseDetail());
      flushCj2(httpMock);
    });

    it('URI-encodes a course id with unsafe characters', () => {
      service.load('a b/c');
      const req = httpMock.expectOne(
        (r) =>
          r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
      );
      expect(req.request.url).toContain('/api/courses/a%20b%2Fc');
      req.flush(buildCourseDetail());
      flushCj2(httpMock);
    });

    it('starts in the loading state before any flush', () => {
      expect(service.state().status).toBe('loading');
      service.load(COURSE_ID);
      expect(service.state().status).toBe('loading');
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
        )
        .flush(buildCourseDetail());
      flushCj2(httpMock);
    });

    it('transitions to success with the real wire shape', () => {
      const course = buildCourseDetail({
        id: COURSE_ID,
        title: 'Certified ScrumMaster (CSM) Prep',
      });
      service.load(COURSE_ID);
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
        )
        .flush(course);
      flushCj2(httpMock);

      const state = service.state();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.course.id).toBe(COURSE_ID);
        expect(state.course.title).toBe('Certified ScrumMaster (CSM) Prep');
      }
      expect(service.course()?.id).toBe(COURSE_ID);
    });

    it('exposes a null course() selector while loading / on error', () => {
      expect(service.course()).toBeNull();
      service.load(COURSE_ID);
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
        )
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      flushCj2(httpMock);
      expect(service.course()).toBeNull();
    });

    it('maps a 404 to error_not_found', () => {
      service.load(COURSE_ID);
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
        )
        .flush(null, { status: 404, statusText: 'Not Found' });
      flushCj2(httpMock);

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.course_detail.error_not_found');
      }
    });

    it('maps a 5xx to error_upstream', () => {
      service.load(COURSE_ID);
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
        )
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      flushCj2(httpMock);

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.course_detail.error_upstream');
      }
    });

    it('maps a 401 to error_unauthorised', () => {
      service.load(COURSE_ID);
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
        )
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      flushCj2(httpMock);

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.course_detail.error_unauthorised');
      }
    });

    it('maps a 403 to error_unauthorised', () => {
      service.load(COURSE_ID);
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
        )
        .flush(null, { status: 403, statusText: 'Forbidden' });
      flushCj2(httpMock);

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.course_detail.error_unauthorised');
      }
    });

    it('maps a network error (status 0) to error_generic', () => {
      service.load(COURSE_ID);
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
        )
        .error(new ProgressEvent('error'));
      flushCj2(httpMock);

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.course_detail.error_generic');
      }
    });

    it('load() is idempotent — callable twice, recovers on the second flush', () => {
      service.load(COURSE_ID);
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
        )
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      flushCj2(httpMock);
      expect(service.state().status).toBe('error');

      service.load(COURSE_ID);
      expect(service.state().status).toBe('loading');
      httpMock
        .expectOne(
          (r) =>
            r.url.includes('/api/courses/') && !r.url.includes('/api/v1/'),
        )
        .flush(buildCourseDetail());
      flushCj2(httpMock);
      expect(service.state().status).toBe('success');
      expect(service.course()?.id).toBe(COURSE_ID);
    });
  });

  // ── enrol() ─────────────────────────────────────────────────────────
  describe('enrol() — free path', () => {
    it('issues POST /api/courses/{id}/enrol with an empty body', () => {
      service.enrol(COURSE_ID, true, 0);
      const req = httpMock.expectOne((r) => r.url.includes('/enrol'));
      expect(req.request.method).toBe('POST');
      expect(req.request.url).toContain(
        `/api/courses/${encodeURIComponent(COURSE_ID)}/enrol`,
      );
      expect(req.request.body).toEqual({});
      req.flush({});
    });

    it('starts idle and transitions to enrolling before any flush', () => {
      expect(service.enrolState().status).toBe('idle');
      service.enrol(COURSE_ID, true, 0);
      expect(service.enrolState().status).toBe('enrolling');
      httpMock.expectOne((r) => r.url.includes('/enrol')).flush({});
    });

    it('transitions to enrolled on a 2xx (body ignored)', () => {
      service.enrol(COURSE_ID, true, 0);
      httpMock
        .expectOne((r) => r.url.includes('/enrol'))
        .flush({ anything: 'ignored' });
      expect(service.enrolState().status).toBe('enrolled');
    });

    it('transitions to error on the live 403 (endpoint not cleanly available)', () => {
      service.enrol(COURSE_ID, true, 0);
      httpMock
        .expectOne((r) => r.url.includes('/enrol'))
        .flush('<html>403</html>', { status: 403, statusText: 'Forbidden' });

      const state = service.enrolState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.course_detail.error_unauthorised');
      }
    });

    it('maps an enrol 5xx to error_upstream', () => {
      service.enrol(COURSE_ID, true, 0);
      httpMock
        .expectOne((r) => r.url.includes('/enrol'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });

      const state = service.enrolState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.course_detail.error_upstream');
      }
    });

    it('enrol() is idempotent — re-callable for the retry CTA', () => {
      service.enrol(COURSE_ID, true, 0);
      httpMock
        .expectOne((r) => r.url.includes('/enrol'))
        .flush('<html>403</html>', { status: 403, statusText: 'Forbidden' });
      expect(service.enrolState().status).toBe('error');

      service.enrol(COURSE_ID, true, 0);
      expect(service.enrolState().status).toBe('enrolling');
      httpMock.expectOne((r) => r.url.includes('/enrol')).flush({});
      expect(service.enrolState().status).toBe('enrolled');
    });
  });

  // ── enrol() — paid path (chora-payments Stripe Checkout, ADR-164) ──
  describe('enrol() — paid path (chora-payments REST proxy)', () => {
    let originalLocation: Location;
    const PRICE_CENTS = 58000; // SGD 580
    const CHECKOUT_PATH = '/api/v1/checkout/course';

    beforeEach(() => {
      originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: { href: '', origin: 'https://chora.site' } as Location,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: originalLocation,
      });
    });

    it('POSTs the ADR-164 body to /api/v1/checkout/course and redirects', () => {
      service.enrol(COURSE_ID, false, PRICE_CENTS);
      expect(service.enrolState().status).toBe('enrolling');

      const req = httpMock.expectOne((r) => r.url.endsWith(CHECKOUT_PATH));
      expect(req.request.method).toBe('POST');
      const encodedId = encodeURIComponent(COURSE_ID);
      expect(req.request.body).toEqual({
        course_id: COURSE_ID,
        amount_cents: PRICE_CENTS,
        currency: 'SGD',
        success_url: `https://chora.site/a/courses/${encodedId}/enrolled?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://chora.site/a/courses/${encodedId}?checkout_cancelled=1`,
      });

      const checkoutUrl =
        'https://checkout.stripe.com/c/pay/cs_test_a1b2c3d4#fidkdWxOYHwnPyd1blpxYHZxWj0xRX1KQndJPGxvfWhONTRGQUtwYG1xN3xkTVBzZ2BvNVxgN1JoNXxqYHc3a01vR0F2VjVGdkkx';
      req.flush({
        purchase_id: '02000000-0000-7000-8000-000000000abc',
        stripe_session_id: 'cs_test_a1b2c3d4',
        stripe_checkout_url: checkoutUrl,
        state: 'checkout_started',
      });

      const state = service.enrolState();
      expect(state.status).toBe('redirecting');
      if (state.status === 'redirecting') {
        expect(state.checkoutUrl).toBe(checkoutUrl);
      }
      expect(window.location.href).toBe(checkoutUrl);
    });

    it('maps a checkout 5xx to error_upstream', () => {
      service.enrol(COURSE_ID, false, PRICE_CENTS);
      httpMock
        .expectOne((r) => r.url.endsWith(CHECKOUT_PATH))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });

      const state = service.enrolState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.course_detail.error_upstream');
      }
    });

    it('maps a checkout 401 to error_unauthorised', () => {
      service.enrol(COURSE_ID, false, PRICE_CENTS);
      httpMock
        .expectOne((r) => r.url.endsWith(CHECKOUT_PATH))
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      const state = service.enrolState();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.course_detail.error_unauthorised');
      }
    });
  });
});
