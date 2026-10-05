import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, NavigationEnd, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { SidebarComponent } from './sidebar.component';
import { FeatureFlagService } from '../../../core/services/feature-flag.service';
import { SURFACE_NAV_CONFIGS, type NavItem } from '../../../features/surfaces/surface-nav';

/** Drive the sidebar's URL-derived state by replacing router.url + emitting a NavigationEnd. */
function mockNavigateTo(router: Router, events$: Subject<unknown>, url: string): void {
  vi.spyOn(router, 'url', 'get').mockReturnValue(url);
  events$.next(new NavigationEnd(1, url, url));
}

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;
  let component: SidebarComponent;
  let element: HTMLElement;
  let flagService: FeatureFlagService;
  let router: Router;
  let routerEvents$: Subject<unknown>;

  beforeEach(async () => {
    routerEvents$ = new Subject<unknown>();

    await TestBed.configureTestingModule({
      imports: [SidebarComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    flagService = TestBed.inject(FeatureFlagService);
    router = TestBed.inject(Router);
    // Replace router.events with a controllable subject so tests can fire NavigationEnd at will.
    // MUST happen before component construction so the subscription wires up to our subject.
    Object.defineProperty(router, 'events', { value: routerEvents$.asObservable(), configurable: true });

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  /**
   * Put the fixture on a surface that still HAS a sidebar.
   *
   * The default fixture URL is `/` which `resolveActiveSurface` maps to
   * 'aplus', and since C2 slice 1 A+ has no sidebar at all: the shell renders
   * `<chora-sidebar>` only under `@if (!usesCompass())` and `usesCompass()` is
   * true for every A+-resolved URL. So the A+ default rendered a nav this
   * component can never be asked for in the running app, and slice 3 removed
   * the config behind it.
   *
   * O+ is the replacement subject rather than R+ because, like the old A+, its
   * items carry no `group`, so the flat-render assertions still mean what they
   * meant. Its one `disabled` entry (the A2A console) renders as a span, which
   * is why the tests below that care about links select `a.chora-sidebar__item`
   * rather than every item.
   */
  function renderWithSidebar(): void {
    mockNavigateTo(router, routerEvents$, '/o');
    fixture.detectChanges();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('activeSurface (signal)', () => {
    it('defaults to aplus on unprefixed legacy URL', () => {
      expect(component.activeSurface()).toBe('aplus');
    });

    it('reads cplus from /c URL', () => {
      mockNavigateTo(router, routerEvents$, '/c/feed');
      fixture.detectChanges();
      expect(component.activeSurface()).toBe('cplus');
    });

    it('reads hplus from /h URL', () => {
      mockNavigateTo(router, routerEvents$, '/h');
      fixture.detectChanges();
      expect(component.activeSurface()).toBe('hplus');
    });

    it('reads oplus from /o URL', () => {
      mockNavigateTo(router, routerEvents$, '/o/governance');
      fixture.detectChanges();
      expect(component.activeSurface()).toBe('oplus');
    });

    it('reads rplus from /r URL', () => {
      mockNavigateTo(router, routerEvents$, '/r/classroom');
      fixture.detectChanges();
      expect(component.activeSurface()).toBe('rplus');
    });
  });

  describe('navItems - A+ has no sidebar config (C2 slice 3)', () => {
    // `APLUS_NAV` and this block's twelve assertions were deleted together.
    //
    // They tested a configuration the shell can no longer produce. The compass
    // bar replaced the A+ sidebar in C2 slice 1, and from that moment
    // `main-layout.component.html` rendered `<chora-sidebar>` only under
    // `@if (!usesCompass())` while `usesCompass()` is true for every URL that
    // resolves to A+, the legacy unprefixed ones included. `APLUS_NAV` was
    // therefore unreachable in the running app, and a green test over
    // unreachable code is worse than no test: it reports on a screen nobody
    // can open.
    //
    // The six owner rulings those assertions carried (no Study, Transcript,
    // Companion, Map, Discovery or Choraverse door in the A+ shell chrome, and
    // Studio gated on `assessment:author`) are NOT lost: they moved to
    // `shared/components/compass/compass.config.spec.ts`, restated against the
    // navigation that actually renders, each with the ruling that made it.
    it('yields NO nav items for A+, because A+ has no sidebar', () => {
      // The default fixture URL resolves to 'aplus'.
      expect(component.activeSurface()).toBe('aplus');
      expect(component.navItems()).toEqual([]);
    });

    it('renders an empty rail rather than throwing on the absent key', () => {
      // `SURFACE_NAV_CONFIGS` is deliberately Partial. The point of the `?? []`
      // is that a missing key degrades to an empty nav; without it this render
      // throws on `undefined.filter` and takes the whole shell with it.
      expect(element.querySelectorAll('.chora-sidebar__item').length).toBe(0);
      expect(element.querySelector('[role="navigation"]')).toBeTruthy();
    });

    it('still carries configs for the four surfaces that DO have a sidebar', () => {
      expect(Object.keys(SURFACE_NAV_CONFIGS).sort()).toEqual([
        'cplus',
        'hplus',
        'oplus',
        'rplus',
      ]);
      for (const [surface, items] of Object.entries(SURFACE_NAV_CONFIGS)) {
        expect(items.length, `${surface} has an empty nav config`).toBeGreaterThan(0);
      }
    });
  });

  describe('per-surface nav switching (Stage 3 wave 1 — all 5 surfaces populated)', () => {
    it('returns populated C+ nav (Stage 3 wave 1 — A-FE-CPlus agent)', () => {
      mockNavigateTo(router, routerEvents$, '/c');
      fixture.detectChanges();
      const items = component.navItems();
      expect(items.length).toBeGreaterThan(0);
      expect(items.map((i) => i.route)).toContain('/c/feed');
      for (const item of items) {
        expect(item.route.startsWith('/c/')).toBe(true);
      }
    });

    it('returns populated H+ nav (Stage 3 wave 1 — A-FE-HPlus agent)', () => {
      mockNavigateTo(router, routerEvents$, '/h');
      fixture.detectChanges();
      const items = component.navItems();
      expect(items.length).toBeGreaterThanOrEqual(6);
      expect(items.map((i) => i.route)).toContain('/h/tenant');
      for (const item of items) {
        // Phase A.5 — H+ nav also surfaces the Setup Wizard which
        // lives under /admin/* (RBAC-gated). Allow that one route.
        expect(
          item.route.startsWith('/h/') ||
          item.route === '/admin/tenant/settings/wizard',
        ).toBe(true);
      }
    });

    it('returns populated O+ nav (Stage 3 wave 1 — A-FE-OPlus agent)', () => {
      mockNavigateTo(router, routerEvents$, '/o');
      fixture.detectChanges();
      const items = component.navItems();
      expect(items.length).toBeGreaterThan(0);
      expect(items.map((i) => i.route)).toContain('/o/dashboard');
      for (const item of items) {
        expect(item.route.startsWith('/o/')).toBe(true);
      }
    });

    it('returns populated R+ nav (Stage 3 wave 1 — A-FE-RPlus agent) including Phase X assessments', () => {
      mockNavigateTo(router, routerEvents$, '/r');
      fixture.detectChanges();
      const items = component.navItems();
      expect(items.length).toBeGreaterThan(0);
      expect(items.map((i) => i.route)).toContain('/r/offerings');
      expect(items.map((i) => i.route)).not.toContain('/r/roster');
      // Phase X (ADR-155) — instructor-side assessments list entry.
      expect(items.map((i) => i.route)).toContain('/r/assessments');
      const assessments = items.find((i) => i.route === '/r/assessments');
      expect(assessments?.labelKey).toBe('rplus.nav.assessments');
      expect(assessments?.icon).toBe('clipboard-check');
      for (const item of items) {
        expect(item.route.startsWith('/r/')).toBe(true);
      }
    });
  });

  describe('isVisible — capability gate (Phase A.5)', () => {
    it('hides items whose `capability` the user does NOT have', () => {
      const rbac = (component as unknown as {
        rbac: { hasCapability: (c: string) => boolean };
      }).rbac;
      vi.spyOn(rbac, 'hasCapability').mockReturnValue(false);
      const item: NavItem = {
        labelKey: 'hplus.nav.setupWizard',
        icon: 'wand-magic-sparkles',
        route: '/admin/tenant/settings/wizard',
        capability: 'tenant:manage',
      };
      expect(component.isVisible(item)).toBe(false);
    });

    it('shows items whose `capability` the user DOES have', () => {
      const rbac = (component as unknown as {
        rbac: { hasCapability: (c: string) => boolean };
      }).rbac;
      vi.spyOn(rbac, 'hasCapability').mockReturnValue(true);
      const item: NavItem = {
        labelKey: 'hplus.nav.setupWizard',
        icon: 'wand-magic-sparkles',
        route: '/admin/tenant/settings/wizard',
        capability: 'tenant:manage',
      };
      expect(component.isVisible(item)).toBe(true);
    });
  });

  describe('isVisible — role gate (§4.7d auth-hardening, CHO-1717)', () => {
    it('hides items whose `role` the session does NOT include', () => {
      const rbac = (component as unknown as {
        rbac: { hasRole: (r: string) => boolean };
      }).rbac;
      vi.spyOn(rbac, 'hasRole').mockReturnValue(false);
      const item: NavItem = {
        labelKey: 'hplus.nav.setupWizard',
        icon: 'wand-magic-sparkles',
        route: '/admin/tenant/settings/wizard',
        role: 'platform_operator',
      };
      expect(component.isVisible(item)).toBe(false);
    });

    it('shows items whose `role` the session includes', () => {
      const rbac = (component as unknown as {
        rbac: { hasRole: (r: string) => boolean };
      }).rbac;
      const spy = vi.spyOn(rbac, 'hasRole').mockReturnValue(true);
      const item: NavItem = {
        labelKey: 'hplus.nav.setupWizard',
        icon: 'wand-magic-sparkles',
        route: '/admin/tenant/settings/wizard',
        role: 'platform_operator',
      };
      expect(component.isVisible(item)).toBe(true);
      expect(spy).toHaveBeenCalledWith('platform_operator');
    });
  });

  describe('C+ nav gating (§4.7c cplus_social)', () => {
    it('hides every C+ nav link without the cplus_social add-on', () => {
      mockNavigateTo(router, routerEvents$, '/c/feed');
      fixture.detectChanges();
      const links = element.querySelectorAll('.chora-sidebar__item');
      expect(links.length).toBe(0);
    });

    it('shows the C+ nav links when an ACTIVE entitlement carries addon_code cplus_social', () => {
      // Proves the entitlement → isEnabled bridge end-to-end through the
      // sidebar (no legacy setFlags involved).
      flagService.setEntitlements([
        {
          id: 'a7e00006-0000-7000-8000-000000000006',
          tenant_id: '11111111-1111-7111-8111-111111111111',
          addon_id: 'a7d00006-0000-7000-8000-000000000006',
          addon_code: 'cplus_social',
          status: 'active',
          monthly_price_cents_snapshot: 0,
          activated_at: '2026-06-10T00:00:00Z',
          updated_at: '2026-06-10T00:00:00Z',
        },
      ]);
      mockNavigateTo(router, routerEvents$, '/c/feed');
      fixture.detectChanges();
      const ids = Array.from(element.querySelectorAll('.chora-sidebar__item')).map(
        (a) => a.getAttribute('data-testid'),
      );
      // DERIVE from CPLUS_NAV; never match a remembered total. The literal 7
      // predated the C+ nav shrink and had been red on main ever since. Every
      // C+ entry carries the same cplus_social gate, so a granted entitlement
      // renders all of them.
      expect(ids.length).toBe((SURFACE_NAV_CONFIGS.cplus ?? []).length);
      expect(ids).toContain('nav-c/feed');
    });
  });

  describe('isVisible', () => {
    it('should show items without addOn requirement', () => {
      const item: NavItem = { labelKey: 'nav.dashboard', icon: 'grid', route: '/dashboard' };
      expect(component.isVisible(item)).toBe(true);
    });

    it('should hide items when add-on flag is disabled', () => {
      flagService.setFlags({});
      const item: NavItem = {
        labelKey: 'nav.familiar',
        icon: 'pet',
        route: '/choraverse',
        addOn: 'choraverse',
      };
      expect(component.isVisible(item)).toBe(false);
    });

    it('should show items when add-on flag is enabled', () => {
      flagService.setFlags({ choraverse: true });
      const item: NavItem = {
        labelKey: 'nav.familiar',
        icon: 'pet',
        route: '/choraverse',
        addOn: 'choraverse',
      };
      expect(component.isVisible(item)).toBe(true);
    });

    it('shows an ungated entry without any add-on flag', () => {
      // A synthetic item, not a real config entry: `isVisible` is the unit
      // under test. It used to borrow the A+ "My Knowledge" label key, which
      // left en.json with `APLUS_NAV` in C2 slice 3, so a fixture keyed on it
      // would have quietly named a key that no longer exists.
      const item: NavItem = {
        labelKey: 'nav.oplus_dashboard',
        icon: 'map',
        route: '/o/dashboard',
      };
      expect(component.isVisible(item)).toBe(true);
    });
  });

  describe('rendering', () => {
    // Re-based on O+ in C2 slice 3: the old default subject was A+, which no
    // longer has a sidebar config at all. See `renderWithSidebar`.
    beforeEach(renderWithSidebar);

    it('renders every ungated item of the active surface', () => {
      // DERIVE from the config; never match a remembered total. The A+ version
      // of this test carried a literal that moved four times, and twice went
      // stale silently because two edits cancelled.
      const expected = (SURFACE_NAV_CONFIGS.oplus ?? []).filter(
        (i) => !i.capability && !i.addOn && !i.role,
      );
      const links = element.querySelectorAll('.chora-sidebar__item');
      expect(links.length).toBe(expected.length);
      expect(links.length).toBeGreaterThan(0);
    });

    it('is inert to an unrelated add-on flag (no O+ entry carries an addOn)', () => {
      const before = element.querySelectorAll('.chora-sidebar__item').length;
      flagService.setFlags({ choraverse: true });
      fixture.detectChanges();
      expect(element.querySelectorAll('.chora-sidebar__item').length).toBe(before);
      // The property behind the count: enabling a flag can only matter to an
      // entry that declares it.
      expect((SURFACE_NAV_CONFIGS.oplus ?? []).filter((i) => i.addOn)).toEqual([]);
    });

    it('renders the ungated entries and nothing the config does not declare', () => {
      const routes = Array.from(element.querySelectorAll('.chora-sidebar__item')).map(
        (a) => a.getAttribute('data-testid'),
      );
      // testid template is 'nav-' + route.substring(1).
      const expected = (SURFACE_NAV_CONFIGS.oplus ?? [])
        .filter((i) => !i.capability && !i.addOn && !i.role)
        .map((i) => `nav-${i.route.substring(1)}`);
      expect(routes).toEqual(expected);
      expect(routes).toContain('nav-o/governance');
      expect(routes).not.toContain('nav-choraverse');
    });

    it('should have accessible navigation landmark', () => {
      const nav = element.querySelector('[role="navigation"]');
      expect(nav).toBeTruthy();
      expect(nav?.getAttribute('aria-label')).toBe('Main Navigation');
    });

    it('should use data-testid attributes on nav items', () => {
      const dashboardLink = element.querySelector('[data-testid="nav-o/dashboard"]');
      expect(dashboardLink).toBeTruthy();
    });
  });

  // ── R1 (CHO-2243): R+ nav bands ──────────────────────────────────────────
  // R+ groups its items under uppercase band headers; the ADMIN band folds.
  // The flat surfaces (A+/C+/H+/O+) carry no group and render no band header.
  describe('R+ nav bands (CHO-2243)', () => {
    const rbacGrantAll = () => {
      const rbac = (component as unknown as {
        rbac: { hasCapability: (c: string) => boolean; hasRole: (r: string) => boolean };
      }).rbac;
      vi.spyOn(rbac, 'hasCapability').mockReturnValue(true);
      vi.spyOn(rbac, 'hasRole').mockReturnValue(true);
    };

    const goRplus = () => {
      rbacGrantAll();
      mockNavigateTo(router, routerEvents$, '/r/offerings');
      fixture.detectChanges();
    };

    it('renders all 6 band headers in canonical order for an all-capability R+ session', () => {
      goRplus();
      const headers = Array.from(
        element.querySelectorAll('.chora-sidebar__band-label'),
      ).map((s) => s.textContent?.trim());
      // Translate pipe passes keys through in the test harness.
      expect(headers).toEqual([
        'rplus.nav.band.deliver',
        'rplus.nav.band.schedule',
        'rplus.nav.band.live',
        'rplus.nav.band.assess',
        'rplus.nav.band.records',
        'rplus.nav.band.admin',
      ]);
    });

    it('places every R+ item inside a band (all 14 under headers, none flat)', () => {
      // R2a (CHO-2248) removed the 2 authoring tools (18→16); R2b (CHO-2250)
      // demoted Course Review to a per-course action (16→15); R4 (CHO-2269)
      // absorbed Rostering into the Offerings landing header (15→14).
      goRplus();
      // R4 (CHO-2269): ADMIN now starts folded, so open it before counting.
      // This test is about BAND MEMBERSHIP (no item escapes a band), not about
      // what a shut door happens to be showing. The default-shut behaviour is
      // pinned by its own test above.
      component.toggleBand('admin');
      fixture.detectChanges();
      const bandItems = element.querySelectorAll(
        '.chora-sidebar__band .chora-sidebar__item',
      );
      expect(bandItems.length).toBe(14);
      // No R+ item renders outside a band (no flat/ungrouped leak).
      const flatItems = Array.from(element.querySelectorAll('.chora-sidebar > .chora-sidebar__item'));
      expect(flatItems.length).toBe(0);
    });

    it('makes ONLY the ADMIN band header a toggle button (others are static text)', () => {
      goRplus();
      const toggles = element.querySelectorAll('button.chora-sidebar__band-header');
      expect(toggles.length).toBe(1);
      expect(toggles[0].getAttribute('data-testid')).toBe('band-toggle-admin');
      // R4 (CHO-2269): the door starts SHUT, so it advertises aria-expanded=false.
      expect(toggles[0].getAttribute('aria-expanded')).toBe('false');
    });

    // ── R4 (CHO-2269): the admin tail sits behind ONE Admin door ────────────
    // R1 shipped the band collapsible but defaulted every band to EXPANDED, so
    // the 7-item training-admin tail was fully visible on every load and the
    // "collapse the admin tail behind one Admin door" intent was never met.
    // The band meta now carries the default, so ADMIN (and only ADMIN) starts
    // folded. This is the whole Admin-door consolidation: no /r/admin index
    // route is built, because it would duplicate these same links behind an
    // extra hop and add a newly-guarded route to the ADR-239 proctor seam.
    it('starts the ADMIN band collapsed on a fresh load (the one Admin door)', () => {
      goRplus();
      expect(component.isBandCollapsed('admin')).toBe(true);
      const adminItems = element.querySelectorAll(
        '[data-testid="band-admin"] .chora-sidebar__item',
      );
      expect(adminItems.length).toBe(0);
      // The door itself is still there: the band header renders so the tail is
      // reachable in one click (folded away, never removed).
      expect(element.querySelector('[data-testid="band-toggle-admin"]')).toBeTruthy();
    });

    it('leaves every lifecycle band expanded on a fresh load (only ADMIN folds)', () => {
      goRplus();
      for (const band of ['deliver', 'schedule', 'live', 'assess', 'records']) {
        expect(component.isBandCollapsed(band), `${band} must start expanded`).toBe(false);
        expect(
          element.querySelectorAll(`[data-testid="band-${band}"] .chora-sidebar__item`).length,
          `${band} must render its items`,
        ).toBeGreaterThan(0);
      }
    });

    it('opens the ADMIN door when its toggle is activated, and re-folds it', () => {
      goRplus();
      const adminItemsPresent = () =>
        element.querySelectorAll('[data-testid="band-admin"] .chora-sidebar__item').length;
      // Starts shut (R4 default).
      expect(adminItemsPresent()).toBe(0);

      component.toggleBand('admin');
      fixture.detectChanges();
      const toggle = element.querySelector('button.chora-sidebar__band-header');
      expect(toggle?.getAttribute('aria-expanded')).toBe('true');
      // ADMIN carries 7 items (6 durable doors + Bookings, parked until R2).
      expect(adminItemsPresent()).toBe(7);

      component.toggleBand('admin');
      fixture.detectChanges();
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
      expect(adminItemsPresent()).toBe(0);
    });

    it('exposes aria-controls on the ADMIN toggle pointing at its items container', () => {
      goRplus();
      // R4: the door starts shut and the items container is removed from the
      // DOM, so open it first, since aria-controls may only name an element that
      // exists.
      component.toggleBand('admin');
      fixture.detectChanges();
      const toggle = element.querySelector('button.chora-sidebar__band-header');
      const controls = toggle?.getAttribute('aria-controls');
      expect(controls).toBe('band-items-admin');
      expect(element.querySelector(`#${controls}`)).toBeTruthy();
    });

    it('drops aria-controls while collapsed (never a dangling IDREF)', () => {
      // The collapsed band's items container is @if-ed out of the DOM. An
      // aria-controls pointing at a now-absent id is an invalid IDREF (axe
      // aria-valid-attr-value); the attribute must disappear with its target.
      // aria-expanded carries the state on its own, which is what the ARIA
      // disclosure pattern requires.
      goRplus();
      const toggle = element.querySelector('button.chora-sidebar__band-header');
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
      expect(toggle?.hasAttribute('aria-controls')).toBe(false);
      expect(element.querySelector('#band-items-admin')).toBeNull();
    });

    it('hides a band whose every item fails the capability gate (proctor-like session)', () => {
      // Grant nothing: only /r/exams (ungated) survives, so ONLY the ASSESS
      // band renders. All other bands are empty and render no header.
      const rbac = (component as unknown as {
        rbac: { hasCapability: (c: string) => boolean; hasRole: (r: string) => boolean };
      }).rbac;
      vi.spyOn(rbac, 'hasCapability').mockReturnValue(false);
      vi.spyOn(rbac, 'hasRole').mockReturnValue(false);
      mockNavigateTo(router, routerEvents$, '/r/exams');
      fixture.detectChanges();

      const headers = Array.from(
        element.querySelectorAll('.chora-sidebar__band-label'),
      ).map((s) => s.textContent?.trim());
      expect(headers).toEqual(['rplus.nav.band.assess']);
      const items = element.querySelectorAll('.chora-sidebar__item');
      expect(items.length).toBe(1);
      expect(items[0].getAttribute('data-testid')).toBe('nav-r/exams');
    });

    it('renders NO band header on the flat surfaces (O+ items carry no group)', () => {
      // Was written against the A+ default, which no longer renders a sidebar.
      // O+ is the same shape: no item carries a `group`.
      renderWithSidebar();
      expect((SURFACE_NAV_CONFIGS.oplus ?? []).filter((i) => i.group)).toEqual([]);
      const headers = element.querySelectorAll('.chora-sidebar__band-header');
      expect(headers.length).toBe(0);
      // Yet the items still render (flat, ungrouped).
      expect(element.querySelectorAll('.chora-sidebar__item').length).toBeGreaterThan(0);
    });
  });

  describe('collapsed / hover-expand', () => {
    it('renders label spans when expanded (collapsed = false)', () => {
      fixture.componentRef.setInput('collapsed', false);
      fixture.detectChanges();
      const labels = element.querySelectorAll('.chora-sidebar__label');
      expect(labels.length).toBe(element.querySelectorAll('.chora-sidebar__item').length);
    });

    it('keeps label spans in the DOM when collapsed (hidden via CSS, not unmounted)', () => {
      // Regression: the template used to `@if (!collapsed())` the label
      // span, so a collapsed sidebar rendered icons with no words at all.
      // Labels must stay in the DOM — the collapsed/hover-expand state is
      // a CSS concern (opacity/width), so words reappear on hover.
      renderWithSidebar();
      fixture.componentRef.setInput('collapsed', true);
      fixture.detectChanges();
      const labels = element.querySelectorAll('.chora-sidebar__label');
      expect(labels.length).toBe(element.querySelectorAll('.chora-sidebar__item').length);
      expect(labels.length).toBeGreaterThan(0);
    });

    it('applies the sidebar--collapsed class when collapsed', () => {
      fixture.componentRef.setInput('collapsed', true);
      fixture.detectChanges();
      const nav = element.querySelector('.chora-sidebar');
      expect(nav?.classList.contains('chora-sidebar--collapsed')).toBe(true);
    });
  });

  describe('icons', () => {
    it('renders each nav item with a FontAwesome <i> glyph (not an empty span)', () => {
      const icons = element.querySelectorAll('i.chora-sidebar__icon');
      expect(icons.length).toBe(element.querySelectorAll('.chora-sidebar__item').length);
      for (const icon of Array.from(icons)) {
        // Real glyph: carries the FA family + a `fa-` icon class.
        expect(icon.classList.contains('fa-solid')).toBe(true);
        expect(
          Array.from(icon.classList).some((c) => c.startsWith('fa-') && c !== 'fa-solid'),
        ).toBe(true);
      }
    });

    it('iconClass maps known semantic names to FontAwesome classes', () => {
      expect(component.iconClass('grid')).toBe('fa-solid fa-table-cells-large');
      expect(component.iconClass('compass')).toBe('fa-solid fa-compass');
      expect(component.iconClass('paw')).toBe('fa-solid fa-paw');
    });

    it('iconClass falls back to a neutral glyph for an unmapped name', () => {
      expect(component.iconClass('definitely-not-an-icon')).toBe('fa-solid fa-circle-dot');
    });

    it('maps every icon used by all 5 surface nav configs — none fall back', () => {
      // Guard: a nav config that introduces a semantic icon name absent from
      // ICON_CLASS silently renders the neutral fallback (fa-circle-dot), so a
      // collapsed icon-only sidebar shows undifferentiated dots. This caught 8
      // R+ items (calendar-check / certificate / building / briefcase / inbox /
      // people-group / shield-halved / clipboard-question). Iterate every
      // surface so a future config regresses HERE, not in the live sidebar.
      const offenders: string[] = [];
      for (const [surface, items] of Object.entries(SURFACE_NAV_CONFIGS)) {
        for (const item of items as readonly NavItem[]) {
          if (component.iconClass(item.icon) === 'fa-solid fa-circle-dot') {
            offenders.push(`${surface}:${item.icon}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  // Axe-core regression (axe 4.10.2 scan of /a/atoms/new, 2026-05-17).
  // The active sidebar label `--chora-color-primary` (#1976d2) on the
  // active background `rgba(25,118,210,0.08)` (~#edf4fb over white) was
  // 4.14:1 (under WCAG AA 4.5:1 for normal text). Fix: introduce a
  // dedicated `--chora-color-primary-strong` token (#0d47a1) and bind
  // the active-state foreground to it (~7.35:1 on the same bg). We
  // assert the class hook + the new CSS custom property is wired so a
  // future refactor doesn't silently regress the contrast budget.
  describe('a11y regressions (axe 2026-05-17 /a/atoms/new scan)', () => {
    it('exposes the chora-sidebar__item--active class hook on routerLinkActive', () => {
      renderWithSidebar();
      // ANCHORS only. O+ carries one `disabled` entry (the A2A console) which
      // renders as a non-navigable span with no routerLinkActive to bind, and
      // that is the ruled behaviour, not a gap. The A+ fixture this replaced
      // had no disabled entry, so the distinction never came up.
      const items = element.querySelectorAll('a.chora-sidebar__item');
      expect(items.length).toBeGreaterThan(0);
      for (const item of Array.from(items)) {
        expect(item.getAttribute('routerlinkactive')?.trim()).toBe(
          'chora-sidebar__item--active',
        );
      }
    });
  });

  describe('navTick re-computation across navigations', () => {
    it('re-derives activeSurface on each NavigationEnd (recompute is not stuck)', () => {
      // First navigate to R+, then to O+ — activeSurface must track the
      // latest URL, proving navTick invalidates the computed each time.
      mockNavigateTo(router, routerEvents$, '/r/offerings');
      fixture.detectChanges();
      expect(component.activeSurface()).toBe('rplus');

      mockNavigateTo(router, routerEvents$, '/o/dashboard');
      fixture.detectChanges();
      expect(component.activeSurface()).toBe('oplus');

      // And back to the legacy default.
      mockNavigateTo(router, routerEvents$, '/dashboard');
      fixture.detectChanges();
      expect(component.activeSurface()).toBe('aplus');
    });

    it('swaps the rendered nav item set when the surface changes', () => {
      // §4.7c: every C+ nav link is add-on-gated — enable cplus_social so
      // the rendered swap is observable.
      flagService.setFlags({ cplus_social: true });
      mockNavigateTo(router, routerEvents$, '/c/feed');
      fixture.detectChanges();
      const cRoutes = Array.from(element.querySelectorAll('.chora-sidebar__item')).map((a) =>
        a.getAttribute('data-testid'),
      );
      expect(cRoutes.some((t) => t?.startsWith('nav-c/'))).toBe(true);
      expect(cRoutes.some((t) => t?.startsWith('nav-a/'))).toBe(false);
    });

    it('ignores non-NavigationEnd router events (no spurious recompute)', () => {
      // Emit a plain object that is NOT a NavigationEnd — the filter must
      // drop it, leaving activeSurface on the legacy default.
      vi.spyOn(router, 'url', 'get').mockReturnValue('/h/tenant');
      routerEvents$.next({ id: 99, url: '/h/tenant' });
      fixture.detectChanges();
      // navTick never bumped, so the computed still reflects the initial
      // (un-mocked) router.url default of 'aplus'.
      expect(component.activeSurface()).toBe('aplus');
    });
  });

  describe('collapsed input default', () => {
    it('defaults collapsed to false and omits the collapsed modifier class', () => {
      expect(component.collapsed()).toBe(false);
      const nav = element.querySelector('.chora-sidebar');
      expect(nav?.classList.contains('chora-sidebar--collapsed')).toBe(false);
    });
  });

  describe('rendered labels + aria + testid templating', () => {
    // Re-based on O+ in C2 slice 3 with the rest of the render tests.
    beforeEach(renderWithSidebar);

    it('renders the raw i18n key as the label text (translate pipe pass-through in tests)', () => {
      const labels = Array.from(element.querySelectorAll('.chora-sidebar__label')).map((s) =>
        s.textContent?.trim(),
      );
      // The translate pipe returns the key unchanged in the test harness.
      expect(labels).toContain('nav.oplus_dashboard');
      expect(labels).toContain('nav.oplus_governance');
    });

    it('binds aria-label to the translated label key on each link', () => {
      const dashboardLink = element.querySelector('[data-testid="nav-o/dashboard"]');
      expect(dashboardLink?.getAttribute('aria-label')).toBe('nav.oplus_dashboard');
    });

    it('derives data-testid by stripping the leading slash from the route', () => {
      const ids = Array.from(element.querySelectorAll('.chora-sidebar__item')).map((a) =>
        a.getAttribute('data-testid'),
      );
      expect(ids).toContain('nav-o/dashboard');
      expect(ids).toContain('nav-o/costs');
    });
  });

  describe('iconClass coverage of remaining mapped names', () => {
    it('maps the A+ surface icons (pen / bolt / wallet)', () => {
      expect(component.iconClass('pen')).toBe('fa-solid fa-pen');
      expect(component.iconClass('bolt')).toBe('fa-solid fa-bolt');
      expect(component.iconClass('wallet')).toBe('fa-solid fa-wallet');
    });

    it('maps the pet alias to the paw glyph (Familiar entry)', () => {
      // Both `paw` and `pet` resolve to fa-paw — the choraverse nav item
      // uses the `pet` alias.
      expect(component.iconClass('pet')).toBe('fa-solid fa-paw');
    });

    it('falls back for an empty icon name', () => {
      expect(component.iconClass('')).toBe('fa-solid fa-circle-dot');
    });
  });

  describe('disabled (coming soon) nav items - O+ A2A Console (CHO-2358 ruling)', () => {
    beforeEach(() => {
      mockNavigateTo(router, routerEvents$, '/o/dashboard');
      fixture.detectChanges();
    });

    it('renders the A2A Console entry LAST in the O+ nav', () => {
      const ids = Array.from(element.querySelectorAll('.chora-sidebar__item')).map((el) =>
        el.getAttribute('data-testid'),
      );
      expect(ids[ids.length - 1]).toBe('nav-o/a2a-console');
    });

    it('renders a disabled item as a non-navigable span with aria-disabled and the note', () => {
      const item = element.querySelector('[data-testid="nav-o/a2a-console"]');
      expect(item).toBeTruthy();
      expect(item?.tagName.toLowerCase()).toBe('span');
      expect(item?.getAttribute('aria-disabled')).toBe('true');
      expect(item?.classList.contains('chora-sidebar__item--disabled')).toBe(true);
      expect(item?.getAttribute('href')).toBeNull();
      // Translate pipe passes raw keys through in tests, so the note pill
      // carries the i18n key itself.
      const note = item?.querySelector('.chora-sidebar__note');
      expect(note?.textContent).toContain('nav.coming_soon');
      expect(item?.getAttribute('aria-label')).toContain('nav.coming_soon');
    });

    it('keeps enabled O+ items as real router links (control)', () => {
      const dash = element.querySelector('[data-testid="nav-o/dashboard"]');
      expect(dash?.tagName.toLowerCase()).toBe('a');
      expect(dash?.getAttribute('aria-disabled')).toBeNull();
      expect(dash?.querySelector('.chora-sidebar__note')).toBeNull();
    });
  });
});
