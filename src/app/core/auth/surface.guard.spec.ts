import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, type UrlTree } from '@angular/router';
import { surfaceGuard } from './surface.guard';
import { FeatureFlagService } from '../services/feature-flag.service';
import { RbacService } from '../services/rbac.service';
import { TenantContextService, type TenantContext } from './tenant-context.service';
import type { SurfaceKey } from '../../features/surfaces/surface-landing.component';

/**
 * CHO-1801 — `surfaceGuard` closes the URL-bar bypass of role-driven surface
 * visibility: typing `/h/tenant` (etc.) must NOT render the H+/O+/R+ shell for
 * a user whose per-membership `surfaces[]` does not include that surface.
 *
 * The guard reuses the SAME membership-axis predicate the surface rail uses
 * (`resolveVisibleSurfaces`), plus the ADR-165 `platform_operator` god-mode
 * bypass — fail-CLOSED (owner ruling 2026-06-19) for the sensitive surfaces,
 * with an A+ baseline so a session lacking surface metadata is never bricked
 * at the `/a/dashboard` root redirect.
 */
function tenant(id: string, surfaces?: string[]): TenantContext {
  return { id, name: id, slug: id, logoUrl: null, surfaces };
}

describe('surfaceGuard', () => {
  let isOperator: boolean;
  let active: TenantContext | null;
  let memberships: TenantContext[];
  let createUrlTree: Mock<(commands: string[]) => UrlTree>;

  beforeEach(() => {
    isOperator = false;
    active = null;
    memberships = [];
    createUrlTree = vi.fn<(commands: string[]) => UrlTree>(
      (commands: string[]) => commands as unknown as UrlTree,
    );
    TestBed.configureTestingModule({
      providers: [
        FeatureFlagService,
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
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
  });

  function run(surface: SurfaceKey): boolean | UrlTree {
    return TestBed.runInInjectionContext(
      () => surfaceGuard(surface)({} as never, {} as never) as boolean | UrlTree,
    );
  }

  // ── Membership-axis allow ───────────────────────────────────────────────
  it('allows a surface the active membership surfaces[] includes', () => {
    active = tenant('t1', ['aplus', 'cplus']);
    memberships = [active];
    expect(run('aplus')).toBe(true);
    expect(createUrlTree).not.toHaveBeenCalled();
  });

  it('allows C+ on the membership axis (the add-on axis is a SEPARATE composed addOnGuard)', () => {
    active = tenant('t1', ['aplus', 'cplus']);
    memberships = [active];
    expect(run('cplus')).toBe(true);
  });

  // ── Fail-closed deny + safe redirect (THE finding) ──────────────────────
  it('denies H+ for an author+learner and redirects to their A+ home (the CHO-1801 bypass)', () => {
    active = tenant('t1', ['aplus', 'cplus']);
    memberships = [active];
    const result = run('hplus');
    expect(result).not.toBe(true);
    expect(createUrlTree).toHaveBeenCalledWith(['/a/home']);
  });

  it('denies O+ and R+ for the same author+learner', () => {
    active = tenant('t1', ['aplus', 'cplus']);
    memberships = [active];
    expect(run('oplus')).not.toBe(true);
    expect(run('rplus')).not.toBe(true);
  });

  it('redirects an admin (surfaces=[hplus]) away from A+ to their H+ home', () => {
    active = tenant('t1', ['hplus']);
    memberships = [active];
    expect(run('aplus')).not.toBe(true);
    expect(createUrlTree).toHaveBeenCalledWith(['/h/tenant']);
    expect(run('hplus')).toBe(true);
  });

  // ── Operator god-mode (ADR-165 — must NOT regress) ──────────────────────
  it('allows a platform_operator onto EVERY surface regardless of membership surfaces[]', () => {
    isOperator = true;
    active = tenant('t1', ['hplus']); // narrow membership
    memberships = [active];
    for (const key of ['aplus', 'cplus', 'hplus', 'oplus', 'rplus'] as const) {
      expect(run(key), key).toBe(true);
    }
    expect(createUrlTree).not.toHaveBeenCalled();
  });

  it('allows an operator even when surface data is entirely absent', () => {
    isOperator = true;
    active = null;
    memberships = [];
    expect(run('oplus')).toBe(true);
  });

  // ── A+ baseline (never brick the /a/dashboard root redirect) ────────────
  it('A+ baseline: a session with NO surface metadata can still reach A+', () => {
    active = tenant('t1'); // no surfaces, bare-JWT-style seed
    memberships = [tenant('t1')];
    expect(run('aplus')).toBe(true);
  });

  it('A+ baseline does NOT leak the sensitive surfaces — H+/O+/R+ stay denied with no surface data', () => {
    active = tenant('t1');
    memberships = [tenant('t1')];
    for (const key of ['hplus', 'oplus', 'rplus'] as const) {
      const result = run(key);
      expect(result, key).not.toBe(true);
    }
    // each denied surface redirects to the A+ baseline home
    expect(createUrlTree).toHaveBeenCalledWith(['/a/home']);
  });

  // ── Union path (no active context) ──────────────────────────────────────
  it('uses the union of memberships when there is no active context', () => {
    active = null;
    memberships = [tenant('t1', ['rplus']), tenant('t2', ['aplus'])];
    expect(run('rplus')).toBe(true);
    expect(run('aplus')).toBe(true);
    expect(run('hplus')).not.toBe(true);
  });

  // ── /unauthorized terminal (no reachable surface) ───────────────────────
  it('redirects to /unauthorized when the only visible surface is unreachable (C+ held but not entitled, denied elsewhere)', () => {
    // surfaces=[cplus] but no cplus_social entitlement and not operator → the
    // user holds NO surface they can actually enter, so a denied navigation
    // has nowhere safe to land but /unauthorized.
    active = tenant('t1', ['cplus']);
    memberships = [active];
    const result = run('hplus');
    expect(result).not.toBe(true);
    expect(createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });
});
