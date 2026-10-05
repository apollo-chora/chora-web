/**
 * Storybook variants for `OplusAgentsComponent` — Crews+Agents
 * accordion. Includes the EmptyCrew variant called out in plan §D4.
 */
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { provideHttpClient } from '@angular/common/http';

import { OplusAgentsComponent } from './oplus-agents.component';
import { GovernanceService } from '../../../../../core/services/governance.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import {
  GovernanceServiceStub,
  FIXTURE_AGENTS,
  FIXTURE_PROMPTS,
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

const meta: Meta<OplusAgentsComponent> = {
  title: 'Surfaces/O+/Agents (Crews+Agents)',
  component: OplusAgentsComponent,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'O+ Crews + Agents 2-level accordion. Each agent row exposes a "View in Cloud Trace ↗" deep-link button (selective deep-link policy — anchor #2).',
      },
    },
  },
};
export default meta;

type Story = StoryObj<OplusAgentsComponent>;

export const Live: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setAgents(liveState(FIXTURE_AGENTS))),
    }),
  ],
};

export const Loading: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setAgents(loadingState())),
    }),
  ],
};

export const Stale: Story = {
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setAgents(staleState(FIXTURE_AGENTS))),
    }),
  ],
};

export const EmptyCrew: Story = {
  name: 'Empty crew (no recent activity in 24h window)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) =>
        s.setAgents(
          liveState({
            ...FIXTURE_AGENTS,
            crews: FIXTURE_AGENTS.crews.map((c) => ({
              ...c,
              has_recent_activity: false,
              agents: c.agents.map((a) => ({
                ...a,
                stats: {
                  invocations_24h: 0,
                  p95_latency_ms: null,
                  refusal_rate: null,
                },
              })),
            })),
          }),
        ),
      ),
    }),
  ],
};

export const NoCrews: Story = {
  name: 'No crews registered',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) =>
        s.setAgents(
          liveState({
            fetched_at: '2026-05-26T10:00:00Z',
            crews: [],
          }),
        ),
      ),
    }),
  ],
};

export const PromptVersions: Story = {
  name: 'Prompt versions panel (ADR-197 read slice)',
  parameters: {
    docs: {
      description: {
        story:
          'CHO-2364: the standalone "Agent prompt versions" panel above the crews list, driven purely by /bff/oplus/prompts (one card per runtime-role evidence agent; registry roster ids below are a different namespace and are never decorated). qgen cards disclose the 3-lane use-case matrix, including the live shape where a lane has decisions but no version evidence; the oe pair + familiar show the designed empty chip.',
      },
    },
  },
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => {
        s.setAgents(liveState(FIXTURE_AGENTS));
        s.setPrompts(liveState(FIXTURE_PROMPTS));
      }),
    }),
  ],
};

export const PromptVersionsUnavailable: Story = {
  name: 'Prompt versions unavailable (error strip + retry)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => {
        s.setAgents(liveState(FIXTURE_AGENTS));
        s.setPrompts(errorState('server', 503));
      }),
    }),
  ],
};

export const ErrorServer: Story = {
  name: 'Error (5xx, no cache)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setAgents(errorState('server', 503))),
    }),
  ],
};

export const ErrorAuditorRequired: Story = {
  name: 'Error (403 auditor required)',
  decorators: [
    applicationConfig({
      providers: makeProviders((s) => s.setAgents(errorState('forbidden', 403))),
    }),
  ],
};
