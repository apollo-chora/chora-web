/**
 * StudioHomeComponent — `/a/studio`, the A+ authoring surface's front door.
 *
 * WHY THIS EXISTS: the sidebar entry labelled "Authoring" used to point at
 * `/a/atoms/new` — a create-a-new-thing FORM. An author landing on their own
 * workspace was handed a blank canvas and no way to see what they already had.
 * Everything downstream inherited that inversion: test-sets lived at
 * `/a/atoms/new/test-sets`, and you edited one at `.../test-sets/:id/edit`, an
 * edit nested under "new".
 *
 * Studio is the step 1 the compose canvas never had. The canvas itself is a
 * good step 2 and is deliberately unchanged.
 *
 * Shape is lifted from `question-banks/question-bank-workbench-list` — the one
 * A+ authoring surface already built correctly (title, purpose line, primary
 * action top-right, cards). This is a pure navigation hub: it fetches nothing,
 * so it has no load state to fail loud about. The counts live on each
 * destination, which owns its own fetch and its own honest error.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { StudioSubNavComponent } from './studio-sub-nav.component';

/** One destination card. `route` is absolute so the template stays dumb. */
interface StudioSection {
  readonly testid: string;
  readonly route: string;
  readonly icon: string;
  readonly titleKey: string;
  readonly bodyKey: string;
}

const SECTIONS: readonly StudioSection[] = [
  {
    testid: 'studio-card-atoms',
    route: '/a/studio/atoms',
    icon: 'fa-cubes',
    titleKey: 'aplus.studio.atoms.title',
    bodyKey: 'aplus.studio.atoms.body',
  },
  {
    testid: 'studio-card-test-sets',
    route: '/a/studio/test-sets',
    icon: 'fa-list-check',
    titleKey: 'aplus.studio.test_sets.title',
    bodyKey: 'aplus.studio.test_sets.body',
  },
  {
    testid: 'studio-card-question-banks',
    route: '/a/studio/question-banks',
    icon: 'fa-layer-group',
    titleKey: 'aplus.studio.question_banks.title',
    bodyKey: 'aplus.studio.question_banks.body',
  },
];

@Component({
  selector: 'chora-studio-home',
  standalone: true,
  imports: [RouterLink, TranslatePipe, StudioSubNavComponent],
  templateUrl: './studio-home.component.html',
  styleUrl: './studio-home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioHomeComponent {
  readonly sections = SECTIONS;
}
