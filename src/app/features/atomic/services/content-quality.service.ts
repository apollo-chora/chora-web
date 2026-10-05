import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BloomsLevel =
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate'
  | 'create';

export type ReviewStatus = 'reviewed' | 'pending_review' | 'needs_revision';

export interface GovernanceInfo {
  model_id: string;
  agent_id: string;
  timestamp: string;
}

export interface DifficultyScoreResponse {
  atom_id: string;
  difficulty_score: number;
  confidence: number;
  reasoning: string;
  governance: GovernanceInfo;
}

export interface ContentAnalysisResponse {
  atom_id: string;
  taxonomy_tags: string[];
  blooms_level: BloomsLevel;
  readability_score: number;
  quality_score: number;
  estimated_minutes: number;
  suggestions: string[];
  governance: GovernanceInfo;
}

export interface ContentQualityData {
  difficulty_score: number | null;
  difficulty_confidence: number | null;
  quality_score: number | null;
  blooms_level: BloomsLevel | null;
  readability_score: number | null;
  review_status: ReviewStatus;
  review_confidence: number | null;
}

export type ContentQualityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: ContentQualityData }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class ContentQualityService {
  private readonly bff = inject(BffClientService);

  private readonly _qualityState = signal<ContentQualityState>({ status: 'idle' });
  readonly qualityState = this._qualityState.asReadonly();

  // ---------------------------------------------------------------------------
  // Difficulty scoring
  // ---------------------------------------------------------------------------

  scoreDifficulty(atomId: string, content: Record<string, unknown>): Observable<DifficultyScoreResponse | null> {
    return this.bff.post<DifficultyScoreResponse>(
      '/api/v1/atomic/agents/difficulty/score',
      { atom_id: atomId, content },
    ).pipe(
      catchError((err: Error) => {
        console.error('ContentQualityService: difficulty scoring failed', err.message);
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Content analysis
  // ---------------------------------------------------------------------------

  analyzeContent(atomId: string, content: Record<string, unknown>): Observable<ContentAnalysisResponse | null> {
    return this.bff.post<ContentAnalysisResponse>(
      '/api/v1/atomic/agents/content/analyze',
      { atom_id: atomId, content },
    ).pipe(
      catchError((err: Error) => {
        console.error('ContentQualityService: content analysis failed', err.message);
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Fetch combined quality data for an atom
  // ---------------------------------------------------------------------------

  loadQualityData(atomId: string, content: Record<string, unknown>): void {
    this._qualityState.set({ status: 'loading' });

    // Fire both requests in parallel and merge results
    let difficultyResult: DifficultyScoreResponse | null = null;
    let analysisResult: ContentAnalysisResponse | null = null;
    let completed = 0;

    const mergeAndEmit = (): void => {
      completed++;
      if (completed < 2) return;

      if (!difficultyResult && !analysisResult) {
        this._qualityState.set({
          status: 'error',
          error: { code: 'QUALITY_LOAD_FAILED', message: 'Both quality requests failed' },
        });
        return;
      }

      const data: ContentQualityData = {
        difficulty_score: difficultyResult?.difficulty_score ?? null,
        difficulty_confidence: difficultyResult?.confidence ?? null,
        quality_score: analysisResult?.quality_score ?? null,
        blooms_level: analysisResult?.blooms_level ?? null,
        readability_score: analysisResult?.readability_score ?? null,
        review_status: this.deriveReviewStatus(analysisResult),
        review_confidence: analysisResult ? analysisResult.quality_score : null,
      };

      this._qualityState.set({ status: 'success', data });
    };

    this.scoreDifficulty(atomId, content).subscribe((res) => {
      difficultyResult = res;
      mergeAndEmit();
    });

    this.analyzeContent(atomId, content).subscribe((res) => {
      analysisResult = res;
      mergeAndEmit();
    });
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  resetState(): void {
    this._qualityState.set({ status: 'idle' });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private deriveReviewStatus(analysis: ContentAnalysisResponse | null): ReviewStatus {
    if (!analysis) return 'pending_review';
    if (analysis.quality_score >= 0.7) return 'reviewed';
    if (analysis.quality_score >= 0.4) return 'pending_review';
    return 'needs_revision';
  }
}
