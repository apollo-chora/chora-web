import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { HomeCardsService } from './home-cards.service';
import type { HomeCardWire } from './home-card.rank';

/**
 * HomeCardsService spec (Track U Phase C, C1b slice 1).
 *
 * WHY A HOME-OWNED READ
 * The home and the A+ dashboard share the ENDPOINT, not the code. This service
 * is the home's own reader over `GET /api/me/dashboard`, and it is the ONLY one
 * the ranked section and the C2 HUD quest stack use, so the two cannot drift
 * into two different quest logs built from one payload.
 *
 * The three properties worth pinning, in the order they bite:
 *
 * 1. `?tz=` is SENT and `bands_tz` is kept. Section 7.4 of the rank key makes
 *    the echo the contract: without the zone the client cannot tell whether
 *    due-today was computed in its own day, and the error is up to a full day.
 * 2. A failed read is `unread`, NEVER an empty quest log. An empty list is the
 *    fact "nothing is waiting"; a failed read is the gap "we could not look",
 *    and collapsing them is how a dark upstream silently empties the page.
 * 3. A `live` card with `count: 0` is dropped. Three learner cards are emitted
 *    on every request whatever their counts, so without this the shipped
 *    `home.quests.empty` copy could never render at all.
 */

function wire(over: Partial<HomeCardWire> & { card_id: string }): HomeCardWire {
  return {
    kind: over.card_id,
    surface: 'a',
    route: '/a/knowledge',
    count: 1,
    deadline_at: null,
    urgency: 0,
    warmth: 0,
    state: 'live',
    ...over,
  } as HomeCardWire;
}

