import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of } from 'rxjs';

import { FamiliarComponent } from './familiar.component';
import { TranslateService } from '../../../../core/services/translate.service';
import { provideMockAiTransparency } from '../../../../testing/mock-ai-transparency';
import { FamiliarRealtimeService } from '../../../../core/familiar/familiar-realtime.service';
import { FamiliarService } from './familiar.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/components/toast/toast.service';

function setupWithId(familiarId = 'eira-001'): {
  fixture: ComponentFixture<FamiliarComponent>;
  el: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [FamiliarComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideMockAiTransparency(),
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
  const fixture = TestBed.createComponent(FamiliarComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, httpMock };
}

function setupListMode(): {
  fixture: ComponentFixture<FamiliarComponent>;
  el: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [FamiliarComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideMockAiTransparency(),
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
  const fixture = TestBed.createComponent(FamiliarComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, httpMock };
}

function flushAllErrors(httpMock: HttpTestingController): void {
  // ActiveFamiliarService chains listMyFamiliars -> getGrowth, and the
  // component fires its own getGrowth from the route paramMap subscription.
  // Drain multiple times until the chain settles.
  for (let i = 0; i < 4; i++) {
    httpMock.match(() => true).forEach((r) =>
      r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' }),
    );
  }
}

/**
 * Eira Stage 2 Drakeling Dragon — canonical PROFILE-mode fixture per
 * ADR-149. EXP 0 / 200 because Stage 2 → Stage 3 threshold = 200. Used
 * by the (post 2026-05-16 no-stubs) PROFILE-mode tests below where
 * `FamiliarGrowthService.getGrowth` is fail-loud and must be flushed.
 */
const EIRA_STAGE2_DRAGON = {
  data: {
    familiarId: 'eira-001',
    growthStage: 2,
    stageName: 'fledgling',
    species: 'dragon',
    shinyVariant: false,
    rarity: 'common',
    expCurrent: 0,
    expNextThreshold: 200,
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

/**
 * Flush the route-driven `getGrowth(:familiarId)` GET with the Eira
 * Stage 2 fixture so PROFILE-mode templates render. Erroring everything
 * else (ActiveFamiliarService bootstrap chain) is fine — the global
 * service catches and leaves its `active` signal null.
 */
function flushGrowthForEira(httpMock: HttpTestingController): void {
  for (const r of httpMock.match(
    (r) => r.url.includes('/growth') && !r.url.includes('-events'),
  )) {
    r.flush(EIRA_STAGE2_DRAGON);
  }
}

/**
 * F-I2 (CHO-2089): a Stage-0 egg growth fixture. The profile takes the
 * incubation-card branch for it (not the growth hero). `{data:T}` BFF envelope
 * per FamiliarGrowthService.getGrowth (both the route read AND the card's own
 * read share the URL, so one flush serves both).
 */
const EGG_STAGE0 = {
  data: {
    familiarId: 'egg-1',
    growthStage: 0,
    stageName: 'egg',
    species: '',
    shinyVariant: false,
    rarity: '',
    expCurrent: 10,
    expNextThreshold: 0,
    expCumulative: 10,
    effectiveLlmTier: 'flash-lite',
    effectiveMaxOutputTokens: 256,
    unlockedTools: [],
    resonantAtomId: '',
    ahaMomentConsumed: false,
    ahaMomentActiveUntil: null,
    hatchedAt: null,
    lastStageUpAt: null,
    displayName: '',
  },
};

function flushEggGrowth(httpMock: HttpTestingController): void {
  for (const r of httpMock.match(
    (r) => r.url.includes('/growth') && !r.url.includes('-events'),
  )) {
    if (!r.cancelled) r.flush(EGG_STAGE0);
  }
}

/**
 * Resolve the in-flight `GET /api/v1/me/familiars` requests for the list
 * landing.
 *
 * Two callers hit this URL when the route has no `:familiarId`:
 *   1. `ActiveFamiliarService` (providedIn:'root') — bootstraps in its
 *      constructor via `FamiliarGrowthService.listMyFamiliars()`. Mock-
 *      fallback on error, so we drain it with `error()` so the active-
 *      familiar pipeline silently switches to mocks (irrelevant to the
 *      list landing under test).
 *   2. `FamiliarService.getMyFamiliars()` — the component's own list
 *      fetch, fail-loud (no mock fallback). This is the request we want
 *      to drive `_listState` from, so we `flush()` it with the supplied
 *      response.
 *
 * If only one request is in flight (e.g., the constructor short-
 * circuited), we route the payload to that single request.
 */
type FlushBody = Record<string, unknown> | readonly Record<string, unknown>[];

function flushListFetch(
  httpMock: HttpTestingController,
  payload: {
    readonly body: FlushBody;
    readonly opts?: { status: number; statusText: string };
  },
): void {
  const reqs = httpMock.match((r) => r.url.endsWith('/api/v1/me/familiars'));
  // Both the ActiveFamiliarService bootstrap and the component's own
  // `FamiliarService.getMyFamiliars()` (which now delegates to
  // FamiliarGrowthService.listMyFamiliars per the 2026-05-16 single-
  // source-of-truth refactor) hit `/api/v1/me/familiars`. Flush every
  // pending request with the supplied payload so neither pipeline emits
  // an unhandled error (mockRoster was removed per fail-loud directive).
  for (const r of reqs) {
    if (payload.opts) {
      r.flush(payload.body, payload.opts);
    } else {
      r.flush(payload.body);
    }
  }
}

/**
 * Build a wire-shaped Familiar item matching the chora-consumption
 * `/v1/me/familiars` envelope (camelCased by the gateway). Test-only
 * shortcut — pass FamiliarSummary-style fields and the helper expands
 * them into the wire row that `FamiliarGrowthService.listMyFamiliars()`
 * maps back to a FamiliarSummary.
 */
function wireItem(opts: {
  readonly familiarId: string;
  readonly name: string;
  readonly species: string;
  readonly growthStage: number;
  readonly expCurrent?: number;
  readonly shinyVariant?: boolean;
  readonly isActive?: boolean;
}): Record<string, unknown> {
  // ADR-149 next-stage thresholds (matches STAGE_EXP_THRESHOLDS in the
  // model, indexed by the CURRENT stage → next-stage's threshold).
  const NEXT_THRESHOLD: readonly number[] = [0, 50, 200, 500, 1200, 3000, 3000];
  const STAGE_NAMES: readonly string[] = [
    'egg', 'baby', 'fledgling', 'awakened', 'structural', 'teen', 'matured',
  ];
  const rules: Record<string, string> = {};
  if (opts.isActive) rules['is_active'] = 'true';
  return {
    // The wire speaks Companion (ADR-254 D9); the helper's argument keeps the
    // A+ model name so call sites read as the roster the component sees.
    companionId: opts.familiarId,
    tenantId: 't-test',
    ownerGcid: 'gcid-test',
    name: opts.name,
    specialization: 'curiosity',
    evolutionTier: '',
    skillSlotsUnlocked: 0,
    memoryContextCapacity: 0,
    skillGrants: [] as readonly string[],
    configuredRules: rules,
    memoryBankAppName: '',
    createdAt: '',
    updatedAt: '',
    growthState: {
      stage: opts.growthStage,
      stageName: STAGE_NAMES[opts.growthStage] ?? 'egg',
      exp: opts.expCurrent ?? 0,
      expToNextStage: NEXT_THRESHOLD[opts.growthStage] ?? 0,
      currentBreed: opts.species,
      breedRevealedAt: opts.growthStage > 0 ? '2026-05-13T00:00:00Z' : null,
      effectiveLlmTier: 'flash-lite',
      lastStageUpAt: null,
      resonantAtomId: '',
      ahaMomentConsumed: false,
      ahaMomentActiveUntil: null,
    },
    cosmetic: {
      equippedSkinId: null,
      shiny: opts.shinyVariant === true,
      rarity: 'common',
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Per-Familiar profile mode (existing ADR-149 growth view — unchanged)
// ──────────────────────────────────────────────────────────────────────

describe('FamiliarComponent (ADR-149 growth view)', () => {
  let fixture: ComponentFixture<FamiliarComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setupWithId();
    fixture = s.fixture;
    element = s.el;
    httpMock = s.httpMock;
  });

  afterEach(() => {
    // The profile mounts <chora-familiar-loadout> which fires its own
    // GET .../skills once the growth state resolves. These tests don't
    // exercise the loadout, so drain any trailing loadout request before
    // verify (its own spec covers it fully).
    httpMock
      .match((r) => r.url.endsWith('/skills') || r.url.endsWith('/growth'))
      .forEach((r) => {
        // CHO-2030: the overlay's forkJoin cancels the sibling read when
        // one errors — a cancelled TestRequest cannot .error().
        if (!r.cancelled) {
          r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
        }
      });
    httpMock.verify();
  });

  it('renders Eira state with Stage 2 Dragon adjective', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushAllErrors(httpMock);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="aplus-familiar"]')).not.toBeNull();
    expect(element.textContent ?? '').toContain('Eira');
    expect(element.textContent ?? '').toContain('Drakeling');
  });

  it('renders the F-I2 incubation card (not the growth hero) for a Stage-0 egg', () => {
    fixture.detectChanges();
    // Flush the growth read(s) with a Stage-0 egg so the profile takes the
    // incubation branch; loop so the card's own getGrowth (fired on mount) is
    // served with the same egg fixture.
    for (let i = 0; i < 3; i++) {
      flushEggGrowth(httpMock);
      fixture.detectChanges();
    }
    flushAllErrors(httpMock); // drain listMyFamiliars + goals + bootstrap chain
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-incubation-slot"]'),
    ).not.toBeNull();
    expect(element.querySelector('chora-aplus-incubation-card')).not.toBeNull();
    // The Stage/EXP growth hero must NOT render for a pre-hatch egg.
    expect(element.querySelector('[data-testid="aplus-familiar-card"]')).toBeNull();
  });

  it('renders the EXP bar with 0 / 200 EXP for Stage 2 Eira', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushAllErrors(httpMock);
    fixture.detectChanges();
    const xp = element.querySelector('[data-testid="aplus-familiar-xp"]');
    expect(xp?.textContent ?? '').toMatch(/0\s*\/\s*200/);
  });

  it('renders breed-art and stage chip', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushAllErrors(httpMock);
    fixture.detectChanges();
    expect(element.querySelector('chora-breed-art')).not.toBeNull();
    expect(
      element.querySelector('[data-testid="aplus-familiar-stage"]'),
    ).not.toBeNull();
  });

  it('renders the profile portrait in the card banner (sm fits the 96px frame)', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushAllErrors(httpMock);
    fixture.detectChanges();
    // Hero-card redesign: the portrait sits in a 96px banner frame, and
    // BreedSize maps sm to exactly 96px (md is 160px). d249f28af moved the
    // template md -> sm for that reason: at md the art overflowed the frame
    // and clipped to the top-left. The spec kept asserting md and had been
    // red on main ever since.
    const portraitArt = element.querySelector(
      '.fcard__portrait chora-breed-art',
    );
    expect(portraitArt).not.toBeNull();
    expect(portraitArt?.getAttribute('size')).toBe('sm');
  });

  it('lists cite_atom in unlocked tools (Stage 2 fixture)', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushAllErrors(httpMock);
    fixture.detectChanges();
    expect(element.textContent ?? '').toContain('cite_atom');
  });

  it('renders the growth-log routerLink to /a/companion/:id/growth-log', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushAllErrors(httpMock);
    fixture.detectChanges();
    const link = element.querySelector(
      '[data-testid="aplus-familiar-growth-log-link"]',
    );
    expect(link?.getAttribute('href')).toBe('/a/companion/eira-001/growth-log');
  });

  it('applies data-breed="dragon" attribute on the host', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushAllErrors(httpMock);
    fixture.detectChanges();
    const root = element.querySelector('[data-testid="aplus-familiar"]');
    expect(root?.getAttribute('data-breed')).toBe('dragon');
  });
});

