import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach } from 'vitest';

import { AssessmentListComponent } from './assessment-list.component';
import { AssessmentMonitorService } from '../assessment-monitor.service';
import type {
  Assessment,
  AssessmentListLoadState,
} from '../assessment-monitor.model';

/**
 * AssessmentListComponent spec — `/r/assessments` instructor surface.
 *
 * Cohort: list page renders the caller's authored assessments grouped by
 * state-filter chips. Cards expose title + state + cohort size + submission
 * count + dates; card click routes to /r/assessments/:id/monitor.
 *
 * The spec uses a stub service exposing the discriminated AsyncState so
 * branch coverage (loading / success / empty / error) is deterministic.
 */

const ASSESSMENT_ID_A = '019e2b24-759f-76b8-bad8-0000000000a1';
const ASSESSMENT_ID_B = '019e2b24-759f-76b8-bad8-0000000000b2';
const ASSESSMENT_ID_C = '019e2b24-759f-76b8-bad8-0000000000c3';
const ASSESSMENT_ID_R = '019e2b24-759f-76b8-bad8-0000000000d4';

function buildAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    assessment_id: ASSESSMENT_ID_A,
    tenant_id: '11111111-1111-7111-8111-111111111111',
    instructor_gcid: '00000000-0000-7000-8000-000000001999',
    test_set_id: '01985e7f-1234-7abc-8def-000000000a01',
    test_set_revision_snapshot: 1,
    class_id: null,
    invited_gcids: ['00000000-0000-7000-8000-000000002001'],
    title: 'Agile Estimation — Cohort May 2026',
    learner_facing_name: null,
    state: 'DRAFT',
    scheduled_open_at: '2026-05-20T09:00:00Z',
    scheduled_close_at: '2026-05-20T11:00:00Z',
    max_attempts: 1,
    shuffle_questions: true,
    shuffle_mcq_options: true,
    total_points: 100,
    question_count: 10,
    grading_config_snapshot: {
      mcq_dispatch: 'DETERMINISTIC',
      passing_threshold_percent: 70,
      per_question_feedback_enabled: false,
      auto_release: false,
    },
    deleted_at: null,
    created_at: '2026-05-15T10:00:00Z',
    updated_at: '2026-05-15T10:00:00Z',
    published_at: null,
    closed_at: null,
    released_at: null,
    archived_at: null,
    ...overrides,
  };
}

class StubAssessmentMonitorService {
  readonly _listState: WritableSignal<AssessmentListLoadState> =
    signal<AssessmentListLoadState>({ status: 'loading' });
  readonly listState = this._listState.asReadonly();
  readonly assessments = computed<readonly Assessment[]>(() => {
    const s = this._listState();
    return s.status === 'success' ? s.assessments : [];
  });

  // Unused state signals — surface signature required for monitor page.
  // The list page never reads them.
  readonly assessmentState = signal({ status: 'loading' as const }).asReadonly();
  readonly monitorState = signal({ status: 'loading' as const }).asReadonly();
  readonly submissionsState = signal({
    status: 'loading' as const,
  }).asReadonly();
  readonly publishState = signal({ status: 'idle' as const }).asReadonly();
  readonly forceCloseState = signal({ status: 'idle' as const }).asReadonly();
  readonly releaseState = signal({ status: 'idle' as const }).asReadonly();
  readonly archiveState = signal({ status: 'idle' as const }).asReadonly();
  readonly assessment = signal<Assessment | null>(null);
  readonly monitor = signal(null).asReadonly();
  readonly submissions = signal<readonly unknown[]>([]).asReadonly();

  loadListCalls = 0;
  loadList(): void {
    this.loadListCalls++;
  }
  loadAssessment(): void { /* stub */ }
  loadMonitor(): void { /* stub */ }
  loadSubmissions(): void { /* stub */ }
  publish(): void { /* stub */ }
  forceClose(): void { /* stub */ }
  releaseResults(): void { /* stub */ }
  archive(): void { /* stub */ }
}

function setup(): {
  fixture: ComponentFixture<AssessmentListComponent>;
  element: HTMLElement;
  service: StubAssessmentMonitorService;
} {
  const service = new StubAssessmentMonitorService();
  TestBed.configureTestingModule({
    imports: [AssessmentListComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: AssessmentMonitorService, useValue: service },
    ],
  });
  const fixture = TestBed.createComponent(AssessmentListComponent);
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    service,
  };
}

