/**
 * BookingsComponent - R+ /r/bookings surface (Content Delivery).
 *
 * Training-admin class-booking console. Mirrors the rostering / certifications
 * R+ verticals: glass-panel header with a tenant pill + count, a create form,
 * and a session-tracked list of bookings with a per-row status control.
 *
 * The screen hydrates its booking list from GET /api/bookings on init
 * (CHO-1622 - tenant-scoped, pg-backed, durable) and keeps it live by
 * prepending create() results + patching status rows in place. Every list /
 * create / status PATCH is a real BFF round-trip (no fixtures, per
 * feedback_no_stubs_real_wiring); failures surface a fail-loud banner.
 *
 * CHO-2336 - the create form no longer takes two raw free-text UUIDs. It now
 * composes two pickers so a trainer never hand-types an id:
 *   - a CLASS dropdown sourced from BookingsService.listBookableClasses()
 *     (the durable ScheduledClass list); the picked option id is the class_id.
 *   - the SHARED `chora-member-multiselect` (the same checklist the offering
 *     roster bulk-enrol uses), capped to ONE learner; the ticked gcid is the
 *     learner_gcid. The shared checklist reads its selection only at init, so a
 *     successful create re-mounts it (nonce bump) to clear the ticks.
 *
 * Surface: R+ Rhythm+ - amber accent (`#b45309` / `#ea580c`).
 * Tablet-first: ≥768px primary, ≥1280px desktop enhanced.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { MemberMultiselectComponent } from '../../../../shared/components/member-multiselect/member-multiselect.component';
import { BookingsService } from './bookings.service';
import {
  type Booking,
  type BookingStatus,
  type ClassOption,
  BOOKING_STATUSES,
  statusBadgeVariant,
  statusIcon,
  statusLabelKey,
} from './bookings.model';

@Component({
  selector: 'chora-rplus-bookings',
  imports: [TranslatePipe, FormsModule, NgTemplateOutlet, MemberMultiselectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bookings.component.html',
  styleUrl: './bookings.component.scss',
})
export class BookingsComponent {
  private readonly service = inject(BookingsService);
  private readonly tenants = inject(TenantContextService);

  /** Allowed lifecycle statuses for the per-row <select>. */
  readonly statuses: readonly BookingStatus[] = BOOKING_STATUSES;

  // ── Create-form state (CHO-2336 pickers) ────────────────────────────────
  /** Class id resolved from the class-picker dropdown (the backend `class_id`). */
  readonly selectedClassId = signal<string>('');
  /** Learner GCID resolved from the member checklist (the backend `learner_gcid`). */
  readonly selectedLearnerGcid = signal<string>('');
  /**
   * Bump-to-remount nonce for the reused member checklist. The shared
   * `chora-member-multiselect` reads its initial selection only at init and
   * exposes no reset, so a successful create increments this; the template
   * switches on its parity, swapping the rendered case and re-mounting a fresh
   * (empty) checklist rather than leaving a stale tick behind.
   */
  readonly learnerPickerNonce = signal<number>(0);

  // ── Class-picker options + load state ───────────────────────────────────
  private readonly classes = signal<readonly ClassOption[]>([]);
  readonly classOptions = computed<readonly ClassOption[]>(() => this.classes());
  /**
   * Load lifecycle for the class-picker source (GET /v1/scheduling/classes via
   * listBookableClasses): 'loading' while in flight, 'loaded' on success,
   * 'error' on a fail-loud failure (the dropdown region then shows a retry).
   */
  readonly classLoadState = signal<'loading' | 'loaded' | 'error'>('loading');

  // ── List + async state ──────────────────────────────────────────────────
  /**
   * The screen's booking list - hydrated from GET /api/bookings on init
   * (CHO-1622), then kept live: prepended by create() and patched in place on
   * status updates.
   */
  private readonly bookings = signal<readonly Booking[]>([]);
  /** True while a create or status PATCH is in flight. */
  readonly busy = signal<boolean>(false);
  /**
   * List-hydration lifecycle for GET /api/bookings - drives the skeleton /
   * load-error / content switch in the list region (mirrors the R+ catalog
   * AsyncState treatment, J2 / CHO-1830): 'loading' on each (re)fetch,
   * 'loaded' on success, 'error' on a fail-loud load failure.
   */
  readonly loadState = signal<'loading' | 'loaded' | 'error'>('loading');
  /** Load-failure detail shown in the list-region retry banner (null when clear). */
  readonly loadError = signal<string | null>(null);
  /**
   * Fail-loud error message for a create / status-PATCH mutation (null when
   * clear). Distinct from `loadError`: a failed mutation keeps the existing
   * list visible with a dismissable banner, whereas a failed load replaces the
   * list with the retry banner.
   */
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.loadBookings();
    this.loadClasses();
  }

  /**
   * Hydrate the list from GET /api/bookings (CHO-1622). Shows the skeleton
   * state while in flight; on success swaps in the rows; on failure surfaces a
   * fail-loud retry banner in the list region (J2 / CHO-1830) - NEVER a silent
   * empty list.
   */
  loadBookings(): void {
    this.loadState.set('loading');
    this.loadError.set(null);
    this.service.list().subscribe({
      next: (rows) => {
        this.bookings.set(rows);
        this.loadState.set('loaded');
      },
      error: (err: unknown) => {
        this.loadError.set(this.describeError(err));
        this.loadState.set('error');
      },
    });
  }

  /**
   * Load the class-picker options from the durable ScheduledClass list
   * (CHO-2336). On failure the dropdown region shows a fail-loud retry rather
   * than a silently empty picker (which would read as "no classes").
   */
  loadClasses(): void {
    this.classLoadState.set('loading');
    this.service.listBookableClasses().subscribe({
      next: (options) => {
        this.classes.set(options);
        this.classLoadState.set('loaded');
      },
      error: () => {
        this.classes.set([]);
        this.classLoadState.set('error');
      },
    });
  }

  readonly tenantName = computed<string>(
    () => this.tenants.currentTenant()?.name ?? 'Current tenant',
  );
  readonly items = computed<readonly Booking[]>(() => this.bookings());
  readonly totalBookings = computed<number>(() => this.bookings().length);

  /** True when the class picker has options to offer. */
  readonly hasClasses = computed<boolean>(() => this.classes().length > 0);

  /** The create CTA is disabled until a class AND a learner are both picked. */
  readonly canCreate = computed<boolean>(
    () =>
      !this.busy() &&
      this.selectedClassId().length > 0 &&
      this.selectedLearnerGcid().length > 0,
  );

  badge(status: BookingStatus): string {
    return statusBadgeVariant(status);
  }

  icon(status: BookingStatus): string {
    return statusIcon(status);
  }

  labelKey(status: BookingStatus): string {
    return statusLabelKey(status);
  }

  /**
   * Handle a selection change from the reused member checklist. The picker is
   * capped to one learner, so the resolved `learner_gcid` is the single ticked
   * gcid (or empty when the last tick is cleared).
   */
  onLearnerSelectionChange(gcids: readonly string[]): void {
    this.selectedLearnerGcid.set(gcids[0] ?? '');
  }

  /**
   * Submit the create form. POSTs /api/bookings with the resolved
   * `{ class_id, learner_gcid }` and prepends the created booking to the
   * session list. Resets both pickers on success (re-mounting the checklist via
   * the nonce); surfaces a fail-loud banner on a backend rejection (404 unknown
   * class / 409 at capacity) while preserving the picks for retry.
   */
  onCreate(): void {
    if (!this.canCreate()) {
      return;
    }
    const classId = this.selectedClassId();
    const learnerGcid = this.selectedLearnerGcid();
    this.busy.set(true);
    this.errorMessage.set(null);
    this.service.create({ classId, learnerGcid }).subscribe({
      next: (booking) => {
        this.bookings.update((rows) => [booking, ...rows]);
        this.resetForm();
        this.busy.set(false);
      },
      error: (err: unknown) => {
        this.errorMessage.set(this.describeError(err));
        this.busy.set(false);
      },
    });
  }

  /** Clear both pickers after a successful create (re-mounts the checklist). */
  private resetForm(): void {
    this.selectedClassId.set('');
    this.selectedLearnerGcid.set('');
    this.learnerPickerNonce.update((n) => n + 1);
  }

  /**
   * Transition a booking to a new status. PATCHes /api/bookings/{id}/status
   * and replaces the row in place with the backend's authoritative result.
   * A no-op (same status) is ignored so the <select> change event doesn't
   * fire a redundant round-trip.
   */
  onStatusChange(booking: Booking, next: BookingStatus): void {
    if (next === booking.status || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorMessage.set(null);
    this.service.updateStatus(booking.id, next).subscribe({
      next: (updated) => {
        this.bookings.update((rows) =>
          rows.map((r) => (r.id === updated.id ? updated : r)),
        );
        this.busy.set(false);
      },
      error: (err: unknown) => {
        this.errorMessage.set(this.describeError(err));
        this.busy.set(false);
      },
    });
  }

  /** Dismiss the fail-loud mutation banner. */
  dismissError(): void {
    this.errorMessage.set(null);
  }

  /** Re-fetch the booking list after a load error (fail-loud retry). */
  onRetry(): void {
    this.loadBookings();
  }

  /** Re-fetch the class-picker options after a load error (fail-loud retry). */
  onRetryClasses(): void {
    this.loadClasses();
  }

  private describeError(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'status' in err) {
      const status = (err as { status: number }).status;
      if (status === 404) {
        return 'Class not found for this tenant.';
      }
      if (status === 409) {
        return 'Booking rejected: class is at capacity or the status transition is not allowed.';
      }
      return `Booking request failed (HTTP ${status}).`;
    }
    return 'Booking request failed. Please retry.';
  }
}
