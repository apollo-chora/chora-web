/**
 * QrAttendanceComponent — QR code display with 30s auto-refresh token,
 * late marking detection indicator, and manual roster override with audit log.
 *
 * Shared component used by Training and Campus features.
 * No route — embedded in other components.
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { Subscription, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Domain Models
// ---------------------------------------------------------------------------

interface QrToken {
  token: string;
  qr_data_url: string;
  expires_at: string;
  session_id: string;
}

interface AttendeeEntry {
  gcid: string;
  display_name: string;
  checked_in_at: string;
  is_late: boolean;
  is_manual: boolean;
}

interface ManualOverrideEntry {
  gcid: string;
  overridden_by: string;
  reason: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Endpoint paths
// ---------------------------------------------------------------------------

const QR_PATH = '/api/v1/attendance/qr';

@Component({
  selector: 'chora-qr-attendance',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './qr-attendance.component.html',
  styleUrl: './qr-attendance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QrAttendanceComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);

  /** The session or event ID to generate QR codes for */
  readonly sessionId = input.required<string>();

  /** Whether to show manual override controls (admin view) */
  readonly showOverride = input(false);

  /** Emitted when attendance changes */
  readonly attendanceChanged = output<number>();

  // --- State ---
  readonly qrToken = signal<QrToken | null>(null);
  readonly attendees = signal<AttendeeEntry[]>([]);
  readonly auditLog = signal<ManualOverrideEntry[]>([]);
  readonly isLoading = signal(false);
  readonly overrideGcid = signal('');
  readonly overrideReason = signal('');
  readonly isOverriding = signal(false);
  readonly showAuditLog = signal(false);

  readonly attendeeCount = computed(() => this.attendees().length);
  readonly lateCount = computed(
    () => this.attendees().filter((a) => a.is_late).length,
  );
  readonly secondsUntilRefresh = signal(30);

  readonly hasQr = computed(() => this.qrToken() !== null);

  readonly canOverride = computed(
    () =>
      this.overrideGcid().trim().length > 0 &&
      this.overrideReason().trim().length > 0 &&
      !this.isOverriding(),
  );

  private subscriptions = new Subscription();
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.generateToken();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  manualOverride(): void {
    if (!this.canOverride()) return;

    this.isOverriding.set(true);

    this.subscriptions.add(
      this.bff
        .post<AttendeeEntry>(
          `${QR_PATH}/${encodeURIComponent(this.sessionId())}/override`,
          {
            gcid: this.overrideGcid().trim(),
            reason: this.overrideReason().trim(),
          },
        )
        .pipe(
          tap((entry) => {
            if (entry) {
              this.attendees.update((list) => [...list, entry]);
              this.attendanceChanged.emit(this.attendeeCount());
              this.overrideGcid.set('');
              this.overrideReason.set('');
            }
            this.isOverriding.set(false);
          }),
          catchError(() => {
            this.isOverriding.set(false);
            return of(null);
          }),
        )
        .subscribe(),
    );
  }

  toggleAuditLog(): void {
    this.showAuditLog.update((v) => !v);
    if (this.showAuditLog() && this.auditLog().length === 0) {
      this.loadAuditLog();
    }
  }

  formatTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  private generateToken(): void {
    this.isLoading.set(true);

    this.subscriptions.add(
      this.bff
        .post<QrToken>(
          `${QR_PATH}/${encodeURIComponent(this.sessionId())}/generate`,
          {},
        )
        .pipe(
          tap((token) => {
            this.qrToken.set(token);
            this.isLoading.set(false);
            this.secondsUntilRefresh.set(30);
          }),
          catchError(() => {
            this.isLoading.set(false);
            return of(null);
          }),
        )
        .subscribe(),
    );
  }

  private startAutoRefresh(): void {
    // Countdown timer (every 1s)
    this.refreshInterval = setInterval(() => {
      this.secondsUntilRefresh.update((s) => {
        if (s <= 1) {
          this.generateToken();
          this.refreshAttendees();
          return 30;
        }
        return s - 1;
      });
    }, 1000);
  }

  private refreshAttendees(): void {
    this.subscriptions.add(
      this.bff
        .get<{ data: AttendeeEntry[] }>(
          `${QR_PATH}/${encodeURIComponent(this.sessionId())}/attendees`,
        )
        .pipe(
          tap((res) => {
            this.attendees.set(res.data ?? []);
            this.attendanceChanged.emit(this.attendeeCount());
          }),
          catchError(() => of(null)),
        )
        .subscribe(),
    );
  }

  private loadAuditLog(): void {
    this.subscriptions.add(
      this.bff
        .get<{ data: ManualOverrideEntry[] }>(
          `${QR_PATH}/${encodeURIComponent(this.sessionId())}/audit`,
        )
        .pipe(
          tap((res) => this.auditLog.set(res.data ?? [])),
          catchError(() => of(null)),
        )
        .subscribe(),
    );
  }
}
