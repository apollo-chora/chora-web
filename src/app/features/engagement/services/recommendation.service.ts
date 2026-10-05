import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Response models
// ---------------------------------------------------------------------------

export interface RecommendedAtom {
  atom_id: string;
  score: number;
  reason: string;
  topic_name: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export interface RecommendationResponse {
  recommendations: RecommendedAtom[];
  governance: Record<string, unknown>;
}

export interface CuratedDailyDoseAtom {
  atom_id: string;
  title: string;
  topic_name: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  estimated_seconds: number;
  source: 'ebbinghaus' | 'curiosity' | 'weakness';
}

export interface CuratedDailyDoseResponse {
  atoms: CuratedDailyDoseAtom[];
  curation_rationale: string;
  governance: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

export type RecommendationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: RecommendationResponse }
  | { status: 'error'; error: { code: string; message: string } };

export type CuratedDoseState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: CuratedDailyDoseResponse }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class RecommendationService {
  private readonly bff = inject(BffClientService);
  private readonly recommendPath = '/api/v1/engagement/agents/recommend';
  private readonly curatePath = '/api/v1/engagement/agents/daily-dose/curate';

  // --- State ---
  private readonly _recommendationState = signal<RecommendationState>({ status: 'idle' });
  readonly recommendationState = this._recommendationState.asReadonly();

  private readonly _curatedDoseState = signal<CuratedDoseState>({ status: 'idle' });
  readonly curatedDoseState = this._curatedDoseState.asReadonly();

  // --- Computed ---
  readonly recommendations = computed(() => {
    const s = this._recommendationState();
    return s.status === 'success' ? s.data.recommendations : [];
  });

  readonly curatedAtoms = computed(() => {
    const s = this._curatedDoseState();
    return s.status === 'success' ? s.data.atoms : [];
  });

  readonly curationRationale = computed(() => {
    const s = this._curatedDoseState();
    return s.status === 'success' ? s.data.curation_rationale : '';
  });

  // ---------------------------------------------------------------------------
  // Load personalized recommendations (Agent #5 — Atom Recommender)
  // ---------------------------------------------------------------------------

  loadRecommendations(
    gcid: string,
    topicIds?: string[],
    limit?: number,
  ): Observable<RecommendationResponse | null> {
    this._recommendationState.set({ status: 'loading' });

    const body: Record<string, unknown> = { gcid };
    if (topicIds && topicIds.length > 0) {
      body['topic_ids'] = topicIds;
    }
    if (limit !== undefined) {
      body['limit'] = limit;
    }

    return this.bff.post<RecommendationResponse>(this.recommendPath, body).pipe(
      tap((data) => {
        this._recommendationState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._recommendationState.set({
          status: 'error',
          error: { code: 'RECOMMENDATION_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Load AI-curated daily dose (Agent #6 — Daily Dose Curator)
  // ---------------------------------------------------------------------------

  loadCuratedDailyDose(
    gcid: string,
    limit?: number,
  ): Observable<CuratedDailyDoseResponse | null> {
    this._curatedDoseState.set({ status: 'loading' });

    const body: Record<string, unknown> = { gcid };
    if (limit !== undefined) {
      body['limit'] = limit;
    }

    return this.bff.post<CuratedDailyDoseResponse>(this.curatePath, body).pipe(
      tap((data) => {
        this._curatedDoseState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._curatedDoseState.set({
          status: 'error',
          error: { code: 'CURATED_DOSE_LOAD_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // State reset
  // ---------------------------------------------------------------------------

  resetState(): void {
    this._recommendationState.set({ status: 'idle' });
    this._curatedDoseState.set({ status: 'idle' });
  }
}
