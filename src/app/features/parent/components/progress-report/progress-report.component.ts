/**
 * ProgressReportComponent — Consent-gated academic progress with atom completion stats.
 *
 * Route: /parent/progress/:learnerId
 *
 * Features:
 *   - Aggregated learner progress (atoms, streaks, XP, paths, score)
 *   - Privacy-filtered dashboard (never raw answers)
 *   - Consent-gated: 403 when no active guardian link
 *   - Last activity timestamp
 *   - Empty state for no data / consent denied
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  input,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ParentService } from '../../services/parent.service';

@Component({
  selector: 'chora-progress-report',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './progress-report.component.html',
  styleUrl: './progress-report.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressReportComponent implements OnInit, OnDestroy {
  private readonly parentService = inject(ParentService);

  // --- Route params ---
  readonly learnerId = input.required<string>();

  // --- State ---
  readonly dashboardState = this.parentService.dashboardState;
  readonly dashboard = this.parentService.dashboard;

  // --- Computed ---
  readonly isConsentDenied = computed(() => {
    const state = this.dashboardState();
    if (state.status !== 'error') return false;
    return state.error.code === 'DASHBOARD_LOAD_FAILED';
  });

  readonly streakPercentage = computed(() => {
    const d = this.dashboard();
    if (!d || d.longest_streak_days === 0) return 0;
    return Math.round((d.current_streak_days / d.longest_streak_days) * 100);
  });

  readonly scoreColor = computed(() => {
    const d = this.dashboard();
    if (!d) return '';
    if (d.average_score_pct >= 80) return 'progress-report__score--high';
    if (d.average_score_pct >= 60) return 'progress-report__score--medium';
    return 'progress-report__score--low';
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.parentService.loadDashboard(this.learnerId()).subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  formatDate(isoString: string | null): string {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  formatDateTime(isoString: string | null): string {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  formatScore(pct: number): string {
    return `${pct.toFixed(1)}%`;
  }
}
