import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, type UrlTree } from '@angular/router';
import { featureReadyGuard } from './feature-ready.guard';
import { environment } from '../../../environments/environment';

/**
 * WS-10 (platform UX remediation) — `featureReadyGuard` is a STATIC build-config
 * gate: orphaned / i18n-empty / half-built top-level areas listed in
 * `environment.gatedAreas` must be NON-routable (fall through to /not-found)
 * until they are finished + translated. It is a CanMatch guard so the route
 * never matches and its lazy chunk is never loaded — deliberately distinct from
 * the entitlement-based `FeatureFlagService` (per-tenant add-ons), a different
 * concern. The Router is mocked here (the repo's functional-guard-spec idiom);
 * the contract under test is "gated → redirect to /not-found, ungated → true".
 */
describe('featureReadyGuard', () => {
  let parseUrl: Mock<(url: string) => UrlTree>;

  beforeEach(() => {
    // Echo the url back as the (fake) UrlTree so the test can assert the guard
    // returns the parseUrl REDIRECT rather than `true` (mirrors surface.guard
    // .spec casting commands → UrlTree).
    parseUrl = vi.fn<(url: string) => UrlTree>(
      (url: string) => url as unknown as UrlTree,
    );
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { parseUrl } }],
    });
  });

  // CanMatchFn is (route, segments) — the guard ignores both; segments is the
  // UrlSegment[] array. Run inside an injection context so `inject(Router)` resolves.
  function run(area: string): boolean | UrlTree {
    return TestBed.runInInjectionContext(
      () => featureReadyGuard(area)({} as never, []) as boolean | UrlTree,
    );
  }

  it('redirects a gated area to /not-found (UrlTree)', () => {
    // `gatedAreas` is the locked WS-10 list; assert it is non-empty, then drive
    // the gated branch with its first entry (decoupled from the exact ordering).
    expect(environment.gatedAreas.length).toBeGreaterThan(0);
    const gated = environment.gatedAreas[0];

    const result = run(gated);

    expect(parseUrl).toHaveBeenCalledWith('/not-found');
    expect(result).not.toBe(true);
    expect(result).toBe('/not-found' as unknown as UrlTree);
  });

  it('allows an ungated area (returns true, no redirect)', () => {
    const ungated = '__never_gated__';
    // Precondition: prove the sentinel is genuinely ungated so this can't false-pass.
    expect(environment.gatedAreas).not.toContain(ungated);

    const result = run(ungated);

    expect(result).toBe(true);
    expect(parseUrl).not.toHaveBeenCalled();
  });
});
