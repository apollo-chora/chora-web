/**
 * Storybook states for the HUD party strip (Track U Phase C, C2).
 *
 * One portrait per companion, bottom left, on every A+ screen. Each links to
 * the goal map its companion is stationed on, or to the roster otherwise.
 *
 * The states worth rendering are the THREE STATION ARMS, not three roster
 * sizes. Where a companion is stationed is answered by `core/familiar/station`,
 * which the roster and the dashboard cast card also call, and it has three
 * answers rather than two: stationed, unstationed, and UNKNOWN when the maps
 * read has not reported. That third arm is the one worth looking at, because
 * the difference between "not on a map" and "we have not found out" is
 * invisible in a screenshot unless the tooltip is read, and the whole reason
 * this strip takes a `MapsReport` instead of a `MapCard[]` is that a bare array
 * cannot express it.
 *
 * ⚠ Like the quest stack, these render at the canvas's width and the strip is
 * desktop-only above 1280px. A narrow canvas shows the tablet, where the
 * bottom-left region is hidden entirely.
 */
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';

import { HudComponent } from './hud.component';
import { HomeCardsService } from '../../../features/home/home-cards.service';
import { DashboardService } from '../../../features/surfaces/aplus/dashboard/dashboard.service';
import { MapsService } from '../../../features/surfaces/aplus/my-knowledge/maps.service';
import { MapLayersService } from '../../../features/surfaces/aplus/my-knowledge/map-layers.service';
import { ActiveFamiliarService } from '../../../core/familiar/active-familiar.service';
import type { FamiliarRosterItem } from '../../../features/surfaces/aplus/dashboard/dashboard.model';
import type { MapCard, MapsState } from '../../../features/surfaces/aplus/my-knowledge/maps.model';

function member(over: Partial<FamiliarRosterItem> = {}): FamiliarRosterItem {
  return {
    familiar_id: 'f1',
    name: 'Vex',
    species: 'fox',
    evolution_level: 2,
    stage_label: 'fledgling',
    ...over,
  };
}

