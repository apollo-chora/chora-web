import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, type WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { HomeQuestsComponent } from './home-quests.component';
import { HomeCardsService, type HomeCardsState } from './home-cards.service';
import { TranslateService } from '../../core/services/translate.service';
import { normalizeHomeCard, type HomeCard, type HomeCardWire } from './home-card.rank';

/**
 * The ranked home section (Track U Phase C, C1b slice 2).
 *
 * ⚠ The unit suite runs with NO translations loaded, so `| translate` is a
 * passthrough and asserting a rendered sentence asserts nothing. Every
 * assertion below is on the BRANCH that rendered (a `data-testid`) or on the
 * i18n KEY the component chose (`data-title-key`), which is the decision worth
 * pinning. The copy itself is guarded by `home.i18n.spec.ts`.
 */

function card(over: Partial<HomeCardWire> & { card_id: string }): HomeCard {
  return normalizeHomeCard({
    kind: over.card_id,
    surface: 'a',
    route: '/a/knowledge',
    count: 1,
    deadline_at: null,
    urgency: 0,
    warmth: 0,
    state: 'live',
    ...over,
  } as HomeCardWire);
}

class MockHomeCardsService {
  readonly _state: WritableSignal<HomeCardsState> = signal<HomeCardsState>('ready');
  readonly _cards: WritableSignal<readonly HomeCard[]> = signal<readonly HomeCard[]>([]);
  readonly _unplaced: WritableSignal<readonly HomeCard[]> = signal<readonly HomeCard[]>([]);
  readonly _absent: WritableSignal<readonly HomeCard[]> = signal<readonly HomeCard[]>([]);
  readonly _errors: WritableSignal<Record<string, string>> = signal({});

  readonly state = this._state.asReadonly();
  readonly cards = this._cards.asReadonly();
  readonly unplaced = this._unplaced.asReadonly();
  readonly absent = this._absent.asReadonly();
  readonly cardErrors = this._errors.asReadonly();
  readonly bandsTz = signal<string | null>('UTC').asReadonly();
  readonly knownGaps = signal<Record<string, string>>({}).asReadonly();
  readonly _context: WritableSignal<Record<string, unknown>> = signal<Record<string, unknown>>({});
  readonly cardContext = this._context.asReadonly();

  ensureLoadedCalls = 0;
  ensureLoaded(): void {
    this.ensureLoadedCalls += 1;
  }
  load(): void {
    /* the retry path, not exercised here */
  }
}

function setup(): {
  fixture: ComponentFixture<HomeQuestsComponent>;
  svc: MockHomeCardsService;
  el: HTMLElement;
} {
  const svc = new MockHomeCardsService();
  TestBed.configureTestingModule({
    imports: [HomeQuestsComponent],
    providers: [
      provideRouter([]),
      TranslateService,
      { provide: HomeCardsService, useValue: svc },
    ],
  });
  const fixture = TestBed.createComponent(HomeQuestsComponent);
  return { fixture, svc, el: fixture.nativeElement as HTMLElement };
}

const q = (el: HTMLElement, id: string): HTMLElement | null =>
  el.querySelector(`[data-testid="${id}"]`);
const all = (el: HTMLElement, id: string): HTMLElement[] =>
  Array.from(el.querySelectorAll(`[data-testid="${id}"]`));

