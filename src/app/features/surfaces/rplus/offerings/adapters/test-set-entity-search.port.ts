/**
 * TestSetEntitySearchPort — real `EntitySearchPort` adapter for the `testset`
 * entity kind, backing the R+ curriculum "Add content item" picker (kind =
 * Assessment). The BE stores an assessment curriculum-item's `ref` as a
 * `test_set_id` (course_content.go: atom_id / test_set_id / classroom_id), so
 * the "Assessment" kind picks a reusable TestSet by TITLE — never a raw UUID.
 *
 * Backing route: `GET /api/v1/test-sets?q=<term>` (chora-creation; server-side
 * title filter + `next_page_token` cursor). Fail-loud: search errors propagate.
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

/** Subset of the TestSet wire row the picker needs. */
interface TestSetRow {
  readonly test_set_id: string;
  readonly title?: string | null;
  readonly question_count?: number | null;
}

/** `GET /api/v1/test-sets` response shape (cursor-paginated). */
interface TestSetListResponse {
  readonly items?: readonly TestSetRow[];
  readonly next_page_token?: string | null;
}

const PAGE_SIZE = 25;

@Injectable({ providedIn: 'root' })
export class TestSetEntitySearchPort implements EntitySearchPort {
  private readonly bff = inject(BffClientService);

  readonly entityType: EntityType = 'testset';

  search(
    q: string,
    _facets: EntityFacets,
    cursor: string | null,
  ): Observable<EntitySearchPage> {
    let params = new HttpParams().set('q', q).set('page_size', String(PAGE_SIZE));
    if (cursor) {
      params = params.set('page_token', cursor);
    }
    return this.bff
      .get<TestSetListResponse>('/api/v1/test-sets', params)
      .pipe(map((res) => this.toPage(res)));
  }

  /** Best-effort hydration (no batch-by-id endpoint) — id→id UUID fallback. */
  resolve(ids: readonly string[]): Observable<readonly EntityRef[]> {
    return of(ids.map((id) => ({ id, label: id })));
  }

  private toPage(res: TestSetListResponse): EntitySearchPage {
    const items: EntityRef[] = (res.items ?? []).map((t) => {
      const label = (t.title ?? '').trim() || t.test_set_id;
      const count = t.question_count ?? 0;
      const sublabel = count > 0 ? `${count} question${count === 1 ? '' : 's'}` : undefined;
      return sublabel
        ? { id: t.test_set_id, label, sublabel }
        : { id: t.test_set_id, label };
    });
    return { items, nextCursor: res.next_page_token ?? null };
  }
}
