/**
 * CatalogComponent — R+ /r/catalog surface.
 *
 * Ports `chora-web/.stitch-imports/rplus/rplus-course-catalog-admin.html`
 * into a standalone Angular component on the polyglass design system.
 * Tailwind CDN utility classes from the source HTML are translated to
 * BEM polyglass primitives, and the Stitch magenta accent (`#ec4899`)
 * is re-routed to the R+ amber surface accent (`#b45309` / `#ea580c`).
 *
 * Mr. Chen workflow entry point — instructor lands on /r/catalog, scans
 * the tenant's PUBLISHED courses, then drills into cohort / class
 * scheduling from here. The "Create Course" CTA navigates to
 * /r/catalog/new (CourseAuthoringComponent).
 *
 * CHO-2214: this screen used to own a SECOND create path — an inline form
 * POSTing the same /api/v1/courses. It is gone. Both hit one endpoint, but
 * the inline form asked for test-sets as a `required` free-text list of
 * comma-separated UUIDs typed by hand, while /r/catalog/new loads the
 * tenant's test-sets into a checkbox picker and additionally carries cert
 * config and the publish/release lifecycle. Two front doors onto one
 * endpoint, one of them unusable without a UUID on the clipboard, is the
 * duplication this story exists to remove — so the CTA now navigates to the
 * richer path and the form was deleted rather than left as a rival.
 *
 * The list stays a reloadKey-driven refetch (toObservable → switchMap): the
 * key still drives the fail-loud retry after a load error. (A bare
 * `toSignal(service.getCatalog())` only subscribes once and never refetches
 * — that latent bug is fixed here.)
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { CatalogService } from './catalog.service';
import { RbacService } from '../../../../core/services/rbac.service';
import {
  CatalogCourse,
  statusBadgeVariant,
  CatalogStatus,
  CourseStateFilter,
  CATALOG_STATE_FILTERS,
} from './catalog.model';

@Component({
  selector: 'chora-rplus-catalog',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.scss',
})
export class CatalogComponent {
  private readonly catalogService = inject(CatalogService);
  private readonly rbac = inject(RbacService);

  /**
   * May this session author courses? (Owner R44 / D9.)
   *
   * Mirrors `roleGuard('course:author')` on `catalog/new` rather than listing
   * roles here, so the CTA and the guard can never drift apart. `course:author`
   * is admin-only by owner ruling (`role-capabilities.ts:44-52`) and is denied
   * to instructor at `:111` in as many words.
   */
  readonly canAuthorCourses = computed<boolean>(() =>
    this.rbac.hasCapability('course:author'),
  );

  /**
   * Refetch trigger. Incrementing it re-runs the catalog fetch via the
   * trigger → switchMap pipeline below, so a retry after an error reflects
   * canonical server state (NOT an optimistic local insert).
   */
  private readonly reloadKey = signal(0);

  /**
   * Course-state the catalog list is filtered by. Defaults to PUBLISHED (the
   * storefront view); the admin switches to DRAFT / AWAITING_REVIEW / ARCHIVED
   * to view + manage non-published courses (J1 / CHO-1829 draft visibility).
   */
  readonly statusFilter = signal<CourseStateFilter>('PUBLISHED');

  /** Status-filter options (value + i18n label key) for the header control. */
  readonly statusFilters = CATALOG_STATE_FILTERS.map((value) => ({
    value,
    labelKey: `rplus.catalog.filter.${value.toLowerCase()}`,
  }));

  /**
   * Single source of async truth. Every (reloadKey, statusFilter) change
   * re-fetches and the stream EMITS its own load state: `startWith(loading)`
   * shows skeletons on each (re)fetch (J2) and `catchError` turns an HTTP
   * failure into a fail-loud error state rather than a silent empty list (J1).
   * The state is emitted by the stream (never written to a signal inside the
   * subscription), so there is no write-during-effect hazard.
   */
  private readonly trigger = computed(() => ({
    key: this.reloadKey(),
    state: this.statusFilter(),
  }));

  private readonly result = toSignal(
    toObservable(this.trigger).pipe(
      switchMap(({ state }) =>
        this.catalogService.getCatalog(state).pipe(
          map((data) => ({ status: 'loaded' as const, data, error: null })),
          startWith({ status: 'loading' as const, data: null, error: null }),
          catchError((err: HttpErrorResponse) =>
            of({
              status: 'error' as const,
              data: null,
              error: describeHttpError(err),
            }),
          ),
        ),
      ),
    ),
    {
      initialValue: { status: 'loading' as const, data: null, error: null },
    },
  );

  /** 'loading' | 'loaded' | 'error' — drives the skeleton / grid / banner. */
  readonly loadState = computed(() => this.result().status);
  readonly loadError = computed<string | null>(() => this.result().error);
  private readonly data = computed(() => this.result().data);

  readonly tenantName = computed<string>(() => this.data()?.tenantName ?? '');
  readonly totalCourses = computed<number>(() => this.data()?.totalCourses ?? 0);
  readonly courses = computed<readonly CatalogCourse[]>(
    () => this.data()?.courses ?? [],
  );

  badge(status: CatalogStatus): string {
    return statusBadgeVariant(status);
  }

  /** Switch the catalog status filter (re-fetches via the trigger). No-op if
   *  the filter is unchanged so an idle re-click does not refetch. */
  setStatusFilter(state: CourseStateFilter): void {
    if (this.statusFilter() === state) return;
    this.statusFilter.set(state);
  }

  /** Re-fetch the catalog after a load error (fail-loud retry). */
  onRetry(): void {
    this.reloadKey.update((n) => n + 1);
  }
}

/** Render an HTTP error as a "<status>: <message>" string for the error banner. */
function describeHttpError(err: HttpErrorResponse): string {
  const status = err.status ?? 0;
  const body = err.error as { message?: string; error?: string } | string | null;
  let message = err.message || 'Request failed';
  if (body && typeof body === 'object') {
    message = body.message ?? body.error ?? message;
  } else if (typeof body === 'string' && body.trim()) {
    message = body;
  }
  return status ? `${status}: ${message}` : message;
}
