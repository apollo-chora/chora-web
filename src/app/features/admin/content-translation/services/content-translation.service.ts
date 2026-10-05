/**
 * ContentTranslationService — REST adapter for the CMS translation agent.
 *
 * Source of truth: chora-contracts/openapi/cms.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SupportedLanguage = 'en' | 'zh-CN' | 'ms-MY' | 'ta-IN';

export interface TranslationRequest {
  content_id: string;
  source_language: SupportedLanguage;
  target_language: SupportedLanguage;
}

export interface TranslationResponse {
  content_id: string;
  source_language: SupportedLanguage;
  target_language: SupportedLanguage;
  translated_content: string;
  confidence: number;
  word_count: number;
  governance: Record<string, unknown>;
}

export interface BatchTranslationRequest {
  content_ids: string[];
  source_language: SupportedLanguage;
  target_language: SupportedLanguage;
}

export type BatchJobStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

export interface BatchTranslationResult {
  content_id: string;
  status: BatchJobStatus;
  translated_content?: string;
  confidence?: number;
  error?: string;
}

export interface BatchTranslationResponse {
  job_id: string;
  status: BatchJobStatus;
  results: BatchTranslationResult[];
}

export type TranslationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: TranslationResponse }
  | { status: 'error'; error: { code: string; message: string } };

export type BatchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: BatchTranslationResponse }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Endpoint Paths
// ---------------------------------------------------------------------------

const TRANSLATE_PATH = '/api/v1/cms/agents/translate';
const BATCH_TRANSLATE_PATH = '/api/v1/cms/agents/translate/batch';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUPPORTED_LANGUAGES: { code: SupportedLanguage; label: string }[] = [
  { code: 'en', label: 'admin.translation.lang_en' },
  { code: 'zh-CN', label: 'admin.translation.lang_zh_cn' },
  { code: 'ms-MY', label: 'admin.translation.lang_ms_my' },
  { code: 'ta-IN', label: 'admin.translation.lang_ta_in' },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class ContentTranslationService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _translationState = signal<TranslationState>({ status: 'idle' });
  readonly translationState = this._translationState.asReadonly();

  private readonly _batchState = signal<BatchState>({ status: 'idle' });
  readonly batchState = this._batchState.asReadonly();

  // --- Computed ---
  readonly translationResult = computed(() => {
    const s = this._translationState();
    return s.status === 'success' ? s.data : null;
  });

  readonly batchResult = computed(() => {
    const s = this._batchState();
    return s.status === 'success' ? s.data : null;
  });

  // ---------------------------------------------------------------------------
  // Translate
  // ---------------------------------------------------------------------------

  translate(request: TranslationRequest): Observable<TranslationResponse | null> {
    this._translationState.set({ status: 'loading' });

    return this.bff.post<TranslationResponse>(TRANSLATE_PATH, request).pipe(
      tap((data) => {
        this._translationState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._translationState.set({
          status: 'error',
          error: { code: 'TRANSLATION_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Batch Translate
  // ---------------------------------------------------------------------------

  batchTranslate(request: BatchTranslationRequest): Observable<BatchTranslationResponse | null> {
    this._batchState.set({ status: 'loading' });

    return this.bff.post<BatchTranslationResponse>(BATCH_TRANSLATE_PATH, request).pipe(
      tap((data) => {
        this._batchState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._batchState.set({
          status: 'error',
          error: { code: 'BATCH_TRANSLATION_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  resetTranslation(): void {
    this._translationState.set({ status: 'idle' });
  }

  resetBatch(): void {
    this._batchState.set({ status: 'idle' });
  }
}
