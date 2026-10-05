import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FamiliarSourceRevelationComponent } from './familiar-source-revelation.component';
import { TranslateService } from '../../../../core/services/translate.service';

/**
 * Per the 2026-05-16 no-stubs / no-mock-fallback directive,
 * FamiliarGrowthService is fail-loud. We must flush BOTH the
 * /growth GET and the follow-on POST /source-revelation envelope; the
 * component auto-opens the 24h window when state lacks an active
 * window-expiry. Eira is shipped as Stage 1 Dragon in the fixture set
 * (the original ADR-149 mock); we keep that here so the assertions
 * (Hatchling / Angelic Dragon labels) continue to hold.
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

const SOURCE_REVELATION_WINDOW = {
  data: {
    previewLlmTier: 'pro',
    windowExpiresAt: '2026-05-14T00:00:00Z',
  },
};

/**
 * State that already carries an active 24h window (`ahaMomentActiveUntil`
 * set). The component takes the `else if (s?.ahaMomentActiveUntil)` arm:
 * it seeds `windowExpiresAt` / `previewLlmTier` FROM the state and does
 * NOT issue the follow-on POST /source-revelation.
 */
const EIRA_ACTIVE_WINDOW = {
  data: {
    ...EIRA_STAGE1_DRAGON.data,
    growthStage: 3,
    stageName: 'awakened',
    effectiveLlmTier: 'pro',
    ahaMomentConsumed: false,
    ahaMomentActiveUntil: '2026-05-15T00:00:00Z',
  },
};

/**
 * State where the Aha-moment was already consumed — `windowConsumed()`
 * computes true, the template renders the post-window narrative + consumed
 * eyebrow/CTA, and NEITHER auto-open branch fires (no POST).
 */
const EIRA_CONSUMED = {
  data: {
    ...EIRA_STAGE1_DRAGON.data,
    growthStage: 3,
    stageName: 'awakened',
    ahaMomentConsumed: true,
    ahaMomentActiveUntil: null,
  },
};

function flushHappy(httpMock: HttpTestingController): void {
  for (const r of httpMock.match((r) => r.url.includes('/growth') && !r.url.includes('-events'))) {
    r.flush(EIRA_STAGE1_DRAGON);
  }
  for (const r of httpMock.match((r) => r.url.includes('/source-revelation'))) {
    r.flush(SOURCE_REVELATION_WINDOW);
  }
}

/** Flush ONLY the /growth GET with the supplied envelope; no POST expected. */
function flushGrowthOnly(
  httpMock: HttpTestingController,
  envelope: { readonly data: Record<string, unknown> },
): void {
  for (const r of httpMock.match(
    (r) => r.url.includes('/growth') && !r.url.includes('-events'),
  )) {
    r.flush(envelope);
  }
}

