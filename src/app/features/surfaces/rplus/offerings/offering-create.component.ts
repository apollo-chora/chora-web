/**
 * OfferingCreateComponent — the `/r/offerings/new` create flow (R+ W2.D).
 *
 * "New offering" → pick the `delivery_type` ONCE (an attribute on a new object,
 * not a global mode switch — plan §2 #2), choose one or more courses (offering→
 * course is 1:N), name it, set capacity → POST /api/v1/offerings (`course_ids`)
 * → land in the new offering's workspace.
 *
 * Admin-gated by VISIBILITY (ADR-141): non-admins see an access-denied panel,
 * never the form (fail-closed; the backend also 403s the POST). The course
 * checkbox list is populated from REAL published courses (`listCourses`) — no
 * mock picker, no fabricated options (feedback_no_stubs_real_wiring); its
 * loading / empty / error states are all honest. A 400 (validation) surfaces a
 * loud banner + field errors; the draft is preserved so the author can fix +
 * retry.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RbacService } from '../../../../core/services/rbac.service';
import {
  OfferingsService,
  type OfferingCourseOption,
} from './offerings.service';
import { type OfferingDeliveryType } from './offerings.model';

/** Selectable delivery modes (exam is a separate BC — out of scope here). */
const DELIVERY_TYPES: readonly OfferingDeliveryType[] = ['graduate', 'short', 'async'];

/** Roles that may create an offering — mirrors the backend hasOfferingAdminRole. */
const OFFERING_ADMIN_ROLES = ['instructor', 'admin', 'training_admin', 'tenant_admin'] as const;

/** Discriminated load state for the course `<select>` options. */
type CoursesState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly courses: readonly OfferingCourseOption[] }
  | { readonly status: 'error' };

@Component({
  selector: 'chora-rplus-offering-create',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './offering-create.component.html',
  styleUrl: './offering-create.component.scss',
})
export class OfferingCreateComponent {
  private readonly service = inject(OfferingsService);
  private readonly rbac = inject(RbacService);
  private readonly router = inject(Router);

  readonly deliveryTypes = DELIVERY_TYPES;

  // ── Form fields (component-local writable signals) ─────────────────────
  readonly deliveryType = signal<OfferingDeliveryType | null>(null);
  /** Selected courses (1:N). Offering→course is many; ≥1 required. */
  readonly selectedCourseIds = signal<readonly string[]>([]);
  readonly label = signal<string>('');
  readonly capacity = signal<number>(0);

  // ── Submission + course-load state ─────────────────────────────────────
  readonly submitting = signal<boolean>(false);
  readonly submitError = signal<string | null>(null);
  /** `true` once a submit was attempted — gates inline field-error display. */
  readonly attempted = signal<boolean>(false);
  private readonly coursesStateSignal = signal<CoursesState>({ status: 'loading' });
  private coursesRequested = false;

  // ── Access gate ────────────────────────────────────────────────────────
  readonly canManage = computed<boolean>(() =>
    OFFERING_ADMIN_ROLES.some((role) => this.rbac.hasRole(role)),
  );

  // ── Course-select projections ──────────────────────────────────────────
  readonly isCoursesLoading = computed<boolean>(
    () => this.coursesStateSignal().status === 'loading',
  );
  readonly isCoursesError = computed<boolean>(() => this.coursesStateSignal().status === 'error');
  readonly courses = computed<readonly OfferingCourseOption[]>(() => {
    const s = this.coursesStateSignal();
    return s.status === 'success' ? s.courses : [];
  });
  readonly hasNoCourses = computed<boolean>(
    () => this.coursesStateSignal().status === 'success' && this.courses().length === 0,
  );

  // ── Selection projections ──────────────────────────────────────────────
  readonly selectedCount = computed<number>(() => this.selectedCourseIds().length);

  // ── Field validity ─────────────────────────────────────────────────────
  readonly labelValid = computed<boolean>(() => this.label().trim().length > 0);
  /** Valid once at least one course is selected (1:N — pick one or more). */
  readonly courseValid = computed<boolean>(() => this.selectedCourseIds().length > 0);
  readonly deliveryValid = computed<boolean>(() => this.deliveryType() !== null);
  readonly capacityValid = computed<boolean>(() => {
    const c = this.capacity();
    return Number.isInteger(c) && c >= 0;
  });
  readonly formValid = computed<boolean>(
    () =>
      this.deliveryValid() && this.courseValid() && this.labelValid() && this.capacityValid(),
  );

