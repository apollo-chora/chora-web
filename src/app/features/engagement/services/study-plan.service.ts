/**
 * StudyPlanService — REST adapter for study plan management.
 *
 * Source of truth: chora-engagement/internal/adapters/http/routes.go
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Domain Models
// ---------------------------------------------------------------------------

export type PaceLevel = 'light' | 'standard' | 'intensive';

export interface StudyPlanWeek {
  week_number: number;
  start_date: string;
  end_date: string;
  daily_atom_target: number;
  topics: StudyPlanTopic[];
  is_current: boolean;
  completed_atoms: number;
  total_atoms: number;
}

export interface StudyPlanTopic {
  topic_id: string;
  topic_name: string;
  atom_count: number;
  completed_count: number;
  priority: 'high' | 'medium' | 'low';
}

export interface StudyPlan {
  id: string;
  exam_id: string;
  exam_title: string;
  exam_date: string;
  pace: PaceLevel;
  weeks: StudyPlanWeek[];
  overall_progress_pct: number;
  days_remaining: number;
  daily_atom_target: number;
  created_at: string;
  updated_at: string;
}

export interface UpdatePaceRequest {
  pace: PaceLevel;
}

// ---------------------------------------------------------------------------
// Discriminated Union States
// ---------------------------------------------------------------------------

export type StudyPlanState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; plan: StudyPlan }
  | { status: 'error'; error: { code: string; message: string } };

export type PaceUpdateState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Endpoint paths
// ---------------------------------------------------------------------------

const STUDY_PLANS_PATH = '/api/v1/engagement/study-plans';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class StudyPlanService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _planState = signal<StudyPlanState>({ status: 'idle' });
  readonly planState = this._planState.asReadonly();

  private readonly _paceUpdateState = signal<PaceUpdateState>({ status: 'idle' });
  readonly paceUpdateState = this._paceUpdateState.asReadonly();

  // --- Computed ---
  readonly currentPlan = computed(() => {
    const s = this._planState();
    return s.status === 'success' ? s.plan : null;
  });

  readonly currentWeek = computed(() => {
    const plan = this.currentPlan();
    return plan?.weeks.find((w) => w.is_current) ?? null;
  });

  readonly daysRemaining = computed(() => {
    const plan = this.currentPlan();
    return plan?.days_remaining ?? 0;
  });

  readonly overallProgress = computed(() => {
    const plan = this.currentPlan();
    return plan?.overall_progress_pct ?? 0;
  });

  // ---------------------------------------------------------------------------
  // Load study plan for an exam
  // ---------------------------------------------------------------------------

  loadPlan(examId: string): Observable<StudyPlan | null> {
    this._planState.set({ status: 'loading' });

    return this.bff
      .get<StudyPlan>(`${STUDY_PLANS_PATH}/${encodeURIComponent(examId)}`)
      .pipe(
        tap((plan) => this._planState.set({ status: 'success', plan })),
        catchError((err: Error) => {
          this._planState.set({
            status: 'error',
            error: { code: 'STUDY_PLAN_LOAD_FAILED', message: err.message },
          });
          return of(null);
        }),
      );
  }

  // ---------------------------------------------------------------------------
  // Update pace level
  // ---------------------------------------------------------------------------

  updatePace(examId: string, pace: PaceLevel): Observable<StudyPlan | null> {
    this._paceUpdateState.set({ status: 'submitting' });

    return this.bff
      .put<StudyPlan>(
        `${STUDY_PLANS_PATH}/${encodeURIComponent(examId)}/pace`,
        { pace } as UpdatePaceRequest,
      )
      .pipe(
        tap((plan) => {
          this._paceUpdateState.set({ status: 'success' });
          this._planState.set({ status: 'success', plan });
        }),
        catchError((err: Error) => {
          this._paceUpdateState.set({
            status: 'error',
            error: { code: 'PACE_UPDATE_FAILED', message: err.message },
          });
          return of(null);
        }),
      );
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetState(): void {
    this._planState.set({ status: 'idle' });
    this._paceUpdateState.set({ status: 'idle' });
  }
}
