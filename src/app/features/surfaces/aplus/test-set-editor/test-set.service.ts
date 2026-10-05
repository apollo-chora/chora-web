/**
 * TestSetService — A+ X.2 (ADR-155).
 *
 * Sole BFF adapter for the test-set editor. 10 operations against
 * `chora-contracts/openapi/delivery-test-sets.yaml`:
 *
 *   listTestSets         GET    /api/v1/test-sets
 *   createTestSet        POST   /api/v1/test-sets
 *   getTestSet           GET    /api/v1/test-sets/{id}
 *   updateTestSet        PATCH  /api/v1/test-sets/{id}
 *   deleteTestSet        DELETE /api/v1/test-sets/{id}
 *   publishTestSet       POST   /api/v1/test-sets/{id}/publish
 *   archiveTestSet       POST   /api/v1/test-sets/{id}/archive
 *   addQuestion          POST   /api/v1/test-sets/{id}/questions
 *   updateQuestion       PATCH  /api/v1/test-sets/{id}/questions/{tsqId}
 *   removeQuestion       DELETE /api/v1/test-sets/{id}/questions/{tsqId}
 *
 * Per chora-web CLAUDE.md §3: all HTTP goes through BffClientService.
 * Per `feedback_no_stubs_real_wiring`: no fixtures, fail-loud on 5xx.
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { map } from 'rxjs/operators';

import {
  toQuestionReview,
  type AuthorQuestionRaw,
  type QuestionReview,
} from '../../../../shared/components/chora-question-review/chora-question-review.model';
import { type EditQuestionRequest } from '../atom-authoring/atom-authoring.model';

import {
  type AddTestSetQuestionRequest,
  type AtomProjection,
  type AtomProjectionResponse,
  type AuthorQuestionImages,
  type CreateTestSetRequest,
  type GetQuestionResponse,
  type TestSet,
  type TestSetListResponse,
  type TestSetQuestion,
  type TestSetState,
  type TestSetWithQuestions,
  type UpdateTestSetQuestionRequest,
  type UpdateTestSetRequest,
} from './test-set-editor.model';

const PATH = '/api/v1/test-sets';
const ATOM_PROJECTION_PATH = '/api/atoms';

interface ListTestSetsQuery {
  readonly state?: readonly TestSetState[];
  readonly q?: string;
  readonly sort?: string;
  readonly page_size?: 10 | 20 | 50 | 100;
  readonly page_token?: string;
  readonly include_total?: boolean;
  /**
   * Lane 1c (CHO-1703 / ADR-180 D10): exact-match filter on
   * `test_sets.source_job_id` — the chora-creation batch job whose
   * `question_batch.accepted.v1` event assembled the set. The batch-
   * authoring FE polls this (2s, ≤30s) post-accept to deep-link the editor.
   * At most ONE test set matches (UNIQUE partial index).
   */
  readonly source_job_id?: string;
}

@Injectable({ providedIn: 'root' })
export class TestSetService {
  private readonly bff = inject(BffClientService);

  listTestSets(q: ListTestSetsQuery): Observable<TestSetListResponse> {
    let params = new HttpParams();
    for (const s of q.state ?? []) {
      params = params.append('state', s);
    }
    if (q.q) {
      params = params.set('q', q.q);
    }
    if (q.source_job_id) {
      params = params.set('source_job_id', q.source_job_id);
    }
    params = params.set('sort', q.sort ?? 'created_at:desc');
    params = params.set('page_size', String(q.page_size ?? 20));
    if (q.page_token) params = params.set('page_token', q.page_token);
    if (q.include_total) params = params.set('include_total', 'true');
    return this.bff.get<TestSetListResponse>(PATH, params);
  }

  createTestSet(req: CreateTestSetRequest): Observable<TestSet> {
    return this.bff.post<TestSet>(PATH, req);
  }

  getTestSet(testSetId: string): Observable<TestSetWithQuestions> {
    return this.bff.get<TestSetWithQuestions>(
      `${PATH}/${encodeURIComponent(testSetId)}`,
    );
  }

  updateTestSet(testSetId: string, req: UpdateTestSetRequest): Observable<TestSet> {
    return this.bff.patch<TestSet>(
      `${PATH}/${encodeURIComponent(testSetId)}`,
      req,
    );
  }

  deleteTestSet(testSetId: string): Observable<void> {
    return this.bff.delete<void>(`${PATH}/${encodeURIComponent(testSetId)}`);
  }

  publishTestSet(testSetId: string): Observable<TestSet> {
    return this.bff.post<TestSet>(
      `${PATH}/${encodeURIComponent(testSetId)}/publish`,
      {},
    );
  }

