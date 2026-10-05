/**
 * RosterByCourseComponent — R+ /r/rosters/:courseId surface (M4).
 *
 * Course-centric Roster view. Distinct from the existing /r/roster
 * (class-centric Cohort 2026-A drill-down): this screen takes a courseId
 * route param and renders the cross-cohort learner set for ONE course.
 *
 * Drill-down from /r/catalog/:courseId (Course-Detail-Admin) or /r/rostering
 * (the cross-cohort Rostering Dashboard); follow-on iterations will add a
 * row-level link out to the per-learner progress drawer + a Cert Preview
 * CTA once the chora-consumption projection lands.
 *
 * Signal-first, OnPush, single HTTP call through BffClientService per
 * chora-web/CLAUDE.md §3. Route param wired via `withComponentInputBinding()`
 * — courseId is a required signal input that re-fetches when the route
 * changes (the user can navigate /r/rosters/A → /r/rosters/B without
 * remounting the screen).
 *
 * Polyglassmorphism, tablet-first (≥768px primary, ≥1280px desktop enhanced).
 * Surface accent: R+ amber (#b45309 primary / #ea580c secondary).
 *
 * a11y: WCAG 2.1 AA — semantic <section> / <header> / <table>, ARIA labels
 * on the progress meter, skip-to-table anchor, visible focus rings.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { RosterByCourseService } from './roster-by-course.service';
import {
  EMPTY_ROSTER,
  type CourseRoster,
  type RosterLearner,
} from './roster-by-course.model';

@Component({
  selector: 'chora-rplus-roster-by-course',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './roster-by-course.component.html',
  styleUrl: './roster-by-course.component.scss',
})
export class RosterByCourseComponent {
  private readonly service = inject(RosterByCourseService);

  /** Route param wired via `withComponentInputBinding()`. */
  readonly courseId = input.required<string>();

  /**
   * Local roster snapshot. Loaded asynchronously from the BFF on every
   * courseId change; the effect tears down the prior subscription so
   * /r/rosters/A → /r/rosters/B never leaks the previous fetch.
   */
  private readonly snapshot = signal<CourseRoster | null>(null);
  /** Loading + error states for the empty-state branch in the template. */
  private readonly loading = signal<boolean>(false);
  private readonly errorKey = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const id = this.courseId();
      this.snapshot.set(null);
      this.errorKey.set(null);
      this.loading.set(true);
      const sub = this.service.getByCourseId(id).subscribe({
        next: (r) => {
          this.snapshot.set(r);
          this.loading.set(false);
        },
        error: () => {
          // Per `feedback_no_stubs_real_wiring` we surface the failure
          // visibly via a translation key — never fake an empty roster.
          this.errorKey.set('rplus.rosterByCourse.error');
          this.snapshot.set(null);
          this.loading.set(false);
        },
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Resolved roster (or a stable empty roster sentinel before first load). */
  readonly roster = computed<CourseRoster>(
    () => this.snapshot() ?? EMPTY_ROSTER,
  );

  readonly learners = computed<readonly RosterLearner[]>(
    () => this.roster().learners,
  );

  readonly learnerCount = computed<number>(() => this.roster().learnerCount);

  readonly isLoading = computed<boolean>(() => this.loading());
  readonly hasError = computed<boolean>(() => this.errorKey() !== null);
  readonly errorTranslationKey = computed<string | null>(() => this.errorKey());

  /**
   * Clamps the progress percent into [0, 100] for the meter rendering.
   * Defensive — the backend already validates the range, but we guard the
   * CSS width binding so a stray 105 from a future projection doesn't
   * overflow the bar.
   */
  clampedProgress(p: number): number {
    if (!Number.isFinite(p)) return 0;
    if (p < 0) return 0;
    if (p > 100) return 100;
    return p;
  }
}
