import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { FamiliarHatchingComponent } from './familiar-hatching.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { FamiliarGrowthService } from '../../../../core/familiar/familiar-growth.service';
import type {
  FamiliarGrowthState,
  GrowthStage,
  HatchEggResponse,
  LoadoutView,
  RevealBreedResponse,
} from '../../../../core/familiar/familiar-growth.model';

/**
 * CHO-2229 contract (ADR-228 Phase 2 — the reveal precedes naming):
 *
 *   crack (POST /reveal rolls + persists) → reveal (real art) →
 *   identity (naming AGAINST the revealed art) → commit (the single
 *   POST /hatch, commit-only) → welcome (award + Meet CTA)
 *
 * The reveal is idempotent — re-entering the ceremony on a revealed pod
 * resumes past crack with the SAME roll (never re-rolled). Tones mirror
 * the BE canonical set. No resonant-atom input (optional at hatch).
 */

function growthState(stage: GrowthStage, familiarId = 'egg-1'): FamiliarGrowthState {
  return {
    familiarId,
    growthStage: stage,
    stageName: stage === 0 ? 'egg' : 'baby',
    species: stage === 0 ? '' : 'owl',
    shinyVariant: false,
    rarity: '',
    expCurrent: 0,
    expNextThreshold: stage === 0 ? 0 : 50,
    expCumulative: 0,
    effectiveLlmTier: 'flash-lite',
    effectiveMaxOutputTokens: 256,
    unlockedTools: [],
    resonantAtomId: '',
    ahaMomentConsumed: false,
    ahaMomentActiveUntil: null,
    revealedAt: null,
    hatchedAt: stage === 0 ? null : '2026-07-03T00:00:00Z',
    lastStageUpAt: null,
    displayName: stage === 0 ? '' : 'Eira',
  };
}

function revealResponse(
  overrides: Partial<RevealBreedResponse> = {},
): RevealBreedResponse {
  return {
    species: 'owl',
    shinyVariant: false,
    rarity: 'uncommon',
    rolledProbability: 12,
    revealedAt: '2026-07-17T03:00:00Z',
    alreadyRevealed: false,
    awakeningClass: 'hatch',
    state: {
      ...growthState(0, 'egg-1'),
      species: 'owl',
      revealedAt: '2026-07-17T03:00:00Z',
    },
    ...overrides,
  };
}

function hatchResponse(
  overrides: Partial<HatchEggResponse> = {},
): HatchEggResponse {
  return {
    species: 'owl',
    shinyVariant: false,
    rarity: 'uncommon',
    rolledProbability: 12,
    state: {
      ...growthState(1, 'egg-1'),
      displayName: 'Eira',
    },
    ...overrides,
  };
}

/**
 * A post-hatch loadout with the F-I2 st1-band skill (progress_mirror)
 * auto-equipped (ADR-228: MintThroughStage mints it into a slot at hatch).
 */
function loadoutView(overrides: Partial<LoadoutView> = {}): LoadoutView {
  return {
    familiarId: 'egg-1',
    skillGrants: ['progress_mirror'],
    equippedSkills: ['progress_mirror'],
    grants: [
      {
        skillKey: 'progress_mirror',
        skillKind: 'active',
        slotCost: 1,
        equipped: true,
        unlockedVia: 'species_path',
        unlockedAtStage: 1,
        catalogueActive: true,
      },
    ],
    skillSlotsUnlocked: 2,
    slotsUsed: 1,
    evolutionTier: 'apprentice',
    growthStage: 1,
    ...overrides,
  };
}

interface BuildOpts {
  reveal?: ReturnType<typeof vi.fn>;
  hatch?: ReturnType<typeof vi.fn>;
  getGrowth?: ReturnType<typeof vi.fn>;
  getLoadout?: ReturnType<typeof vi.fn>;
  familiarId?: string | null;
}

