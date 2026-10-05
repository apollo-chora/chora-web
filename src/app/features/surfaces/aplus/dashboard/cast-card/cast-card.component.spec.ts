import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NEVER, of, throwError } from 'rxjs';

import { CastCardComponent } from './cast-card.component';
import { FamiliarGrowthService } from '../../../../../core/familiar/familiar-growth.service';
import { GoalService } from '../goal/goal.service';
import { DashboardService } from '../dashboard.service';
import type { FamiliarSummary } from '../../../../../core/familiar/familiar-growth.model';
import type { GoalDTO } from '../goal/goal.model';

/**
 * CastCardComponent spec — the A+ dashboard "Your Cast" wrapper.
 *
 * Reads the AUTHORITATIVE Familiar roster from FamiliarGrowthService
 * (`GET /api/v1/me/familiars`) — the same source the (now-removed) header
 * mascot used — so each member renders its REAL breed art (owl/fox/…) at its
 * real growth stage. Tapping a Familiar's portrait routes to its profile
 * (`/a/companion/{id}`) at ANY stage. A hatched Familiar NOT yet bound to a
 * goal also shows a secondary "summon to a goal" trigger (opens the
 * SummonWizard); a bound Familiar (its portrait already summoned) shows none.
 *
 * i18n test contract: the translate pipe emits RAW keys in dev/test, so we
 * assert on data-testid + routerLink hrefs, never translated copy.
 */

// ── Factories ───────────────────────────────────────────────────────────────
function fam(over: Partial<FamiliarSummary> = {}): FamiliarSummary {
  return {
    familiarId: 'f1',
    displayName: 'Sage',
    species: 'owl',
    growthStage: 3,
    shinyVariant: false,
    expCurrent: 0,
    expNextThreshold: 100,
    isActive: false,
    ...over,
  };
}

function goal(over: Partial<GoalDTO> = {}): GoalDTO {
  return {
    goalId: 'g1',
    kind: 'curiosity',
    conceptSet: [],
    status: 'active',
    northStarNote: 'Fractions',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...over,
  };
}

// A FamiliarGrowthService fake — the card only calls `listMyFamiliars()`.
function makeGrowth(
  roster: readonly FamiliarSummary[] = [],
  mode: 'ok' | 'loading' | 'error' = 'ok',
) {
  return {
    listMyFamiliars: vi.fn(() =>
      mode === 'loading'
        ? NEVER
        : mode === 'error'
          ? throwError(() => ({ status: 500 }))
          : of(roster),
    ),
  };
}
type GrowthMock = ReturnType<typeof makeGrowth>;

// A GoalService fake — the card reads `goals` (bound-state) and the wizard
// calls `update`/`load`.
function makeGoals(goals: readonly GoalDTO[] = []) {
  return {
    goals: signal<readonly GoalDTO[]>(goals),
    update: vi.fn((_id: string, _patch: unknown) => of(goal())),
    load: vi.fn(),
  };
}
type GoalsMock = ReturnType<typeof makeGoals>;

function build(growth: GrowthMock, goals: GoalsMock): ComponentFixture<CastCardComponent> {
  TestBed.configureTestingModule({
    imports: [CastCardComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: FamiliarGrowthService, useValue: growth },
      { provide: GoalService, useValue: goals },
      // The embedded SummonWizard injects DashboardService for conflict-name copy.
      { provide: DashboardService, useValue: { summary: signal(null) } },
    ],
  });
  const fixture = TestBed.createComponent(CastCardComponent);
  fixture.detectChanges();
  return fixture;
}

function testid(fixture: ComponentFixture<CastCardComponent>, id: string): HTMLElement | null {
  return fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
}

/** Force the viewport's scroll metrics (jsdom returns 0 for all of them). */
function setScrollMetrics(
  el: HTMLElement,
  metrics: { scrollLeft: number; clientWidth: number; scrollWidth: number },
): void {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => metrics.scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => metrics.clientWidth });
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    writable: true,
    value: metrics.scrollLeft,
  });
}

