import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { TranslateService } from '../../../core/services/translate.service';

/** Auto-dismiss delay for the celebration toast, in milliseconds. */
const AUTO_DISMISS_MS = 6000;

/** i18n key for the celebration body (carries the {goalLabel} placeholder). */
const BODY_KEY = 'aplus.dashboard.goal.graduated_celebration_body';

/**
 * GoalGraduatedCelebrationComponent — celebratory toast announcing that a
 * learner-owned Goal has reached the "achieved" milestone (ADR-204 §3 Goal
 * graduation, CHO-1962; the BE flips Goal.status → 'achieved' when every
 * concept in the goal is mastered). Purely presentational: it auto-dismisses
 * after a short delay, also offers a manual close button, and emits `dismissed`
 * so the host can tear it down.
 *
 * Usage:
 *   <chora-goal-graduated-celebration
 *     [goalLabel]="graduatedGoalLabel()"
 *     (dismissed)="onGoalGraduationDismissed()" />
 */
@Component({
  selector: 'chora-goal-graduated-celebration',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './goal-graduated-celebration.component.html',
  styleUrl: './goal-graduated-celebration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoalGraduatedCelebrationComponent {
  /** Human-readable label of the Goal that just graduated. */
  readonly goalLabel = input.required<string>();

  /** Emitted once when the toast is dismissed — auto-timeout or manual click. */
  readonly dismissed = output<void>();

  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private hasEmitted = false;

  /**
   * Celebration body with the goal label interpolated into the i18n template
   * (mirrors the goal-progress-ring aria interpolation). Falls back to the raw
   * key when translations are unloaded (the key carries no PII).
   */
  readonly bodyText = computed<string>(() =>
    this.translate.instant(BODY_KEY).replace('{goalLabel}', this.goalLabel()),
  );

  constructor() {
    this.autoDismissTimer = setTimeout(() => this.dismiss(), AUTO_DISMISS_MS);
    this.destroyRef.onDestroy(() => this.clearTimer());
  }

  /** Dismiss the toast, emitting `dismissed` at most once. */
  dismiss(): void {
    if (this.hasEmitted) {
      return;
    }
    this.hasEmitted = true;
    this.clearTimer();
    this.dismissed.emit();
  }

  private clearTimer(): void {
    if (this.autoDismissTimer !== null) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
  }
}
