/**
 * S3: the Rituals composer gets the keyboard reorder path, beside the pointer
 * one, and both land in ONE mutation (ruling R-a).
 *
 * Order is the consequential act in this editor. It was pointer-only, because
 * Angular CDK ships no keyboard dragging, so the one thing the composer exists
 * to do could not be done without a mouse. The pointer path is KEPT: removing
 * `cdkDrag` to close a keyboard gap would take working mouse reordering away
 * from everyone to fix it, which is not a fix. Both inputs route into
 * `moveStep`, so there is one reorder in the model and two ways to ask for it.
 *
 * The selection tests are the ones that matter most. `selectedStepIndex` is an
 * INDEX, and the inspector renders whatever sits at it, so a move that does not
 * carry the selection silently repoints the param editor at a DIFFERENT step
 * while the learner is editing it. That defect is already live on the pointer
 * path today; the keyboard path would have inherited it.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import { RoutinesTabComponent } from './routines-tab.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import { environment } from '../../../../../../environments/environment';
import type { LoadoutGrant } from '../../../../../core/familiar/familiar-growth.model';
import type { Ritual } from '../../../../../core/familiar/familiar-ritual.model';

/** chora-web root, located by walking up until package.json is found. */
const WEB_ROOT = (() => {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop++) {
    try {
      statSync(join(dir, 'src/app/features/surfaces/aplus'));
      return dir;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(`routines-tab.reorder.spec: no chora-web root above ${process.cwd()}`);
})();

const FID = '00000000-0000-7000-8000-00000000e1a0';
const base = `${environment.bffBaseUrl}/api/v1/me/familiars/${FID}`;

function grant(over: Partial<LoadoutGrant> = {}): LoadoutGrant {
  return {
    skillKey: 'weakness_sight',
    skillKind: 'active',
    slotCost: 1,
    equipped: true,
    unlockedVia: 'species_path',
    unlockedAtStage: 4,
    catalogueActive: true,
    ...over,
  };
}

function loadoutView(grants: LoadoutGrant[]): Record<string, unknown> {
  return {
    familiarId: FID,
    skillGrants: grants.map((g) => g.skillKey),
    equippedSkills: grants.filter((g) => g.equipped).map((g) => g.skillKey),
    grants,
    skillSlotsUnlocked: 7,
    slotsUsed: grants.filter((g) => g.equipped).length,
    evolutionTier: 'adept',
    growthStage: 4,
  };
}

function ritual(over: Partial<Ritual> = {}): Ritual {
  return {
    ritualId: 'r1',
    familiarId: FID,
    name: 'Warm-up',
    trigger: 'manual',
    sink: 'chat',
    enabled: false,
    publishedPriceUnits: 20,
    currentRevision: 0,
    steps: [],
    createdAt: '2026-07-09T00:00:00Z',
    updatedAt: '2026-07-09T00:00:00Z',
    ...over,
  };
}

function setup() {
  TestBed.configureTestingModule({
    imports: [RoutinesTabComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), TranslateService],
  });
  const fixture = TestBed.createComponent(RoutinesTabComponent);
  fixture.componentRef.setInput('familiarId', FID);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock
    .expectOne(`${base}/rituals`)
    .flush({ rituals: [ritual()], wiredSinks: ['chat'] });
  httpMock.expectOne(`${base}/skills`).flush(loadoutView([grant()]));
  fixture.detectChanges();
  return {
    fixture,
    cmp: fixture.componentInstance,
    httpMock,
    el: fixture.nativeElement as HTMLElement,
  };
}

/** Open the composer on a ritual with three named steps, a, b, c. */
function withThreeSteps(s: ReturnType<typeof setup>) {
  s.cmp.selected.set(ritual());
  // The 3-pane composer renders only in compose mode; `selected` alone leaves
  // the list showing, and every DOM assertion then reads an empty pane.
  s.cmp.mode.set('compose');
  s.cmp.addStepFromPalette(grant({ skillKey: 'a' }));
  s.cmp.addStepFromPalette(grant({ skillKey: 'b' }));
  s.cmp.addStepFromPalette(grant({ skillKey: 'c' }));
  s.fixture.detectChanges();
}

