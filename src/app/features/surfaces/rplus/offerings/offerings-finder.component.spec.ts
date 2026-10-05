/**
 * OfferingsFinderComponent spec — the /r/offerings unified delivery finder.
 *
 * Mounts with the REAL OfferingsService + ExamsService over
 * HttpTestingController (no service-level mock per feedback_no_stubs_real_wiring),
 * proving the finder fires the live offering search AND the exam sittings list
 * on entry (R3 exam-fold), merges exam sittings in as `delivery_type=exam` rows
 * that link to the exam workspace `/r/exams/:id`, keeps offering rows linking to
 * `/r/offerings/:id`, and is axe-clean.
 *
 * Every mount now fires TWO GETs on page 1 (search/offerings + exams) because
 * the finder folds the two sources together client-side (there is no union
 * endpoint; `delivery_type=exam` is rejected by the offering domain).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { OfferingsFinderComponent } from './offerings-finder.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { environment } from '../../../../../environments/environment';

const SEARCH_URL = `${environment.bffBaseUrl}/api/v1/search/offerings`;
const EXAMS_URL = `${environment.bffBaseUrl}/api/v1/exams`;
const PORTFOLIO_GCID = '00000000-0000-7000-8000-000000001999';
const PORTFOLIO_URL = `${environment.bffBaseUrl}/api/v1/instructors/${encodeURIComponent(PORTFOLIO_GCID)}/courses`;

const WIRE_PAGE = {
  items: [
    {
      id: 'of1',
      tenant_id: 't1',
      course_id: 'c1',
      delivery_type: 'graduate',
      label: 'Graduate Cohort A',
      capacity: 30,
      state: 'RUNNING',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    },
    {
      id: 'of2',
      tenant_id: 't1',
      course_id: 'c2',
      delivery_type: 'short',
      label: 'Short Course B',
      capacity: 12,
      state: 'DRAFT',
      created_at: '2026-06-10T00:00:00Z',
      updated_at: '2026-06-10T00:00:00Z',
    },
  ],
  facets: [
    {
      field: 'delivery_type',
      values: [
        { value: 'graduate', label: 'graduate', count: 1 },
        { value: 'short', label: 'short', count: 1 },
      ],
    },
    { field: 'state', values: [{ value: 'DRAFT', label: 'DRAFT', count: 1 }] },
  ],
  next_cursor: null,
  total_estimate: 2,
};

/** No upcoming sittings — the common case; keeps the existing row assertions. */
const EMPTY_EXAMS = { items: [] as const };

/** One upcoming exam sitting (BackendExam wire shape for GET /api/v1/exams). */
const WIRE_EXAM = {
  id: 'ex1',
  title: 'Certified Scrum Product Owner',
  scheduled_at: '2026-06-12T09:00:00Z',
  capacity: 40,
  enrolled_count: 5,
  proctor_method: 'Room 5',
  state: 'OPEN',
};

