import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { HudComponent } from './hud.component';
import { MapsService } from '../../../features/surfaces/aplus/my-knowledge/maps.service';
import { ActiveFamiliarService } from '../../../core/familiar/active-familiar.service';
import { MapLayersService } from '../../../features/surfaces/aplus/my-knowledge/map-layers.service';
import type { MapLens } from '../../../features/surfaces/aplus/my-knowledge/map-layers.service';
import type { MapsState } from '../../../features/surfaces/aplus/my-knowledge/maps.model';
import { HomeCardsService } from '../../../features/home/home-cards.service';
import { DashboardService } from '../../../features/surfaces/aplus/dashboard/dashboard.service';
import type { HomeCard } from '../../../features/home/home-card.rank';
import type { HomeCardsState } from '../../../features/home/home-cards.service';
import type { FamiliarRosterItem } from '../../../features/surfaces/aplus/dashboard/dashboard.model';

let loadCalls = 0;
/** How many times the HUD asked C1b's cards service to load. */
let ensureLoadedCalls = 0;
/** How many times the HUD asked the DASHBOARD to load. Must stay ZERO: the
 *  yields strip is that read's global loader and a second one is a second
 *  request for something the shell already holds. */
let dashboardLoadCalls = 0;
/** What the HUD asked the single owner of the two map switches to do. */
let layerCalls: string[] = [];
let lensSignal = signal<MapLens>('explore');
let roadsSignal = signal<boolean>(false);

/** What the quest stack and party strip are given, all optional. */
interface HudReads {
  readonly cardsState?: HomeCardsState;
  readonly cards?: readonly HomeCard[];
  readonly unplaced?: readonly HomeCard[];
  readonly cardContext?: Record<string, unknown>;
  readonly roster?: readonly FamiliarRosterItem[];
}

function setup(url: string, mapsState: MapsState, reads: HudReads = {}): HTMLElement {
  TestBed.resetTestingModule();
  loadCalls = 0;
  ensureLoadedCalls = 0;
  dashboardLoadCalls = 0;
  layerCalls = [];
  lensSignal = signal<MapLens>('explore');
  roadsSignal = signal<boolean>(false);
  const state = signal<MapsState>(mapsState);
  const events$ = new Subject<unknown>();
  TestBed.configureTestingModule({
    imports: [HudComponent],
    providers: [
      provideRouter([]),
      {
        provide: MapsService,
        useValue: {
          state: state.asReadonly(),
          maps: () =>
            state().status === 'success'
              ? (state() as unknown as { maps: unknown[] }).maps
              : [],
          load: () => {
            loadCalls += 1;
          },
        },
      },
      {
        provide: HomeCardsService,
        useValue: {
          state: () => reads.cardsState ?? 'ready',
          cards: () => reads.cards ?? [],
          unplaced: () => reads.unplaced ?? [],
          absent: () => [],
          cardContext: () => reads.cardContext ?? {},
          ensureLoaded: () => {
            ensureLoadedCalls += 1;
          },
          load: () => {
            throw new Error('the HUD must call ensureLoaded, never load');
          },
        },
      },
      {
        provide: DashboardService,
        useValue: {
          summary: () => ({ familiars: reads.roster ?? [] }),
          load: () => {
            dashboardLoadCalls += 1;
          },
        },
      },
      {
        provide: ActiveFamiliarService,
        useValue: { active: signal(null).asReadonly(), mood: signal('curious').asReadonly() },
      },
      {
        provide: MapLayersService,
        useValue: {
          lens: lensSignal.asReadonly(),
          roadsVisible: roadsSignal.asReadonly(),
          setLens: (l: MapLens) => {
            layerCalls.push(`setLens:${l}`);
            lensSignal.set(l);
          },
          setRoadsVisible: (v: boolean) => {
            layerCalls.push(`setRoadsVisible:${v}`);
            roadsSignal.set(v);
          },
          toggleRoads: () => {
            layerCalls.push('toggleRoads');
            roadsSignal.update((v) => !v);
          },
          resetFor: (g: string) => layerCalls.push(`resetFor:${g}`),
        },
      },
    ],
  });
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'url', 'get').mockReturnValue(url);
  Object.defineProperty(router, 'events', { value: events$.asObservable(), configurable: true });
  const fixture = TestBed.createComponent(HudComponent);
  fixture.detectChanges();
  events$.next(new NavigationEnd(1, url, url));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const withMaps = (n: number): MapsState => ({
  status: 'success',
  maps: Array.from({ length: n }, (_, i) => ({ goalId: `g${i}` })) as never,
  // C4 slice 4: a successful Atlas read reports whether the cooling counts were
  // read. False here means they WERE, which is what these HUD fixtures assume.
  coolingPartial: false,
});
const mapsError: MapsState = { status: 'error', errorKey: 'x' };
const mapsLoading: MapsState = { status: 'loading' };

