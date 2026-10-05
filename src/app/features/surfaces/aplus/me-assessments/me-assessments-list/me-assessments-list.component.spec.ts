import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { formatDate } from '@angular/common';
import { WritableSignal, computed, signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';

import { MeAssessmentsListComponent } from './me-assessments-list.component';
import { MeAssessmentsService } from '../me-assessments.service';
import type {
  LearnerAssessmentSummary,
  MeAssessmentsListState,
} from '../me-assessments.model';

/**
 * MeAssessmentsListComponent spec — Phase X.3.1.
 */

const ASSESSMENT_ID = '01985e7f-1234-7abc-8def-000000000a01';

function buildSummary(
  overrides: Partial<LearnerAssessmentSummary> = {},
): LearnerAssessmentSummary {
  return {
    assessment_id: ASSESSMENT_ID,
    title: 'Agile Estimation — Cohort May 2026',
    state: 'OPEN',
    scheduled_open_at: '2026-05-20T09:00:00Z',
    scheduled_close_at: '2026-05-20T11:00:00Z',
    max_attempts: 1,
    learner_attempt_count: 0,
    learner_remaining_attempts: 1,
    question_count: 5,
    total_points: 50,
    ...overrides,
  };
}

class StubMeAssessmentsService {
  readonly _listState: WritableSignal<MeAssessmentsListState> =
    signal<MeAssessmentsListState>({ status: 'loading' });
  readonly listState = this._listState.asReadonly();
  readonly items = computed<readonly LearnerAssessmentSummary[]>(() => {
    const s = this._listState();
    return s.status === 'success' ? s.items : [];
  });
  listCalls = 0;
  lastListOpts: { pageSize?: number; pageToken?: string; append?: boolean } | undefined;
  listAssessments(opts?: { pageSize?: number; pageToken?: string; append?: boolean }): void {
    this.listCalls++;
    this.lastListOpts = opts;
  }
}

function setup(): {
  fixture: ComponentFixture<MeAssessmentsListComponent>;
  component: MeAssessmentsListComponent;
  element: HTMLElement;
  service: StubMeAssessmentsService;
  router: Router;
} {
  const service = new StubMeAssessmentsService();
  TestBed.configureTestingModule({
    imports: [MeAssessmentsListComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: MeAssessmentsService, useValue: service },
    ],
  });
  const fixture = TestBed.createComponent(MeAssessmentsListComponent);
  fixture.detectChanges();
  const router = TestBed.inject(Router);
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    service,
    router,
  };
}

