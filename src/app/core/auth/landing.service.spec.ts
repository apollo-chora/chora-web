import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { LandingService } from './landing.service';
import { FeatureFlagService } from '../services/feature-flag.service';
import { RbacService } from '../services/rbac.service';
import { TenantContextService, type TenantContext } from './tenant-context.service';

/**
 * The ONE post-login landing resolver (UX Track U, C2 slice 3, ADR-240).
 *
 * Seven sites used to hard-code where an authenticated session lands, five of
 * them on `/a/dashboard` and two on `/dashboard`. Each was a separate answer to
 * the same question, so a session holding no A+ membership was sent to a
 * surface its own route guard would bounce it off, and the never-strand door
 * ADR-240 D1 built at `/home` was reachable only by typing the URL.
 *
 * This resolves it once. The rule, per the orchestrator ruling of 2026-09-03:
 * a session holding A+ goes to `/a/home`; a session with no usable surface at
 * all goes to `/home`; anything between lands on the first surface it actually
 * holds AND can enter.
 */
function tenant(id: string, surfaces?: string[]): TenantContext {
  return { id, name: id, slug: id, logoUrl: null, surfaces };
}

describe('LandingService', () => {
  let isOperator: boolean;
  let entitlements: Set<string>;
  let active: TenantContext | null;
  let memberships: TenantContext[];

  beforeEach(() => {
    isOperator = false;
    entitlements = new Set<string>();
    active = null;
    memberships = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: FeatureFlagService,
          useValue: { isEnabled: (code: string) => entitlements.has(code) },
        },
        {
          provide: RbacService,
          useValue: {
            hasRole: (role: string) =>
              isOperator && role.trim().toLowerCase() === 'platform_operator',
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            currentTenant: () => active,
            availableTenants: () => memberships,
          },
        },
      ],
    });
  });

  function landing(): string {
    return TestBed.inject(LandingService).landingRoute();
  }

  // ── The A+ case: the overwhelming majority of sessions ──────────────────
  it('lands a session holding A+ on /a/home, NOT on /a/dashboard', () => {
    active = tenant('t1', ['aplus']);
    memberships = [active];
    expect(landing()).toBe('/a/home');
  });

  it('prefers A+ over every other surface the session also holds', () => {
    active = tenant('t1', ['rplus', 'hplus', 'aplus', 'oplus']);
    memberships = [active];
    expect(landing()).toBe('/a/home');
  });

  // ── The never-strand door (ADR-240 D1) ──────────────────────────────────
  it('lands a session with NO usable surface data on /home', () => {
    active = tenant('t1'); // bare-JWT seed: no surfaces[] anywhere
    memberships = [tenant('t1')];
    expect(landing()).toBe('/home');
  });

  it('lands a session with no tenant context at all on /home', () => {
    active = null;
    memberships = [];
    expect(landing()).toBe('/home');
  });

  it('lands on /home rather than a surface the session holds but cannot enter', () => {
    // C+ is membership-visible but the tenant is not entitled to cplus_social,
    // so `/c/feed` would be bounced straight back out by its own addOnGuard.
    // Landing there would be a redirect loop; `/home` is the honest answer.
    active = tenant('t1', ['cplus']);
    memberships = [active];
    expect(landing()).toBe('/home');
  });

  // ── Non-A+ sessions land on the surface they actually hold ──────────────
  it('lands an admin holding only H+ on the H+ landing', () => {
    active = tenant('t1', ['hplus']);
    memberships = [active];
    expect(landing()).toBe('/h/tenant');
  });

  it('lands an instructor holding only R+ on the R+ landing', () => {
    active = tenant('t1', ['rplus']);
    memberships = [active];
    expect(landing()).toBe('/r/offerings');
  });

  it('lands an auditor holding only O+ on the O+ landing', () => {
    active = tenant('t1', ['oplus']);
    memberships = [active];
    expect(landing()).toBe('/o/dashboard');
  });

  it('lands on C+ when the session holds it AND the tenant is entitled', () => {
    entitlements.add('cplus_social');
    active = tenant('t1', ['cplus']);
    memberships = [active];
    expect(landing()).toBe('/c/feed');
  });

  // ── Union path: no active context, several memberships ──────────────────
  it('uses the union of memberships when there is no active context', () => {
    active = null;
    memberships = [tenant('t1', ['rplus']), tenant('t2', ['aplus'])];
    expect(landing()).toBe('/a/home');
  });

  it('falls back to the membership surfaces[] when the active context carries none', () => {
    active = tenant('t1');
    memberships = [tenant('t1', ['hplus'])];
    expect(landing()).toBe('/h/tenant');
  });

  // ── Operator god-mode (ADR-165), mirroring surfaceGuard ─────────────────
  it('lands a platform_operator on /a/home even with NO surface metadata', () => {
    // The guard grants an operator every surface synchronously; the resolver
    // must agree, or the one principal that can reach everything would be the
    // one landing on the no-surface door.
    isOperator = true;
    active = null;
    memberships = [];
    expect(landing()).toBe('/a/home');
  });

  // ── Loop-safety: the answer is always somewhere the session can go ──────
  it('never returns a surface landing the session does not hold', () => {
    active = tenant('t1', ['oplus']);
    memberships = [active];
    const result = landing();
    expect(result).not.toContain('/a/');
    expect(result).not.toContain('/h/');
    expect(result).not.toContain('/r/');
    expect(result).toBe('/o/dashboard');
  });

  it('is a pure read: calling it twice with unchanged state gives the same answer', () => {
    active = tenant('t1', ['aplus']);
    memberships = [active];
    const service = TestBed.inject(LandingService);
    expect(service.landingRoute()).toBe(service.landingRoute());
  });
});
