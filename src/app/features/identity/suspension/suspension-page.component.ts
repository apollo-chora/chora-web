/**
 * SuspensionPageComponent — Full-page blocking view for suspended users.
 *
 * Route: /suspended (shown when a suspended user tries to access the app)
 *
 * Features:
 *   - Displays suspension reason, date, and duration/expiry
 *   - Real-time countdown timer for remaining suspension time
 *   - Appeal CTA and contact support links
 *   - Chora branding with no navigation chrome
 *   - Tablet-first centered card layout
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  effect,
  OnDestroy,
  DestroyRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';

// ---------------------------------------------------------------------------
// Component-specific types
// ---------------------------------------------------------------------------

export interface SuspensionInfo {
  reason: string;
  suspended_at: string;
  duration: string;
  expires_at: string | null;
}

export const SUSPENSION_REASON_DISPLAY: Record<string, string> = {
  policy_violation: 'identity.suspension.reason_policy_violation',
  suspicious_activity: 'identity.suspension.reason_suspicious_activity',
  payment_fraud: 'identity.suspension.reason_payment_fraud',
  harassment: 'identity.suspension.reason_harassment',
  content_abuse: 'identity.suspension.reason_content_abuse',
  other: 'identity.suspension.reason_other',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

@Component({
  selector: 'chora-suspension-page',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './suspension-page.component.html',
  styleUrl: './suspension-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspensionPageComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  // Public support mailbox for this build's org (CHO-2424). Was a
  // `mailto:support@chora.site` literal in the template, which a second org
  // would have shipped pointing at the first org's inbox.
  readonly supportMailto = `mailto:${environment.supportEmail}`;

  // --- Suspension info (read from auth context or injected) ---
  readonly suspensionInfo = signal<SuspensionInfo>({
    reason: 'policy_violation',
    suspended_at: new Date().toISOString(),
    duration: '30_days',
    expires_at: null,
  });

  // --- Countdown state ---
  readonly now = signal(Date.now());
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  // --- Computed ---
  readonly userDisplayName = computed(() => {
    const user = this.authService.user();
    return user?.displayName ?? '';
  });

  readonly reasonLabel = computed(() => {
    const reason = this.suspensionInfo().reason;
    return SUSPENSION_REASON_DISPLAY[reason] ?? 'identity.suspension.reason_other';
  });

  readonly suspendedDate = computed(() => {
    try {
      return new Date(this.suspensionInfo().suspended_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return this.suspensionInfo().suspended_at;
    }
  });

  readonly expiresAt = computed(() => {
    return this.suspensionInfo().expires_at;
  });

  readonly isPermanent = computed(() => {
    return this.suspensionInfo().duration === 'permanent' || !this.expiresAt();
  });

  readonly expiryDate = computed(() => {
    const expires = this.expiresAt();
    if (!expires) return null;
    try {
      return new Date(expires).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return expires;
    }
  });

  readonly remainingMs = computed(() => {
    const expires = this.expiresAt();
    if (!expires) return 0;
    const expiryTime = new Date(expires).getTime();
    const remaining = expiryTime - this.now();
    return remaining > 0 ? remaining : 0;
  });

  readonly countdown = computed(() => {
    const ms = this.remainingMs();
    if (ms <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }

    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return { days, hours, minutes, seconds };
  });

  readonly isExpired = computed(() => {
    if (this.isPermanent()) return false;
    return this.remainingMs() <= 0;
  });

  readonly durationLabel = computed(() => {
    const duration = this.suspensionInfo().duration;
    const labels: Record<string, string> = {
      '7_days': 'identity.suspension.duration_7_days',
      '30_days': 'identity.suspension.duration_30_days',
      '90_days': 'identity.suspension.duration_90_days',
      permanent: 'identity.suspension.duration_permanent',
    };
    return labels[duration] ?? 'identity.suspension.duration_unknown';
  });

  constructor() {
    // Start countdown timer via effect — updates every second
    effect(() => {
      // Read expires_at to establish the dependency
      const expires = this.expiresAt();
      if (expires && !this.isPermanent()) {
        this.startCountdown();
      } else {
        this.stopCountdown();
      }
    });

    this.destroyRef.onDestroy(() => {
      this.stopCountdown();
    });
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  // -------------------------------------------------------------------------
  // Countdown management
  // -------------------------------------------------------------------------

  private startCountdown(): void {
    this.stopCountdown();
    this.now.set(Date.now());
    this.countdownTimer = setInterval(() => {
      this.now.set(Date.now());
    }, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  padNumber(value: number): string {
    return value.toString().padStart(2, '0');
  }
}