  archiveTestSet(testSetId: string): Observable<TestSet> {
    return this.bff.post<TestSet>(
      `${PATH}/${encodeURIComponent(testSetId)}/archive`,
      {},
    );
  }

  addQuestion(
    testSetId: string,
    req: AddTestSetQuestionRequest,
  ): Observable<TestSetQuestion> {
    return this.bff.post<TestSetQuestion>(
      `${PATH}/${encodeURIComponent(testSetId)}/questions`,
      req,
    );
  }

  updateQuestion(
    testSetId: string,
    testSetQuestionId: string,
    req: UpdateTestSetQuestionRequest,
  ): Observable<TestSetQuestion> {
    return this.bff.patch<TestSetQuestion>(
      `${PATH}/${encodeURIComponent(testSetId)}/questions/${encodeURIComponent(testSetQuestionId)}`,
      req,
    );
  }

  removeQuestion(testSetId: string, testSetQuestionId: string): Observable<void> {
    return this.bff.delete<void>(
      `${PATH}/${encodeURIComponent(testSetId)}/questions/${encodeURIComponent(testSetQuestionId)}`,
    );
  }

  /**
   * Fetch the learner-safe atom projection so the picker can extract the
   * embedded Question UUID before POSTing to `addQuestion`. Required by
   * LEG3-D R3 Option B — see `AddTestSetQuestionRequest` for the contract.
   * Path is `/api/atoms/{id}` (chora-creation, NO `/v1/` prefix).
   *
   * BFF wraps the projection in `{ atom: ... }`; unwrap here so callers
   * see the inner shape directly.
   */
  getAtomProjection(atomId: string): Observable<AtomProjection> {
    return this.bff
      .get<AtomProjectionResponse>(
        `${ATOM_PROJECTION_PATH}/${encodeURIComponent(atomId)}`,
      )
      .pipe(map((res) => res.atom));
  }

  /**
   * Fetch the AUTHOR question projection's illustration URLs (CHO-1638).
   * Path `/api/atoms/{atom_id}/questions/{question_id}` (chora-creation, NO
   * `/v1/` prefix) returns durable-signed `question.mcq.{image_url,
   * answer_image_url}`. Unlike the learner-safe `getAtomProjection`, this
   * carries the model-answer illustration — only ever rendered on AUTHOR
   * preview surfaces. Returns null URLs when the question has no images.
   */
  getQuestionImages(
    atomId: string,
    questionId: string,
  ): Observable<AuthorQuestionImages> {
    return this.bff
      .get<GetQuestionResponse>(
        `${ATOM_PROJECTION_PATH}/${encodeURIComponent(atomId)}/questions/${encodeURIComponent(questionId)}`,
      )
      .pipe(
        map((res) => ({
          image_url: res?.question?.mcq?.image_url ?? null,
          answer_image_url: res?.question?.mcq?.answer_image_url ?? null,
        })),
      );
  }

  /**
   * Fetch the FULL author question projection (`GET /api/atoms/{atom_id}/
   * questions/{question_id}`) and normalise it into a `QuestionReview` —
   * MCQ options with `is_correct` + per-option grounding/explainer, OE model
   * answer + rubric, plus the question / model-answer illustrations. Powers
   * the "Included questions" answer-key reveal in the editor (and the R+
   * monitor's questions panel) so authors can sight the full question, the
   * correct answer, and the grounding without re-opening each atom.
   *
   * AUTHOR-ONLY: carries the answer key — never wire to a learner surface.
   */
  getQuestionDetail(
    atomId: string,
    questionId: string,
  ): Observable<QuestionReview> {
    return this.bff
      .get<AuthorQuestionRaw>(
        `${ATOM_PROJECTION_PATH}/${encodeURIComponent(atomId)}/questions/${encodeURIComponent(questionId)}`,
      )
      .pipe(map((res) => toQuestionReview(res)));
  }

  /**
   * Edit a published atom's question content (prompt + MCQ options) — PATCH
   * /api/atoms/{atom_id}/questions/{q_id}. The backend mints a new
   * AtomRevision (append-only), assigns option_ids for added options, and
   * re-emits the grading key. Caller re-fetches getQuestionDetail on success.
   */
  editQuestion(
    atomId: string,
    questionId: string,
    req: EditQuestionRequest,
  ): Observable<void> {
    return this.bff.patch<void>(
      `${ATOM_PROJECTION_PATH}/${encodeURIComponent(atomId)}/questions/${encodeURIComponent(questionId)}`,
      req,
    );
  }
}