// ──────────────────────────────────────────────────────────────────────
// F5 un-mock — Memory Bank panel fed by the real FamiliarService signal
// (GET /api/v1/me/familiars/{id}, instance shape — NO /growth suffix).
// ──────────────────────────────────────────────────────────────────────

/** Real instance wire (camelCased) for the per-instance GET. */
function instanceWire(opts?: {
  readonly memorySummary?: string;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    familiarId: 'eira-001',
    tenantId: '00000000-0000-7000-8000-0000000000a1',
    ownerGcid: '00000000-0000-7000-8000-0000000000b2',
    name: 'Eira',
    specialization: 'cspo',
    evolutionTier: 'apprentice',
    skillSlotsUnlocked: 1,
    memoryContextCapacity: 1000,
    skillGrants: [],
    configuredRules: {},
    memoryBankAppName: 'familiar:eira-001',
    createdAt: '2026-05-13T00:00:00.000000Z',
    updatedAt: '2026-05-14T00:00:00.000000Z',
  };
  if (opts?.memorySummary !== undefined) {
    base['memorySummary'] = opts.memorySummary;
  }
  return base;
}

/** Flush the per-instance GET (no `/growth`, no `-events`) with the given
 *  body; leave growth + roster requests for the other flush helpers. */
function flushInstanceGet(
  httpMock: HttpTestingController,
  body: Record<string, unknown>,
  opts?: { status: number; statusText: string },
): void {
  for (const r of httpMock.match(
    (req) =>
      /\/api\/v1\/me\/familiars\/[^/]+$/.test(req.url) &&
      !req.url.endsWith('/familiars'),
  )) {
    if (opts) {
      r.flush(body, opts);
    } else {
      r.flush(body);
    }
  }
}

