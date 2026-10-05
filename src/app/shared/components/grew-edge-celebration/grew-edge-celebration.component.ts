import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

/** Auto-dismiss delay for the celebration toast, in milliseconds. */
const AUTO_DISMISS_MS = 6000;

/**
 * GrewEdgeCelebrationComponent — celebratory toast announcing that a learner's
 * Growth Edge has reached the "grown" milestone (ADR-196 reward spine; closes
 * the upload → practice → grow evidence loop, CHO-1895). Purely presentational:
 * it auto-dismisses after a short delay, also offers a manual close button, and
 * emits `dismissed` so the host can tear it down.
 *
 * Usage:
 *   <chora-grew-edge-celebration
 *     [conceptLabel]="grownConcept()"
 *     [extraCount]="otherGrownCount()"
 *     (dismissed)="onCelebrationDismissed()" />
 */
@Component({
  selector: 'chora-grew-edge-celebration',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './grew-edge-celebration.component.html',
  styleUrl: './grew-edge-celebration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GrewEdgeCelebrationComponent {
  /** Human-readable label of the concept whose edge just grew. */
  readonly conceptLabel = input.required<string>();
  /** How many OTHER edges grew at the same time (0 hides the "+N more" line). */
  readonly extraCount = input<number>(0);

  /** Emitted once when the toast is dismissed — auto-timeout or manual click. */
  readonly dismissed = output<void>();

  private readonly destroyRef = inject(DestroyRef);
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private hasEmitted = false;

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
