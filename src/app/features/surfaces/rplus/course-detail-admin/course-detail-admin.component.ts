/**
 * CourseDetailAdminComponent — R+ Stage 3 wave 3.
 *
 * Per-course admin view at `/r/catalog/:courseId`. Drill-down from
 * `/r/catalog` or `/r/rostering`. Used during Phyllis Step 10 cert
 * preview workflow when Mr. Chen reviews the CSPO atom list before
 * issuing the certificate.
 *
 * Ports `chora-web/.stitch-imports/rplus/rplus-course-detail-admin.html`.
 *
 * The "Course content" section (CHO-2317) is a READ-ONLY overview of the
 * course's real heterogeneous curriculum, grouped by kind (Assessments /
 * Videos / YouTube / Documents / Live classroom / Atoms) via the shared
 * CourseContentService. Editing lives in the "Manage curriculum" editor.
 *
 * Per-course review/release: the R+ "Course Review" queue moved off a
 * global sidebar route onto THIS page. When the course is AWAITING_REVIEW
 * the training-admin sets a price + SkillsFuture flag + instructor roster
 * and Releases it to the catalog (POST /release), or Rejects it back to
 * the instructor with review notes (POST /reject). Both endpoints are
 * per-course + tenant-scoped on the backend. The release/reject logic is
 * ported from the retired CourseReviewComponent and reuses the
 * `rplus.course_review.*` i18n keys verbatim.
 *
 * CORRECTED 2026-09-03 (owner R44 ruling (a)). This block used to say the
 * endpoints were "training-admin-gated" and that the FE "surfaces the error
 * banner (RBAC 403) rather than gating the control (per the Integrative UI
 * mandate)". Both halves misled, and together they produced a redesign that
 * would have REMOVED working capability from a role that has it:
 *
 *   - `hasTrainingAdminRole` ACCEPTS `instructor` on purpose
 *     (`course_cj2_handler.go:624`; its docblock cites chora-identity's
 *     adminRoles map and the ADR-141 reconciliation, under which the schema
 *     enum `instructor` maps onto the contract role `TRAINING_ADMIN`). An
 *     instructor is admitted to release and reject, so there is no 403 for
 *     this screen to surface for them.
 *   - "rather than gating the control" therefore describes a choice the
 *     screen never actually faced here. R44 hides what a role CANNOT do; both
 *     R+ viewers CAN, exactly as the offering workspace admits an instructor
 *     through `canManage`. Release and Reject stay visible to both.
 *
 * `error_unauthorised` is still reachable and still correct as a BRANCH:
 * `errorKey` maps 401 as well as 403, and a 401 is an expired or absent
 * session, which happens to anyone. It is the STRING that is wrong, not the
 * branch.
 *
 * Two GETs to /api/v1/courses/{id} back this page: CourseDetailAdminService
 * returns the admin DISPLAY projection (atoms / KPIs / badge — defaulting
 * roster + metrics to empty until Wave 5 fans out to rosters/metrics
 * endpoints), while CourseService returns the raw Course AGGREGATE (the
 * lifecycle `state` + price / sf / instructor_gcids that seed the release
 * form). The two reads legitimately diverge as Wave 5 lands.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { CourseDetailAdminService } from './course-detail-admin.service';
import { CourseService } from '../course-authoring/course.service';
import {
  type Course,
  type CourseActionState,
  SGD_CENTS_DEFAULT,
} from '../course-authoring/course-authoring.model';
import {
  type CourseDetailAdmin,
  courseStatusBadgeVariant,
} from './course-detail-admin.model';
import { InstructorRosterService } from './instructor-roster.service';
import type { TenantMemberSummary } from '../assessments/assessment-instantiation/assessment-instantiation.model';
import { CourseContentService } from '../../../shared/course-content/course-content.service';
import type {
  ContentKind,
  CourseContentItem,
} from '../../../shared/course-content/course-content.model';

/** Fixed display order for the grouped course-content collections (CHO-2317). */
const CONTENT_KIND_ORDER: readonly ContentKind[] = [
  'assessment',
  'video',
  'youtube',
  'document',
  'live_classroom',
  'atom',
];