function keys(s: ReturnType<typeof setup>): string[] {
  return s.cmp.draftSteps().map((x) => x.skillKey);
}

describe('Rituals composer reorder, one mutation for two input paths', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('moves a step by keyboard, which was impossible before', () => {
    const s = setup();
    httpMock = s.httpMock;
    withThreeSteps(s);

    s.cmp.onStepReorder({ from: 0, to: 2 });
    s.fixture.detectChanges();

    expect(keys(s)).toEqual(['b', 'c', 'a']);
  });

  it('lands the pointer drop and the keyboard move in the SAME mutation', () => {
    // Not a style point. Two reorder implementations drift, and the one that
    // drifts is always the one fewer people exercise. Same start, same request,
    // same result, whichever device asked.
    const viaPointer = setup();
    httpMock = viaPointer.httpMock;
    withThreeSteps(viaPointer);
    viaPointer.cmp.onStepDrop({ previousIndex: 0, currentIndex: 2 } as never);
    const pointerResult = keys(viaPointer);
    viaPointer.httpMock.verify();

    TestBed.resetTestingModule();
    const viaKeyboard = setup();
    httpMock = viaKeyboard.httpMock;
    withThreeSteps(viaKeyboard);
    viaKeyboard.cmp.onStepReorder({ from: 0, to: 2 });
    const keyboardResult = keys(viaKeyboard);

    expect(keyboardResult).toEqual(pointerResult);
    expect(keyboardResult).toEqual(['b', 'c', 'a']);
  });

  it('carries the SELECTION with the step that moved', () => {
    // The learner is editing step a's params. Moving a must keep the inspector
    // on a, not hand them step b's params under the same heading.
    const s = setup();
    httpMock = s.httpMock;
    withThreeSteps(s);
    s.cmp.selectStep(0);

    s.cmp.onStepReorder({ from: 0, to: 2 });
    s.fixture.detectChanges();

    expect(s.cmp.selectedStepIndex()).toBe(2);
    expect(s.cmp.selectedStep()?.skillKey).toBe('a');
  });

  it('shifts the selection when a DIFFERENT step moves across it', () => {
    // c is selected at index 2. Moving a from 0 to 2 pushes c up to 1. The
    // selected index must follow the step, not stay on the number.
    const s = setup();
    httpMock = s.httpMock;
    withThreeSteps(s);
    s.cmp.selectStep(2);

    s.cmp.onStepReorder({ from: 0, to: 2 });
    s.fixture.detectChanges();

    expect(s.cmp.selectedStep()?.skillKey).toBe('c');
    expect(s.cmp.selectedStepIndex()).toBe(1);
  });

  it('leaves the selection alone when the move does not straddle it', () => {
    // a selected at 0; b and c swap below it. Nothing about a changed.
    const s = setup();
    httpMock = s.httpMock;
    withThreeSteps(s);
    s.cmp.selectStep(0);

    s.cmp.onStepReorder({ from: 1, to: 2 });
    s.fixture.detectChanges();

    expect(s.cmp.selectedStepIndex()).toBe(0);
    expect(s.cmp.selectedStep()?.skillKey).toBe('a');
  });

  it('carries the selection on a POINTER drop too, not just the new path', () => {
    // The defect this fixes was already live on the pointer path. Fixing it
    // only for the keyboard would leave the mouse user with the old bug and
    // make the two paths differ in exactly the way `moveStep` exists to stop.
    const s = setup();
    httpMock = s.httpMock;
    withThreeSteps(s);
    s.cmp.selectStep(0);

    s.cmp.onStepDrop({ previousIndex: 0, currentIndex: 2 } as never);
    s.fixture.detectChanges();

    expect(s.cmp.selectedStepIndex()).toBe(2);
    expect(s.cmp.selectedStep()?.skillKey).toBe('a');
  });
});