function map(over: Partial<MapCard> = {}): MapCard {
  return {
    goalId: 'g1',
    title: 'Fractions',
    northStarNote: '',
    kind: 'concept',
    status: 'active',
    conceptCount: 4,
    shakyCount: 1,
    masteredCount: 2,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

/**
 * The HUD's dependencies, with the roster and the maps read as the variables
 * and the quest stack pinned empty so the eye goes to the strip.
 *
 * `mapsStatus` is the point of the harness: `'success'` makes the read
 * REPORTED, anything else leaves it unreported, which is what produces the
 * unknown arm. Passing the cards through a bare list here would have made that
 * state unreachable from a story, which is how it would go unreviewed.
 */
function providers(opts: {
  roster?: readonly FamiliarRosterItem[];
  maps?: readonly MapCard[];
  mapsStatus?: 'success' | 'loading' | 'error';
}) {
  const status = opts.mapsStatus ?? 'success';
  const mapsState = (
    status === 'success' ? { status, maps: opts.maps ?? [] } : { status }
  ) as unknown as MapsState;
  return [
    provideRouter([]),
    provideHttpClient(),
    {
      provide: DashboardService,
      useValue: { summary: () => ({ familiars: opts.roster ?? [] }) },
    },
    {
      provide: MapsService,
      useValue: {
        state: signal(mapsState).asReadonly(),
        maps: () => (status === 'success' ? (opts.maps ?? []) : []),
        load: () => undefined,
      },
    },
    {
      provide: HomeCardsService,
      useValue: {
        state: () => 'ready',
        cards: () => [],
        unplaced: () => [],
        absent: () => [],
        cardContext: () => ({}),
        ensureLoaded: () => undefined,
      },
    },
    {
      provide: MapLayersService,
      useValue: {
        lens: signal('explore').asReadonly(),
        roadsVisible: signal(false).asReadonly(),
        setLens: () => undefined,
        toggleRoads: () => undefined,
      },
    },
    {
      provide: ActiveFamiliarService,
      useValue: {
        active: signal(null).asReadonly(),
        mood: signal('curious').asReadonly(),
      },
    },
  ];
}

const meta: Meta<HudComponent> = {
  title: 'A+ Shell/HUD Party Strip',
  component: HudComponent,
  parameters: {
    a11y: { element: '#storybook-root' },
    docs: {
      description: {
        component:
          'One portrait per companion, each a link to the goal map it is ' +
          'stationed on or to the roster otherwise. A navigation strip over ' +
          'reads the shell already holds, not a fourth companion surface: the ' +
          'roster comes from the dashboard summary the yields strip loads ' +
          'globally, and the station is resolved by the SAME helper the ' +
          'roster page and the dashboard cast card call, so three surfaces ' +
          'cannot answer "where is this companion" differently.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<HudComponent>;

/**
 * A mixed party: one stationed, two not. The common shape.
 *
 * The stationed portrait carries a ring AND says so in its accessible name;
 * the state is never carried by colour alone.
 */
export const MixedParty: Story = {
  decorators: [
    applicationConfig({
      providers: providers({
        roster: [
          member({ familiar_id: 'f1', name: 'Vex' }),
          member({ familiar_id: 'f2', name: 'Ash', species: 'owl' }),
          member({ familiar_id: 'f3', name: 'Sol', species: 'dragon' }),
        ],
        maps: [map({ goalId: 'g9', title: 'Fractions', attachedFamiliarId: 'f2' })],
      }),
    }),
  ],
};

/** Every companion stationed, each on its own map. */
export const AllStationed: Story = {
  decorators: [
    applicationConfig({
      providers: providers({
        roster: [
          member({ familiar_id: 'f1', name: 'Vex' }),
          member({ familiar_id: 'f2', name: 'Ash', species: 'owl' }),
        ],
        maps: [
          map({ goalId: 'gA', title: 'Fractions', attachedFamiliarId: 'f1' }),
          map({ goalId: 'gB', title: 'Cell Biology', attachedFamiliarId: 'f2' }),
        ],
      }),
    }),
  ],
};

/**
 * The maps read has NOT reported: every station is UNKNOWN.
 *
 * The portraits still render and still go somewhere live, the roster, but none
 * of them claims anything about a station: the accessible name is the bare
 * name, never "not on a map". This is the state a bare `MapCard[]` could not
 * have expressed, and it would have rendered identically to AllUnstationed
 * below while asserting something nobody had checked.
 */
export const StationUnknown: Story = {
  decorators: [
    applicationConfig({
      providers: providers({
        mapsStatus: 'loading',
        roster: [
          member({ familiar_id: 'f1', name: 'Vex' }),
          member({ familiar_id: 'f2', name: 'Ash', species: 'owl' }),
        ],
      }),
    }),
  ],
};

/**
 * The read reported and there are no maps: every companion is CONFIRMED
 * unstationed.
 *
 * Worth putting next to StationUnknown, because the two look nearly alike and
 * mean opposite things. The difference is in the accessible name and the ring.
 */
export const AllUnstationed: Story = {
  decorators: [
    applicationConfig({
      providers: providers({
        maps: [],
        roster: [
          member({ familiar_id: 'f1', name: 'Vex' }),
          member({ familiar_id: 'f2', name: 'Ash', species: 'owl' }),
        ],
      }),
    }),
  ],
};

/**
 * A single companion, and a name that has not resolved.
 *
 * The portrait falls back to a neutral glyph rather than rendering an empty
 * circle, and it never prints the id: a UUID is not a portrait.
 */
export const UnresolvedName: Story = {
  decorators: [
    applicationConfig({
      providers: providers({
        roster: [member({ familiar_id: 'f1', name: '' })],
        maps: [],
      }),
    }),
  ],
};

/** No companions: no strip at all, rather than an empty frame. */
export const EmptyRoster: Story = {
  decorators: [applicationConfig({ providers: providers({ roster: [], maps: [] }) })],
};
