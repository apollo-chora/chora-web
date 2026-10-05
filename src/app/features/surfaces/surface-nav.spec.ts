import { describe, it, expect } from 'vitest';
import { resolveActiveSurface, SURFACE_NAV_CONFIGS } from './surface-nav';
import { ALL_SURFACE_KEYS } from './surface-access';

describe('resolveActiveSurface', () => {
  it('maps /a, /a/* to aplus', () => {
    expect(resolveActiveSurface('/a')).toBe('aplus');
    expect(resolveActiveSurface('/a/dashboard')).toBe('aplus');
  });

  it('maps /c, /c/* to cplus', () => {
    expect(resolveActiveSurface('/c')).toBe('cplus');
    expect(resolveActiveSurface('/c/feed')).toBe('cplus');
  });

  it('maps /h, /h/* to hplus', () => {
    expect(resolveActiveSurface('/h')).toBe('hplus');
    expect(resolveActiveSurface('/h/tenant')).toBe('hplus');
  });

  it('maps /o, /o/* to oplus', () => {
    expect(resolveActiveSurface('/o')).toBe('oplus');
    expect(resolveActiveSurface('/o/audit')).toBe('oplus');
  });

  it('maps /r, /r/* to rplus', () => {
    expect(resolveActiveSurface('/r')).toBe('rplus');
    expect(resolveActiveSurface('/r/classroom')).toBe('rplus');
  });

  // CHO-1405 Phase A — the Setup Wizard lives at /admin/tenant/settings/wizard
  // (and other tenant-admin destinations under /admin/*). Tenant administration
  // is an H+ surface concern, so the sidebar must render the H+ nav config when
  // the user is on an /admin/* route — not fall through to the A+ default.
  it('maps /admin, /admin/* to hplus (tenant admin lives in H+)', () => {
    expect(resolveActiveSurface('/admin')).toBe('hplus');
    expect(resolveActiveSurface('/admin/tenant/settings/wizard')).toBe('hplus');
    expect(resolveActiveSurface('/admin/users')).toBe('hplus');
  });

  it('falls back to aplus for unknown prefixes', () => {
    expect(resolveActiveSurface('/')).toBe('aplus');
    expect(resolveActiveSurface('/dashboard')).toBe('aplus');
    expect(resolveActiveSurface('/learning')).toBe('aplus');
    expect(resolveActiveSurface('/login')).toBe('aplus');
  });

  it('strips query and fragment before resolving', () => {
    expect(resolveActiveSurface('/h/tenant?foo=1')).toBe('hplus');
    expect(resolveActiveSurface('/admin/tenant#section')).toBe('hplus');
  });
});

/**
 * The registry is DELIBERATELY partial (C2 slice 3). A+ has no sidebar config
 * because A+ has no sidebar: the compass bar replaced it, and the shell renders
 * `<chora-sidebar>` only under `@if (!usesCompass())` while `usesCompass()` is
 * true for every A+-resolved URL. `APLUS_NAV` was therefore unreachable in the
 * running app from the moment the compass landed, and it was deleted rather
 * than left as a config nothing can render.
 *
 * These pin the absence itself. A future edit that "fixes" the Partial back to
 * a full Record has to delete a test that says why, rather than silently
 * reintroduce a nav for a surface that cannot show one.
 */
describe('SURFACE_NAV_CONFIGS - partial by design', () => {
  it('has NO A+ entry', () => {
    expect(SURFACE_NAV_CONFIGS.aplus).toBeUndefined();
    expect(Object.keys(SURFACE_NAV_CONFIGS)).not.toContain('aplus');
  });

  it('carries a non-empty config for every OTHER surface', () => {
    for (const key of ALL_SURFACE_KEYS) {
      if (key === 'aplus') continue;
      const items = SURFACE_NAV_CONFIGS[key];
      expect(items, `${key} has no nav config`).toBeDefined();
      expect(items!.length, `${key} has an empty nav config`).toBeGreaterThan(0);
    }
  });

  it('tolerates a lookup for a surface it does not carry', () => {
    // The consumer contract: an absent key reads as `undefined`, never throws,
    // and the sidebar turns it into an empty nav with `?? []`. Every A+-
    // resolved URL takes this path, including the legacy unprefixed ones.
    for (const url of ['/', '/a/knowledge', '/dashboard', '/login']) {
      const surface = resolveActiveSurface(url);
      expect(surface).toBe('aplus');
      expect(() => SURFACE_NAV_CONFIGS[surface]).not.toThrow();
      expect(SURFACE_NAV_CONFIGS[surface] ?? []).toEqual([]);
    }
  });
});
