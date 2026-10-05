/**
 * ChecklistService — Learner-facing REST adapter for onboarding checklist
 * progress tracking and item completion.
 *
 * Source of truth: chora-contracts/openapi/onboarding.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';
import type {
  LearnerChecklist,
  LearnerChecklistState,
  ChecklistSummary,
  ChecklistSummaryState,
} from '../models/checklist.model';

const CHECKLIST_PATH = '/api/v1/onboarding/checklist';

@Injectable({ providedIn: 'root' })
export class ChecklistService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _checklistState = signal<LearnerChecklistState>({ status: 'idle' });
  readonly checklistState = this._checklistState.asReadonly();

  private readonly _summaryState = signal<ChecklistSummaryState>({ status: 'idle' });
  readonly summaryState = this._summaryState.asReadonly();

  // ---------------------------------------------------------------------------
  // Checklist
  // ---------------------------------------------------------------------------

  getChecklist(): Observable<LearnerChecklist | null> {
    this._checklistState.set({ status: 'loading' });

    return this.bff.get<LearnerChecklist>(CHECKLIST_PATH).pipe(
      tap((checklist) => {
        this._checklistState.set({ status: 'success', data: checklist });
      }),
      catchError((err: Error) => {
        this._checklistState.set({ status: 'error', error: err.message });
        return of(null);
      }),
    );
  }

  markItemComplete(itemId: string): Observable<LearnerChecklist | null> {
    return this.bff
      .post<LearnerChecklist>(
        `${CHECKLIST_PATH}/items/${encodeURIComponent(itemId)}/complete`,
        {},
      )
      .pipe(
        tap((checklist) => {
          this._checklistState.set({ status: 'success', data: checklist });
        }),
        catchError((err: Error) => {
          this._checklistState.set({ status: 'error', error: err.message });
          return of(null);
        }),
      );
  }

  // ---------------------------------------------------------------------------
  // Summary (for dashboard widget)
  // ---------------------------------------------------------------------------

  getChecklistSummary(): Observable<ChecklistSummary | null> {
    this._summaryState.set({ status: 'loading' });

    return this.bff.get<ChecklistSummary>(`${CHECKLIST_PATH}/summary`).pipe(
      tap((summary) => {
        this._summaryState.set({ status: 'success', data: summary });
      }),
      catchError((err: Error) => {
        this._summaryState.set({ status: 'error', error: err.message });
        return of(null);
      }),
    );
  }
}
