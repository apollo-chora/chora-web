/**
 * OfferingsFinderComponent — the `/r/offerings` universal finder page (W2.C).
 *
 * Page chrome + a `CollectionStore<Offering>` (over the offerings data source)
 * rendered through the generic `chora-collection-view`. Bridges the query state
 * to the URL: reads the initial route queryParams on init, and mirrors every
 * subsequent (user-driven) query change back to the URL (merge + replaceUrl) so
 * each list is shareable / bookmarkable / back-button-safe. The cursor is
 * ephemeral and never serialised — a shared link starts at page 1.
 *
 * Surface-gated (the app-level surfaceGuard('rplus') guards `/r/*`); the search
 * READ needs no extra role, so no roleGuard here. Rows link to
 * `/r/offerings/:id` (the W2.D workspace — route lands later).
 *
 * R4 (CHO-2269): the finder is the R+ in-surface landing and carries a
 * portfolio header that absorbed the retired Rostering dashboard. The header
 * load is a SEPARATE async stream from the list's `CollectionStore`, the same
 * fail-loud AsyncState machine the retired dashboard used, so a header failure
 * and a list failure never take each other out. It shows only honest data
 * (instructor name, course count, learner sum); the dashboard's hardcoded
 * at-risk / completion / attendance zeros are gone, not promoted to the landing.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RbacService } from '../../../../core/services/rbac.service';
import { ChoraCollectionViewComponent } from '../../../../shared/components/chora-collection-view/chora-collection-view.component';
import { CollectionStore } from '../../../../shared/components/chora-collection-view/collection-store';
import {
  queryFromRouterParams,
  queryToRouterParams,
} from '../../../../shared/components/chora-collection-view/collection-query.util';
import type { ColumnDef, FacetDef } from '../../../../shared/components/chora-collection-view/collection-view.model';
import {
  OFFERING_COLUMNS,
  OFFERING_FACETS,
  createDeliveryFinderDataSource,
} from './offerings.collection';
import { EXAM_DELIVERY_TYPE, type Offering } from './offerings.model';
import { OfferingsService } from './offerings.service';
import { InstructorPortfolioService } from './instructor-portfolio.service';
import { ExamsService } from '../exams/exams.service';

@Component({
  selector: 'chora-rplus-offerings-finder',
  standalone: true,
  imports: [ChoraCollectionViewComponent, TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './offerings-finder.component.html',
  styleUrl: './offerings-finder.component.scss',
})
export class OfferingsFinderComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly rbac = inject(RbacService);
  private readonly portfolioService = inject(InstructorPortfolioService);

  /**
   * "New offering" CTA visibility — admins only (role-driven visibility per
   * ADR-141), mirroring the backend hasOfferingAdminRole. Hidden (not disabled)
   * for non-admins.
   */
  readonly canCreate = computed<boolean>(() =>
    ['instructor', 'admin', 'training_admin', 'tenant_admin'].some((role) =>
      this.rbac.hasRole(role),
    ),
  );

  // ── Portfolio header (R4, CHO-2269): absorbed Rostering dashboard ─────────
  /** Refetch trigger for the portfolio read; the retry CTA bumps it. */
  private readonly portfolioReload = signal(0);

  /**
   * The portfolio header's own async truth, independent of the list's
   * CollectionStore. Emits its load state (loading → loaded | error); the error
   * arm surfaces loud so a header failure is visible, never swallowed, and
   * never touches the list stream.
   */
  private readonly portfolioResult = toSignal(
    toObservable(this.portfolioReload).pipe(
      switchMap(() =>
        this.portfolioService.getInstructorPortfolio().pipe(
          map((data) => ({ status: 'loaded' as const, data, error: null })),
          startWith({ status: 'loading' as const, data: null, error: null }),
          catchError((err: HttpErrorResponse) =>
            of({ status: 'error' as const, data: null, error: describeHttpError(err) }),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' as const, data: null, error: null } },
  );

  readonly portfolioState = computed(() => this.portfolioResult().status);
  readonly portfolioError = computed<string | null>(() => this.portfolioResult().error);
  private readonly portfolio = computed(() => this.portfolioResult().data);

  readonly instructorName = computed<string>(() => this.portfolio()?.instructorName ?? '');
  readonly courseCount = computed<number>(() => this.portfolio()?.courseCount ?? 0);
  readonly learnerCount = computed<number>(() => this.portfolio()?.learnerCount ?? 0);
  readonly learnerCountIsLowerBound = computed<boolean>(
    () => this.portfolio()?.learnerCountIsLowerBound ?? false,
  );

  /**
   * Show the header only when the session actually has a teaching portfolio.
   * An empty portfolio (a pure admin, a searcher, or an anonymous session)
   * hides it, so the finder stays a clean universal list for non-instructors.
   */
  readonly showPortfolioHeader = computed<boolean>(
    () => this.portfolioState() === 'loaded' && this.courseCount() > 0,
  );

  /** Re-run the portfolio read after a load error (fail-loud retry, list untouched). */
  onPortfolioRetry(): void {
    this.portfolioReload.update((n) => n + 1);
  }

  readonly store = new CollectionStore<Offering>(
    createDeliveryFinderDataSource(inject(OfferingsService), inject(ExamsService)),
  );

  readonly columns: readonly ColumnDef<Offering>[] = OFFERING_COLUMNS;
  readonly facets: readonly FacetDef[] = OFFERING_FACETS;
  readonly rowIdentity = (row: Offering): string => row.id;
  /**
   * Folded exam rows (delivery_type=exam) route to the exam workspace; every
   * other (offering) row routes to the offering workspace. `EXAM_DELIVERY_TYPE`
   * is a FE-synthesized badge token — exam is a SEPARATE BC (see offerings.model).
   */
  readonly rowLink = (row: Offering): unknown[] =>
    row.deliveryType === EXAM_DELIVERY_TYPE
      ? ['/r/exams', row.id]
      : ['/r/offerings', row.id];

  /** Skip the first query emission (the URL-derived initial state). */
  private firstSync = true;

  constructor() {
    // Mirror user-driven query changes back to the URL.
    effect(() => {
      const query = this.store.query();
      if (this.firstSync) {
        this.firstSync = false;
        return;
      }
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: queryToRouterParams(query),
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    // Restore the durable query slice from the URL on entry (page 1).
    this.store.init(queryFromRouterParams(this.route.snapshot.queryParams));
  }
}

/** Render an HTTP error as a "<status>: <message>" string for the header alert. */
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
