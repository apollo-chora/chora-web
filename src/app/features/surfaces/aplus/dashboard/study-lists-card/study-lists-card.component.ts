/**
 * StudyListsCardComponent — the A+ dashboard `study` wrapper (CHO-2217).
 *
 * WHY THIS EXISTS: study lists shipped behind a top-level "Study" sidebar entry,
 * which made them a silo sitting BESIDE Learning rather than part of it. A study
 * list is the learner's own curated material — it belongs on the learning hub,
 * next to Continue learning. The two wrappers are the same aggregate
 * (LearningPath) split by provenance (ADR-233 `source_type`): `course` is
 * someone else's curriculum, `collection` is your own curation. That is why they
 * are adjacent in DEFAULT_ORDER.
 *
 * Reads `StudyService`, which owns the POSITIVE discriminator
 * (`source_type === 'collection'`). This card must NEVER re-derive that test:
 * `!== 'course'` sweeps every legacy `ad_hoc` path in as a study list, and there
 * are live `ad_hoc` rows on this wire.
 *
 * 🔴 ADR-233 D3 — renders NO progress bar, NO "n of m", NO Completed badge. A
 * study list is spaced: `Advance()` refuses on it, so `progress_percent`,
 * `current_index` and `completed` are frozen at 0/0/false forever. A progress
 * bar here would tell a learner who has studied for weeks that they are at 0%.
 * The dose is the honoured action, so the dose is the CTA.
 *
 * Unlike ContinueLearningCard (which reads the shell's already-loaded
 * DashboardService.summary()), this card owns its fetch: `/me/learning-paths` is
 * a distinct endpoint the shell does not call. Fail-loud: the error arm is
 * first-class and can never render as "you have no study lists".
 *
 * Per chora-web CLAUDE.md §3 — standalone, signal state, OnPush, i18n via the
 * translate pipe, tablet-first, axe-clean.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { StudyService } from '../../study/study.service';
import type { MeLearningPath } from '../../study/study.model';

/** The dashboard is a GLANCE surface — the full list lives at /a/study. */
const CARD_LIMIT = 3;

@Component({
  selector: 'chora-aplus-study-lists-card',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './study-lists-card.component.html',
  styleUrl: './study-lists-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudyListsCardComponent {
  private readonly study = inject(StudyService);

  readonly state = this.study.listState;

  /** Already filtered to `source_type === 'collection'` by StudyService. */
  private readonly all = this.study.studyLists;

  readonly isLoading = computed(() => this.state().status === 'loading');
  readonly isError = computed(() => this.state().status === 'error');

  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  /** Empty is true ONLY for a successful fetch that returned nothing. */
  readonly isEmpty = computed(
    () => this.state().status === 'success' && this.all().length === 0,
  );

  readonly rows = computed<readonly MeLearningPath[]>(() =>
    this.all().slice(0, CARD_LIMIT),
  );

  /** How many study lists are NOT shown on the card (0 = no overflow hint). */
  readonly moreCount = computed(() => Math.max(0, this.all().length - CARD_LIMIT));

  constructor() {
    this.study.loadStudyLists();
  }

  retryLoad(): void {
    this.study.loadStudyLists();
  }
}
