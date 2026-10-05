/**
 * YieldsStripComponent - the A+ top-bar yields (UX Track U, plan section 3.1).
 *
 * Streak and mana, from reads that already exist. Rendered on A+ only.
 *
 * NO XP PILL. Orchestrator ruling Q2: the SPA has no XP-today read model at
 * all. The only xp on the wire is `LearnerCourseSummary.xpEarned`, which is
 * per-course CUMULATIVE, so summing it would be an invented number, and a
 * permanently dashed pill in the top bar of every A+ screen is noise rather
 * than honesty. The pill joins when the XP wave lands.
 *
 * Both pills distinguish a value from an absence. `MeManaService.balanceUnits`
 * resolves `?? 0`, so rendering it alone would show "0 mana" to a learner whose
 * read merely failed: an empty count and an unread one are different facts, and
 * only `loadState` can tell them apart.
 *
 * This component is also the GLOBAL loader for the dashboard read. B5 left that
 * wire open: `DashboardService` only loaded on `/a/dashboard`, so the streak,
 * and the companion mood it seeds through `LastActiveDayService`, stayed blank
 * on every other A+ screen. Top-bar chrome mounts once per session, which makes
 * it the right place to close it.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import { MeManaService } from '../../../../core/services/me-mana.service';
import { DashboardService } from '../../../../features/surfaces/aplus/dashboard/dashboard.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

/** What a pill can honestly say. */
export type YieldState = 'ready' | 'loading' | 'unread';

@Component({
  selector: 'chora-yields-strip',
  imports: [TranslatePipe],
  templateUrl: './yields-strip.component.html',
  styleUrl: './yields-strip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YieldsStripComponent {
  private readonly dashboard = inject(DashboardService);
  private readonly manaSvc = inject(MeManaService);

  /** `loading` while the first read is in flight, `unread` when it failed. */
  readonly streakState = computed<YieldState>(() => {
    const s = this.dashboard.state();
    if (s.status === 'error') return 'unread';
    if (s.status === 'loading') return 'loading';
    return 'ready';
  });

  /**
   * Days in the current streak, or `null` when there is nothing honest to say.
   * The structured block wins; `currentStreakDays` is the legacy fallback for a
   * degraded upstream that omits it.
   */
  readonly streakDays = computed<number | null>(() => {
    const s = this.dashboard.state();
    if (s.status !== 'success') return null;
    return s.summary.streak?.current_streak_days ?? s.summary.currentStreakDays;
  });

  /**
   * Mirrors the dashboard's own `manaDisplay`: a stale-while-revalidate reload
   * keeps showing the last known balance rather than blanking the pill, so
   * `loading` is only claimed while nothing has ever been read.
   */
  readonly manaState = computed<YieldState>(() => {
    const s = this.manaSvc.loadState();
    if (s.status === 'error') return 'unread';
    if (s.status === 'loading' && this.manaSvc.mana() === null) return 'loading';
    return 'ready';
  });

  /** Balance units, or `null` when the read has nothing to report. */
  readonly manaUnits = computed<number | null>(() =>
    this.manaState() === 'ready' ? this.manaSvc.balanceUnits() : null,
  );

  constructor() {
    this.dashboard.load();
    this.manaSvc.load();
  }
}
