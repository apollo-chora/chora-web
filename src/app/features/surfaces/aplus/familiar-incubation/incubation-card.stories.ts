/**
 * IncubationCardComponent stories — F-I2 (CHO-2089, ADR-228 incubation arc).
 *
 * The pre-hatch incubation card: mystery-species egg, warming bar (exp / hatch
 * threshold), bound-goal name, and the stirring → hatch CTA. Per
 * coding-angular-storybook: standalone isolation, services stubbed via
 * `useValue` (no real HTTP), tablet viewport, light-mode baseline.
 *
 * Variants:
 *   - FirstEggWarming : egg incubating (species a mystery until hatch), ~40% warm
 *   - Stirring        : warmth full → the "begin the Hatching" CTA appears
 *   - LoadError       : growth read failed → fail-loud banner + retry
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of, throwError } from 'rxjs';

import { IncubationCardComponent } from './incubation-card.component';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { GoalService } from '../dashboard/goal/goal.service';
import type {
  FamiliarGrowthState,
  FamiliarSummary,
} from '../../../../core/familiar/familiar-growth.model';
import type { GoalDTO } from '../dashboard/goal/goal.model';

const FAMILIAR_ID = '00000000-0000-7000-8000-00000000e990';

function egg(overrides: Partial<FamiliarGrowthState> = {}): FamiliarGrowthState {
  return {
    familiarId: FAMILIAR_ID,
    growthStage: 0,
    stageName: 'egg',
    species: '',
    shinyVariant: false,
    rarity: '',
    expCurrent: 10,
    expNextThreshold: 0,
    expCumulative: 10,
    effectiveLlmTier: 'flash-lite',
    effectiveMaxOutputTokens: 512,
    unlockedTools: [],
    resonantAtomId: '',
    ahaMomentConsumed: false,
    ahaMomentActiveUntil: null,
    hatchedAt: null,
    lastStageUpAt: null,
    displayName: '',
    ...overrides,
  };
}

const BOUND_GOAL: GoalDTO = {
  goalId: 'goal-1',
  kind: 'cert',
  conceptSet: [],
  status: 'active',
  northStarNote: 'Pass PSLE Science',
  attachedFamiliarId: FAMILIAR_ID,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
};

interface StubOpts {
  readonly growth?: FamiliarGrowthState;
  readonly growthError?: boolean;
  readonly roster?: readonly FamiliarSummary[];
  readonly goals?: readonly GoalDTO[];
}

function providers(opts: StubOpts) {
  const growthStub = {
    getGrowth: () =>
      opts.growthError ? throwError(() => ({ status: 500 })) : of(opts.growth ?? egg()),
    listMyFamiliars: () => of(opts.roster ?? []),
  } as unknown as FamiliarGrowthService;
  const goalStub = {
    load: () => undefined,
    goals: signal<readonly GoalDTO[]>(opts.goals ?? []).asReadonly(),
  } as unknown as GoalService;
  return [
    { provide: FamiliarGrowthService, useValue: growthStub },
    { provide: GoalService, useValue: goalStub },
  ];
}

function story(opts: StubOpts): StoryObj<IncubationCardComponent> {
  return {
    decorators: [
      moduleMetadata({ imports: [RouterModule.forRoot([])], providers: providers(opts) }),
    ],
    render: () => ({
      props: { familiarId: FAMILIAR_ID },
      template: `<div style="max-width:420px;margin:2rem auto;"><chora-aplus-incubation-card [familiarId]="familiarId" /></div>`,
    }),
  };
}

const meta: Meta<IncubationCardComponent> = {
  title: 'A+ / Familiar / Incubation Card',
  component: IncubationCardComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tablet' },
    docs: {
      description: {
        component:
          'F-I2 pre-hatch incubation card (ADR-228). Mystery-species egg + ' +
          'warming bar (incubation EXP / hatch threshold) + bound-goal name; ' +
          'once warm it stirs and offers the Hatching CTA. The species stays a ' +
          'mystery until the companion hatches (the ceremony reveal shows it).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<IncubationCardComponent>;

export const FirstEggWarming: Story = story({
  growth: egg({ expCurrent: 10 }),
  goals: [BOUND_GOAL],
});

export const Stirring: Story = story({
  growth: egg({ expCurrent: 25 }),
  goals: [BOUND_GOAL],
});

export const LoadError: Story = story({ growthError: true });
