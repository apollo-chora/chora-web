/**
 * MeTranscriptService — A+ per-learner transcript view (W6 outcome spine).
 *
 * Sole HTTP surface for the learner-side `GET /api/v1/me/transcript` read
 * (chora-consumption `StudentTranscript` projection, proxied by chora-gateway).
 * Self-scoped: the caller's GCID is derived server-side from the request
 * context, so the client sends no identity in the query. Real wiring only —
 * no stubs, no fixtures. All calls go through `BffClientService`.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { httpErrorView } from '../../../../core/interceptors/api-error.model';
import type {
  MeTranscriptState,
  TranscriptEntry,
  TranscriptListResponse,
} from './me-transcript.model';
import { mapTranscriptList } from './me-transcript.model';

@Injectable({ providedIn: 'root' })
export class MeTranscriptService {
  private readonly bff = inject(BffClientService);

  // ── State (GET /api/v1/me/transcript) ────────────────────────────────
  private readonly _state = signal<MeTranscriptState>({ status: 'loading' });
  readonly state = this._state.asReadonly();
  readonly items = computed<readonly TranscriptEntry[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.items : [];
  });

  private path(): string {
    return '/api/v1/me/transcript';
  }

  /**
   * Fetch the caller's transcript, newest-first. `limit` caps the row count
   * (BE default 50); omitted ⇒ no `limit` query param. Mapping preserves the
   * BE ordering — no client re-sort.
   */
  loadTranscript(limit?: number): void {
    this._state.set({ status: 'loading' });

    let params = new HttpParams();
    if (limit !== undefined && limit !== null) {
      params = params.set('limit', String(limit));
    }

    this.bff
      .get<TranscriptListResponse>(this.path(), params)
      .pipe(
        take(1),
        map(
          (resp): MeTranscriptState => ({
            status: 'success',
            items: mapTranscriptList(resp),
          }),
        ),
        catchError((err: unknown) =>
          of<MeTranscriptState>({
            status: 'error',
            error: this.errorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._state.set(s));
  }

  /**
   * Classify a failure to a translated error key. Reads the status off the
   * normalised `httpErrorView` (ApiError carries the raw body on `.body`,
   * HttpErrorResponse on `.error` — the view unifies both so a re-thrown
   * ApiError classifies correctly at runtime, not just in specs).
   */
  private errorKey(err: unknown): string {
    const status = httpErrorView(err)?.status;
    if (typeof status === 'number') {
      if (status === 401 || status === 403) {
        return 'aplus.me_transcript.list.error_unauthorised';
      }
      if (status >= 500) {
        return 'aplus.me_transcript.list.error_upstream';
      }
    }
    return 'aplus.me_transcript.list.error_generic';
  }
}
