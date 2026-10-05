/**
 * AtomEntitySearchPort — real `EntitySearchPort` adapter for the `atom` entity
 * kind, backing the R+ curriculum "Add content item" picker (kind = Atom).
 *
 * Kills the raw-UUID paste that the add-item ref field used to demand: the
 * instructor searches atoms BY TITLE instead of remembering an atom_id. The
 * BE contract is `GET /api/atoms?q=<term>` (chora-creation, title ILIKE —
 * server-side so it scales past one page; there are 280+ tenant atoms).
 *
 * Fail-loud (no silent empty): a search error PROPAGATES so the picker renders
 * its error state; it is never swallowed into an empty page.
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

/** Subset of the `LearningAtom` wire row the picker needs. */
interface AtomRow {
  readonly atom_id: string;
  readonly title?: string | null;
  readonly question_type?: string | null;
}

/** `GET /api/atoms` response shape (page-based; `total` is the unpaged count). */
interface AtomListResponse {
  readonly items?: readonly AtomRow[];
  readonly total?: number;
}

/** How many matches to surface per search (server-filtered by `q`). */
const PAGE_SIZE = 25;

@Injectable({ providedIn: 'root' })
export class AtomEntitySearchPort implements EntitySearchPort {
  private readonly bff = inject(BffClientService);

  readonly entityType: EntityType = 'atom';

  search(
    q: string,
    _facets: EntityFacets,
    _cursor: string | null,
  ): Observable<EntitySearchPage> {
    const params = new HttpParams()
      .set('q', q)
      .set('page_size', String(PAGE_SIZE));
    return this.bff
      .get<AtomListResponse>('/api/atoms', params)
      .pipe(map((res) => this.toPage(res)));
  }

  /**
   * Best-effort hydration: the atom list has no batch-by-id endpoint, so a
   * pre-set id resolves to itself as the label (a UUID fallback — fail-loud
   * honest, never a fabricated name). The real title lands on the next search;
   * the curriculum item carries its own display title regardless.
   */
  resolve(ids: readonly string[]): Observable<readonly EntityRef[]> {
    return of(ids.map((id) => ({ id, label: id })));
  }

  private toPage(res: AtomListResponse): EntitySearchPage {
    const items: EntityRef[] = (res.items ?? []).map((a) => {
      const label = (a.title ?? '').trim() || a.atom_id;
      const kind = a.question_type?.trim();
      return kind ? { id: a.atom_id, label, sublabel: kind } : { id: a.atom_id, label };
    });
    // Server filters by `q`; results are small — no forward cursor.
    return { items, nextCursor: null };
  }
}
