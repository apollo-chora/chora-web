import { CPLUS_ADDON_CODE, CPLUS_NAV } from './cplus.nav';

describe('CPLUS_NAV', () => {
  it('exports a non-empty readonly array', () => {
    expect(Array.isArray(CPLUS_NAV)).toBe(true);
    expect(CPLUS_NAV.length).toBe(4);
  });

  it('every item has a labelKey, icon and a /c/* route', () => {
    for (const item of CPLUS_NAV) {
      expect(item.labelKey).toMatch(/^nav\.cplus\./);
      expect(item.icon.length).toBeGreaterThan(0);
      expect(item.route.startsWith('/c/')).toBe(true);
    }
  });

  // §4.7c (auth-hardening Phase A, CHO-1717): EVERY C+ nav link is gated
  // by the cplus_social add-on — the sidebar hides items whose addOn check
  // fails, matching the addOnGuard on the /c route mount.
  it('gates every entry behind the cplus_social add-on', () => {
    expect(CPLUS_ADDON_CODE).toBe('cplus_social');
    for (const item of CPLUS_NAV) {
      expect(item.addOn, item.route).toBe('cplus_social');
    }
  });

  it('includes the canonical C+ destinations', () => {
    const routes = CPLUS_NAV.map((n) => n.route);
    expect(routes).toContain('/c/feed');
    expect(routes).toContain('/c/duels');
    expect(routes).toContain('/c/interests');
    expect(routes).toContain('/c/connections');
  });

  it('has unique routes', () => {
    const routes = CPLUS_NAV.map((n) => n.route);
    expect(new Set(routes).size).toBe(routes.length);
  });
});
