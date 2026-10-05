/**
 * The HUD quest stack: the top few of the ranked home cards, resolved to
 * everything the HUD needs to draw them (Track U Phase C, C2).
 *
 * A PURE function for the same reason `turn-action.ts` is one: the rule that
 * decides what a learner is shown next should be testable without a TestBed and
 * must not quietly grow a dependency on the view.
 *
 * WRITE NO SECOND READER, and no second phrasing either. The cards come from
 * C1b's `HomeCardsService`, the one owner of that read, and the titles come
 * from C1b's `titleKeyForKind` / `defendHexTitle`, the one owner of that copy.
 * This file joins them and truncates; it decides nothing about ranking, and it
 * invents no wording. A card's rank, its count-0 dropping and its unread
 * handling all happened upstream before it ever arrives here.
 */
import {
  defendHexTitle,
  titleKeyForKind,
  type CardTitle,
} from '../../../features/home/home-card.kinds';
import { isMountedRoute } from '../../../features/home/home-card.route-liveness';
import { SURFACE_ROUTE_TABLES } from '../../../features/home/home-card.route-tables';
import type { HomeCard } from '../../../features/home/home-card.rank';

/**
 * How many cards the stack shows. Five, per the plan: the HUD is a glance at
 * the edge of the screen, not the home page, and the home page is one click
 * away for the rest.
 */
export const QUEST_STACK_LIMIT = 5;

/** One quest, resolved to what the HUD template draws. */
export interface HudQuest {
  readonly cardId: string;
  readonly kind: string;
  readonly titleKey: string;
  readonly titleParams: Readonly<Record<string, string | number>>;
  readonly route: string;
  /**
   * False when the SPA router cannot serve the route. The HUD then draws the
   * quest WITHOUT a link, exactly as the home does: a card whose destination is
   * not mounted is still news, and a link to it is a dead end.
   */
  readonly mounted: boolean;
  readonly count: number;
  /** Ordinal urgency band 0 to 5. Drawn as a class hook, never as a number. */
  readonly urgency: number;
}

/**
 * A card's title, mirroring the home's rule exactly: kinds are titled from
 * `kind` and `count`, except `defend_hex`, whose sentence lives in the
 * `card_context` map keyed by CARD ID and which falls back to the generic
 * title when that context cannot support one.
 */
function titleFor(
  card: HomeCard,
  cardContext: Readonly<Record<string, unknown>>,
): CardTitle {
  if (card.kind === 'defend_hex') {
    const defend = defendHexTitle(
      cardContext[card.cardId] as Record<string, unknown> | undefined,
    );
    if (defend !== null) return defend;
  }
  return {
    key: titleKeyForKind(card.kind, card.count),
    params: { count: card.count },
  };
}

/**
 * The stack: the first {@link QUEST_STACK_LIMIT} RANKED cards, and nothing
 * else.
 *
 * `unplaced` is deliberately not a parameter. Those are unread cards with no
 * last known position, which the home holds OUT of the rank because there is no
 * honest rank for a read that did not happen; it then shows them below the list
 * with that stated. The HUD has no room to state it, and silently mixing them
 * into a ranked stack of five would present "we could not look" as "this is
 * what matters most". They are absent from the HUD and present on the home,
 * which is where the learner can be told why.
 */
export function resolveQuestStack(
  cards: readonly HomeCard[],
  cardContext: Readonly<Record<string, unknown>>,
  limit: number = QUEST_STACK_LIMIT,
): readonly HudQuest[] {
  return cards.slice(0, Math.max(0, limit)).map((card) => {
    const title = titleFor(card, cardContext);
    return {
      cardId: card.cardId,
      kind: card.kind,
      titleKey: title.key,
      titleParams: title.params,
      route: card.route,
      mounted: isMountedRoute(card.route, SURFACE_ROUTE_TABLES),
      count: card.count,
      urgency: card.urgency,
    };
  });
}
