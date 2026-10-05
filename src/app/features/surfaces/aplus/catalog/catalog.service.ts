/**
 * CatalogService — A+ public catalog provider (Phyllis demo Step 5).
 *
 * Wired LIVE 2026-05-14 (fail-loud, no-debts directive): calls the real
 * BFF route
 *   GET /api/catalog?public=true
 * which fans out to chora-delivery's public catalog. The wave-2 in-memory
 * fixture (`PUBLIC_CATALOG_FIXTURE`) has been DELETED — no stubs, no
 * synthesized data.
 *
 * Exposes a signal-backed `CatalogState` discriminated union
 * (loading / success / error) so the component renders a fail-loud
 * banner instead of hanging on the loading branch when the BFF returns
 * 5xx. `load()` is idempotent — re-call it for the retry CTA. Per
 * chora-web CLAUDE.md §16 (Security) we never surface raw back-end error
 * bodies; the component translates an i18n key.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  CatalogCourse,
  CatalogResponse,
  CatalogState,
} from './catalog.model';

/** Options for `load()` — CR2-C2 pagination + server-side search. */
interface CatalogLoadOpts {
  /** Keyword search passed to the server as `q`. */
  q?: string;
  /** Page size passed as `first` (Relay-cursor convention). */
  first?: number;
  /** Cursor for the next page (Relay `after`). */
  after?: string;
  /** When true, concatenates new items onto the existing list. */
  append?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly bff = inject(BffClientService);

  private readonly _state = signal<CatalogState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  // ── Pagination state (CR2-C2) ────────────────────────────────────────
  private readonly _hasNextPage = signal<boolean>(false);
  readonly hasNextPage = this._hasNextPage.asReadonly();

  private readonly _endCursor = signal<string | null>(null);
  readonly endCursor = this._endCursor.asReadonly();

  /** Convenience selector: the course list when success, else `[]`. */
  readonly courses = computed<readonly CatalogCourse[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.courses : [];
  });

  /**
   * Fetch the public catalog and publish to `state`. Called by the
   * component constructor + by the retry CTA. Accepts optional pagination
   * and search opts per CR2-C2.
   */
  load(opts?: CatalogLoadOpts): void {
    if (!opts?.append) {
      this._state.set({ status: 'loading' });
    }

    // Build optional params; `public=true` is kept in the URL string for
    // backward compat with existing tests that check req.request.url.
    let params = new HttpParams();
    if (opts?.q) {
      params = params.set('q', opts.q);
    }
    if (opts?.first !== undefined) {
      params = params.set('first', String(opts.first));
    }
    if (opts?.after) {
      params = params.set('after', opts.after);
    }

    const currentState = this._state();
    const existingCourses: readonly CatalogCourse[] =
      opts?.append && currentState.status === 'success' ? currentState.courses : [];

    this.bff
      .get<CatalogResponse>('/api/catalog?public=true', params)
      .pipe(take(1))
      .subscribe({
        next: (res) => {
          this._hasNextPage.set(res.page_info?.has_next_page ?? false);
          this._endCursor.set(res.page_info?.end_cursor ?? null);
          this._state.set({
            status: 'success',
            courses: [...existingCourses, ...res.items],
          });
        },
        error: (err: unknown) => {
          this._hasNextPage.set(false);
          this._endCursor.set(null);
          this._state.set({ status: 'error', error: this.errorKey(err) });
        },
      });
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status >= 500) return 'aplus.catalog.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.catalog.error_unauthorised';
      }
    }
    return 'aplus.catalog.error_generic';
  }
}
