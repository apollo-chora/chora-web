import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { DashboardService } from './dashboard.service';
import { LastActiveDayService } from '../../../../core/familiar/last-active-day.service';
import {
  buildDashboardSummary,
  buildLearnerCourseSummary,
  buildStreakSummary,
} from '../../../../testing/builders/buildDashboardSummary';

/**
 * DashboardService spec — A+ multi-role dashboard (Phyllis demo Step 1b/6).
 *
 * Wired LIVE 2026-05-14 to `GET /api/me/dashboard`. The hardcoded
 * `PHYLLIS_DASHBOARD` fixture is gone — these tests flush the REAL wire
 * shape through `HttpTestingController` and assert the fail-loud
 * discriminated state. Per chora-web CLAUDE.md §6 — `httpMock.verify()`
 * in afterEach.
 *
 * A `partial: true` body is still a 200 — the service resolves it to
 * `success` (the component surfaces a non-blocking notice); it is NEVER
 * treated as an error.
 */

function setup(): {
  service: DashboardService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(DashboardService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

describe('DashboardService (Phyllis Step 1b/6 — real BFF wiring)', () => {
  let service: DashboardService;
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

  describe('load()', () => {
    it('issues GET /api/me/dashboard on load()', () => {
      service.load();
      const req = httpMock.expectOne((r) => r.url.includes('/api/me/dashboard'));
      expect(req.request.method).toBe('GET');
      req.flush(buildDashboardSummary());
    });

    it('starts in the loading state before any flush', () => {
      expect(service.state().status).toBe('loading');
      service.load();
      expect(service.state().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(buildDashboardSummary());
    });

    it('transitions to success with the real wire shape', () => {
      const summary = buildDashboardSummary({
        gcidPillLabel: 'ONE IDENTITY · GCID active',
        userDisplayName: '',
        currentStreakDays: 0,
        learnerCourses: [],
        instructorCourses: [],
      });
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(summary);

      const state = service.state();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.summary.gcidPillLabel).toContain('GCID');
        expect(state.summary.userDisplayName).toBe('');
        expect(state.summary.learnerCourses).toEqual([]);
      }
      expect(service.summary()?.gcidPillLabel).toContain('GCID');
    });

    it('flows a populated learnerCourses[] through to summary()', () => {
      const summary = buildDashboardSummary({
        learnerCourses: [
          buildLearnerCourseSummary({ courseId: 'c-1', title: 'CSM Prep' }),
        ],
      });
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(summary);
      expect(service.summary()?.learnerCourses.length).toBe(1);
      expect(service.summary()?.learnerCourses[0].title).toBe('CSM Prep');
    });

    it('flows a partial:true body through to summary() (NOT an error)', () => {
      const summary = buildDashboardSummary({
        partial: true,
        part_errors: { userDisplayName: 'upstream_4xx' },
        known_gaps: {
          instructorCourses:
            'no_downstream_source: chora-delivery exposes no by-instructor course list',
        },
      });
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(summary);

      const state = service.state();
      expect(state.status).toBe('success');
      if (state.status === 'success') {
        expect(state.summary.partial).toBe(true);
        expect(state.summary.part_errors?.['userDisplayName']).toBe(
          'upstream_4xx',
        );
        expect(state.summary.known_gaps?.['instructorCourses']).toContain(
          'no_downstream_source',
        );
      }
      expect(service.summary()?.partial).toBe(true);
    });

    it('exposes a null summary() selector while loading / on error', () => {
      expect(service.summary()).toBeNull();
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.summary()).toBeNull();
    });

    it('maps a 5xx to error_upstream', () => {
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.dashboard.error_upstream');
      }
    });

    it('maps a 502 to error_upstream', () => {
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(null, { status: 502, statusText: 'Bad Gateway' });

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.dashboard.error_upstream');
      }
    });

    it('maps a 401 to error_unauthorised', () => {
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(null, { status: 401, statusText: 'Unauthorized' });

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.dashboard.error_unauthorised');
      }
    });

    it('maps a 403 to error_unauthorised', () => {
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(null, { status: 403, statusText: 'Forbidden' });

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.dashboard.error_unauthorised');
      }
    });

    it('maps a network error (status 0) to error_generic', () => {
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .error(new ProgressEvent('error'));

      const state = service.state();
      expect(state.status).toBe('error');
      if (state.status === 'error') {
        expect(state.error).toBe('aplus.dashboard.error_generic');
      }
    });

    it('load() is idempotent — callable twice, recovers on the second flush', () => {
      service.load();
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      expect(service.state().status).toBe('error');

      service.load();
      expect(service.state().status).toBe('loading');
      httpMock
        .expectOne((r) => r.url.includes('/api/me/dashboard'))
        .flush(buildDashboardSummary());
      expect(service.state().status).toBe('success');
      expect(service.summary()?.gcidPillLabel).toContain('GCID');
    });
  });
});

/**
 * The streak block is the ONLY server surface the browser can reach that
 * carries the learner's last-active day, and the companion's mood is the
 * home's warmth carrier (UX Track U package B5). Seeding it here is what stops
 * the mood resetting to "just arrived" on every reload.
 */
describe('DashboardService seeds the last-active day', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;
  let lastActiveDay: LastActiveDayService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const result = setup();
    service = result.service;
    httpMock = result.httpMock;
    lastActiveDay = TestBed.inject(LastActiveDayService);
  });

  afterEach(() => httpMock.verify());

  function flush(body: unknown): void {
    service.load();
    // `flush` will not take `unknown`; these fixtures are deliberately malformed
    // bodies, so the cast is the point of the test rather than a shortcut.
    httpMock
      .expectOne((r) => r.url.includes('/api/me/dashboard'))
      .flush(body as Record<string, unknown>);
  }

  it('takes the day from streak.last_completion_at', () => {
    flush(
      buildDashboardSummary({
        streak: buildStreakSummary({ last_completion_at: '2026-08-30T00:00:00Z' }),
      }),
    );
    expect(lastActiveDay.day()).toBe(Date.parse('2026-08-30T00:00:00Z'));
  });

  it('leaves the day unknown when the streak block is absent', () => {
    // A degraded upstream omits the block entirely. Unknown must stay unknown:
    // a fabricated day would make the companion look freshly active.
    flush(buildDashboardSummary({ partial: true }));
    expect(lastActiveDay.day()).toBeNull();
  });

  it('leaves the day unknown when the load fails', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/me/dashboard'))
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(lastActiveDay.day()).toBeNull();
  });
});