describe('FamiliarComponent (F5 Memory Bank panel — real signal)', () => {
  let fixture: ComponentFixture<FamiliarComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setupWithId();
    fixture = s.fixture;
    element = s.el;
    httpMock = s.httpMock;
  });

  afterEach(() => {
    httpMock
      .match((r) => r.url.endsWith('/skills') || r.url.endsWith('/growth'))
      .forEach((r) => {
        // CHO-2030: the overlay's forkJoin cancels the sibling read when
        // one errors — a cancelled TestRequest cannot .error().
        if (!r.cancelled) {
          r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
        }
      });
    httpMock.verify();
  });

  it('renders the Memory Bank recap when memory_summary is present', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushInstanceGet(httpMock, instanceWire({ memorySummary: 'Nailed the CSPO atom.' }));
    flushAllErrors(httpMock);
    fixture.detectChanges();

    const panel = element.querySelector('[data-testid="aplus-familiar-memory"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent ?? '').toContain('Nailed the CSPO atom.');
  });

  it('renders the graceful Memory Bank empty state when memory_summary is absent', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-memory-empty"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="aplus-familiar-memory-recap"]'),
    ).toBeNull();
  });

  it('renders a fail-loud error banner with retry CTA when the instance GET 5xx', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushInstanceGet(httpMock, {}, { status: 500, statusText: 'Server Error' });
    flushAllErrors(httpMock);
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="aplus-familiar-memory-error"]');
    expect(err).not.toBeNull();
    expect(err?.getAttribute('role')).toBe('alert');
    expect(
      element.querySelector('[data-testid="aplus-familiar-memory-retry"]'),
    ).not.toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────
// Phase N — Familiar list/picker landing (no :familiarId route param)
// ──────────────────────────────────────────────────────────────────────

function growthEnvelope(
  over: Record<string, unknown> = {},
): { data: Record<string, unknown> } {
  return {
    data: {
      familiarId: 'eira-001',
      growthStage: 2,
      stageName: 'fledgling',
      species: 'owl',
      shinyVariant: false,
      rarity: 'common',
      expCurrent: 12,
      expNextThreshold: 200,
      expCumulative: 12,
      effectiveLlmTier: 'flash-lite',
      effectiveMaxOutputTokens: 1024,
      unlockedTools: ['cite_atom'],
      resonantAtomId: '',
      ahaMomentConsumed: false,
      ahaMomentActiveUntil: null,
      hatchedAt: '2026-05-13T00:00:00Z',
      lastStageUpAt: null,
      displayName: 'Eira',
      ...over,
    },
  };
}

/** Flush the route-driven `/growth` GET with a custom envelope. */
function flushGrowthWith(
  httpMock: HttpTestingController,
  env: { data: Record<string, unknown> },
): void {
  for (const r of httpMock.match(
    (r) => r.url.includes('/growth') && !r.url.includes('-events'),
  )) {
    r.flush(env);
  }
}

