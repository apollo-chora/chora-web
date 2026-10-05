import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../../../environments/environment';
import {
  MapFamiliarPanelComponent,
  UPLOAD_POLL_INTERVAL_MS,
  UPLOAD_POLL_MAX,
  UPLOAD_SLOW_AFTER,
} from './map-familiar-panel.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type { ConceptNode } from '../../discovery-graph/concept-graph.model';
import type { FamiliarMapMemory } from '../../discovery-graph/familiar-map.model';
import { PENDING_REVIEW_STORAGE_KEY } from '../../growth-edge-review/pending-review.store';

const BFF = environment.bffBaseUrl;
const GOAL_ID = 'goal-1';
const FAM_ID = 'fam-1';

const ROSTER = `${BFF}/api/v1/me/familiars`;
const GOALS = `${BFF}/api/v1/me/goals`;
const GOAL = `${BFF}/api/v1/me/goals/${GOAL_ID}`;
// ADR-214: the memory read is GOAL-SCOPED. Unscoped it returns the learner's
// whole flat concept space, so "What it can see" listed other maps' concepts.
const MEMORY = `${BFF}/api/v1/me/familiars/${FAM_ID}/memory?goal_id=${GOAL_ID}`;
// D1: the header portrait needs the growth axis, which the memory wire does
// not carry. Read once per bond, beside the memory read.
const GROWTH = `${BFF}/api/v1/me/familiars/${FAM_ID}/growth`;
const SUGGEST = `${BFF}/api/v1/me/concept-graph/suggestions`;
const GENERATE = `${SUGGEST}/generate`;
const ACCEPT = (id: string) => `${SUGGEST}/${id}/accept`;
const DISMISS = (id: string) => `${SUGGEST}/${id}/dismiss`;
const UPLOADS = `${BFF}/api/v1/me/growth-edges/uploads`;
const UPLOAD_POLL = (id: string) => `${UPLOADS}/${id}`;
const KNOWLEDGE = `${GOAL}/knowledge`;

/** A minimal `/v1/me/goals/{id}/knowledge` wire body (CHO-2118 tier 2). */
function knowledgeWire(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    goalId: GOAL_ID,
    goalTitle: 'Fractions',
    familiarId: FAM_ID,
    familiarName: 'Sage',
    conceptsTotal: 2,
    conceptsMastered: 0,
    shakyConcepts: [],
    hasMemory: false,
    memories: [],
    reflection: { text: '', status: 'none' },
    ...over,
  };
}

const SAMPLE_CONCEPTS: readonly ConceptNode[] = [
  { conceptId: 'c1', title: 'Fractions', atomRefs: [] },
  { conceptId: 'c2', title: 'Decimals', atomRefs: [] },
];

/** A minimal-but-valid `/v1/me/familiars` wire row (growth-service maps it). */
function familiarWire(familiarId: string, name: string): Record<string, unknown> {
  return {
    // The roster wire speaks Companion (ADR-254 D9).
    companionId: familiarId,
    name,
    growthState: {
      currentBreed: 'owl',
      stage: 2,
      exp: 10,
      expToNextStage: 50,
    },
    cosmetic: { shiny: false, rarity: 'common', equippedSkinId: null },
    configuredRules: {},
  };
}

/** A minimal `/v1/me/familiars/{id}/growth` envelope (the service unwraps `data`). */
function growthWire(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: {
      companionId: FAM_ID,
      growthStage: 3,
      stageName: 'awakened',
      species: 'penguin',
      shinyVariant: false,
      rarity: 'common',
      expCurrent: 10,
      expNextThreshold: 200,
      expCumulative: 210,
      effectiveLlmTier: 'standard',
      effectiveMaxOutputTokens: 1024,
      unlockedTools: [],
      resonantAtomId: '',
      ahaMomentConsumed: false,
      ahaMomentActiveUntil: null,
      ...over,
    },
  };
}

function memory(over: Partial<FamiliarMapMemory> = {}): FamiliarMapMemory {
  return {
    familiarId: FAM_ID,
    name: 'Sage',
    focus: 'Algebra',
    persona: 'Encouraging',
    rules: {},
    evolutionTier: 'hatchling',
    skills: [],
    hasMemory: false,
    memories: [],
    visibleNeighbors: [],
    ...over,
  };
}