describe('Rituals composer keyboard host contract', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('gives every step row a reorder index and a roving tab stop', () => {
    const s = setup();
    httpMock = s.httpMock;
    withThreeSteps(s);

    const rows = Array.from(s.el.querySelectorAll('li.step'));
    expect(rows).toHaveLength(3);
    rows.forEach((row, i) => {
      expect(row.getAttribute('data-reorder-index')).toBe(String(i));
      // Exactly one row is in the tab order; the arrows reach the rest.
      expect(row.getAttribute('tabindex')).toBe(i === 0 ? '0' : '-1');
    });
  });

  it('leaves DOM focus on the row the moved step now occupies', () => {
    // The directive's own spec proves this against a host that tracks by
    // identity. THIS host tracks by INDEX (`trackByIndex`), so the <li> nodes
    // are reused positionally and rebuilt with new content after a move. That
    // is a different rendering strategy, and focus-follow is a property of the
    // pair, not of the directive alone, so it is worth asserting again here
    // rather than assuming the directive's guarantee travels.
    const s = setup();
    httpMock = s.httpMock;
    withThreeSteps(s);

    const list = s.el.querySelector('ol.steps')!;
    list.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    );
    s.fixture.detectChanges();

    expect(keys(s)).toEqual(['b', 'a', 'c']);
    const focused = document.activeElement as HTMLElement | null;
    expect(focused?.getAttribute('data-reorder-index')).toBe('1');
  });

  it('names the step by its DISPLAY name in the announcement, not its key', () => {
    // `weakness_sight` is a machine key. It is what the raw list used to print
    // and what a screen reader would otherwise read out letter salad for.
    const s = setup();
    httpMock = s.httpMock;
    withThreeSteps(s);

    expect(s.cmp.stepRowLabel(0)).toBe('familiar_skill.a');
    expect(s.cmp.stepRowLabel(2)).toBe('familiar_skill.c');
  });

  it('renders the announcement in a live region the host owns', () => {
    const s = setup();
    httpMock = s.httpMock;
    withThreeSteps(s);

    const live = s.el.querySelector('[data-testid="steps-reorder-live"]');
    expect(live).toBeTruthy();
    expect(live?.getAttribute('aria-live')).toBe('polite');

    // ⚠ Drive the KEY, not the handler. Calling onStepReorder directly moves
    // the step but never touches the directive, so the announcement stays
    // empty: the first draft of this test asserted the live region from a
    // handler call and failed for exactly that reason. This is the only test
    // here that exercises the real path end to end, keydown to live region.
    const list = s.el.querySelector('ol.steps')!;
    list.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        altKey: true,
        bubbles: true,
      }),
    );
    s.fixture.detectChanges();

    expect(keys(s)).toEqual(['b', 'a', 'c']);
    // Translations are not loaded in the unit suite, so the pipe is a
    // passthrough and the KEY is what renders. Asserting the key is the honest
    // assertion here; the en.json copy is pinned by the directive's own spec.
    expect(live?.textContent).toContain('shared.reorderable_list.moved');
  });
});

/**
 * N8: the learner sees the price BEFORE they freeze it.
 *
 * Today the number renders only on an already-published ritual, so the one
 * moment it is decided is the one moment it is invisible.
 */
