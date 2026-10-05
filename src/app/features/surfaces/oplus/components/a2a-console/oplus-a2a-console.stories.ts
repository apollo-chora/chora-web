/**
 * Storybook variants for `OplusA2aConsoleComponent`. Includes the
 * pending-banner variant that fires when the BFF reports
 * `mode: 'pending'` (chora-a2a backend not LIVE yet).
 */
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';

import { OplusA2aConsoleComponent } from './oplus-a2a-console.component';
import { GovernanceService } from '../../../../../core/services/governance.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import {
  GovernanceServiceStub,
  FIXTURE_A2A_LIVE,
  FIXTURE_A2A_PENDING,
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

const meta: Meta<OplusA2aConsoleComponent> = {
  title: 'Surfaces/O+/A2A Console',
  component: OplusA2aConsoleComponent,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'O+ A2A console — external contracts, identities, invocation audit. Live or pending mode based on chora-a2a deployment status.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<OplusA2aConsoleComponent>;

export const Live: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setA2a(liveState(FIXTURE_A2A_LIVE))),
    }),
  ],
};

export const PendingMode: Story = {
  name: 'Pending (chora-a2a backend not LIVE yet)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setA2a(liveState(FIXTURE_A2A_PENDING))),
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setA2a(loadingState())),
    }),
  ],
};

export const Stale: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setA2a(staleState(FIXTURE_A2A_LIVE))),
    }),
  ],
};

export const ErrorServer: Story = {
  name: 'Error (5xx, no cache)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setA2a(errorState('server', 503))),
    }),
  ],
};

export const ErrorAuditorRequired: Story = {
  name: 'Error (403 auditor required)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setA2a(errorState('forbidden', 403))),
    }),
  ],
};
