// TODO(dedup): promote question-banks.{model,service}.ts to shared/ and have R+ + A+
// both import it (Phase-A.2 follow-up). This file is a deliberate surface-isolated
// copy of features/surfaces/rplus/question-banks/question-banks.service.ts so Wave 1
// can ship the A+ workbench without import churn on the live R+ feature.
/**
 * QuestionBanksService — real BFF wiring for the A+ (Creator) QuestionBank workbench.
 *
 * Sole HTTP adapter for the question-banks feature: every call goes through
 * `BffClientService` (chora-web CLAUDE.md §3) which prepends the gateway base
 * URL. Mapping (snake_case wire → camelCase FE; `question_bank_id` → `id`)
 * happens here at the service boundary — the SAME idiom as `offerings.service`.
 * Fail-loud: HTTP errors propagate untouched so components render their error
 * state (no fixture, no silent empty list) per feedback_no_stubs_real_wiring.
 *
 * A+ is the authoring/curation workbench, so the R+ `assembleTestSet` method
 * (assembly-for-delivery) is intentionally ABSENT here — A+ never assembles.
 *
 * Endpoints:
 *   - listMine        GET    /api/v1/me/question-banks
 *   - getBank         GET    /api/v1/question-banks/:id            (with items)
 *   - createBank      POST   /api/v1/question-banks
 *   - deleteBank      DELETE /api/v1/question-banks/:id            (204; soft-delete BE-side)
 *   - listQuestions   GET    /api/v1/question-banks/:id/questions
 *   - addQuestion     POST   /api/v1/question-banks/:id/questions  ({question_id})
 *   - removeQuestion  DELETE /api/v1/question-banks/:id/questions/:qid (204)
 */
import { HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { type Observable, map } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  mapBackendQuestionBank,
  mapBackendQuestionBankItemPage,
  mapBackendQuestionBankPage,
  type BackendQuestionBank,
  type BackendQuestionBankItemsPage,
  type BackendQuestionBankPage,
  type ListQuestionsParams,
  type QuestionBank,
  type QuestionBankItemPage,
  type QuestionBankPage,
  type QuestionBankVisibility,
} from './question-banks.model';

/** Request body for `createBank` (camelCase FE → snake_case wire 1:1). */
export interface CreateQuestionBankRequest {
  readonly name: string;
  readonly description: string;
  readonly visibility: QuestionBankVisibility;
  readonly tags: readonly string[];
}

@Injectable({ providedIn: 'root' })
export class QuestionBanksService {
  private readonly bff = inject(BffClientService);

  /** List the caller's question banks (the List page). */
  listMine(): Observable<QuestionBankPage> {
    return this.bff
      .get<BackendQuestionBankPage>('/api/v1/me/question-banks')
      .pipe(map(mapBackendQuestionBankPage));
  }

  /**
   * Fetch one bank by id WITH its membership items (the Detail page). The BE
   * 404s for an unknown / cross-tenant / soft-deleted bank — the error
   * propagates so the detail renders its not-found state (no placeholder).
   */
  getBank(id: string): Observable<QuestionBank> {
    return this.bff
      .get<BackendQuestionBank>(`/api/v1/question-banks/${encodeURIComponent(id)}`)
      .pipe(map(mapBackendQuestionBank));
  }

  /**
   * Create a question bank. Tenant + owner are stamped server-side off the
   * validated mesh claims (not sent on the wire). 201 → the new bank; 400
   * (validation) / 403 (non-author) propagate for loud surfacing.
   */
  createBank(req: CreateQuestionBankRequest): Observable<QuestionBank> {
    return this.bff
      .post<BackendQuestionBank>('/api/v1/question-banks', {
        name: req.name,
        description: req.description,
        visibility: req.visibility,
        tags: req.tags,
      })
      .pipe(map(mapBackendQuestionBank));
  }

  /**
   * Soft-delete a bank (NEVER hard-delete — BE-side). 204 → void; any error
   * propagates fail-loud.
   */
  deleteBank(id: string): Observable<void> {
    return this.bff
      .delete<void>(`/api/v1/question-banks/${encodeURIComponent(id)}`)
      .pipe(map(() => undefined));
  }

  /**
   * List ONE filtered/sorted page of a bank's questions (the Detail page). All
   * filter/sort/paginate is SERVER-SIDE (huge-bank-safe) via the v1.5.0 query
   * params; the response carries the page + the TOTAL match count (for the
   * pagination UI). Errors propagate so the panel renders its loud error state.
   */
  listQuestions(
    bankId: string,
    params: ListQuestionsParams = {},
  ): Observable<QuestionBankItemPage> {
    let qp = new HttpParams();
    if (params.q) {
      qp = qp.set('q', params.q);
    }
    for (const t of params.types ?? []) {
      qp = qp.append('question_type', t);
    }
    if (params.sort) {
      qp = qp.set('sort', params.sort);
    }
    if (params.page) {
      qp = qp.set('page', String(params.page));
    }
    if (params.pageSize) {
      qp = qp.set('page_size', String(params.pageSize));
    }
    return this.bff
      .get<BackendQuestionBankItemsPage>(
        `/api/v1/question-banks/${encodeURIComponent(bankId)}/questions`,
        qp,
      )
      .pipe(map(mapBackendQuestionBankItemPage));
  }

  /**
   * Add one question (atom) to a bank. 2xx → void (the caller refreshes the
   * list); a 409 (already a member) propagates for loud surfacing.
   */
  addQuestion(bankId: string, questionId: string): Observable<void> {
    return this.bff
      .post<unknown>(`/api/v1/question-banks/${encodeURIComponent(bankId)}/questions`, {
        question_id: questionId,
      })
      .pipe(map(() => undefined));
  }

  /** Remove one question from a bank (204 → void). Errors propagate fail-loud. */
  removeQuestion(bankId: string, questionId: string): Observable<void> {
    return this.bff
      .delete<void>(
        `/api/v1/question-banks/${encodeURIComponent(bankId)}/questions/${encodeURIComponent(questionId)}`,
      )
      .pipe(map(() => undefined));
  }

  /**
   * Persist a new membership order — POST /api/v1/question-banks/:id/reorder
   * with the FULL ordered list of question ids. 200 → the updated bank
   * (mapped). A 422 (id-set mismatch / empty) propagates for loud surfacing.
   */
  reorder(bankId: string, questionIds: readonly string[]): Observable<QuestionBank> {
    return this.bff
      .post<BackendQuestionBank>(
        `/api/v1/question-banks/${encodeURIComponent(bankId)}/reorder`,
        { question_ids: questionIds },
      )
      .pipe(map(mapBackendQuestionBank));
  }
}
