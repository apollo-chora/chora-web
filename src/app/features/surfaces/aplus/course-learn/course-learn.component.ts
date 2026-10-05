/**
 * CourseLearnComponent — A+ course-learn shell at
 *   /a/courses/:courseId/learn
 *
 * Post-enrolment landing page. The chora-consumption LearningPath
 * bootstrap subscriber listens for `chora.delivery.enrollment.created.v1`
 * and materialises a Straight-Up LearningPath with the course's atoms in
 * order. That round-trip is eventual (5-15s typical, up to ~30s under
 * cold-start) — this page polls
 *   GET /api/v1/me/learning-paths?course_id={courseId}
 * with exponential backoff until the path appears, then renders the atom
 * list with per-atom state derived from `current_index`.
 *
 * Exponential backoff: start 500ms, doubles each attempt, capped at 8s,
 * max 12 attempts (~30s total window). Mirrors course-enrolment-success.
 *
 * Per [[feedback-no-stubs-real-wiring]] + chora-web CLAUDE.md §3 — real
 * BFF polling, no synthetic delays, fail-loud on unrecoverable errors.
 * On final timeout: explicit "Learning path bootstrap timed out — contact
 * support" wording (no silent fallback).
 *
 * State machine:
 *   - polling      (default; 404 retried up to MAX_POLL_ATTEMPTS)
 *   - ready        (200 hydrated detail)
 *   - not_enrolled (404 the entire window — fail-loud banner)
 *   - timeout      (transient 5xx never resolved — contact support)
 *   - error        (401/403 or contract drift)
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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { CourseLearnService } from './course-learn.service';
import { CourseCurriculumComponent } from './course-curriculum/course-curriculum.component';
import type {
  CourseLearnAtom,
  CourseLearnLoadState,
  CourseLearnResponse,
} from './course-learn.model';

/** Exponential backoff config — start 500ms, max 8s, max 12 attempts (~30s). */
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 8_000;
const MAX_POLL_ATTEMPTS = 12;

/** Returns the delay (ms) for a given zero-based attempt index. */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_MAX_MS);
}