function build(opts: BuildOpts = {}) {
  TestBed.resetTestingModule();
  const growthStub = {
    reveal: opts.reveal ?? vi.fn(() => of(revealResponse())),
    hatch: opts.hatch ?? vi.fn(() => of(hatchResponse())),
    getGrowth: opts.getGrowth ?? vi.fn(() => of(growthState(0))),
    getLoadout: opts.getLoadout ?? vi.fn(() => of(loadoutView())),
  } as unknown as FamiliarGrowthService;
  const params =
    opts.familiarId === null ? {} : { familiarId: opts.familiarId ?? 'egg-1' };
  TestBed.configureTestingModule({
    imports: [FamiliarHatchingComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      { provide: FamiliarGrowthService, useValue: growthStub },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(params) } },
      },
    ],
  });
  const router = TestBed.inject(Router);
  const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fx = TestBed.createComponent(FamiliarHatchingComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fx.detectChanges();
  // Drain the translate-locale GET (and any other startup requests).
  httpMock.match(() => true).forEach((r) =>
    r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' }),
  );
  return {
    fx,
    cmp: fx.componentInstance,
    el: fx.nativeElement as HTMLElement,
    growthStub,
    navSpy,
  };
}

/** Walk the wizard to the commit step: crack-open (reveal) → name → commit. */
function reachCommit(
  fx: { detectChanges: () => void },
  cmp: FamiliarHatchingComponent,
  name = 'Eira',
): void {
  cmp.revealPod(); // crack → reveal (stubbed POST /reveal)
  cmp.next(); // reveal → identity
  cmp.onNameInput(name);
  cmp.next(); // identity → commit
  fx.detectChanges();
}

