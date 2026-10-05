/**
 * Storybook states for the A+ compass bar (Track U Phase C, C2).
 *
 * The compass replaces the 280px sidebar on A+ only, so it is the navigation a
 * learner sees on every A+ screen. Its whole visible behaviour is a FILTER: the
 * six configured entries pass through `isNavItemVisible` and what survives is
 * what the session may see. So the states worth rendering are the different
 * SESSIONS, not different props, and each story here provides a different
 * `RbacService` rather than describing a role it does not show.
 *
 * That is why the real component is mounted with stubbed services instead of a
 * demo host: the filter is the thing under review, and a host that hard-coded
 * entries would render a compass no session can actually produce.
 *
 * These are also the axe surface for the pattern. The bar is a `<nav>` of
 * anchors with `aria-current` on the active one, checked once here rather than
 * inside every A+ screen that mounts it.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideRouter } from '@angular/router';

import { CompassBarComponent } from './compass-bar.component';
import { FeatureFlagService } from '../../../core/services/feature-flag.service';
import { RbacService } from '../../../core/services/rbac.service';

/**
 * A session, expressed the way the filter reads one: the capabilities it holds
 * and the add-on codes its tenant is entitled to.
 *
 * Both are fail-closed in the real predicate, so a story that forgot to grant
 * something renders FEWER entries rather than more, which is the safe direction
 * for a screenshot to be wrong in.
 */
function session(caps: readonly string[], addOns: readonly string[] = []) {
  return [
    {
      provide: RbacService,
      useValue: {
        hasCapability: (c: string) => caps.includes(c),
        hasRole: (r: string) => caps.includes(`role:${r}`),
      },
    },
    {
      provide: FeatureFlagService,
      useValue: { isEnabled: (code: string) => addOns.includes(code) },
    },
  ];
}

const meta: Meta<CompassBarComponent> = {
  title: 'A+ Shell/Compass Bar',
  component: CompassBarComponent,
  parameters: {
    a11y: { element: '#storybook-root' },
    docs: {
      description: {
        component:
          'The A+ navigation, replacing the sidebar on that surface only. Six ' +
          'entries pass through the SAME `isNavItemVisible` predicate the ' +
          'sidebar uses, so a fail-closed fix applied to one navigation ' +
          'cannot miss the other. Create is capability-gated on ' +
          '`assessment:author` and keeps its designed slot between Courses ' +
          'and Wallet rather than being appended when it appears. There is ' +
          'deliberately NO add-on-gated entry: per R39 a learner reaches C+ ' +
          'through the hand-offs and the atom exit, never through a door in ' +
          'the shell chrome, so no story here can produce a seventh entry.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<CompassBarComponent>;

/**
 * The learner: five entries, no Create.
 *
 * This is the overwhelmingly common session and the one a reviewer should check
 * first. It is also the empty-payload case, since a learner here holds no
 * capability and no entitlement at all, and it still renders five entries
 * because the ungated entries are ungated. Two things at once, and they are the
 * same state: an earlier draft of this file shipped them as two stories, which
 * is precisely the "describing a state it does not show" failure the file's own
 * header warns about.
 *
 * Create is absent because `assessment:author` is absent, which is the
 * fail-closed arm working rather than a missing entry. A bar that emptied here
 * would strand a session the route guards would have admitted.
 */
export const Learner: Story = {
  decorators: [applicationConfig({ providers: [provideRouter([]), ...session([])] })],
};

/**
 * The author: six entries, with Create in its designed slot between Courses
 * and Wallet.
 *
 * Worth rendering beside the learner because the interesting property is
 * POSITION, not presence: a filter that partitioned rather than preserving
 * order would put Create after Wallet and still pass a "the entry is there"
 * check.
 */
export const Author: Story = {
  decorators: [
    applicationConfig({
      providers: [provideRouter([]), ...session(['assessment:author'])],
    }),
  ],
};

/**
 * A session holding an unrelated capability and an unrelated add-on.
 *
 * Renders identically to the learner, and that is the point: the bar carries no
 * add-on gate at all, so an entitlement can never add a door here. If this
 * story ever grows a seventh entry, R39 has been broken.
 */
export const UnrelatedGrantsChangeNothing: Story = {
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        ...session(['course:author', 'tenant:manage'], ['cplus_social']),
      ],
    }),
  ],
};
