/**
 * AssessmentListComponent — R+ Phase X.5 — `/r/assessments`.
 *
 * Instructor-facing list of authored assessments. Wires to the real BFF
 * route `GET /api/v1/assessments` via `AssessmentMonitorService.loadList()`.
 * Renders a 6-chip filter row (ALL / DRAFT / OPEN / CLOSED / RELEASED /
 * ARCHIVED) over a card grid. Each card routes to
 * `/r/assessments/:id/monitor`.
 *
 * Fail-loud per `feedback_no_stubs_real_wiring` — no mock fallback; load
 * errors surface as a role=alert banner with a retry CTA.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { AssessmentMonitorService } from '../assessment-monitor.service';
import {
  ASSESSMENT_FILTER_CHIPS,
  filterAssessmentsByChip,
  stateBadgeVariant,
  type Assessment,
  type AssessmentFilterChip,
} from '../assessment-monitor.model';

@Component({
  selector: 'chora-rplus-assessment-list',
  standalone: true,
  imports: [RouterLink, TranslatePipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assessment-list.component.html',
  styleUrl: './assessment-list.component.scss',
})
export class AssessmentListComponent {
  private readonly monitorService = inject(AssessmentMonitorService);

  /** Filter chip order — exposed to the template via `chips`. */
  readonly chips = ASSESSMENT_FILTER_CHIPS;

  /** Active filter chip (defaults to ALL). */
  readonly activeChip = signal<AssessmentFilterChip>('ALL');

  /** Discriminated AsyncState surfaced by the service. */
  readonly listState = this.monitorService.listState;
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

  readonly allAssessments = this.monitorService.assessments;

  /** Free-text filter over title + learner-facing name. */
  readonly searchQuery = signal<string>('');

  /** Client-side page size — rows shown before the "Load more" button. */
  private readonly PAGE_SIZE = 12;
  readonly visibleLimit = signal<number>(this.PAGE_SIZE);

  /**
   * Active state-chip filter + free-text filter, newest-first
   * (created_at desc; assessment_id as the UUIDv7 tiebreak).
   */
  readonly filteredAssessments = computed<readonly Assessment[]>(() => {
    const byChip = filterAssessmentsByChip(
      this.allAssessments(),
      this.activeChip(),
    );
    const q = this.searchQuery().trim().toLowerCase();
    const matched = q
      ? byChip.filter((a) => {
          const title = a.title?.toLowerCase() ?? '';
          const name = a.learner_facing_name?.toLowerCase() ?? '';
          return title.includes(q) || name.includes(q);
        })
      : byChip;
    return [...matched].sort((a, b) => {
      const ak = a.created_at || a.assessment_id;
      const bk = b.created_at || b.assessment_id;
      return bk.localeCompare(ak);
    });
  });

  /** The rows actually rendered (paged slice of the filtered list). */
  readonly visibleAssessments = computed<readonly Assessment[]>(() =>
    this.filteredAssessments().slice(0, this.visibleLimit()),
  );

  /** True when more filtered rows exist beyond the current page. */
  readonly hasMore = computed<boolean>(
    () => this.filteredAssessments().length > this.visibleLimit(),
  );

  readonly isEmpty = computed<boolean>(
    () =>
      this.listState().status === 'success' &&
      this.allAssessments().length === 0,
  );

  readonly isFilterEmpty = computed<boolean>(
    () =>
      this.listState().status === 'success' &&
      this.allAssessments().length > 0 &&
      this.filteredAssessments().length === 0,
  );

  constructor() {
    this.monitorService.loadList();
  }

  selectChip(chip: AssessmentFilterChip): void {
    this.activeChip.set(chip);
    this.visibleLimit.set(this.PAGE_SIZE);
  }

  /** Update the free-text search filter (client-side, over loaded items). */
  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.visibleLimit.set(this.PAGE_SIZE);
  }

  /** Reveal the next client-side page of rows. */
  loadMore(): void {
    this.visibleLimit.update((n) => n + this.PAGE_SIZE);
  }

  retry(): void {
    this.monitorService.loadList();
  }

  badgeClass(state: Assessment['state']): string {
    return stateBadgeVariant(state);
  }

  trackByAssessmentId(_index: number, item: Assessment): string {
    return item.assessment_id;
  }
}