function setup(): { service: HomeCardsService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(HomeCardsService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('HomeCardsService', () => {
  let service: HomeCardsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const r = setup();
    service = r.service;
    httpMock = r.httpMock;
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('starts loading and does not fetch until asked', () => {
    expect(service.state()).toBe('loading');
    httpMock.expectNone(() => true);
  });

  it('loads once however many consumers ask, and load() still retries', () => {
    // The ranked section and the C2 HUD quest stack both consume this service
    // on the same page. Two `load()` calls would be two requests for one
    // payload, so both consumers call `ensureLoaded()`; `load()` stays the
    // explicit retry path and always refetches.
    service.ensureLoaded();
    service.ensureLoaded();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [],
      bands_tz: 'UTC',
    });
    expect(service.state()).toBe('ready');

    service.ensureLoaded();
    httpMock.expectNone((r) => r.url.includes('/api/me/dashboard'));

    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/me/dashboard'))
      .flush({ cards: [], bands_tz: 'UTC' });
  });

  it('sends the viewer zone as ?tz= and keeps the echoed bands_tz', () => {
    service.load();
    const req = httpMock.expectOne((r) => r.url.includes('/api/me/dashboard'));
    // Sent, and sent as a real zone rather than the literal text "undefined",
    // which a server would try to load as a zone name and silently fail to UTC.
    expect(req.request.params.get('tz')).toBeTruthy();
    expect(req.request.params.get('tz')).not.toBe('undefined');

    req.flush({ cards: [], bands_tz: 'Asia/Singapore' });
    expect(service.state()).toBe('ready');
    expect(service.bandsTz()).toBe('Asia/Singapore');
  });

  it('is unread when the read fails, and never an empty quest log', () => {
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/me/dashboard'))
      .flush('upstream is down', { status: 503, statusText: 'Service Unavailable' });

    expect(service.state()).toBe('unread');
    expect(service.cards()).toEqual([]);
    expect(service.absent()).toEqual([]);
  });

  it('is unread when the body carries no cards array at all', () => {
    // A 200 whose envelope predates the cards field, or an aggregator that
    // failed before composing. `cards: []` is a fact; a missing key is not.
    service.load();
    httpMock
      .expectOne((r) => r.url.includes('/api/me/dashboard'))
      .flush({ bands_tz: 'UTC' });

    expect(service.state()).toBe('unread');
  });

  it('ranks live cards and drops the ones with nothing to report', () => {
    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [
        wire({ card_id: 'practice_budget', count: 3, urgency: 0, warmth: 20 }),
        wire({ card_id: 'pending_diagnoses', count: 2, urgency: 1, warmth: 85 }),
        // Live and empty: a fact, and it has nothing to say on the page.
        wire({ card_id: 'unseen_results', count: 0, urgency: 0, warmth: 75 }),
      ],
      bands_tz: 'UTC',
    });

    expect(service.cards().map((c) => c.cardId)).toEqual([
      'pending_diagnoses',
      'practice_budget',
    ]);
  });

  it('never drops an unread card by the count rule, at count zero', () => {
    // The count rule is scoped to `live` deliberately. An unread card's count
    // is not a fact about the world, it is the absence of one, so dropping it
    // for reading 0 would delete exactly the card that most needs explaining
    // and would make a dark upstream look like a quiet day.
    //
    // ⚠ Asserted on `cards()` after the card has earned a position, which is
    // the ONLY place the rule can be observed. My first draft of this test
    // asserted on `unplaced()`, which is derived before the filter runs and is
    // therefore immune to it: the assertion could not fail, and a mutation
    // proved it did not. A pin over a path the rule never touches is not a pin.
    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [
        wire({ card_id: 'pending_diagnoses', count: 2, urgency: 1, warmth: 85 }),
        wire({ card_id: 'practice_budget', count: 3, urgency: 0, warmth: 20 }),
      ],
      bands_tz: 'UTC',
    });
    expect(service.cards().map((c) => c.cardId)).toEqual([
      'pending_diagnoses',
      'practice_budget',
    ]);

    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [
        wire({ card_id: 'pending_diagnoses', count: 2, urgency: 1, warmth: 85 }),
        // count 0 AND unread: the pair that a rule reading count alone eats.
        wire({ card_id: 'practice_budget', count: 0, state: 'unread' }),
      ],
      bands_tz: 'UTC',
    });

    expect(service.cards().map((c) => c.cardId)).toEqual([
      'pending_diagnoses',
      'practice_budget',
    ]);
  });

  it('drops an unknown kind on the same rule as a known one', () => {
    // The rule reads `state` and `count` and nothing else, so a kind this
    // build has never heard of is treated identically. C4's defend_hex arrives
    // with a count and needs no change here.
    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [
        wire({ card_id: 'defend_hex_g1', kind: 'defend_hex', count: 0, warmth: 25 }),
        wire({ card_id: 'defend_hex_g2', kind: 'defend_hex', count: 1, warmth: 25 }),
      ],
      bands_tz: 'UTC',
    });

    expect(service.cards().map((c) => c.cardId)).toEqual(['defend_hex_g2']);
  });

  it('keeps an absent card out of the ranked list and in its own', () => {
    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [
        wire({ card_id: 'pending_diagnoses', count: 2, urgency: 1, warmth: 85 }),
        wire({ card_id: 'tenants_needing_setup', count: 0, state: 'absent', surface: 'h' }),
        wire({ card_id: 'grading_queue', count: 0, state: 'absent', surface: 'r' }),
      ],
      bands_tz: 'UTC',
    });

    expect(service.cards().map((c) => c.cardId)).toEqual(['pending_diagnoses']);
    // Ordered by card id, so two renders of one payload place them identically.
    expect(service.absent().map((c) => c.cardId)).toEqual([
      'grading_queue',
      'tenants_needing_setup',
    ]);
  });

  it('holds an unread card out of the RANK and still surfaces it', () => {
    // Section 5: an unread card is never ranked as `count: 0`, and with no last
    // known position there is no honest rank for it. It is still shown, because
    // silence would make a dark upstream look like a quiet day.
    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [
        wire({ card_id: 'pending_diagnoses', count: 2, urgency: 1, warmth: 85 }),
        wire({ card_id: 'practice_budget', count: 0, state: 'unread' }),
      ],
      bands_tz: 'UTC',
      card_errors: { practice_budget: 'CONSUMPTION_UNWIRED' },
    });

    expect(service.cards().map((c) => c.cardId)).toEqual(['pending_diagnoses']);
    expect(service.unplaced().map((c) => c.cardId)).toEqual(['practice_budget']);
    expect(service.cardErrors()['practice_budget']).toBe('CONSUMPTION_UNWIRED');
  });

  it('re-seats an unread card at the position it last held', () => {
    // First read places both. Second read fails for one of them, and the card
    // must not move: a failed read moves nothing.
    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [
        wire({ card_id: 'pending_diagnoses', count: 2, urgency: 1, warmth: 85 }),
        wire({ card_id: 'practice_budget', count: 3, urgency: 0, warmth: 20 }),
      ],
      bands_tz: 'UTC',
    });
    expect(service.cards().map((c) => c.cardId)).toEqual([
      'pending_diagnoses',
      'practice_budget',
    ]);

    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [
        wire({ card_id: 'pending_diagnoses', count: 2, urgency: 1, warmth: 85 }),
        wire({ card_id: 'practice_budget', count: 0, state: 'unread' }),
      ],
      bands_tz: 'UTC',
    });

    expect(service.cards().map((c) => c.cardId)).toEqual([
      'pending_diagnoses',
      'practice_budget',
    ]);
    expect(service.unplaced()).toEqual([]);
  });

  it('refines a deadline band only when the echoed zone is not the viewer own', () => {
    // ⚠ Fake timers FIRST. `vi.useFakeTimers()` fakes `Intl` as well as `Date`,
    // so spying on `Intl.DateTimeFormat` before this call has the spy silently
    // replaced and `viewerTimeZone()` returns the empty string. The refinement
    // then never runs and the card keeps band 4, which reads as an
    // implementation bug and is the instrument.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'Asia/Singapore' }),
    } as unknown as Intl.DateTimeFormat);

    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [
        wire({
          card_id: 'exam',
          count: 1,
          urgency: 4,
          deadline_at: '2026-09-02T09:00:00Z',
        }),
      ],
      // Not the viewer zone, so the client may re-decide between 4 and 5.
      bands_tz: 'UTC',
    });

    expect(service.cards()[0]?.urgency).toBe(5);
    vi.useRealTimers();
  });

  it('passes an unknown sibling map through untouched', () => {
    // `card_context` is subagent5's C4 addition, on the `card_errors`
    // precedent: keyed by card id, present only for cards that have one. The
    // read carries it and the renderer ignores what it does not know, so a new
    // map is additive and never a contract change for this service.
    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [wire({ card_id: 'pending_diagnoses', count: 2, urgency: 1, warmth: 85 })],
      bands_tz: 'UTC',
      card_context: {
        defend_hex: { companion_name: 'Ember', hex_label: 'Numerator', goal_id: 'g1' },
      },
    });

    expect(service.cardContext()['defend_hex']).toEqual({
      companion_name: 'Ember',
      hex_label: 'Numerator',
      goal_id: 'g1',
    });
  });

  it('keeps known_gaps so an absent card can say what it waits on', () => {
    service.load();
    httpMock.expectOne((r) => r.url.includes('/api/me/dashboard')).flush({
      cards: [],
      bands_tz: 'UTC',
      known_gaps: { grading_queue: 'no_downstream_source: C1c' },
    });

    expect(service.knownGaps()['grading_queue']).toContain('C1c');
  });
});
