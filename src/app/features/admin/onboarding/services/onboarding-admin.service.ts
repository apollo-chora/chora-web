/**
 * OnboardingAdminService — REST adapter for checklist template management
 * and cohort progress monitoring.
 *
 * Source of truth: chora-contracts/openapi/onboarding.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  ChecklistTemplate,
  ChecklistTemplateState,
  CohortProgress,
  CohortProgressState,
} from '../models/onboarding.model';

const TEMPLATES_PATH = '/api/v1/onboarding/templates';
const COHORTS_PATH = '/api/v1/onboarding/cohorts';

@Injectable({ providedIn: 'root' })
export class OnboardingAdminService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _templateState = signal<ChecklistTemplateState>({ status: 'idle' });
  readonly templateState = this._templateState.asReadonly();

  private readonly _cohortState = signal<CohortProgressState>({ status: 'idle' });
  readonly cohortState = this._cohortState.asReadonly();

  // ---------------------------------------------------------------------------
  // Templates
  // ---------------------------------------------------------------------------

  loadTemplate(id: string): Observable<ChecklistTemplate | null> {
    this._templateState.set({ status: 'loading' });

    return this.bff
      .get<ChecklistTemplate>(`${TEMPLATES_PATH}/${encodeURIComponent(id)}`)
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
    template: Omit<ChecklistTemplate, 'id' | 'created_at' | 'updated_at'>,
  ): Observable<ChecklistTemplate | null> {
    return this.bff.post<ChecklistTemplate>(TEMPLATES_PATH, template).pipe(
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
    updates: Partial<ChecklistTemplate>,
  ): Observable<ChecklistTemplate | null> {
    return this.bff
      .put<ChecklistTemplate>(`${TEMPLATES_PATH}/${encodeURIComponent(id)}`, updates)
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

  // ---------------------------------------------------------------------------
  // Cohort Progress
  // ---------------------------------------------------------------------------

  getCohortProgress(templateId?: string): Observable<CohortProgress | null> {
    this._cohortState.set({ status: 'loading' });

    const path = templateId
      ? `${COHORTS_PATH}?template_id=${encodeURIComponent(templateId)}`
      : COHORTS_PATH;

    return this.bff.get<CohortProgress>(path).pipe(
      tap((progress) => {
        this._cohortState.set({ status: 'success', data: progress });
      }),
      catchError((err: Error) => {
        this._cohortState.set({ status: 'error', error: err.message });
        return of(null);
      }),
    );
  }

  sendReminder(gcids: string[]): Observable<{ sent: number } | null> {
    return this.bff
      .post<{ sent: number }>(`${COHORTS_PATH}/reminders`, { gcids })
      .pipe(catchError(() => of(null)));
  }

  exportCohortCsv(templateId: string): Observable<Blob | null> {
    return this.bff
      .get<Blob>(`${COHORTS_PATH}/export?template_id=${encodeURIComponent(templateId)}`)
      .pipe(catchError(() => of(null)));
  }
}
