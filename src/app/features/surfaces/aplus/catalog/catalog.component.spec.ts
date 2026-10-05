import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, Signal, WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { Location } from '@angular/common';

import { CatalogComponent } from './catalog.component';
import { CatalogService } from './catalog.service';
import { TranslateService } from '../../../../core/services/translate.service';
import { formatPriceSgd, type CatalogState } from './catalog.model';
import { buildCatalogCourse } from '../../../../testing/builders/buildCatalogCourse';

/**
 * A+ Course Catalog component spec — Phyllis demo Step 5.
 *
 * Wired LIVE 2026-05-14: `CatalogService` is mocked with a writable-signal
 * `state` stub so the fail-loud loading / error / success branches can be
 * exercised deterministically without touching HTTP. Per chora-web
 * CLAUDE.md §6 — test data via the `buildCatalogCourse` builder, never
 * inline object literals.
 */

class MockCatalogService {
  readonly _state: WritableSignal<CatalogState> = signal<CatalogState>({
    status: 'loading',
  });
  readonly state = this._state.asReadonly();
  readonly courses = signal<readonly ReturnType<typeof buildCatalogCourse>[]>([]).asReadonly();
  readonly _hasNextPage: WritableSignal<boolean> = signal<boolean>(false);
  readonly hasNextPage: Signal<boolean> = this._hasNextPage.asReadonly();
  readonly _endCursor: WritableSignal<string | null> = signal<string | null>(null);
  readonly endCursor: Signal<string | null> = this._endCursor.asReadonly();
  loadCount = 0;
  lastLoadOpts: { q?: string; first?: number; after?: string; append?: boolean } | undefined;

  // Re-derive `courses` from `_state` on each set so the component's
  // `catalogService.courses` selector mirrors the live service contract.
  setState(s: CatalogState): void {
    this._state.set(s);
  }

  load(opts?: { q?: string; first?: number; after?: string; append?: boolean }): void {
    this.loadCount += 1;
    this.lastLoadOpts = opts;
  }
}

/**
 * The real service exposes `courses` as a computed off `state`. The mock
 * mirrors that by overriding `courses` getter semantics via a small shim:
 * we replace the readonly signal with a computed-like function bound to
 * `_state`.
 */
function makeMock(): MockCatalogService {
  const mock = new MockCatalogService();
  Object.defineProperty(mock, 'courses', {
    value: () => {
      const s = mock._state();
      return s.status === 'success' ? s.courses : [];
    },
  });
  return mock;
}

function setup(): {
  fixture: ComponentFixture<CatalogComponent>;
  mock: MockCatalogService;
} {
  const mock = makeMock();
  TestBed.configureTestingModule({
    imports: [CatalogComponent],
    providers: [
      provideRouter([{ path: 'a/courses/:id', children: [] }]),
      TranslateService,
      { provide: CatalogService, useValue: mock },
    ],
  });
  const fixture = TestBed.createComponent(CatalogComponent);
  fixture.detectChanges();
  return { fixture, mock };
}