describe('FamiliarComponent (PROFILE-mode growth variants)', () => {
  let fixture: ComponentFixture<FamiliarComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setupWithId();
    fixture = s.fixture;
    element = s.el;
    httpMock = s.httpMock;
  });

  afterEach(() => {
    httpMock
      .match((r) => r.url.endsWith('/skills') || r.url.endsWith('/growth'))
      .forEach((r) => {
        // CHO-2030: the overlay's forkJoin cancels the sibling read when
        // one errors — a cancelled TestRequest cannot .error().
        if (!r.cancelled) {
          r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
        }
      });
    httpMock.verify();
  });

  it('renders the matured badge (and hides the EXP bar) at growthStage 6', () => {
    fixture.detectChanges();
    flushGrowthWith(httpMock, growthEnvelope({ growthStage: 6, stageName: 'matured' }));
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-matured"]'),
    ).not.toBeNull();
    // EXP bar branch is hidden once matured.
    expect(
      element.querySelector('[data-testid="aplus-familiar-xp"]'),
    ).toBeNull();
  });

  it('never LINKS the Future-form preview to the unmounted route, even inside the window', () => {
    // Owner ruling D5, 2026-09-02. The CTA linked to
    // `/a/companion/:familiarId/source-revelation`, which `aplus.routes.ts`
    // has never mounted, so every click fell through to
    // `app.routes.ts`'s `{ path: '**', redirectTo: 'not-found' }`. It is the
    // FIRST instance of the dead-route class that `home-card.route-liveness.ts`
    // now guards against, and it shipped for months looking perfectly healthy.
    //
    // Asserted INSIDE the window rather than outside it, because the window is
    // the only state that ever rendered the link: a test against a null window
    // would pass just as well with the defect still in the template.
    //
    // RENAMED for C-SR2 (owner R47, D7, 2026-09-03): the preview IS offered
    // again, as a control that opens the overlay in place. What stays banned is
    // the LINK to the unmounted route, which is what this test has always
    // actually measured.
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({ ahaMomentActiveUntil: '2026-06-10T00:00:00Z' }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-aha-cta"]'),
    ).toBeNull();
    // Totality over the profile: no anchor anywhere may point at the unmounted
    // route, so re-adding it under a different testid still fails.
    const dead = Array.from(element.querySelectorAll('a[href]')).filter((a) =>
      (a.getAttribute('href') ?? '').includes('source-revelation'),
    );
    expect(dead).toEqual([]);
  });

  // ── C-SR2: the preview opens ON DEMAND (owner R47, D7, 2026-09-03) ────────
  //
  // WHAT THIS PACKAGE ACTUALLY ADDS, stated plainly because the ledger said
  // otherwise: the source-revelation overlay is a complete component with NO
  // production trigger. `familiar-realtime.service.ts:15` says
  // `source_revelation` has no channel topic; its only producers are `emit()`
  // and `emitSourceRevelation()`, both documented dev seams, and neither is
  // called anywhere outside specs and stories. The overlay's own docblock
  // asserts a path through `FamiliarHatchingComponent.commit()` that component
  // never calls. So the control below is the overlay's FIRST production door,
  // not a second one, and the "event path unchanged" test beneath it exercises
  // a DEV SEAM, which is worth saying rather than dressing up as a live path.
  //
  // Nothing is invented: the overlay renders no field of its payload (its only
  // read of `payload()` is a focus-change trigger), every visible value comes
  // from `species` and static copy, and the payload built here carries the
  // profile's own `familiarId`, `species` and `ahaMomentActiveUntil`. That last
  // one matches what the event path puts in `source` (`windowExpiresAt`), so
  // the two doors agree rather than each inventing a meaning.
  it('opens the source-revelation overlay from the character sheet, inside the window', () => {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({ ahaMomentActiveUntil: '2026-06-10T00:00:00Z' }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    // Closed until asked for: an overlay that is already open would make the
    // click below prove nothing.
    expect(fixture.componentInstance.sourceRevelationOverlay()).toBeNull();

    const cta = element.querySelector<HTMLButtonElement>(
      '[data-testid="aplus-familiar-source-revelation-open"]',
    );
    expect(cta).not.toBeNull();
    cta!.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.sourceRevelationOverlay()).not.toBeNull();
    expect(
      element.querySelector(
        '[data-testid="aplus-familiar-source-revelation-overlay-slot"]',
      ),
    ).not.toBeNull();
  });

  it('builds the on-demand payload from the profile, inventing no field', () => {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({
        familiarId: 'eira-001',
        species: 'owl',
        ahaMomentActiveUntil: '2026-06-10T00:00:00Z',
      }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    element
      .querySelector<HTMLButtonElement>(
        '[data-testid="aplus-familiar-source-revelation-open"]',
      )!
      .click();
    fixture.detectChanges();

    // Every field traced to a real profile value. A placeholder here would be
    // the invented preview the ruling forbids, and it would be invisible,
    // because the overlay renders none of these.
    expect(fixture.componentInstance.sourceRevelationOverlay()).toEqual({
      familiarId: 'eira-001',
      breed: 'owl',
      source: '2026-06-10T00:00:00Z',
    });
  });

  it('does not offer the control when the server reports no window', () => {
    // The gate is server data (`ahaMomentActiveUntil`), not a client guess.
    // Without a window there is nothing truthful to open, so the control is
    // absent rather than disabled: hide what cannot be done.
    fixture.detectChanges();
    flushGrowthWith(httpMock, growthEnvelope({ ahaMomentActiveUntil: null }));
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-source-revelation-open"]'),
    ).toBeNull();
    expect(fixture.componentInstance.sourceRevelationOverlay()).toBeNull();
  });

  it('renders the shiny chip when shinyVariant is true', () => {
    fixture.detectChanges();
    flushGrowthWith(httpMock, growthEnvelope({ shinyVariant: true }));
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-shiny"]'),
    ).not.toBeNull();
  });

  it('renders the rarity chip carrying data-rarity for a rare familiar', () => {
    fixture.detectChanges();
    flushGrowthWith(httpMock, growthEnvelope({ rarity: 'rare' }));
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    const chip = element.querySelector('.fcard__rarity');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('data-rarity')).toBe('rare');
  });

  it('renders the empty-tools hint when unlockedTools is empty', () => {
    fixture.detectChanges();
    flushGrowthWith(httpMock, growthEnvelope({ unlockedTools: [] }));
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-tools-empty"]'),
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="aplus-familiar-tools"]'),
    ).toBeNull();
  });

  it('humanises the resonant panel — never leaks the raw concept/atom UUID (CHO-2047)', () => {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({
        resonantConceptId: 'concept-ring-centre-9',
        // D3: a resolved panel now carries the server-side title. Without one
        // the component renders the honest "this concept is gone" branch
        // instead, which its own test below covers.
        resonantConceptTitle: 'Roundabout priority',
        resonantAtomId: 'atom-resonant-7',
        resonantAtomTitle: 'Who yields on entry',
      }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    const concept = element.querySelector(
      '[data-testid="aplus-familiar-resonant-concept"]',
    );
    // The panel still renders (a concept IS picked) …
    expect(concept).not.toBeNull();
    // … but never the raw UUID, and never inside a <code> block.
    expect(concept?.textContent ?? '').not.toContain('concept-ring-centre-9');
    expect(concept?.querySelector('code')).toBeNull();
    const atom = element.querySelector(
      '[data-testid="aplus-familiar-resonant"]',
    );
    expect(atom?.textContent ?? '').not.toContain('atom-resonant-7');
    expect(atom?.querySelector('code')).toBeNull();
    // Instead the learner gets a friendly link to where it IS named.
    expect(
      element.querySelector('[data-testid="aplus-familiar-resonant-map-link"]'),
    ).not.toBeNull();
    // The retired KG-neighbours list must NOT render.
    expect(
      element.querySelector('[data-testid="aplus-familiar-kg-neighbors"]'),
    ).toBeNull();
  });

  it('shows the resonance empty-hint when no concept is picked', () => {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({ resonantConceptId: '', resonantAtomId: '' }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-resonant-empty"]'),
    ).not.toBeNull();
  });

  it('shows a friendly "mind" label (not the raw LLM tier enum) + total EXP (CHO-2047)', () => {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({ effectiveLlmTier: 'pro', expCumulative: 4321 }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    // The raw operator tier block is gone …
    expect(
      element.querySelector('[data-testid="aplus-familiar-llm-tier"]'),
    ).toBeNull();
    // … replaced by a learner-facing "mind" label driven through i18n
    // (tests render raw keys, so the mind_* key proves the friendly path).
    const mind = element.querySelector('[data-testid="aplus-familiar-mind"]');
    expect(mind).not.toBeNull();
    expect(mind?.textContent ?? '').toContain('aplus.familiar.mind');
    // Total EXP still shows (DecimalPipe groups thousands → "4,321").
    expect(element.textContent ?? '').toContain('4,321');
  });

  it('hides the operator-only token ceiling from the learner (CHO-2047)', () => {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({ effectiveMaxOutputTokens: 4096, growthStage: 3 }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    // effectiveMaxOutputTokens is an internal number — never surfaced to A+.
    expect(element.textContent ?? '').not.toContain('4096');
    expect(element.textContent ?? '').not.toContain('4,096');
    expect(element.textContent ?? '').not.toContain('max tokens');
  });

  it('renders hatched / last-stage-up as friendly <time>, not a raw ISO (CHO-2047)', () => {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({
        hatchedAt: '2026-05-13T00:00:00Z',
        lastStageUpAt: '2026-06-01T00:00:00Z',
        growthStage: 3,
      }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    const hatched = element.querySelector(
      '[data-testid="aplus-familiar-hatched-at"]',
    );
    expect(hatched?.tagName.toLowerCase()).toBe('time');
    // The machine-readable ISO lives in the datetime attribute for a11y …
    expect(hatched?.getAttribute('datetime')).toBe('2026-05-13T00:00:00Z');
    // … but the visible text is humanised (never the raw ISO string).
    expect(hatched?.textContent ?? '').not.toContain('2026-05-13T00:00:00Z');
    const lastUp = element.querySelector(
      '[data-testid="aplus-familiar-last-stage-up-at"]',
    );
    expect(lastUp?.getAttribute('datetime')).toBe('2026-06-01T00:00:00Z');
    expect(lastUp?.textContent ?? '').not.toContain('2026-06-01T00:00:00Z');
  });

  it('captions the EXP bar so the number is explained (CHO-2047)', () => {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({ growthStage: 3, expCurrent: 120, expNextThreshold: 200 }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-exp-hint"]'),
    ).not.toBeNull();
  });

  it('clamps expPct to 100 and renders the level badge', () => {
    fixture.detectChanges();
    // expCurrent > expNextThreshold → Math.min clamps the % to 100.
    flushGrowthWith(
      httpMock,
      growthEnvelope({ expCurrent: 500, expNextThreshold: 200, growthStage: 3 }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    const bar = element.querySelector(
      '.fcard__xp [role="progressbar"]',
    );
    expect(bar?.getAttribute('aria-valuenow')).toBe('100');
    const level = element.querySelector(
      '[data-testid="aplus-familiar-level"]',
    );
    expect(level?.textContent ?? '').toContain('3');
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROFILE-mode loading state — getGrowth never resolves (no familiar yet),
// so the third template branch (`@else` loading paragraph) renders.
// ──────────────────────────────────────────────────────────────────────

describe('FamiliarComponent (PROFILE-mode loading fallback)', () => {
  let fixture: ComponentFixture<FamiliarComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setupWithId();
    fixture = s.fixture;
    element = s.el;
    httpMock = s.httpMock;
  });

  afterEach(() => {
    httpMock
      .match((r) => r.url.endsWith('/skills') || r.url.endsWith('/growth'))
      .forEach((r) => {
        // CHO-2030: the overlay's forkJoin cancels the sibling read when
        // one errors — a cancelled TestRequest cannot .error().
        if (!r.cancelled) {
          r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
        }
      });
    httpMock.verify();
  });

  it('renders the loading paragraph + null stageLabel before growth resolves', () => {
    fixture.detectChanges();
    // Intentionally do NOT flush /growth — `familiar()` stays null so the
    // template falls through to the @else loading branch.
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    // familiar() unresolved → stageLabel() short-circuits to '' and the
    // matured-stage computed defaults to false (0 >= 6).
    expect(comp.stageLabel()).toBe('');
    expect(comp.atMaturedStage()).toBe(false);
    // expPct defaults to 100 when there is no familiar.
    expect(comp.expPct()).toBe(100);

    const loading = element.querySelector('.familiar__loading');
    expect(loading).not.toBeNull();
    expect(loading?.getAttribute('role')).toBe('status');

    // Settle outstanding requests for verify().
    flushAllErrors(httpMock);
  });

  it('renders the Memory-Bank loading state while the instance GET is pending', () => {
    fixture.detectChanges();
    // Resolve only the growth GET so the profile shell renders; leave the
    // instance GET pending → profileState() stays {status:'loading'}.
    flushGrowthForEira(httpMock);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-memory-loading"]'),
    ).not.toBeNull();

    // Now settle the pending instance + bootstrap requests for verify().
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
  });
});

// ──────────────────────────────────────────────────────────────────────
// WS-2 realtime overlays — stageUpOverlay / sourceRevelationOverlay are
// fed by FamiliarRealtimeService subjects (subscribed in the constructor)
// and dismissed via the public dismiss* methods.
// ──────────────────────────────────────────────────────────────────────

describe('FamiliarComponent (WS-2 realtime overlays)', () => {
  let fixture: ComponentFixture<FamiliarComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;
  let realtime: FamiliarRealtimeService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setupWithId();
    fixture = s.fixture;
    element = s.el;
    httpMock = s.httpMock;
    realtime = TestBed.inject(FamiliarRealtimeService);
  });

  afterEach(() => {
    httpMock
      .match((r) => r.url.endsWith('/skills') || r.url.endsWith('/growth'))
      .forEach((r) => {
        // CHO-2030: the overlay's forkJoin cancels the sibling read when
        // one errors — a cancelled TestRequest cannot .error().
        if (!r.cancelled) {
          r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
        }
      });
    httpMock.verify();
  });

  it('shows the stage-up overlay slot when a stage transition is emitted', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    expect(
      element.querySelector('[data-testid="aplus-familiar-stage-up-overlay-slot"]'),
    ).toBeNull();

    realtime.emitStageTransition({
      familiarId: 'eira-001',
      fromStage: 2,
      toStage: 3,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.stageUpOverlay()).not.toBeNull();
    expect(
      element.querySelector('[data-testid="aplus-familiar-stage-up-overlay-slot"]'),
    ).not.toBeNull();

    fixture.componentInstance.dismissStageUp();
    fixture.detectChanges();
    expect(fixture.componentInstance.stageUpOverlay()).toBeNull();
    expect(
      element.querySelector('[data-testid="aplus-familiar-stage-up-overlay-slot"]'),
    ).toBeNull();
  });

  it('shows the source-revelation overlay slot when a revelation is emitted', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    realtime.emitSourceRevelation({
      familiarId: 'eira-001',
      breed: 'dragon',
      source: '2026-06-10T00:00:00Z',
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.sourceRevelationOverlay()).not.toBeNull();
    expect(
      element.querySelector(
        '[data-testid="aplus-familiar-source-revelation-overlay-slot"]',
      ),
    ).not.toBeNull();

    fixture.componentInstance.dismissSourceRevelation();
    fixture.detectChanges();
    expect(fixture.componentInstance.sourceRevelationOverlay()).toBeNull();
    expect(
      element.querySelector(
        '[data-testid="aplus-familiar-source-revelation-overlay-slot"]',
      ),
    ).toBeNull();
  });

  it('routes a `stage_up` stream event through fanOut into the overlay', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    // emit() fans a typed envelope out to the stageTransition$ subject.
    realtime.emit({
      type: 'stage_up',
      familiarId: 'eira-001',
      stageFrom: 2,
      stageTo: 3,
      stageName: 'awakened',
      unlockedTools: [],
      llmTierNew: 'flash',
      occurredAt: '2026-06-04T00:00:00Z',
    });
    fixture.detectChanges();

    const overlay = fixture.componentInstance.stageUpOverlay();
    expect(overlay).not.toBeNull();
    expect(overlay?.fromStage).toBe(2);
    expect(overlay?.toStage).toBe(3);
  });
});

// ──────────────────────────────────────────────────────────────────────
// retryProfile() — the Memory-Bank error CTA re-issues the instance GET.
// ──────────────────────────────────────────────────────────────────────

describe('FamiliarComponent (retryProfile + memory retry CTA)', () => {
  let fixture: ComponentFixture<FamiliarComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setupWithId();
    fixture = s.fixture;
    element = s.el;
    httpMock = s.httpMock;
  });

  afterEach(() => {
    httpMock
      .match((r) => r.url.endsWith('/skills') || r.url.endsWith('/growth'))
      .forEach((r) => {
        // CHO-2030: the overlay's forkJoin cancels the sibling read when
        // one errors — a cancelled TestRequest cannot .error().
        if (!r.cancelled) {
          r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
        }
      });
    httpMock.verify();
  });

  it('re-fetches the instance and surfaces the recap after a retry click', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    // First instance GET errors → memory error banner with retry CTA.
    flushInstanceGet(httpMock, {}, { status: 500, statusText: 'Server Error' });
    flushAllErrors(httpMock);
    fixture.detectChanges();

    const retry = element.querySelector(
      '[data-testid="aplus-familiar-memory-retry"]',
    ) as HTMLButtonElement | null;
    expect(retry).not.toBeNull();

    retry!.click();
    fixture.detectChanges();

    // The retry re-issued the instance GET — flush it with a recap body.
    flushInstanceGet(
      httpMock,
      instanceWire({ memorySummary: 'Came back stronger.' }),
    );
    flushAllErrors(httpMock);
    fixture.detectChanges();

    const recap = element.querySelector(
      '[data-testid="aplus-familiar-memory-recap"]',
    );
    expect(recap?.textContent ?? '').toContain('Came back stronger.');
  });

  it('retryProfile() falls back to the active familiar id when no route param exists', () => {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    const svc = TestBed.inject(FamiliarService);
    const calls: string[] = [];
    const orig = svc.loadProfile.bind(svc);
    (svc as unknown as { loadProfile: (id: string) => void }).loadProfile = (
      id: string,
    ) => {
      calls.push(id);
    };

    // Route snapshot DOES carry familiarId in this setup → retry uses it.
    fixture.componentInstance.retryProfile();
    expect(calls).toEqual(['eira-001']);

    (svc as unknown as { loadProfile: (id: string) => void }).loadProfile =
      orig as never;
  });
});

