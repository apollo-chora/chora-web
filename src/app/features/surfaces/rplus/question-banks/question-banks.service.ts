/**
 * QuestionBanksService — real BFF wiring for the R+ QuestionBank surface.
 *
 * Sole HTTP adapter for the question-banks feature: every call goes through
 * `BffClientService` (chora-web CLAUDE.md §3) which prepends the gateway base
 * URL. Mapping (snake_case wire → camelCase FE; `question_bank_id` → `id`)
 * happens here at the service boundary — the SAME idiom as `offerings.service`.
 * Fail-loud: HTTP errors propagate untouched so components render their error
 * state (no fixture, no silent empty list) per feedback_no_stubs_real_wiring.
 *
 * Endpoints:
 *   - listMine        GET    /api/v1/me/question-banks
 *   - getBank         GET    /api/v1/question-banks/:id            (with items)
 *   - createBank      POST   /api/v1/question-banks
 *   - deleteBank      DELETE /api/v1/question-banks/:id            (204; soft-delete BE-side)
 *   - listQuestions   GET    /api/v1/question-banks/:id/questions
 *   - addQuestion     POST   /api/v1/question-banks/:id/questions  ({question_id})
 *   - removeQuestion  DELETE /api/v1/question-banks/:id/questions/:qid (204)
 *   - assembleTestSet POST   /api/v1/question-banks/:id/assemble-test-set (202; async job)
 */
import { Injectable, inject } from '@angular/core';
import { type Observable, map } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  mapBackendAssembleResult,
  mapBackendQuestionBank,
  mapBackendQuestionBankItem,
  mapBackendQuestionBankPage,
  type AssembleTestSetResult,
  type BackendAssembleTestSetResponse,
  type BackendQuestionBank,
  type BackendQuestionBankItemsPage,
  type BackendQuestionBankPage,
  type QuestionBank,
  type QuestionBankItem,
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

/** Request body for `assembleTestSet`. */
export interface AssembleTestSetRequest {
  readonly title: string;
  readonly description: string;
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
   * List the membership items of one bank (the Detail page's questions list).
   * The dedicated endpoint keeps refresh-after-mutation cheap (no full-bank
   * re-fetch). Errors propagate so the panel renders its loud error state.
   */
  listQuestions(bankId: string): Observable<readonly QuestionBankItem[]> {
    return this.bff
      .get<BackendQuestionBankItemsPage>(
        `/api/v1/question-banks/${encodeURIComponent(bankId)}/questions`,
      )
      .pipe(map((resp) => (resp.items ?? []).map(mapBackendQuestionBankItem)));
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
   * Kick off async TestSet assembly from the bank. 202 → `{job_id,
   * test_set_status}`; a 400 (empty bank) / 403 propagate for loud surfacing.
   */
  assembleTestSet(
    bankId: string,
    req: AssembleTestSetRequest,
  ): Observable<AssembleTestSetResult> {
    return this.bff
      .post<BackendAssembleTestSetResponse>(
        `/api/v1/question-banks/${encodeURIComponent(bankId)}/assemble-test-set`,
        { title: req.title, description: req.description },
      )
      .pipe(map(mapBackendAssembleResult));
  }
}
