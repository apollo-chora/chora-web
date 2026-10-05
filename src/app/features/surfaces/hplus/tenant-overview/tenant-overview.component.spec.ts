import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { TenantOverviewComponent } from './tenant-overview.component';
import { TenantOverviewService } from './tenant-overview.service';
import type {
  TenantOverview,
  TenantOverviewState,
} from './tenant-overview.model';

const TENANT_ID = '11111111-1111-7111-8111-111111111111';

function buildTenantOverview(overrides: Partial<TenantOverview> = {}): TenantOverview {
  return {
    id: TENANT_ID,
    display_name: 'Mighty Mind Tuition Agency',
    status: 'active',
    self_hosted: false,
    parent_tenant_id: '',
    branding_config: {
      primary_color: '#5B7FFF',
      tagline: 'Mighty minds in motion',
    },
    created_at: '2026-05-10T21:12:17.049353Z',
    updated_at: '2026-05-10T21:12:17.049353Z',
    ...overrides,
  };
}

class StubTenantOverviewService {
  readonly _state: WritableSignal<TenantOverviewState> = signal<TenantOverviewState>({
    status: 'loading',
  });
  readonly state = this._state.asReadonly();
  readonly tenant = computed<TenantOverview | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.tenant : null;
  });
  loadCalls: string[] = [];
  load(id: string): void {
    this.loadCalls.push(id);
  }
}

class StubAuthService {
  // `roles` feeds RbacService.hasRole (root-provided, injects this stub via
  // the AuthService token) for the §4.7d operator-only wizard tile gate.
  user = signal<{ tenantId: string; roles?: string[] } | null>({
    tenantId: TENANT_ID,
  });
}

function setup(): {
  fixture: ComponentFixture<TenantOverviewComponent>;
  component: TenantOverviewComponent;
  element: HTMLElement;
  tenantService: StubTenantOverviewService;
  auth: StubAuthService;
} {
  const tenantService = new StubTenantOverviewService();
  const auth = new StubAuthService();
  TestBed.configureTestingModule({
    imports: [TenantOverviewComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: TenantOverviewService, useValue: tenantService },
      { provide: AuthService, useValue: auth },
    ],
  });
  const fixture = TestBed.createComponent(TenantOverviewComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    tenantService,
    auth,
  };
}

