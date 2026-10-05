/**
 * Storybook variants for `OplusGovernanceComponent` — 3 tabs.
 */
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';

import { OplusGovernanceComponent } from './oplus-governance.component';
import { GovernanceService } from '../../../../../core/services/governance.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import {
  GovernanceServiceStub,
  FIXTURE_GOVERNANCE,
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

const meta: Meta<OplusGovernanceComponent> = {
  title: 'Surfaces/O+/Governance Controls',
  component: OplusGovernanceComponent,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'O+ Governance Controls — 3 tabs (Decision Traces / Human Oversight / Data Governance). Per anchor #5, Approve/Reject buttons stay disabled this wave.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<OplusGovernanceComponent>;

export const Live: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setGovernance(liveState(FIXTURE_GOVERNANCE))),
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setGovernance(loadingState())),
    }),
  ],
};

export const Stale: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setGovernance(staleState(FIXTURE_GOVERNANCE))),
    }),
  ],
};

export const EmptyDecisions: Story = {
  name: 'Empty decisions queue',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) =>
        s.setGovernance(
          liveState({
            ...FIXTURE_GOVERNANCE,
            decisions: [],
            hitl_pending: [],
          }),
        ),
      ),
    }),
  ],
};

export const ErrorServer: Story = {
  name: 'Error (5xx, no cache)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setGovernance(errorState('server', 503))),
    }),
  ],
};

export const ErrorAuditorRequired: Story = {
  name: 'Error (403 auditor required)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setGovernance(errorState('forbidden', 403))),
    }),
  ],
};