describe('HudComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the maps read itself', () => {
    setup('/a/knowledge', withMaps(2));
    expect(loadCalls).toBe(1);
  });

  it('shows the turn action bottom right', () => {
    const el = setup('/a/wallet', withMaps(2));
    const turn = el.querySelector('[data-testid="hud-turn-action"]');
    expect(turn).toBeTruthy();
    expect(turn?.getAttribute('href')).toBe('/a/daily-dose');
  });

  it('offers the seed on day one', () => {
    const el = setup('/a/wallet', withMaps(0));
    expect(el.querySelector('[data-testid="hud-turn-action"]')?.getAttribute('href')).toBe(
      '/a/knowledge',
    );
  });

  it('does NOT offer the seed when the maps read failed', () => {
    const el = setup('/a/wallet', mapsError);
    expect(el.querySelector('[data-testid="hud-turn-action"]')?.getAttribute('href')).toBe(
      '/a/daily-dose',
    );
  });

  it('does NOT offer the seed while the maps read is still loading', () => {
    const el = setup('/a/wallet', mapsLoading);
    expect(el.querySelector('[data-testid="hud-turn-action"]')?.getAttribute('href')).toBe(
      '/a/daily-dose',
    );
  });

  it('stands down inside a dose, where the screen owns its primary action', () => {
    const el = setup('/a/daily-dose', withMaps(2));
    expect(el.querySelector('[data-testid="hud-turn-action"]')).toBeNull();
  });

  it('offers a Map jump bottom left', () => {
    const el = setup('/a/wallet', withMaps(2));
    expect(el.querySelector('[data-testid="hud-map-jump"]')?.getAttribute('href')).toBe(
      '/a/knowledge',
    );
  });

  it('marks the mini world so it can be hidden below 1280px', () => {
    // Plan section 3.1: the mini world and the quest stack are desktop-only.
    // Asserted as a class rather than a computed width, because the breakpoint
    // is a media query and jsdom reports no layout.
    const el = setup('/a/wallet', withMaps(2));
    expect(el.querySelector('.hud__world')).toBeTruthy();
  });

  it('carries the companion dock', () => {
    const el = setup('/a/wallet', withMaps(2));
    expect(el.querySelector('chora-companion-dock')).toBeTruthy();
  });

  it('is a complementary landmark with a name, not an unlabelled div', () => {
    const el = setup('/a/wallet', withMaps(2));
    const hud = el.querySelector('[data-testid="hud"]');
    expect(hud?.getAttribute('role')).toBe('complementary');
    expect(hud?.getAttribute('aria-label')).toBeTruthy();
  });

  it('recomputes the turn action when the route changes', () => {
    // The action is route-derived, so a navigation that does not re-create the
    // component must still move it.
    const el = setup('/a/daily-dose', withMaps(2));
    expect(el.querySelector('[data-testid="hud-turn-action"]')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// World controls, bottom left. The lens and Roads switches while ON a map,
// driven through C4's MapLayersService so there is ONE owner of both.
// ─────────────────────────────────────────────────────────────────────────
describe('HudComponent world controls', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('shows the lens controls while on a map', () => {
    const el = setup('/a/knowledge/goal-42', withMaps(2));
    expect(el.querySelectorAll('[data-testid^="hud-lens-"]')).toHaveLength(4);
    expect(el.querySelector('[data-testid="hud-roads-toggle"]')).toBeTruthy();
  });

  it('shows NO lens controls on the atlas, which is not a map', () => {
    const el = setup('/a/knowledge', withMaps(2));
    expect(el.querySelectorAll('[data-testid^="hud-lens-"]')).toHaveLength(0);
    expect(el.querySelector('[data-testid="hud-roads-toggle"]')).toBeNull();
  });

  it('shows NO lens controls off the knowledge surface', () => {
    const el = setup('/a/wallet', withMaps(2));
    expect(el.querySelectorAll('[data-testid^="hud-lens-"]')).toHaveLength(0);
  });

  it('keeps the Map jump available on a map as well as off it', () => {
    const el = setup('/a/knowledge/goal-42', withMaps(2));
    expect(el.querySelector('[data-testid="hud-map-jump"]')).toBeTruthy();
  });

  it('sets the lens through the shared service, and sets ONLY the lens', () => {
    // The growth lens lazily loads growth edges by an effect on the signal
    // (owner ruling D3), so the HUD must set the lens and do nothing else. A
    // second call here would double-fire that load.
    const el = setup('/a/knowledge/goal-42', withMaps(2));
    const growth = el.querySelector<HTMLButtonElement>('[data-testid="hud-lens-growth"]');
    growth?.click();
    expect(layerCalls).toEqual(['setLens:growth']);
  });

  it('toggles Roads through the shared service', () => {
    const el = setup('/a/knowledge/goal-42', withMaps(2));
    el.querySelector<HTMLButtonElement>('[data-testid="hud-roads-toggle"]')?.click();
    expect(layerCalls).toEqual(['toggleRoads']);
  });

  it('NEVER calls resetFor: the canvas owns that on a real map change', () => {
    const el = setup('/a/knowledge/goal-42', withMaps(2));
    el.querySelector<HTMLButtonElement>('[data-testid="hud-lens-mastery"]')?.click();
    el.querySelector<HTMLButtonElement>('[data-testid="hud-roads-toggle"]')?.click();
    expect(layerCalls.some((c) => c.startsWith('resetFor'))).toBe(false);
  });

  it('marks the active lens with aria-pressed, not colour alone', () => {
    const el = setup('/a/knowledge/goal-42', withMaps(2));
    const explore = el.querySelector('[data-testid="hud-lens-explore"]');
    const growth = el.querySelector('[data-testid="hud-lens-growth"]');
    expect(explore?.getAttribute('aria-pressed')).toBe('true');
    expect(growth?.getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the Roads state with aria-pressed', () => {
    const el = setup('/a/knowledge/goal-42', withMaps(2));
    const roads = el.querySelector('[data-testid="hud-roads-toggle"]');
    expect(roads?.getAttribute('aria-pressed')).toBe('false');
  });
});

/**
 * The quest stack and the party strip (C2). Both are drawn from reads the
 * shell already holds; the RULES live in `quest-stack.ts` and `party.ts` and
 * are tested there. These assert the WIRING: what reaches the DOM, and that
 * neither region adds a fetch.
 */
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
    state: 'live',
    ...over,
  };
}

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

const READY: MapsState = { status: 'success', maps: [] } as unknown as MapsState;

describe('HudComponent quest stack', () => {
  it('draws NOTHING while the ranked read is still loading', () => {
    // An empty HUD is honest. An empty stack that looks answered would tell a
    // learner their day is clear when nobody has looked.
    const el = setup('/a/home', READY, { cardsState: 'loading', cards: [card()] });
    expect(el.querySelector('[data-testid="hud-quests"]')).toBeNull();
  });

  it('draws the cards once the read has reported', () => {
    const el = setup('/a/home', READY, { cards: [card({ cardId: 'c1' })] });
    expect(el.querySelector('[data-testid="hud-quests"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="hud-quest-c1"]')).toBeTruthy();
  });

  it('draws at most FIVE, whatever the read carries', () => {
    const el = setup('/a/home', READY, {
      cards: Array.from({ length: 9 }, (_, i) => card({ cardId: `c${i}` })),
    });
    expect(el.querySelectorAll('.hud__quest')).toHaveLength(5);
    expect(el.querySelector('[data-testid="hud-quest-c5"]')).toBeNull();
  });

  it('draws NOTHING from unplaced, even when the ranked list is empty', () => {
    // Unplaced cards are unread ones with no last known position. The home
    // shows them with that stated; the HUD has no room to state it, and a
    // silent promotion into a ranked stack would present "we could not look"
    // as "this is what matters most".
    const el = setup('/a/home', READY, {
      cards: [],
      unplaced: [card({ cardId: 'unplaced-1' })],
    });
    expect(el.querySelector('[data-testid="hud-quests"]')).toBeNull();
    expect(el.querySelector('[data-testid="hud-quest-unplaced-1"]')).toBeNull();
  });

  it('links a mounted quest and does NOT link an unmounted one', () => {
    const el = setup('/a/home', READY, {
      cards: [
        card({ cardId: 'live', route: '/a/me/assessments' }),
        card({ cardId: 'dark', route: '/a/never-mounted' }),
      ],
    });
    const live = el.querySelector('[data-testid="hud-quest-live"]');
    const dark = el.querySelector('[data-testid="hud-quest-dark"]');
    expect(live?.tagName.toLowerCase()).toBe('a');
    expect(live?.getAttribute('href')).toBe('/a/me/assessments');
    // Still news, but a link would be a dead end. The home draws it this way.
    expect(dark?.tagName.toLowerCase()).toBe('span');
    expect(dark?.getAttribute('href')).toBeNull();
  });

  it('asks the cards service to ensureLoaded, never to load', () => {
    // One payload for the home page and this stack between them. The stub
    // throws on `load`, so a regression here fails loudly rather than
    // doubling a request silently.
    setup('/a/home', READY, { cards: [card()] });
    expect(ensureLoadedCalls).toBe(1);
  });
});

describe('HudComponent party strip', () => {
  it('draws one portrait per companion', () => {
    const el = setup('/a/home', READY, {
      roster: [member({ familiar_id: 'f1' }), member({ familiar_id: 'f2', name: 'Ash' })],
    });
    expect(el.querySelectorAll('.hud__portrait')).toHaveLength(2);
    expect(el.querySelector('[data-testid="hud-portrait-f1"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="hud-portrait-f2"]')).toBeTruthy();
  });

  it('draws no strip at all for an empty roster', () => {
    const el = setup('/a/home', READY, { roster: [] });
    expect(el.querySelector('[data-testid="hud-party"]')).toBeNull();
  });

  it('links a stationed companion to its map and marks it stationed', () => {
    const maps = {
      status: 'success',
      maps: [{ goalId: 'g9', title: 'Fractions', attachedFamiliarId: 'f1' }],
    } as unknown as MapsState;
    const el = setup('/a/home', maps, { roster: [member({ familiar_id: 'f1' })] });
    const portrait = el.querySelector('[data-testid="hud-portrait-f1"]');
    expect(portrait?.getAttribute('href')).toBe('/a/knowledge/g9');
    expect(portrait?.getAttribute('data-station')).toBe('stationed');
  });

  it('links an UNKNOWN station to the roster and claims nothing about it', () => {
    // The maps read has not reported. Saying "not on a map" here would be
    // inventing it, and the portrait sits two pixels from a companion that may
    // well be marching.
    const el = setup('/a/home', { status: 'loading' } as unknown as MapsState, {
      roster: [member({ familiar_id: 'f1', name: 'Vex' })],
    });
    const portrait = el.querySelector('[data-testid="hud-portrait-f1"]');
    expect(portrait?.getAttribute('href')).toBe('/a/roster');
    expect(portrait?.getAttribute('data-station')).toBe('unknown');
    expect(portrait?.getAttribute('aria-label')).toBe('Vex');
  });

  it('draws the NAME initial, never the id', () => {
    const el = setup('/a/home', READY, {
      roster: [member({ familiar_id: '9f3c-uuid-like', name: 'Vex' })],
    });
    const initial = el.querySelector('[data-testid="hud-portrait-9f3c-uuid-like"] .hud__portrait-initial');
    expect(initial?.textContent?.trim()).toBe('V');
  });

  it('never loads the dashboard summary: the yields strip is its global loader', () => {
    setup('/a/home', READY, { roster: [member()] });
    expect(dashboardLoadCalls).toBe(0);
  });
});

/**
 * The HUD sits on EVERY A+ screen, so an a11y defect in it is on every A+
 * screen. The quest stack is checked in the states that actually differ in the
 * DOM: drawn with links, drawn with a non-navigable span, and absent.
 *
 * Absent is checked too rather than assumed trivially clean, because "the
 * region is not rendered" and "the region renders nothing visible" are
 * different DOM shapes and only one of them is what the loading state does.
 */
describe('HudComponent a11y (quest stack)', () => {
  async function blocking(el: HTMLElement): Promise<readonly string[]> {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(el, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return results.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`);
  }

  it('has 0 critical/serious violations with a full stack', async () => {
    const el = setup('/a/home', { status: 'success', maps: [] } as unknown as MapsState, {
      cards: Array.from({ length: 5 }, (_, i) => card({ cardId: `c${i}` })),
    });
    expect(await blocking(el)).toEqual([]);
  });

  it('has 0 critical/serious violations when a quest is unmounted (span, not link)', async () => {
    const el = setup('/a/home', { status: 'success', maps: [] } as unknown as MapsState, {
      cards: [card({ cardId: 'dark', route: '/a/not-built-yet' })],
    });
    expect(await blocking(el)).toEqual([]);
  });

  it('has 0 critical/serious violations while the read is loading', async () => {
    const el = setup('/a/home', { status: 'success', maps: [] } as unknown as MapsState, {
      cardsState: 'loading',
      cards: [card()],
    });
    expect(await blocking(el)).toEqual([]);
  });
});

/**
 * The party strip's a11y, in the states whose DOM actually differs: portraits
 * present, and the strip absent.
 *
 * The stationed case is checked separately from the unstationed one because a
 * stationed portrait carries a ring and a different accessible name, and the
 * rule the strip must not break is that the state never travels by COLOUR
 * ALONE. If the ring were the only difference, a contrast or non-text-contrast
 * finding here is the thing that would catch it.
 */
describe('HudComponent a11y (party strip)', () => {
  async function blocking(el: HTMLElement): Promise<readonly string[]> {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(el, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    return results.violations
      .filter((v) => v.impact === 'critical' || v.impact === 'serious')
      .map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`);
  }

  const STATIONED = {
    status: 'success',
    maps: [{ goalId: 'g9', title: 'Fractions', attachedFamiliarId: 'f1' }],
  } as unknown as MapsState;

  it('has 0 critical/serious violations with a stationed portrait', async () => {
    const el = setup('/a/home', STATIONED, {
      roster: [member({ familiar_id: 'f1', name: 'Vex' })],
    });
    expect(await blocking(el)).toEqual([]);
  });

  it('has 0 critical/serious violations with unstationed portraits', async () => {
    const el = setup('/a/home', { status: 'success', maps: [] } as unknown as MapsState, {
      roster: [
        member({ familiar_id: 'f1', name: 'Vex' }),
        member({ familiar_id: 'f2', name: 'Ash' }),
      ],
    });
    expect(await blocking(el)).toEqual([]);
  });

  it('has 0 critical/serious violations with no strip at all', async () => {
    const el = setup('/a/home', { status: 'success', maps: [] } as unknown as MapsState, {
      roster: [],
    });
    expect(await blocking(el)).toEqual([]);
  });
});
