/**
 * MyCoursesComponent — A+ "My Courses" Learn destination (CHO-2321).
 *
 * Lists the enrolled learner's courses (reusing the dashboard aggregator's
 * `learnerCourses`, GET /api/me/dashboard), each opening the existing course
 * content view at /a/courses/:courseId/learn. Reuse, no new backend: the
 * enrolment source is the same LearningPath-derived list the dashboard
 * continue-learning card renders. This surface just makes it a first-class,
 * discoverable nav destination (the Learn sub-nav "My Courses" tab) instead
 * of being reachable only via one dashboard card.
 *
 * Owns only the load trigger + loading/error/empty/list states, so a direct
 * deep-link to /a/courses is never a blank spinner. Per chora-web CLAUDE.md
 * §3 (BFF-only via DashboardService); standalone + signals + OnPush.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { CoursesSubNavComponent } from '../courses-sub-nav/courses-sub-nav.component';
import { DashboardService } from '../dashboard/dashboard.service';
import {
  retentionAriaKey,
  retentionCssVar,
  type LearnerCourseSummary,
  type RetentionState,
} from '../dashboard/dashboard.model';

@Component({
  selector: 'chora-aplus-my-courses',
  standalone: true,
  imports: [RouterLink, TranslatePipe, CoursesSubNavComponent],
  templateUrl: './my-courses.component.html',
  styleUrl: './my-courses.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyCoursesComponent implements OnInit {
  private readonly dashboard = inject(DashboardService);

  readonly state = this.dashboard.state;

  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly isError = computed(() => this.state().status === 'error');

  /**
   * Enrolled courses in DISPLAY order (newest first). The dashboard source is
   * created_at ASC, so we reverse a copy (never mutating the shared summary).
   * A null summary (loading / errored) yields an empty list.
   */
  readonly courses = computed<readonly LearnerCourseSummary[]>(() => {
    const list = this.dashboard.summary()?.learnerCourses ?? [];
    return list.slice().reverse();
  });

  readonly hasCourses = computed<boolean>(() => this.courses().length > 0);

  ngOnInit(): void {
    // Idempotent + deep-link safe: a direct hit on /a/courses must fetch even
    // when the learner never opened the dashboard this session.
    this.dashboard.load();
  }

  retry(): void {
    this.dashboard.load();
  }

  /** CSS custom-property for the Ebbinghaus retention dot (reuses the model). */
  retentionColor(state: RetentionState | undefined): string {
    return retentionCssVar(state);
  }

  /** i18n key for the retention dot's accessible label (reuses the model). */
  retentionLabel(state: RetentionState | undefined): string {
    return retentionAriaKey(state);
  }
}
