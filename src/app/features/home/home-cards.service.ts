/**
 * The home's own read of the ranked card envelope (Track U Phase C, C1b).
 *
 * WHY THIS EXISTS RATHER THAN A SECOND CALLER OF DashboardService
 * The home and the A+ dashboard share the ENDPOINT, not the code. Owner ruling
 * R4 says one aggregator serves the ranked list, and this is the home's reader
 * over it: the ranked section and the C2 HUD quest stack both consume this
 * service, so the two cannot drift into different quest logs built from one
 * payload. `dashboard.service.ts` is untouched; it reads the same URL for the
 * dashboard's own DTO and knows nothing about cards.
 *
 * Contract: `docs/references/home-rank-key.md`, sections 2 to 7.4.
 *
 * THE THREE DECISIONS IN HERE THAT ARE NOT OBVIOUS
 *
 * 1. `cards` MISSING is not `cards: []`. An empty array is the fact "nothing is
 *    waiting"; a missing key is "we could not look". Section 5 exists for that
 *    distinction, so the service resolves a body with no array to `unread`
 *    rather than to a cheerful empty home.
 *
 * 2. A `live` card with `count: 0` is DROPPED. The aggregator emits the three
 *    learner cards on every request whatever their counts, which is right for
 *    the wire (the contract stays stable) and wrong for the page. Without this
 *    the shipped `home.quests.empty` copy could never render at all, because
 *    the list would never be empty. Section 7.1 grants exactly this: "a fact,
 *    so the card can be dropped from the list". It is ONE rule over the whole
 *    envelope, not a per-kind table, so an unknown kind is treated the same.
 *
 * 3. `unread` cards land in TWO places. Section 5 says an unread card holds its
 *    last known position and is otherwise held out of the list, and ruling D4
 *    says the learner must still be told. Both are satisfied by keeping the
 *    ranked list honest (`cards`) and exposing the rest separately
 *    (`unplaced`), so nothing is ranked at a position the data cannot support
 *    and nothing goes silent either.
 *
 * Maps the service does not understand are passed through untouched
 * (`cardContext` today). A new sibling map is additive by construction, which
 * is the property `card_errors` established and C4's `card_context` relies on.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { catchError, map, of, take } from 'rxjs';

import { BffClientService } from '../../core/services/bff-client.service';
import {
  absentHomeCards,
  normalizeHomeCard,
  rankHomeCards,
  type HomeCard,
  type HomeCardWire,
} from './home-card.rank';
import { refineUrgencyBands, viewerTimeZone } from './home-card.bands';

/**
 * loading  the read has not answered yet
 * ready    the envelope carried a cards array, whatever it held
 * unread   the read failed, or the body carried no cards array
 */
export type HomeCardsState = 'loading' | 'ready' | 'unread';

/** The slice of the dashboard envelope the home reads. */
interface HomeCardsEnvelope {
  readonly cards?: readonly HomeCardWire[];
  readonly bands_tz?: string;
  readonly card_errors?: Record<string, string>;
  readonly known_gaps?: Record<string, string>;
  readonly card_context?: Record<string, unknown>;
}

interface HomeCardsRead {
  readonly state: HomeCardsState;
  readonly cards: readonly HomeCard[];
  readonly unplaced: readonly HomeCard[];
  readonly absent: readonly HomeCard[];
  readonly bandsTz: string | null;
  readonly cardErrors: Record<string, string>;
  readonly knownGaps: Record<string, string>;
  readonly cardContext: Record<string, unknown>;
}

const EMPTY_READ: HomeCardsRead = {
  state: 'loading',
  cards: [],
  unplaced: [],
  absent: [],
  bandsTz: null,
  cardErrors: {},
  knownGaps: {},
  cardContext: {},
};

@Injectable({ providedIn: 'root' })
export class HomeCardsService {
  private readonly bff = inject(BffClientService);

  private readonly read = signal<HomeCardsRead>(EMPTY_READ);

  /**
   * The order the ranked list was last rendered in.
   *
   * Section 5's re-seating needs it: an unread card holds the position it held
   * before, so a read that failed moves nothing on the page. Deliberately NOT
   * cleared when a read fails, because the last known order is still the last
   * known order.
   */
  private lastKnown: readonly string[] = [];