describe('Rituals composer price line (N8)', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  function setupWithClasses(rows: { key: string; policyClass?: string }[]) {
    TestBed.configureTestingModule({
      imports: [RoutinesTabComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), TranslateService],
    });
    const fixture = TestBed.createComponent(RoutinesTabComponent);
    fixture.componentRef.setInput('familiarId', FID);
    const mock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    mock
      .expectOne(`${base}/rituals`)
      .flush({ rituals: [ritual()], wiredSinks: ['chat'] });
    mock.expectOne(`${base}/skills`).flush(
      loadoutView(
        rows.map((r) =>
          grant({ skillKey: r.key, ...(r.policyClass === undefined ? {} : { policyClass: r.policyClass }) }),
        ),
      ),
    );
    fixture.detectChanges();
    const s = {
      fixture,
      cmp: fixture.componentInstance,
      httpMock: mock,
      el: fixture.nativeElement as HTMLElement,
    };
    s.cmp.selected.set(ritual());
    s.cmp.mode.set('compose');
    return s;
  }

  it('totals the draft from the mirrored constants as steps are added', () => {
    const s = setupWithClasses([
      { key: 'g', policyClass: 'generative' },
      { key: 's', policyClass: 'standard' },
    ]);
    httpMock = s.httpMock;

    s.cmp.addStepFromPalette(grant({ skillKey: 'g', policyClass: 'generative' }));
    s.fixture.detectChanges();
    expect(s.cmp.draftPrice()).toEqual({ kind: 'priced', units: 35 });

    s.cmp.addStepFromPalette(grant({ skillKey: 's', policyClass: 'standard' }));
    s.fixture.detectChanges();
    expect(s.cmp.draftPrice()).toEqual({ kind: 'priced', units: 35 });
  });

  it('renders the total where the learner is about to freeze it', () => {
    const s = setupWithClasses([{ key: 'g', policyClass: 'generative' }]);
    httpMock = s.httpMock;
    s.cmp.addStepFromPalette(grant({ skillKey: 'g', policyClass: 'generative' }));
    s.fixture.detectChanges();

    const line = s.el.querySelector('[data-testid="composer-price"]');
    expect(line).toBeTruthy();
    expect(line?.textContent).toContain('familiar_grimoire.routines.price');
  });

  it('says the price CANNOT be shown when a step has no policy class', () => {
    // The retired-but-owned Skill: the grant survives, the catalogue row does
    // not, and N2 deliberately left the field absent rather than fabricating a
    // zero. Rendering "20 mana" here would be a number the learner would be
    // charged more than.
    const s = setupWithClasses([{ key: 'ghost' }]);
    httpMock = s.httpMock;
    s.cmp.addStepFromPalette(grant({ skillKey: 'ghost' }));
    s.fixture.detectChanges();

    expect(s.cmp.draftPrice()).toEqual({ kind: 'unpriceable', skillKeys: ['ghost'] });
    const line = s.el.querySelector('[data-testid="composer-price"]');
    expect(line?.textContent).toContain('familiar_grimoire.routines.price_unknown');
    expect(line?.textContent).not.toContain('familiar_grimoire.routines.price ');
  });

  it('does NOT block publish on an unpriceable draft', () => {
    // The FE price is a MIRROR; the server holds the catalogue. A grant may
    // lack policyClass here while the server prices it perfectly well, so
    // refusing client-side would block a publish the server would accept. The
    // sink greying can refuse locally because there the server SERVES its own
    // wired list; here it does not. Loud about the unknown, not obstructive.
    const s = setupWithClasses([{ key: 'ghost' }]);
    httpMock = s.httpMock;
    s.cmp.addStepFromPalette(grant({ skillKey: 'ghost' }));
    s.fixture.detectChanges();

    expect(s.cmp.draftPrice().kind).toBe('unpriceable');
    expect(s.cmp.canPublish()).toBe(true);
  });
});

/**
 * S8 clause 5, frontend half (orchestrator assignment).
 *
 * A persisted step output is DATA, never markup. It is written by the run,
 * derived from model output, and replayed into the editor, so it is the one
 * string on this screen whose content nobody on the team authored. Angular
 * interpolation escapes it, which is why this already holds; these tests exist
 * because the way it stops holding is a one-word edit. Swapping `{{ x }}` for
 * `[innerHTML]="x"` renders identically for every benign value on the screen
 * during review, and every test that reads `textContent` keeps passing.
 *
 * subagent5 confirmed the domain half (defang, never drop) is done and tested.
 * These pin the rendering.
 */