describe('MeAssessmentsListComponent (Phase X.3.1)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('init / load wiring', () => {
    it('creates', () => {
      const { component } = setup();
      expect(component).toBeTruthy();
    });

    it('fires service.listAssessments() on init', () => {
      const { service } = setup();
      expect(service.listCalls).toBe(1);
    });

    it('renders surface-aplus class on root', () => {
      const { element } = setup();
      const root = element.querySelector(
        '[data-testid="me-assessments-list"]',
      ) as HTMLElement;
      expect(root.classList.contains('surface-aplus')).toBe(true);
    });
  });

  describe('loading branch (skeleton)', () => {
    it('renders skeleton while loading', () => {
      const { element } = setup();
      const skel = element.querySelector(
        '[data-testid="me-assessments-list-loading"]',
      );
      expect(skel).toBeTruthy();
      expect(skel?.getAttribute('aria-busy')).toBe('true');
    });

    it('does NOT render the cards-grid or empty-state while loading', () => {
      const { element } = setup();
      expect(
        element.querySelector('[data-testid="me-assessments-list-grid"]'),
      ).toBeNull();
      expect(
        element.querySelector('[data-testid="me-assessments-list-empty"]'),
      ).toBeNull();
    });
  });

  describe('success branch — cards', () => {
    it('renders one card per assessment', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [
          buildSummary({ assessment_id: 'a1', title: 'First' }),
          buildSummary({ assessment_id: 'a2', title: 'Second' }),
        ],
      });
      fixture.detectChanges();
      const cards = element.querySelectorAll(
        'li[data-testid^="me-assessments-card-"]',
      );
      expect(cards.length).toBe(2);
    });

    it('renders title on each card', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [
          buildSummary({ assessment_id: 'a1', title: 'Real Title — Cohort' }),
        ],
      });
      fixture.detectChanges();
      const title = element.querySelector(
        '[data-testid="me-assessments-card-a1"] [data-testid="me-assessments-card-title"]',
      );
      expect(title?.textContent).toContain('Real Title — Cohort');
    });

    it('distinguishes AVAILABLE state', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [
          buildSummary({
            assessment_id: 'a1',
            state: 'OPEN',
            learner_remaining_attempts: 1,
          }),
        ],
      });
      fixture.detectChanges();
      const status = element.querySelector(
        '[data-testid="me-assessments-card-a1"] [data-testid="me-assessments-card-status"]',
      );
      expect(status?.getAttribute('data-attempt-status')).toBe('AVAILABLE');
    });

    it('distinguishes IN_PROGRESS state', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [
          buildSummary({
            assessment_id: 'a1',
            state: 'OPEN',
            learner_latest_submission_state: 'IN_PROGRESS',
          }),
        ],
      });
      fixture.detectChanges();
      const status = element.querySelector(
        '[data-testid="me-assessments-card-a1"] [data-testid="me-assessments-card-status"]',
      );
      expect(status?.getAttribute('data-attempt-status')).toBe('IN_PROGRESS');
    });

    it('distinguishes SUBMITTED state', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [
          buildSummary({
            assessment_id: 'a1',
            state: 'GRADING',
            learner_latest_submission_state: 'SUBMITTED',
          }),
        ],
      });
      fixture.detectChanges();
      const status = element.querySelector(
        '[data-testid="me-assessments-card-a1"] [data-testid="me-assessments-card-status"]',
      );
      expect(status?.getAttribute('data-attempt-status')).toBe('SUBMITTED');
    });

    it('distinguishes RELEASED state', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [
          buildSummary({
            assessment_id: 'a1',
            state: 'RELEASED',
            learner_latest_submission_state: 'RELEASED',
          }),
        ],
      });
      fixture.detectChanges();
      const status = element.querySelector(
        '[data-testid="me-assessments-card-a1"] [data-testid="me-assessments-card-status"]',
      );
      expect(status?.getAttribute('data-attempt-status')).toBe('RELEASED');
    });

    it('distinguishes SCHEDULED state', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [buildSummary({ assessment_id: 'a1', state: 'SCHEDULED' })],
      });
      fixture.detectChanges();
      const status = element.querySelector(
        '[data-testid="me-assessments-card-a1"] [data-testid="me-assessments-card-status"]',
      );
      expect(status?.getAttribute('data-attempt-status')).toBe('SCHEDULED');
    });

    it('humanises the assessment window (no raw ISO timestamps)', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [
          buildSummary({
            assessment_id: 'a1',
            scheduled_open_at: '2026-05-20T09:00:00Z',
            scheduled_close_at: '2026-05-20T11:00:00Z',
          }),
        ],
      });
      fixture.detectChanges();
      const win = element.querySelector(
        '[data-testid="me-assessments-card-a1"] [data-testid="me-assessments-card-window"]',
      );
      expect(win).toBeTruthy();
      expect(win?.textContent).toContain(
        formatDate('2026-05-20T09:00:00Z', 'medium', 'en-US'),
      );
      expect(win?.textContent).not.toContain('2026-05-20T09:00:00Z');
    });
  });

  describe('empty branch', () => {
    it('renders empty-state when items[] is empty', () => {
      const { service, fixture, element } = setup();
      service._listState.set({ status: 'success', items: [] });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="me-assessments-list-empty"]'),
      ).toBeTruthy();
    });

    it('does NOT render the cards-grid when empty', () => {
      const { service, fixture, element } = setup();
      service._listState.set({ status: 'success', items: [] });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="me-assessments-list-grid"]'),
      ).toBeNull();
    });
  });

  describe('error branch (fail loud)', () => {
    it('renders role=alert error banner with the translated key', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'error',
        error: 'aplus.me_assessments.list.error_upstream',
      });
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="me-assessments-list-error"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('retry CTA re-fires service.listAssessments()', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'error',
        error: 'aplus.me_assessments.list.error_generic',
      });
      fixture.detectChanges();
      const before = service.listCalls;
      (
        element.querySelector(
          '[data-testid="me-assessments-list-retry"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.listCalls).toBe(before + 1);
    });
  });

  describe('navigation', () => {
    it('card open link points at /a/me/assessments/:assessmentId', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [buildSummary({ assessment_id: 'a-routing' })],
      });
      fixture.detectChanges();
      const link = element.querySelector(
        '[data-testid="me-assessments-card-a-routing"] [data-testid="me-assessments-card-open"]',
      ) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/a/me/assessments/a-routing');
    });
  });

  describe('a11y', () => {
    it('uses a single h1 for the list heading', () => {
      const { element } = setup();
      expect(element.querySelectorAll('h1').length).toBe(1);
    });
  });

  // ── CR2-C2 pagination controls ───────────────────────────────────────

  describe('pagination controls', () => {
    it('renders page-size <select> in the success branch', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [buildSummary()],
        nextPageToken: null,
      });
      fixture.detectChanges();
      const sel = element.querySelector('[data-testid="me-assessments-page-size"]');
      expect(sel).toBeTruthy();
      expect(sel?.tagName).toBe('SELECT');
    });

    it('does NOT render load-more button when hasMore is false (nextPageToken null)', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [buildSummary()],
        nextPageToken: null,
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="me-assessments-load-more"]')).toBeNull();
    });

    it('renders load-more button when nextPageToken is present', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [buildSummary()],
        nextPageToken: 'tok-page-2',
      });
      fixture.detectChanges();
      const btn = element.querySelector('[data-testid="me-assessments-load-more"]');
      expect(btn).toBeTruthy();
      expect(btn?.tagName).toBe('BUTTON');
    });

    it('loadMore() calls listAssessments with append:true and the stored token', () => {
      const { service, fixture, component } = setup();
      service._listState.set({
        status: 'success',
        items: [buildSummary()],
        nextPageToken: 'tok-page-2',
      });
      fixture.detectChanges();
      const before = service.listCalls;
      component.loadMore();
      expect(service.listCalls).toBe(before + 1);
      expect(service.lastListOpts?.append).toBe(true);
      expect(service.lastListOpts?.pageToken).toBe('tok-page-2');
    });

    it('loadMore() does nothing when there is no next token', () => {
      const { service, fixture, component } = setup();
      service._listState.set({
        status: 'success',
        items: [buildSummary()],
        nextPageToken: null,
      });
      fixture.detectChanges();
      const before = service.listCalls;
      component.loadMore();
      expect(service.listCalls).toBe(before);
    });

    it('onPageSizeChange() calls listAssessments with the new size (no append)', () => {
      const { service, fixture, component } = setup();
      service._listState.set({
        status: 'success',
        items: [buildSummary()],
        nextPageToken: null,
      });
      fixture.detectChanges();
      const before = service.listCalls;
      component.onPageSizeChange(50);
      expect(service.listCalls).toBe(before + 1);
      expect(service.lastListOpts?.append).toBeFalsy();
      expect(service.lastListOpts?.pageSize).toBe(50);
    });
  });

  // ── Row redesign: search + latest-first sort ─────────────────────────

  describe('search + sort', () => {
    it('renders the search box in the success branch', () => {
      const { service, fixture, element } = setup();
      service._listState.set({ status: 'success', items: [buildSummary()] });
      fixture.detectChanges();
      const search = element.querySelector('[data-testid="me-assessments-search"]');
      expect(search).toBeTruthy();
      expect(search?.tagName).toBe('INPUT');
    });

    it('orders rows newest-first by assessment_id (UUIDv7 desc)', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        items: [
          buildSummary({ assessment_id: 'a1', title: 'Oldest' }),
          buildSummary({ assessment_id: 'a3', title: 'Newest' }),
          buildSummary({ assessment_id: 'a2', title: 'Middle' }),
        ],
      });
      fixture.detectChanges();
      const rows = element.querySelectorAll('li[data-testid^="me-assessments-card-"]');
      expect(rows.length).toBe(3);
      expect(rows[0].getAttribute('data-testid')).toBe('me-assessments-card-a3');
      expect(rows[2].getAttribute('data-testid')).toBe('me-assessments-card-a1');
    });

    it('filters rows by title (case-insensitive)', () => {
      const { service, fixture, element, component } = setup();
      service._listState.set({
        status: 'success',
        items: [
          buildSummary({ assessment_id: 'a1', title: 'Algebra Basics' }),
          buildSummary({ assessment_id: 'a2', title: 'Biology Cells' }),
        ],
      });
      fixture.detectChanges();
      component.onSearchInput('alg');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="me-assessments-card-a1"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="me-assessments-card-a2"]'),
      ).toBeNull();
    });

    it('shows the no-match state when the search filters everything out', () => {
      const { service, fixture, element, component } = setup();
      service._listState.set({
        status: 'success',
        items: [buildSummary({ assessment_id: 'a1', title: 'Algebra' })],
      });
      fixture.detectChanges();
      component.onSearchInput('zzzzz-no-match');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="me-assessments-list-no-match"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="me-assessments-list-grid"]'),
      ).toBeNull();
    });
  });
});
