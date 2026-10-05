/**
 * AtomQuestionPickerService — A+ X.1 (Phase X.1, ADR-155 D1).
 *
 * Sole BFF adapter for the question-picker. Calls
 * `GET /api/atoms/questions/search` per
 * `chora-contracts/openapi/creation-questions.yaml#searchQuestions`.
 *
 * Per chora-web CLAUDE.md §3: all HTTP goes through `BffClientService`.
 * Per `feedback_no_stubs_real_wiring`: real wire call; fail loud.
 *
 * Filter semantics (per ADR-155 D4):
 *   - Multi-value params (`question_type`, `topic_node_id`, `tag`,
 *     `atom_id`, `state`) are sent via repeated query keys, matching the
 *     OpenAPI `explode: true` convention.
 *   - Defaults: `sort=created_at:desc`, `per=20`.
 *   - Pagination is page-number (`page`/`per`), NOT cursor. End-of-list is
 *     `page * per >= total`; see the header of atom-question-picker.model.ts
 *     for why the cursor params this service used to send were inert.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  AtomProjection,
  AtomProjectionResponse,
  AuthorQuestionImages,
  GetQuestionResponse,
} from '../test-set-editor/test-set-editor.model';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  type AttachableAtomsResponse,
  type QuestionSearchQuery,
  type QuestionSearchResponse,
  type QuestionSearchResult,
} from './atom-question-picker.model';

@Injectable({ providedIn: 'root' })
export class AtomQuestionPickerService {
  private readonly bff = inject(BffClientService);

  /**
   * Execute a cursor-paginated, multi-filter question search.
   *
   * Caller decides debounce timing — this method makes the request
   * synchronously. The picker component composes a `debounceTime(300)`
   * upstream of `switchMap` into `service.search(query)`.
   */
  search(query: QuestionSearchQuery): Observable<QuestionSearchResponse> {
    let params = new HttpParams();

    // Free-text needle
    if (query.q && query.q.length > 0) {
      params = params.set('q', query.q);
    }

    // Multi-value filters (OR within family) — append() preserves repeats.
    for (const t of query.question_type ?? []) {
      params = params.append('question_type', t);
    }
    for (const id of query.topic_node_id ?? []) {
      params = params.append('topic_node_id', id);
    }
    for (const tag of query.tag ?? []) {
      params = params.append('tag', tag);
    }
    for (const id of query.atom_id ?? []) {
      params = params.append('atom_id', id);
    }
    for (const s of query.state ?? []) {
      params = params.append('state', s);
    }

    // Sort + pagination. `per`/`page` are the names the handler parses
    // (questions_handler.go: parsePositiveInt(q.Get("page")/q.Get("per"))).
    params = params.set('sort', query.sort ?? DEFAULT_SORT);
    params = params.set('per', String(query.per ?? DEFAULT_PAGE_SIZE));
    if (query.page !== undefined) {
      params = params.set('page', String(query.page));
    }

    // Source filter (ux_unified_atom_picker.md) — mine / saved / all.
    if (query.source) {
      params = params.set('source', query.source);
    }

    // Server-side author filter — the BE 400s a non-UUID rather than 500ing on
    // the `::uuid` cast, so a bad value surfaces as a clean error.
    if (query.author_gcid) {
      params = params.set('author_gcid', query.author_gcid);
    }

    // ADR-243: the 'enrolled' source is a different entitlement question and a
    // different backend. It asks chora-consumption "which atoms is this learner
    // already studying?" rather than asking chora-creation "which atoms may this
    // learner reuse?". Routing it here keeps ONE picker for the learner while
    // keeping the two entitlement models honestly separate on the wire.
    if (query.source === 'enrolled') {
      return this.searchEnrolled(query);
    }
    return this.bff.get<QuestionSearchResponse>('/api/atoms/questions/search', params);
  }

  /**
   * ADR-243 Source A - the learner's ENROLMENT-entitled atoms, served by
   * chora-consumption from their own LearningPaths via the local atom_index
   * projection. Same servability bar as the daily dose, so a learner is never
   * offered an atom they could not actually sit down and answer.
   *
   * Filtering is client-side because the endpoint returns the learner's own
   * (small, bounded) enrolled set rather than a tenant-wide corpus: there is no
   * page to fetch beyond it, so a server round-trip per keystroke would buy
   * nothing.
   */
  private searchEnrolled(query: QuestionSearchQuery): Observable<QuestionSearchResponse> {
    return this.bff
      .get<AttachableAtomsResponse>('/api/v1/me/concept-graph/attachable-atoms')
      .pipe(
        map((res) => {
          const needle = (query.q ?? '').trim().toLowerCase();
          const rows = (res.items ?? [])
            .filter((it) =>
              needle === ''
                ? true
                : `${it.title} ${it.topic ?? ''}`.toLowerCase().includes(needle),
            )
            .map<QuestionSearchResult>((it) => ({
              id: it.atomId,
              title: it.title,
              stem: it.topic ?? '',
              question_type: it.atomType === 'mcq' ? 'mcq' : 'oe',
              tenant_id: '',
              author_gcid: '',
              // The picker renders a relative date. For an ENROLLED atom the
              // meaningful date is when it became available to study, which is
              // the only real timestamp the projection carries. Left blank
              // rather than invented when the server has none.
              created_at: it.publishedAt ?? '',
              updated_at: it.publishedAt ?? '',
              source: 'enrolled',
            }));
          return { items: rows, total: rows.length };
        }),
      );
  }

  /**
   * Fetch the full atom projection (stem + mcq_payload / oe_payload /
   * essay_payload). Used by the picker's lazy-fetch-on-expand accordion.
   * BFF wraps in `{atom: ...}` envelope; unwrap here.
   */
  getAtomProjection(atomId: string): Observable<AtomProjection> {
    return this.bff
      .get<AtomProjectionResponse>(
        `/api/atoms/${encodeURIComponent(atomId)}`,
      )
      .pipe(map((res) => res.atom));
  }

  /**
   * Fetch the AUTHOR question projection's illustration URLs (CHO-1638).
   * `GET /api/atoms/{atom_id}/questions/{question_id}` carries durable-signed
   * `question.mcq.{image_url,answer_image_url}` — absent from the learner-safe
   * `getAtomProjection`. The picker is an author surface, so the model-answer
   * illustration is in-scope in the expanded detail. Null URLs when none.
   */
  getQuestionImages(
    atomId: string,
    questionId: string,
  ): Observable<AuthorQuestionImages> {
    return this.bff
      .get<GetQuestionResponse>(
        `/api/atoms/${encodeURIComponent(atomId)}/questions/${encodeURIComponent(questionId)}`,
      )
      .pipe(
        map((res) => ({
          image_url: res?.question?.mcq?.image_url ?? null,
          answer_image_url: res?.question?.mcq?.answer_image_url ?? null,
        })),
      );
  }
}
