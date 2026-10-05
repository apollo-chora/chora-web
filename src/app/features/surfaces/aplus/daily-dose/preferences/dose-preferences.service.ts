/**
 * DosePreferencesService — per-KG (per-map) daily-dose include/exclude store
 * (CHO-2045 / ADR-224). Wired LIVE to the gateway BFF (BffClientService is the
 * sole HTTP adapter):
 *   GET /api/v1/me/dose-preferences → { excludedMapIds }  (sparse — only exclusions)
 *   PUT /api/v1/me/dose-preferences { mapId, included }    (set one map's state)
 *
 * The excluded set is a signal the roster composes with the maps Atlas. `setIncluded`
 * is OPTIMISTIC — it flips the local set immediately for a snappy toggle, then reverts
 * on a PUT error (fail-loud: the caller surfaces the error, never fabricates success).
 */
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, take, throwError } from 'rxjs';

import { BffClientService } from '../../../../../core/services/bff-client.service';
import type {
  DosePreferenceUpdate,
  DosePreferencesResponse,
} from './dose-preferences.model';

@Injectable({ providedIn: 'root' })
export class DosePreferencesService {
  private readonly bff = inject(BffClientService);
  private static readonly BASE = '/api/v1/me/dose-preferences';

  /** The set of map ids the learner has EXCLUDED from their dose (default: none). */
  private readonly _excluded = signal<ReadonlySet<string>>(new Set<string>());
  readonly excluded = this._excluded.asReadonly();

  private readonly _status = signal<'loading' | 'success' | 'error'>('loading');
  readonly status = this._status.asReadonly();

  /** GET the excluded set and publish to `excluded`. Idempotent (refresh / retry). */
  load(): void {
    this._status.set('loading');
    this.bff
      .get<DosePreferencesResponse>(DosePreferencesService.BASE)
      .pipe(take(1))
      .subscribe({
        next: (res) => {
          this._excluded.set(new Set(res.excludedMapIds ?? []));
          this._status.set('success');
        },
        error: () => this._status.set('error'),
      });
  }

  /**
   * Set one map's include/exclude state. OPTIMISTIC: the local excluded set is
   * updated immediately so the toggle feels instant; a PUT failure reverts it and
   * re-throws so the caller renders an inline error (never a fabricated success).
   */
  setIncluded(goalId: string, included: boolean): Observable<void> {
    const prev = this._excluded();
    const next = new Set(prev);
    if (included) {
      next.delete(goalId);
    } else {
      next.add(goalId);
    }
    this._excluded.set(next);

    const body: DosePreferenceUpdate = { mapId: goalId, included };
    return this.bff.put<DosePreferenceUpdate>(DosePreferencesService.BASE, body).pipe(
      take(1),
      map(() => undefined),
      catchError((err) => {
        this._excluded.set(prev); // revert the optimistic flip
        return throwError(() => err);
      }),
    );
  }
}
