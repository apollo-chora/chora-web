import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FamiliarStageUpComponent } from './familiar-stage-up.component';
import { TranslateService } from '../../../../core/services/translate.service';

/**
 * Per the 2026-05-16 no-stubs / no-mock-fallback directive,
 * FamiliarGrowthService is fail-loud. Flush the /growth GET with the
 * canonical Eira Stage 1 Hatchling Dragon envelope so the celebration
 * modal renders (component auto-redirects Stage 3 unconsumed → Stage 1
 * keeps us here).
 */
const EIRA_STAGE1_DRAGON = {
  data: {
    familiarId: 'eira-001',
    growthStage: 1,
    stageName: 'baby',
    species: 'dragon',
    shinyVariant: false,
    rarity: 'common',
    expCurrent: 0,
    expNextThreshold: 50,
    expCumulative: 0,
    effectiveLlmTier: 'flash-lite',
    effectiveMaxOutputTokens: 1024,
    unlockedTools: ['cite_atom'],
    resonantAtomId: '',
    ahaMomentConsumed: false,
    ahaMomentActiveUntil: null,
    hatchedAt: '2026-05-13T00:00:00Z',
    lastStageUpAt: null,
    displayName: 'Eira',
  },
};

function flushGrowth(
  httpMock: HttpTestingController,
  envelope: Record<string, unknown> = EIRA_STAGE1_DRAGON,
  skills: Record<string, unknown> = EIRA_SKILLS_EMPTY,
): void {
  for (const r of httpMock.match((r) => r.url.includes('/growth') && !r.url.includes('-events'))) {
    r.flush(envelope);
  }
  // CHO-2030: the celebration also reads the loadout for the woke band.
  for (const r of httpMock.match((r) => r.url.endsWith('/skills'))) {
    r.flush(skills);
  }
}

/** Loadout with no grants — keeps pre-CHO-2030 tests' rendering identical. */
const EIRA_SKILLS_EMPTY = {
  familiarId: 'eira-001',
  skillGrants: [],
  equippedSkills: [],
  grants: [],
  skillSlotsUnlocked: 2,
  slotsUsed: 0,
  evolutionTier: 'apprentice',
  growthStage: 1,
};

function setup(familiarId = 'eira-001') {
  TestBed.configureTestingModule({
    imports: [FamiliarStageUpComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ familiarId })),
          snapshot: { paramMap: convertToParamMap({ familiarId }) },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(FamiliarStageUpComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, httpMock };
}