describe('MapFamiliarPanelComponent (WS-E)', () => {
  let fixture: ComponentFixture<MapFamiliarPanelComponent>;
  let component: MapFamiliarPanelComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapFamiliarPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(MapFamiliarPanelComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // The diagnose lane now persists the parked upload at submit time, so leave
    // no cross-test residue in the shared localStorage (the component only ever
    // writes it, never reads it, but the /a/knowledge host does).
    localStorage.removeItem(PENDING_REVIEW_STORAGE_KEY);
    // The Familiar tab mounts <chora-familiar-loadout> which fires its own
    // GET .../skills when a Familiar is bound; these tests don't exercise the
    // loadout (its own spec does), so drain any trailing loadout request
    // BEFORE destroy (destroy cancels it, and a cancelled request can't be
    // errored).
    httpMock
      .match((r) => r.url.endsWith('/skills'))
      .forEach((r) => {
        // Leaving the Companion tab unmounts the loadout mid-test, which
        // CANCELS its in-flight /skills GET — and a cancelled request can be
        // neither flushed nor errored. Only settle the live ones.
        if (!r.cancelled) {
          r.error(new ProgressEvent('error'), {
            status: 0,
            statusText: 'no bff',
          });
        }
      });
    // Same class as the loadout read above: the header portrait's growth GET
    // (D1) is fire-and-forget enrichment fired on every bond. Tests that care
    // about it flush or error it explicitly; the rest are drained here so the
    // portrait never turns an unrelated test red.
    httpMock
      .match((r) => r.url.endsWith('/growth'))
      .forEach((r) => {
        if (!r.cancelled) {
          r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
        }
      });
    // C4 slice 2: the Diagnose block reads the diagnoses parked at the review
    // interrupt, and that block is shown on section 'all' (the default here) as
    // well as on 'diagnose'. Fire-and-forget enrichment like the two above, so
    // drain it rather than making sixty tests answer it.
    httpMock
      .match((r) => r.url.endsWith('/growth-edges/uploads') && r.method === 'GET')
      .forEach((r) => !r.cancelled && r.flush({ items: [] }));
    // ngOnDestroy clears any pending poll timers.
    fixture.destroy();
    httpMock.verify();
  });

  function testid<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return element.querySelector<T>(`[data-testid="${id}"]`);
  }

  /**
   * Advance virtual time by `times` poll intervals, answering each poll GET with
   * a still-QUEUED job (the real backend sits QUEUED for the whole ~2 to 4 min
   * analysis and never emits ANALYZING). Requires `vi.useFakeTimers()`.
   */
  function pollQueuedTimes(id: string, times: number): void {
    for (let i = 0; i < times; i++) {
      vi.advanceTimersByTime(UPLOAD_POLL_INTERVAL_MS);
      httpMock.expectOne(UPLOAD_POLL(id)).flush({ upload_id: id, status: 'QUEUED' });
    }
  }

  /**
   * Mount in the ATTACHED state: the effect fires memory + suggestions GETs,
   * and — when the Companion section is on screen — the goal-knowledge read.
   */
  function mountAttached(
    over: {
      suggestions?: readonly Record<string, unknown>[];
      mem?: FamiliarMapMemory;
      section?: 'all' | 'suggestions' | 'familiar' | 'diagnose';
      knowledge?: Record<string, unknown>;
      focalWon?: boolean;
      isRoot?: boolean;
      /** null = leave the growth read unanswered (the fail-soft arm). */
      growth?: Record<string, unknown> | null;
    } = {},
  ): void {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.componentRef.setInput('attachedFamiliarId', FAM_ID);
    fixture.componentRef.setInput('focalConceptId', 'c1');
    fixture.componentRef.setInput('concepts', SAMPLE_CONCEPTS);
    // The reveal unlocks by winning the node (ADR-227 D2); default the focal to a
    // WON non-root so the existing suggestion flow tests keep the Generate button.
    fixture.componentRef.setInput('focalWon', over.focalWon ?? true);
    fixture.componentRef.setInput('isRoot', over.isRoot ?? false);
    if (over.section) fixture.componentRef.setInput('section', over.section);
    fixture.detectChanges();
    httpMock.expectOne(MEMORY).flush(over.mem ?? memory());
    if (over.growth !== null) httpMock.expectOne(GROWTH).flush(over.growth ?? growthWire());
    httpMock
      .expectOne((req) => req.url.split('?')[0] === SUGGEST)
      .flush({ suggestions: over.suggestions ?? [] });
    const showsFamiliar = !over.section || over.section === 'all' || over.section === 'familiar';
    if (showsFamiliar) {
      httpMock.expectOne(KNOWLEDGE).flush(over.knowledge ?? knowledgeWire());
    }
    fixture.detectChanges();
  }

  /** Mount in the SUMMON state: the effect fires a roster GET. */
  /**
   * Drain the goals list the summon picker now loads (CHO-2403): it needs to
   * know which Companions already sit on another graph. Zero requests on any
   * path that never opens the picker.
   */
  function drainGoals(goals: Record<string, unknown>[] = []): void {
    for (const req of httpMock.match((r) => r.url === GOALS)) {
      if (!req.cancelled) req.flush({ items: goals, primaryLens: 'curiosity' });
    }
  }

  function mountSummon(items: Record<string, unknown>[] = [familiarWire(FAM_ID, 'Sage')]): void {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.detectChanges();
    httpMock.expectOne(ROSTER).flush({ items });
    drainGoals();
    fixture.detectChanges();
  }

  // ── D1: the memory header's portrait ──────────────────────────────────
  describe('companion portrait (D1)', () => {
    it('reads growth on bond and hands the species to the memory panel', () => {
      mountAttached({ section: 'familiar' });

      expect(component.portrait()).toEqual({ species: 'penguin', stage: 3 });
      const img = element.querySelector(
        '[data-testid="fmemory-portrait"] chora-breed-art img',
      );
      expect(img?.getAttribute('src')).toContain('penguin/penguin-stage-3.png');
    });

    it('fails SOFT: a dead growth read costs the portrait and nothing else', () => {
      mountAttached({ section: 'familiar', growth: null });
      httpMock.expectOne(GROWTH).error(new ProgressEvent('error'), { status: 500 });
      fixture.detectChanges();

      expect(component.portrait()).toBeNull();
      // The memory panel itself still stands — the portrait is enrichment.
      expect(testid('map-familiar-memory')).toBeTruthy();
      expect(element.querySelector('[data-testid="fmemory-portrait"]')).toBeNull();
    });
  });

  // ── Summon (no Familiar attached) ─────────────────────────────────────

  it('renders the summon UI and lists the roster when no Familiar is attached', () => {
    mountSummon();
    expect(testid('map-familiar-panel')).toBeTruthy();
    expect(testid('map-familiar-roster')).toBeTruthy();
    expect(testid('map-familiar-summon-' + FAM_ID)).toBeTruthy();
    // Attached-only affordances are absent.
    expect(testid('map-familiar-bond')).toBeFalsy();
  });

  /**
   * A pod is summonable BEFORE it hatches (binding it to a Goal is how it
   * warms), so this list mixes stages. A pre-hatch row arrives with `name` set
   * to the backend's NOT NULL placeholder ("Egg") and an empty species, which
   * put the word "Egg" in front of a learner whose Stage-0 vocabulary is Pod.
   *
   * i18n contract: the translate pipe emits RAW keys in dev/test, so the
   * assertion is on the untitled-Pod KEY, not its English copy.
   */
  it('never renders the server placeholder name for a pre-hatch pod in the summon list', () => {
    const pod = familiarWire(FAM_ID, 'Egg');
    (pod['growthState'] as Record<string, unknown>)['stage'] = 0;
    (pod['growthState'] as Record<string, unknown>)['currentBreed'] = '';
    mountSummon([pod]);
    const btn = testid<HTMLButtonElement>('map-familiar-summon-' + FAM_ID);
    expect(btn?.textContent?.trim()).toBe('aplus.knowledge.familiar_untitled_pod');
  });

  it('still shows a hatched Companion its own name in the summon list', () => {
    mountSummon([familiarWire(FAM_ID, 'Sage')]);
    const btn = testid<HTMLButtonElement>('map-familiar-summon-' + FAM_ID);
    expect(btn?.textContent?.trim()).toBe('Sage');
  });

  it('shows an honest CTA (no fabricated Familiar) when the roster is empty', () => {
    mountSummon([]);
    expect(testid('map-familiar-no-roster')).toBeTruthy();
    const cta = testid<HTMLAnchorElement>('map-familiar-no-roster-cta');
    expect(cta).toBeTruthy();
    expect(cta?.getAttribute('href')).toBe('/a/companion');
    expect(testid('map-familiar-roster')).toBeFalsy();
  });

  it('picking a roster Familiar PATCHes the goal and emits changed', () => {
    mountSummon();
    const changed = vi.fn();
    component.changed.subscribe(changed);

    testid<HTMLButtonElement>('map-familiar-summon-' + FAM_ID)?.click();

    const req = httpMock.expectOne(GOAL);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ attachedCompanionId: FAM_ID });
    req.flush({});
    fixture.detectChanges();

    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('fails loud on a roster load error with a retry', () => {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.detectChanges();
    httpMock.expectOne(ROSTER).flush('boom', { status: 500, statusText: 'Server Error' });
    drainGoals();
    fixture.detectChanges();

    expect(testid('map-familiar-roster-error')).toBeTruthy();
    testid<HTMLButtonElement>('map-familiar-roster-retry')?.click();
    httpMock.expectOne(ROSTER).flush({ items: [] });
    drainGoals();
    fixture.detectChanges();
    expect(testid('map-familiar-roster-error')).toBeFalsy();
  });

  // ── Bond (Familiar attached) ──────────────────────────────────────────

  it('renders the bond header and Dismiss when a Familiar is attached', () => {
    mountAttached();
    expect(testid('map-familiar-bond')).toBeTruthy();
    expect(testid('map-familiar-dismiss')).toBeTruthy();
    // Summon UI is gone.
    expect(testid('map-familiar-roster')).toBeFalsy();
  });

  // ── Drawer section slicing (tabbed redesign) ──────────────────────────

  it('section="suggestions" renders only the suggestions block', () => {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.componentRef.setInput('attachedFamiliarId', FAM_ID);
    fixture.componentRef.setInput('concepts', SAMPLE_CONCEPTS);
    fixture.componentRef.setInput('section', 'suggestions');
    fixture.detectChanges();
    // The bootstrap effect is bond-driven (not section-driven), so it still
    // pulls memory + suggestions even though the memory panel is hidden here.
    httpMock.expectOne(MEMORY).flush(memory());
    httpMock.expectOne((req) => req.url.split('?')[0] === SUGGEST).flush({ suggestions: [] });
    fixture.detectChanges();

    expect(testid('map-familiar-suggestions')).toBeTruthy();
    // The bond header, memory panel, diagnose, and Daily-Dose live on other tabs.
    expect(testid('map-familiar-bond')).toBeFalsy();
    expect(testid('map-familiar-memory')).toBeFalsy();
    expect(testid('map-familiar-diagnose')).toBeFalsy();
    expect(testid('map-familiar-daily-dose')).toBeFalsy();
  });

  it('section="familiar" renders the bond header, memory panel and Daily-Dose only', () => {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.componentRef.setInput('attachedFamiliarId', FAM_ID);
    fixture.componentRef.setInput('section', 'familiar');
    fixture.detectChanges();
    httpMock.expectOne(MEMORY).flush(memory());
    httpMock.expectOne((req) => req.url.split('?')[0] === SUGGEST).flush({ suggestions: [] });
    // This section — and only this one — also reads the Companion's reflection.
    httpMock.expectOne(KNOWLEDGE).flush(knowledgeWire());
    fixture.detectChanges();

    expect(testid('map-familiar-bond')).toBeTruthy();
    expect(testid('map-familiar-memory')).toBeTruthy();
    expect(testid('map-familiar-daily-dose')).toBeTruthy();
    expect(testid('map-familiar-suggestions')).toBeFalsy();
    expect(testid('map-familiar-diagnose')).toBeFalsy();
  });

  it('defaults to section="all" and renders every block', () => {
    mountAttached();
    expect(testid('map-familiar-bond')).toBeTruthy();
    expect(testid('map-familiar-suggestions')).toBeTruthy();
    expect(testid('map-familiar-memory')).toBeTruthy();
    expect(testid('map-familiar-diagnose')).toBeTruthy();
    expect(testid('map-familiar-daily-dose')).toBeTruthy();
  });

  it('dismiss PATCHes {detachFamiliar:true} and emits changed', () => {
    mountAttached();
    const changed = vi.fn();
    component.changed.subscribe(changed);

    testid<HTMLButtonElement>('map-familiar-dismiss')?.click();

    const req = httpMock.expectOne(GOAL);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ detachCompanion: true });
    req.flush({});
    fixture.detectChanges();

    expect(changed).toHaveBeenCalledTimes(1);
  });

  // ── Awakening resonance pick (R3-1, CHO-2013 P1) ─────────────────────

  it('pickResonance POSTs the focal concept to /resonance and emits changed', () => {
    mountAttached();
    const changed = vi.fn();
    component.changed.subscribe(changed);

    // Focal concept is 'c1' + a Familiar is bound → the pick is available.
    expect(component.canPickResonance()).toBe(true);
    const btn = testid<HTMLButtonElement>('map-familiar-resonance-pick');
    expect(btn).not.toBeNull();
    btn!.click();

    const req = httpMock.expectOne(`${BFF}/api/v1/me/familiars/${FAM_ID}/resonance`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ conceptId: 'c1' });
    req.flush({ data: { state: { familiarId: FAM_ID } } });
    fixture.detectChanges();

    expect(changed).toHaveBeenCalledTimes(1);
    expect(component.pickingResonance()).toBe(false);
  });

  it('hides the resonance pick when no concept is focal', () => {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.componentRef.setInput('attachedFamiliarId', FAM_ID);
    fixture.componentRef.setInput('focalConceptId', '');
    fixture.detectChanges();
    httpMock.expectOne(MEMORY).flush(memory());
    httpMock.expectOne((req) => req.url.split('?')[0] === SUGGEST).flush({ suggestions: [] });
    httpMock.expectOne(KNOWLEDGE).flush(knowledgeWire());
    fixture.detectChanges();

    expect(component.canPickResonance()).toBe(false);
    expect(testid('map-familiar-resonance-pick')).toBeNull();
  });

  // ── Suggestions loop (re-voiced fog) ──────────────────────────────────

  it('generate → poll → renders the pending suggestions', () => {
    mountAttached();
    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-suggest')?.click();

      const gen = httpMock.expectOne(GENERATE);
      expect(gen.request.method).toBe('POST');
      expect(gen.request.body).toEqual({
        goalId: GOAL_ID,
        focalConceptId: 'c1',
      });
      gen.flush({ status: 'requested', requestId: 'r1', focalConceptId: 'c1' });
      fixture.detectChanges();
      expect(component.suggestionsWaiting()).toBe(true);
      expect(testid('map-familiar-suggesting')).toBeTruthy();

      vi.advanceTimersByTime(2500);
      httpMock
        .expectOne((req) => req.url.split('?')[0] === SUGGEST)
        .flush({
          suggestions: [
            {
              suggestionId: 's9',
              kind: 'concept',
              status: 'pending',
              title: 'Ratios',
              rationale: 'Adjacent to Fractions',
            },
          ],
        });
      fixture.detectChanges();

      expect(component.suggestions()).toHaveLength(1);
      expect(component.suggestionsWaiting()).toBe(false);
      expect(testid('map-familiar-suggestion-s9')?.textContent).toContain('Ratios');
    } finally {
      vi.useRealTimers();
    }
  });

  it('generate failure toasts and clears the waiting state', () => {
    mountAttached();
    const toast = TestBed.inject(ToastService);
    const spy = vi.spyOn(toast, 'show');

    testid<HTMLButtonElement>('map-familiar-suggest')?.click();
    httpMock.expectOne(GENERATE).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('aplus.knowledge.familiar_suggest_error', 'error');
    expect(component.suggestionsWaiting()).toBe(false);
  });

  it('a fog-gate 409 (CAMPAIGN_NODE_NOT_WON) toasts the honest win-first copy', () => {
    // WS-C7: the campaign fog reveals only through wins, so a refused generate
    // names WHY instead of the generic retry.
    mountAttached();
    const toast = TestBed.inject(ToastService);
    const spy = vi.spyOn(toast, 'show');

    testid<HTMLButtonElement>('map-familiar-suggest')?.click();
    httpMock
      .expectOne(GENERATE)
      .flush(
        { code: 'CAMPAIGN_NODE_NOT_WON', message: 'not won' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('aplus.knowledge.campaign_gen_node_not_won', 'error');
    expect(component.suggestionsWaiting()).toBe(false);
  });

  it('root focal: hides Generate + points to authoring (root = authoring-only breadth, ADR-227 D2/D14)', () => {
    // The root IS the goal (D14, immutable); its breadth grows by authoring / re-root,
    // never an LLM win-to-reveal — so offer no doomed Generate, name the real lever.
    mountAttached({ section: 'suggestions', isRoot: true });
    expect(testid('map-familiar-suggest')).toBeFalsy();
    expect(testid('map-familiar-suggest-root')).toBeTruthy();
    expect(testid('map-familiar-suggest-locked')).toBeFalsy();
  });

  it('unwon non-root: gates Generate behind the win proactively (no doomed click)', () => {
    // ADR-227 D2 reveals a node's children only on winning it — show the gate up front
    // instead of an enabled button that 409s.
    mountAttached({ section: 'suggestions', focalWon: false });
    expect(testid('map-familiar-suggest')).toBeFalsy();
    expect(testid('map-familiar-suggest-locked')).toBeTruthy();
    expect(testid('map-familiar-suggest-root')).toBeFalsy();
  });

  it('won non-root: offers Generate (the reveal is unlocked)', () => {
    mountAttached({ section: 'suggestions', focalWon: true });
    expect(testid('map-familiar-suggest')).toBeTruthy();
    expect(testid('map-familiar-suggest-locked')).toBeFalsy();
    expect(testid('map-familiar-suggest-root')).toBeFalsy();
  });

  it('follows the node when the focal changes (drawer follows)', () => {
    mountAttached({
      suggestions: [{ suggestionId: 's1', kind: 'concept', status: 'pending', title: 'A' }],
    });
    expect(component.suggestions()).toHaveLength(1);

    // Recenter onto a different concept (Bug C: the panel must follow the node).
    // The read is GOAL-scoped since C4 slice 2 item 3, so following the node is
    // a client-side re-narrowing rather than a differently-parameterised
    // refetch; the effect still refetches, so a batch generated since is picked
    // up. This asserts the INTENT the old `focalConceptId=c2` check stood for,
    // and asserts it harder: the node we LEFT must not follow us here.
    fixture.componentRef.setInput('focalConceptId', 'c2');
    fixture.detectChanges();

    const req = httpMock.expectOne((r) => r.url.split('?')[0] === SUGGEST);
    expect(req.request.params.get('goalId')).toBe(GOAL_ID);
    expect(req.request.params.get('focalConceptId')).toBeNull();
    req.flush({
      suggestions: [
        { suggestionId: 's2', kind: 'concept', status: 'pending', title: 'B', focalConceptId: 'c2' },
        { suggestionId: 's3', kind: 'concept', status: 'pending', title: 'C' },
        { suggestionId: 's-left-behind', kind: 'concept', status: 'pending', title: 'Old', focalConceptId: 'c1' },
      ],
    });
    fixture.detectChanges();

    expect(component.suggestions().map((s) => s.suggestionId)).toEqual([
      's2',
      's3',
    ]);
  });

  it('shows an honest "still working" state (not "no suggestions") when the poll gives up', () => {
    mountAttached();
    // The poll window elapsed with nothing yet (suggestSlow) — the empty copy
    // would be a false negative, so the slow state must render instead.
    component.suggestSlow.set(true);
    fixture.detectChanges();
    expect(testid('map-familiar-suggest-slow')).toBeTruthy();
    expect(testid('map-familiar-no-suggestions')).toBeFalsy();
    // A manual re-check re-fetches the list and clears the slow state.
    testid<HTMLButtonElement>('map-familiar-suggest-recheck')?.click();
    httpMock
      .expectOne((r) => r.url.split('?')[0] === SUGGEST)
      .flush({
        suggestions: [{ suggestionId: 's9', kind: 'concept', status: 'pending', title: 'Ratios' }],
      });
    fixture.detectChanges();
    expect(component.suggestions()).toHaveLength(1);
    expect(component.suggestSlow()).toBe(false);
  });

  it('accept mints the suggestion, reloads the list, and emits changed', () => {
    mountAttached({
      suggestions: [{ suggestionId: 's1', kind: 'concept', status: 'pending', title: 'Primes' }],
    });
    const changed = vi.fn();
    component.changed.subscribe(changed);

    testid<HTMLButtonElement>('map-familiar-accept-s1')?.click();
    const acc = httpMock.expectOne(ACCEPT('s1'));
    expect(acc.request.method).toBe('POST');
    acc.flush({ suggestionId: 's1', kind: 'concept', status: 'accepted' });

    // onSuccess reloads the pending suggestions.
    httpMock.expectOne((req) => req.url.split('?')[0] === SUGGEST).flush({ suggestions: [] });
    fixture.detectChanges();

    expect(changed).toHaveBeenCalledTimes(1);
    expect(component.suggestions()).toHaveLength(0);
  });

  it('dismiss-suggestion POSTs dismiss, reloads, and does NOT emit changed', () => {
    mountAttached({
      suggestions: [{ suggestionId: 's1', kind: 'concept', status: 'pending', title: 'Primes' }],
    });
    const changed = vi.fn();
    component.changed.subscribe(changed);

    testid<HTMLButtonElement>('map-familiar-dismiss-suggestion-s1')?.click();
    const dis = httpMock.expectOne(DISMISS('s1'));
    expect(dis.request.method).toBe('POST');
    dis.flush({ suggestionId: 's1', kind: 'concept', status: 'dismissed' });

    httpMock.expectOne((req) => req.url.split('?')[0] === SUGGEST).flush({ suggestions: [] });
    httpMock.expectNone(GENERATE);
    fixture.detectChanges();

    expect(changed).not.toHaveBeenCalled();
    expect(component.suggestions()).toHaveLength(0);
  });

  it('shows the empty-suggestions state when none are pending', () => {
    mountAttached();
    expect(testid('map-familiar-no-suggestions')).toBeTruthy();
    expect(testid('map-familiar-suggesting')).toBeFalsy();
  });

  // ── Memory (reuse the existing panel) ─────────────────────────────────

  it('renders the reused memory panel from the fetched memory', () => {
    mountAttached({ mem: memory({ name: 'Athena' }) });
    expect(element.querySelector('chora-familiar-map-memory-panel')).toBeTruthy();
    expect(testid('fmemory-name')?.textContent).toContain('Athena');
  });

  it('surfaces a memory load error in the reused panel', () => {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.componentRef.setInput('attachedFamiliarId', FAM_ID);
    fixture.detectChanges();
    httpMock.expectOne(MEMORY).flush('boom', { status: 500, statusText: 'Server Error' });
    httpMock.expectOne((req) => req.url.split('?')[0] === SUGGEST).flush({ suggestions: [] });
    httpMock.expectOne(KNOWLEDGE).flush(knowledgeWire());
    fixture.detectChanges();

    // Memory is fail-LOUD (it IS the content); the reflection alongside it is
    // fail-SOFT. They are independent — a dead memory read still shows an error.
    expect(testid('fmemory-error')).toBeTruthy();
  });

  // ── Diagnose (growth-edge upload) ─────────────────────────────────────

  it('diagnose upload → poll COMPLETED toasts and emits changed', () => {
    mountAttached();
    const changed = vi.fn();
    component.changed.subscribe(changed);

    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();

      const up = httpMock.expectOne(UPLOADS);
      expect(up.request.method).toBe('POST');
      expect(up.request.body instanceof FormData).toBe(true);
      up.flush({ upload_id: 'u1', status: 'QUEUED' });

      vi.advanceTimersByTime(3000);
      httpMock.expectOne(UPLOAD_POLL('u1')).flush({
        upload_id: 'u1',
        status: 'COMPLETED',
        upserted_growth_edge_ids: ['ge-1'],
      });
      fixture.detectChanges();

      expect(testid('map-familiar-diagnose-done')).toBeTruthy();
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('diagnose upload → poll FAILED shows an error and does NOT emit changed', () => {
    mountAttached();
    const changed = vi.fn();
    component.changed.subscribe(changed);

    const file = new File(['data'], 'notes.png', { type: 'image/png' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u2', status: 'QUEUED' });

      vi.advanceTimersByTime(3000);
      httpMock
        .expectOne(UPLOAD_POLL('u2'))
        .flush({ upload_id: 'u2', status: 'FAILED', failure_reason: 'x' });
      fixture.detectChanges();

      expect(testid('map-familiar-diagnose-error')).toBeTruthy();
      expect(changed).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('diagnose upload → AWAITING_REVIEW stops polling and offers the review, not a false failure', () => {
    // O2 (CHO-2301). Under WEAKNESS_CREW_MODE=graph the crew parks the job at an
    // unconditional interrupt() and synthesize_edges runs only AFTER the resume.
    // The poller previously branched on COMPLETED/FAILED only, so an
    // AWAITING_REVIEW job fell into "still pending", ticked 40x3s and then
    // reported failure for a run that had SUCCEEDED and was waiting on the
    // learner. Worse, it charged mana first.
    mountAttached();
    const changed = vi.fn();
    component.changed.subscribe(changed);

    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u-rev', status: 'QUEUED' });

      vi.advanceTimersByTime(3000);
      httpMock.expectOne(UPLOAD_POLL('u-rev')).flush({
        upload_id: 'u-rev',
        status: 'AWAITING_REVIEW',
        review: { proposed_edges: [], candidate_struggles: [], available_outputs: [] },
      });
      fixture.detectChanges();

      expect(component.uploadPhase()).toBe('awaiting_review');
      expect(testid('map-familiar-diagnose-review')).toBeTruthy();

      // The decisive half: polling must have STOPPED. Advancing well past the
      // 40-tick ceiling must issue no further request and never flip to failed.
      vi.advanceTimersByTime(3000 * 45);
      httpMock.expectNone(UPLOAD_POLL('u-rev'));
      expect(component.uploadPhase()).toBe('awaiting_review');
      expect(changed).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('diagnose upload → the review CTA deep-links to the review route for that upload', () => {
    // O3: the panel is reached by ROUTE (the component owns its own poller, so
    // mounting it inside this drawer would put two pollers on one job).
    mountAttached();
    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u-cta', status: 'QUEUED' });
      vi.advanceTimersByTime(3000);
      httpMock
        .expectOne(UPLOAD_POLL('u-cta'))
        .flush({ upload_id: 'u-cta', status: 'AWAITING_REVIEW' });
      fixture.detectChanges();

      const cta = testid<HTMLAnchorElement>('map-familiar-diagnose-review');
      expect(cta?.getAttribute('href')).toBe('/a/growth-edges/review/u-cta');
    } finally {
      vi.useRealTimers();
    }
  });

  it('diagnose upload → AWAITING_REVIEW persists the pending-review id for the resume banner', () => {
    // CHO-2337: closing the drawer destroys the in-drawer review CTA above, so
    // the park ALSO writes the upload id to localStorage. /a/knowledge reads it
    // and re-offers the review, self-healed against GET /uploads/{id}.
    localStorage.removeItem(PENDING_REVIEW_STORAGE_KEY);
    mountAttached();
    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u-persist', status: 'QUEUED' });
      vi.advanceTimersByTime(3000);
      httpMock
        .expectOne(UPLOAD_POLL('u-persist'))
        .flush({ upload_id: 'u-persist', status: 'AWAITING_REVIEW' });
      fixture.detectChanges();

      expect(localStorage.getItem(PENDING_REVIEW_STORAGE_KEY)).toBe('u-persist');
    } finally {
      vi.useRealTimers();
      localStorage.removeItem(PENDING_REVIEW_STORAGE_KEY);
    }
  });

  it('diagnose upload → persists the pending-review id at SUBMIT, before any poll tick', () => {
    // The live bug: the poll gave up while the backend was still analysing AND
    // localStorage was NULL (the id was only written on AWAITING_REVIEW, never
    // reached), so /a/knowledge could not self-heal the review. The id must be
    // stored the instant the 202 lands, before the first poll, so a closed
    // drawer or a ceiling-hit can still be recovered by the re-entry banner.
    localStorage.removeItem(PENDING_REVIEW_STORAGE_KEY);
    mountAttached();
    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u-submit', status: 'QUEUED' });

      // No poll tick has run yet (timers not advanced), and the id is already
      // parked. This is the whole fix for the NULL-store half of the live bug.
      expect(localStorage.getItem(PENDING_REVIEW_STORAGE_KEY)).toBe('u-submit');
      expect(component.uploadPhase()).toBe('analyzing');
    } finally {
      vi.useRealTimers();
    }
  });

  it('diagnose upload → stays busy while QUEUED past the OLD ~2 min bound, failing only at the ~5 min ceiling', () => {
    // The core regression: real graph-mode analysis runs ~2 to 4 min sitting
    // QUEUED the whole time. The old 40x3s (~2 min) ceiling reported a false
    // "couldn't finish" mid-analysis. The widened ceiling must keep the learner
    // in the busy state well past the old bound, and only fail at the very end.
    mountAttached();
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u-slow', status: 'QUEUED' });

      // 50 ticks = 150s, comfortably past both the reported ~90s and the real
      // old 120s (40-tick) cap. Under the old ceiling this would already be
      // 'failed'; it must instead still be busy with no error surfaced.
      pollQueuedTimes('u-slow', 50);
      fixture.detectChanges();
      expect(component.uploadPhase()).toBe('analyzing');
      expect(testid('map-familiar-diagnose-busy')).toBeTruthy();
      expect(testid('map-familiar-diagnose-error')).toBeFalsy();
      expect(toastSpy).not.toHaveBeenCalledWith(
        'aplus.knowledge.familiar_diagnose_error',
        'error',
      );

      // Poll on QUEUED right up to the tick before the ceiling: still busy.
      pollQueuedTimes('u-slow', UPLOAD_POLL_MAX - 1 - 50);
      expect(component.uploadPhase()).toBe('analyzing');

      // The ceiling tick: only NOW does it fail, and it says so honestly.
      pollQueuedTimes('u-slow', 1);
      fixture.detectChanges();
      expect(component.uploadPhase()).toBe('failed');
      expect(testid('map-familiar-diagnose-error')).toBeTruthy();
      expect(toastSpy).toHaveBeenCalledWith(
        'aplus.knowledge.familiar_diagnose_error',
        'error',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('diagnose upload → COMPLETED clears the submit-time pending-review marker', () => {
    // A COMPLETED run needs no HITL review, so the submit-time marker must be
    // dropped: otherwise /a/knowledge would poll a resolved job on next visit.
    localStorage.removeItem(PENDING_REVIEW_STORAGE_KEY);
    mountAttached();
    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u-done', status: 'QUEUED' });
      // Written at submit…
      expect(localStorage.getItem(PENDING_REVIEW_STORAGE_KEY)).toBe('u-done');

      vi.advanceTimersByTime(UPLOAD_POLL_INTERVAL_MS);
      httpMock.expectOne(UPLOAD_POLL('u-done')).flush({
        upload_id: 'u-done',
        status: 'COMPLETED',
        upserted_growth_edge_ids: ['ge-1'],
      });
      fixture.detectChanges();

      // …and cleared once the run completes with nothing parked for review.
      expect(localStorage.getItem(PENDING_REVIEW_STORAGE_KEY)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('diagnose upload → surfaces a "this can take a couple of minutes" reassurance once the wait runs long', () => {
    // Optional UX: a multi-minute wait on a silent page reads as a stall. Once
    // the wait crosses the slow threshold, a calm reassurance appears under the
    // working line, while STILL busy, never a failure.
    mountAttached();
    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u-reassure', status: 'QUEUED' });

      // Just short of the threshold: only the working line, no reassurance yet.
      pollQueuedTimes('u-reassure', UPLOAD_SLOW_AFTER - 1);
      fixture.detectChanges();
      expect(testid('map-familiar-diagnose-busy')).toBeTruthy();
      expect(testid('map-familiar-diagnose-reassure')).toBeFalsy();

      // Cross it: the reassurance shows, and the panel is still busy analysing.
      pollQueuedTimes('u-reassure', 1);
      fixture.detectChanges();
      expect(component.uploadPhase()).toBe('analyzing');
      expect(testid('map-familiar-diagnose-reassure')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('diagnose upload → a transient poll error is a pending tick, not a verdict', () => {
    // 2026-07-05 KG-walk: one edge 504 on a poll used to abort the whole
    // diagnosis even though the backend was still (successfully) analysing.
    mountAttached();
    const changed = vi.fn();
    component.changed.subscribe(changed);

    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u3', status: 'QUEUED' });

      // First poll hits a transient edge 504 — must NOT fail the diagnosis.
      vi.advanceTimersByTime(3000);
      httpMock
        .expectOne(UPLOAD_POLL('u3'))
        .flush('gateway timeout', { status: 504, statusText: 'Gateway Timeout' });
      fixture.detectChanges();
      expect(testid('map-familiar-diagnose-error')).toBeFalsy();

      // The next poll completes — the diagnosis still succeeds end-to-end.
      vi.advanceTimersByTime(3000);
      httpMock.expectOne(UPLOAD_POLL('u3')).flush({
        upload_id: 'u3',
        status: 'COMPLETED',
        upserted_growth_edge_ids: ['ge-9'],
      });
      fixture.detectChanges();

      expect(testid('map-familiar-diagnose-done')).toBeTruthy();
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('diagnose upload → COMPLETED with 2 edges shows the D5 summary count and emits diagnosed', () => {
    // ADR-238 D5: a run that placed edges records the count for the goal-level
    // summary and tells the parent to auto-reveal the Growth lens (diagnosed).
    mountAttached();
    const diagnosed = vi.fn();
    component.diagnosed.subscribe(diagnosed);

    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u1', status: 'QUEUED' });

      vi.advanceTimersByTime(3000);
      httpMock.expectOne(UPLOAD_POLL('u1')).flush({
        upload_id: 'u1',
        status: 'COMPLETED',
        upserted_growth_edge_ids: ['ge-1', 'ge-2'],
      });
      fixture.detectChanges();

      expect(component.uploadPhase()).toBe('done');
      // The summary interpolates a count param; the test TranslateService echoes
      // the key, so assert the count on the signal (the render is param-driven).
      expect(component.diagnoseResult()?.count).toBe(2);
      expect(testid('map-familiar-diagnose-done')).toBeTruthy();
      expect(testid('map-familiar-diagnose-empty')).toBeFalsy();
      expect(diagnosed).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('diagnose upload → COMPLETED with ZERO edges shows the D6 empty state, not a bare success', () => {
    // ADR-238 D6: "processed" is not "found". A zero-edge completion must render
    // an explicit empty state — never the plain "growth signals updated" toast —
    // and must NOT auto-reveal the Growth lens (nothing landed to reveal).
    mountAttached();
    const changed = vi.fn();
    const diagnosed = vi.fn();
    component.changed.subscribe(changed);
    component.diagnosed.subscribe(diagnosed);
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    const file = new File(['data'], 'clean.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u1', status: 'QUEUED' });

      vi.advanceTimersByTime(3000);
      httpMock.expectOne(UPLOAD_POLL('u1')).flush({
        upload_id: 'u1',
        status: 'COMPLETED',
        upserted_growth_edge_ids: [],
      });
      fixture.detectChanges();

      expect(component.uploadPhase()).toBe('empty');
      expect(testid('map-familiar-diagnose-empty')).toBeTruthy();
      expect(testid('map-familiar-diagnose-done')).toBeFalsy();
      // The bare "growth signals updated" success MUST NOT fire on an empty run.
      expect(toastSpy).not.toHaveBeenCalledWith(
        'aplus.knowledge.familiar_diagnose_done',
        'success',
      );
      // changed still emits (harmless refetch); diagnosed does NOT (no reveal).
      expect(changed).toHaveBeenCalledTimes(1);
      expect(diagnosed).not.toHaveBeenCalled();
      expect(component.diagnoseResult()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Locked-fog suggestions: name the lever AND offer it ───────────────

  it('offers a practice CTA on the win-gated suggestions state', () => {
    // ADR-227 D2 withholds Generate until the hex is won, which is correct. But
    // the copy named "win this hex" while giving no way to do it, so the learner
    // reads it as "there is nowhere to activate my Companion".
    mountAttached({ section: 'suggestions', focalWon: false });
    expect(testid('map-familiar-suggest-locked')).toBeTruthy();
    const cta = testid<HTMLButtonElement>('map-familiar-suggest-practice');
    expect(cta).toBeTruthy();

    const practice = vi.fn();
    component.practiceRequested.subscribe(practice);
    cta?.click();
    expect(practice).toHaveBeenCalledTimes(1);
  });

  it('does NOT offer the practice CTA on the root, which is authoring-only', () => {
    mountAttached({ section: 'suggestions', isRoot: true, focalWon: false });
    expect(testid('map-familiar-suggest-practice')).toBeFalsy();
  });

  // ── Diagnose upload affordance (shared dropzone + client validation) ───

  it('renders the shared drag-and-drop dropzone, not a bare file input', () => {
    mountAttached({ section: 'diagnose' });
    expect(testid('map-familiar-diagnose-dropzone')).toBeTruthy();
    // The old bare <input type="file"> affordance is gone.
    expect(testid('map-familiar-diagnose-file')).toBeFalsy();
  });

  it('accepts a supported file and offers it for diagnosis', () => {
    mountAttached({ section: 'diagnose' });
    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();
    expect(component.uploadFile()).toBe(file);
    expect(component.uploadError()).toBeNull();
    expect(testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.disabled).toBe(false);
  });

  it('refuses a type the diagnose door would 415, before any upload fires', () => {
    mountAttached({ section: 'diagnose' });
    // .docx is offered by the AUTHORING dropzone but is NOT in the diagnose
    // backend allowlist (application/pdf|png|jpeg|jpg|text/plain|text/markdown).
    // Reusing the authoring accept list verbatim would hand the learner a picker
    // that accepts files the server rejects.
    const file = new File(['data'], 'notes.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    component.onFilesAdded([file]);
    fixture.detectChanges();
    expect(component.uploadFile()).toBeNull();
    expect(component.uploadError()).toBe('aplus.knowledge.familiar_diagnose_error_type');
    expect(testid('map-familiar-diagnose-file-error')).toBeTruthy();
    httpMock
      .match((r) => r.url.endsWith('/growth-edges/uploads') && r.method === 'GET')
      .forEach((r) => !r.cancelled && r.flush({ items: [] }));
    httpMock.verify(); // nothing was UPLOADED (the parked GET above is a read)
  });

  it('refuses a file over the 32MB server cap, before any upload fires', () => {
    mountAttached({ section: 'diagnose' });
    const big = new File(['x'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 32 * 1024 * 1024 + 1 });
    component.onFilesAdded([big]);
    fixture.detectChanges();
    expect(component.uploadFile()).toBeNull();
    expect(component.uploadError()).toBe('aplus.knowledge.familiar_diagnose_error_size');
    httpMock
      .match((r) => r.url.endsWith('/growth-edges/uploads') && r.method === 'GET')
      .forEach((r) => !r.cancelled && r.flush({ items: [] }));
    httpMock.verify();
  });

  it('removing the selected file clears it and its error', () => {
    mountAttached({ section: 'diagnose' });
    const bad = new File(['data'], 'notes.docx', { type: 'application/msword' });
    component.onFilesAdded([bad]);
    fixture.detectChanges();
    expect(component.uploadError()).not.toBeNull();

    component.onFileRemoved();
    fixture.detectChanges();
    expect(component.uploadFile()).toBeNull();
    expect(component.uploadError()).toBeNull();
  });

  // ── ADR-238 D2 prerequisite: the goal-level entry carries NO concept hint ──

  it('a CONCEPT-entry diagnose sends the focal as a soft hint', () => {
    mountAttached({ section: 'diagnose' });
    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();
    testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
    const form = httpMock.expectOne(UPLOADS).request.body as FormData;
    expect(form.get('goal_id')).toBe(GOAL_ID);
    expect(form.get('concept_id')).toBe('c1');
  });

  it('a GOAL-level diagnose sends NO concept hint at all', () => {
    // "Diagnose my map" must select SOME concept purely to have a drawer to host
    // the form (root, else focal, else concepts()[0] in repo order). Sending that
    // as a hint is harmless only while ADR-238 D2's bias is unbuilt; the moment
    // the bias lands it would silently bias a WHOLE-MAP diagnosis toward an
    // arbitrary node. So the goal-level path must omit the hint entirely.
    mountAttached({ section: 'diagnose' });
    fixture.componentRef.setInput('diagnoseScope', 'goal');
    fixture.detectChanges();

    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();
    testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();

    const form = httpMock.expectOne(UPLOADS).request.body as FormData;
    expect(form.get('goal_id')).toBe(GOAL_ID);
    expect(form.get('concept_id')).toBeNull();
  });

  // ── Diagnose progress + result copy ───────────────────────────────────

  it('shows an ANIMATED working indicator while the Companion reads', () => {
    mountAttached({ section: 'diagnose' });
    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();
    testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
    httpMock.expectOne(UPLOADS).flush({ upload_id: 'u1', status: 'QUEUED' });
    fixture.detectChanges();

    const busy = testid('map-familiar-diagnose-busy');
    expect(busy).toBeTruthy();
    // Words alone read as a frozen page. There must be a spinning/pulsing icon.
    const spinner = busy?.querySelector('i.fa-spin, i.fa-fade, i.fa-pulse, i.fa-beat');
    expect(spinner).toBeTruthy();
  });

  it('celebrates a successful diagnosis with a reward animation', () => {
    mountAttached({ section: 'diagnose' });
    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u1', status: 'QUEUED' });
      vi.advanceTimersByTime(3000);
      httpMock.expectOne(UPLOAD_POLL('u1')).flush({
        upload_id: 'u1',
        status: 'COMPLETED',
        upserted_growth_edge_ids: ['ge-1', 'ge-2'],
      });
      fixture.detectChanges();

      const done = testid('map-familiar-diagnose-done');
      expect(done).toBeTruthy();
      expect(done?.classList.contains('is-celebrating')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('picks the singular summary key for exactly one growth spot', () => {
    mountAttached({ section: 'diagnose' });
    const file = new File(['data'], 'marked.pdf', { type: 'application/pdf' });
    component.onFilesAdded([file]);
    fixture.detectChanges();

    vi.useFakeTimers();
    try {
      testid<HTMLButtonElement>('map-familiar-diagnose-submit')?.click();
      httpMock.expectOne(UPLOADS).flush({ upload_id: 'u1', status: 'QUEUED' });
      vi.advanceTimersByTime(3000);
      httpMock.expectOne(UPLOAD_POLL('u1')).flush({
        upload_id: 'u1',
        status: 'COMPLETED',
        upserted_growth_edge_ids: ['ge-1'],
      });
      fixture.detectChanges();
      // "Found 1 growth spots" is a quality bug the old single key guaranteed.
      expect(component.diagnoseSummaryKey()).toBe(
        'aplus.knowledge.familiar_diagnose_summary_one',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Daily-dose CTA ────────────────────────────────────────────────────

  it('exposes a daily-dose CTA routed to the real /a/daily-dose surface', () => {
    mountAttached();
    const cta = testid<HTMLAnchorElement>('map-familiar-daily-dose');
    expect(cta).toBeTruthy();
    expect(cta?.getAttribute('href')).toBe('/a/daily-dose');
  });

  it('scopes the daily-dose CTA to the parent-supplied focal edge params', () => {
    mountAttached();
    fixture.componentRef.setInput('doseQueryParams', {
      growth_edge_id: 'ge-1',
      concept: 'Weak spot',
    });
    fixture.detectChanges();
    const cta = testid<HTMLAnchorElement>('map-familiar-daily-dose');
    expect(cta?.getAttribute('href')).toBe('/a/daily-dose?growth_edge_id=ge-1&concept=Weak%20spot');
  });

  // ── Accessibility ─────────────────────────────────────────────────────

  it('has no critical/serious a11y violations (attached)', async () => {
    mountAttached();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  it('has no critical/serious a11y violations (summon)', async () => {
    mountSummon();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ── Goal-scoped knowledge (CHO-2116 tier 1) ──────────────────────────
  it('computes goal knowledge from painted concepts (shaky-first, due, mastered)', () => {
    mountAttached();
    fixture.componentRef.setInput('concepts', [
      {
        conceptId: 'c1',
        title: 'Multiplication Tables',
        atomRefs: [],
        growthEdge: {
          edgeId: 'e1',
          conceptKey: 'multiplication-tables',
          strength: 0.8,
          isDue: true,
        },
      },
      {
        conceptId: 'c2',
        title: 'Equivalence Test',
        atomRefs: [],
        growthEdge: {
          edgeId: 'e2',
          conceptKey: 'equivalence-test',
          strength: 0.3,
        },
      },
      { conceptId: 'c3', title: 'Quadratics', atomRefs: [], mastered: true },
      { conceptId: 'c4', title: 'Plain', atomRefs: [] },
      {
        conceptId: 'c5',
        title: 'Remediate Edge',
        atomRefs: [],
        intent: 'remediate',
      },
    ] satisfies readonly ConceptNode[]);
    fixture.detectChanges();

    const k = component.goalKnowledge();
    expect(k.shaky.map((s) => s.title)).toEqual([
      'Multiplication Tables',
      'Equivalence Test',
      'Remediate Edge',
    ]);
    expect(k.shaky[0].due).toBe(true);
    expect(k.shaky[1].due).toBe(false);
    expect(k.mastered).toEqual(['Quadratics']);
  });

  // ── The Companion's reflection (CHO-2118 tier 2) ───────────────────────
  //
  // A read is not free: on a stale cache the BE claims the row and schedules an
  // LLM synthesis. So the read is bound to the Companion tab actually being on
  // screen — never fired for a panel the learner is not looking at.

  it('reads the goal-knowledge model when the Companion tab is shown', () => {
    mountAttached({
      section: 'familiar',
      knowledge: knowledgeWire({
        reflection: { text: 'I remember your curiosity here.', status: 'fresh' },
      }),
    });

    expect(component.reflection()?.status).toBe('fresh');
    expect(component.reflection()?.text).toContain('curiosity');
  });

  it('does NOT read it from another tab (a read can schedule an LLM call)', () => {
    mountAttached({ section: 'suggestions' });

    httpMock.expectNone(KNOWLEDGE);
    expect(component.reflection()).toBeNull();
  });

  it('never reads it without a bound Companion', () => {
    mountSummon();

    httpMock.expectNone(KNOWLEDGE);
    expect(component.reflection()).toBeNull();
  });

  it('fails SOFT when the goal-knowledge read errors — tier 1 still stands', () => {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.componentRef.setInput('attachedFamiliarId', FAM_ID);
    fixture.componentRef.setInput('focalConceptId', 'c1');
    fixture.componentRef.setInput('concepts', SAMPLE_CONCEPTS);
    fixture.componentRef.setInput('section', 'familiar');
    fixture.detectChanges();
    httpMock.expectOne(MEMORY).flush(memory());
    httpMock.expectOne((req) => req.url.split('?')[0] === SUGGEST).flush({ suggestions: [] });
    httpMock
      .expectOne(KNOWLEDGE)
      .flush(
        { code: 'GOAL_KNOWLEDGE_UNAVAILABLE', message: 'read model offline' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    fixture.detectChanges();

    // The reflection is an enrichment over the deterministic block, so a dead
    // read costs the prose and nothing else. No error card, no broken panel.
    expect(component.reflection()).toBeNull();
    expect(testid('map-familiar-memory')).toBeTruthy();
  });

  it('does not re-ask once a fresh reflection is held', () => {
    mountAttached({
      section: 'familiar',
      knowledge: knowledgeWire({
        reflection: { text: 'fresh prose', status: 'fresh' },
      }),
    });

    // Leave the Companion tab and come back.
    fixture.componentRef.setInput('section', 'diagnose');
    fixture.detectChanges();
    fixture.componentRef.setInput('section', 'familiar');
    fixture.detectChanges();

    httpMock.expectNone(KNOWLEDGE);
    expect(component.reflection()?.text).toBe('fresh prose');
  });

  it('re-asks on re-open while reflecting, so the finished prose lands', () => {
    mountAttached({
      section: 'familiar',
      knowledge: knowledgeWire({
        reflection: { text: '', status: 'reflecting' },
      }),
    });
    expect(component.reflection()?.status).toBe('reflecting');

    fixture.componentRef.setInput('section', 'diagnose');
    fixture.detectChanges();
    fixture.componentRef.setInput('section', 'familiar');
    fixture.detectChanges();

    // The synthesis completed while the learner was away. Without this re-ask
    // the reflection would stay stuck on "reflecting…" until a full reload.
    httpMock.expectOne(KNOWLEDGE).flush(
      knowledgeWire({
        reflection: { text: 'the finished prose', status: 'fresh' },
      }),
    );
    fixture.detectChanges();

    expect(component.reflection()?.text).toBe('the finished prose');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CHO-2403: one Companion, one knowledge graph (picker filter + zero state)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The picker offered the WHOLE roster, including Companions already bound to
 * another graph. Nothing stopped the summon either: the "1:1" the code talks
 * about everywhere means goal to Companion, so a goal cannot hold two, but a
 * Companion could be spread across any number of goals. Production already
 * had duplicates by the time this was written.
 *
 * This is the UX layer of the fix. The refusal itself is the 409 in
 * chora-consumption, and the guarantee is the partial unique index; a filtered
 * list alone would only be theatre.
 */
describe('MapFamiliarPanelComponent one Companion per graph (CHO-2403)', () => {
  let fixture: ComponentFixture<MapFamiliarPanelComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  const OTHER_FAM = 'fam-taken';
  const OTHER_GOAL = 'goal-2';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapFamiliarPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(MapFamiliarPanelComponent);
    element = fixture.nativeElement as HTMLElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock
      .match((r) => r.url.endsWith('/growth-edges/uploads') && r.method === 'GET')
      .forEach((r) => !r.cancelled && r.flush({ items: [] }));
    httpMock.verify();
  });

  function tid<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return element.querySelector<T>(`[data-testid="${id}"]`);
  }

  /** Mount the summon picker with a roster AND the learner's goal list. */
  function mountPicker(
    roster: Record<string, unknown>[],
    goals: Record<string, unknown>[],
  ): void {
    fixture.componentRef.setInput('goalId', GOAL_ID);
    fixture.detectChanges();
    httpMock.expectOne(ROSTER).flush({ items: roster });
    for (const req of httpMock.match((r) => r.url === GOALS)) {
      if (!req.cancelled) req.flush({ items: goals, primaryLens: 'curiosity' });
    }
    fixture.detectChanges();
  }

  it('hides a Companion already assigned to ANOTHER graph', () => {
    mountPicker(
      [familiarWire(FAM_ID, 'Sage'), familiarWire(OTHER_FAM, 'Pingu')],
      [
        { goalId: GOAL_ID, kind: 'curiosity', conceptSet: [], status: 'active', northStarNote: '', createdAt: '', updatedAt: '' },
        { goalId: OTHER_GOAL, kind: 'curiosity', conceptSet: [], status: 'active', northStarNote: '', attachedFamiliarId: OTHER_FAM, createdAt: '', updatedAt: '' },
      ],
    );
    expect(tid('map-familiar-summon-' + FAM_ID)).toBeTruthy();
    expect(tid('map-familiar-summon-' + OTHER_FAM)).toBeFalsy();
  });

  it('offers the zero state with a hatch CTA when EVERY Companion is taken', () => {
    mountPicker(
      [familiarWire(OTHER_FAM, 'Pingu')],
      [
        { goalId: GOAL_ID, kind: 'curiosity', conceptSet: [], status: 'active', northStarNote: '', createdAt: '', updatedAt: '' },
        { goalId: OTHER_GOAL, kind: 'curiosity', conceptSet: [], status: 'active', northStarNote: '', attachedFamiliarId: OTHER_FAM, createdAt: '', updatedAt: '' },
      ],
    );
    // Not the same thing as owning none, and it must not say so.
    expect(tid('map-familiar-all-assigned')).toBeTruthy();
    expect(tid('map-familiar-no-roster')).toBeFalsy();
    expect(tid('map-familiar-roster')).toBeFalsy();
    const cta = tid<HTMLAnchorElement>('map-familiar-all-assigned-cta');
    expect(cta).toBeTruthy();
    expect(cta?.getAttribute('href')).toBe('/a/companion/marketplace');
  });

  it('keeps the owns-NONE state distinct from the all-assigned state', () => {
    mountPicker([], []);
    expect(tid('map-familiar-no-roster')).toBeTruthy();
    expect(tid('map-familiar-all-assigned')).toBeFalsy();
  });

  it('does not exclude a Companion bound to THIS graph', () => {
    // Defensive: the filter keys on OTHER goals. A bond on this goal must
    // never remove its own Companion from the list.
    mountPicker(
      [familiarWire(FAM_ID, 'Sage')],
      [
        { goalId: GOAL_ID, kind: 'curiosity', conceptSet: [], status: 'active', northStarNote: '', attachedFamiliarId: FAM_ID, createdAt: '', updatedAt: '' },
      ],
    );
    expect(tid('map-familiar-summon-' + FAM_ID)).toBeTruthy();
  });
});