describe('run story renders persisted output as text, never as markup', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  /** The classic payload: fires on load with no click and no script tag. */
  const HOSTILE = '<img src=x onerror="window.__pwned=1">';

  function withRun(s: ReturnType<typeof setup>, story: Record<string, unknown>) {
    s.cmp.selected.set(ritual({ currentRevision: 1 }));
    s.cmp.mode.set('compose');
    s.cmp.lastRun.set({
      runId: 'run-1',
      ritualId: 'r1',
      revisionNo: 1,
      status: 'completed',
      manaCharged: 20,
      startedAt: '2026-09-02T00:00:00Z',
      story,
    } as never);
    s.fixture.detectChanges();
  }

  it('renders a hostile step summary as visible text, injecting no element', () => {
    const s = setup();
    httpMock = s.httpMock;
    withRun(s, {
      title: 'Warm-up',
      status: 'completed',
      manaCost: 20,
      steps: [{ title: 'Socratic Drill', summary: HOSTILE }],
    });

    const result = s.el.querySelector('.run__result')!;
    // The payload is READ BACK as text, so the learner sees what was stored.
    expect(result.textContent).toContain(HOSTILE);
    // And no element was created from it. Querying for the tag is the
    // assertion that actually distinguishes interpolation from innerHTML:
    // textContent alone passes under BOTH, because innerHTML of an <img> with
    // no text still leaves the surrounding text intact.
    expect(result.querySelector('img')).toBeNull();
    expect((window as unknown as Record<string, unknown>)['__pwned']).toBeUndefined();
  });

  it('renders a hostile step TITLE as text too, not just the summary', () => {
    // The sibling-field trap: a guard that protects one field while its
    // neighbours render raw is the defect class this repo keeps rediscovering.
    const s = setup();
    httpMock = s.httpMock;
    withRun(s, {
      title: HOSTILE,
      status: 'completed',
      manaCost: 20,
      steps: [{ title: HOSTILE, summary: 'ordinary' }],
    });

    const result = s.el.querySelector('.run__result')!;
    expect(result.querySelectorAll('img')).toHaveLength(0);
    expect(result.textContent).toContain(HOSTILE);
  });

  it('renders hostile SOURCES as text once they are shown', () => {
    // `sources` is on the wire (`runStepStoryDTO.Sources`) and is the same
    // class of data as the summary: derived from a run, not authored here.
    const s = setup();
    httpMock = s.httpMock;
    withRun(s, {
      title: 'Warm-up',
      status: 'completed',
      manaCost: 20,
      steps: [{ title: 'Socratic Drill', summary: 'ordinary', sources: [HOSTILE] }],
    });

    const result = s.el.querySelector('.run__result')!;
    expect(result.querySelectorAll('img')).toHaveLength(0);
    expect(result.textContent).toContain(HOSTILE);
  });

  it('binds no template to innerHTML or a bypassed trust call', () => {
    // A static check, deliberately, because the DOM assertions above cannot
    // see a sink that this fixture's data never reaches. It reads the shipped
    // template, so it catches an unsafe binding added anywhere in the file,
    // including on a branch no test renders.
    // ⚠ Comments are STRIPPED first. The first version of this check failed on
    // the comment that explains the rule, which is the check working correctly
    // on the wrong input: what must be free of these sinks is the BINDINGS, and
    // a rule that punishes documenting itself gets the documentation deleted.
    const html = readFileSync(
      join(WEB_ROOT, 'src/app/features/surfaces/aplus/familiar-design/routines/routines-tab.component.html'),
      'utf8',
    ).replace(/<!--[\s\S]*?-->/g, '');
    expect(html).not.toContain('innerHTML');
    const ts = readFileSync(
      join(WEB_ROOT, 'src/app/features/surfaces/aplus/familiar-design/routines/routines-tab.component.ts'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(ts).not.toContain('bypassSecurityTrust');
  });
});

/**
 * Step cards (spec b.4) and the dark rows.
 *
 * ⚠⚠ WHAT SHIPS DARK, AND WHY IT IS TWO ROWS RATHER THAN ONE.
 *
 * The plan lists receives, gives, tools and cost. Only COST has data.
 *
 * - TOOLS is dark because per-step narrowing is ADVISORY: the StreamChat
 *   request carries no allowlist field, so v1 forwards the narrowed set inside
 *   the step instruction and the engine may still see the wider union
 *   (`ritual_step_turn_engine.go:14-22`). ADR-257 section 5 makes N4 the gate.
 *   Rendering it as a guarantee asserts a containment the runtime lacks.
 * - RECEIVES and GIVES are dark for a second, stronger reason: there is no
 *   data at all. `Consumes`/`Produces` exist on `CatalogEntry` but are absent
 *   from `listCatalogueSQL` (`companion_loadout.go:26-30`), absent from the
 *   grant wire, and migration 0117 authored NO values, defaulting every row to
 *   'none'. Its own header says authoring them now "would turn a reservation
 *   into a claim about behaviour that does not exist". A live ports row would
 *   read "none to none" on all 27 Skills, which is not a partial build, it is
 *   a fabricated one.
 *
 * So the card ships the cost it can prove and ONE honest note for the rest.
 * The note is per-LIST rather than per-card: repeating an identical disclaimer
 * on up to eight cards is noise that teaches the reader to skip it.
 */
describe('step cards show the cost they can prove', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  function composerWith(rows: { key: string; policyClass?: string }[]) {
    TestBed.configureTestingModule({
      imports: [RoutinesTabComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), TranslateService],
    });
    const fixture = TestBed.createComponent(RoutinesTabComponent);
    fixture.componentRef.setInput('familiarId', FID);
    const mock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    mock.expectOne(`${base}/rituals`).flush({ rituals: [ritual()], wiredSinks: ['chat'] });
    mock.expectOne(`${base}/skills`).flush(
      loadoutView(
        rows.map((r) =>
          grant({
            skillKey: r.key,
            ...(r.policyClass === undefined ? {} : { policyClass: r.policyClass }),
          }),
        ),
      ),
    );
    fixture.detectChanges();
    const s = {
      fixture,
      cmp: fixture.componentInstance,
      httpMock: mock,
      el: fixture.nativeElement as HTMLElement,
    };
    s.cmp.selected.set(ritual());
    s.cmp.mode.set('compose');
    for (const r of rows) {
      s.cmp.addStepFromPalette(
        grant({
          skillKey: r.key,
          ...(r.policyClass === undefined ? {} : { policyClass: r.policyClass }),
        }),
      );
    }
    s.fixture.detectChanges();
    return s;
  }

  it('reports an uplift, an included step and an unknown one distinctly', () => {
    const s = composerWith([
      { key: 'gen', policyClass: 'generative' },
      { key: 'std', policyClass: 'standard' },
      { key: 'ghost' },
    ]);
    httpMock = s.httpMock;

    expect(s.cmp.stepCost(0)).toEqual({ kind: 'uplift', units: 15 });
    expect(s.cmp.stepCost(1)).toEqual({ kind: 'included' });
    expect(s.cmp.stepCost(2)).toEqual({ kind: 'unknown' });
  });

  it('renders the per-step cost on each card', () => {
    const s = composerWith([{ key: 'gen', policyClass: 'generative' }]);
    httpMock = s.httpMock;

    const cost = s.el.querySelector('[data-testid="step-cost-0"]');
    expect(cost?.textContent).toContain('familiar_grimoire.routines.step_cost');
  });

  it('never renders an unknown step cost as free', () => {
    // The same understatement the routine total refuses, one level down.
    const s = composerWith([{ key: 'ghost' }]);
    httpMock = s.httpMock;

    const cost = s.el.querySelector('[data-testid="step-cost-0"]');
    expect(cost?.textContent).toContain('familiar_grimoire.routines.step_cost_unknown');
    expect(cost?.textContent).not.toContain('familiar_grimoire.routines.step_cost_included');
  });

  it('shows ONE dark note for chaining, ports and tools, not one per card', () => {
    const s = composerWith([
      { key: 'a', policyClass: 'standard' },
      { key: 'b', policyClass: 'standard' },
      { key: 'c', policyClass: 'standard' },
    ]);
    httpMock = s.httpMock;

    const notes = s.el.querySelectorAll('[data-testid="steps-dark-note"]');
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain('familiar_grimoire.routines.chaining_dark');
  });

  it('renders NO ports or tools row, because neither has data to render', () => {
    // Asserting the ABSENCE deliberately. The failure mode this guards is a
    // later well-meaning edit that wires the row to consumes/produces and
    // ships "none to none" on every Skill, which looks like a feature and is
    // a fabrication.
    const s = composerWith([{ key: 'a', policyClass: 'standard' }]);
    httpMock = s.httpMock;

    expect(s.el.querySelector('[data-testid="step-ports-0"]')).toBeNull();
    expect(s.el.querySelector('[data-testid="step-tools-0"]')).toBeNull();
  });
});

