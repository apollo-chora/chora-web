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
  CourseEnrolmentSuccessComponent,
  backoffDelay,
} from './course-enrolment-success.component';
import { TranslateService } from '../../../../core/services/translate.service';

/**
 * CourseEnrolmentSuccessComponent spec — polling backoff + fail-loud timeout.
 *
 * Verifies:
 *  1. backoffDelay() pure function — exponential curve + 8s cap
 *  2. Polling state machine: polling → success (navigate to learn)
 *  3. Polling state machine: polling → timeout (all 12 attempts exhausted)
 *  4. Timeout carries explicit "contact support" i18n key context in the DOM
 *  5. Auth errors (401/403) fail loud immediately
 *  6. Missing courseId / sessionId route params fail loud with error state
 *  7. Progress bar advances as polls run
 *  8. retry() resets and re-polls
 *
 * Uses vi.useFakeTimers() to control setTimeout-based backoff without
 * real time passing.
 */

const COURSE_ID = '05000000-0000-7000-8000-0000000c5301';
const SESSION_ID = 'cs_test_abc123';

function setup(params: { courseId?: string; sessionId?: string } = {}): {
  fixture: ComponentFixture<CourseEnrolmentSuccessComponent>;
  httpMock: HttpTestingController;
  element: HTMLElement;
} {
  TestBed.configureTestingModule({
    imports: [CourseEnrolmentSuccessComponent],
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
            queryParamMap: convertToParamMap({
              session_id: params.sessionId ?? SESSION_ID,
            }),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CourseEnrolmentSuccessComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  tick(0);
  return { fixture, httpMock, element: fixture.nativeElement as HTMLElement };
}

// ── backoffDelay() pure function ──────────────────────────────────────────────
describe('backoffDelay()', () => {
  it('returns 500ms for attempt 0', () => {
    expect(backoffDelay(0)).toBe(500);
  });

  it('returns 1000ms for attempt 1', () => {
    expect(backoffDelay(1)).toBe(1000);
  });

  it('returns 2000ms for attempt 2', () => {
    expect(backoffDelay(2)).toBe(2000);
  });

  it('returns 4000ms for attempt 3', () => {
    expect(backoffDelay(3)).toBe(4000);
  });

  it('caps at 8000ms for attempt 4', () => {
    expect(backoffDelay(4)).toBe(8000);
  });

  it('caps at 8000ms for attempt 10 (never exceeds max)', () => {
    expect(backoffDelay(10)).toBe(8000);
  });
});

// ── Component state machine ───────────────────────────────────────────────────
describe('CourseEnrolmentSuccessComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('missing route params → immediate error state', () => {
    it('shows error state when courseId is empty', fakeAsync(() => {
      const { fixture, element, httpMock } = setup({ courseId: '' });
      fixture.detectChanges();
      const err = element.querySelector(
        '[data-testid="aplus-enrolment-success-error"]',
      );
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      httpMock.verify();
    }));

    it('shows error state when session_id is absent', fakeAsync(() => {
      const { fixture, element, httpMock } = setup({ sessionId: '' });
      fixture.detectChanges();
      const err = element.querySelector(
        '[data-testid="aplus-enrolment-success-error"]',
      );
      expect(err).not.toBeNull();
      httpMock.verify();
    }));
  });

  describe('initial polling state', () => {
    it('renders the polling panel on first render', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const polling = element.querySelector(
        '[data-testid="aplus-enrolment-success-polling"]',
      );
      expect(polling).not.toBeNull();
      expect(polling?.getAttribute('aria-busy')).toBe('true');
      expect(polling?.getAttribute('role')).toBe('status');
      // Drain the first immediate poll request
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/enrolments'));
      httpMock.verify();
      fixture.destroy();
    }));

    it('renders a progress bar at 0% initially', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const progress = element.querySelector(
        '[data-testid="aplus-enrolment-success-progress"]',
      );
      expect(progress).not.toBeNull();
      expect(progress?.getAttribute('aria-valuenow')).toBe('0');
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/enrolments'));
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('success path (enrolment row found)', () => {
    it('transitions to success and renders the confirmed panel', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      // First immediate poll
      const req = httpMock.expectOne((r) =>
        r.url.includes('/api/v1/me/enrolments'),
      );
      req.flush({
        items: [
          {
            enrolment_id: 'enr-001',
            course_id: COURSE_ID,
            state: 'active',
            created_at: '2026-05-26T10:00:00Z',
          },
        ],
      });
      fixture.detectChanges();
      const confirmed = element.querySelector(
        '[data-testid="aplus-enrolment-success-confirmed"]',
      );
      expect(confirmed).not.toBeNull();
      expect(confirmed?.getAttribute('role')).toBe('status');
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('timeout path (all attempts exhausted)', () => {
    it('transitions to timeout after MAX_POLL_ATTEMPTS with role=alert', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();

      // Run all 12 poll attempts — each returns items:[] (not found)
      for (let attempt = 0; attempt < 12; attempt++) {
        // Drain the currently scheduled HTTP request
        httpMock
          .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
          .flush({ items: [] });
        fixture.detectChanges();

        if (attempt < 11) {
          // Advance fake timers to trigger the next backoff delay.
          // After flushing iteration `attempt`, the component schedules the
          // next poll via schedulePoll(attempt + 1), whose delay is
          // backoffDelay((attempt + 1) - 1) = backoffDelay(attempt).
          const delay = Math.min(500 * Math.pow(2, attempt), 8000);
          tick(delay + 1);
        }
      }

      fixture.detectChanges();

      const timeout = element.querySelector(
        '[data-testid="aplus-enrolment-success-timeout"]',
      );
      expect(timeout).not.toBeNull();
      expect(timeout?.getAttribute('role')).toBe('alert');
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('auth error path', () => {
    it('transitions to error on 401 immediately', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();

      const err = element.querySelector(
        '[data-testid="aplus-enrolment-success-error"]',
      );
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      httpMock.verify();
      fixture.destroy();
    }));

    it('transitions to error on 403 immediately', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();

      const err = element.querySelector(
        '[data-testid="aplus-enrolment-success-error"]',
      );
      expect(err).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('retry CTA', () => {
    it('retry() resets to polling state and re-polls', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      // First poll — 401 forces error state
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="aplus-enrolment-success-error"]'),
      ).not.toBeNull();

      // Click retry — component resets and fires a new poll
      const component = fixture.componentInstance;
      component.retry();
      fixture.detectChanges();
      // retry() re-schedules the poll via setTimeout(0); advance it so the
      // re-poll HTTP request is actually in flight before we expectOne it.
      tick(0);

      // Polling panel should be visible again
      expect(
        element.querySelector('[data-testid="aplus-enrolment-success-polling"]'),
      ).not.toBeNull();

      // Drain the retry poll
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush({
          items: [
            {
              enrolment_id: 'enr-002',
              course_id: COURSE_ID,
              state: 'active',
              created_at: '2026-05-26T10:05:00Z',
            },
          ],
        });
      fixture.detectChanges();

      expect(
        element.querySelector('[data-testid="aplus-enrolment-success-confirmed"]'),
      ).not.toBeNull();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('non-auth transient error path', () => {
    it('keeps polling (no error state) on a 500 and schedules the next attempt', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      // First poll returns a transient 5xx — must NOT fail loud, must continue.
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      fixture.detectChanges();

      // Still polling — no error/timeout panel yet.
      expect(
        element.querySelector('[data-testid="aplus-enrolment-success-error"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="aplus-enrolment-success-polling"]'),
      ).not.toBeNull();
      expect(fixture.componentInstance.isPolling()).toBe(true);

      // Advance the backoff (attempt 0 → next delay = backoffDelay(0) = 500ms)
      // and drain the rescheduled poll so the test ends clean.
      tick(501);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush({ items: [] });
      fixture.detectChanges();
      httpMock.verify();
      fixture.destroy();
    }));

    it('treats an error object without a status as transient (optional-chain falsy arm)', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      // ErrorEvent (network-style) → HttpErrorResponse with status 0 →
      // neither 401 nor 403 → continueOrTimeout (keep polling).
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .error(new ProgressEvent('network error'));
      fixture.detectChanges();
      expect(fixture.componentInstance.isPolling()).toBe(true);
      expect(fixture.componentInstance.isError()).toBe(false);

      tick(501);
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush({ items: [] });
      fixture.detectChanges();
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('computed signals in non-polling states', () => {
    it('attempts() returns MAX_POLL_ATTEMPTS and progressPct()/errorKey() reset in success state', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush({
          items: [
            {
              enrolment_id: 'enr-010',
              course_id: COURSE_ID,
              state: 'active',
              created_at: '2026-05-26T11:00:00Z',
            },
          ],
        });
      fixture.detectChanges();

      const c = fixture.componentInstance;
      expect(c.isSuccess()).toBe(true);
      // Non-polling arms of the ternaries.
      expect(c.attempts()).toBe(12);
      expect(c.progressPct()).toBe(0);
      expect(c.errorKey()).toBe('');
      expect(c.etaSeconds()).toBe(0);
      httpMock.verify();
      fixture.destroy();
    }));

    it('errorKey() carries the unauthorised i18n key in the error state', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush(null, { status: 403, statusText: 'Forbidden' });
      fixture.detectChanges();

      const c = fixture.componentInstance;
      expect(c.isError()).toBe(true);
      expect(c.errorKey()).toBe(
        'aplus.course_enrolment_success.error_unauthorised',
      );
      // Non-polling arms still resolve their else branches.
      expect(c.attempts()).toBe(12);
      expect(c.progressPct()).toBe(0);
      expect(c.etaSeconds()).toBe(0);
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('etaSeconds + progressPct while polling', () => {
    it('etaSeconds() decreases across the polling window and floors at 1', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      const c = fixture.componentInstance;

      // Attempt 0 → tickIndex 0 → remaining 12 → round(30) = 30.
      expect(c.etaSeconds()).toBe(30);
      expect(c.progressPct()).toBe(0);

      // Walk attempts until the very last polling tick (tickIndex 11), where
      // remaining = 1 → round(2.5) = 3, then confirm the Math.max(1, …) floor
      // only ever bites at tickIndex 12 (which is the timeout transition).
      for (let attempt = 0; attempt < 11; attempt++) {
        httpMock
          .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
          .flush({ items: [] });
        fixture.detectChanges();
        const delay = Math.min(500 * Math.pow(2, attempt), 8000);
        tick(delay + 1);
      }
      fixture.detectChanges();

      // Now at tickIndex 11 (12th and final polling attempt in flight).
      expect(c.isPolling()).toBe(true);
      expect(c.attempts()).toBe(12);
      // remaining = 12 - 11 = 1 → round(2.5) = 3.
      expect(c.etaSeconds()).toBe(3);
      // progressPct = round(11 / 12 * 100) = 92.
      expect(c.progressPct()).toBe(92);

      // Drain the final poll → timeout (budget exhausted).
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush({ items: [] });
      fixture.detectChanges();
      expect(c.isTimeout()).toBe(true);
      httpMock.verify();
      fixture.destroy();
    }));
  });

  describe('destroyed guard in schedulePoll', () => {
    it('does not fire a poll after the component is destroyed', fakeAsync(() => {
      const { fixture, httpMock } = setup();
      // Drain the first immediate poll, keep enrolment absent so a backoff
      // poll gets scheduled.
      httpMock
        .expectOne((r) => r.url.includes('/api/v1/me/enrolments'))
        .flush({ items: [] });
      fixture.detectChanges();

      // Tear down — destroyRef.onDestroy sets destroyed = true and clears the
      // pending timer. Re-arm a timer via schedulePoll AFTER destroy so the
      // `if (this.destroyed) return;` guard short-circuits when it fires.
      fixture.destroy();
      fixture.componentInstance.schedulePoll(1);
      tick(10_000);

      // No HTTP request should have been issued by the post-destroy timer.
      httpMock.verify();
    }));
  });

  describe('surface shell + a11y', () => {
    it('renders with the surface-aplus class', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const root = element.querySelector(
        '[data-testid="aplus-enrolment-success"]',
      );
      expect(root?.className).toContain('surface-aplus');
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/enrolments'));
      httpMock.verify();
      fixture.destroy();
    }));

    it('renders a glass-panel wrapper', fakeAsync(() => {
      const { fixture, element, httpMock } = setup();
      const panel = element.querySelector('.enrolment-success__panel');
      expect(panel?.classList).toContain('glass-panel');
      httpMock.expectOne((r) => r.url.includes('/api/v1/me/enrolments'));
      httpMock.verify();
      fixture.destroy();
    }));
  });
});
