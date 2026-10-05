/**
 * AssessmentInstantiationService — R+ Phase X.4.
 *
 * Sole provider for the R+ instantiate-assessment surface. Calls the real
 * BFF routes:
 *   - GET  /api/v1/test-sets?state=PUBLISHED  → loadPublishedTestSets()
 *   - POST /api/v1/assessments                → createAssessment()
 *
 * Both expose discriminated AsyncState signals so the component renders
 * fail-loud banners + field-level errors. No mock fallback per memory
 * `feedback_no_stubs_real_wiring`.
 */
import { Injectable, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../../core/services/bff-client.service';
import type {
  CreateAssessmentFieldErrors,
  CreateAssessmentRequest,
  CreateAssessmentState,
  CreatedAssessment,
  TestSetListLoadState,
  TestSetListResponse,
} from './assessment-instantiation.model';

@Injectable({ providedIn: 'root' })
export class AssessmentInstantiationService {
  private readonly bff = inject(BffClientService);

  // ── Test-set picker state ─────────────────────────────────────────
  private readonly _testSetsState = signal<TestSetListLoadState>({
    status: 'idle',
  });
  readonly testSetsState = this._testSetsState.asReadonly();

  // ── Submit (create assessment) state ──────────────────────────────
  private readonly _createState = signal<CreateAssessmentState>({
    status: 'idle',
  });
  readonly createState = this._createState.asReadonly();

  /**
   * Load the caller-tenant's PUBLISHED test-sets. Idempotent — recallable
   * to retry on error. Sort defaults to most recently published first.
   */
  loadPublishedTestSets(): void {
    this._testSetsState.set({ status: 'loading' });
    const params = new HttpParams().set('state', 'PUBLISHED');
    this.bff
      .get<TestSetListResponse>('/api/v1/test-sets', params)
      .pipe(
        take(1),
        map(
          (body): TestSetListLoadState => ({
            status: 'success',
            items: body.items,
          }),
        ),
        catchError(() =>
          of<TestSetListLoadState>({
            status: 'error',
            error: 'rplus.assessment_instantiation.test_set_picker_error',
          }),
        ),
      )
      .subscribe((s) => this._testSetsState.set(s));
  }

  /**
   * POST /api/v1/assessments to instantiate a new assessment. The body
   * shape is built by the component via `buildCreateAssessmentRequest`
   * helper so the wire shape is deterministic.
   *
   * Error mapping:
   *   - 400 / 422 → submit_error_4xx (+ optional field errors from
   *     `error.details` when present)
   *   - 5xx       → submit_error_5xx
   *   - network   → submit_error_generic
   */
  createAssessment(request: CreateAssessmentRequest): void {
    this._createState.set({ status: 'submitting' });
    this.bff
      .post<CreatedAssessment>('/api/v1/assessments', request)
      .pipe(
        take(1),
        map(
          (assessment): CreateAssessmentState => ({
            status: 'success',
            assessment,
          }),
        ),
        catchError((err: unknown) =>
          of<CreateAssessmentState>(this.mapCreateError(err)),
        ),
      )
      .subscribe((s) => this._createState.set(s));
  }

  /** Reset the submit state back to idle (used on retry / form re-edit). */
  resetCreate(): void {
    this._createState.set({ status: 'idle' });
  }

  /**
   * Map an HTTP error envelope to the discriminated error state. 4xx
   * surfaces field-level errors from `error.details` when present; 5xx
   * + network failures bubble up as banner-only errors.
   */
  private mapCreateError(err: unknown): CreateAssessmentState {
    const e = err as {
      status?: number;
      error?: { error?: { details?: Record<string, unknown> } };
    };
    const status = typeof e?.status === 'number' ? e.status : 0;
    if (status >= 500) {
      return {
        status: 'error',
        errorKey: 'rplus.assessment_instantiation.submit_error_5xx',
      };
    }
    if (status === 400 || status === 422 || (status >= 401 && status < 500)) {
      const details = e?.error?.error?.details;
      const fieldErrors = this.coerceFieldErrors(details);
      return {
        status: 'error',
        errorKey: 'rplus.assessment_instantiation.submit_error_4xx',
        ...(fieldErrors ? { fieldErrors } : {}),
      };
    }
    return {
      status: 'error',
      errorKey: 'rplus.assessment_instantiation.submit_error_generic',
    };
  }

  /** Coerce a server-side details payload into a string-only field-error map. */
  private coerceFieldErrors(
    details: Record<string, unknown> | undefined,
  ): CreateAssessmentFieldErrors | undefined {
    if (!details || typeof details !== 'object') return undefined;
    const out: Record<string, string> = {};
    let found = false;
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'string' && value.length > 0) {
        out[key] = value;
        found = true;
      }
    }
    return found ? out : undefined;
  }
}
