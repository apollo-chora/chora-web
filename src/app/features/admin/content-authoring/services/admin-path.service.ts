/**
 * Admin locked path service — REST CRUD for LockedPath management.
 * Source of truth: chora-contracts/openapi/creation-admin.yaml §locked-paths
 *
 * LockedPath is a collection aggregate that queries atoms, does NOT own them.
 * All HTTP calls go through BffClientService (chora-gateway).
 */
import { Injectable, inject } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import {
  LockedPath,
  LockedPathStep,
  LockedPathListResponse,
  CreateLockedPathRequest,
  CreateLockedPathStepRequest,
  ReorderStepsRequest,
} from '../models/admin-path.model';

const PATHS_PATH = '/api/v1/locked-paths';

@Injectable({ providedIn: 'root' })
export class AdminPathService {
  private readonly bff = inject(BffClientService);

  /**
   * List locked paths with cursor pagination.
   * GET /api/v1/locked-paths
   */
  getPaths(params: { cursor?: string; limit?: number } = {}): Observable<LockedPathListResponse> {
    let httpParams = new HttpParams();
    if (params.cursor) httpParams = httpParams.set('cursor', params.cursor);
    if (params.limit) httpParams = httpParams.set('limit', params.limit.toString());
    return this.bff.get<LockedPathListResponse>(PATHS_PATH, httpParams);
  }

  /**
   * Get a single locked path by ID (includes steps).
   * GET /api/v1/locked-paths/{id}
   */
  getPath(id: string): Observable<LockedPath> {
    return this.bff.get<LockedPath>(
      `${PATHS_PATH}/${encodeURIComponent(id)}`,
    );
  }

  /**
   * Create a new locked path.
   * POST /api/v1/locked-paths
   */
  createPath(request: CreateLockedPathRequest): Observable<LockedPath> {
    return this.bff.post<LockedPath>(PATHS_PATH, request);
  }

  /**
   * Update a locked path (stub — may not have full PUT endpoint yet).
   * PUT /api/v1/locked-paths/{id}
   */
  updatePath(id: string, request: Partial<CreateLockedPathRequest>): Observable<LockedPath> {
    return this.bff.put<LockedPath>(
      `${PATHS_PATH}/${encodeURIComponent(id)}`,
      request,
    );
  }

  /**
   * Add a step to a locked path.
   * POST /api/v1/locked-paths/{pathId}/steps
   */
  addStep(pathId: string, request: CreateLockedPathStepRequest): Observable<LockedPathStep> {
    return this.bff.post<LockedPathStep>(
      `${PATHS_PATH}/${encodeURIComponent(pathId)}/steps`,
      request,
    );
  }

  /**
   * Remove a step from a locked path.
   * DELETE /api/v1/locked-paths/{pathId}/steps/{stepId}
   */
  removeStep(pathId: string, stepId: string): Observable<void> {
    return this.bff.delete<void>(
      `${PATHS_PATH}/${encodeURIComponent(pathId)}/steps/${encodeURIComponent(stepId)}`,
    );
  }

  /**
   * Reorder steps in a locked path.
   * PUT /api/v1/locked-paths/{pathId}/steps/reorder
   */
  reorderSteps(pathId: string, request: ReorderStepsRequest): Observable<LockedPath> {
    return this.bff.put<LockedPath>(
      `${PATHS_PATH}/${encodeURIComponent(pathId)}/steps/reorder`,
      request,
    );
  }

  /**
   * Delete (soft-delete) a locked path (stub).
   * DELETE /api/v1/locked-paths/{id}
   */
  deletePath(id: string): Observable<void> {
    return this.bff.delete<void>(
      `${PATHS_PATH}/${encodeURIComponent(id)}`,
    );
  }
}
