/**
 * MeAssessmentsListComponent — `/a/me/assessments`.
 *
 * Phase X.3.1 — learner's list of assessments where they are on the
 * invite list (`invited_gcids` includes their GCID) or open-link mode.
 * Wired LIVE to `MeAssessmentsService.listAssessments()` → real
 * `GET /api/v1/me/assessments`. No stubs, no fixtures. Fail-loud: a
 * skeleton, an error banner with a retry CTA, then the cards grid.
 *
 * Each card carries a `data-attempt-status` chip distinguishing the FSM
 * states the learner can act on (per ADR-155 D7).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { MeAssessmentsService } from '../me-assessments.service';
import type {
  LearnerAssessmentSummary,
  LearnerAttemptStatus,
} from '../me-assessments.model';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type PageSize,
} from '../me-assessments.model';
import { CoursesSubNavComponent } from '../../courses-sub-nav/courses-sub-nav.component';

interface AssessmentCardVm {
  readonly summary: LearnerAssessmentSummary;
  readonly attemptStatus: LearnerAttemptStatus;
  readonly resultHref: string | null;
}

@Component({
  selector: 'chora-aplus-me-assessments-list',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    TranslatePipe,
    CoursesSubNavComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './me-assessments-list.component.html',
  styleUrl: './me-assessments-list.component.scss',
})
export class MeAssessmentsListComponent {
  private readonly service = inject(MeAssessmentsService);

  readonly listState = this.service.listState;
  readonly items = this.service.items;

  readonly isLoading = computed<boolean>(
    () => this.listState().status === 'loading',
  );
  readonly isError = computed<boolean>(
    () => this.listState().status === 'error',
  );
  readonly errorKey = computed<string>(() => {
    const s = this.listState();
    return s.status === 'error' ? s.error : '';
  });
  readonly isEmpty = computed<boolean>(() => {
    const s = this.listState();
    return s.status === 'success' && s.items.length === 0;
  });

  // ── Search + latest-first sort (client-side over loaded items) ──────
  /** Free-text filter over title + learner-facing name. */
  readonly searchQuery = signal<string>('');

  /** All loaded items as VMs, newest-first (assessment_id is UUIDv7 ⇒
   * lexicographic desc == creation-time desc). */
  private readonly sortedCards = computed<readonly AssessmentCardVm[]>(() =>
    [...this.items()]
      .map((summary) => this.buildCardVm(summary))
      .sort((a, b) =>
        b.summary.assessment_id.localeCompare(a.summary.assessment_id),
      ),
  );

  /** Visible rows after applying the search filter. */
  readonly cards = computed<readonly AssessmentCardVm[]>(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.sortedCards();
    return this.sortedCards().filter((vm) => {
      const title = vm.summary.title?.toLowerCase() ?? '';
      const name = vm.summary.learner_facing_name?.toLowerCase() ?? '';
      return title.includes(q) || name.includes(q);
    });
  });

  /** Success + items exist, but the current search matched none. */
  readonly hasNoMatch = computed<boolean>(() => {
    const s = this.listState();
    return (
      s.status === 'success' && s.items.length > 0 && this.cards().length === 0
    );
  });

  // ── Pagination (CR2-C2) ─────────────────────────────────────────────
  /** Exposed to template for the options <option> loop. */
  readonly PAGE_SIZE_OPTIONS = PAGE_SIZE_OPTIONS;
  /** Current page-size selection. */
  readonly pageSize = signal<PageSize>(DEFAULT_PAGE_SIZE);

  private readonly _nextPageToken = computed<string | null>(() => {
    const s = this.service.listState();
    return s.status === 'success' ? (s.nextPageToken ?? null) : null;
  });

  /** True when the server indicated there are more pages. */
  readonly hasMore = computed<boolean>(() => this._nextPageToken() !== null);

  constructor() {
    this.service.listAssessments();
  }

  retry(): void {
    this.service.listAssessments();
  }

  /** Update the free-text search filter (client-side, over loaded items). */
  onSearchInput(value: string): void {
    this.searchQuery.set(value);
  }

  /** Fetch the next page and append items to the existing list. */
  loadMore(): void {
    const token = this._nextPageToken();
    if (token === null) return;
    this.service.listAssessments({
      pageSize: this.pageSize(),
      pageToken: token,
      append: true,
    });
  }

  /** Reset to the first page with the newly selected page size. */
  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize as PageSize);
    this.service.listAssessments({ pageSize: newSize });
  }

  /**
   * Derives the learner-facing attempt status from the (assessment FSM,
   * submission FSM, remaining attempts) tuple per ADR-155 D7.
   */
  private deriveAttemptStatus(
    s: LearnerAssessmentSummary,
  ): LearnerAttemptStatus {
    const sub = s.learner_latest_submission_state;
    if (sub === 'RELEASED' || s.state === 'RELEASED') return 'RELEASED';
    if (sub === 'GRADED' || sub === 'GRADING') return 'SUBMITTED';
    if (sub === 'SUBMITTED') return 'SUBMITTED';
    if (sub === 'IN_PROGRESS') return 'IN_PROGRESS';
    if (s.state === 'SCHEDULED') return 'SCHEDULED';
    if (
      s.state === 'CLOSED' ||
      s.state === 'GRADING' ||
      s.state === 'GRADED' ||
      s.state === 'ARCHIVED'
    ) {
      return 'CLOSED';
    }
    if (s.state === 'OPEN' && s.learner_remaining_attempts <= 0) {
      return 'EXHAUSTED';
    }
    return 'AVAILABLE';
  }

  private buildCardVm(summary: LearnerAssessmentSummary): AssessmentCardVm {
    const attemptStatus = this.deriveAttemptStatus(summary);
    // BE shipped 2026-05-17 (e2e09d9d) — list payload now carries
    // learner_latest_submission_id so we can deep-link directly to the
    // released result page. Fallback to the bare `.../result` path for
    // older BE versions (defensive only — the Angular router silently
    // rewrites that to the cover; the cover now also handles
    // RELEASED+attempted gracefully via showViewResultCta).
    const subId = summary.learner_latest_submission_id ?? null;
    const resultHref =
      attemptStatus === 'RELEASED'
        ? subId
          ? `/a/me/assessments/${summary.assessment_id}/result/${subId}`
          : `/a/me/assessments/${summary.assessment_id}/result`
        : null;
    return { summary, attemptStatus, resultHref };
  }

  cardHref(summary: LearnerAssessmentSummary): string {
    return `/a/me/assessments/${summary.assessment_id}`;
  }
}
