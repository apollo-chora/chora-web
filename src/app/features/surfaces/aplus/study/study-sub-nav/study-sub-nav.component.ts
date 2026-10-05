/**
 * StudySubNavComponent — tab strip for the A+ "Study" hub (CHO-2217).
 *
 * Mirrors CoursesSubNavComponent in shape and reuses the same
 * `.authoring-sub-nav` SCSS module so all three A+ hubs render identical pill
 * tabs. Two tabs:
 *   - Study Lists → /a/study             (collection-derived spaced lists)
 *   - Collections → /a/study/collections (the source Collections)
 *
 * /a/study is the sidebar entry; it lands on the Study Lists tab.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';

@Component({
  selector: 'chora-study-sub-nav',
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './study-sub-nav.component.html',
  styleUrl: './study-sub-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudySubNavComponent {}