/** Async state for the grouped course-content view (CHO-2317). */
interface CourseContentState {
  readonly status: 'loading' | 'error' | 'ready';
  readonly items: readonly CourseContentItem[];
}

interface ReleaseDraft {
  readonly priceSgdDollars: string;
  readonly sfEligible: boolean;
  readonly scheduledOpenAt: string;
  /** GCIDs of the instructors ticked in the roster checklist (CHO-2316). */
  readonly instructorGcids: readonly string[];
}

/** Async state for the release-panel instructor checklist. */
interface InstructorRosterState {
  readonly status: 'loading' | 'error' | 'ready';
  readonly items: readonly TenantMemberSummary[];
}

const EMPTY_RELEASE: ReleaseDraft = {
  priceSgdDollars: String(SGD_CENTS_DEFAULT / 100),
  sfEligible: false,
  scheduledOpenAt: '',
  instructorGcids: [],
};

@Component({
  selector: 'chora-rplus-course-detail-admin',
  imports: [FormsModule, TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-detail-admin.component.html',
  styleUrl: './course-detail-admin.component.scss',
})
export class CourseDetailAdminComponent {
  /** Admin DISPLAY projection (atoms / KPIs / badge). */
  private readonly courseService = inject(CourseDetailAdminService);
  /** Raw Course AGGREGATE (lifecycle state + release/reject actions). */
  private readonly rawCourses = inject(CourseService);
  /** Tenant instructor roster for the release-panel checklist (CHO-2316). */
  private readonly roster = inject(InstructorRosterService);
  /** Real heterogeneous course content for the grouped view (CHO-2317). */
  private readonly contentService = inject(CourseContentService);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param wired via `withComponentInputBinding()`. */
  readonly courseId = input.required<string>();

  /** Materialised course snapshot. Loaded synchronously from the
   *  mock service (Observable `of(...)`) so direct write is safe. */
  private readonly courseSnapshot = signal<CourseDetailAdmin | null>(null);

  /** Raw Course aggregate — carries the real lifecycle `state`. */
  private readonly rawCourse = signal<Course | null>(null);

  /**
   * True when the display-projection load errored (e.g. the course GET 404s).
   * Gates a fail-loud error state so the page never hangs on the loading
   * spinner (CHO-2256: a next-only subscription left a 404 spinning forever).
   */
  readonly loadError = signal(false);

  /** Bumped on a successful release/reject to re-fetch both projections. */
  private readonly reloadKey = signal(0);

  // ── Release form ────────────────────────────────────────────────────
  readonly releaseDraft = signal<ReleaseDraft>(EMPTY_RELEASE);
  readonly releaseAction = signal<CourseActionState>({ status: 'idle' });
  readonly releaseError = computed(() => {
    const a = this.releaseAction();
    return a.status === 'error' ? a.error : '';
  });
  readonly canRelease = computed(() => {
    const d = this.releaseDraft();
    const priceOk =
      !isNaN(Number(d.priceSgdDollars)) && Number(d.priceSgdDollars) >= 0;
    const rosterOk = d.instructorGcids.length > 0;
    const submitting = this.releaseAction().status === 'submitting';
    return priceOk && rosterOk && !submitting;
  });

  /**
   * The tenant's instructor roster for the release-panel checklist (CHO-2316).
   * Loaded once (tenant-scoped, not per-course). Fail-loud: an error surfaces an
   * error + retry in the panel rather than a fabricated empty list.
   */
  readonly instructorRoster = signal<InstructorRosterState>({
    status: 'loading',
    items: [],
  });

  /** One-shot guard so the tenant roster loads once, only when a review opens. */
  private rosterRequested = false;

  // ── Reject form ─────────────────────────────────────────────────────
  readonly rejectReason = signal('');
  readonly rejectAction = signal<CourseActionState>({ status: 'idle' });
  readonly rejectError = computed(() => {
    const a = this.rejectAction();
    return a.status === 'error' ? a.error : '';
  });
  readonly canReject = computed(() => {
    const r = this.rejectReason().trim();
    return r.length > 0 && this.rejectAction().status !== 'submitting';
  });

  /** True iff the raw aggregate is AWAITING_REVIEW — gates the review block. */
  readonly isAwaitingReview = computed(
    () => this.rawCourse()?.state === 'AWAITING_REVIEW',
  );

  // ── Course content (grouped read-only view, CHO-2317) ──────────────
  readonly contentState = signal<CourseContentState>({
    status: 'loading',
    items: [],
  });

  /** Real content items bucketed into ordered, non-empty collections by kind. */
  readonly contentGroups = computed(() => {
    const items = this.contentState().items;
    return CONTENT_KIND_ORDER.map((kind) => ({
      kind,
      labelKey: `rplus.courseDetail.content_kind.${kind}`,
      items: items
        .filter((i) => i.kind === kind)
        .sort((a, b) => a.position - b.position),
    })).filter((group) => group.items.length > 0);
  });

  constructor() {
    // Display projection — atoms / KPIs / badge. Re-fetched on reload.
    // A load error (e.g. a 404 on a legacy/missing course) flips loadError so
    // the template shows a fail-loud error state instead of spinning forever.
    effect((onCleanup) => {
      const id = this.courseId();
      this.reloadKey();
      this.loadError.set(false);
      const sub = this.courseService.getCourse(id).subscribe({
        next: (c) => this.courseSnapshot.set(c),
        error: () => this.loadError.set(true),
      });
      onCleanup(() => sub.unsubscribe());
    });

    // Real course content (heterogeneous items) for the grouped view. Re-fetched
    // on reload so a release/reject reflects the current curriculum.
    effect(() => {
      const id = this.courseId();
      this.reloadKey();
      this.loadContent(id);
    });

    // Raw aggregate — real lifecycle state + release-form seed. Re-fetched
    // on reload so a successful release/reject flips the review block off.
    effect((onCleanup) => {
      const id = this.courseId();
      this.reloadKey();
      const sub = this.rawCourses.getCourse(id).subscribe({
        next: (c) => {
          this.rawCourse.set(c);
          this.seedReleaseForm(c);
        },
        // A raw-load failure only costs the release-form seed + the review
        // block; it must NOT hide an otherwise-loadable page, so swallow it
        // here (the display projection drives loadError / the page render).
        error: () => this.rawCourse.set(null),
      });
      onCleanup(() => sub.unsubscribe());
    });

    // Reset transient action state when the course IDENTITY changes (not on
    // a reload — a successful release keeps its 'success' state so the block
    // collapses cleanly rather than flashing an idle form).
    effect(() => {
      this.courseId();
      this.releaseAction.set({ status: 'idle' });
      this.rejectAction.set({ status: 'idle' });
    });

    // The instructor roster is only needed when a review panel opens
    // (AWAITING_REVIEW). Load it once, lazily, the first time that happens -
    // a PUBLISHED / DRAFT course never pays for the roster fetch.
    effect(() => {
      if (this.isAwaitingReview() && !this.rosterRequested) {
        this.rosterRequested = true;
        this.loadInstructorRoster();
      }
    });
  }

  readonly course = computed<CourseDetailAdmin | null>(
    () => this.courseSnapshot(),
  );

  badge(): string {
    const c = this.course();
    return c ? courseStatusBadgeVariant(c.status) : 'badge-neutral';
  }

  /** (Re)load the real course content for the grouped view (CHO-2317). */
  loadContent(id: string): void {
    this.contentState.set({ status: 'loading', items: [] });
    this.contentService
      .listContent(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) =>
          this.contentState.set({ status: 'ready', items: r.items }),
        error: () => this.contentState.set({ status: 'error', items: [] }),
      });
  }

  // ── Review actions ──────────────────────────────────────────────────

  updateRelease<K extends keyof ReleaseDraft>(
    key: K,
    value: ReleaseDraft[K],
  ): void {
    this.releaseDraft.set({ ...this.releaseDraft(), [key]: value });
  }

  /** Load the tenant instructor roster for the release checklist (CHO-2316). */
  loadInstructorRoster(): void {
    this.instructorRoster.set({ status: 'loading', items: [] });
    this.roster
      .listInstructors()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) =>
          this.instructorRoster.set({ status: 'ready', items }),
        error: () =>
          this.instructorRoster.set({ status: 'error', items: [] }),
      });
  }

  isInstructorSelected(gcid: string): boolean {
    return this.releaseDraft().instructorGcids.includes(gcid);
  }

  /** Tick / untick an instructor in the release roster checklist. */
  toggleInstructor(gcid: string): void {
    const current = this.releaseDraft().instructorGcids;
    const next = current.includes(gcid)
      ? current.filter((g) => g !== gcid)
      : [...current, gcid];
    this.updateRelease('instructorGcids', next);
  }

  release(courseId: string): void {
    if (!this.canRelease()) return;
    const d = this.releaseDraft();
    const priceCents = Math.round(Number(d.priceSgdDollars) * 100);
    const instructorGcids = [...d.instructorGcids];
    const scheduledOpenAt = d.scheduledOpenAt
      ? new Date(d.scheduledOpenAt).toISOString()
      : undefined;
    this.releaseAction.set({ status: 'submitting' });
    this.rawCourses
      .releaseCourse(courseId, {
        price_sgd_cents: priceCents,
        sf_eligible: d.sfEligible,
        instructor_gcids: instructorGcids,
        scheduled_open_at: scheduledOpenAt,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.releaseAction.set({ status: 'success' });
          this.reload();
        },
        error: (err: unknown) =>
          this.releaseAction.set({
            status: 'error',
            error: this.errorKey(err, 'release'),
          }),
      });
  }

  reject(courseId: string): void {
    if (!this.canReject()) return;
    this.rejectAction.set({ status: 'submitting' });
    this.rawCourses
      .rejectCourse(courseId, { review_notes: this.rejectReason().trim() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.rejectAction.set({ status: 'success' });
          this.reload();
        },
        error: (err: unknown) =>
          this.rejectAction.set({
            status: 'error',
            error: this.errorKey(err, 'reject'),
          }),
      });
  }

  /** Seed the release form + clear the reject notes from the raw aggregate. */
  private seedReleaseForm(c: Course): void {
    this.releaseDraft.set({
      priceSgdDollars: String((c.price_sgd_cents ?? SGD_CENTS_DEFAULT) / 100),
      sfEligible: c.sf_eligible ?? false,
      scheduledOpenAt: '',
      instructorGcids: c.instructor_gcids ?? [],
    });
    this.rejectReason.set('');
  }

  /** Re-fetch both projections (display + raw) after a state transition. */
  private reload(): void {
    this.reloadKey.update((n) => n + 1);
  }

  private errorKey(err: unknown, scope: 'release' | 'reject'): string {
    const e = err as { status?: number };
    const base = `rplus.course_review.error_${scope}`;
    if (typeof e?.status === 'number') {
      // SPLIT (owner R50 follow-up, 2026-09-03): 401 and 403 are different
      // events and the status is right here, so they no longer share one vague
      // sentence. 401 is an expired or absent session, which happens to anyone
      // mid-review; 403 for an R+ viewer is a tenant or role mismatch, NOT a
      // lost ownership. The single key they used to share said "training-admin
      // role required", which was false in both cases: `hasTrainingAdminRole`
      // admits `instructor` (`course_cj2_handler.go:624`).
      if (e.status === 401) return 'rplus.course_review.error_session_expired';
      if (e.status === 403) return 'rplus.course_review.error_forbidden';
      if (e.status === 404) return `${base}_not_found`;
      if (e.status === 409) return `${base}_conflict`;
      if (e.status >= 500) return `${base}_upstream`;
    }
    return `${base}_generic`;
  }
}