describe('FamiliarStageUpComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => httpMock?.verify());

  it('renders the stage-up modal with prev→current transition', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowth(httpMock);
    s.fixture.detectChanges();
    expect(s.el.querySelector('[data-testid="aplus-familiar-stage-up"]')).not.toBeNull();
    // Eira fixture = Stage 1 Hatchling. Prev is stage 0, which the learner
    // reads as "Pod" (the Stage-0 art IS the pod); only i18n keys and field
    // names still spell it egg.
    const transition = s.el.querySelector(
      '[data-testid="aplus-stage-up-transition"]',
    );
    expect(transition?.textContent ?? '').toContain('Pod');
    expect(transition?.textContent ?? '').not.toMatch(/egg/i);
    expect(transition?.textContent ?? '').toContain('Hatchling');
  });

  it('renders the unlocked tools section', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowth(httpMock);
    s.fixture.detectChanges();
    expect(s.el.querySelector('[data-testid="aplus-stage-up-tools"]')).not.toBeNull();
    expect(s.el.textContent ?? '').toContain('cite_atom');
  });

  it('renders the LLM-tier section', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowth(httpMock);
    s.fixture.detectChanges();
    expect(s.el.querySelector('[data-testid="aplus-stage-up-llm-tier"]')).not.toBeNull();
  });

  it('Continue CTA routes back to the profile', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowth(httpMock);
    s.fixture.detectChanges();
    const link = s.el.querySelector('[data-testid="aplus-stage-up-close"]');
    expect(link?.getAttribute('href')).toBe('/a/companion/eira-001');
  });

  // --- Branch coverage: null state (toSignal initialValue, never flushed) ---

  it('renders the loading fallback while state() is null (no HTTP flush)', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    // Intentionally do NOT flush — the growth GET stays open so state()
    // holds its initialValue null. The @else branch renders the loader and
    // every computed exercises its null-state arm (!s / ?. / ?? defaults).
    const cmp = s.fixture.componentInstance;
    expect(s.el.querySelector('[data-testid="aplus-familiar-stage-up"]')).toBeNull();
    expect(s.el.querySelector('.stage-up__loading')).not.toBeNull();
    // Computeds in their null-state arm:
    expect(cmp.state()).toBeNull();
    expect(cmp.prevStage()).toBe(0); // !s short-circuit
    expect(cmp.currentStage()).toBe(0); // state()?. undefined -> ?? 0
    expect(cmp.prevLabel()).toBe(''); // !s -> ''
    expect(cmp.currentLabel()).toBe(''); // !s -> ''
    expect(cmp.newToolsBucket()).toEqual([]); // ?? []
    expect(cmp.llmTier()).toBe(''); // ?? ''
    // Drain the pending request so afterEach verify() stays clean.
    flushGrowth(httpMock);
  });

  // --- Branch coverage: shareToCircle null guard (early return) ---

  it('shareToCircle returns early without navigating when state() is null', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    // state() is still null (not flushed) -> the `if (!s) return;` guard fires.
    s.fixture.componentInstance.shareToCircle();
    expect(navSpy).not.toHaveBeenCalled();
    flushGrowth(httpMock);
  });

  // --- Branch coverage: shareToCircle through-path ---

  it('shareToCircle navigates to /c/feed with compose query params', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowth(httpMock);
    s.fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    s.fixture.componentInstance.shareToCircle();
    expect(navSpy).toHaveBeenCalledWith(['/c/feed'], {
      queryParams: { composeStageUp: 'eira-001', stage: 1 },
    });
  });

  it('Share CTA button click also invokes shareToCircle navigation', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowth(httpMock);
    s.fixture.detectChanges();
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const btn = s.el.querySelector(
      '[data-testid="aplus-stage-up-share"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(navSpy).toHaveBeenCalledWith(['/c/feed'], expect.anything());
  });

  // --- Branch coverage: prevStage when growthStage === 0 (the egg case) ---

  it('prevStage stays 0 when current growthStage is 0 (egg)', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowth(httpMock, {
      data: {
        ...EIRA_STAGE1_DRAGON.data,
        growthStage: 0,
        unlockedTools: [],
        effectiveLlmTier: '',
      },
    });
    s.fixture.detectChanges();
    const cmp = s.fixture.componentInstance;
    expect(cmp.currentStage()).toBe(0);
    expect(cmp.prevStage()).toBe(0); // growthStage === 0 arm
    // empty unlockedTools -> tools section absent (length > 0 false arm)
    expect(s.el.querySelector('[data-testid="aplus-stage-up-tools"]')).toBeNull();
    // empty effectiveLlmTier -> llm-tier section absent (@if (llmTier()) false)
    expect(s.el.querySelector('[data-testid="aplus-stage-up-llm-tier"]')).toBeNull();
  });

  // R3-1 (CHO-2013 P1): the KG-neighbours reveal section is RETIRED — the
  // stage-up ceremony no longer renders a neighbours list (superseded by the
  // awakening resonant-concept pick). The prior "renders the KG-neighbors
  // section" branch-coverage test is removed with the feature.

  it('does NOT render a KG-neighbors section (retired R3-1)', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowth(httpMock, { data: { ...EIRA_STAGE1_DRAGON.data } });
    s.fixture.detectChanges();
    expect(
      s.el.querySelector('[data-testid="aplus-stage-up-neighbors"]'),
    ).toBeNull();
  });

  // --- Branch coverage: constructor queueMicrotask Stage-3 redirect ---

  it('redirects to /source-revelation on Stage 3 with aha-moment unconsumed', async () => {
    const s = setup('eira-003');
    httpMock = s.httpMock;
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    s.fixture.detectChanges();
    flushGrowth(httpMock, {
      data: {
        ...EIRA_STAGE1_DRAGON.data,
        familiarId: 'eira-003',
        growthStage: 3,
        ahaMomentConsumed: false,
      },
    });
    s.fixture.detectChanges();
    // The constructor's queueMicrotask reads state(); flush microtasks.
    await Promise.resolve();
    await Promise.resolve();
    expect(navSpy).toHaveBeenCalledWith([
      '/a/companion',
      'eira-003',
      'source-revelation',
    ]);
  });

  it('does NOT redirect on Stage 3 when aha-moment already consumed', async () => {
    const s = setup('eira-003c');
    httpMock = s.httpMock;
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    s.fixture.detectChanges();
    flushGrowth(httpMock, {
      data: {
        ...EIRA_STAGE1_DRAGON.data,
        familiarId: 'eira-003c',
        growthStage: 3,
        ahaMomentConsumed: true,
      },
    });
    s.fixture.detectChanges();
    await Promise.resolve();
    await Promise.resolve();
    // `!s.ahaMomentConsumed` is false -> no redirect; the modal stays.
    expect(navSpy).not.toHaveBeenCalled();
    expect(
      s.el.querySelector('[data-testid="aplus-familiar-stage-up"]'),
    ).not.toBeNull();
  });

  it('does NOT redirect when state() is null at microtask time', async () => {
    const s = setup();
    httpMock = s.httpMock;
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    s.fixture.detectChanges();
    // Never flush -> state() null at the microtask -> `if (s && ...)` short-circuits.
    await Promise.resolve();
    await Promise.resolve();
    expect(navSpy).not.toHaveBeenCalled();
    flushGrowth(httpMock);
  });

  // --- Branch coverage: empty familiarId param (?? '' default) ---

  it('uses empty id when familiarId param is absent (params.get -> null)', () => {
    TestBed.configureTestingModule({
      imports: [FamiliarStageUpComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        TranslateService,
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
            snapshot: { paramMap: convertToParamMap({}) },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(FamiliarStageUpComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // `params.get('familiarId') ?? ''` -> '' -> getGrowth('') -> path .../growth.
    const reqs = httpMock.match(
      (r) => r.url.includes('/growth') && !r.url.includes('-events'),
    );
    expect(reqs.length).toBe(1);
    reqs[0].flush(EIRA_STAGE1_DRAGON);
    // CHO-2030: drain the sibling loadout read the celebration now makes.
    for (const r of httpMock.match((r) => r.url.endsWith('/skills'))) {
      r.flush(EIRA_SKILLS_EMPTY);
    }
  });

  // --- stageNameLabel helper (no branch, but uncovered function) ---

  it('stageNameLabel maps a GrowthStage to its canonical stage name', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowth(httpMock);
    s.fixture.detectChanges();
    const cmp = s.fixture.componentInstance;
    expect(cmp.stageNameLabel(0)).toBe('egg');
    expect(cmp.stageNameLabel(3)).toBe('awakened');
    expect(cmp.stageNameLabel(6)).toBe('matured');
  });
});
