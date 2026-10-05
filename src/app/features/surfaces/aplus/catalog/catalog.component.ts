/**
 * CatalogComponent — A+ public catalog (Phyllis demo Step 5).
 *
 * Wired LIVE 2026-05-14 to the real BFF endpoint via `CatalogService`
 * (`GET /api/catalog?public=true`). Renders ONLY the fields the BE
 * actually returns — no synthesized cover gradients / course codes /
 * enrolment-state badges / atom-or-duration meta. Fail-loud: a loading
 * panel, an error banner with a retry CTA, then the results grid.
 *
 * Phyllis demo Step 5 happy path:
 *   1. Phyllis (Learner) lands on `/a/catalog`
 *   2. The public catalog grid renders real published courses
 *   3. The title search + the "Free only" / "SkillsFuture eligible"
 *      toggles reduce the grid
 *   4. "View details" CTA on a card is the honest Step 5 → 6 handoff
 *      to `/a/courses/{id}` (course-detail wiring is a later task)
 *
 * Domain vocabulary anchors: `LearningAtom` (the unit a course's
 * syllabus is composed of), `TenantEntitlement` (cross-tenant public
 * visibility) — per `domain-vocabulary` skill.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { CatalogService } from './catalog.service';
import {
  CatalogCourse,
  CATALOG_DEFAULT_PAGE_SIZE,
  CATALOG_PAGE_SIZE_OPTIONS,
  formatPriceSgd,
  type CatalogPageSize,
} from './catalog.model';
import { CoursesSubNavComponent } from '../courses-sub-nav/courses-sub-nav.component';

@Component({
  selector: 'chora-aplus-catalog',
  imports: [FormsModule, RouterLink, TranslatePipe, CoursesSubNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss',
})
export class CatalogComponent {
  private readonly catalogService = inject(CatalogService);

  /** Fail-loud discriminated state from the service (loading/success/error). */
  readonly state = this.catalogService.state;
  readonly isLoading = computed<boolean>(
    () => this.state().status === 'loading',
  );
  readonly isError = computed<boolean>(() => this.state().status === 'error');
  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  /** Raw success-state course list (or `[]`). */
  readonly courses = this.catalogService.courses;

  // ── Filter state ──────────────────────────────────────────────────
  readonly searchQuery = signal('');
  readonly freeOnly = signal(false);
  readonly sfEligibleOnly = signal(false);

  // ── Pagination state (CR2-C2) ─────────────────────────────────────
  /** Exposed to template for option loop. */
  readonly CATALOG_PAGE_SIZE_OPTIONS = CATALOG_PAGE_SIZE_OPTIONS;
  readonly pageSize = signal<CatalogPageSize>(CATALOG_DEFAULT_PAGE_SIZE);

  /** Mirror service cursor signals for template binding. */
  readonly hasNextPage = computed<boolean>(() => this.catalogService.hasNextPage());
  readonly endCursor = computed<string | null>(() => this.catalogService.endCursor());

  // ── Derived state ─────────────────────────────────────────────────
  readonly total = computed<number>(() => this.courses().length);

  readonly filteredCourses = computed<readonly CatalogCourse[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const free = this.freeOnly();
    const sf = this.sfEligibleOnly();

    return this.courses().filter((c) => {
      if (q && !c.title.toLowerCase().includes(q)) return false;
      if (free && !c.is_free) return false;
      if (sf && !c.sf_eligible) return false;
      return true;
    });
  });

  readonly hasResults = computed<boolean>(
    () => this.filteredCourses().length > 0,
  );

  constructor() {
    this.catalogService.load();
  }

  // ── Actions ───────────────────────────────────────────────────────
  /** Retry CTA — re-fires the BFF call. */
  retry(): void {
    this.catalogService.load();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.freeOnly.set(false);
    this.sfEligibleOnly.set(false);
  }

  /** Fetch the next page and append courses to the existing list (CR2-C2). */
  loadMore(): void {
    const cursor = this.endCursor();
    if (cursor === null) return;
    this.catalogService.load({
      q: this.searchQuery().trim() || undefined,
      first: this.pageSize(),
      after: cursor,
      append: true,
    });
  }

  /** Reset to the first page with the newly selected page size (CR2-C2). */
  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize as CatalogPageSize);
    this.catalogService.load({
      q: this.searchQuery().trim() || undefined,
      first: newSize,
    });
  }

  /**
   * Fire a server-side keyword search on submit/enter (CR2-C2).
   * Client-side freeOnly/sfEligibleOnly remain applied on top of the
   * server-returned set.
   */
  onSearchSubmit(): void {
    const q = this.searchQuery().trim();
    this.catalogService.load({
      q: q || undefined,
      first: this.pageSize(),
    });
  }

  // ── Display helpers ───────────────────────────────────────────────
  priceLabel(course: CatalogCourse): string {
    return formatPriceSgd(course.price_sgd_cents);
  }
}
