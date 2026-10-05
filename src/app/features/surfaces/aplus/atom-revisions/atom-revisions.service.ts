/**
 * AtomRevisionsService — A+ atom revision timeline BFF wrapper (WS-7).
 *
 * Calls `GET /api/atoms/{atomId}/revisions` → chora-gateway → chora-creation
 * `GET /atoms/{atomId}/revisions` (contracted in creation-admin.yaml
 * §listAtomRevisions).
 *
 * BE WIRING STATUS (2026-05-26): The chora-gateway gatewayproxy.go does NOT
 * yet expose this route (no ListAtomRevisions handler). The service calls the
 * expected path and surfaces the 404/502 GATEWAY_ROUTE_NOT_FOUND honestly
 * via the fail-loud AsyncState error branch. No mock fallback (per memory
 * feedback_no_stubs_real_wiring). FE BE ask WS-7-BE-A1 is the follow-up.
 *
 * AtomRevision is append-only per ddd-enforcement.md invariant #4.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  AtomRevisionListState,
  AtomRevisionPage,
} from './models';

@Injectable({ providedIn: 'root' })
export class AtomRevisionsService {
  private readonly bff = inject(BffClientService);

  // ── Revision list state ──────────────────────────────────────────────
  private readonly _state = signal<AtomRevisionListState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  /** Convenience selector: the page when success, else `null`. */
  readonly page = computed<AtomRevisionPage | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.page : null;
  });

  /** Convenience selector: revisions array (most recent first) when success. */
  readonly revisions = computed(() => this.page()?.revisions ?? []);

  /**
   * Fetch the revision list for `atomId`. Idempotent — safe to call on init
   * and retry. Revisions are returned most-recent first (descending
   * revision_number) per the backend list contract.
   *
   * Fail loud: any 4xx/5xx surfaces via `state.status === 'error'` with an
   * explicit i18n key. No silent fallback; no mock data.
   */
  load(atomId: string): void {
    this._state.set({ status: 'loading' });
    this.bff
      .get<AtomRevisionPage>('/api/atoms/' + encodeURIComponent(atomId) + '/revisions')
      .pipe(
        take(1),
        map(
          (page): AtomRevisionListState => ({
            status: 'success',
            page,
          }),
        ),
        catchError((err: unknown) =>
          of<AtomRevisionListState>({
            status: 'error',
            error: this.errorKey(err),
          }),
        ),
      )
      .subscribe((s) => this._state.set(s));
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 404) return 'aplus.atom_revisions.error_not_found';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.atom_revisions.error_unauthorised';
      }
      if (e.status >= 500) return 'aplus.atom_revisions.error_upstream';
    }
    // GATEWAY_ROUTE_NOT_FOUND — endpoint not yet wired in chora-gateway.
    return 'aplus.atom_revisions.error_generic';
  }
}