function setup(): {
  fixture: ComponentFixture<OfferingsFinderComponent>;
  element: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [OfferingsFinderComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(OfferingsFinderComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, httpMock };
}

describe('OfferingsFinderComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('fires the live offering search AND the exam sittings list on entry and renders the rows', () => {
    const { fixture, element, httpMock } = setup();
    const req = httpMock.expectOne((r) => r.url === SEARCH_URL);
    expect(req.request.method).toBe('GET');
    req.flush(WIRE_PAGE);
    const examReq = httpMock.expectOne((r) => r.url === EXAMS_URL);
    expect(examReq.request.method).toBe('GET');
    examReq.flush(EMPTY_EXAMS);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="cv-table"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="cv-row-of1"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="cv-row-of2"]')).toBeTruthy();
    httpMock.verify();
  });

  it('links each offering row to its /r/offerings/:id workspace', () => {
    const { fixture, element, httpMock } = setup();
    httpMock.expectOne((r) => r.url === SEARCH_URL).flush(WIRE_PAGE);
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush(EMPTY_EXAMS);
    fixture.detectChanges();

    const link = element.querySelector('[data-testid="cv-row-link-of1"]') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/r/offerings/of1');
    httpMock.verify();
  });

  it('folds an upcoming exam sitting in as an exam-badged row linking to /r/exams/:id', () => {
    const { fixture, element, httpMock } = setup();
    httpMock.expectOne((r) => r.url === SEARCH_URL).flush(WIRE_PAGE);
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush({ items: [WIRE_EXAM] });
    fixture.detectChanges();

    // The exam sitting renders as a finder row, badged delivery_type=exam.
    const examRow = element.querySelector('[data-testid="cv-row-ex1"]');
    expect(examRow).toBeTruthy();
    const badge = examRow?.querySelector('[data-badge-field="delivery_type"]');
    expect(badge?.textContent?.trim()).toBe('rplus.offerings.delivery_type_value.exam');

    // The exam row routes to the exam workspace...
    const examLink = element.querySelector(
      '[data-testid="cv-row-link-ex1"]',
    ) as HTMLAnchorElement;
    expect(examLink).toBeTruthy();
    expect(examLink.getAttribute('href')).toBe('/r/exams/ex1');

    // ...while offering rows still route to the offering workspace.
    const offeringLink = element.querySelector(
      '[data-testid="cv-row-link-of1"]',
    ) as HTMLAnchorElement;
    expect(offeringLink.getAttribute('href')).toBe('/r/offerings/of1');
    httpMock.verify();
  });

  it('does not re-fetch or re-append exams on a load-more cursor page', () => {
    const { fixture, element, httpMock } = setup();
    // Page 1: offerings + exams, with a forward cursor so "load more" is available.
    httpMock.expectOne((r) => r.url === SEARCH_URL).flush({ ...WIRE_PAGE, next_cursor: 'CUR2' });
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush({ items: [WIRE_EXAM] });
    fixture.detectChanges();
    expect(element.querySelectorAll('[data-testid="cv-row-ex1"]')).toHaveLength(1);

    // Load more → cursor page fetches OFFERINGS ONLY (no second exams call).
    fixture.componentInstance.store.loadMore();
    httpMock.expectOne((r) => r.url === SEARCH_URL).flush({
      items: [
        {
          id: 'of3',
          tenant_id: 't1',
          course_id: 'c3',
          delivery_type: 'short',
          label: 'Short Course C',
          capacity: 8,
          state: 'DRAFT',
          created_at: '2026-06-20T00:00:00Z',
          updated_at: '2026-06-20T00:00:00Z',
        },
      ],
      facets: [],
      next_cursor: null,
      total_estimate: 3,
    });
    fixture.detectChanges();

    // The appended offering rendered; the exam row is NOT duplicated; and
    // verify() proves no GET /api/v1/exams fired on the cursor page.
    expect(element.querySelector('[data-testid="cv-row-of3"]')).toBeTruthy();
    expect(element.querySelectorAll('[data-testid="cv-row-ex1"]')).toHaveLength(1);
    httpMock.verify();
  });

  it('mirrors a user-driven query change to the URL (merge + replaceUrl)', () => {
    const { fixture, httpMock } = setup();
    httpMock.expectOne((r) => r.url === SEARCH_URL).flush(WIRE_PAGE);
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush(EMPTY_EXAMS);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.store.toggleFilter('delivery_type', 'graduate');
    fixture.detectChanges(); // flush the URL-sync effect

    expect(navSpy).toHaveBeenCalledTimes(1);
    const [, extras] = navSpy.mock.calls[0];
    expect(extras).toMatchObject({ queryParamsHandling: 'merge', replaceUrl: true });
    expect(extras?.queryParams?.['filters']).toBe('delivery_type:graduate');

    // The filter change also fired a fresh page-1 search (offerings + exams).
    httpMock.expectOne((r) => r.url === SEARCH_URL).flush(WIRE_PAGE);
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush(EMPTY_EXAMS);
    httpMock.verify();
  });

  it('surfaces a fail-loud error banner when the offering search fails', () => {
    const { fixture, element, httpMock } = setup();
    // Exams complete; the offering search fails → the forkJoin fails loud.
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush(EMPTY_EXAMS);
    httpMock
      .expectOne((r) => r.url === SEARCH_URL)
      .flush('boom', { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    const banner = element.querySelector('[data-testid="cv-error"]');
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(element.querySelector('[data-testid="cv-retry"]')).toBeTruthy();
    httpMock.verify();
  });

  it('has no critical/serious axe violations in the loaded state', async () => {
    const { fixture, element, httpMock } = setup();
    httpMock.expectOne((r) => r.url === SEARCH_URL).flush(WIRE_PAGE);
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush(EMPTY_EXAMS);
    fixture.detectChanges();

    const axe = (await import('axe-core')).default;
    const results = await axe.run(element);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    httpMock.verify();
  });
});

