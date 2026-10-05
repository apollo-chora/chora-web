/**
 * Admin assessment service — REST CRUD for AssessmentSession management.
 * Source of truth: chora-contracts/openapi/atomic.yaml §assessments
 *
 * AssessmentSession is a collection aggregate that queries atoms, does NOT own them.
 * All HTTP calls go through BffClientService (chora-gateway).
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  AssessmentSession,
  CreateAssessmentRequest,
} from '../models/admin-assessment.model';

const ASSESSMENTS_PATH = '/api/v1/assessments';

@Injectable({ providedIn: 'root' })
export class AdminAssessmentService {
  private readonly bff = inject(BffClientService);

  /**
   * List assessment sessions with cursor pagination.
   * GET /api/v1/assessments
   */
  getAssessments(params: { cursor?: string; limit?: number } = {}): Observable<{
    data: AssessmentSession[];
    page_info: { next_cursor: string | null; has_next: boolean };
  }> {
    let httpParams = new HttpParams();
    if (params.cursor) httpParams = httpParams.set('cursor', params.cursor);
    if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());
    return this.bff.get(ASSESSMENTS_PATH, httpParams);
  }

  /**
   * Get a single assessment session by ID.
   * GET /api/v1/assessments/{id}
   */
  getAssessment(id: string): Observable<AssessmentSession> {
    return this.bff.get<AssessmentSession>(
      `${ASSESSMENTS_PATH}/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Create a new assessment session.
   * POST /api/v1/assessments
   */
  createAssessment(request: CreateAssessmentRequest): Observable<AssessmentSession> {
    return this.bff.post<AssessmentSession>(ASSESSMENTS_PATH, request);
  }

  /**
   * Update an assessment session (stub — endpoint may not exist yet).
   * PUT /api/v1/assessments/{id}
   */
  updateAssessment(
    id: string,
    request: Partial<CreateAssessmentRequest>,
  ): Observable<AssessmentSession> {
    return this.bff.put<AssessmentSession>(
      `${ASSESSMENTS_PATH}/${encodeURIComponent(id)}`,
      request,
    );
  }

  /**
   * Delete (soft-delete) an assessment session (stub).
   * DELETE /api/v1/assessments/{id}
   */
  deleteAssessment(id: string): Observable<void> {
    return this.bff.delete<void>(
      `${ASSESSMENTS_PATH}/${encodeURIComponent(id)}`,
    );
  }
}