function setup(familiarId = 'eira-001') {
  TestBed.configureTestingModule({
    imports: [FamiliarSourceRevelationComponent],
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
  const fixture = TestBed.createComponent(FamiliarSourceRevelationComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, httpMock };
}

describe('FamiliarSourceRevelationComponent', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('renders the ceremony for active Aha-moment', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushHappy(httpMock);
    s.fixture.detectChanges();
    expect(
      s.el.querySelector('[data-testid="aplus-familiar-source-revelation"]'),
    ).not.toBeNull();
    expect(
      s.el.querySelector('[data-testid="aplus-source-revelation-narrative"]'),
    ).not.toBeNull();
  });

  it('displays both the current and matured stage labels', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushHappy(httpMock);
    s.fixture.detectChanges();
    // Eira fixture is Stage 1 Dragon — current label = Hatchling.
    // Matured (Stage 6) Dragon = "Angelic Dragon".
    expect(s.el.textContent ?? '').toContain('Hatchling');
    expect(s.el.textContent ?? '').toContain('Angelic Dragon');
  });

  it('Continue CTA routes back to /a/companion/:id', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushHappy(httpMock);
    s.fixture.detectChanges();
    const link = s.el.querySelector(
      '[data-testid="aplus-source-revelation-continue"]',
    );
    expect(link?.getAttribute('href')).toBe('/a/companion/eira-001');
  });

  // ── Branch: tap() else-if arm — state already carries an active window.
  // Exercises `s?.ahaMomentActiveUntil` truthy: windowExpiresAt/previewLlmTier
  // are seeded from STATE and NO POST /source-revelation is issued. The
  // window-card + preview-tier sub-block both render (windowConsumed() false).
  it('seeds window from state when ahaMomentActiveUntil is already set (no POST)', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowthOnly(httpMock, EIRA_ACTIVE_WINDOW);
    s.fixture.detectChanges();
    // No outstanding POST — verify nothing matches /source-revelation.
    expect(
      httpMock.match((r) => r.url.includes('/source-revelation')).length,
    ).toBe(0);
    const card = s.el.querySelector(
      '[data-testid="aplus-source-revelation-window-card"]',
    );
    expect(card).not.toBeNull();
    // windowExpiresAt seeded from state.ahaMomentActiveUntil.
    expect(card?.textContent ?? '').toContain('2026-05-15T00:00:00Z');
    // previewLlmTier seeded from state.effectiveLlmTier ('pro').
    expect(card?.querySelector('code')?.textContent ?? '').toContain('pro');
  });

  // ── Branch: windowConsumed() === true (state().ahaMomentConsumed truthy).
  // Neither auto-open branch fires; post-window narrative + consumed CTA
  // render; window-card is suppressed.
  it('renders the consumed (post-window) variant when ahaMomentConsumed is true', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushGrowthOnly(httpMock, EIRA_CONSUMED);
    s.fixture.detectChanges();
    expect(
      httpMock.match((r) => r.url.includes('/source-revelation')).length,
    ).toBe(0);
    const section = s.el.querySelector(
      '[data-testid="aplus-familiar-source-revelation"]',
    );
    // [attr.data-consumed] is bound to 'true' only when windowConsumed().
    expect(section?.getAttribute('data-consumed')).toBe('true');
    // Window-card is gated behind `!windowConsumed()` → absent.
    expect(
      s.el.querySelector('[data-testid="aplus-source-revelation-window-card"]'),
    ).toBeNull();
  });

  // ── Branch: currentStageLabel()/maturedStageLabel() `if (!s) return ''`
  // null-guard arm, AND windowConsumed()'s `state()?.…` optional-chain on a
  // null state. Before any flush the toSignal initialValue is null, so the
  // @else "Loading" branch renders and the computed labels short-circuit to ''.
  it('renders the loading state and empty labels before growth resolves', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    // State signal still at initialValue null — ceremony section absent.
    expect(
      s.el.querySelector('[data-testid="aplus-familiar-source-revelation"]'),
    ).toBeNull();
    expect(s.el.querySelector('.source-revelation__loading')).not.toBeNull();
    expect((s.el.textContent ?? '').toLowerCase()).toContain('loading');
    // Flush so afterEach verify() has no outstanding request.
    flushHappy(httpMock);
  });

  // ── Branch: `params.get('familiarId') ?? ''` nullish arm — route has no
  // familiarId param, so id collapses to ''. getGrowth('') is still issued
  // (the component does not guard the empty id) and the ceremony renders.
  it('falls back to empty id when the route has no familiarId param', () => {
    TestBed.configureTestingModule({
      imports: [FamiliarSourceRevelationComponent],
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
    const fixture = TestBed.createComponent(FamiliarSourceRevelationComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // The GET still fires with the empty-id path.
    const growthReqs = httpMock.match(
      (r) => r.url.includes('/growth') && !r.url.includes('-events'),
    );
    expect(growthReqs.length).toBe(1);
    growthReqs[0].flush(EIRA_STAGE1_DRAGON);
    for (const r of httpMock.match((r) => r.url.includes('/source-revelation'))) {
      r.flush(SOURCE_REVELATION_WINDOW);
    }
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(
      el.querySelector('[data-testid="aplus-familiar-source-revelation"]'),
    ).not.toBeNull();
  });
});
