/**
 * ContinueLearningCardComponent — the A+ dashboard "continue learning" wrapper
 * (SP2.6, dashboard-as-hub redesign; the `courses` draggable group).
 *
 * It is the GENERIC COLLECTION pattern made concrete: a ROW-BY-ROW list (not
 * 2-column cards) of the learner's courses that shows the **3 latest** collapsed
 * (latest on top) and, on **"See more"**, reveals the full list **paginated
 * 10/page** with a `‹ Page x of N ›` pager whose arrows disable at the ends. The
 * pagination itself lives in the pure, reusable `paginate` helper so any other
 * >3-item wrapper can adopt the same affordance.
 *
 * Self-contained per the batch-B contract: NO @Input — it reads
 * `DashboardService.summary()` (the root singleton the shell already `load()`s)
 * and never triggers a fetch itself. The learner-course list arrives
 * created_at ASC (oldest first, per chora-consumption `listLearningPathsByLearner`),
 * so the card REVERSES it to surface the newest course on top ("latest").
 *
 * Fail-soft: a null summary (dashboard still loading or errored — the shell owns
 * that lifecycle) simply renders the honest empty state; a degraded read never
 * throws into the wrapper grid.
 *
 * Per chora-web CLAUDE.md §3 — standalone, signal state, OnPush, i18n via the
 * translate pipe, tablet-first, axe-clean.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { DashboardService } from '../dashboard.service';
import {
  retentionAriaKey,
  retentionCssVar,
  type LearnerCourseSummary,
  type RetentionState,
} from '../dashboard.model';
import { paginate, type Page } from './paginate';

/** How many rows the collapsed (default) preview shows — the "3 latest". */
export const PREVIEW_COUNT = 3;
/** How many rows one expanded page shows — the "See more → 10/page" window. */
export const PAGE_SIZE = 10;

@Component({
  selector: 'chora-aplus-continue-learning-card',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './continue-learning-card.component.html',
  styleUrl: './continue-learning-card.component.scss',
})
export class ContinueLearningCardComponent {
  private readonly dashboard = inject(DashboardService);

  /** Exposed for the template's collapsed/expanded copy + slice sizes. */
  readonly PREVIEW_COUNT = PREVIEW_COUNT;
  readonly PAGE_SIZE = PAGE_SIZE;

  /**
   * The learner's courses in DISPLAY order (latest on top). The source is
   * created_at ASC, so we reverse a copy — never mutating the shared summary.
   * A null summary (loading/errored) yields an empty list ⇒ the empty state.
   */
  readonly courses = computed<readonly LearnerCourseSummary[]>(() => {
    const list = this.dashboard.summary()?.learnerCourses ?? [];
    return list.slice().reverse();
  });

  readonly hasCourses = computed<boolean>(() => this.courses().length > 0);

  /** More than the collapsed preview ⇒ offer "See more". */
  readonly canExpand = computed<boolean>(
    () => this.courses().length > PREVIEW_COUNT,
  );

  // ── Collapsed vs. expanded (See more / See less) ─────────────────────
  private readonly _expanded = signal(false);
  readonly expanded = this._expanded.asReadonly();

  /** The 0-based page index while expanded (reset to 0 on expand/collapse). */
  private readonly _pageIndex = signal(0);

  /** Collapsed preview — the 3 latest. */
  readonly preview = computed<readonly LearnerCourseSummary[]>(() =>
    this.courses().slice(0, PREVIEW_COUNT),
  );

  /** The current page window when expanded (drives the pager + slice). */
  readonly page = computed<Page<LearnerCourseSummary>>(() =>
    paginate(this.courses(), PAGE_SIZE, this._pageIndex()),
  );

  /** Rows to render: collapsed ⇒ the 3 latest; expanded ⇒ the current page. */
  readonly visibleCourses = computed<readonly LearnerCourseSummary[]>(() =>
    this._expanded() ? this.page().items : this.preview(),
  );

  /** The ‹ Page x of N › pager shows only when expanded past a single page. */
  readonly showPagination = computed<boolean>(
    () => this._expanded() && this.page().pageCount > 1,
  );

  /** Reveal the full list, starting at the first page. */
  expand(): void {
    this._expanded.set(true);
    this._pageIndex.set(0);
  }

  /** Collapse back to the 3 latest. */
  collapse(): void {
    this._expanded.set(false);
    this._pageIndex.set(0);
  }

  /** Step to the previous page (clamped at the first). */
  prevPage(): void {
    this._pageIndex.update((i) => Math.max(0, i - 1));
  }

  /** Step to the next page (clamped at the last). */
  nextPage(): void {
    const last = this.page().pageCount - 1;
    this._pageIndex.update((i) => Math.min(last, i + 1));
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