describe('AssessmentListComponent (R+ /r/assessments)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('init wiring', () => {
    it('creates', () => {
      const { fixture } = setup();
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('calls service.loadList() on init', () => {
      const { service } = setup();
      expect(service.loadListCalls).toBe(1);
    });

    it('has data-testid="rplus-assessment-list" + surface-rplus root', () => {
      const { element } = setup();
      const root = element.querySelector(
        '[data-testid="rplus-assessment-list"]',
      ) as HTMLElement;
      expect(root).toBeTruthy();
      expect(root.classList.contains('surface-rplus')).toBe(true);
    });

    it('renders the "+ New assessment" CTA in the header pointing at /r/assessments/new', () => {
      const { element } = setup();
      const cta = element.querySelector(
        '[data-testid="assessment-list-new-cta"]',
      ) as HTMLAnchorElement;
      expect(cta).toBeTruthy();
      expect(cta.getAttribute('href')).toBe('/r/assessments/new');
    });
  });

  describe('loading branch', () => {
    it('renders the loading skeleton while listState is loading', () => {
      const { element } = setup();
      const panel = element.querySelector(
        '[data-testid="assessment-list-loading"]',
      );
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute('aria-busy')).toBe('true');
    });

    it('does NOT render the card grid while loading', () => {
      const { element } = setup();
      expect(
        element.querySelector('[data-testid="assessment-list-grid"]'),
      ).toBeNull();
    });
  });

  describe('error branch (fail loud)', () => {
    it('renders a role=alert error banner with the translated key', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'error',
        error: 'rplus.assessment_list.error_upstream',
      });
      fixture.detectChanges();
      const banner = element.querySelector(
        '[data-testid="assessment-list-error"]',
      );
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('retry CTA re-fires service.loadList()', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'error',
        error: 'rplus.assessment_list.error_generic',
      });
      fixture.detectChanges();
      const before = service.loadListCalls;
      (
        element.querySelector(
          '[data-testid="assessment-list-retry"]',
        ) as HTMLButtonElement
      ).click();
      expect(service.loadListCalls).toBe(before + 1);
    });
  });

  describe('empty branch', () => {
    it('renders an empty-state when success with zero assessments', () => {
      const { service, fixture, element } = setup();
      service._listState.set({ status: 'success', assessments: [] });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="assessment-list-empty"]'),
      ).toBeTruthy();
      expect(
        element.querySelector('[data-testid="assessment-list-grid"]'),
      ).toBeNull();
    });
  });

  describe('success branch — card grid', () => {
    function loadFour(service: StubAssessmentMonitorService): void {
      service._listState.set({
        status: 'success',
        assessments: [
          buildAssessment({ assessment_id: ASSESSMENT_ID_A, state: 'DRAFT' }),
          buildAssessment({ assessment_id: ASSESSMENT_ID_B, state: 'OPEN' }),
          buildAssessment({ assessment_id: ASSESSMENT_ID_C, state: 'CLOSED' }),
          buildAssessment({
            assessment_id: ASSESSMENT_ID_R,
            state: 'RELEASED',
          }),
        ],
      });
    }

    it('renders one card per assessment in the grid', () => {
      const { service, fixture, element } = setup();
      loadFour(service);
      fixture.detectChanges();
      const cards = element.querySelectorAll(
        '[data-testid="assessment-list-card"]',
      );
      expect(cards.length).toBe(4);
    });

    it('renders title + state pill + dates on each card', () => {
      const { service, fixture, element } = setup();
      loadFour(service);
      fixture.detectChanges();
      const card = element.querySelector(
        '[data-testid="assessment-list-card"]',
      ) as HTMLElement;
      expect(
        card.querySelector('[data-testid="assessment-card-title"]')?.textContent,
      ).toContain('Agile Estimation');
      const pill = card.querySelector(
        '[data-testid="assessment-card-state"]',
      ) as HTMLElement;
      expect(pill).toBeTruthy();
      expect(pill.getAttribute('data-state')).toBe('DRAFT');
    });

    it('human-formats scheduled open/close dates instead of raw ISO (CHO-2342)', () => {
      const { service, fixture, element } = setup();
      loadFour(service);
      fixture.detectChanges();
      const card = element.querySelector(
        '[data-testid="assessment-list-card"]',
      ) as HTMLElement;
      const opens =
        card
          .querySelector('[data-testid="assessment-card-opens-at"]')
          ?.textContent?.trim() ?? '';
      const closes =
        card
          .querySelector('[data-testid="assessment-card-closes-at"]')
          ?.textContent?.trim() ?? '';
      // `date:'medium':'UTC'` on 2026-05-20T09:00:00Z → "May 20, 2026, 9:00:00 AM"
      expect(opens).toContain('May');
      expect(opens).toContain('2026');
      expect(closes).toContain('May');
      expect(closes).toContain('2026');
      // Raw ISO / microseconds must be gone.
      expect(opens).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(closes).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(opens).not.toContain('2026-05-20T09:00:00Z');
      expect(closes).not.toContain('2026-05-20T11:00:00Z');
    });

    it('clicking a card routes to /r/assessments/:id/monitor', () => {
      const { service, fixture, element } = setup();
      loadFour(service);
      fixture.detectChanges();
      const link = element.querySelector(
        '[data-testid="assessment-list-card"] a',
      ) as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.getAttribute('href')).toContain(
        `/r/assessments/${ASSESSMENT_ID_A}/monitor`,
      );
    });
  });

  describe('filter chips', () => {
    function loadMix(service: StubAssessmentMonitorService): void {
      service._listState.set({
        status: 'success',
        assessments: [
          buildAssessment({ assessment_id: ASSESSMENT_ID_A, state: 'DRAFT' }),
          buildAssessment({ assessment_id: ASSESSMENT_ID_B, state: 'OPEN' }),
          buildAssessment({ assessment_id: ASSESSMENT_ID_C, state: 'CLOSED' }),
          buildAssessment({
            assessment_id: ASSESSMENT_ID_R,
            state: 'RELEASED',
          }),
        ],
      });
    }

    it('renders 6 filter chips (ALL / DRAFT / OPEN / CLOSED / RELEASED / ARCHIVED)', () => {
      const { service, fixture, element } = setup();
      loadMix(service);
      fixture.detectChanges();
      const chips = element.querySelectorAll(
        '[data-testid="assessment-list-chip"]',
      );
      expect(chips.length).toBe(6);
    });

    it('defaults to ALL chip selected on init', () => {
      const { service, fixture, element } = setup();
      loadMix(service);
      fixture.detectChanges();
      const allChip = element.querySelector(
        '[data-testid="assessment-list-chip"][data-chip="ALL"]',
      ) as HTMLElement;
      expect(allChip.getAttribute('aria-pressed')).toBe('true');
    });

    it('selecting OPEN chip filters list to OPEN-state cards only', () => {
      const { service, fixture, element } = setup();
      loadMix(service);
      fixture.detectChanges();
      const openChip = element.querySelector(
        '[data-testid="assessment-list-chip"][data-chip="OPEN"]',
      ) as HTMLButtonElement;
      openChip.click();
      fixture.detectChanges();
      const cards = element.querySelectorAll(
        '[data-testid="assessment-list-card"]',
      );
      expect(cards.length).toBe(1);
      expect(
        (cards[0].querySelector(
          '[data-testid="assessment-card-state"]',
        ) as HTMLElement).getAttribute('data-state'),
      ).toBe('OPEN');
    });

    it('selecting CLOSED chip filters to CLOSED only', () => {
      const { service, fixture, element } = setup();
      loadMix(service);
      fixture.detectChanges();
      const closedChip = element.querySelector(
        '[data-testid="assessment-list-chip"][data-chip="CLOSED"]',
      ) as HTMLButtonElement;
      closedChip.click();
      fixture.detectChanges();
      const cards = element.querySelectorAll(
        '[data-testid="assessment-list-card"]',
      );
      expect(cards.length).toBe(1);
    });

    it('re-selecting ALL after a filter restores all 4 cards', () => {
      const { service, fixture, element } = setup();
      loadMix(service);
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="assessment-list-chip"][data-chip="DRAFT"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(
        element.querySelectorAll('[data-testid="assessment-list-card"]').length,
      ).toBe(1);
      (element.querySelector(
        '[data-testid="assessment-list-chip"][data-chip="ALL"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(
        element.querySelectorAll('[data-testid="assessment-list-card"]').length,
      ).toBe(4);
    });

    it('empty filter result renders the filter-empty placeholder', () => {
      const { service, fixture, element } = setup();
      loadMix(service);
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="assessment-list-chip"][data-chip="ARCHIVED"]',
      ) as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="assessment-list-filter-empty"]'),
      ).toBeTruthy();
    });
  });

  // ── a11y: the filter-chip ARIA contract ─────────────────────────────

  /**
   * Live-audit regression guard (2026-07-16). axe-core 4.11.0 run in a real
   * browser against the deployed bundle reported `aria-allowed-attr`
   * (impact CRITICAL, 6 nodes) on this chip row: each chip carried BOTH
   * `role="tab"` and `aria-pressed`. `aria-pressed` is only valid on
   * `role="button"`; on `role="tab"` the selected state is `aria-selected`.
   *
   * The chips are filters, not tabs: they re-filter the list in place, own
   * no tabpanel, and implement neither roving tabindex nor arrow-key
   * navigation. So the honest pattern is a toggle button (`aria-pressed`),
   * and `role="tab"` is what has to go.
   *
   * These are pure DOM/ARIA rules, so jsdom evaluates them exactly as the
   * browser did. Contrast is deliberately NOT asserted here: jsdom has no
   * layout or paint, so `color-contrast` cannot be computed in a unit test
   * (that is what `e2e/accessibility/rplus-a11y-cdp-guard.md` is for).
   *
   * NOTE: no try/catch around the assertion. A swallowed failure would make
   * this guard permanently green and therefore worthless.
   */
  describe('a11y: filter chip ARIA contract', () => {
    const ARIA_RULES = [
      'aria-allowed-attr',
      'aria-prohibited-attr',
      'aria-required-attr',
      'aria-required-children',
      'aria-required-parent',
      'aria-roles',
    ];

    it('reports zero ARIA-rule violations on the rendered chip row', async () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        assessments: [buildAssessment({ state: 'RELEASED' })],
      });
      fixture.detectChanges();

      const axe = (await import('axe-core')).default;
      const results = await axe.run(element, { runOnly: ARIA_RULES });

      expect(
        results.violations.map((v) => `${v.id} (${v.nodes.length} nodes)`),
      ).toEqual([]);
    });

    it('marks the chips as toggle buttons, never as tabs', () => {
      const { service, fixture, element } = setup();
      service._listState.set({ status: 'success', assessments: [buildAssessment()] });
      fixture.detectChanges();

      const chips = Array.from(
        element.querySelectorAll('[data-testid="assessment-list-chip"]'),
      );
      expect(chips.length).toBe(6);
      for (const chip of chips) {
        // A filter chip is a toggle button: no tab role, and no tab-only
        // state attribute leaking in.
        expect(chip.getAttribute('role')).toBeNull();
        expect(chip.hasAttribute('aria-selected')).toBe(false);
        // State must still be announced - dropping the attribute outright
        // would leave a screen-reader user unable to tell which filter is on.
        expect(chip.hasAttribute('aria-pressed')).toBe(true);
      }
    });

    it('groups the chips under a named group, not a tablist', () => {
      const { service, fixture, element } = setup();
      service._listState.set({ status: 'success', assessments: [buildAssessment()] });
      fixture.detectChanges();

      const group = element.querySelector('.assessment-list__chips');
      expect(group?.getAttribute('role')).toBe('group');
      expect(group?.getAttribute('aria-label')).toBeTruthy();
    });
  });

  // ── Row redesign: search + client-side pagination ───────────────────

  describe('search + pagination', () => {
    it('renders the search box in the success branch', () => {
      const { service, fixture, element } = setup();
      service._listState.set({ status: 'success', assessments: [buildAssessment()] });
      fixture.detectChanges();
      const search = element.querySelector('[data-testid="assessment-list-search"]');
      expect(search).toBeTruthy();
      expect(search?.tagName).toBe('INPUT');
    });

    it('text search filters rows by title (case-insensitive)', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        assessments: [
          buildAssessment({ assessment_id: ASSESSMENT_ID_A, title: 'Algebra Basics' }),
          buildAssessment({ assessment_id: ASSESSMENT_ID_B, title: 'Biology Cells' }),
        ],
      });
      fixture.detectChanges();
      fixture.componentInstance.onSearchInput('alg');
      fixture.detectChanges();
      const cards = element.querySelectorAll('[data-testid="assessment-list-card"]');
      expect(cards.length).toBe(1);
      expect(
        element.querySelector('[data-testid="assessment-card-title"]')?.textContent,
      ).toContain('Algebra');
    });

    it('search with no match shows the filter-empty placeholder', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'success',
        assessments: [buildAssessment({ title: 'Algebra' })],
      });
      fixture.detectChanges();
      fixture.componentInstance.onSearchInput('zzz-none');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="assessment-list-filter-empty"]'),
      ).toBeTruthy();
    });

    it('pages with Load more beyond 12 rows', () => {
      const { service, fixture, element } = setup();
      const many = Array.from({ length: 15 }, (_, i) =>
        buildAssessment({
          assessment_id: `01985e7f-1234-7abc-8def-0000000000${(i + 10).toString()}`,
          title: `Assessment ${i}`,
        }),
      );
      service._listState.set({ status: 'success', assessments: many });
      fixture.detectChanges();
      expect(
        element.querySelectorAll('[data-testid="assessment-list-card"]').length,
      ).toBe(12);
      const loadMore = element.querySelector(
        '[data-testid="assessment-list-load-more"]',
      ) as HTMLButtonElement;
      expect(loadMore).toBeTruthy();
      loadMore.click();
      fixture.detectChanges();
      expect(
        element.querySelectorAll('[data-testid="assessment-list-card"]').length,
      ).toBe(15);
      expect(
        element.querySelector('[data-testid="assessment-list-load-more"]'),
      ).toBeNull();
    });
  });
});
