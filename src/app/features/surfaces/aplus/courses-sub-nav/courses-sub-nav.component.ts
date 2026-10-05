/**
 * CoursesSubNavComponent - the A+ Courses tab strip.
 *
 * Replaces `LearningSubNavComponent`, which was the Learn hub's strip and was
 * retired with the Learn hub itself (UX Track U, C2 slice 3, orchestrator
 * ruling 2026-09-03 option b). Five tabs:
 *   - My Courses  -> /a/courses          (the enrolled learner's courses)
 *   - Catalog     -> /a/catalog          (browse for more)
 *   - Study       -> /a/study            (the learner's own curated material)
 *   - Assessments -> /a/me/assessments   (the learner inbox)
 *   - Transcript  -> /a/me/transcript    (earned grades and certificates)
 *
 * The Dashboard tab is deliberately NOT here. `/a/dashboard` survives as a
 * route (ADR-240 D6, orchestrator ruling 2026-09-03) but it is no longer a
 * landing and it is not part of this group; it is reached from Home.
 *
 * These are NAVIGATION, not a mode switch: each tab is a real route, so every
 * one is deep-linkable, bookmarkable and back-button-correct, and the active
 * state is read from the URL rather than from component state (CLAUDE.md
 * integrative-UI mandate: role-driven visibility, no toggles).
 *
 * Active matching is NON-exact on every tab, deliberately. A learner reading
 * `/a/courses/:courseId/learn` is still inside My Courses, and
 * `/a/study/collections` is still inside Study; an exact match would light no
 * tab at all on precisely the pages a learner spends time on. The strip it
 * replaces used exact matching on two tabs and had that defect.
 *
 * No gate: none of the five destinations carries a `canActivate` in
 * `aplus.routes.ts` (verified 2026-09-03), so gating a tab here would hide a
 * door the router would happily open, which is the disagreement between two
 * navigation gates that `surface-access.ts` exists to prevent.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

/** One tab: its route, its i18n label key and its icon. */
export interface CoursesSubNavTab {
  readonly route: string;
  readonly labelKey: string;
  readonly icon: string;
  readonly testId: string;
}

/**
 * The five tabs, in the order the plan gives them: what you are doing, then
 * what you could do next, then your own material, then the outcomes.
 *
 * Exported so the strip's spec and the hub-page layout guard can both derive
 * from ONE list instead of each keeping a copy that drifts.
 */
export const COURSES_SUB_NAV_TABS: readonly CoursesSubNavTab[] = [
  {
    route: '/a/courses',
    labelKey: 'aplus.courses_sub_nav.my_courses',
    icon: 'fa-solid fa-layer-group',
    testId: 'courses-sub-nav-my-courses',
  },
  {
    route: '/a/catalog',
    labelKey: 'aplus.courses_sub_nav.catalog',
    icon: 'fa-solid fa-compass',
    testId: 'courses-sub-nav-catalog',
  },
  {
    route: '/a/study',
    labelKey: 'aplus.courses_sub_nav.study',
    icon: 'fa-solid fa-book-open',
    testId: 'courses-sub-nav-study',
  },
  {
    route: '/a/me/assessments',
    labelKey: 'aplus.courses_sub_nav.assessments',
    icon: 'fa-solid fa-clipboard-list',
    testId: 'courses-sub-nav-assessments',
  },
  {
    route: '/a/me/transcript',
    labelKey: 'aplus.courses_sub_nav.transcript',
    icon: 'fa-solid fa-graduation-cap',
    testId: 'courses-sub-nav-transcript',
  },
];

@Component({
  selector: 'chora-courses-sub-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './courses-sub-nav.component.html',
  styleUrl: './courses-sub-nav.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoursesSubNavComponent {
  readonly tabs = COURSES_SUB_NAV_TABS;
}
