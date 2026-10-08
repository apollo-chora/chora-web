/**
 * AdmissionAdminService — REST adapter for pipeline template management,
 * application review, and decision recording.
 *
 * Source of truth: chora-contracts/openapi/course-application.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  PipelineTemplate,
  PipelineTemplateState,
  ApplicationSummary,
  ApplicationListState,
  ApplicationDetail,
  ApplicationDetailState,
  ApplicationDecision,
  BulkDecisionRequest,
  PublicationRequest,
  ReviewerNote,
  DecisionType,
  RejectReasonCode,
} from '../models/admission.model';

const TEMPLATES_PATH = '/api/v1/admissions/templates';
const APPLICATIONS_PATH = '/api/v1/admissions/applications';

@Injectable({ providedIn: 'root' })
export class AdmissionAdminService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _templateState = signal<PipelineTemplateState>({ status: 'idle' });
  readonly templateState = this._templateState.asReadonly();

  private readonly _applicationListState = signal<ApplicationListState>({ status: 'idle' });
  readonly applicationListState = this._applicationListState.asReadonly();

  private readonly _applicationDetailState = signal<ApplicationDetailState>({ status: 'idle' });
  readonly applicationDetailState = this._applicationDetailState.asReadonly();

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  loadTemplate(id: string): Observable<PipelineTemplate | null> {
    this._templateState.set({ status: 'loading' });

    return this.bff
      .get<PipelineTemplate>(`${TEMPLATES_PATH}/${encodeURIComponent(id)}`)
      .pipe(
        tap((template) => {
          this._templateState.set({ status: 'success', data: template });
        }),
        catchError((err: Error) => {
          this._templateState.set({ status: 'error', error: err.message });
          return of(null);
        }),
      );
  }

  createTemplate(
    template: Omit<PipelineTemplate, 'id' | 'status' | 'created_at' | 'updated_at'>,
  ): Observable<PipelineTemplate | null> {
    return this.bff.post<PipelineTemplate>(TEMPLATES_PATH, template).pipe(
      tap((created) => {
        this._templateState.set({ status: 'success', data: created });
      }),
      catchError((err: Error) => {
        this._templateState.set({ status: 'error', error: err.message });
        return of(null);
      }),
    );
  }

  updateTemplate(
    id: string,
    updates: Partial<PipelineTemplate>,
  ): Observable<PipelineTemplate | null> {
    return this.bff
      .put<PipelineTemplate>(`${TEMPLATES_PATH}/${encodeURIComponent(id)}`, updates)
      .pipe(
        tap((updated) => {
          this._templateState.set({ status: 'success', data: updated });
        }),
        catchError((err: Error) => {
          this._templateState.set({ status: 'error', error: err.message });
          return of(null);
        }),
      );
  }

  publishTemplate(
    id: string,
    request: PublicationRequest,
  ): Observable<PipelineTemplate | null> {
    return this.bff
      .post<PipelineTemplate>(
        `${TEMPLATES_PATH}/${encodeURIComponent(id)}/publish`,
        request,
      )
      .pipe(
        tap((published) => {
          this._templateState.set({ status: 'success', data: published });
        }),
        catchError((err: Error) => {
          this._templateState.set({ status: 'error', error: err.message });
          return of(null);
        }),
      );
  }

  // ---------------------------------------------------------------------------
  // Applications
  // ---------------------------------------------------------------------------

  getApplications(pipelineId?: string): Observable<ApplicationSummary[] | null> {
    this._applicationListState.set({ status: 'loading' });

    const path = pipelineId
      ? `${APPLICATIONS_PATH}?pipeline_id=${encodeURIComponent(pipelineId)}`
      : APPLICATIONS_PATH;

    return this.bff.get<ApplicationSummary[]>(path).pipe(
      tap((applications) => {
        this._applicationListState.set({ status: 'success', data: applications });
      }),
      catchError((err: Error) => {
        this._applicationListState.set({ status: 'error', error: err.message });
        return of(null);
      }),
    );
  }

  getApplicationDetail(id: string): Observable<ApplicationDetail | null> {
    this._applicationDetailState.set({ status: 'loading' });

    return this.bff
      .get<ApplicationDetail>(`${APPLICATIONS_PATH}/${encodeURIComponent(id)}`)
      .pipe(
        tap((detail) => {
          this._applicationDetailState.set({ status: 'success', data: detail });
        }),
        catchError((err: Error) => {
          this._applicationDetailState.set({ status: 'error', error: err.message });
          return of(null);
        }),
      );
  }

  recordDecision(
    applicationId: string,
    decision: DecisionType,
    reasonCode: RejectReasonCode | null,
    reasonDetail: string | null,
  ): Observable<ApplicationDecision | null> {
    return this.bff
      .post<ApplicationDecision>(
        `${APPLICATIONS_PATH}/${encodeURIComponent(applicationId)}/decision`,
        {
          decision,
          reason_code: reasonCode,
          reason_detail: reasonDetail,
        },
      )
      .pipe(catchError(() => of(null)));
  }

  bulkDecision(request: BulkDecisionRequest): Observable<ApplicationDecision[] | null> {
    return this.bff
      .post<ApplicationDecision[]>(`${APPLICATIONS_PATH}/bulk-decision`, request)
      .pipe(catchError(() => of(null)));
  }

  addReviewerNote(
    applicationId: string,
    note: string,
  ): Observable<ReviewerNote | null> {
    return this.bff
      .post<ReviewerNote>(
        `${APPLICATIONS_PATH}/${encodeURIComponent(applicationId)}/notes`,
        { note },
      )
      .pipe(catchError(() => of(null)));
  }
}