/**
 * Replay: opening an old run's story from the history list.
 *
 * The list showed a status and a mana figure and nothing else, so the "what I
 * did and why" of any run but the latest was unreachable. Each row is now a
 * button that fetches THAT run.
 */
describe('run history replays one run', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  function withHistory(s: ReturnType<typeof setup>) {
    s.cmp.selected.set(ritual({ currentRevision: 1 }));
    s.cmp.mode.set('compose');
    s.cmp.runs.set([
      { runId: 'run-old', ritualId: 'r1', revisionNo: 1, status: 'completed', manaCharged: 20, startedAt: '2026-09-01T00:00:00Z' },
    ] as never);
    s.fixture.detectChanges();
  }

  it('makes each history row a real button, not a decorative row', () => {
    const s = setup();
    httpMock = s.httpMock;
    withHistory(s);

    const row = s.el.querySelector('[data-testid="run-history-open-run-old"]');
    expect(row).toBeTruthy();
    expect(row!.tagName).toBe('BUTTON');
  });

  it('fetches THAT run and shows its story', () => {
    const s = setup();
    httpMock = s.httpMock;
    withHistory(s);

    const row = s.el.querySelector<HTMLButtonElement>(
      '[data-testid="run-history-open-run-old"]',
    )!;
    row.click();

    httpMock.expectOne(`${base}/rituals/r1/runs/run-old`).flush({
      runId: 'run-old',
      ritualId: 'r1',
      revisionNo: 1,
      status: 'completed',
      manaCharged: 20,
      startedAt: '2026-09-01T00:00:00Z',
      story: {
        title: 'An older warm-up',
        status: 'completed',
        manaCost: 20,
        steps: [{ title: 'Socratic Drill', summary: 'three questions' }],
      },
    });
    s.fixture.detectChanges();

    const result = s.el.querySelector('.run__result')!;
    expect(result.textContent).toContain('An older warm-up');
    expect(result.textContent).toContain('three questions');
  });

  it('is LOUD when the replay fails, never a row that silently does nothing', () => {
    // A button that appears to do nothing is the same defect as a silent
    // keyboard no-op, one layer up: the learner cannot tell a broken control
    // from an empty result.
    const s = setup();
    httpMock = s.httpMock;
    withHistory(s);

    s.el
      .querySelector<HTMLButtonElement>('[data-testid="run-history-open-run-old"]')!
      .click();
    httpMock
      .expectOne(`${base}/rituals/r1/runs/run-old`)
      .flush({ code: 'RITUAL_RUN_READ_FAILED' }, { status: 500, statusText: 'Server Error' });
    s.fixture.detectChanges();

    expect(s.cmp.replayError()).toBe(true);
    const err = s.el.querySelector('[data-testid="run-replay-error"]');
    expect(err?.textContent).toContain('familiar_grimoire.routines.replay_failed');
  });
});
