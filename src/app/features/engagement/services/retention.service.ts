import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Response models
// ---------------------------------------------------------------------------

export interface AtRiskAtom {
  atom_id: string;
  last_reviewed: string;
  predicted_retention: number;
  topic_name: string;
}

export interface ForgettingCurvePoint {
  days_since_review: number;
  predicted_retention: number;
}

export interface RetentionPrediction {
  retention_score: number;
  at_risk_atoms: AtRiskAtom[];
  forgetting_curve_data: ForgettingCurvePoint[];
  governance: Record<string, unknown>;
}

export interface SuggestedAtom {
  atom_id: string;
  title: string;
  reason: string;
}

export interface StreakNudge {
  nudge_type: string;
  message: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  suggested_atoms: SuggestedAtom[];
  governance: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type RetentionState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: RetentionPrediction }
  | { status: 'error'; error: { code: string; message: string } };

export type NudgeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: StreakNudge }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class RetentionService {
  private readonly bff = inject(BffClientService);
  private readonly retentionPath = '/api/v1/engagement/agents/retention/predict';
  private readonly nudgePath = '/api/v1/engagement/agents/streak/nudge';

  // --- State ---
  private readonly _retentionState = signal<RetentionState>({ status: 'idle' });
  readonly retentionState = this._retentionState.asReadonly();

  private readonly _nudgeState = signal<NudgeState>({ status: 'idle' });
  readonly nudgeState = this._nudgeState.asReadonly();

  // --- Computed ---
  readonly retentionScore = computed(() => {
    const s = this._retentionState();
    return s.status === 'success' ? s.data.retention_score : 0;
  });

  readonly atRiskAtoms = computed(() => {
    const s = this._retentionState();
    return s.status === 'success' ? s.data.at_risk_atoms : [];
  });

  readonly forgettingCurve = computed(() => {
    const s = this._retentionState();
    return s.status === 'success' ? s.data.forgetting_curve_data : [];
  });

  readonly nudge = computed(() => {
    const s = this._nudgeState();
    return s.status === 'success' ? s.data : null;
  });

  // ---------------------------------------------------------------------------
  // Load retention prediction (Agent #9 — Retention Predictor)
  // ---------------------------------------------------------------------------

  loadRetention(gcid: string): Observable<RetentionPrediction | null> {
    this._retentionState.set({ status: 'loading' });

    return this.bff.post<RetentionPrediction>(this.retentionPath, { gcid }).pipe(
      tap((data) => {
        this._retentionState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._retentionState.set({
          status: 'error',
          error: { code: 'RETENTION_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Load streak nudge (Agent #7 — Streak Nudger)
  // ---------------------------------------------------------------------------

  loadNudge(gcid: string): Observable<StreakNudge | null> {
    this._nudgeState.set({ status: 'loading' });

    return this.bff.post<StreakNudge>(this.nudgePath, { gcid }).pipe(
      tap((data) => {
        this._nudgeState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._nudgeState.set({
          status: 'error',
          error: { code: 'NUDGE_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetState(): void {
    this._retentionState.set({ status: 'idle' });
    this._nudgeState.set({ status: 'idle' });
  }
}
