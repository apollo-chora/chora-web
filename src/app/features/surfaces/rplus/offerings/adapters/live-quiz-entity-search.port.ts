/**
 * LiveQuizEntitySearchPort — real `EntitySearchPort` adapter for the `live_quiz`
 * entity kind, backing the R+ curriculum "Add content item" picker (kind =
 * live_classroom). The BE stores a live_classroom curriculum-item's `ref` as a
 * `classroom_id` / LiveQuiz template id (course_content.go: atom_id /
 * test_set_id / classroom_id), so the "Live class" kind picks a reusable
 * LiveQuiz by TITLE — never a raw UUID (CHO-2134).
 *
 * Backing route: `GET /api/v1/live-quizzes?q=<term>` (chora-delivery; server-
 * side case-insensitive title filter). Unlike the test-sets route this response
 * is a FLAT `{items:[...]}` list — no `next_page_token` cursor — so every search
 * returns a single page (`nextCursor: null`). Fail-loud: search errors propagate.
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

/** Subset of the LiveQuiz wire row the picker needs. */
interface LiveQuizRow {
  readonly id: string;
  readonly title?: string | null;
  readonly state?: string | null;
}

/** `GET /api/v1/live-quizzes` response shape (flat, unpaginated). */
interface LiveQuizListResponse {
  readonly items?: readonly LiveQuizRow[];
}

@Injectable({ providedIn: 'root' })
export class LiveQuizEntitySearchPort implements EntitySearchPort {
  private readonly bff = inject(BffClientService);

  readonly entityType: EntityType = 'live_quiz';

  search(
    q: string,
    _facets: EntityFacets,
    _cursor: string | null,
  ): Observable<EntitySearchPage> {
    // Flat list — no page_size / page_token; the BE returns every match.
    const params = new HttpParams().set('q', q);
    return this.bff
      .get<LiveQuizListResponse>('/api/v1/live-quizzes', params)
      .pipe(map((res) => this.toPage(res)));
  }

  /** Best-effort hydration (no batch-by-id endpoint) — id→id UUID fallback. */
  resolve(ids: readonly string[]): Observable<readonly EntityRef[]> {
    return of(ids.map((id) => ({ id, label: id })));
  }

  private toPage(res: LiveQuizListResponse): EntitySearchPage {
    const items: EntityRef[] = (res.items ?? []).map((q) => {
      const label = (q.title ?? '').trim() || q.id;
      const sublabel = (q.state ?? '').trim();
      return sublabel
        ? { id: q.id, label, sublabel }
        : { id: q.id, label };
    });
    // Flat response ⇒ a single page; null cursor signals "last page".
    return { items, nextCursor: null };
  }
}