// ── R4 (CHO-2269): the finder is the R+ landing + absorbs the Rostering ──────
// portfolio dashboard as a header. A signed-in instructor's session fires a
// THIRD GET (the instructor-courses read); an anonymous session (the base
// setup above) short-circuits with no gcid, which is why every test above
// still sees exactly two GETs. The header shows ONLY honest data (instructor
// name, course count, learner sum), never the dashboard's old hardcoded
// at-risk / completion / attendance zeros.
describe('OfferingsFinderComponent portfolio header (R4)', () => {
  beforeEach(() => TestBed.resetTestingModule());

  function setupAuthed(): {
    fixture: ComponentFixture<OfferingsFinderComponent>;
    element: HTMLElement;
    httpMock: HttpTestingController;
  } {
    TestBed.configureTestingModule({
      imports: [OfferingsFinderComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const auth = TestBed.inject(AuthService);
    auth.setUser(
      {
        gcid: PORTFOLIO_GCID,
        tenantId: 'tenant-001',
        roles: ['INSTRUCTOR'],
        capabilities: [],
        displayName: 'Mr. Chen',
        email: 'chen@example.com',
      },
      'fake-jwt',
    );
    const fixture = TestBed.createComponent(OfferingsFinderComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, httpMock };
  }

  /** Flush the two finder-list GETs so the collection renders normally. */
  function flushList(httpMock: HttpTestingController): void {
    httpMock.expectOne((r) => r.url === SEARCH_URL).flush(WIRE_PAGE);
    httpMock.expectOne((r) => r.url === EXAMS_URL).flush(EMPTY_EXAMS);
  }

  it('renders the portfolio header with instructor name, course count, and learner sum', () => {
    const { fixture, element, httpMock } = setupAuthed();
    flushList(httpMock);
    httpMock.expectOne((r) => r.url === PORTFOLIO_URL).flush({
      items: [
        { id: 'c1', title: 'Certified Scrum Product Owner', enrolled_count: 12 },
        { id: 'c2', title: 'Data Structures 101', enrolled_count: 8 },
      ],
      total: 2,
    });
    fixture.detectChanges();

    const header = element.querySelector('[data-testid="offerings-portfolio"]');
    expect(header).toBeTruthy();
    expect(
      element.querySelector('[data-testid="portfolio-instructor"]')?.textContent,
    ).toContain('Mr. Chen');
    expect(
      element.querySelector('[data-testid="portfolio-courses"]')?.textContent,
    ).toContain('2');
    expect(
      element.querySelector('[data-testid="portfolio-learners"]')?.textContent,
    ).toContain('20');
    httpMock.verify();
  });

  it('shows NO fabricated at-risk / completion / attendance metric', () => {
    const { fixture, element, httpMock } = setupAuthed();
    flushList(httpMock);
    httpMock.expectOne((r) => r.url === PORTFOLIO_URL).flush({
      items: [{ id: 'c1', title: 'X', enrolled_count: 5 }],
      total: 1,
    });
    fixture.detectChanges();

    const header = element.querySelector('[data-testid="offerings-portfolio"]');
    expect(header).toBeTruthy();
    const text = (header?.textContent ?? '').toLowerCase();
    expect(text).not.toContain('at-risk');
    expect(text).not.toContain('at risk');
    expect(text).not.toContain('completion');
    expect(text).not.toContain('attendance');
    // The absorbed dashboard's metric testids must not resurface here.
    expect(element.querySelector('[data-testid="portfolio-at-risk"]')).toBeNull();
    expect(element.querySelector('[data-testid="portfolio-completion"]')).toBeNull();
    httpMock.verify();
  });

  it('marks the learner sum a lower bound when the portfolio is paged (total > loaded)', () => {
    const { fixture, element, httpMock } = setupAuthed();
    flushList(httpMock);
    httpMock.expectOne((r) => r.url === PORTFOLIO_URL).flush({
      items: [{ id: 'c1', title: 'X', enrolled_count: 5 }],
      total: 250,
    });
    fixture.detectChanges();

    // The exact-vs-floor distinction is visible, so a capped sum is never
    // presented as the truth (the marker element carries the "+" / lower-bound).
    expect(element.querySelector('[data-testid="portfolio-learners-lowerbound"]')).toBeTruthy();
    expect(
      element.querySelector('[data-testid="portfolio-courses"]')?.textContent,
    ).toContain('250');
    httpMock.verify();
  });

  it('isolates a header load failure: header errors loudly, the offerings list still renders', () => {
    const { fixture, element, httpMock } = setupAuthed();
    flushList(httpMock);
    httpMock
      .expectOne((r) => r.url === PORTFOLIO_URL)
      .flush('boom', { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    // Header shows its own loud error + retry...
    const err = element.querySelector('[data-testid="portfolio-error"]');
    expect(err?.getAttribute('role')).toBe('alert');
    expect(element.querySelector('[data-testid="portfolio-retry"]')).toBeTruthy();
    // ...while the list is untouched (a header failure never takes the landing out).
    expect(element.querySelector('[data-testid="cv-table"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="cv-row-of1"]')).toBeTruthy();
    httpMock.verify();
  });

  it('surfaces the backend error envelope detail in the header alert', () => {
    const { fixture, element, httpMock } = setupAuthed();
    flushList(httpMock);
    // The BFF returns a JSON error envelope { message }; the loud detail names it.
    httpMock.expectOne((r) => r.url === PORTFOLIO_URL).flush(
      { message: 'Downstream unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    fixture.detectChanges();

    const detail = element.querySelector('[data-testid="portfolio-error"]')?.textContent ?? '';
    expect(detail).toContain('Downstream unavailable');
    httpMock.verify();
  });

  it('retries the header read without re-fetching the list', () => {
    const { fixture, element, httpMock } = setupAuthed();
    flushList(httpMock);
    httpMock
      .expectOne((r) => r.url === PORTFOLIO_URL)
      .flush('boom', { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    const retry = element.querySelector('[data-testid="portfolio-retry"]') as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();

    // Only the portfolio read re-fires; the list GETs are NOT repeated.
    httpMock.expectOne((r) => r.url === PORTFOLIO_URL).flush({
      items: [{ id: 'c1', title: 'X', enrolled_count: 7 }],
      total: 1,
    });
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="portfolio-learners"]')?.textContent,
    ).toContain('7');
    httpMock.verify();
  });

  it('hides the header entirely for a session with no teaching portfolio (0 courses)', () => {
    const { fixture, element, httpMock } = setupAuthed();
    flushList(httpMock);
    httpMock.expectOne((r) => r.url === PORTFOLIO_URL).flush({ items: [], total: 0 });
    fixture.detectChanges();

    // No portfolio → no header; the universal finder is the whole page.
    expect(element.querySelector('[data-testid="offerings-portfolio"]')).toBeNull();
    expect(element.querySelector('[data-testid="cv-table"]')).toBeTruthy();
    httpMock.verify();
  });

  it('shows a portfolio skeleton while the instructor-courses read is in flight', () => {
    const { fixture, element, httpMock } = setupAuthed();
    flushList(httpMock);
    // Do NOT flush the portfolio GET yet; the header is loading.
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="portfolio-loading"]')).toBeTruthy();
    // Now resolve it so httpMock.verify() is clean.
    httpMock.expectOne((r) => r.url === PORTFOLIO_URL).flush({ items: [], total: 0 });
    httpMock.verify();
  });

  it('has no critical/serious axe violations with the portfolio header shown', async () => {
    const { fixture, element, httpMock } = setupAuthed();
    flushList(httpMock);
    httpMock.expectOne((r) => r.url === PORTFOLIO_URL).flush({
      items: [{ id: 'c1', title: 'X', enrolled_count: 5 }],
      total: 250,
    });
    fixture.detectChanges();

    const axe = (await import('axe-core')).default;
    const results = await axe.run(element);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    httpMock.verify();
  });
});
