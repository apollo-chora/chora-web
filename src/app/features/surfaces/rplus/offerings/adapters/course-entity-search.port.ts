/**
 * CourseEntitySearchPort — real `EntitySearchPort` adapter for the `course`
 * entity kind, backing the R+ prerequisite-editor TARGET picker (the
 * "Requires completion of" field on the Prerequisites tab).
 *
 * Kills the single-page course dropdown: the prior UX GET the tenant's
 * PUBLISHED-course catalogue ONCE (page_size=50, no search) and rendered it
 * as a plain `<select>` — silently truncating past the page ceiling. The BE
 * contract is `GET /api/v1/courses?state=PUBLISHED&q=<term>` (chora-delivery,
 * title ILIKE — server-side so it scales past one page).
 *
 * Fail-loud (no silent empty): a search error PROPAGATES so the picker
 * renders its error state; it is never swallowed into an empty page.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { type Observable, map, of } from 'rxjs';

import { BffClientService } from '../../../../../core/services/bff-client.service';
import type {
  EntityFacets,
  EntityRef,
  EntitySearchPage,
  EntitySearchPort,
  EntityType,
} from '../../../../../shared/components/chora-entity-picker/entity-picker.model';

/** Subset of the CJ#2 Course wire row (courseCJ2DTO) the picker needs. */
interface CourseRow {
  readonly id: string;
  readonly title?: string | null;
}

/** `GET /api/v1/courses` response shape (offset-paginated; `items` only). */
interface CourseListResponse {
  readonly items?: readonly CourseRow[];
}

/** How many matches to surface per search (server-filtered by `q`). */
const PAGE_SIZE = 25;

@Injectable({ providedIn: 'root' })
export class CourseEntitySearchPort implements EntitySearchPort {
  private readonly bff = inject(BffClientService);

  readonly entityType: EntityType = 'course';

  search(
    q: string,
    _facets: EntityFacets,
    _cursor: string | null,
  ): Observable<EntitySearchPage> {
    const params = new HttpParams()
      .set('state', 'PUBLISHED')
      .set('q', q)
      .set('page_size', String(PAGE_SIZE));
    return this.bff
      .get<CourseListResponse>('/api/v1/courses', params)
      .pipe(map((res) => this.toPage(res)));
  }

  /**
   * Best-effort hydration: no batch-by-id endpoint backs the picker (only a
   * single-course GET), so a pre-set id resolves to itself as the label (a
   * UUID fallback — fail-loud honest, never a fabricated name). Mirrors
   * AtomEntitySearchPort / TestSetEntitySearchPort.
   */
  resolve(ids: readonly string[]): Observable<readonly EntityRef[]> {
    return of(ids.map((id) => ({ id, label: id })));
  }

  private toPage(res: CourseListResponse): EntitySearchPage {
    const items: EntityRef[] = (res.items ?? []).map((c) => {
      const label = (c.title ?? '').trim() || c.id;
      return { id: c.id, label };
    });
    // Server filters by `q`; results are small — no forward cursor.
    return { items, nextCursor: null };
  }
}