describe('TenantOverviewComponent (Phyllis Step 2 — real BFF wiring)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('init / load wiring', () => {
    it('creates', () => {
      const { component } = setup();
      expect(component).toBeTruthy();
    });

    it('has data-testid="tenant-overview" + the surface-hplus accent on the root', () => {
      const { element } = setup();
      const root = element.querySelector('[data-testid="tenant-overview"]') as HTMLElement;
      expect(root).toBeTruthy();
      expect(root.classList.contains('surface-hplus')).toBe(true);
    });

    it('calls service.load() with the tenant_id from AuthService', () => {
      const { tenantService } = setup();
      expect(tenantService.loadCalls).toContain(TENANT_ID);
    });

    it('does NOT call service.load() when no tenant_id is available', () => {
      const tenantService = new StubTenantOverviewService();
      const auth = new StubAuthService();
      auth.user.set(null);
      TestBed.configureTestingModule({
        imports: [TenantOverviewComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([]),
          { provide: TenantOverviewService, useValue: tenantService },
          { provide: AuthService, useValue: auth },
        ],
      });
      const f = TestBed.createComponent(TenantOverviewComponent);
      f.detectChanges();
      expect(tenantService.loadCalls).toEqual([]);
    });
  });

  describe('loading branch', () => {
    it('renders the loading panel while state is loading', () => {
      const { element } = setup();
      const panel = element.querySelector('[data-testid="tenant-overview-loading"]');
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute('aria-busy')).toBe('true');
    });

    it('does NOT render the hero or tiles while loading', () => {
      const { element } = setup();
      expect(element.querySelector('[data-testid="tenant-name"]')).toBeNull();
      expect(element.querySelector('[data-testid="tenant-overview-tiles"]')).toBeNull();
    });
  });

  describe('error branch (fail loud)', () => {
    it('renders a role=alert error banner with a translated key', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({ status: 'error', error: 'hplus.tenant.error_upstream' });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="tenant-overview-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('renders a Try Again CTA that re-fires service.load()', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({ status: 'error', error: 'hplus.tenant.error_generic' });
      fixture.detectChanges();
      const cta = element.querySelector('[data-testid="tenant-overview-retry"]') as HTMLButtonElement;
      expect(cta).toBeTruthy();
      const before = tenantService.loadCalls.length;
      cta.click();
      expect(tenantService.loadCalls.length).toBe(before + 1);
      expect(tenantService.loadCalls.at(-1)).toBe(TENANT_ID);
    });
  });

  describe('success branch — render real DTO honestly', () => {
    it('renders display_name from the DTO (not hardcoded "MTM Singapore")', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview({ display_name: 'Chen Coaching Pte Ltd' }),
      });
      fixture.detectChanges();
      const name = element.querySelector('[data-testid="tenant-name"]');
      expect(name?.textContent).toContain('Chen Coaching Pte Ltd');
    });

    it('renders the tenant id as the GCID-pill code (not a hardcoded slug)', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview(),
      });
      fixture.detectChanges();
      const gcid = element.querySelector('[data-testid="tenant-gcid"]');
      expect(gcid?.textContent).toContain(TENANT_ID);
    });

    it('renders branding_config.tagline when non-empty', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview({
          branding_config: { primary_color: '#5B7FFF', tagline: 'Curiosity first' },
        }),
      });
      fixture.detectChanges();
      const tagline = element.querySelector('[data-testid="tenant-tagline"]');
      expect(tagline?.textContent).toContain('Curiosity first');
    });

    it('omits the tagline element when branding_config.tagline is empty', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview({
          branding_config: { primary_color: '#5B7FFF', tagline: '' },
        }),
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="tenant-tagline"]')).toBeNull();
    });

    it('applies branding_config.primary_color as the --chora-tenant-accent CSS variable', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview({
          branding_config: { primary_color: '#FF7A7A', tagline: '' },
        }),
      });
      fixture.detectChanges();
      const root = element.querySelector('[data-testid="tenant-overview"]') as HTMLElement;
      expect(root.style.getPropertyValue('--chora-tenant-accent')).toBe('#FF7A7A');
    });

    it('renders the Active status badge when status="active"', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview({ status: 'active' }),
      });
      fixture.detectChanges();
      const badge = element.querySelector('[data-testid="tenant-status-badge"]');
      expect(badge).toBeTruthy();
      expect(badge?.classList.contains('badge-success')).toBe(true);
    });

    it('renders the raw status string for non-active states (no fake "setup" badge)', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview({ status: 'closing' }),
      });
      fixture.detectChanges();
      const badge = element.querySelector('[data-testid="tenant-status-badge"]');
      expect(badge?.textContent).toContain('closing');
      expect(badge?.classList.contains('badge-success')).toBe(false);
    });

    it('renders the self_hosted boolean as a meta cell', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview({ self_hosted: true }),
      });
      fixture.detectChanges();
      const cell = element.querySelector('[data-testid="tenant-self-hosted"]');
      expect(cell?.textContent?.toLowerCase()).toContain('yes');
    });

    it('renders parent_tenant_id only when non-empty', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview({ parent_tenant_id: '' }),
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="tenant-parent"]')).toBeNull();

      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview({
          parent_tenant_id: '99999999-9999-7999-8999-999999999999',
        }),
      });
      fixture.detectChanges();
      const cell = element.querySelector('[data-testid="tenant-parent"]');
      expect(cell?.textContent).toContain('99999999-9999-7999-8999-999999999999');
    });

    it('renders created_at + updated_at strings from the DTO', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview(),
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="tenant-created-at"]')?.textContent).toContain(
        '2026-05-10',
      );
      expect(element.querySelector('[data-testid="tenant-updated-at"]')?.textContent).toContain(
        '2026-05-10',
      );
    });

    it('derives the logo monogram from display_name', () => {
      const { tenantService, fixture, element, component } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview({ display_name: 'Mighty Mind Tuition Agency' }),
      });
      fixture.detectChanges();
      expect(component.initials()).toBe('MMT');
      const logo = element.querySelector('[data-testid="tenant-logo"]');
      expect(logo?.textContent?.trim()).toBe('MMT');
    });
  });

  describe('navigation tiles', () => {
    it('renders the 6 H+ sub-route tiles (wizard tile NOT included for non-operators)', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview(),
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="tile-branding"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="tile-addons"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="tile-members"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="tile-idp"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="tile-billing"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="tile-marketplace"]')).toBeTruthy();
    });

    // §4.7d (auth-hardening Phase A, CHO-1717 / ADR-181 ruling #5):
    // the Setup-Tenant wizard entry point is PLATFORM_OPERATOR-only.
    it('hides the Setup Wizard tile when the session lacks platform_operator', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview(),
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="tile-setup-wizard"]')).toBeNull();
    });

    it('shows the Setup Wizard tile for platform_operator (lowercase JWT form)', () => {
      const { tenantService, auth, fixture, element } = setup();
      auth.user.set({ tenantId: TENANT_ID, roles: ['platform_operator'] });
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview(),
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="tile-setup-wizard"]')).toBeTruthy();
    });

    it('shows the Setup Wizard tile for canonical PLATFORM_OPERATOR (case-insensitive)', () => {
      const { tenantService, auth, fixture, element } = setup();
      auth.user.set({ tenantId: TENANT_ID, roles: ['PLATFORM_OPERATOR'] });
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview(),
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="tile-setup-wizard"]')).toBeTruthy();
    });

    it('Setup Wizard tile links to /admin/tenant/settings/wizard (operator session)', () => {
      const { tenantService, auth, fixture, element } = setup();
      auth.user.set({ tenantId: TENANT_ID, roles: ['platform_operator'] });
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview(),
      });
      fixture.detectChanges();
      const tile = element.querySelector('[data-testid="tile-setup-wizard"]');
      expect(tile?.getAttribute('href') ?? tile?.getAttribute('ng-reflect-router-link'))
        .toContain('/admin/tenant/settings/wizard');
    });

    it('does NOT render the dropped wave-1 sections (no add-on cards, IdP rows, billing snapshot, Go-Live CTA)', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview(),
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="addon-card-knowledge_graph"]')).toBeNull();
      expect(element.querySelector('[data-testid="addon-card-choraverse"]')).toBeNull();
      expect(element.querySelector('[data-testid="idp-microsoft"]')).toBeNull();
      expect(element.querySelector('[data-testid="billing-snapshot"]')).toBeNull();
      expect(element.querySelector('[data-testid="go-live-cta"]')).toBeNull();
      expect(element.querySelector('[data-testid="tenant-members-count"]')).toBeNull();
    });
  });

  describe('Accessibility', () => {
    it('uses a single h1 for the tenant name when success', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({
        status: 'success',
        tenant: buildTenantOverview(),
      });
      fixture.detectChanges();
      expect(element.querySelectorAll('h1').length).toBe(1);
    });

    it('breadcrumb nav has aria-label', () => {
      const { element } = setup();
      const nav = element.querySelector('nav[aria-label]');
      expect(nav).toBeTruthy();
    });

    it('all interactive elements have accessible names', () => {
      const { tenantService, fixture, element } = setup();
      tenantService._state.set({ status: 'error', error: 'hplus.tenant.error_generic' });
      fixture.detectChanges();
      const buttons = Array.from(element.querySelectorAll('button'));
      for (const btn of buttons) {
        const hasText = (btn.textContent ?? '').trim().length > 0;
        const hasAria = btn.hasAttribute('aria-label') || btn.hasAttribute('aria-labelledby');
        expect(hasText || hasAria).toBe(true);
      }
      const links = Array.from(element.querySelectorAll('a'));
      for (const a of links) {
        const hasText = (a.textContent ?? '').trim().length > 0;
        const hasAria = a.hasAttribute('aria-label') || a.hasAttribute('aria-labelledby');
        expect(hasText || hasAria).toBe(true);
      }
    });
  });
});
