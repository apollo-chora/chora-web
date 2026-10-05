import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ErrorMessageMapperService } from '../../../core/services/error-message-mapper.service';

/**
 * Standalone error display component with retry support.
 *
 * For retryable errors, shows a countdown timer with exponential backoff
 * and a retry button. For non-retryable errors, shows a "Contact Support"
 * link instead.
 *
 * Uses the ErrorMessageMapperService to resolve user-friendly i18n messages.
 *
 * Usage:
 * ```html
 * <chora-error-retry
 *   [errorCode]="'GATEWAY_SERVICE_UNAVAILABLE'"
 *   [retryable]="true"
 *   (retryClicked)="onRetry()" />
 * ```
 */
@Component({
  selector: 'chora-error-retry',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './error-retry.component.html',
  styleUrls: ['./error-retry.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorRetryComponent {
  private readonly mapper = inject(ErrorMessageMapperService);

  /** The error code from the backend (e.g., "GATEWAY_SERVICE_UNAVAILABLE"). */
  readonly errorCode = input.required<string>();

  /** Whether this error is retryable. Overrides the mapper if provided. */
  readonly retryable = input<boolean | undefined>(undefined);

  /** Emitted when the user clicks retry. */
  readonly retryClicked = output<void>();

  /** Current retry attempt number (starts at 0). */
  readonly retryAttempt = signal(0);

  /** Whether a countdown is currently active. */
  readonly countdownActive = signal(false);

  /** Seconds remaining in the countdown. */
  readonly countdownSeconds = signal(0);

  /** Resolved i18n key for the error message. */
  readonly messageKey = computed(() => this.mapper.mapErrorCode(this.errorCode()));

  /** Whether this error supports retry (from input or mapper). */
  readonly isRetryable = computed(() => {
    const inputVal = this.retryable();
    if (inputVal !== undefined) {
      return inputVal;
    }
    return this.mapper.isRetryable(this.errorCode());
  });

  /** Backoff delay in seconds for the current attempt. */
  readonly backoffDelay = computed(() => {
    const attempt = this.retryAttempt();
    // Exponential backoff: 2^attempt seconds, capped at 60.
    return Math.min(Math.pow(2, attempt), 60);
  });

  private countdownTimerId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Clean up timer on error code change.
    effect(() => {
      // Read the signal to track it.
      this.errorCode();
      this.clearCountdown();
      this.retryAttempt.set(0);
    });
  }

  /** Initiates a retry with exponential backoff countdown. */
  onRetry(): void {
    if (this.countdownActive()) {
      return;
    }

    const delay = this.backoffDelay();
    this.countdownSeconds.set(delay);
    this.countdownActive.set(true);

    this.countdownTimerId = setInterval(() => {
      const remaining = this.countdownSeconds() - 1;
      if (remaining <= 0) {
        this.clearCountdown();
        this.retryAttempt.update((n) => n + 1);
        this.retryClicked.emit();
      } else {
        this.countdownSeconds.set(remaining);
      }
    }, 1000);
  }

  /** Resets retry state. Can be called externally after a successful retry. */
  reset(): void {
    this.clearCountdown();
    this.retryAttempt.set(0);
  }

  private clearCountdown(): void {
    if (this.countdownTimerId !== null) {
      clearInterval(this.countdownTimerId);
      this.countdownTimerId = null;
    }
    this.countdownActive.set(false);
    this.countdownSeconds.set(0);
  }
}