// ──────────────────────────────────────────────────────────────────────
// Roster-card EXP-pct edge case — expNextThreshold 0 ⇒ cardExpPct 100.
// ──────────────────────────────────────────────────────────────────────

describe('FamiliarComponent (CHO-2095 bare-route front-door)', () => {
  let fixture: ComponentFixture<FamiliarComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  const FAM_A = '00000000-0000-7000-8000-00000000e1a0';
  const FAM_B = '00000000-0000-7000-8000-00000000c0d3';

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setupListMode();
    fixture = s.fixture;
    element = s.el;
    httpMock = s.httpMock;
  });

  afterEach(() => {
    flushAllErrors(httpMock);
    httpMock.verify();
  });

  it('redirects the bare route to the ACTIVE familiar profile (no roster list)', () => {
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    // Platform mapping: the BE orders the roster active-first (the service
    // flags index 0 as active) — the front-door lands on the roster head.
    flushListFetch(httpMock, {
      body: {
        items: [
          wireItem({ familiarId: FAM_A, name: 'Eira', species: 'dragon', growthStage: 2, isActive: true }),
          wireItem({ familiarId: FAM_B, name: 'Cinder', species: 'phoenix', growthStage: 1 }),
        ],
      },
    });
    fixture.detectChanges();
    expect(nav).toHaveBeenCalledWith(['/a/companion', FAM_A], { replaceUrl: true });
    expect(element.querySelector('[data-testid="aplus-familiar-list"]')).toBeNull();
    expect(
      element.querySelectorAll('[data-testid="aplus-familiar-list-retire"]').length,
    ).toBe(0);
  });

  it('falls back to the first familiar when none is flagged active', () => {
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    flushListFetch(httpMock, {
      body: {
        items: [
          wireItem({ familiarId: FAM_B, name: 'Cinder', species: 'phoenix', growthStage: 1 }),
          wireItem({ familiarId: FAM_A, name: 'Eira', species: 'dragon', growthStage: 2 }),
        ],
      },
    });
    fixture.detectChanges();
    expect(nav).toHaveBeenCalledWith(['/a/companion', FAM_B], { replaceUrl: true });
  });

  it('redirects an empty cast to the marketplace', () => {
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    flushListFetch(httpMock, { body: { items: [] } });
    fixture.detectChanges();
    expect(nav).toHaveBeenCalledWith(['/a/companion/marketplace'], { replaceUrl: true });
  });

  it('renders a fail-loud error with retry when the roster fetch fails', () => {
    fixture.detectChanges();
    flushListFetch(httpMock, {
      body: { error: 'boom' },
      opts: { status: 500, statusText: 'boom' },
    });
    fixture.detectChanges();
    expect(
      element.querySelector('[data-testid="aplus-familiar-front-door-error"]'),
    ).not.toBeNull();
    // Retry refires the roster fetch.
    (
      element.querySelector(
        '[data-testid="aplus-familiar-front-door-retry"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(
      httpMock.match((r) => r.url.endsWith('/api/v1/me/familiars')).length,
    ).toBeGreaterThan(0);
  });
});

