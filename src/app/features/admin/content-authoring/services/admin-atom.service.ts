/**
 * Admin atom service — REST CRUD for LearningAtom management.
 * Source of truth: chora-contracts/openapi/atomic.yaml
 *
 * Admin CRUD uses REST (OpenAPI). Learner-facing reads use GraphQL (ADR-025).
 * All HTTP calls go through BffClientService (chora-gateway).
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  AdminAtom,
  AtomRevision,
  AdminAtomListResponse,
  RevisionListResponse,
  AtomListParams,
  CreateAtomRequest,
  UpdateAtomRequest,
  CreateRevisionRequest,
  AdminAtomProjection,
  AdminAtomProjectionResponse,
  AuthorQuestionImages,
  GetQuestionResponse,
} from '../models/admin-atom.model';

const ATOMS_PATH = '/api/v1/atoms';
/** Learner-safe atom projection + author question projection (no `/v1/` prefix). */
const ATOM_PROJECTION_PATH = '/api/atoms';

@Injectable({ providedIn: 'root' })
export class AdminAtomService {
  private readonly bff = inject(BffClientService);

  /**
   * List atoms with optional filters and cursor pagination.
   * GET /api/v1/atoms
   */
  getAtoms(params: AtomListParams = {}): Observable<AdminAtomListResponse> {
    let httpParams = new HttpParams();
    if (params.cursor) httpParams = httpParams.set('cursor', params.cursor);
    if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());
    if (params.atom_type) httpParams = httpParams.set('atom_type', params.atom_type);
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.topic_id) httpParams = httpParams.set('topic_id', params.topic_id);
    if (params.difficulty) httpParams = httpParams.set('difficulty', params.difficulty.toString());

    return this.bff.get<AdminAtomListResponse>(ATOMS_PATH, httpParams);
  }

  /**
   * Get a single atom by ID.
   * GET /api/v1/atoms/{id}
   */
  getAtom(id: string): Observable<AdminAtom> {
    return this.bff.get<AdminAtom>(`${ATOMS_PATH}/${encodeURIComponent(id)}`);
  }

  /**
   * Create a new learning atom.
   * POST /api/v1/atoms
   */
  createAtom(request: CreateAtomRequest): Observable<AdminAtom> {
    return this.bff.post<AdminAtom>(ATOMS_PATH, request);
  }

  /**
   * Update atom metadata (NOT content — use revisions for content changes).
   * PUT /api/v1/atoms/{id}
   */
  updateAtom(id: string, request: UpdateAtomRequest): Observable<AdminAtom> {
    return this.bff.put<AdminAtom>(`${ATOMS_PATH}/${encodeURIComponent(id)}`, request);
  }

  /**
   * Soft-delete (archive) an atom.
   * DELETE /api/v1/atoms/{id}
   */
  deleteAtom(id: string): Observable<void> {
    return this.bff.delete<void>(`${ATOMS_PATH}/${encodeURIComponent(id)}`);
  }

  /**
   * Publish a draft revision to make it the current published revision.
   * POST /api/v1/atoms/{atomId}/revisions/{revisionId}/publish
   */
  publishRevision(atomId: string, revisionId: string): Observable<AtomRevision> {
    return this.bff.post<AtomRevision>(
      `${ATOMS_PATH}/${encodeURIComponent(atomId)}/revisions/${encodeURIComponent(revisionId)}/publish`,
      {},
    );
  }

  /**
   * Create a new revision for an atom (append-only).
   * POST /api/v1/atoms/{atomId}/revisions
   */
  createRevision(atomId: string, request: CreateRevisionRequest): Observable<AtomRevision> {
    return this.bff.post<AtomRevision>(
      `${ATOMS_PATH}/${encodeURIComponent(atomId)}/revisions`,
      request,
    );
  }

  /**
   * List revisions for an atom.
   * GET /api/v1/atoms/{atomId}/revisions
   */
  getRevisions(atomId: string): Observable<RevisionListResponse> {
    return this.bff.get<RevisionListResponse>(
      `${ATOMS_PATH}/${encodeURIComponent(atomId)}/revisions`,
    );
  }

  /**
   * Fetch the learner-safe atom projection (CHO-1638). Used by the
   * assessment-builder preview to extract the embedded Question UUID
   * (`mcq_payload.question_id`) before resolving illustrations. Path is
   * `/api/atoms/{id}` (chora-creation, NO `/v1/` prefix); the BFF wraps the
   * projection in an `{ atom: ... }` envelope — unwrap it here.
   */
  getAtomProjection(atomId: string): Observable<AdminAtomProjection> {
    return this.bff
      .get<AdminAtomProjectionResponse>(
        `${ATOM_PROJECTION_PATH}/${encodeURIComponent(atomId)}`,
      )
      .pipe(map((res) => res.atom));
  }

  /**
   * Fetch the AUTHOR question projection's illustration URLs (CHO-1638).
   * Path `/api/atoms/{atom_id}/questions/{question_id}` (operationId
   * getQuestion, author-gated) returns durable-signed
   * `question.mcq.{image_url, answer_image_url}`. The assessment-builder is
   * an author/preview surface, so BOTH the question and model-answer
   * illustrations are in scope here. Returns null URLs when absent.
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
}
