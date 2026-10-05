/**
 * Offering entity descriptor for `chora-collection-view` (W2.C P0).
 *
 * Wires the generic finder primitive to the offerings entity: a
 * `CollectionDataSource` delegating to `OfferingsService.search`, the table
 * `ColumnDef`s, and the facet `FacetDef`s. This is the per-entity registration
 * point — adding another searchable list = adding one more descriptor module
 * like this one (no changes to the primitive).
 *
 * Badge columns return i18n KEYS (the renderer translates them); `label` and
 * `created_at` are the only sortable columns because they are the BE-supported
 * sort fields (`created_at|updated_at|label`).
 */
import { forkJoin, map } from 'rxjs';

import type {
  CollectionDataSource,
  CollectionFacet,
  CollectionPage,
  ColumnDef,
  FacetDef,
} from '../../../../shared/components/chora-collection-view/collection-view.model';
import {
  EXAM_DELIVERY_TYPE,
  deliveryTypeLabelKey,
  mapExamSittingToOffering,
  stateLabelKey,
  type Offering,
} from './offerings.model';
import type { ExamSitting } from '../exams/exams.model';
import type { ExamsService } from '../exams/exams.service';
import type { OfferingsService } from './offerings.service';

/** Build the offering data source (key `offering`) over the service. */
export function createOfferingDataSource(service: OfferingsService): CollectionDataSource<Offering> {
  return {
    key: 'offering',
    search: (query) => service.search(query),
  };
}

/**
 * Build the UNIFIED R+ delivery finder data source (key `delivery-finder`),
 * folding exam sittings (a separate BC — no union endpoint, `delivery_type=exam`
 * is rejected by the offering domain) into the offerings search CLIENT-SIDE
 * (R3 nav de-shadow).
 *
 * On page 1 (no cursor) it forkJoins the offerings search with the full exam
 * sittings list, maps each sitting to an Offering-shaped row
 * (`mapExamSittingToOffering`), appends those rows, and adds an `exam` bucket to
 * the delivery_type facet — while preserving the OFFERING page's cursor.
 *
 * Exams have no cursor of their own, so they are folded in ONCE. On any cursor
 * ("load more") page it returns offerings alone — the exam rows already shown
 * from page 1 must never be re-fetched or re-appended (which would duplicate
 * them across pages).
 */
export function createDeliveryFinderDataSource(
  offeringsSvc: OfferingsService,
  examsSvc: ExamsService,
): CollectionDataSource<Offering> {
  return {
    key: 'delivery-finder',
    search: (query) => {
      const offerings$ = offeringsSvc.search(query);
      if (query.cursor !== null) {
        // Cursor page: exams were already folded on page 1 — offerings only.
        return offerings$;
      }
      return forkJoin([offerings$, examsSvc.getUpcomingSittings()]).pipe(
        map(([page, examList]) => mergeExamsIntoPage(page, examList.sittings)),
      );
    },
  };
}

/** Append exam rows + an `exam` facet bucket to a page-1 offering page. */
function mergeExamsIntoPage(
  page: CollectionPage<Offering>,
  sittings: readonly ExamSitting[],
): CollectionPage<Offering> {
  if (sittings.length === 0) {
    return page; // no upcoming sittings — offering page verbatim
  }
  const examRows = sittings.map(mapExamSittingToOffering);
  return {
    items: [...page.items, ...examRows],
    facets: withExamFacetBucket(page.facets, examRows.length),
    // Preserve the OFFERING cursor — exams carry no cursor of their own.
    nextCursor: page.nextCursor,
    totalEstimate: page.totalEstimate,
  };
}

/**
 * Add (or, if the offering page omitted the dimension, synthesize) the `exam`
 * bucket on the delivery_type facet. Its label is the same i18n key the badge
 * cell uses (`deliveryTypeLabelKey('exam')`); other facet dimensions pass
 * through untouched.
 */
function withExamFacetBucket(
  facets: readonly CollectionFacet[],
  examCount: number,
): readonly CollectionFacet[] {
  const examBucket = {
    value: EXAM_DELIVERY_TYPE,
    label: deliveryTypeLabelKey(EXAM_DELIVERY_TYPE),
    count: examCount,
  };
  if (!facets.some((f) => f.field === 'delivery_type')) {
    return [...facets, { field: 'delivery_type', values: [examBucket] }];
  }
  return facets.map((f) =>
    f.field === 'delivery_type' ? { ...f, values: [...f.values, examBucket] } : f,
  );
}

/** Table columns. `priority >= 3` (capacity, created_at) collapse on tablet. */
export const OFFERING_COLUMNS: readonly ColumnDef<Offering>[] = [
  {
    field: 'label',
    labelKey: 'rplus.offerings.col.label',
    sortable: true,
    cell: 'text',
    value: (o) => o.label,
    priority: 1,
  },
  {
    field: 'delivery_type',
    labelKey: 'rplus.offerings.col.delivery_type',
    sortable: false,
    cell: 'badge',
    value: (o) => deliveryTypeLabelKey(o.deliveryType),
    priority: 2,
  },
  {
    field: 'state',
    labelKey: 'rplus.offerings.col.state',
    sortable: false,
    cell: 'badge',
    value: (o) => stateLabelKey(o.state),
    priority: 2,
  },
  {
    field: 'capacity',
    labelKey: 'rplus.offerings.col.capacity',
    sortable: false,
    cell: 'number',
    value: (o) => o.capacity,
    align: 'end',
    priority: 3,
  },
  {
    field: 'created_at',
    labelKey: 'rplus.offerings.col.created_at',
    sortable: true,
    cell: 'date',
    value: (o) => o.createdAt,
    priority: 3,
  },
];

/** Facet rail dimensions (always present on the wire, even when empty). */
export const OFFERING_FACETS: readonly FacetDef[] = [
  { field: 'delivery_type', labelKey: 'rplus.offerings.facet.delivery_type' },
  { field: 'state', labelKey: 'rplus.offerings.facet.state' },
];