// ──────────────────────────────────────────────────────────────────────
// CHO-2095 — retire lives on the PROFILE (relocated from the dead list),
// confirmed via an irreversibility prompt that names the memory deletion
// (CHO-2096 wires the actual purge server-side).
// ──────────────────────────────────────────────────────────────────────

describe('FamiliarComponent (CHO-2095 profile chat CTA + retire)', () => {
  let fixture: ComponentFixture<FamiliarComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setupWithId('eira-001');
    fixture = s.fixture;
    element = s.el;
    httpMock = s.httpMock;
  });

  afterEach(() => {
    flushAllErrors(httpMock);
    httpMock.verify();
  });

  function renderProfile(): void {
    fixture.detectChanges();
    flushGrowthForEira(httpMock);
    flushAllErrors(httpMock);
    fixture.detectChanges();
  }

  it('renders a Chat CTA on the hero linking to the chat page', () => {
    renderProfile();
    const cta = element.querySelector(
      '[data-testid="aplus-familiar-chat-cta"]',
    ) as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.getAttribute('href')).toContain('/a/companion/eira-001/chat');
  });

  it('renders the Retire action and confirms with the irreversibility copy', async () => {
    const confirmSvc = TestBed.inject(ConfirmDialogService);
    const confirmSpy = vi.spyOn(confirmSvc, 'confirm').mockResolvedValue(false);
    renderProfile();

    const retire = element.querySelector(
      '[data-testid="aplus-familiar-retire"]',
    ) as HTMLButtonElement;
    expect(retire).not.toBeNull();
    retire.click();
    await fixture.whenStable();

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'aplus.familiar.retire_confirm_title',
        message: 'aplus.familiar.retire_confirm_message',
        confirmText: 'aplus.familiar.retire_confirm_confirm',
        variant: 'danger',
      }),
    );
    // Cancelled ⇒ no POST fired.
    expect(httpMock.match((r) => r.url.endsWith('/retire')).length).toBe(0);
  });

  it('POSTs /retire on confirm, toasts and navigates to the dashboard', async () => {
    const confirmSvc = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirmSvc, 'confirm').mockResolvedValue(true);
    const router = TestBed.inject(Router);
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');
    renderProfile();

    (
      element.querySelector('[data-testid="aplus-familiar-retire"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    const req = httpMock.expectOne((r) => r.url.endsWith('/familiars/eira-001/retire'));
    expect(req.request.method).toBe('POST');
    req.flush({ familiar_id: 'eira-001', retired: true });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(toastSpy).toHaveBeenCalledWith('aplus.familiar.retire_success', 'success');
    expect(nav).toHaveBeenCalledWith(['/a/dashboard']);
  });

  it('keeps the profile and shows an error toast when the retire POST fails', async () => {
    const confirmSvc = TestBed.inject(ConfirmDialogService);
    vi.spyOn(confirmSvc, 'confirm').mockResolvedValue(true);
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');
    renderProfile();

    (
      element.querySelector('[data-testid="aplus-familiar-retire"]') as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    const req = httpMock.expectOne((r) => r.url.endsWith('/familiars/eira-001/retire'));
    req.flush({ error: 'boom' }, { status: 500, statusText: 'boom' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(toastSpy).toHaveBeenCalledWith('aplus.familiar.retire_error', 'error');
    expect(
      element.querySelector('[data-testid="aplus-familiar-retire"]'),
    ).not.toBeNull();
  });
});


/** Locate `public/assets/i18n/<file>` from the runner's cwd. Fails loud. */
function resolveI18n(file: string): string {
  let dir = process.cwd();
  for (let hop = 0; hop < 6; hop++) {
    const candidate = join(dir, 'public', 'assets', 'i18n', file);
    try {
      statSync(candidate);
      return candidate;
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error(`familiar.component.spec: could not locate ${file}`);
}

/**
 * D3 acceptance guard: nothing machine-shaped reaches the learner.
 *
 * CHO-2047 asks that the character sheet stop leaking the platform's internal
 * vocabulary. The individual assertions above cover specific panels; this one
 * covers the WHOLE rendered profile, so a new panel cannot quietly reintroduce
 * the class. It scans TEXT NODES rather than the raw HTML, deliberately:
 * `<time datetime="2026-05-13T00:00:00Z">` is correct HTML and the ISO belongs
 * in that attribute. What must never appear is the ISO in the text a person
 * reads, and the template already pipes `| relativeTime` for that half.
 *
 * The fixture is populated with values shaped like the real thing (a UUIDv7
 * tenant, an opaque concept id, an ISO timestamp) so the guard has something
 * to find if the humanising regresses.
 */
describe('FamiliarComponent (D3 humanised character sheet)', () => {
  let fixture: ComponentFixture<FamiliarComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const s = setupWithId();
    fixture = s.fixture;
    element = s.el;
    httpMock = s.httpMock;
  });

  afterEach(() => {
    httpMock
      .match((r) => r.url.endsWith('/skills') || r.url.endsWith('/growth'))
      .forEach((r) => {
        if (!r.cancelled) {
          r.error(new ProgressEvent('error'), { status: 0, statusText: 'no bff' });
        }
      });
    httpMock.verify();
  });

  /** Every text node under the profile, trimmed, empties dropped. */
  function visibleText(root: HTMLElement): readonly string[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const out: string[] = [];
    let node = walker.nextNode();
    while (node !== null) {
      const text = (node.textContent ?? '').trim();
      if (text !== '') out.push(text);
      node = walker.nextNode();
    }
    return out;
  }

  /** A UUID in any version, which is what every id on this platform is. */
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  /** An ISO-8601 instant, the shape every timestamp field carries. */
  const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  /** A machine key: lower_snake_case of two or more words, standing alone. */
  const MACHINE_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;

  function renderPopulatedProfile(): void {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({
        resonantConceptId: '0195d3f8-7c21-7a44-9e10-2b7f5c9a1d33',
        resonantAtomId: '0195d3f8-7c21-7a44-9e10-4f21ab99c007',
        hatchedAt: '2026-05-13T09:41:00Z',
        lastStageUpAt: '2026-08-30T14:02:00Z',
      }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();
  }

  it('renders no UUID anywhere a learner can read it', () => {
    renderPopulatedProfile();
    const offenders = visibleText(element).filter((s) => UUID.test(s));
    expect(
      offenders,
      `The profile is showing raw identifiers to a learner:\n` +
        offenders.map((s) => `  ${s}`).join('\n'),
    ).toEqual([]);
  });

  it('renders no ISO timestamp in visible text (the datetime attribute is fine)', () => {
    renderPopulatedProfile();
    const offenders = visibleText(element).filter((s) => ISO.test(s));
    expect(
      offenders,
      `The profile is showing machine timestamps to a learner. Use the\n` +
        `relativeTime pipe for the visible half and keep the ISO in the\n` +
        `<time datetime> attribute:\n` +
        offenders.map((s) => `  ${s}`).join('\n'),
    ).toEqual([]);
  });

  it('renders no bare machine key in visible text', () => {
    renderPopulatedProfile();
    const offenders = visibleText(element).filter((s) => MACHINE_KEY.test(s));
    expect(
      offenders,
      `The profile is showing internal enum values or i18n keys to a\n` +
        `learner. Map them onto copy in en.json:\n` +
        offenders.map((s) => `  ${s}`).join('\n'),
    ).toEqual([]);
  });

  it('has a working scan (positive control: a planted id IS caught)', () => {
    renderPopulatedProfile();
    const planted = document.createElement('p');
    planted.textContent = '0195d3f8-7c21-7a44-9e10-2b7f5c9a1d33';
    element.appendChild(planted);
    expect(visibleText(element).filter((s) => UUID.test(s))).toHaveLength(1);
    planted.textContent = 'hatched 2026-05-13T09:41:00Z';
    expect(visibleText(element).filter((s) => ISO.test(s))).toHaveLength(1);
    planted.remove();
  });

  it('names the resonant concept and atom rather than only pointing at the map', () => {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({
        resonantConceptId: '0195d3f8-7c21-7a44-9e10-2b7f5c9a1d33',
        resonantConceptTitle: 'Roundabout priority',
        resonantAtomId: '0195d3f8-7c21-7a44-9e10-4f21ab99c007',
        resonantAtomTitle: 'Who yields on entry',
      }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    // The suite runs with NO translations loaded, so the pipe is a passthrough
    // and asserting the rendered sentence would assert nothing. Two things are
    // assertable and together they are the behaviour: the component picks the
    // NAMED branch rather than the gone branch, and the shipped copy actually
    // interpolates a title.
    expect(
      element.querySelector('[data-testid="aplus-familiar-resonant-concept"]'),
      'a resolved title must render the named branch',
    ).not.toBeNull();
    expect(
      element.querySelector('[data-testid="aplus-familiar-resonant-unresolved"]'),
      'a resolved title must NOT render the gone branch',
    ).toBeNull();
    expect(
      element.querySelector('[data-testid="aplus-familiar-resonant"]'),
    ).not.toBeNull();

    const en = JSON.parse(
      readFileSync(resolveI18n('en.json'), 'utf8'),
    ) as Record<string, Record<string, Record<string, string>>>;
    const familiar = en['aplus']?.['familiar'] ?? {};
    expect(familiar['resonant_concept_named']).toContain('{{title}}');
    expect(familiar['resonant_atom_named']).toContain('{{title}}');
    // The gone copy must NOT try to name anything.
    expect(familiar['resonant_concept_gone']).not.toContain('{{title}}');
  });

  it('says the concept is gone rather than inventing a title when it does not resolve', () => {
    fixture.detectChanges();
    flushGrowthWith(
      httpMock,
      growthEnvelope({
        resonantConceptId: '0195d3f8-7c21-7a44-9e10-2b7f5c9a1d33',
        // The server resolved nothing: the concept left this learner's map.
        resonantConceptTitle: null,
      }),
    );
    flushInstanceGet(httpMock, instanceWire());
    flushAllErrors(httpMock);
    fixture.detectChanges();

    const concept = element.querySelector(
      '[data-testid="aplus-familiar-resonant-unresolved"]',
    );
    expect(
      concept,
      'an unresolved concept needs its own honest state, not the generic body',
    ).not.toBeNull();
  });
});
