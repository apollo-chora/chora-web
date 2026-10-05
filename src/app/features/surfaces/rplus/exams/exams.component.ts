/**
 * ExamsComponent — R+ /r/exams Exam Administration surface.
 *
 * Renders the upcoming SkillsFuture exam sittings for the current tenant
 * (READ) and drives the real schedule (create) flow against chora-delivery
 * via ExamsService (BFF-wired — no fixtures, no fakes, fail-loud per
 * feedback_no_stubs_real_wiring).
 *
 *   - Schedule Sitting CTA opens an inline form (course id + title +
 *     scheduled-at + duration + capacity + proctor method). Submit POSTs
 *     /api/v1/exams via service.schedule(); on success the list refetches
 *     and the form closes; on error the HTTP status + message surface in a
 *     `role="alert"` panel (never swallowed).
 *   - The list is a reloadKey-driven refetch (toObservable → switchMap), so a
 *     successful schedule re-reads the canonical server state (NOT an
 *     optimistic local mutation). A bare toSignal(service.list()) would only
 *     subscribe once — the reloadKey pipeline fixes that latent gap.
 *
 * Surface: R+ Rhythm+ — amber accent. Tablet-first (≥768px primary,
 * ≥1280px desktop enhanced).
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
  toSignal,
} from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ExamsService } from './exams.service';
import {
  ExamSitting,
  PROCTOR_METHOD_OPTIONS,
  ProctorMethod,
  SittingStatus,
  capacityPercent,
  proctorMethodKey,
  statusBadge,
} from './exams.model';

interface SittingRow extends ExamSitting {
  readonly capacityPct: number;
}

@Component({
  selector: 'chora-rplus-exams',
  imports: [TranslatePipe, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exams.component.html',
  styleUrl: './exams.component.scss',
})
export class ExamsComponent {
  private readonly examsService = inject(ExamsService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Refetch trigger. Incrementing it re-runs `service.getUpcomingSittings()`
   * via the toObservable → switchMap pipeline below, so a successful schedule
   * reflects the canonical server state.
   */
  private readonly reloadKey = signal(0);

  private readonly data = toSignal(
    toObservable(this.reloadKey).pipe(
      switchMap(() => this.examsService.getUpcomingSittings()),
    ),
    { initialValue: null },
  );

  readonly totalSittings = computed<number>(
    () => this.data()?.totalSittings ?? 0,
  );

  readonly sittings = computed<readonly SittingRow[]>(() => {
    const list = this.data()?.sittings ?? [];
    return list.map((s) => ({
      ...s,
      capacityPct: capacityPercent(s.registered, s.capacity),
    }));
  });

  // --- Schedule form state (signal-first) ------------------------------------
  /** Ordered proctor-method options the select renders. */
  readonly proctorMethodOptions = PROCTOR_METHOD_OPTIONS;
  readonly formOpen = signal(false);
  readonly formCourseId = signal('');
  readonly formTitle = signal('');
  readonly formScheduledAt = signal('');
  readonly formDurationMinutes = signal('');
  readonly formCapacity = signal('');
  readonly formProctorMethod = signal<ProctorMethod>('PROCTOR_METHOD_AUTO_AI');
  readonly submitting = signal(false);
  readonly scheduleError = signal<string | null>(null);

  /**
   * Submit gate: course id + title + scheduled-at present, duration + capacity
   * parse to a positive integer (mirrors the BE NewExam guards), and not
   * mid-flight.
   */
  readonly canSubmit = computed<boolean>(
    () =>
      this.formCourseId().trim().length > 0 &&
      this.formTitle().trim().length > 0 &&
      this.formScheduledAt().trim().length > 0 &&
      parsePositiveInt(this.formDurationMinutes()) !== null &&
      parsePositiveInt(this.formCapacity()) !== null &&
      !this.submitting(),
  );

  badge(status: SittingStatus): string {
    return statusBadge(status);
  }

  proctorKey(method: ProctorMethod): string {
    return proctorMethodKey(method);
  }

  /** Open the schedule form. */
  onScheduleClicked(): void {
    this.scheduleError.set(null);
    this.formOpen.set(true);
  }

  /** Close + reset the schedule form. */
  onCancelSchedule(): void {
    this.formOpen.set(false);
    this.scheduleError.set(null);
    this.formCourseId.set('');
    this.formTitle.set('');
    this.formScheduledAt.set('');
    this.formDurationMinutes.set('');
    this.formCapacity.set('');
    this.formProctorMethod.set('PROCTOR_METHOD_AUTO_AI');
  }

  /**
   * Schedule the sitting. Real POST /api/v1/exams via service.schedule();
   * on success refetch + close, on failure surface the status loud.
   *
   * The form's datetime-local value (`YYYY-MM-DDTHH:mm`, local wall-clock) is
   * widened to a full RFC3339 UTC timestamp before it reaches the wire so the
   * BE's time.Time decoder accepts it. We guard the parse here and fail loud
   * rather than POST a zero time.
   */
  onScheduleSubmit(): void {
    if (!this.canSubmit()) return;
    const durationMinutes = parsePositiveInt(this.formDurationMinutes());
    const capacity = parsePositiveInt(this.formCapacity());
    const scheduledAt = toRfc3339(this.formScheduledAt());
    if (durationMinutes === null || capacity === null || scheduledAt === null) {
      this.scheduleError.set('Invalid form input');
      return;
    }
    this.submitting.set(true);
    this.scheduleError.set(null);
    this.examsService
      .schedule({
        courseId: this.formCourseId().trim(),
        title: this.formTitle().trim(),
        scheduledAt,
        durationMinutes,
        capacity,
        proctorMethod: this.formProctorMethod(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.onCancelSchedule();
          this.reloadKey.update((n) => n + 1);
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.scheduleError.set(describeHttpError(err));
        },
      });
  }
}

/**
 * Parse a string to a positive integer, or null when it is empty, non-numeric,
 * or <= 0. Mirrors the BE NewExam guards (duration_minutes > 0, capacity > 0).
 */
function parsePositiveInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Widen a datetime-local form value (`YYYY-MM-DDTHH:mm`) to a full RFC3339 UTC
 * timestamp the BE's time.Time decoder accepts. Returns null on empty / invalid
 * input so the caller fails loud rather than POSTing a zero time.
 */
function toRfc3339(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** Render an HTTP error as a "<status> — <message>" string for the alert panel. */
function describeHttpError(err: HttpErrorResponse): string {
  const status = err.status ?? 0;
  const body = err.error as { message?: string; error?: string } | string | null;
  let message = err.message || 'Request failed';
  if (body && typeof body === 'object') {
    message = body.message ?? body.error ?? message;
  } else if (typeof body === 'string' && body.trim()) {
    message = body;
  }
  return status ? `${status}: ${message}` : message;
}
