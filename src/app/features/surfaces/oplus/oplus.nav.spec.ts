import { describe, it, expect } from 'vitest';
import { OPLUS_NAV } from './oplus.nav';

describe('OPLUS_NAV', () => {
  it('exports a non-empty NavItem array', () => {
    expect(Array.isArray(OPLUS_NAV)).toBe(true);
    expect(OPLUS_NAV.length).toBeGreaterThan(0);
  });

  it('every nav item has a labelKey, icon, and route', () => {
    for (const item of OPLUS_NAV) {
      expect(item.labelKey).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(item.route).toBeTruthy();
    }
  });

  it('every route is rooted under /o', () => {
    for (const item of OPLUS_NAV) {
      expect(item.route.startsWith('/o')).toBe(true);
    }
  });

  it('includes the dashboard, agents, governance, a2a-console entries', () => {
    const routes = OPLUS_NAV.map((i) => i.route);
    expect(routes).toContain('/o/dashboard');
    expect(routes).toContain('/o/agents');
    expect(routes).toContain('/o/governance');
    expect(routes).toContain('/o/a2a-console');
    expect(routes).toContain('/o/agent-eval');
  });

  it('no longer lists a standalone IMDA Dimensions entry (merged into the dashboard)', () => {
    const routes = OPLUS_NAV.map((i) => i.route);
    expect(routes).not.toContain('/o/dimensions');
  });

  it('nav item labels use translate keys (no plain English in nav config)', () => {
    for (const item of OPLUS_NAV) {
      // translate keys are dot-notation like 'nav.dashboard' — never raw words
      expect(item.labelKey).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    }
  });

  // Owner ruling 2026-07-27: the A2A Console is planned-but-unwired
  // (CHO-2358 - the external A2A edge has zero gateway instances, no DNS,
  // no LB host rule), so its entry sits LAST, disabled, with the
  // coming-soon note. Pins the ruling against reorder or re-enable.
  describe('A2A Console coming-soon ruling (CHO-2358)', () => {
    it('keeps the A2A Console entry last, disabled, with the coming-soon note key', () => {
      const last = OPLUS_NAV[OPLUS_NAV.length - 1];
      expect(last.route).toBe('/o/a2a-console');
      expect(last.disabled).toBe(true);
      expect(last.disabledNoteKey).toBe('nav.coming_soon');
    });

    it('leaves every other entry enabled', () => {
      for (const item of OPLUS_NAV.slice(0, -1)) {
        expect(item.disabled).toBeUndefined();
      }
    });
  });
});