describe('CastCardComponent', () => {
  let growth: GrowthMock;
  let goals: GoalsMock;

  beforeEach(() => {
    TestBed.resetTestingModule();
    growth = makeGrowth([fam()]);
    goals = makeGoals([]);
  });

  it('renders the cast card', () => {
    const fixture = build(growth, goals);
    expect(testid(fixture, 'aplus-dashboard-cast')).toBeTruthy();
  });

  it('renders one member with real breed art per roster Familiar', () => {
    growth = makeGrowth([
      fam({ familiarId: 'a', displayName: 'Ember', species: 'owl' }),
      fam({ familiarId: 'b', displayName: 'Vesper', species: 'fox' }),
    ]);
    const fixture = build(growth, goals);
    expect(testid(fixture, 'aplus-cast-familiar-a')).toBeTruthy();
    expect(testid(fixture, 'aplus-cast-familiar-b')).toBeTruthy();
    // Real breed art comes from the shared BreedArt component.
    expect(fixture.nativeElement.querySelectorAll('[data-testid="breed-art"]').length).toBe(2);
  });

  it('routes each member portrait to the Familiar profile (a link, at any stage)', () => {
    growth = makeGrowth([
      fam({ familiarId: 'ember', species: 'owl', growthStage: 2 }),
      fam({ familiarId: 'egg1', species: 'fox', growthStage: 0 }),
    ]);
    const fixture = build(growth, goals);
    const hatched = testid(fixture, 'aplus-cast-familiar-ember') as HTMLAnchorElement;
    const egg = testid(fixture, 'aplus-cast-familiar-egg1') as HTMLAnchorElement;
    expect(hatched.tagName).toBe('A');
    expect(hatched.getAttribute('href')).toBe('/a/companion/ember');
    // An egg (stage 0) ALSO opens the profile — no special-casing.
    expect(egg.tagName).toBe('A');
    expect(egg.getAttribute('href')).toBe('/a/companion/egg1');
  });

  it('shows a summon trigger for a hatched Familiar NOT bound to any goal', () => {
    growth = makeGrowth([fam({ familiarId: 'free', growthStage: 2 })]);
    goals = makeGoals([goal({ goalId: 'g1', attachedFamiliarId: undefined })]);
    const fixture = build(growth, goals);
    expect(testid(fixture, 'aplus-cast-summon-free')).toBeTruthy();
  });

  it('hides the summon trigger for a Familiar already bound to a goal (Ember)', () => {
    growth = makeGrowth([fam({ familiarId: 'ember', species: 'owl', growthStage: 2 })]);
    goals = makeGoals([goal({ goalId: 'g1', attachedFamiliarId: 'ember' })]);
    const fixture = build(growth, goals);
    // Portrait link still present…
    expect(testid(fixture, 'aplus-cast-familiar-ember')).toBeTruthy();
    // …but no summon trigger (it is already summoned).
    expect(testid(fixture, 'aplus-cast-summon-ember')).toBeFalsy();
  });

  it('hides the summon trigger for an egg (stage 0) even when unbound', () => {
    growth = makeGrowth([fam({ familiarId: 'e1', growthStage: 0 })]);
    goals = makeGoals([]);
    const fixture = build(growth, goals);
    expect(testid(fixture, 'aplus-cast-familiar-e1')).toBeTruthy();
    expect(testid(fixture, 'aplus-cast-summon-e1')).toBeFalsy();
  });

  it('opens the SummonWizard when the summon trigger is tapped', () => {
    growth = makeGrowth([fam({ familiarId: 'free', growthStage: 2 })]);
    goals = makeGoals([goal()]);
    const fixture = build(growth, goals);
    expect(testid(fixture, 'aplus-cast-summon-wizard')).toBeFalsy();
    (testid(fixture, 'aplus-cast-summon-free') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(testid(fixture, 'aplus-cast-summon-wizard')).toBeTruthy();
  });

  it('clears the summon target when the wizard closes or reports a summon', () => {
    growth = makeGrowth([fam({ familiarId: 'free', growthStage: 2 })]);
    goals = makeGoals([goal()]);
    const fixture = build(growth, goals);
    (testid(fixture, 'aplus-cast-summon-free') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.summonTarget()).not.toBeNull();

    fixture.componentInstance.closeSummon();
    fixture.detectChanges();
    expect(fixture.componentInstance.summonTarget()).toBeNull();
    expect(testid(fixture, 'aplus-cast-summon-wizard')).toBeFalsy();

    (testid(fixture, 'aplus-cast-summon-free') as HTMLButtonElement).click();
    fixture.detectChanges();
    fixture.componentInstance.onSummoned();
    expect(fixture.componentInstance.summonTarget()).toBeNull();
  });

  it('pins a hatch-new egg at the row end routing to the marketplace (even when empty)', () => {
    growth = makeGrowth([]);
    const fixture = build(growth, goals);
    const hatch = testid(fixture, 'aplus-cast-hatch');
    expect(hatch).toBeTruthy();
    expect(hatch?.getAttribute('href')).toBe('/a/companion/marketplace');
  });

  it('shows only the pinned hatch egg when the roster is empty (no members)', () => {
    growth = makeGrowth([]);
    const fixture = build(growth, goals);
    expect(testid(fixture, 'aplus-cast-hatch')).toBeTruthy();
    expect(
      fixture.nativeElement.querySelectorAll('[data-testid^="aplus-cast-familiar-"]').length,
    ).toBe(0);
  });

  it('shows a loading state while the roster is in flight', () => {
    growth = makeGrowth([], 'loading');
    const fixture = build(growth, goals);
    expect(testid(fixture, 'aplus-cast-loading')).toBeTruthy();
  });

  it('fails loud on a roster fetch error and retries', () => {
    growth = makeGrowth([], 'error');
    const fixture = build(growth, goals);
    expect(testid(fixture, 'aplus-cast-error')).toBeTruthy();
    // Retry re-invokes the fetch (fail-loud, idempotent).
    growth.listMyFamiliars.mockReturnValueOnce(of([fam({ familiarId: 'z' })]));
    (testid(fixture, 'aplus-cast-retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(testid(fixture, 'aplus-cast-familiar-z')).toBeTruthy();
  });

  it('coerces an unknown roster breed to the generic art and clamps the stage', () => {
    const c = build(growth, goals).componentInstance;
    expect(c.breedSpecies(fam({ species: 'owl' }))).toBe('owl');
    expect(c.breedSpecies(fam({ species: 'robot' as never }))).toBe('');
    expect(c.breedSpecies(fam({ species: '' }))).toBe('');
    expect(c.breedStage(fam({ growthStage: 0 }))).toBe(0);
    expect(c.breedStage(fam({ growthStage: 4 }))).toBe(4);
    expect(c.breedStage(fam({ growthStage: 99 as never }))).toBe(6);
    expect(c.breedStage(fam({ growthStage: -3 as never }))).toBe(0);
  });

  it('hides the scroll arrows when there is no overflow', () => {
    const fixture = build(growth, goals);
    expect(testid(fixture, 'aplus-cast-arrow-left')).toBeFalsy();
    expect(testid(fixture, 'aplus-cast-arrow-right')).toBeFalsy();
    expect(fixture.componentInstance.hasOverflow()).toBe(false);
  });

  it('shows arrows on overflow and disables them at the ends', () => {
    growth = makeGrowth([fam({ familiarId: 'a' }), fam({ familiarId: 'b' })]);
    const fixture = build(growth, goals);
    const viewport = testid(fixture, 'aplus-cast-viewport') as HTMLElement;

    setScrollMetrics(viewport, { scrollLeft: 0, clientWidth: 300, scrollWidth: 900 });
    fixture.componentInstance.recomputeScroll();
    fixture.detectChanges();
    expect(fixture.componentInstance.hasOverflow()).toBe(true);
    expect((testid(fixture, 'aplus-cast-arrow-left') as HTMLButtonElement).disabled).toBe(true);
    expect((testid(fixture, 'aplus-cast-arrow-right') as HTMLButtonElement).disabled).toBe(false);

    setScrollMetrics(viewport, { scrollLeft: 600, clientWidth: 300, scrollWidth: 900 });
    fixture.componentInstance.recomputeScroll();
    fixture.detectChanges();
    expect((testid(fixture, 'aplus-cast-arrow-left') as HTMLButtonElement).disabled).toBe(false);
    expect((testid(fixture, 'aplus-cast-arrow-right') as HTMLButtonElement).disabled).toBe(true);
  });

  it('scrolls the viewport when an arrow is clicked', () => {
    growth = makeGrowth([fam({ familiarId: 'a' }), fam({ familiarId: 'b' })]);
    const fixture = build(growth, goals);
    const viewport = testid(fixture, 'aplus-cast-viewport') as HTMLElement;
    setScrollMetrics(viewport, { scrollLeft: 0, clientWidth: 300, scrollWidth: 900 });
    const scrollBy = vi.fn();
    (viewport as unknown as { scrollBy: unknown }).scrollBy = scrollBy;
    fixture.componentInstance.recomputeScroll();
    fixture.detectChanges();
    (testid(fixture, 'aplus-cast-arrow-right') as HTMLButtonElement).click();
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect((scrollBy.mock.calls[0][0] as { left: number }).left).toBeGreaterThan(0);
  });

  /**
   * Pod vocabulary on the cast strip (sibling of the incubation-card leak).
   *
   * A pre-hatch roster entry arrives with `name` set to the server-side NOT NULL
   * placeholder ("Egg") and an EMPTY species (the breed is a mystery until the
   * awakening). Rendering either raw put the word "Egg" on the dashboard of a
   * product whose entire Stage-0 vocabulary is Pod. Both are fixed structurally:
   * the name is suppressed pre-hatch, and the stage label reads Pod at Stage 0
   * whether or not a species has been revealed.
   *
   * i18n contract: the translate pipe emits RAW keys in dev/test, so the name
   * assertion is on the untitled-Pod KEY, never its English copy.
   */
  it('never renders the server placeholder name for a pre-hatch pod', () => {
    growth = makeGrowth([
      fam({ familiarId: 'pod1', displayName: 'Egg', species: '', growthStage: 0 }),
    ]);
    const fixture = build(growth, goals);
    const name = fixture.nativeElement.querySelector('.cast__member-name');
    expect(name?.textContent?.trim()).toBe('aplus.dashboard.cast.untitled_pod');
  });

  it('labels a pre-hatch member "Pod" even though its species is unrevealed', () => {
    growth = makeGrowth([
      fam({ familiarId: 'pod1', displayName: 'Egg', species: '', growthStage: 0 }),
    ]);
    const fixture = build(growth, goals);
    const stage = fixture.nativeElement.querySelector('.cast__member-stage');
    expect(stage?.textContent?.trim()).toBe('Pod');
    expect(fixture.nativeElement.textContent).not.toContain('Egg');
  });

  it('still shows a hatched member its own name and breed-flavoured stage', () => {
    growth = makeGrowth([
      fam({ familiarId: 'a', displayName: 'Ember', species: 'owl', growthStage: 3 }),
    ]);
    const fixture = build(growth, goals);
    expect(
      fixture.nativeElement.querySelector('.cast__member-name')?.textContent?.trim(),
    ).toBe('Ember');
    expect(
      fixture.nativeElement.querySelector('.cast__member-stage')?.textContent?.trim(),
    ).toBe('Awakened Owl');
  });

  it('has no critical/serious accessibility violations (roster + summon + overflow)', async () => {
    growth = makeGrowth([
      fam({ familiarId: 'a', growthStage: 2 }),
      fam({ familiarId: 'b', growthStage: 2 }),
    ]);
    goals = makeGoals([]); // both unbound ⇒ both show summon triggers
    const fixture = build(growth, goals);
    const viewport = testid(fixture, 'aplus-cast-viewport') as HTMLElement;
    setScrollMetrics(viewport, { scrollLeft: 0, clientWidth: 300, scrollWidth: 900 });
    fixture.componentInstance.recomputeScroll();
    fixture.detectChanges();
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
