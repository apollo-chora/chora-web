/**
 * CourseEnrolmentSuccessComponent — A+ post-Stripe-Checkout landing
 * page at /a/courses/:courseId/enrolled?session_id=cs_...
 *
 * Stripe's Checkout success_url redirects the browser here after a
 * successful card charge. The BE's webhook handler (asynchronous —
 * Stripe → chora-billing-webhook → chora-delivery via Pub/Sub event)
 * creates the Enrolment row a few seconds AFTER the redirect lands;
 * this page polls `GET /api/v1/me/enrolments?course_id=…` with
 * exponential backoff until the enrolment appears (capped at ~30s),
 * then surfaces the success confirmation + "Start learning" CTA.
 *
 * Exponential backoff: start 500ms, doubles each attempt, capped at 8s,
 * max 12 attempts (~30s total window).
 *
 * Per `feedback_no_stubs_real_wiring` — real polling against the BFF,
 * not a synthetic delay. Per chora-web CLAUDE.md §3 — BFF-only.
 * On final timeout: fail-loud with explicit "contact support" message.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BffClientService } from '../../../../core/services/bff-client.service';

interface Enrolment {
  readonly enrolment_id: string;
  readonly course_id: string;
  readonly state: string;
  readonly created_at: string;
}

interface MeEnrolmentsResponse {
  readonly items: readonly Enrolment[];
}

type LoadState =
  | { status: 'polling'; tickIndex: number; progressPct: number }
  | { status: 'success'; enrolment: Enrolment }
  | { status: 'timeout' }
  | { status: 'error'; error: string };

/** Exponential backoff config — start 500ms, max 8s, max 12 attempts (~30s). */
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 8_000;
const MAX_POLL_ATTEMPTS = 12;

/** Returns the delay (ms) for a given zero-based attempt index. */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_MAX_MS);
}

@Component({
  selector: 'chora-aplus-course-enrolment-success',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './course-enrolment-success.component.html',
  styleUrl: './course-enrolment-success.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseEnrolmentSuccessComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly bff = inject(BffClientService);
  private readonly destroyRef = inject(DestroyRef);

  readonly courseId = this.route.snapshot.paramMap.get('courseId') ?? '';
  readonly sessionId = this.route.snapshot.queryParamMap.get('session_id') ?? '';

  private readonly _state = signal<LoadState>({
    status: 'polling',
    tickIndex: 0,
    progressPct: 0,
  });
  readonly state = this._state.asReadonly();

  readonly isPolling = computed(() => this._state().status === 'polling');
  readonly isSuccess = computed(() => this._state().status === 'success');
  readonly isTimeout = computed(() => this._state().status === 'timeout');
  readonly isError = computed(() => this._state().status === 'error');

  readonly attempts = computed<number>(() => {
    const s = this._state();
    return s.status === 'polling' ? s.tickIndex + 1 : MAX_POLL_ATTEMPTS;
  });

  readonly progressPct = computed<number>(() => {
    const s = this._state();
    return s.status === 'polling' ? s.progressPct : 0;
  });

  readonly errorKey = computed<string>(() => {
    const s = this._state();
    return s.status === 'error' ? s.error : '';
  });

  /** Estimated seconds remaining (decreases as polling progresses). */
  readonly etaSeconds = computed<number>(() => {
    const s = this._state();
    if (s.status !== 'polling') return 0;
    const remaining = MAX_POLL_ATTEMPTS - s.tickIndex;
    // Rough: each remaining step averages ~2.5s given the backoff curve.
    return Math.max(1, Math.round(remaining * 2.5));
  });

  private timeoutId?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  ngOnInit(): void {
    if (!this.courseId) {
      this._state.set({
        status: 'error',
        error: 'aplus.course_enrolment_success.error_missing_course',
      });
      return;
    }
    if (!this.sessionId) {
      this._state.set({
        status: 'error',
        error: 'aplus.course_enrolment_success.error_missing_session',
      });
      return;
    }
    // Destroy hook so we can cancel any pending setTimeout on component
    // teardown without leaking into the next test's zone.
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.timeoutId);
    });
    this.schedulePoll(0);
  }

  retry(): void {
    clearTimeout(this.timeoutId);
    this.destroyed = false;
    this._state.set({ status: 'polling', tickIndex: 0, progressPct: 0 });
    this.schedulePoll(0);
  }

  /**
   * Schedule the next poll with exponential backoff.
   * @param attempt Zero-based attempt index; controls delay and progress %.
   */
  schedulePoll(attempt: number): void {
    const delay = attempt === 0 ? 0 : backoffDelay(attempt - 1);
    this.timeoutId = setTimeout(() => {
      if (this.destroyed) return;
      this.poll(attempt);
    }, delay);
  }

  private poll(attempt: number): void {
    const progressPct = Math.round((attempt / MAX_POLL_ATTEMPTS) * 100);
    this._state.set({ status: 'polling', tickIndex: attempt, progressPct });

    this.bff
      .get<MeEnrolmentsResponse>(
        '/api/v1/me/enrolments?course_id=' + encodeURIComponent(this.courseId),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const match = res.items.find((e) => e.course_id === this.courseId);
          if (match) {
            this._state.set({ status: 'success', enrolment: match });
            // Navigate to the learn shell with the learning-path context
            // (BFF will bootstrap the LearningPath asynchronously; course-learn
            // component polls until it's ready — same pattern).
            void this.router.navigate(['/a/courses', this.courseId, 'learn']);
            return;
          }
          // Enrolment row not yet visible — schedule next poll if budget remains.
          this.continueOrTimeout(attempt);
        },
        error: (err: unknown) => {
          const e = err as { status?: number };
          // Auth errors are unrecoverable — fail loud immediately.
          if (e?.status === 401 || e?.status === 403) {
            this._state.set({
              status: 'error',
              error: 'aplus.course_enrolment_success.error_unauthorised',
            });
            return;
          }
          // Transient 5xx / network — keep polling within the attempt budget.
          this.continueOrTimeout(attempt);
        },
      });
  }

  private continueOrTimeout(attempt: number): void {
    if (attempt + 1 >= MAX_POLL_ATTEMPTS) {
      // Budget exhausted — fail loud with explicit "contact support" message.
      this._state.set({ status: 'timeout' });
      return;
    }
    this.schedulePoll(attempt + 1);
  }
}