@Component({
  selector: 'chora-aplus-course-learn',
  standalone: true,
  imports: [RouterLink, TranslatePipe, CourseCurriculumComponent],
  templateUrl: './course-learn.component.html',
  styleUrl: './course-learn.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseLearnComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly learnService = inject(CourseLearnService);
  private readonly destroyRef = inject(DestroyRef);

  readonly courseId = this.route.snapshot.paramMap.get('courseId') ?? '';

  private readonly _state = signal<CourseLearnLoadState>({
    status: 'polling',
    tickIndex: 0,
  });
  readonly state = this._state.asReadonly();

  readonly isPolling = computed(() => this._state().status === 'polling');
  readonly isReady = computed(() => this._state().status === 'ready');
  readonly isProvisioning = computed(
    () => this._state().status === 'provisioning',
  );
  readonly isNotEnrolled = computed(
    () => this._state().status === 'not_enrolled',
  );
  readonly isTimeout = computed(() => this._state().status === 'timeout');
  readonly isError = computed(() => this._state().status === 'error');

  readonly attempts = computed<number>(() => {
    const s = this._state();
    return s.status === 'polling' ? s.tickIndex + 1 : MAX_POLL_ATTEMPTS;
  });

  readonly errorKey = computed<string>(() => {
    const s = this._state();
    return s.status === 'error' ? s.error : '';
  });

  /** Hydrated path detail when status === 'ready'; null otherwise. */
  readonly path = computed<CourseLearnResponse | null>(() => {
    const s = this._state();
    return s.status === 'ready' ? s.data : null;
  });

  /** Completion percentage (0-100, integer). Null when not ready. */
  readonly completionPct = computed<number | null>(() => {
    const p = this.path();
    if (!p || p.total_atoms <= 0) return null;
    return Math.round((p.completed_atoms / p.total_atoms) * 100);
  });

  /**
   * Authoritative human-readable course name resolved from GET /api/courses/{id}
   * on reaching ready. Null until resolved or on a best-effort miss.
   */
  private readonly _courseName = signal<string | null>(null);

  /** Guards a single course-name fetch per mount (the course id is fixed). */
  private courseNameRequested = false;

  /**
   * Heading text for the ready-state hero (CHO-2147). Priority:
   *   1. the authoritative catalog name (GET /api/courses/{id})
   *   2. the learning-path title IF it is a real name — NOT the "Course <uuid>"
   *      bootstrap placeholder from learning_path.BootstrapFromEnrollment
   *      (emitted when the consumption course_directory projection is unresolved)
   *   3. '' → the template renders a generic i18n label. The raw UUID is NEVER
   *      shown.
   */
  readonly displayTitle = computed<string>(() => {
    const name = this._courseName()?.trim();
    if (name) return name;
    const pathTitle = this.path()?.title?.trim() ?? '';
    if (pathTitle && pathTitle !== 'Course ' + this.courseId) return pathTitle;
    return '';
  });

  private timeoutId?: ReturnType<typeof setTimeout>;
  private destroyed = false;

  // Tracks whether every observed poll-error in this window was a 404.
  // Used to distinguish post-window verdicts:
  //   - 404 the whole window  → 'not_enrolled' (fail-loud banner)
  //   - any 5xx or success    → 'timeout' (upstream degraded — retry CTA)
  private everSaw404Only = true;

  ngOnInit(): void {
    if (!this.courseId) {
      this._state.set({
        status: 'error',
        error: 'aplus.course_learn.error_missing_course',
      });
      return;
    }
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.timeoutId);
    });
    this.schedulePoll(0);
  }

  retry(): void {
    clearTimeout(this.timeoutId);
    this.destroyed = false;
    this.everSaw404Only = true;
    this._state.set({ status: 'polling', tickIndex: 0 });
    this.schedulePoll(0);
  }

  /**
   * Build the routerLink commands array for the "Start" CTA on an atom.
   * Routes to /a/atoms/:atomId/play (the AtomAttempt MCQ player).
   */
  atomPlayLink(atom: CourseLearnAtom): readonly (string | number)[] {
    return ['/a/atoms', atom.atom_id, 'play'];
  }

  /**
   * Course context handed to the atom player (CHO-2350) so its "Next atom" CTA
   * can resolve the atom that actually follows within THIS path. Without it the
   * player has only an atom id and cannot know which course it is serving.
   */
  atomPlayQueryParams(): Readonly<Record<string, string>> {
    return { course: this.courseId };
  }

  /**
   * Translation key for the per-atom state badge.
   */
  stateLabelKey(atom: CourseLearnAtom): string {
    switch (atom.state) {
      case 'completed':
        return 'aplus.course_learn.state_completed';
      case 'in_progress':
        return 'aplus.course_learn.state_in_progress';
      case 'not_started':
      default:
        return 'aplus.course_learn.state_not_started';
    }
  }

  /**
   * Schedule the next poll with exponential backoff.
   * @param attempt Zero-based attempt index; controls delay.
   */
  schedulePoll(attempt: number): void {
    const delay = attempt === 0 ? 0 : backoffDelay(attempt - 1);
    this.timeoutId = setTimeout(() => {
      if (this.destroyed) return;
      this.poll(attempt);
    }, delay);
  }

  private poll(attempt: number): void {
    this._state.set({ status: 'polling', tickIndex: attempt });
    this.learnService
      .getMyLearningPathByCourse(this.courseId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.everSaw404Only = false;
          this._state.set({ status: 'ready', data: res });
          this.resolveCourseName();
        },
        error: (err: unknown) => {
          const e = err as { status?: number };
          if (e?.status === 401 || e?.status === 403) {
            this.everSaw404Only = false;
            this._state.set({
              status: 'error',
              error: 'aplus.course_learn.error_unauthorised',
            });
            return;
          }
          if (e?.status === 404) {
            // Still bootstrapping — keep polling within attempt budget.
            this.continueOrTimeout(attempt);
            return;
          }
          // 5xx / contract drift / network — keep polling so the window can
          // recover, but flag that we saw a non-404 so the post-window
          // verdict resolves to 'timeout' (not 'not_enrolled').
          this.everSaw404Only = false;
          this.continueOrTimeout(attempt);
        },
      });
  }

  /**
   * Best-effort resolution of the authoritative course name from
   * GET /api/courses/{id} (the catalog row the course-detail page reads).
   * Fetched at most once per mount; a failure/miss leaves the name null so
   * displayTitle degrades to the path title or a generic label — never the raw
   * UUID (CHO-2147). Non-blocking: the ready UI renders immediately and the
   * heading refines when the name lands.
   */
  private resolveCourseName(): void {
    if (this.courseNameRequested) return;
    this.courseNameRequested = true;
    this.learnService
      .getCourseTitle(this.courseId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => this._courseName.set((c.title ?? '').trim() || null),
        // Best-effort: on any error keep the name null so displayTitle degrades
        // to the path title or a generic label — never the raw UUID.
        error: () => this._courseName.set(null),
      });
  }

  private continueOrTimeout(attempt: number): void {
    if (attempt + 1 >= MAX_POLL_ATTEMPTS) {
      // Budget exhausted.
      if (this.everSaw404Only) {
        // 404 the entire window. This is AMBIGUOUS: either a genuinely
        // unenrolled learner, OR an enrolled learner whose LearningPath
        // bootstrap (eventual Pub/Sub round-trip) just outran the ~30s poll
        // window. OPEN-4: consult /me/enrolments to disambiguate BEFORE
        // showing the accusatory "you're not enrolled" banner.
        this.verifyEnrolment();
      } else {
        // A non-404 (5xx / network) appeared during the window — upstream is
        // degraded. Explicit "still preparing / contact support" timeout.
        this._state.set({ status: 'timeout' });
      }
      return;
    }
    this.schedulePoll(attempt + 1);
  }

  /**
   * OPEN-4 disambiguation: after a 404-the-whole-window poll, ask
   * /me/enrolments whether the learner actually holds an enrolment for this
   * course.
   *   - enrolment present → 'provisioning' (enrolment confirmed, path still
   *     bootstrapping — encouraging copy + "check again" CTA)
   *   - enrolment absent  → 'not_enrolled' (the genuine case)
   *   - lookup failed      → 'timeout' (can't confirm — show a neutral
   *     "taking longer" message, NEVER a false "not enrolled")
   * The component stays on the (last) polling panel while this single request
   * is in flight; it is fast and terminal either way.
   */
  private verifyEnrolment(): void {
    this.learnService
      .getMyEnrolments(this.courseId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (this.destroyed) return;
          const enrolled = res.items.some(
            (e) => e.course_id === this.courseId,
          );
          this._state.set(
            enrolled ? { status: 'provisioning' } : { status: 'not_enrolled' },
          );
        },
        error: () => {
          if (this.destroyed) return;
          this._state.set({ status: 'timeout' });
        },
      });
  }
}
