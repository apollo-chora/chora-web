/**
 * Storybook variants for `OplusDashboardComponent` — the consolidated O+
 * governance page (IMDA traffic-light panels + rubric drill-down + header
 * extras). Covers Loading / Live / Stale / Error / EmptyRubric states.
 *
 * Each story injects a `GovernanceServiceStub` pre-loaded with the relevant
 * `dimensions()` (panels) + `dashboard()` (header chip/counter) signal state.
 * Visual regression baselines regenerate on the first Chromatic push (ADR-160).
 */
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';

import { OplusDashboardComponent } from './oplus-dashboard.component';
import { GovernanceService } from '../../../../../core/services/governance.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import {
  GovernanceServiceStub,
  FIXTURE_DASHBOARD,
  FIXTURE_DIMENSIONS,
  liveState,
  staleState,
  errorState,
  loadingState,
} from '../../testing/governance.fixtures';

function makeProviders(stubSetup: (s: GovernanceServiceStub) => void) {
  const stub = new GovernanceServiceStub();
  stubSetup(stub);
  return [
    provideHttpClient(),
    TranslateService,
    { provide: GovernanceService, useValue: stub },
  ];
}

const meta: Meta<OplusDashboardComponent> = {
  title: 'Surfaces/O+/Dashboard',
  component: OplusDashboardComponent,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'O+ AI Governance Dashboard — the single governance page. Per-dimension IMDA D1-D4 traffic-light panels + rubric drill-down (from `dimensions()`), with a header LIVE/STALE/OFFLINE/LOADING badge, Compliant/Review chip + Recent-decisions counter (from `dashboard()`). Hydrated by `GovernanceService` (polled every 30s).',
      },
    },
  },
};
export default meta;

type Story = StoryObj<OplusDashboardComponent>;

export const Live: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => {
        s.setDimensions(liveState(FIXTURE_DIMENSIONS));
        s.setDashboard(liveState(FIXTURE_DASHBOARD));
      }),
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => {
        s.setDimensions(loadingState());
        s.setDashboard(loadingState());
      }),
    }),
  ],
};

export const Stale: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => {
        s.setDimensions(staleState(FIXTURE_DIMENSIONS));
        s.setDashboard(staleState(FIXTURE_DASHBOARD));
      }),
    }),
  ],
};

export const EmptyRubric: Story = {
  name: 'Empty rubric (BFF returned dimensions with empty rubric arrays)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => {
        s.setDimensions(
          liveState({
            ...FIXTURE_DIMENSIONS,
            dimensions: FIXTURE_DIMENSIONS.dimensions.map((d) => ({
              ...d,
              rubric_items: [],
            })),
          }),
        );
        s.setDashboard(liveState(FIXTURE_DASHBOARD));
      }),
    }),
  ],
};

export const ErrorServer: Story = {
  name: 'Error (5xx, no cache)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setDimensions(errorState('server', 503))),
    }),
  ],
};

export const ErrorAuditorRequired: Story = {
  name: 'Error (403 auditor required)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setDimensions(errorState('forbidden', 403))),
    }),
  ],
};