  readonly state = computed<HomeCardsState>(() => this.read().state);
  /** Ranked live cards, plus any unread card that had a position to hold. */
  readonly cards = computed<readonly HomeCard[]>(() => this.read().cards);
  /** Unread cards with no last known position: shown, but never ranked. */
  readonly unplaced = computed<readonly HomeCard[]>(() => this.read().unplaced);
  /** Structurally absent cards, for their own empty states. */
  readonly absent = computed<readonly HomeCard[]>(() => this.read().absent);
  /** The zone the server says it computed the day bands in. Section 7.4. */
  readonly bandsTz = computed<string | null>(() => this.read().bandsTz);
  /** Operator status class per unread card kind. Never a card's state. */
  readonly cardErrors = computed<Record<string, string>>(() => this.read().cardErrors);
  /** Why an absent card is absent. */
  readonly knownGaps = computed<Record<string, string>>(() => this.read().knownGaps);
  /** Sibling maps this service passes through without interpreting. */
  readonly cardContext = computed<Record<string, unknown>>(() => this.read().cardContext);

  /** True from the moment a fetch starts, so two consumers make one request. */
  private started = false;

  /**
   * Load unless a load has already been asked for.
   *
   * The ranked section and the C2 HUD quest stack are both on the page and
   * both need these cards. Neither owns the read more than the other, so
   * rather than making one of them the loader and leaving the other broken
   * wherever it mounts alone, both call this and the first one wins.
   * `load()` remains the explicit retry and always refetches.
   */
  ensureLoaded(): void {
    if (this.started) return;
    this.load();
  }

  /** Fetch and publish. Idempotent, so a retry CTA can call it again. */
  load(): void {
    this.started = true;
    this.read.set({ ...EMPTY_READ, state: 'loading' });

    const tz = viewerTimeZone();
    // Omitted rather than sent empty when the zone is unknown: an empty value
    // and a real one are different claims, and the server already treats an
    // absent parameter as "compute in UTC and say so".
    const params = tz === '' ? undefined : new HttpParams().set('tz', tz);

    this.bff
      .get<HomeCardsEnvelope>('/api/me/dashboard', params)
      .pipe(
        take(1),
        map((body) => this.project(body, tz)),
        // Any transport failure is `unread`. It is deliberately not split by
        // status: 503, 500 and 400 all mean the same thing to the learner, and
        // section 7.3b says the operator detail belongs in `card_errors`.
        catchError(() => of<HomeCardsRead>({ ...EMPTY_READ, state: 'unread' })),
      )
      .subscribe((next) => {
        this.read.set(next);
        if (next.state === 'ready') {
          this.lastKnown = next.cards.map((c) => c.cardId);
        }
      });
  }

  /** Turn one envelope into the three lists the home renders. */
  private project(body: HomeCardsEnvelope, viewerTz: string): HomeCardsRead {
    const wire = body?.cards;
    if (!Array.isArray(wire)) {
      // A 200 with no cards array. The read succeeded and the section did not.
      return { ...EMPTY_READ, state: 'unread' };
    }

    const all = wire.map(normalizeHomeCard);

    // Bands first: refinement can move a card between 4 and 5, so ranking
    // before it would order the page on a band the client has already decided
    // is wrong.
    const refined = refineUrgencyBands(all, {
      bandsTz: body.bands_tz,
      viewerTz,
      now: new Date(),
    });

    const reportable = refined.filter((c) => !(c.state === 'live' && c.count === 0));
    const ranked = rankHomeCards(reportable, { lastKnown: this.lastKnown });
    const placed = new Set(ranked.map((c) => c.cardId));

    return {
      state: 'ready',
      cards: ranked,
      unplaced: refined.filter((c) => c.state === 'unread' && !placed.has(c.cardId)),
      absent: absentHomeCards(refined),
      bandsTz: body.bands_tz ?? null,
      cardErrors: body.card_errors ?? {},
      knownGaps: body.known_gaps ?? {},
      cardContext: body.card_context ?? {},
    };
  }
}
