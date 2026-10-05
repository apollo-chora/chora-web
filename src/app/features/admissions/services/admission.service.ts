/**
 * AdmissionService — learner-facing REST adapter for browsing available
 * pipelines, starting applications, uploading documents, and viewing decisions.
 *
 * Source of truth: chora-contracts/openapi/admission.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  PipelineOverview,
  PipelineListState,
  ApplicationOverview,
  ApplicationState,
  StageDetail,
  StageDetailState,
  DecisionResult,
  DecisionState,
  UploadedDocument,
  StageSubmission,
} from '../models/admission-learner.model';

const PIPELINES_PATH = '/api/v1/admissions/pipelines';
const APPLICATIONS_PATH = '/api/v1/admissions/my-applications';

@Injectable({ providedIn: 'root' })
export class AdmissionService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _pipelineListState = signal<PipelineListState>({ status: 'idle' });
  readonly pipelineListState = this._pipelineListState.asReadonly();

  private readonly _applicationState = signal<ApplicationState>({ status: 'idle' });
  readonly applicationState = this._applicationState.asReadonly();

  private readonly _stageDetailState = signal<StageDetailState>({ status: 'idle' });
  readonly stageDetailState = this._stageDetailState.asReadonly();

  private readonly _decisionState = signal<DecisionState>({ status: 'idle' });
  readonly decisionState = this._decisionState.asReadonly();

  // ---------------------------------------------------------------------------
  // Pipelines
  // ---------------------------------------------------------------------------

  getAvailablePipelines(): Observable<PipelineOverview[] | null> {
    this._pipelineListState.set({ status: 'loading' });

    return this.bff.get<PipelineOverview[]>(PIPELINES_PATH).pipe(
      tap((pipelines) => {
        this._pipelineListState.set({ status: 'success', data: pipelines });
      }),
      catchError((err: Error) => {
        this._pipelineListState.set({ status: 'error', error: err.message });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Applications
  // ---------------------------------------------------------------------------

  startApplication(pipelineId: string): Observable<ApplicationOverview | null> {
    this._applicationState.set({ status: 'loading' });

    return this.bff
      .post<ApplicationOverview>(APPLICATIONS_PATH, { pipeline_id: pipelineId })
      .pipe(
        tap((application) => {
          this._applicationState.set({ status: 'success', data: application });
        }),
        catchError((err: Error) => {
          this._applicationState.set({ status: 'error', error: err.message });
          return of(null);
        }),
      );
  }

  getApplication(applicationId: string): Observable<ApplicationOverview | null> {
    this._applicationState.set({ status: 'loading' });

    return this.bff
      .get<ApplicationOverview>(
        `${APPLICATIONS_PATH}/${encodeURIComponent(applicationId)}`,
      )
      .pipe(
        tap((application) => {
          this._applicationState.set({ status: 'success', data: application });
        }),
        catchError((err: Error) => {
          this._applicationState.set({ status: 'error', error: err.message });
          return of(null);
        }),
      );
  }

  // ---------------------------------------------------------------------------
  // Stages
  // ---------------------------------------------------------------------------

  getStageDetail(
    applicationId: string,
    stageId: string,
  ): Observable<StageDetail | null> {
    this._stageDetailState.set({ status: 'loading' });

    return this.bff
      .get<StageDetail>(
        `${APPLICATIONS_PATH}/${encodeURIComponent(applicationId)}/stages/${encodeURIComponent(stageId)}`,
      )
      .pipe(
        tap((detail) => {
          this._stageDetailState.set({ status: 'success', data: detail });
        }),
        catchError((err: Error) => {
          this._stageDetailState.set({ status: 'error', error: err.message });
          return of(null);
        }),
      );
  }

  submitStage(
    applicationId: string,
    submission: StageSubmission,
  ): Observable<ApplicationOverview | null> {
    return this.bff
      .post<ApplicationOverview>(
        `${APPLICATIONS_PATH}/${encodeURIComponent(applicationId)}/stages/${encodeURIComponent(submission.stage_id)}/submit`,
        submission,
      )
      .pipe(
        tap((updated) => {
          this._applicationState.set({ status: 'success', data: updated });
        }),
        catchError(() => of(null)),
      );
  }

  uploadDocument(
    applicationId: string,
    stageId: string,
    file: File,
  ): Observable<UploadedDocument | null> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.bff
      .post<UploadedDocument>(
        `${APPLICATIONS_PATH}/${encodeURIComponent(applicationId)}/stages/${encodeURIComponent(stageId)}/documents`,
        formData,
      )
      .pipe(catchError(() => of(null)));
  }

  // ---------------------------------------------------------------------------
  // Decisions
  // ---------------------------------------------------------------------------

  getDecision(applicationId: string): Observable<DecisionResult | null> {
    this._decisionState.set({ status: 'loading' });

    return this.bff
      .get<DecisionResult>(
        `${APPLICATIONS_PATH}/${encodeURIComponent(applicationId)}/decision`,
      )
      .pipe(
        tap((decision) => {
          this._decisionState.set({ status: 'success', data: decision });
        }),
        catchError((err: Error) => {
          this._decisionState.set({ status: 'error', error: err.message });
          return of(null);
        }),
      );
  }
}
