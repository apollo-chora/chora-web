import { HPLUS_NAV } from './hplus.nav';

describe('HPLUS_NAV', () => {
  it('exports a non-empty readonly array', () => {
    expect(Array.isArray(HPLUS_NAV)).toBe(true);
    expect(HPLUS_NAV.length).toBeGreaterThanOrEqual(6);
  });

  it('every item has a labelKey, icon and route', () => {
    for (const item of HPLUS_NAV) {
      expect(item.labelKey).toMatch(/^hplus\.nav\./);
      expect(item.icon.length).toBeGreaterThan(0);
      // Routes are usually under /h/* (the H+ surface), but the
      // Setup Wizard is special: it lives under /admin/* alongside
      // the other tenant_admin-scoped routes per H+ → admin.
      expect(
        item.route.startsWith('/h/') ||
        item.route === '/admin/tenant/settings/wizard',
      ).toBe(true);
    }
  });

  it('includes the Setup Wizard entry, role-gated to platform_operator (§4.7d)', () => {
    // Auth-hardening Phase A (CHO-1717 / ADR-181 ruling #5): private
    // tenant creation is PLATFORM_OPERATOR-only — the nav entry hides for
    // everyone whose session JWT roles claim lacks platform_operator.
    const wizard = HPLUS_NAV.find((n) => n.route === '/admin/tenant/settings/wizard');
    expect(wizard).toBeDefined();
    expect(wizard?.labelKey).toBe('hplus.nav.setupWizard');
    expect(wizard?.role).toBe('platform_operator');
    // The old tenant:manage capability gate was too permissive — gone.
    expect(wizard?.capability).toBeUndefined();
  });

  it('includes the canonical H+ destinations', () => {
    const routes = HPLUS_NAV.map((n) => n.route);
    expect(routes).toContain('/h/tenant');
    expect(routes).toContain('/h/members');
    expect(routes).toContain('/h/addons');
    expect(routes).toContain('/h/marketplace');
    expect(routes).toContain('/h/billing');
    expect(routes).toContain('/h/branding');
    // Wave A3 — tenant-admin Transaction History (Payments)
    expect(routes).toContain('/h/transactions');
    // CHO-1709 WP-4 — tenant mana pool
    expect(routes).toContain('/h/mana');
  });

  it('exposes the transactions nav entry with the canonical labelKey', () => {
    const entry = HPLUS_NAV.find((n) => n.route === '/h/transactions');
    expect(entry).toBeDefined();
    expect(entry?.labelKey).toBe('hplus.nav.transactions');
  });

  it('exposes the mana-pool nav entry with the canonical labelKey', () => {
    const entry = HPLUS_NAV.find((n) => n.route === '/h/mana');
    expect(entry).toBeDefined();
    expect(entry?.labelKey).toBe('hplus.nav.mana');
    expect((entry?.icon ?? '').length).toBeGreaterThan(0);
  });

  it('has unique routes', () => {
    const routes = HPLUS_NAV.map((n) => n.route);
    expect(new Set(routes).size).toBe(routes.length);
  });
  it('exposes the ownership nav entry, unfiltered by role', () => {
    const entry = HPLUS_NAV.find((n) => n.route === '/h/ownership');
    expect(entry).toBeDefined();
    expect(entry?.labelKey).toBe('hplus.nav.ownership');
    // No `role`: a nominee is an ordinary member until they accept, so a role
    // filter here would hide the screen from the one person who has to use it.
    expect(entry?.role).toBeUndefined();
  });
});