describe('HomeQuestsComponent', () => {
  let fixture: ComponentFixture<HomeQuestsComponent>;
  let svc: MockHomeCardsService;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const r = setup();
    fixture = r.fixture;
    svc = r.svc;
    el = r.el;
  });

  it('asks the service to load exactly once', () => {
    fixture.detectChanges();
    expect(svc.ensureLoadedCalls).toBe(1);
  });

  it('shows the loading line while the read is in flight', () => {
    svc._state.set('loading');
    fixture.detectChanges();
    expect(q(el, 'home-quests-loading')).not.toBeNull();
    expect(q(el, 'home-quests-empty')).toBeNull();
  });

  it('says we could not look when the whole read failed', () => {
    // NEVER an empty quest log. An empty list is the fact "nothing is
    // waiting"; a failed read is the gap "we could not look".
    svc._state.set('unread');
    fixture.detectChanges();
    expect(q(el, 'home-quests-unread')).not.toBeNull();
    expect(q(el, 'home-quests-empty')).toBeNull();
  });

  it('shows the empty line only when the read succeeded with nothing waiting', () => {
    svc._state.set('ready');
    fixture.detectChanges();
    expect(q(el, 'home-quests-empty')).not.toBeNull();
  });

  it('renders a live card as a link, titled by its kind', () => {
    svc._cards.set([card({ card_id: 'practice_budget', count: 3 })]);
    fixture.detectChanges();

    const c = q(el, 'home-quest-card');
    expect(c).not.toBeNull();
    expect(c!.tagName).toBe('A');
    expect(c!.getAttribute('href')).toBe('/a/knowledge');
    expect(q(el, 'home-quest-title')!.getAttribute('data-title-key')).toBe(
      'home.quests.kind.practice_budget_other',
    );
  });

  it('picks the singular title at a count of one', () => {
    svc._cards.set([card({ card_id: 'practice_budget', count: 1 })]);
    fixture.detectChanges();
    expect(q(el, 'home-quest-title')!.getAttribute('data-title-key')).toBe(
      'home.quests.kind.practice_budget_one',
    );
  });

  it('falls back to generic copy for a kind it has never heard of', () => {
    // C4's defend_hex arrives before its copy does, and the card must still
    // render rather than showing a humanised key.
    svc._cards.set([
      card({ card_id: 'defend_hex_g1', kind: 'defend_hex', count: 2, route: '/a/knowledge' }),
    ]);
    fixture.detectChanges();
    expect(q(el, 'home-quest-title')!.getAttribute('data-title-key')).toBe(
      'home.quests.kind.unknown_other',
    );
    expect(q(el, 'home-quest-card')!.tagName).toBe('A');
  });

  describe("C4's defend card, whose title comes from card_context", () => {
    // ⚠ Grounded on `medashboard/defend.go` on main, not on the relay: the
    // card id is the CONSTANT "defend_hex" (so `card_context` is keyed by it,
    // not by a per-goal id), and the route is `/a/knowledge` until a goal is
    // chosen, then `/a/knowledge/{goalId}`.
    const defendCard = () =>
      card({ card_id: 'defend_hex', kind: 'defend_hex', count: 2, route: '/a/knowledge/g1', warmth: 25 });

    it('names the companion when one is stationed', () => {
      svc._cards.set([defendCard()]);
      svc._context.set({
        defend_hex: { goal_id: 'g1', hex_label: 'Numerator', companion_name: 'Ember' },
      });
      fixture.detectChanges();

      const title = q(el, 'home-quest-title')!;
      expect(title.getAttribute('data-title-key')).toBe(
        'home.quests.defend_hex.title_defended',
      );
      expect(title.getAttribute('data-title-params')).toBe('companion=Ember;hex=Numerator');
    });

    it('uses the undefended arm when no companion name is carried', () => {
      // Selected on ABSENCE. The server omits the key rather than sending an
      // empty string, precisely so "nobody is stationed" and "we did not look"
      // stay different facts.
      svc._cards.set([defendCard()]);
      svc._context.set({ defend_hex: { goal_id: 'g1', hex_label: 'Numerator' } });
      fixture.detectChanges();

      const title = q(el, 'home-quest-title')!;
      expect(title.getAttribute('data-title-key')).toBe(
        'home.quests.defend_hex.title_undefended',
      );
      expect(title.getAttribute('data-title-params')).toBe('hex=Numerator');
    });

    it('falls back to generic copy when the hex has no label', () => {
      // `hex_label` is omitted when empty, exactly as `companion_name` is, and
      // BOTH defend sentences are built around it. Rendering one anyway would
      // put a sentence with a hole in it on the page: a template keyed on a
      // field the wire does not always carry.
      svc._cards.set([defendCard()]);
      svc._context.set({ defend_hex: { goal_id: 'g1' } });
      fixture.detectChanges();

      expect(q(el, 'home-quest-title')!.getAttribute('data-title-key')).toBe(
        'home.quests.kind.unknown_other',
      );
    });

    it('falls back to generic copy when the envelope carries no context at all', () => {
      svc._cards.set([defendCard()]);
      fixture.detectChanges();
      expect(q(el, 'home-quest-title')!.getAttribute('data-title-key')).toBe(
        'home.quests.kind.unknown_other',
      );
    });

    it('will not name a defender the wire left blank', () => {
      // Defensive: the server omits rather than empties, so an empty string is
      // a contract violation. Rendering the defended arm on one would print
      // " is defending Numerator tonight" with a nameless defender.
      svc._cards.set([defendCard()]);
      svc._context.set({
        defend_hex: { goal_id: 'g1', hex_label: 'Numerator', companion_name: '' },
      });
      fixture.detectChanges();
      expect(q(el, 'home-quest-title')!.getAttribute('data-title-key')).toBe(
        'home.quests.defend_hex.title_undefended',
      );
    });
  });

  it('labels the five ranked bands and never band zero', () => {
    svc._cards.set([
      card({ card_id: 'a', urgency: 4, count: 1 }),
      card({ card_id: 'b', urgency: 0, count: 1 }),
    ]);
    fixture.detectChanges();

    const bands = all(el, 'home-quest-band');
    expect(bands.length).toBe(1);
    expect(bands[0]!.getAttribute('data-band-key')).toBe('home.quests.band_4');
  });

  it('refuses to link a card whose route the router cannot serve', () => {
    // The route IS the card's action, so an unmounted one is a broken
    // affordance that looks healthy until someone clicks it.
    svc._cards.set([card({ card_id: 'ghost', route: '/a/definitely-not-a-route' })]);
    fixture.detectChanges();

    expect(q(el, 'home-quest-card')!.tagName).not.toBe('A');
    expect(q(el, 'home-quest-no-route')).not.toBeNull();
  });

  it('says a hand-off card opens on another surface', () => {
    svc._cards.set([
      card({ card_id: 'instructor_courses', surface: 'r', route: '/r/catalog', count: 2 }),
    ]);
    fixture.detectChanges();
    expect(q(el, 'home-quest-go')!.getAttribute('data-go-key')).toBe(
      'home.quests.go_handoff',
    );
  });

  it('shows the unread sentence and the operator code under it', () => {
    // Ruling D4. The code is the status class the card `state` cannot carry,
    // and it is never what the state is derived from.
    svc._unplaced.set([card({ card_id: 'practice_budget', state: 'unread', count: 0 })]);
    svc._errors.set({ practice_budget: 'CONSUMPTION_UNWIRED' });
    fixture.detectChanges();

    const unread = q(el, 'home-quest-unread-card');
    expect(unread).not.toBeNull();
    expect(unread!.tagName).not.toBe('A');
    const code = q(el, 'home-quest-error-code');
    expect(code).not.toBeNull();
    expect(code!.getAttribute('data-code')).toBe('CONSUMPTION_UNWIRED');
  });

  it('omits the code when the envelope carries none for that kind', () => {
    svc._unplaced.set([card({ card_id: 'practice_budget', state: 'unread', count: 0 })]);
    fixture.detectChanges();
    expect(q(el, 'home-quest-unread-card')).not.toBeNull();
    expect(q(el, 'home-quest-error-code')).toBeNull();
  });

  it('renders an absent card with its own empty state and no link', () => {
    svc._absent.set([
      card({ card_id: 'grading_queue', surface: 'r', route: '/r/assessments', count: 0, state: 'absent' }),
    ]);
    fixture.detectChanges();

    const a = q(el, 'home-quest-absent-card');
    expect(a).not.toBeNull();
    expect(a!.tagName).not.toBe('A');
    expect(q(el, 'home-quest-absent-title')!.getAttribute('data-title-key')).toBe(
      'home.quests.kind.grading_queue',
    );
  });

  it('does not call an absent or unread card an empty quest log', () => {
    svc._state.set('ready');
    svc._unplaced.set([card({ card_id: 'practice_budget', state: 'unread', count: 0 })]);
    fixture.detectChanges();
    expect(q(el, 'home-quests-empty')).toBeNull();
  });

  describe('a11y (axe-core)', () => {
    it('has no serious or critical violation with every card shape on screen', async () => {
      // All four shapes at once: a live link, a dead-route card, an unread card
      // carrying its operator code, and an absent card. A pass on the empty
      // state would prove nothing about the states that carry content.
      svc._cards.set([
        card({ card_id: 'pending_diagnoses', count: 2, urgency: 1 }),
        card({ card_id: 'ghost', route: '/a/definitely-not-a-route', count: 1 }),
      ]);
      svc._unplaced.set([card({ card_id: 'practice_budget', state: 'unread', count: 0 })]);
      svc._absent.set([
        card({
          card_id: 'grading_queue',
          surface: 'r',
          route: '/r/assessments',
          count: 0,
          state: 'absent',
        }),
      ]);
      fixture.detectChanges();

      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement as HTMLElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });

  it('gives the section a heading the page can be labelled by', () => {
    fixture.detectChanges();
    const section = q(el, 'home-quests');
    expect(section).not.toBeNull();
    expect(section!.getAttribute('aria-labelledby')).toBe('home-quests-heading');
    expect(el.querySelector('#home-quests-heading')).not.toBeNull();
  });
});
