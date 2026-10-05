/**
 * LastActiveDayService: the learner's last-active DAY, as the server knows it.
 *
 * Why a holder rather than a method on ActiveFamiliarService (UX Track U
 * package B5): the fact and the fetcher have different owners. The only server
 * surface the browser can reach for this is `streak.last_completion_at` on
 * `GET /api/me/dashboard`, which DashboardService already fetches, while the
 * consumer is the companion mood in ActiveFamiliarService. Wiring those two
 * services to each other would drag ActiveFamiliarService's bootstrap roster
 * fetch into every DashboardService test, and would make a shared read-model
 * fact look like a dependency. A signal holder with no I/O is the honest shape.
 *
 * ⚠ THIS IS A DAY BUCKET, NEVER A MOMENT. chora-consumption normalises
 * `Streak.LastActivityAt` to UTC midnight (companion/streak.go), so the value
 * proves only that activity happened somewhere inside that UTC day. Any
 * consumer reasoning on an hour scale must measure from the LAST possible
 * moment in the bucket, or it will fire for a learner whose local morning falls
 * in the previous UTC day.
 */
import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LastActiveDayService {
  private readonly _day = signal<number | null>(null);

  /** Epoch ms of the last-active UTC day bucket, or null when unknown. */
  readonly day = this._day.asReadonly();

  /**
   * Seeds the bucket from a server ISO-8601 stamp. Absent or unparseable input
   * is ignored (the mood stays honestly unknown rather than pinned to the
   * epoch), and the bucket only ever moves forward, so a stale second response
   * cannot un-know a newer one.
   */
  seed(iso: string | null | undefined): void {
    if (!iso) return;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return;
    const cur = this._day();
    if (cur !== null && t <= cur) return;
    this._day.set(t);
  }
}