describe('FamiliarHatchingComponent (reveal-before-naming ceremony, CHO-2229)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('starts at Crack for an unrevealed Stage-0 pod and checks the growth state', () => {
    const getGrowth = vi.fn(() => of(growthState(0)));
    const { el, growthStub } = build({ getGrowth });
    expect(
      el.querySelector('[data-testid="aplus-hatching-step-crack"]'),
    ).not.toBeNull();
    expect((growthStub.getGrowth as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('egg-1');
  });

  it('redirects to the familiar profile when the pod is already hatched', () => {
    const getGrowth = vi.fn(() => of(growthState(1)));
    const { navSpy } = build({ getGrowth });
    expect(navSpy).toHaveBeenCalledWith(['/a/companion', 'egg-1']);
  });

  it('redirects to the roster when the route param is missing', () => {
    const { navSpy } = build({ familiarId: null });
    expect(navSpy).toHaveBeenCalledWith(['/a/companion']);
  });

  it('stays on the ceremony when the growth pre-check errors (commit surfaces real failures)', () => {
    const getGrowth = vi.fn(() => throwError(() => new Error('growth read down')));
    const { el, navSpy } = build({ getGrowth });
    expect(navSpy).not.toHaveBeenCalled();
    expect(
      el.querySelector('[data-testid="aplus-hatching-step-crack"]'),
    ).not.toBeNull();
  });

  // ── Crack → reveal: the roll happens HERE, before any naming ──────────

  it('crack-open fires exactly ONE reveal POST and lands on the reveal step with the roll', () => {
    const reveal = vi.fn(() =>
      of(
        revealResponse({
          species: 'dragon',
          rarity: 'legendary',
          shinyVariant: true,
          rolledProbability: 3,
        }),
      ),
    );
    const hatch = vi.fn(() => of(hatchResponse()));
    const { fx, el, cmp } = build({ reveal, hatch });
    (
      el.querySelector('[data-testid="aplus-hatching-crack-next"]') as HTMLButtonElement
    ).click();
    fx.detectChanges();

    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith('egg-1');
    expect(hatch).not.toHaveBeenCalled();

    expect(cmp.currentStep()).toBe('reveal');
    expect(
      el.querySelector('[data-testid="aplus-hatching-step-reveal"]'),
    ).not.toBeNull();
    expect(cmp.rolledSpecies()).toBe('dragon');
    expect(cmp.rolledRarity()).toBe('legendary');
    expect(cmp.rolledShiny()).toBe(true);
    expect(cmp.rolledProbability()).toBe(3);
    expect(el.querySelector('.reveal-light-wash')).not.toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-hatching-shiny"]'),
    ).not.toBeNull();
    // Pre-naming: the reveal offers "continue to naming", never a Meet CTA.
    expect(
      el.querySelector('[data-testid="aplus-hatching-reveal-continue"]'),
    ).not.toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-hatching-meet-cta"]'),
    ).toBeNull();
  });

  it('reveal error shows the banner, stays on crack, and is retryable', () => {
    const reveal = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('not stirring')))
      .mockReturnValueOnce(of(revealResponse()));
    const { fx, el, cmp } = build({ reveal });
    cmp.revealPod();
    fx.detectChanges();

    expect(cmp.revealing()).toBe(false);
    expect(cmp.revealError()).toBe('aplus.familiar_hatching.reveal_error');
    expect(cmp.currentStep()).toBe('crack');
    expect(cmp.rolledSpecies()).toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-hatching-reveal-error"]'),
    ).not.toBeNull();

    cmp.revealPod();
    fx.detectChanges();
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(cmp.currentStep()).toBe('reveal');
    expect(cmp.revealError()).toBeNull();
  });

  it('revealPod() is a no-op while a reveal is already in flight', () => {
    const reveal = vi.fn(() => of(revealResponse()));
    const { cmp } = build({ reveal });
    cmp.revealing.set(true);
    cmp.revealPod();
    expect(reveal).not.toHaveBeenCalled();
  });

  it('next() cannot skip crack → reveal — the reveal is entered only by a successful roll', () => {
    const { cmp } = build();
    cmp.next(); // must NOT advance past crack
    expect(cmp.currentStep()).toBe('crack');
  });

  // ── Resume: a revealed-but-unnamed pod skips straight to identity ─────

  it('resumes a revealed pod at identity with the persisted roll (idempotent re-POST, no re-roll)', () => {
    const getGrowth = vi.fn(() =>
      of({
        ...growthState(0),
        species: 'fox',
        revealedAt: '2026-07-17T03:00:00Z',
      } as FamiliarGrowthState),
    );
    const reveal = vi.fn(() =>
      of(revealResponse({ species: 'fox', alreadyRevealed: true })),
    );
    const { fx, el, cmp } = build({ getGrowth, reveal });
    fx.detectChanges();

    expect(reveal).toHaveBeenCalledTimes(1);
    expect(cmp.currentStep()).toBe('identity');
    expect(cmp.rolledSpecies()).toBe('fox');
    expect(
      el.querySelector('[data-testid="aplus-hatching-step-identity"]'),
    ).not.toBeNull();
  });

  // ── Identity: naming AGAINST the revealed art ──────────────────────────

  it('identity-next stays disabled until a name of at least 2 chars is typed', () => {
    const { fx, el, cmp } = build();
    cmp.revealPod();
    cmp.next(); // → identity
    fx.detectChanges();
    const submit = el.querySelector(
      '[data-testid="aplus-hatching-identity-next"]',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    cmp.onNameInput('E');
    fx.detectChanges();
    expect(submit.disabled).toBe(true);
    cmp.onNameInput('Eira');
    fx.detectChanges();
    expect(submit.disabled).toBe(false);
  });

  it('shows the REVEALED companion art + a live identity preview on the naming step (CHO-2229)', () => {
    const reveal = vi.fn(() => of(revealResponse({ species: 'fox' })));
    const { fx, el, cmp } = build({ reveal });
    cmp.revealPod();
    cmp.next(); // reveal → identity
    fx.detectChanges();

    const preview = el.querySelector(
      '[data-testid="aplus-hatching-identity-preview"]',
    );
    expect(preview).not.toBeNull();

    // The learner names a companion they can SEE: the revealed breed art
    // renders (chora-breed-art), never the breed-neutral Pod placeholder.
    expect(preview!.querySelector('chora-breed-art')).not.toBeNull();
    expect(
      preview!.querySelector('img[src="/assets/familiars/pods/pod-standard.png"]'),
    ).toBeNull();

    // Live name preview reflects what the learner types.
    cmp.onNameInput('Cadence');
    fx.detectChanges();
    expect(
      el.querySelector('[data-testid="aplus-hatching-identity-preview-name"]')
        ?.textContent,
    ).toContain('Cadence');
  });

  it('offers exactly the backend-canonical tones (socratic | direct | encouraging)', () => {
    const { fx, el, cmp } = build();
    cmp.revealPod();
    cmp.next();
    fx.detectChanges();
    expect(
      el.querySelector('[data-testid="aplus-hatching-tone-socratic"]'),
    ).not.toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-hatching-tone-direct"]'),
    ).not.toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-hatching-tone-encouraging"]'),
    ).not.toBeNull();
    // Mock-era tones the backend rejects must be gone.
    expect(
      el.querySelector('[data-testid="aplus-hatching-tone-rigorous"]'),
    ).toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-hatching-tone-playful"]'),
    ).toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-hatching-tone-curious"]'),
    ).toBeNull();
  });

  it('identity has no resonant-atom input (optional at hatch per CHO-2028)', () => {
    const { fx, el, cmp } = build();
    cmp.revealPod();
    cmp.next();
    fx.detectChanges();
    expect(
      el.querySelector('[data-testid="aplus-hatching-atom-input"]'),
    ).toBeNull();
  });

  // ── Commit: the single hatch POST, commit-only ─────────────────────────

  it('identity → commit shows the review summary with name, tone, persona AND the revealed breed', () => {
    const { fx, el, cmp } = build();
    reachCommit(fx, cmp, 'Eira');
    const commitStep = el.querySelector(
      '[data-testid="aplus-hatching-step-commit"]',
    );
    expect(commitStep).not.toBeNull();
    const txt = commitStep?.textContent ?? '';
    expect(txt).toContain('Eira');
    expect(txt).toContain('aplus.familiar_hatching.tone_encouraging');
    expect(txt).toContain('aplus.familiar_hatching.persona_cert-focused');
    // The revealed breed is on the summary — the learner commits to a
    // companion they have seen (Owlet = owl stage-1 label).
    expect(txt).toContain('Owlet');
  });

  it('commit fires exactly ONE hatch POST without resonantAtomId and lands on the welcome panel', () => {
    const hatch = vi.fn(() => of(hatchResponse()));
    const { fx, el, cmp } = build({ hatch });
    reachCommit(fx, cmp, 'Eira');
    cmp.setTone('socratic');
    cmp.commit();
    fx.detectChanges();

    expect(hatch).toHaveBeenCalledTimes(1);
    const body = (hatch.mock.calls[0] as unknown[])[1] as Record<
      string,
      unknown
    >;
    expect(body['displayName']).toBe('Eira');
    expect(body['tone']).toBe('socratic');
    expect(body['learnerPersona']).toBe('cert-focused');
    expect(Object.prototype.hasOwnProperty.call(body, 'resonantAtomId')).toBe(
      false,
    );

    // Post-commit: the ceremony is done — welcome panel with the Meet CTA;
    // no back affordance survives.
    expect(cmp.committed()).toBe(true);
    expect(
      el.querySelector('[data-testid="aplus-hatching-welcome"]'),
    ).not.toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-hatching-meet-cta"]'),
    ).not.toBeNull();
    expect(
      el.querySelector('[data-testid="aplus-hatching-commit-back"]'),
    ).toBeNull();
  });

  it('Meet CTA navigates to the hatched familiar profile', () => {
    const hatch = vi.fn(() =>
      of(
        hatchResponse({
          state: { ...growthState(1, 'fam-new-42'), displayName: 'Eira' },
        }),
      ),
    );
    const { fx, el, cmp, navSpy } = build({ hatch });
    reachCommit(fx, cmp);
    cmp.commit();
    fx.detectChanges();
    (
      el.querySelector('[data-testid="aplus-hatching-meet-cta"]') as HTMLButtonElement
    ).click();
    expect(navSpy).toHaveBeenCalledWith(['/a/companion', 'fam-new-42']);
  });

  it('commit error shows the banner, stays on commit, does not navigate, and is retryable', () => {
    const hatch = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('hatch boom')))
      .mockReturnValueOnce(of(hatchResponse()));
    const { fx, el, cmp, navSpy } = build({ hatch });
    reachCommit(fx, cmp);
    cmp.commit();
    fx.detectChanges();

    expect(cmp.committing()).toBe(false);
    expect(cmp.commitError()).toBe('aplus.familiar_hatching.commit_error');
    expect(cmp.currentStep()).toBe('commit');
    expect(cmp.committed()).toBe(false);
    expect(navSpy).not.toHaveBeenCalled();
    expect(
      el.querySelector('[data-testid="aplus-hatching-commit-error"]'),
    ).not.toBeNull();

    // Retry works: the pod is still Stage-0 server-side (roll persisted).
    cmp.commit();
    fx.detectChanges();
    expect(hatch).toHaveBeenCalledTimes(2);
    expect(cmp.committed()).toBe(true);
    expect(cmp.commitError()).toBeNull();
  });

  it('the committed species can never change at commit — the persisted roll stands', () => {
    // Even if the hatch response disagreed (it cannot — the BE reads the
    // persisted roll), the ceremony keeps rendering the REVEALED species the
    // learner named against.
    const reveal = vi.fn(() => of(revealResponse({ species: 'fox', rarity: 'rare' })));
    const hatch = vi.fn(() => of(hatchResponse({ species: 'fox', rarity: 'rare' })));
    const { fx, cmp } = build({ reveal, hatch });
    reachCommit(fx, cmp);
    cmp.commit();
    fx.detectChanges();
    expect(cmp.rolledSpecies()).toBe('fox');
  });

  it('prev() walks commit → identity → reveal and never re-enters crack (the roll is locked)', () => {
    const { cmp } = build();
    cmp.revealPod();
    cmp.next();
    cmp.onNameInput('Eira');
    cmp.next();
    expect(cmp.currentStep()).toBe('commit');
    cmp.prev();
    expect(cmp.currentStep()).toBe('identity');
    cmp.prev();
    expect(cmp.currentStep()).toBe('reveal');
    cmp.prev(); // the reveal cannot be walked back — the roll is persisted
    expect(cmp.currentStep()).toBe('reveal');
  });

  it('commit() is a no-op while a commit is already in flight', () => {
    const hatch = vi.fn(() => of(hatchResponse()));
    const { cmp } = build({ hatch });
    reachCommit({ detectChanges: () => undefined }, cmp);
    cmp.committing.set(true);
    cmp.commit();
    expect(hatch).not.toHaveBeenCalled();
  });

  it('setTone / setPersona update the identity state', () => {
    const { cmp } = build();
    expect(cmp.isTone('encouraging')).toBe(true);
    cmp.setTone('direct');
    expect(cmp.tone()).toBe('direct');
    expect(cmp.isTone('encouraging')).toBe(false);
    cmp.setPersona('curious-explorer');
    expect(cmp.learnerPersona()).toBe('curious-explorer');
  });

  // ── F-I2 award moment (CHO-2089): first Skill presented at the welcome ──
  it('welcome presents the auto-equipped first Skill (progress_mirror) as a named award', () => {
    const getLoadout = vi.fn(() => of(loadoutView()));
    const hatch = vi.fn(() => of(hatchResponse({ state: { ...growthState(1, 'fam-new-9'), displayName: 'Eira' } })));
    const { fx, el, cmp } = build({ hatch, getLoadout });
    reachCommit(fx, cmp);
    cmp.commit();
    fx.detectChanges();

    // The loadout is fetched for the hatched Familiar to surface the award.
    expect(getLoadout).toHaveBeenCalledWith('fam-new-9');
    expect(cmp.awardedSkillKey()).toBe('progress_mirror');
    const award = el.querySelector('[data-testid="aplus-hatching-skill-award"]');
    expect(award).not.toBeNull();
    // Named (not a tease): the skill-name i18n key is rendered.
    expect(award?.textContent ?? '').toContain('familiar_skill.progress_mirror');
  });

  it('welcome still lands cleanly when the loadout award lookup fails (award omitted, never blocks)', () => {
    const getLoadout = vi.fn(() => throwError(() => new Error('loadout down')));
    const { fx, el, cmp } = build({ getLoadout });
    reachCommit(fx, cmp);
    cmp.commit();
    fx.detectChanges();

    expect(cmp.committed()).toBe(true);
    expect(cmp.awardedSkillKey()).toBe('');
    expect(
      el.querySelector('[data-testid="aplus-hatching-skill-award"]'),
    ).toBeNull();
    // The core welcome (Meet CTA) is unaffected.
    expect(
      el.querySelector('[data-testid="aplus-hatching-meet-cta"]'),
    ).not.toBeNull();
  });
});

