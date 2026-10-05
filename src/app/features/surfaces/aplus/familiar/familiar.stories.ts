/**
 * FamiliarComponent stories — A+ F5 un-mock (Familiar profile, real signal).
 *
 * Focus: the PROFILE-mode view + the F5 Memory Bank panel fed by the real
 * `FamiliarService` instance signal (`GET /api/v1/me/familiars/{id}`).
 *
 * Variants (light-mode baseline only per coding-angular-storybook):
 *   - MemoryRecap      : Memory Bank recap text present
 *   - MemoryEmpty      : instance loaded, no memory_summary → graceful empty
 *   - MemoryError      : instance GET failed → fail-loud banner + retry CTA
 *
 * Per coding-angular-storybook: standalone-component isolation, stub the
 * injected services via `useValue` (no real HTTP), tablet viewport. The
 * ADR-149 growth view is fed by a stubbed FamiliarGrowthService.getGrowth.
 */
import type { Meta, StoryObj } from '@storybook/angular';
import { signal, computed } from '@angular/core';
import { ActivatedRoute, RouterModule, convertToParamMap } from '@angular/router';
import { EMPTY, of } from 'rxjs';

import { FamiliarComponent } from './familiar.component';
import { FamiliarService } from './familiar.service';
import type { FamiliarProfile, FamiliarProfileState } from './familiar.model';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { ActiveFamiliarService } from '../../../../core/familiar/active-familiar.service';
import { FamiliarRealtimeService } from '../../../../core/familiar/familiar-realtime.service';
import type { FamiliarGrowthState } from '../../../../core/familiar/familiar-growth.model';

const FAMILIAR_ID = '00000000-0000-7000-8000-00000000e1a0';

// ── Eira Stage-2 Drakeling Dragon (ADR-149 growth view) ───────────────
const EIRA_GROWTH: FamiliarGrowthState = {
  familiarId: FAMILIAR_ID,
  growthStage: 2,
  stageName: 'fledgling',
  species: 'dragon',
  shinyVariant: false,
  rarity: 'common',
  expCurrent: 120,
  expNextThreshold: 200,
  expCumulative: 120,
  effectiveLlmTier: 'flash-lite',
  effectiveMaxOutputTokens: 1024,
  unlockedTools: ['cite_atom'],
  resonantAtomId: '00000000-0000-7000-8000-00000000a0a2',
  ahaMomentConsumed: false,
  ahaMomentActiveUntil: null,
  hatchedAt: '2026-05-13T00:00:00Z',
  lastStageUpAt: null,
  displayName: 'Eira',
};

// ── Base instance identity (real FamiliarInstanceResponse shape) ──────
const EIRA_INSTANCE: FamiliarProfile = {
  familiarId: FAMILIAR_ID,
  tenantId: '00000000-0000-7000-8000-0000000000a1',
  ownerGcid: '00000000-0000-7000-8000-0000000000b2',
  name: 'Eira',
  specialization: 'cspo',
  evolutionTier: 'apprentice',
  skillSlotsUnlocked: 1,
  memoryContextCapacity: 1000,
  skillGrants: [],
  configuredRules: {},
  memoryBankAppName: `familiar:${FAMILIAR_ID}`,
  createdAt: '2026-05-13T00:00:00.000000Z',
  updatedAt: '2026-05-14T00:00:00.000000Z',
};

function stubFamiliarService(state: FamiliarProfileState): Partial<FamiliarService> {
  const _state = signal(state);
  const profile = computed<FamiliarProfile | undefined>(() => {
    const s = _state();
    return s.status === 'success' ? s.profile : undefined;
  });
  return {
    state: _state.asReadonly(),
    profile,
    // Stub: stories preset `state` directly; no real fetch.
    loadProfile: (_id: string): void => void _id,
    getMyFamiliars: () => of([]),
  } as unknown as Partial<FamiliarService>;
}

const stubGrowthService = {
  getGrowth: () => of(EIRA_GROWTH),
  listMyFamiliars: () => of([]),
} as unknown as FamiliarGrowthService;

const stubActiveService = {
  active: signal<FamiliarGrowthState | null>(EIRA_GROWTH).asReadonly(),
} as unknown as ActiveFamiliarService;

const stubRealtimeService = {
  stageTransition$: EMPTY,
  sourceRevelation$: EMPTY,
} as unknown as FamiliarRealtimeService;

const routeProvider = {
  provide: ActivatedRoute,
  useValue: {
    paramMap: of(convertToParamMap({ familiarId: FAMILIAR_ID })),
    snapshot: { paramMap: convertToParamMap({ familiarId: FAMILIAR_ID }) },
  },
};

function render(profileState: FamiliarProfileState) {
  return {
    props: {},
    moduleMetadata: {
      imports: [FamiliarComponent, RouterModule.forRoot([])],
      providers: [
        { provide: FamiliarService, useValue: stubFamiliarService(profileState) },
        { provide: FamiliarGrowthService, useValue: stubGrowthService },
        { provide: ActiveFamiliarService, useValue: stubActiveService },
        { provide: FamiliarRealtimeService, useValue: stubRealtimeService },
        routeProvider,
      ],
    },
    template: '<chora-aplus-familiar />',
  };
}

const meta: Meta<FamiliarComponent> = {
  title: 'A+ / Familiar / Profile',
  component: FamiliarComponent,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'tablet' },
    docs: {
      description: {
        component:
          'A+ Familiar PROFILE view (ADR-149 growth axis) with the F5 ' +
          'Memory Bank panel fed by the real FamiliarService instance ' +
          'signal (GET /api/v1/me/familiars/{id}). The Memory Bank panel ' +
          'renders the optional memory_summary recap, a graceful empty ' +
          'state when absent, or a fail-loud error banner with a retry CTA.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<FamiliarComponent>;

export const MemoryRecap: Story = {
  name: 'Memory Bank — recap present',
  render: () =>
    render({
      status: 'success',
      profile: {
        ...EIRA_INSTANCE,
        memorySummary:
          'Helped you nail the CSPO atom with 98% retention, and queued ' +
          'two overdue Sprint Review atoms for tomorrow.',
      },
    }),
};

export const MemoryEmpty: Story = {
  name: 'Memory Bank — graceful empty',
  render: () => render({ status: 'success', profile: EIRA_INSTANCE }),
};

export const MemoryError: Story = {
  name: 'Memory Bank — fail-loud error + retry',
  render: () =>
    render({ status: 'error', error: 'aplus.familiar.error_upstream' }),
};
