/**
 * HudComponent - the Civilization HUD (plan section 3.1).
 *
 * Three regions anchored to the viewport on every A+ screen:
 *  - bottom left: the mini world, a Map jump and the party strip, desktop only
 *    (>=1280px)
 *  - bottom right: the companion dock above the turn action
 *  - right edge: the quest stack, desktop only
 *
 * The turn action, the quest stack and the party strip are each resolved by a
 * PURE function (`turn-action.ts`, `quest-stack.ts`, `party.ts`), so the rules
 * that decide what a learner is shown next are testable without a TestBed and
 * cannot quietly grow a dependency on the view.
 *
 * NO SECOND READER, and no second LOADER either. The quest stack reads C1b's
 * `HomeCardsService` through `ensureLoaded`, so the home page and this stack
 * cost ONE request between them. The party strip reads the dashboard summary
 * that the yields strip already loads globally and the companion dock already
 * reads, joined to the maps this component already holds for its lens and
 * Roads controls. Neither adds a fetch.
 *
 * The lens and Roads controls are driven through C4's `MapLayersService`, the
 * single owner of both switches, so the HUD and the canvas cannot disagree
 * about what the map is showing. Two constraints from its owner are honoured
 * and pinned by tests: flipping the lens to `growth` lazily loads the growth
 * edges by an effect on the signal, so the HUD sets the lens and does nothing
 * else; and `resetFor` belongs to the canvas on a real map change, so the HUD
 * never calls it.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

import { HomeCardsService } from '../../../features/home/home-cards.service';
import { DashboardService } from '../../../features/surfaces/aplus/dashboard/dashboard.service';
import { MapsService } from '../../../features/surfaces/aplus/my-knowledge/maps.service';
import {
  MapLayersService,
  type MapLens,
} from '../../../features/surfaces/aplus/my-knowledge/map-layers.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { TranslateService } from '../../../core/services/translate.service';
import { CompanionDockComponent } from '../dock/companion-dock.component';
import { activeMapGoalId } from './map-context';
import { resolveParty, type PartyPortrait } from './party';
import type { MapsReport } from '../../../core/familiar/station';
import { resolveQuestStack, type HudQuest } from './quest-stack';
import { resolveTurnAction, type MapsReadView, type TurnAction } from './turn-action';

/** The four lenses, in the order the canvas presents them. */
const LENSES: readonly MapLens[] = ['explore', 'growth', 'mastery', 'familiar'];

@Component({
  selector: 'chora-hud',
  imports: [RouterLink, TranslatePipe, CompanionDockComponent],
  templateUrl: './hud.component.html',
  styleUrl: './hud.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HudComponent {
  private readonly router = inject(Router);
  private readonly mapsService = inject(MapsService);
  private readonly mapLayers = inject(MapLayersService);
  private readonly homeCards = inject(HomeCardsService);
  private readonly dashboard = inject(DashboardService);
  private readonly translate = inject(TranslateService);

  readonly lenses = LENSES;
  readonly lens = this.mapLayers.lens;
  readonly roadsVisible = this.mapLayers.roadsVisible;

  /** Bumped on every NavigationEnd so the route-derived action recomputes. */
  private readonly navTick = signal(0);

  /**
   * The maps read as the turn action needs to see it: a count AND whether the
   * read actually reported. Loading is NOT reported, so a learner whose maps
   * have not arrived is never told to sow their first seed.
   */
  private readonly mapsRead = computed<MapsReadView>(() => {
    const s = this.mapsService.state();
    return {
      reported: s.status === 'success',
      mapCount: s.status === 'success' ? s.maps.length : 0,
    };
  });

  readonly turnAction = computed<TurnAction>(() => {
    this.navTick();
    return resolveTurnAction(this.router.url, this.mapsRead());
  });

  /**
   * The open map's goal id, or null. The lens and Roads switches render only
   * while this is non-null: the atlas is the INDEX of maps, not a map, and a
   * lens control there would switch a lens on nothing.
   */
  readonly openMapId = computed<string | null>(() => {
    this.navTick();
    return activeMapGoalId(this.router.url);
  });

  /**
   * Whether the ranked read has reported. The stack draws nothing at all while
   * this is `loading`: an empty HUD is honest, whereas an empty stack captioned
   * as if the read had returned would tell a learner their day is clear when
   * nobody has looked.
   */
  readonly questState = this.homeCards.state;

  /**
   * The top five ranked cards, and NOTHING from `unplaced()`.
   *
   * Unplaced cards are unread ones with no last known position. The home holds
   * them out of the rank and then says so beneath it; the HUD has no room to
   * say so, and quietly mixing them into a stack of five would present "we
   * could not look" as "this is what matters most".
   */
  readonly quests = computed<readonly HudQuest[]>(() =>
    resolveQuestStack(this.homeCards.cards(), this.homeCards.cardContext()),
  );

  /**
   * One portrait per companion, each linking to the goal map it is stationed
   * on or to the roster otherwise. Both reads are already in hand; see the
   * class comment.
   */
  /**
   * The maps read AS A REPORT, not as a bare list.
   *
   * `reported` is what separates "this learner has no maps" from "I could not
   * find out", and without it every companion would render as confirmed idle
   * while the read is still in flight. Same reason the turn action reads
   * `reported` before it tells anyone to sow their first seed.
   */
  private readonly mapsReport = computed<MapsReport>(() => {
    const s = this.mapsService.state();
    return s.status === 'success'
      ? { reported: true, cards: s.maps }
      : { reported: false, cards: [] };
  });

  readonly party = computed<readonly PartyPortrait[]>(() =>
    resolveParty(this.dashboard.summary()?.familiars ?? [], this.mapsReport()),
  );

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.navTick.update((n) => n + 1));

    this.mapsService.load();
    // `ensureLoaded`, not `load`: the home page reads the same service on the
    // same page and one payload should cost one request. The dashboard summary
    // the party strip reads is NOT loaded here at all; the yields strip is its
    // global loader, and a second loader would be a second request for a read
    // the shell already has.
    this.homeCards.ensureLoaded();
  }

  /**
   * A portrait's accessible name and tooltip: the companion's name, and the map
   * it is on when we KNOW that.
   *
   * The three station arms say three different things on purpose. `unknown`
   * gets the bare name, never "not on a map": the read did not report, so
   * saying anything about a station would be inventing it, and this strip sits
   * two pixels from a companion that may well be marching.
   */
  portraitTitle(p: PartyPortrait): string {
    if (p.station.kind === 'stationed') {
      return this.translate.instant('aplus.shell.hud.party_on_map', {
        name: p.name,
        map: p.station.mapTitle,
      });
    }
    if (p.station.kind === 'unstationed') {
      return this.translate.instant('aplus.shell.hud.party_unstationed', {
        name: p.name,
      });
    }
    return p.name;
  }

  /**
   * The initial drawn in the portrait. The NAME's initial, never the id's: a
   * UUID is not a portrait. Falls back to a neutral glyph rather than rendering
   * an empty circle when a name has not resolved.
   */
  initialOf(p: PartyPortrait): string {
    const trimmed = p.name.trim();
    return trimmed === '' ? '?' : [...trimmed][0].toUpperCase();
  }

  /** Set the lens and nothing else; the growth load is the service's effect. */
  selectLens(lens: MapLens): void {
    this.mapLayers.setLens(lens);
  }

  toggleRoads(): void {
    this.mapLayers.toggleRoads();
  }
}
