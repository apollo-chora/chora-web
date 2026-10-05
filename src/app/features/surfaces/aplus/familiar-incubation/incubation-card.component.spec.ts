import { beforeEach, describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { IncubationCardComponent } from './incubation-card.component';
import { HATCH_EXP_THRESHOLD } from './incubation-card.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import { GoalService } from '../dashboard/goal/goal.service';
import type { FamiliarGrowthState, FamiliarSummary } from '../../../../core/familiar/familiar-growth.model';
import type { GoalDTO } from '../dashboard/goal/goal.model';

const FAMILIAR_ID = '00000000-0000-7000-8000-00000000e990';

function eggState(overrides: Partial<FamiliarGrowthState> = {}): FamiliarGrowthState {
  return {
    familiarId: FAMILIAR_ID,
    growthStage: 0,
    stageName: 'egg',
    species: '',
    shinyVariant: false,
    rarity: '',
    expCurrent: 10,
    expNextThreshold: 0,
    expCumulative: 10,
    effectiveLlmTier: 'flash-lite',
    effectiveMaxOutputTokens: 512,
    unlockedTools: [],
    resonantAtomId: '',
    ahaMomentConsumed: false,
    ahaMomentActiveUntil: null,
    hatchedAt: null,
    lastStageUpAt: null,
    displayName: '',
    ...overrides,
  };
}

function rosterItem(overrides: Partial<FamiliarSummary> = {}): FamiliarSummary {
  return {
    familiarId: 'sibling-1',
    displayName: 'Ember',
    species: 'owl',
    growthStage: 3,
    shinyVariant: false,
    expCurrent: 40,
    expNextThreshold: 200,
    isActive: true,
    ...overrides,
  };
}

interface SetupOpts {
  readonly growth?: FamiliarGrowthState;
  readonly growthError?: boolean;
  readonly roster?: readonly FamiliarSummary[];
  readonly goals?: readonly GoalDTO[];
}

function goal(overrides: Partial<GoalDTO> = {}): GoalDTO {
  return {
    goalId: 'goal-1',
    kind: 'cert',
    conceptSet: [],
    status: 'active',
    northStarNote: 'Pass PSLE Science',
    attachedFamiliarId: FAMILIAR_ID,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function setup(opts: SetupOpts = {}) {
  const growthStub = {
    getGrowth: () =>
      opts.growthError
        ? throwError(() => ({ status: 500 }))
        : of(opts.growth ?? eggState()),
    listMyFamiliars: () => of(opts.roster ?? []),
  } as unknown as FamiliarGrowthService;

  const goalsSignal = signal<readonly GoalDTO[]>(opts.goals ?? []);
  const goalStub = {
    load: () => undefined,
    goals: goalsSignal.asReadonly(),
  } as unknown as GoalService;

  TestBed.configureTestingModule({
    imports: [IncubationCardComponent],
    providers: [
      provideRouter([]),
      TranslateService,
      { provide: FamiliarGrowthService, useValue: growthStub },
      { provide: GoalService, useValue: goalStub },
    ],
  });
  const fixture = TestBed.createComponent(IncubationCardComponent);
  fixture.componentRef.setInput('familiarId', FAMILIAR_ID);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('IncubationCardComponent (F-I2 incubation card)', () => {
  let fixture: ComponentFixture<IncubationCardComponent>;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the incubation card for a stage-0 egg', () => {
    ({ fixture, el } = setup({ growth: eggState() }));
    expect(fixture.componentInstance).toBeTruthy();
    expect(el.querySelector('[data-testid="aplus-incubation-card"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="incubation-egg-art"]')).not.toBeNull();
  });

  it('renders nothing for an already-hatched familiar (stage >= 1)', () => {
    ({ fixture, el } = setup({ growth: eggState({ growthStage: 2, species: 'owl', hatchedAt: '2026-07-02T00:00:00Z' }) }));
    expect(el.querySelector('[data-testid="aplus-incubation-card"]')).toBeNull();
  });

  it('warming bar shows exp / hatch threshold and the derived percentage', () => {
    ({ fixture, el } = setup({ growth: eggState({ expCurrent: 10 }) }));
    const bar = el.querySelector('[data-testid="incubation-warmth-bar"]');
    expect(bar).not.toBeNull();
    // 10 / 25 = 40%
    expect(bar?.getAttribute('aria-valuenow')).toBe('40');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
    const value = el.querySelector('[data-testid="incubation-warmth-value"]');
    expect(value?.textContent ?? '').toMatch(new RegExp(`10\\s*/\\s*${HATCH_EXP_THRESHOLD}`));
  });

  it('prefers the wire hatch threshold over the mirrored domain default', () => {
    // Since CHO-2089's BE read enrichment the Stage-0 growth read surfaces the
    // real gate as `expNextThreshold`; the mirrored HATCH_EXP_THRESHOLD is only
    // the fallback for absent/zero values (older cached reads).
    ({ fixture, el } = setup({ growth: eggState({ expCurrent: 10, expNextThreshold: 40 }) }));
    const value = el.querySelector('[data-testid="incubation-warmth-value"]');
    expect(value?.textContent ?? '').toMatch(/10\s*\/\s*40/);
    // 10 / 40 = 25%, and below the wire gate ⇒ not stirring.
    expect(
      el.querySelector('[data-testid="incubation-warmth-bar"]')?.getAttribute('aria-valuenow'),
    ).toBe('25');
    expect(el.querySelector('[data-testid="incubation-hatch-cta"]')).toBeNull();
  });

  it('caps the warming bar at 100% and marks the egg as stirring when threshold reached', () => {
    ({ fixture, el } = setup({ growth: eggState({ expCurrent: 30 }) }));
    const bar = el.querySelector('[data-testid="incubation-warmth-bar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('100');
    // Stirring → the hatch CTA is presented, the "keep warming" hint is not.
    const cta = el.querySelector('[data-testid="incubation-hatch-cta"]');
    expect(cta).not.toBeNull();
    expect(cta?.getAttribute('href')).toBe(`/a/companion/hatching/${FAMILIAR_ID}`);
    expect(el.querySelector('[data-testid="incubation-warming-hint"]')).toBeNull();
  });

  it('shows the keep-warming hint (no hatch CTA) while below threshold', () => {
    ({ fixture, el } = setup({ growth: eggState({ expCurrent: 10 }) }));
    expect(el.querySelector('[data-testid="incubation-warming-hint"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="incubation-hatch-cta"]')).toBeNull();
  });

  it('shows the species as a mystery on the first egg (no revealed siblings)', () => {
    ({ fixture, el } = setup({ growth: eggState(), roster: [] }));
    const mystery = el.querySelector('[data-testid="incubation-species-mystery"]');
    expect(mystery).not.toBeNull();
    expect(mystery?.textContent ?? '').toContain('???');
  });

  it('keeps the species a mystery even when a sibling has a revealed species — the breed is shown ONLY when the companion hatches', () => {
    ({ fixture, el } = setup({
      growth: eggState({ familiarId: FAMILIAR_ID }),
      roster: [rosterItem({ familiarId: 'sibling-1', species: 'owl', growthStage: 3 })],
    }));
    const mystery = el.querySelector('[data-testid="incubation-species-mystery"]');
    expect(mystery).not.toBeNull();
    // The committed species (owl) must NOT be revealed while the egg is unhatched.
    expect((mystery?.textContent ?? '').toLowerCase()).not.toContain('owl');
    expect(mystery?.textContent ?? '').toContain('???');
  });

  it('renders the bound-goal name from the goal attached to this familiar', () => {
    ({ fixture, el } = setup({
      growth: eggState(),
      goals: [goal({ northStarNote: 'Pass PSLE Science', attachedFamiliarId: FAMILIAR_ID })],
    }));
    const boundGoal = el.querySelector('[data-testid="incubation-bound-goal"]');
    expect(boundGoal?.textContent ?? '').toContain('Pass PSLE Science');
  });

  it('omits the bound-goal label when no goal is attached to this familiar', () => {
    ({ fixture, el } = setup({
      growth: eggState(),
      goals: [goal({ attachedFamiliarId: 'someone-else' })],
    }));
    expect(el.querySelector('[data-testid="incubation-bound-goal"]')).toBeNull();
  });

  it('fails loud when the growth read errors', () => {
    ({ fixture, el } = setup({ growthError: true }));
    expect(el.querySelector('[data-testid="incubation-error"]')).not.toBeNull();
  });

  /**
   * The name line. chora-consumption seeds `name` with a placeholder on a
   * pre-hatch row purely to satisfy its NOT NULL constraint, and says so at the
   * call site: "UI computes the breed-aware nickname at display time". The
   * learner's own name only arrives with the hatch POST - the same call that
   * moves the Familiar off Stage 0 - so the card must never render the stored
   * name while the pod is unhatched.
   *
   * The original fixture used `displayName: ''`, which no live pre-hatch read
   * ever returns: the hand-filled value is exactly why this shipped. These
   * fixtures carry the wire-realistic placeholder instead.
   *
   * i18n contract: the translate pipe emits RAW keys in dev/test, so the
   * assertion is "the untitled-Pod KEY was rendered", not its English copy.
   * The copy itself is guarded by pod-vocabulary.i18n.spec.ts.
   */
  const UNTITLED_KEY = 'aplus.incubation.untitled_egg';

  it('never renders the server placeholder name on a pre-hatch pod', () => {
    ({ fixture, el } = setup({ growth: eggState({ displayName: 'Egg' }) }));
    const title = el.querySelector('.incubation-card__title');
    expect(title).not.toBeNull();
    expect(title?.textContent?.trim()).toBe(UNTITLED_KEY);
  });

  it('suppresses ANY stored name pre-hatch, not just the literal placeholder', () => {
    // Structural, not a match on "Egg": a backend that changes its placeholder
    // tomorrow must not leak a new one through this heading.
    ({ fixture, el } = setup({ growth: eggState({ displayName: 'unnamed-familiar' }) }));
    const title = el.querySelector('.incubation-card__title');
    expect(title?.textContent?.trim()).toBe(UNTITLED_KEY);
  });

  it('renders every learner-visible string through the translate pipe', () => {
    // No raw wire text may reach the card: every text node is either an i18n
    // key or interpolated numbers/goal names the learner supplied.
    ({ fixture, el } = setup({ growth: eggState({ displayName: 'Egg' }) }));
    const card = el.querySelector('[data-testid="aplus-incubation-card"]');
    expect(card?.textContent ?? '').not.toContain('Egg');
  });

  /**
   * The three real lifecycle states, transcribed from the reported familiar
   * 6a57dc45-2187-43c3-87db-eb775e0e7a92 and its siblings, so the guard is
   * pinned against ACTUAL rows rather than an invented shape.
   *
   * Note `species` arrives as undefined here, not '': the column is NULL on an
   * unrevealed pod and the BFF maps `growthState.currentBreed` straight
   * through. The card must not care - the breed is a mystery pre-hatch.
   */
  describe('lifecycle states (live DB rows)', () => {
    /** State 1: unrevealed pod. name="Egg", species NULL, stage 0, both timestamps NULL. */
    it('unrevealed pod: shows the untitled-Pod string, not the placeholder', () => {
      ({ fixture, el } = setup({
        growth: eggState({
          displayName: 'Egg',
          species: undefined as unknown as FamiliarGrowthState['species'],
          growthStage: 0,
          hatchedAt: null,
          revealedAt: null,
          expCurrent: 0,
        }),
      }));
      expect(el.querySelector('[data-testid="aplus-incubation-card"]')).not.toBeNull();
      expect(el.querySelector('.incubation-card__title')?.textContent?.trim()).toBe(
        UNTITLED_KEY,
      );
      // The warmth line the owner saw: "0 / 25" from the mirrored default.
      expect(
        el.querySelector('[data-testid="incubation-warmth-value"]')?.textContent ?? '',
      ).toMatch(/0\s*\/\s*25/);
    });

    /** State 2: revealed but NOT yet named. The name still arrives only at hatch. */
    it('revealed but unnamed pod: still shows the untitled-Pod string', () => {
      ({ fixture, el } = setup({
        growth: eggState({
          displayName: 'Egg',
          species: 'penguin',
          growthStage: 0,
          hatchedAt: null,
          revealedAt: '2026-08-06T10:00:00Z',
        }),
      }));
      expect(el.querySelector('.incubation-card__title')?.textContent?.trim()).toBe(
        UNTITLED_KEY,
      );
    });

    /**
     * State 3: hatched, carrying a genuine learner-chosen name ("Pingu").
     * The card must stand down entirely - the growth hero owns this state, and
     * the guard must never be able to eat a real name.
     */
    it('hatched familiar: the card stands down so the real name is never suppressed', () => {
      ({ fixture, el } = setup({
        growth: eggState({
          displayName: 'Pingu',
          species: 'penguin',
          growthStage: 1,
          hatchedAt: '2026-08-06T10:05:00Z',
          revealedAt: '2026-08-06T10:00:00Z',
        }),
      }));
      expect(el.querySelector('[data-testid="aplus-incubation-card"]')).toBeNull();
    });
  });
});
