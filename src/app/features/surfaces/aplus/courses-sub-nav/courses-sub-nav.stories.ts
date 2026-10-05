/**
 * Storybook states for the A+ Courses tab strip (Track U Phase C, C2 slice 3).
 *
 * The strip has exactly one piece of state, and it does not come from a prop:
 * WHICH TAB IS ACTIVE, read from the URL. So a story that only mounted the
 * component would render the same picture five times over, with no tab lit,
 * and would show nothing anyone needs to review.
 *
 * Each story therefore DRIVES THE ROUTER before the component paints, through
 * `provideAppInitializer`, the same mechanism `preview.ts` already uses to load
 * the English bundle. The URL is the state, so setting the URL is the only
 * honest way to render the state.
 *
 * The property most worth looking at is the CHILD ROUTES. `/a/courses/c1/learn`
 * lights My Courses and `/a/study/collections` lights Study, because the
 * matching is non-exact on every tab. The strip this replaced used
 * `exact: true` on two of its tabs and so lit NOTHING on exactly those pages,
 * which is where a learner spends time. That regression is invisible on the
 * tab routes themselves and obvious here.
 */
import { inject } from '@angular/core';
import { provideAppInitializer } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';

import { CoursesSubNavComponent } from './courses-sub-nav.component';

/**
 * Routes that exist only so the router has somewhere to be. Each renders the
 * strip itself, which is what a real A+ page does anyway: the five hub screens
 * all mount it at the top of their own section.
 */
const STORY_ROUTES = [
  { path: 'a/courses', component: CoursesSubNavComponent },
  { path: 'a/courses/:courseId/learn', component: CoursesSubNavComponent },
  { path: 'a/catalog', component: CoursesSubNavComponent },
  { path: 'a/study', component: CoursesSubNavComponent },
  { path: 'a/study/collections', component: CoursesSubNavComponent },
  { path: 'a/me/assessments', component: CoursesSubNavComponent },
  { path: 'a/me/transcript', component: CoursesSubNavComponent },
  { path: 'a/roster', component: CoursesSubNavComponent },
];

/** Mount the strip with the browser sitting at `url`. */
function at(url: string) {
  return applicationConfig({
    providers: [
      provideHttpClient(),
      provideRouter(STORY_ROUTES),
      provideAppInitializer(() => inject(Router).navigateByUrl(url)),
    ],
  });
}

const meta: Meta<CoursesSubNavComponent> = {
  title: 'A+/Courses Tab Strip',
  component: CoursesSubNavComponent,
  parameters: {
    a11y: { element: '#storybook-root' },
    docs: {
      description: {
        component:
          'Five tabs across the A+ course hub: My Courses, Catalog, Study, ' +
          'Assessments and Transcript. Each is a real ROUTE, so every one is ' +
          'deep-linkable and back-button-correct and the active state is read ' +
          'from the URL rather than from component state; this is navigation, ' +
          'not a mode switch. There is deliberately no Dashboard tab: ' +
          '`/a/dashboard` survives as a route but is reached from Home. ' +
          'Active matching is non-exact on every tab so a course page or a ' +
          'collections page still lights its parent.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<CoursesSubNavComponent>;

/** On the first tab. */
export const MyCoursesActive: Story = { decorators: [at('/a/courses')] };

/**
 * Reading inside a course. My Courses STAYS lit.
 *
 * This is the state the retired strip got wrong: with exact matching, a learner
 * three clicks into a course saw a strip with nothing lit and no indication of
 * where they were.
 */
export const InsideACourse: Story = {
  decorators: [at('/a/courses/c1/learn')],
};

/** On Catalog, browsing for more. */
export const CatalogActive: Story = { decorators: [at('/a/catalog')] };

/** On Study, the learner's own curated material. */
export const StudyActive: Story = { decorators: [at('/a/study')] };

/**
 * Inside Study, on Collections. Study STAYS lit.
 *
 * Collections is a Study child reached from the Study sub-nav, and it kept this
 * strip when the Learn one was retired precisely because the parent tab lights
 * here.
 */
export const InsideStudyCollections: Story = {
  decorators: [at('/a/study/collections')],
};

/** On Assessments, the learner inbox. */
export const AssessmentsActive: Story = {
  decorators: [at('/a/me/assessments')],
};

/**
 * On Transcript.
 *
 * Worth knowing while looking at it: R51 re-homes Transcript to the account hub
 * when C8 mounts `/a/account`, and the strip drops this tab in THAT commit,
 * once. Until then it belongs here.
 */
export const TranscriptActive: Story = {
  decorators: [at('/a/me/transcript')],
};

/**
 * A URL none of the five tabs owns: nothing is lit.
 *
 * The strip does not fall back to lighting the first tab, which would tell a
 * learner they are somewhere they are not. Rendered because "no tab active" is
 * a real state a reviewer should recognise as correct rather than as a bug.
 */
export const NoTabActive: Story = { decorators: [at('/a/roster')] };
