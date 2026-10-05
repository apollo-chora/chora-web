/**
 * Storybook states for the HUD quest stack (Track U Phase C, C2).
 *
 * The stack is the right-edge region of the HUD: the top five ranked home
 * cards, at a glance, on every A+ screen. Its states are all READ STATES, so
 * every story here is a different shape of the same read rather than a
 * different prop, and the four that matter are the four a learner can actually
 * be in: the read has not returned, it returned with cards, it returned with
 * nothing, and it returned something the router cannot serve.
 *
 * The whole HUD is mounted rather than a demo host, because the stack is a
 * region of it and its position relative to the dock and the turn action is
 * part of what a reviewer is checking. The other regions are stubbed to their
 * quietest state so the eye goes to the stack.
 *
 * ⚠ These render at the story canvas's width. The stack is DESKTOP-ONLY above
 * 1280px, so a narrow canvas is showing you the tablet, where the right edge
 * belongs to the turn action and the dock. That is the design, not a bug.
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
import type { HomeCard, HomeCardState } from '../../../features/home/home-card.rank';
import type { HomeCardsState } from '../../../features/home/home-cards.service';
import type { MapsState } from '../../../features/surfaces/aplus/my-knowledge/maps.model';

function card(over: Partial<HomeCard> = {}): HomeCard {
  return {
    cardId: 'c1',
    kind: 'unseen_results',
    surface: 'a',
    route: '/a/me/assessments',
    count: 2,
    deadlineAt: null,
    urgency: 3,
    warmth: 40,
    state: 'live' as HomeCardState,
    ...over,
  };
}

/** The maps read, reported and empty: the quietest the other regions get. */
const QUIET_MAPS: MapsState = { status: 'success', maps: [] } as unknown as MapsState;

/**
 * Everything the HUD injects, with the cards read as the variable and every
 * other region pinned quiet.
 *
 * The cards service stub THROWS on `load`, mirroring the component spec: the
 * HUD must call `ensureLoaded` so the home page and this stack cost one request
 * between them, and a story that quietly doubled a request would be the wrong
 * thing to screenshot.
 */
function providers(opts: {
  state?: HomeCardsState;
  cards?: readonly HomeCard[];
  unplaced?: readonly HomeCard[];
}) {
  return [
    provideRouter([]),
    provideHttpClient(),
    {
      provide: HomeCardsService,
      useValue: {
        state: () => opts.state ?? 'ready',
        cards: () => opts.cards ?? [],
        unplaced: () => opts.unplaced ?? [],
        absent: () => [],
        cardContext: () => ({}),
        ensureLoaded: () => undefined,
        load: () => {
          throw new Error('the HUD must call ensureLoaded, never load');
        },
      },
    },
    { provide: DashboardService, useValue: { summary: () => ({ familiars: [] }) } },
    {
      provide: MapsService,
      useValue: {
        state: signal(QUIET_MAPS).asReadonly(),
        maps: () => [],
        load: () => undefined,
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
  title: 'A+ Shell/HUD Quest Stack',
  component: HudComponent,
  parameters: {
    a11y: { element: '#storybook-root' },
    docs: {
      description: {
        component:
          'The top five RANKED home cards, at the right edge of every A+ ' +
          'screen. It re-decides nothing: the rank, the dropping of live ' +
          'cards at count 0 and the handling of unread ones all happen ' +
          'upstream in the aggregator and in the cards service, and the titles ' +
          'come from that same owner rather than from new copy. It reads ' +
          'through `ensureLoaded`, so the home page and this stack cost ONE ' +
          'request between them.',
      },
    },
  },
};
export default meta;

type Story = StoryObj<HudComponent>;

/** Five ranked cards: the stack doing its job. */
export const Ranked: Story = {
  decorators: [
    applicationConfig({
      providers: providers({
        cards: [
          card({ cardId: 'c1', kind: 'pending_diagnoses', count: 2, urgency: 5 }),
          card({ cardId: 'c2', kind: 'unseen_results', count: 1, urgency: 4 }),
          card({ cardId: 'c3', kind: 'continue_learning', count: 3, urgency: 3 }),
          card({ cardId: 'c4', kind: 'practice_budget', count: 7, urgency: 2 }),
          card({ cardId: 'c5', kind: 'streak_at_risk', count: 1, urgency: 1 }),
        ],
      }),
    }),
  ],
};

/**
 * Nine cards, five drawn.
 *
 * The truncation is the story: the HUD is a glance at the edge of the screen,
 * not the home page, and the home page is one click away for the rest.
 */
export const TruncatedToFive: Story = {
  decorators: [
    applicationConfig({
      providers: providers({
        cards: Array.from({ length: 9 }, (_, i) =>
          card({ cardId: `c${i}`, count: i + 1, urgency: 5 - (i % 6) }),
        ),
      }),
    }),
  ],
};

/**
 * The read has NOT returned. No stack at all, not an empty one.
 *
 * An empty HUD is honest. An empty stack that looks answered would tell a
 * learner their day is clear when nobody has looked, which is the single most
 * important thing this region gets right.
 */
export const StillLoading: Story = {
  decorators: [
    applicationConfig({
      providers: providers({ state: 'loading', cards: [card()] }),
    }),
  ],
};

/**
 * The read RETURNED and there is genuinely nothing ranked, while an unplaced
 * card exists.
 *
 * Still no stack, and the unplaced card is nowhere on screen. Unplaced means
 * unread with no last known position: the home shows those beneath the list
 * with that stated, and the HUD has no room to state it, so promoting one here
 * would present "we could not look" as "this is what matters most".
 */
export const NothingRankedButSomethingUnread: Story = {
  decorators: [
    applicationConfig({
      providers: providers({
        cards: [],
        unplaced: [card({ cardId: 'unplaced-1', kind: 'unseen_results' })],
      }),
    }),
  ],
};

/**
 * A card whose route the router cannot serve.
 *
 * It still renders, because it is still news, but as a span rather than an
 * anchor. The home draws it the same way. A link here would be a dead end, and
 * dropping the card would hide a real thing to avoid drawing a broken link.
 */
export const UnmountedDestination: Story = {
  decorators: [
    applicationConfig({
      providers: providers({
        cards: [
          card({ cardId: 'live', route: '/a/me/assessments' }),
          card({ cardId: 'dark', route: '/a/not-built-yet', kind: 'grading_queue' }),
        ],
      }),
    }),
  ],
};
