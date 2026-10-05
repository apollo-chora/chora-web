/**
 * StudyListsComponent — A+ Study surface, "Study Lists" tab (CHO-2217).
 *
 * Route: `/a/study` (and `/a/study/lists`).
 *
 * Lists the learner's WS-4 study lists: the LearningPaths derived from a
 * Collection via POST /api/v1/collections/{id}/convert-to-study-list. Before
 * this surface existed the conversion succeeded and the result was
 * unreachable — nothing listed study lists and /a/collections was in no nav.
 *
 * ── 🔴 Why there is no "Continue" on these cards (ADR-233 D3) ────────────────
 * A study list is `traversal_mode: spaced`. Its `current_index` is a LINEAR
 * cursor that the domain deliberately leaves INERT, and `Advance()` REFUSES on
 * it (`ErrSpacedPathNoCursor`) — so a Continue/Resume CTA would 4xx on every
 * click. Two fields on the wire are inert for the same reason and must never be
 * rendered here: `progress_percent` (= current_index/total_atoms ⇒ frozen at
 * 0.0) and `completed` (only Advance() stamps completed_at ⇒ frozen false). A
 * progress bar would tell a learner who has studied for weeks that they are at
 * 0%.
 *
 * What a study list actually feeds is the Daily Dose CURIOSITY slot:
 * `learning_path.bootstrapped.v1` → `active_path_topics` → `pickCuriositySlots`
 * (the conversion subscriber calls that publish "THE LOAD-BEARING PUBLISH").
 * So the card's CTA is the Daily Dose, which is what the BE honours.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { StudySubNavComponent } from '../study-sub-nav/study-sub-nav.component';
import { CoursesSubNavComponent } from '../../courses-sub-nav/courses-sub-nav.component';
import { StudyService } from '../study.service';

@Component({
  selector: 'chora-aplus-study-lists',
  imports: [RouterLink, TranslatePipe, StudySubNavComponent, CoursesSubNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './study-lists.component.html',
  styleUrl: './study-lists.component.scss',
})
export class StudyListsComponent {
  private readonly studyService = inject(StudyService);

  readonly state = this.studyService.listState;
  readonly studyLists = this.studyService.studyLists;

  readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.status === 'error' ? s.error : '';
  });

  readonly isEmpty = computed<boolean>(
    () => this.state().status === 'success' && this.studyLists().length === 0,
  );

  constructor() {
    this.studyService.loadStudyLists();
  }

  retryLoad(): void {
    this.studyService.loadStudyLists();
  }
}