/**
 * Phase 3 (CHO-2235, ADR-228 Amendment A1): the reveal step is flavoured by
 * the awakening class the BACKEND resolves for the rolled species (art
 * brief §2 — avian/mythic/reptile HATCH, mammal WAKE, machine POWER-ON).
 * The FE never hardcodes the species→class taxonomy: it renders whatever
 * class the reveal response carries, normalising junk to the universal
 * hatch metaphor. The per-species awaken art (<species>-awaken.png) is
 * owner-generated and may not exist yet — the step must fall back to the
 * stage-1 BreedArt render, never a broken image.
 */
describe('FamiliarHatchingComponent (class-flavoured awakening, CHO-2235)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  function reveal(overrides: Partial<RevealBreedResponse>) {
    return vi.fn(() => of(revealResponse(overrides)));
  }

  it('renders WAKE flavour for a mammal reveal (fox)', () => {
    const { fx, el, cmp } = build({
      reveal: reveal({ species: 'fox', awakeningClass: 'wake' }),
    });
    cmp.revealPod();
    fx.detectChanges();

    const canvas = el.querySelector(
      '[data-testid="aplus-hatching-step-reveal"]',
    );
    expect(canvas?.getAttribute('data-awakening-class')).toBe('wake');
    expect(
      el.querySelector('.reveal-tagline')?.textContent,
    ).toContain('reveal_tagline_wake');
  });

  it('renders HATCH flavour for an avian reveal (owl)', () => {
    const { fx, el, cmp } = build({
      reveal: reveal({ species: 'owl', awakeningClass: 'hatch' }),
    });
    cmp.revealPod();
    fx.detectChanges();

    expect(
      el
        .querySelector('[data-testid="aplus-hatching-step-reveal"]')
        ?.getAttribute('data-awakening-class'),
    ).toBe('hatch');
    expect(
      el.querySelector('.reveal-tagline')?.textContent,
    ).toContain('reveal_tagline_hatch');
  });

  it('renders POWER-ON flavour from the response class without any species map of its own', () => {
    // The FE must follow the BE taxonomy verbatim — a power_on class on any
    // species renders the power_on copy (robot is not yet storable, so the
    // class field is the only honest carrier).
    const { fx, el, cmp } = build({
      reveal: reveal({ species: 'penguin', awakeningClass: 'power_on' }),
    });
    cmp.revealPod();
    fx.detectChanges();

    expect(
      el
        .querySelector('[data-testid="aplus-hatching-step-reveal"]')
        ?.getAttribute('data-awakening-class'),
    ).toBe('power_on');
    expect(
      el.querySelector('.reveal-tagline')?.textContent,
    ).toContain('reveal_tagline_power_on');
  });

  it('normalises an unknown class to the universal hatch metaphor', () => {
    const { fx, el, cmp } = build({
      reveal: reveal({
        species: 'owl',
        awakeningClass: 'metamorphose' as never,
      }),
    });
    cmp.revealPod();
    fx.detectChanges();

    expect(
      el
        .querySelector('[data-testid="aplus-hatching-step-reveal"]')
        ?.getAttribute('data-awakening-class'),
    ).toBe('hatch');
    expect(
      el.querySelector('.reveal-tagline')?.textContent,
    ).toContain('reveal_tagline_hatch');
  });

  it('tries the per-species awaken art, keeps BreedArt until it loads, and shows it once loaded', () => {
    const { fx, el, cmp } = build({
      reveal: reveal({ species: 'fox', awakeningClass: 'wake' }),
    });
    cmp.revealPod();
    fx.detectChanges();

    const img = el.querySelector(
      '[data-testid="aplus-hatching-awaken-art"]',
    ) as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/assets/familiars/fox/fox-awaken.png');
    // Not yet loaded: the stage-1 BreedArt fallback carries the step.
    expect(img.hidden).toBe(true);
    expect(el.querySelector('chora-breed-art')).not.toBeNull();

    img.dispatchEvent(new Event('load'));
    fx.detectChanges();
    expect(img.hidden).toBe(false);
    expect(el.querySelector('chora-breed-art')).toBeNull();
  });

  it('falls back to the stage-1 BreedArt when the awaken art is missing (0 of 10 shipped)', () => {
    const { fx, el, cmp } = build({
      reveal: reveal({ species: 'fox', awakeningClass: 'wake' }),
    });
    cmp.revealPod();
    fx.detectChanges();

    const img = el.querySelector(
      '[data-testid="aplus-hatching-awaken-art"]',
    ) as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    fx.detectChanges();

    expect(
      el.querySelector('[data-testid="aplus-hatching-awaken-art"]'),
    ).toBeNull();
    expect(el.querySelector('chora-breed-art')).not.toBeNull();
  });
});
