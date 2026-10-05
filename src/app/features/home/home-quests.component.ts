/**
 * The ranked home section: "worth your next few minutes" (Track U Phase C, C1b).
 *
 * Owner rulings R2 (the home is composed from data, never a fixed UI per
 * audience and never a toggle) and R4 (one ranked list ordered by urgency then
 * warmth, from the existing aggregator). Contract:
 * `docs/references/home-rank-key.md`.
 *
 * The section renders three kinds of thing and keeps them distinguishable,
 * because section 5 exists for exactly that: cards that are LIVE, cards that
 * are UNREAD (we could not look) and cards that are ABSENT (not built yet).
 * Collapsing any pair of those is how a dark upstream comes to look like a
 * quiet day.
 *
 * WARMTH IS A SORT KEY AND NOTHING ELSE. It orders the list inside a band and
 * is never drawn: "warmth 85" is an operator number in learner clothing
 * (coordinator ruling, 2026-09-02). If the envelope ever carries warmth
 * REASONS they render as chips; the score does not.
 *
 * The band label is drawn for bands 5 to 1 and never for band 0, which means
 * "nothing here is time-derived" and is not a thing to tell anybody.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { HomeCardsService } from './home-cards.service';
import { isMountedRoute } from './home-card.route-liveness';
import { SURFACE_ROUTE_TABLES } from './home-card.route-tables';
import { defendHexTitle, titleKeyForKind, type CardTitle } from './home-card.kinds';
import type { HomeCard } from './home-card.rank';

/** One card, resolved to everything the template needs to draw it. */
export interface QuestView {
  readonly card: HomeCard;
  readonly titleKey: string;
  /** What the title interpolates. Empty for a title that takes no params. */
  readonly titleParams: Readonly<Record<string, string | number>>;
  /** Null for band 0: there is no label for "nothing is time-derived". */
  readonly bandKey: string | null;
  /** False when the SPA router cannot serve the route, so no link is drawn. */
  readonly mounted: boolean;
  /** A card owned by another surface says so before it takes you there. */
  readonly goKey: string;
  /** The operator status class, when the envelope carries one for this kind. */
  readonly errorCode: string | null;
}

@Component({
  selector: 'chora-home-quests',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-quests.component.html',
  styleUrl: './home-quests.component.scss',
})
export class HomeQuestsComponent {
  private readonly cards = inject(HomeCardsService);

  readonly state = this.cards.state;

  readonly ranked = computed<readonly QuestView[]>(() =>
    this.cards.cards().map((c) => this.view(c)),
  );

  /**
   * Unread cards with no last known position. Section 5 holds them out of the
   * RANK, because there is no honest rank for a read that did not happen, and
   * ruling D4 says the learner is told anyway. So they sit under the ranked
   * list rather than inside it.
   */
  readonly unplaced = computed<readonly QuestView[]>(() =>
    this.cards.unplaced().map((c) => this.view(c)),
  );

  readonly absent = computed<readonly QuestView[]>(() =>
    this.cards.absent().map((c) => this.view(c)),
  );

  /**
   * Nothing is waiting, and we know that rather than assume it.
   *
   * Deliberately requires state `ready` AND all three lists empty. An unread
   * or absent card on the page means the honest answer is not "nothing is
   * waiting", so the empty line stays away.
   */
  readonly isEmpty = computed<boolean>(
    () =>
      this.state() === 'ready' &&
      this.ranked().length === 0 &&
      this.unplaced().length === 0 &&
      this.absent().length === 0,
  );

  constructor() {
    // `ensureLoaded`, not `load`: the C2 HUD quest stack reads the same service
    // on the same page and one payload should cost one request.
    this.cards.ensureLoaded();
  }

  private view(card: HomeCard): QuestView {
    const title = this.title(card);
    return {
      card,
      titleKey: title.key,
      titleParams: title.params,
      bandKey: card.urgency > 0 ? `home.quests.band_${card.urgency}` : null,
      mounted: isMountedRoute(card.route, SURFACE_ROUTE_TABLES),
      goKey: card.surface === 'a' ? 'home.quests.go' : 'home.quests.go_handoff',
      errorCode: this.cards.cardErrors()[card.kind] ?? null,
    };
  }

  /**
   * A card's title.
   *
   * Kinds are titled from `kind` and `count` alone. `defend_hex` is the one
   * that is not: what it has to SAY lives in the `card_context` sibling map,
   * keyed by CARD ID, and when that map cannot support a sentence the card
   * takes the generic title rather than a broken one.
   */
  private title(card: HomeCard): CardTitle {
    if (card.kind === 'defend_hex') {
      const ctx = this.cards.cardContext()[card.cardId];
      const defend = defendHexTitle(ctx as Record<string, unknown> | undefined);
      if (defend !== null) return defend;
    }
    return {
      key: titleKeyForKind(card.kind, card.count),
      params: { count: card.count },
    };
  }

  /** A stable, sorted rendering of the title params, for tests to assert on. */
  paramsAttr(params: Readonly<Record<string, string | number>>): string {
    return Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join(';');
  }
}
