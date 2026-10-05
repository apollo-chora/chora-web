/**
 * DashboardService — A+ multi-role dashboard provider (Phyllis demo Step 1b/6).
 *
 * Wired LIVE 2026-05-14 (fail-loud, no-debts directive): calls the real
 * BFF route
 *   GET /api/me/dashboard  → chora-gateway aggregator over
 *                            chora-consumption (learner courses + streak)
 *                            + chora-delivery (instructor courses)
 * The hardcoded `PHYLLIS_DASHBOARD` fixture has been DELETED — no stubs,
 * no synthesized data.
 *
 * Exposes a signal-backed discriminated union `state` (`DashboardState`:
 * loading / success / error) so the component renders a fail-loud banner
 * instead of hanging on the loading branch when the BFF returns 5xx. A
 * `partial: true` body is still a 200 — it resolves to `success` and the
 * component surfaces a non-blocking inline notice; it is NEVER an error.
 *
 * `load()` is idempotent — re-call it for the retry CTA. Per chora-web
 * CLAUDE.md §16 (Security) we never surface raw back-end error bodies;
 * the component translates an i18n key.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../../../core/services/bff-client.service';
import { LastActiveDayService } from '../../../../core/familiar/last-active-day.service';
import type { DashboardState, DashboardSummary } from './dashboard.model';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly bff = inject(BffClientService);
  /**
   * The streak block is the only server surface the browser can reach that
   * carries the learner's last-active day, and the companion's mood is the A+
   * home's warmth carrier (UX Track U package B5). Seeding it from here is what
   * stops the mood resetting to "just arrived" on every reload. A plain signal
   * holder, so injecting it costs no fetch and no construction side effect.
   */
  private readonly lastActiveDay = inject(LastActiveDayService);

  private readonly _state = signal<DashboardState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  /** Convenience selector: the summary when success, else `null`. */
  readonly summary = computed<DashboardSummary | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.summary : null;
  });

  /**
   * Fetch the dashboard summary and publish to `state`. Called by the
   * component constructor + by the retry CTA. Safe to call repeatedly.
   */
  load(): void {
    this._state.set({ status: 'loading' });
    this.bff
      .get<DashboardSummary>('/api/me/dashboard')
      .pipe(
        take(1),
        map(
          (summary): DashboardState => ({
            status: 'success',
            summary,
          }),
        ),
        catchError((err: unknown) =>
          of<DashboardState>({
            status: 'error',
            error: this.errorKey(err),
          }),
        ),
      )
      .subscribe((s) => {
        this._state.set(s);
        if (s.status === 'success') {
          // Absent on a degraded upstream. seed() ignores that rather than
          // fabricating a day: unknown must stay unknown.
          this.lastActiveDay.seed(s.summary.streak?.last_completion_at);
        }
      });
  }

  private errorKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status >= 500) return 'aplus.dashboard.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.dashboard.error_unauthorised';
      }
    }
    return 'aplus.dashboard.error_generic';
  }
}