describe('CatalogComponent (Phyllis Step 5 — real BFF wiring)', () => {
  let fixture: ComponentFixture<CatalogComponent>;
  let element: HTMLElement;
  let mock: MockCatalogService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const result = setup();
    fixture = result.fixture;
    mock = result.mock;
    element = fixture.nativeElement as HTMLElement;
  });

  describe('surface shell + load on construct', () => {
    it('renders with the surface-aplus accent class', () => {
      const root = element.querySelector('[data-testid="aplus-catalog"]');
      expect(root?.className).toContain('surface-aplus');
    });

    it('calls CatalogService.load() exactly once on construction', () => {
      expect(mock.loadCount).toBe(1);
    });

    it('renders the catalog heading', () => {
      const heading = element.querySelector('#aplus-catalog-heading');
      expect(heading).not.toBeNull();
      expect(heading?.textContent?.trim()).toBeTruthy();
    });
  });

  describe('loading state', () => {
    it('renders the loading panel while the service is loading', () => {
      const loading = element.querySelector('[data-testid="aplus-catalog-loading"]');
      expect(loading).not.toBeNull();
      expect(loading?.getAttribute('aria-busy')).toBe('true');
      expect(loading?.getAttribute('role')).toBe('status');
    });
  });

  describe('error state (fail-loud)', () => {
    beforeEach(() => {
      mock.setState({ status: 'error', error: 'aplus.catalog.error_upstream' });
      fixture.detectChanges();
    });

    it('renders the fail-loud error banner with role=alert', () => {
      const err = element.querySelector('[data-testid="aplus-catalog-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
    });

    it('renders a retry button that re-calls load()', () => {
      const retry = element.querySelector(
        '[data-testid="aplus-catalog-retry"]',
      ) as HTMLButtonElement;
      expect(retry).not.toBeNull();
      retry.click();
      expect(mock.loadCount).toBe(2);
    });
  });

  describe('success state — grid rendering', () => {
    beforeEach(() => {
      mock.setState({
        status: 'success',
        courses: [
          buildCatalogCourse({
            id: 'course-csm-001',
            title: 'Certified ScrumMaster (CSM) Prep',
          }),
          buildCatalogCourse({
            id: 'course-cspo-002',
            title: 'Certified Scrum Product Owner',
            is_free: false,
            price_sgd_cents: 58000,
            sf_eligible: true,
          }),
        ],
      });
      fixture.detectChanges();
    });

    it('renders one course card per course', () => {
      const cards = element.querySelectorAll('[data-testid^="course-card-"]');
      expect(cards.length).toBe(2);
    });

    it('renders the results grid as a semantic <ul role=list>', () => {
      const grid = element.querySelector('[data-testid="aplus-catalog-grid"]');
      expect(grid?.tagName).toBe('UL');
      expect(grid?.getAttribute('role')).toBe('list');
    });

    it('summary reports the filtered/total counts', () => {
      const summary = element.querySelector('[data-testid="aplus-catalog-result-summary"]');
      expect(summary?.textContent?.replace(/\s+/g, ' ')).toMatch(/2.*2/);
    });

    it('renders the CTA as a routerLink to /a/courses/{id}', () => {
      const cta = element.querySelector(
        '[data-testid="course-cta-course-csm-001"]',
      ) as HTMLAnchorElement;
      expect(cta).not.toBeNull();
      expect(cta.tagName).toBe('A');
      const loc = TestBed.inject(Location);
      expect(loc.normalize(cta.getAttribute('href') ?? '')).toBe('/a/courses/course-csm-001');
      expect(cta.getAttribute('aria-label')).toContain('Certified ScrumMaster (CSM) Prep');
    });

    it('renders the free badge for a free course', () => {
      const badge = element.querySelector('[data-testid="course-free-course-csm-001"]');
      expect(badge).not.toBeNull();
    });

    it('renders the SkillsFuture badge only for sf_eligible courses', () => {
      expect(element.querySelector('[data-testid="course-sf-course-csm-001"]')).toBeNull();
      expect(element.querySelector('[data-testid="course-sf-course-cspo-002"]')).not.toBeNull();
    });

    it('renders the price label for a paid course', () => {
      const price = element.querySelector('[data-testid="course-price-course-cspo-002"]');
      expect(price?.textContent?.trim()).toBe('SGD 580');
    });
  });

  describe('honest empty-field rendering', () => {
    it('does NOT render a faked instructor when instructor_name is ""', () => {
      mock.setState({
        status: 'success',
        courses: [buildCatalogCourse({ id: 'course-x', instructor_name: '' })],
      });
      fixture.detectChanges();
      const inst = element.querySelector('[data-testid="course-instructor-course-x"]');
      expect(inst).toBeNull();
    });

    it('renders the instructor only when BE actually provides a name', () => {
      mock.setState({
        status: 'success',
        courses: [
          buildCatalogCourse({
            id: 'course-y',
            instructor_name: 'Dr Tan',
          }),
        ],
      });
      fixture.detectChanges();
      const inst = element.querySelector('[data-testid="course-instructor-course-y"]');
      expect(inst?.textContent?.trim()).toBe('Dr Tan');
    });

    it('hides the modules row when syllabus_outline_count is 0', () => {
      mock.setState({
        status: 'success',
        courses: [buildCatalogCourse({ id: 'course-z', syllabus_outline_count: 0 })],
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="course-modules-course-z"]')).toBeNull();
    });

    it('renders the modules row when syllabus_outline_count > 0', () => {
      mock.setState({
        status: 'success',
        courses: [buildCatalogCourse({ id: 'course-z', syllabus_outline_count: 5 })],
      });
      fixture.detectChanges();
      const modules = element.querySelector('[data-testid="course-modules-course-z"]');
      expect(modules?.textContent).toContain('5');
    });

    it('renders tag chips only when tags are present', () => {
      mock.setState({
        status: 'success',
        courses: [
          buildCatalogCourse({ id: 'course-no-tags', tags: [] }),
          buildCatalogCourse({
            id: 'course-with-tags',
            tags: ['agile', 'scrum'],
          }),
        ],
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="course-tags-course-no-tags"]')).toBeNull();
      const tags = element.querySelector('[data-testid="course-tags-course-with-tags"]');
      expect(tags?.textContent).toContain('agile');
      expect(tags?.textContent).toContain('scrum');
    });
  });

  describe('filters', () => {
    beforeEach(() => {
      mock.setState({
        status: 'success',
        courses: [
          buildCatalogCourse({
            id: 'c-free-sf',
            title: 'Scrum Foundations',
            is_free: true,
            sf_eligible: true,
          }),
          buildCatalogCourse({
            id: 'c-paid',
            title: 'Advanced Kanban',
            is_free: false,
            price_sgd_cents: 30000,
            sf_eligible: false,
          }),
          buildCatalogCourse({
            id: 'c-free-nosf',
            title: 'Lean Basics',
            is_free: true,
            sf_eligible: false,
          }),
        ],
      });
      fixture.detectChanges();
    });

    it('search filters by title (case-insensitive)', () => {
      fixture.componentInstance.searchQuery.set('kanban');
      fixture.detectChanges();
      const cards = element.querySelectorAll('[data-testid^="course-card-"]');
      expect(cards.length).toBe(1);
      expect(cards[0].getAttribute('data-testid')).toBe('course-card-c-paid');
    });

    it('"Free only" toggle filters to is_free courses', () => {
      fixture.componentInstance.freeOnly.set(true);
      fixture.detectChanges();
      const cards = element.querySelectorAll('[data-testid^="course-card-"]');
      expect(cards.length).toBe(2);
      const ids = Array.from(cards).map((c) => c.getAttribute('data-testid'));
      expect(ids).toContain('course-card-c-free-sf');
      expect(ids).toContain('course-card-c-free-nosf');
    });

    it('"SkillsFuture eligible" toggle filters to sf_eligible courses', () => {
      fixture.componentInstance.sfEligibleOnly.set(true);
      fixture.detectChanges();
      const cards = element.querySelectorAll('[data-testid^="course-card-"]');
      expect(cards.length).toBe(1);
      expect(cards[0].getAttribute('data-testid')).toBe('course-card-c-free-sf');
    });

    it('clearFilters() resets search + both toggles', () => {
      const comp = fixture.componentInstance;
      comp.searchQuery.set('lean');
      comp.freeOnly.set(true);
      comp.sfEligibleOnly.set(true);
      fixture.detectChanges();

      comp.clearFilters();
      fixture.detectChanges();
      expect(comp.searchQuery()).toBe('');
      expect(comp.freeOnly()).toBe(false);
      expect(comp.sfEligibleOnly()).toBe(false);
      expect(element.querySelectorAll('[data-testid^="course-card-"]').length).toBe(3);
    });

    it('renders the empty-state when no course matches', () => {
      fixture.componentInstance.searchQuery.set('zzz-no-match');
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="aplus-catalog-empty"]')).not.toBeNull();
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

  // ── CR2-C2 pagination controls ───────────────────────────────────────

  describe('pagination controls', () => {
    beforeEach(() => {
      mock.setState({
        status: 'success',
        courses: [buildCatalogCourse({ id: 'c1' }), buildCatalogCourse({ id: 'c2' })],
      });
      fixture.detectChanges();
    });

    it('renders page-size <select> in the success branch', () => {
      const sel = element.querySelector('[data-testid="aplus-catalog-page-size"]');
      expect(sel).not.toBeNull();
      expect(sel?.tagName).toBe('SELECT');
    });

    it('does NOT render load-more button when hasNextPage is false', () => {
      mock._hasNextPage.set(false);
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="aplus-catalog-load-more"]')).toBeNull();
    });

    it('renders load-more button when hasNextPage is true', () => {
      mock._hasNextPage.set(true);
      mock._endCursor.set('cur-abc');
      fixture.detectChanges();
      const btn = element.querySelector('[data-testid="aplus-catalog-load-more"]');
      expect(btn).not.toBeNull();
      expect(btn?.tagName).toBe('BUTTON');
    });

    it('loadMore() calls load() with append:true and after=endCursor', () => {
      mock._hasNextPage.set(true);
      mock._endCursor.set('cur-xyz');
      fixture.detectChanges();
      const before = mock.loadCount;
      fixture.componentInstance.loadMore();
      expect(mock.loadCount).toBe(before + 1);
      expect(mock.lastLoadOpts?.append).toBe(true);
      expect(mock.lastLoadOpts?.after).toBe('cur-xyz');
    });

    it('loadMore() does nothing when endCursor is null', () => {
      mock._hasNextPage.set(true);
      mock._endCursor.set(null);
      fixture.detectChanges();
      const before = mock.loadCount;
      fixture.componentInstance.loadMore();
      expect(mock.loadCount).toBe(before);
    });

    it('onPageSizeChange() resets and reloads (no append)', () => {
      const before = mock.loadCount;
      fixture.componentInstance.onPageSizeChange(10);
      expect(mock.loadCount).toBe(before + 1);
      expect(mock.lastLoadOpts?.append).toBeFalsy();
      expect(mock.lastLoadOpts?.first).toBe(10);
    });
  });

  describe('server-side search', () => {
    it('onSearchSubmit() calls load() with q=searchQuery value', () => {
      mock.setState({ status: 'success', courses: [] });
      fixture.detectChanges();
      fixture.componentInstance.searchQuery.set('agile');
      const before = mock.loadCount;
      fixture.componentInstance.onSearchSubmit();
      expect(mock.loadCount).toBe(before + 1);
      expect(mock.lastLoadOpts?.q).toBe('agile');
    });

    it('onSearchSubmit() passes undefined q when searchQuery is empty', () => {
      mock.setState({ status: 'success', courses: [] });
      fixture.detectChanges();
      fixture.componentInstance.searchQuery.set('');
      fixture.componentInstance.onSearchSubmit();
      expect(mock.lastLoadOpts?.q).toBeUndefined();
    });
  });

  describe('a11y (axe-core)', () => {
    it('has zero critical/serious WCAG violations on the success grid', async () => {
      mock.setState({
        status: 'success',
        courses: [
          buildCatalogCourse({
            id: 'course-axe',
            title: 'Accessible Course',
            instructor_name: 'Dr Tan',
            tags: ['agile'],
            syllabus_outline_count: 3,
          }),
        ],
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
