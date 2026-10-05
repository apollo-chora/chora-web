/**
 * ClassRosterComponent — R+ /r/roster single-course learner roster.
 *
 * Renders ONE course's enrolled-learner roster (the instructor's first live
 * course). Real BFF wiring end to end (per `feedback_no_stubs_real_wiring`):
 * the service resolves the course via GET /api/v1/instructors/{gcid}/courses
 * (LIVE) then fetches GET /api/v1/rosters/{courseId}. There is NO fabricated
 * DSA-101 / Mr. Chen fixture — the course title + instructor + learners all
 * come off the wire (or an honest empty/error state renders instead).
 *
 * Honest states (no fixtures, ever):
 *   - loading  — spinner while the two chained calls are in flight
 *   - empty    — instructor has no course to scope a roster to (NoCourseError),
 *                or the course has zero enrolled learners
 *   - error    — the roster endpoint failed (today it 404s because
 *                chora-delivery's roster handler is not yet wired — the pg
 *                EnrollmentRepo lacks ListByCourse). The banner makes the
 *                missing-BE state observable rather than hidden behind faked
 *                data. The screen lights up automatically when the BE ships.
 *
 * Signal-first, OnPush, all HTTP through BffClientService per
 * chora-web/CLAUDE.md §3. Sortable columns + a per-row Cert Preview modal are
 * retained for the instructor workflow. Polyglassmorphism, tablet-first
 * (≥768px primary, ≥1280px desktop enhanced). Surface accent: R+ amber.
 *
 * a11y: WCAG 2.1 AA — semantic <table> + <caption>, scoped <th>, ARIA on the
 * progress meter + sort buttons, skip-to-table anchor, visible focus rings.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { CertPreviewModalComponent } from '../cert-preview-modal/cert-preview-modal.component';
import { ClassRosterService, NoCourseError } from './class-roster.service';
import {
  clampProgress,
  EMPTY_COHORT_ROSTER,
  type CohortRoster,
  type RosterLearner,
  type RosterSortKey,
  type SortDirection,
} from './class-roster.model';

@Component({
  selector: 'chora-rplus-class-roster',
  imports: [TranslatePipe, CertPreviewModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './class-roster.component.html',
  styleUrl: './class-roster.component.scss',
})
export class ClassRosterComponent {
  private readonly rosterService = inject(ClassRosterService);

  // ── Async state ─────────────────────────────────────────────────────
  private readonly snapshot = signal<CohortRoster | null>(null);
  private readonly loadingState = signal<boolean>(true);
  private readonly errorKey = signal<string | null>(null);

  // ── Sort state ──────────────────────────────────────────────────────
  readonly sortKey = signal<RosterSortKey>('name');
  readonly sortDirection = signal<SortDirection>('asc');

  // ── Modal state ─────────────────────────────────────────────────────
  readonly certPreviewLearner = signal<RosterLearner | null>(null);

  constructor() {
    this.load();
  }

  /**
   * Hydrate from the real two-call service. A NoCourseError renders the honest
   * empty-state (no course to scope to); any other failure — including the
   * roster endpoint's current 404 — surfaces the fail-loud error banner.
   */
  load(): void {
    this.loadingState.set(true);
    this.errorKey.set(null);
    this.snapshot.set(null);
    this.rosterService.getRoster().subscribe({
      next: (r) => {
        this.snapshot.set(r);
        this.loadingState.set(false);
      },
      error: (err: unknown) => {
        if (err instanceof NoCourseError) {
          // Not an error condition — just nothing to scope to. Render the
          // empty-state with a stable empty roster (never a fixture).
          this.snapshot.set(EMPTY_COHORT_ROSTER);
        } else {
          this.errorKey.set('rplus.rosterByCourse.error');
        }
        this.loadingState.set(false);
      },
    });
  }

  // ── Derived view state ──────────────────────────────────────────────
  readonly roster = computed<CohortRoster>(
    () => this.snapshot() ?? EMPTY_COHORT_ROSTER,
  );

  readonly cohortName = computed<string>(() => this.roster().cohortName);
  readonly courseCode = computed<string>(() => this.roster().courseCode);
  readonly instructorName = computed<string>(() => this.roster().instructorName);
  readonly rosterSize = computed<number>(() => this.roster().rosterSize);

  readonly isLoading = computed<boolean>(() => this.loadingState());
  readonly hasError = computed<boolean>(() => this.errorKey() !== null);
  readonly errorTranslationKey = computed<string | null>(() => this.errorKey());

  /** Learners sorted by the active key + direction. */
  readonly sortedLearners = computed<readonly RosterLearner[]>(() => {
    const learners = [...this.roster().learners];
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    learners.sort((a, b) => this.compareLearners(a, b) * direction);
    return learners;
  });

  // ── Actions ─────────────────────────────────────────────────────────

  toggleSort(key: RosterSortKey): void {
    if (this.sortKey() === key) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      this.sortDirection.set('asc');
    }
  }

  ariaSort(key: RosterSortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) return 'none';
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  openCertPreview(learner: RosterLearner): void {
    if (!learner.certPreviewEnabled) return;
    this.certPreviewLearner.set(learner);
  }

  closeCertPreview(): void {
    this.certPreviewLearner.set(null);
  }

  // ── Presentation helpers ────────────────────────────────────────────

  /** Clamp + round the progress proxy for the meter width binding. */
  progressPercent(learner: RosterLearner): number {
    return clampProgress(learner.progressPct ?? 0);
  }

  /** Enrolment timestamp for the row (empty when the projection is unwired). */
  enrolledAt(learner: RosterLearner): string {
    return learner.enrolledAt ?? '';
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter((p) => p.length > 0)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  statusBadgeClass(status: RosterLearner['status']): string {
    switch (status) {
      case 'Active':
        return 'badge-success';
      case 'At-risk':
        return 'badge-warning';
      case 'Completed':
        return 'badge-info';
      case 'Withdrawn':
        return 'badge-danger';
      case 'Waitlist':
        return 'badge-info';
      default:
        return 'badge-info';
    }
  }

  private compareLearners(a: RosterLearner, b: RosterLearner): number {
    switch (this.sortKey()) {
      case 'name':
        return a.displayName.localeCompare(b.displayName);
      case 'progress':
        return (a.progressPct ?? 0) - (b.progressPct ?? 0);
      case 'status':
        return a.status.localeCompare(b.status);
      case 'enrolled-at':
        return (a.enrolledAt ?? '').localeCompare(b.enrolledAt ?? '');
      default:
        return 0;
    }
  }
}