  constructor() {
    // Load the real published-course list once admin status is known. Non-
    // admins never trigger the fetch (they only see the access-denied panel).
    effect(() => {
      if (this.canManage() && !this.coursesRequested) {
        this.coursesRequested = true;
        this.loadCourses();
      }
    });
  }

  // ── Field event handlers (typed; no ngModel, OnPush-friendly) ──────────
  selectDeliveryType(value: OfferingDeliveryType): void {
    this.deliveryType.set(value);
  }

  /** Whether `id` is currently selected (checkbox `[checked]` + row state). */
  isCourseSelected(id: string): boolean {
    return this.selectedCourseIds().includes(id);
  }

  /**
   * Add/remove `id` from the selection immutably (OnPush-safe). Insertion order
   * is preserved so the POSTed `course_ids` reflect the click order — the first
   * picked course becomes the BE-side primary.
   */
  toggleCourse(id: string): void {
    this.selectedCourseIds.update((ids) =>
      ids.includes(id) ? ids.filter((existing) => existing !== id) : [...ids, id],
    );
  }

  onLabelInput(event: Event): void {
    this.label.set((event.target as HTMLInputElement).value);
  }

  onCapacityInput(event: Event): void {
    // A number input yields a valid numeric string or '' (→ 0). Any non-integer
    // / negative / out-of-range value is caught by `capacityValid` and shown as
    // an inline field error rather than silently coerced.
    this.capacity.set(Number((event.target as HTMLInputElement).value));
  }

  /** Retry the course-list fetch after an error. */
  retryCourses(): void {
    this.loadCourses();
  }

  /**
   * Native form-submit handler. This form is signal-driven (NO FormsModule /
   * ngModel), so it binds the native `(submit)` event rather than NgForm's
   * `(ngSubmit)` — we must `preventDefault()` to stop the browser navigating.
   * Fires on the submit-button click AND on Enter within any field.
   */
  onSubmit(event: Event): void {
    event.preventDefault();
    this.submit();
  }

  /**
   * Validate + POST. On 201 navigate to the new workspace; on 4xx/5xx surface
   * the BE message in a loud banner without clearing the draft. Fail-closed for
   * non-admins (the panel hides the form, but guard here too).
   */
  submit(): void {
    this.attempted.set(true);
    if (!this.canManage() || this.submitting() || !this.formValid()) {
      return;
    }
    const deliveryType = this.deliveryType();
    if (deliveryType === null) {
      return;
    }
    this.submitting.set(true);
    this.submitError.set(null);
    this.service
      .createOffering({
        courseIds: [...this.selectedCourseIds()],
        deliveryType,
        label: this.label().trim(),
        capacity: this.capacity(),
      })
      .subscribe({
        next: (offering) => {
          this.submitting.set(false);
          void this.router.navigate(['/r/offerings', offering.id]);
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.submitError.set(extractErrorMessage(err));
        },
      });
  }

  private loadCourses(): void {
    this.coursesStateSignal.set({ status: 'loading' });
    this.service.listCourses().subscribe({
      next: (courses) => this.coursesStateSignal.set({ status: 'success', courses }),
      error: () => this.coursesStateSignal.set({ status: 'error' }),
    });
  }
}

/**
 * Pull a human-readable message out of an HttpErrorResponse-shaped value for
 * the loud submit banner. The chora-delivery envelope is `{ error: "..." }`;
 * fall back through nested / top-level shapes to a generic message.
 */
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { error?: unknown; message?: unknown };
    if (e.error && typeof e.error === 'object') {
      const inner = e.error as { error?: unknown; message?: unknown };
      if (typeof inner.error === 'string' && inner.error.length > 0) {
        return inner.error;
      }
      if (typeof inner.message === 'string' && inner.message.length > 0) {
        return inner.message;
      }
    }
    if (typeof e.error === 'string' && e.error.length > 0) {
      return e.error;
    }
    if (typeof e.message === 'string' && e.message.length > 0) {
      return e.message;
    }
  }
  return 'Request failed';
}
