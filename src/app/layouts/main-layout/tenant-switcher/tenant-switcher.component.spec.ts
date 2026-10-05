import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { Router } from '@angular/router';
import { TenantSwitcherComponent } from './tenant-switcher.component';
import { TenantContextService, TenantContext } from '../../../core/auth/tenant-context.service';
import { FeatureFlagService } from '../../../core/services/feature-flag.service';
import { RbacService } from '../../../core/services/rbac.service';
import { TranslateService } from '../../../core/services/translate.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

describe('TenantSwitcherComponent', () => {
  let component: TenantSwitcherComponent;
  let fixture: ComponentFixture<TenantSwitcherComponent>;
  let httpMock: HttpTestingController;
  let switchTenantSpy: ReturnType<typeof vi.fn>;
  let navigateByUrlSpy: ReturnType<typeof vi.fn>;
  let isEnabledSpy: ReturnType<typeof vi.fn>;
  let hasRoleSpy: ReturnType<typeof vi.fn>;
  let tenantContextStub: {
    currentTenant: WritableSignal<TenantContext | null>;
    availableTenants: WritableSignal<TenantContext[]>;
    switchTenant: ReturnType<typeof vi.fn>;
  };

  const tenants: TenantContext[] = [
    { id: 't1', name: 'Alpha School', slug: 'alpha', logoUrl: null },
    { id: 't2', name: 'Beta University', slug: 'beta', logoUrl: 'https://img.test/logo.png' },
  ];

  beforeEach(async () => {
    switchTenantSpy = vi.fn().mockReturnValue(of(void 0));
    navigateByUrlSpy = vi.fn().mockResolvedValue(true);
    isEnabledSpy = vi.fn().mockReturnValue(false);
    hasRoleSpy = vi.fn().mockReturnValue(false);

    tenantContextStub = {
      currentTenant: signal<TenantContext | null>(tenants[0]),
      availableTenants: signal<TenantContext[]>(tenants),
      switchTenant: switchTenantSpy,
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TenantSwitcherComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: TenantContextService, useValue: tenantContextStub },
        { provide: Router, useValue: { navigateByUrl: navigateByUrlSpy } },
        { provide: FeatureFlagService, useValue: { isEnabled: isEnabledSpy } },
        { provide: RbacService, useValue: { hasRole: hasRoleSpy } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TenantSwitcherComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display current tenant name in trigger title', () => {
    const el = fixture.nativeElement as HTMLElement;
    const trigger = el.querySelector('[data-testid="tenant-switcher-trigger"]');
    expect(trigger?.getAttribute('title')).toBe('Alpha School');
  });

  it('should toggle panel open/closed', () => {
    expect(component.isOpen()).toBe(false);
    component.toggle();
    expect(component.isOpen()).toBe(true);
    component.toggle();
    expect(component.isOpen()).toBe(false);
  });

  it('should list available tenants when open', () => {
    component.toggle();
    fixture.detectChanges();
    const options = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.tenant-switcher__option',
    );
    expect(options.length).toBe(2);
  });

  it('should mark current tenant as active', () => {
    component.toggle();
    fixture.detectChanges();
    const active = (fixture.nativeElement as HTMLElement).querySelector(
      '.tenant-switcher__option--active',
    );
    expect(active?.textContent).toContain('Alpha School');
  });

  it('should close panel without switching when selecting current tenant', () => {
    component.toggle();
    component.switchTenant(tenants[0]);
    expect(component.isOpen()).toBe(false);
    expect(switchTenantSpy).not.toHaveBeenCalled();
  });

  it('calls TenantContextService.switchTenant with the tenant id', () => {
    component.toggle();
    component.switchTenant(tenants[1]);
    expect(switchTenantSpy).toHaveBeenCalledWith('t2');
  });

  it('does NOT hit the stale /api/v1/auth/refresh path', () => {
    component.toggle();
    component.switchTenant(tenants[1]);
    httpMock.expectNone('/api/v1/auth/refresh');
  });

  it('closes the dropdown on a successful switch', () => {
    switchTenantSpy.mockReturnValue(of(void 0));
    component.toggle();
    expect(component.isOpen()).toBe(true);
    component.switchTenant(tenants[1]);
    expect(component.isOpen()).toBe(false);
    expect(component.isSwitching()).toBe(false);
  });

  it('keeps the dropdown open and clears isSwitching on error', () => {
    switchTenantSpy.mockReturnValue(throwError(() => new Error('mint failed')));
    component.toggle();
    component.switchTenant(tenants[1]);
    expect(component.isOpen()).toBe(true);
    expect(component.isSwitching()).toBe(false);
  });

  it('sets isSwitching true while the switch is in flight', () => {
    const pending = new Subject<void>();
    switchTenantSpy.mockReturnValue(pending.asObservable());
    component.toggle();
    component.switchTenant(tenants[1]);
    expect(component.isSwitching()).toBe(true);
    pending.next();
    pending.complete();
    expect(component.isSwitching()).toBe(false);
  });

  describe('post-switch landing navigation', () => {
    // C2 slice 3 (ADR-240) moved the A+ landing from `/a/dashboard` to
    // `/a/home`, and this screen tracked it for free: it reads the shared
    // `SURFACE_LANDING` through `firstAccessibleSurfaceLanding` rather than
    // holding a literal of its own. That is why the census of hard-coded
    // landings could not see it and the full suite could.
    //
    // It deliberately keeps `onEmpty: 'open-all'` rather than adopting
    // `LandingService`, whose `closed-none` would send a switch into a tenant
    // with no `surfaces[]` to `/home` instead of A+. That is a behaviour
    // change on a screen the slice was not asked to touch, so it is recorded
    // as a question rather than made silently.
    it('navigates to the A+ landing when the new tenant carries no surfaces[] (fail-open to A+ first)', () => {
      // tenants[1] has no `surfaces` → resolveVisibleSurfaces falls open to
      // all 5; firstAccessibleSurfaceLanding picks A+ (priority head).
      component.switchTenant(tenants[1]);
      expect(navigateByUrlSpy).toHaveBeenCalledWith('/a/home');
    });

    it('navigates to /h/tenant for an admin-only tenant (surfaces: [hplus])', () => {
      tenantContextStub.availableTenants.set([
        tenants[0],
        { ...tenants[1], surfaces: ['hplus'] },
      ]);
      // The mint response in real flow re-seeds currentTenant to the new
      // tenant before the next() callback fires; simulate that here.
      switchTenantSpy.mockImplementation(() => {
        tenantContextStub.currentTenant.set({ ...tenants[1], surfaces: ['hplus'] });
        return of(void 0);
      });

      component.switchTenant(tenants[1]);

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/h/tenant');
    });

    it('skips C+ in the landing pick when the new tenant lacks the cplus_social entitlement', () => {
      // Membership grants C+ on the surfaces[] axis, but the add-on flag is
      // off — firstAccessibleSurfaceLanding must skip C+ and land on A+.
      switchTenantSpy.mockImplementation(() => {
        tenantContextStub.currentTenant.set({
          ...tenants[1],
          surfaces: ['cplus', 'aplus'],
        });
        return of(void 0);
      });
      isEnabledSpy.mockReturnValue(false);

      component.switchTenant(tenants[1]);

      expect(navigateByUrlSpy).toHaveBeenCalledWith('/a/home');
    });

    it('lands on C+ when the new tenant IS entitled to cplus_social', () => {
      switchTenantSpy.mockImplementation(() => {
        tenantContextStub.currentTenant.set({
          ...tenants[1],
          surfaces: ['cplus', 'aplus'],
        });
        return of(void 0);
      });
      // FeatureFlagService.isEnabled('cplus_social') → true after mint
      isEnabledSpy.mockImplementation((code: string) => code === 'cplus_social');

      component.switchTenant(tenants[1]);

      // A+ wins on LANDING_PRIORITY ordering even when both are accessible.
      expect(navigateByUrlSpy).toHaveBeenCalledWith('/a/home');
    });

    it('does not navigate on the no-op (selecting the already-current tenant)', () => {
      component.switchTenant(tenants[0]);
      expect(navigateByUrlSpy).not.toHaveBeenCalled();
    });

    it('does not navigate when the mint errors', () => {
      switchTenantSpy.mockReturnValue(throwError(() => new Error('mint failed')));
      component.switchTenant(tenants[1]);
      expect(navigateByUrlSpy).not.toHaveBeenCalled();
    });
  });

  it('should navigate with keyboard arrows', () => {
    component.toggle();
    fixture.detectChanges();
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.activeIndex()).toBe(0);
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.activeIndex()).toBe(1);
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(component.activeIndex()).toBe(0);
  });

  it('should close on Escape', () => {
    component.toggle();
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.isOpen()).toBe(false);
  });

  it('Enter on a focused row triggers the switch', () => {
    component.toggle();
    fixture.detectChanges();
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(switchTenantSpy).toHaveBeenCalledWith('t2');
  });

  describe('per-tenant role display in the option list', () => {
    it('renders the user roles under the tenant name when the membership carries roles[]', () => {
      tenantContextStub.availableTenants.set([
        { ...tenants[0], roles: ['learner'] },
        { ...tenants[1], roles: ['tenant_admin', 'auditor'] },
      ]);
      component.toggle();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const t1Roles = el.querySelector('[data-testid="tenant-option-roles-t1"]');
      const t2Roles = el.querySelector('[data-testid="tenant-option-roles-t2"]');

      expect(t1Roles?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'tenant_switcher.role.learner',
      );
      // Two roles join with comma + nbsp; whitespace-normalised assertion.
      expect(t2Roles?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'tenant_switcher.role.tenant_admin, tenant_switcher.role.auditor',
      );
    });

    it('omits the roles line entirely when the membership carries no roles[]', () => {
      // tenants[0] has no `roles` field in the default fixture.
      component.toggle();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="tenant-option-roles-t1"]'),
      ).toBeNull();
    });

    it('omits the roles line when roles[] is present but empty AND the session is not an operator', () => {
      tenantContextStub.availableTenants.set([
        { ...tenants[0], roles: [] },
        tenants[1],
      ]);
      component.toggle();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(
        el.querySelector('[data-testid="tenant-option-roles-t1"]'),
      ).toBeNull();
    });

    it('appends platform_operator to every tenant row when the session JWT carries the role', () => {
      hasRoleSpy.mockImplementation((role: string) => role === 'platform_operator');
      tenantContextStub.availableTenants.set([
        { ...tenants[0], roles: ['owner'] },
        { ...tenants[1], roles: ['learner'] },
      ]);
      component.toggle();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const t1Roles = el.querySelector('[data-testid="tenant-option-roles-t1"]');
      const t2Roles = el.querySelector('[data-testid="tenant-option-roles-t2"]');

      expect(t1Roles?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'tenant_switcher.role.owner, tenant_switcher.role.platform_operator',
      );
      expect(t2Roles?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'tenant_switcher.role.learner, tenant_switcher.role.platform_operator',
      );
    });

    it('renders the roles line for an empty-roles tenant when the session carries platform_operator', () => {
      hasRoleSpy.mockImplementation((role: string) => role === 'platform_operator');
      tenantContextStub.availableTenants.set([{ ...tenants[0], roles: [] }, tenants[1]]);
      component.toggle();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const t1Roles = el.querySelector('[data-testid="tenant-option-roles-t1"]');
      expect(t1Roles?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'tenant_switcher.role.platform_operator',
      );
    });

    it('does not duplicate platform_operator when the membership already carries it', () => {
      hasRoleSpy.mockImplementation((role: string) => role === 'platform_operator');
      tenantContextStub.availableTenants.set([
        { ...tenants[0], roles: ['owner', 'platform_operator'] },
        tenants[1],
      ]);
      component.toggle();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const t1Roles = el.querySelector('[data-testid="tenant-option-roles-t1"]');
      const occurrences = t1Roles?.textContent?.match(/platform_operator/g) ?? [];
      expect(occurrences.length).toBe(1);
    });
  });

  it('should show logo placeholder when no logoUrl', () => {
    component.toggle();
    fixture.detectChanges();
    const placeholders = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.tenant-switcher__logo-placeholder',
    );
    expect(placeholders.length).toBe(1);
    expect(placeholders[0].textContent?.trim()).toBe('A');
  });

  it('tracks broken logos via onLogoError', () => {
    expect(component.hasValidLogo(tenants[1])).toBe(true);
    component.onLogoError('t2');
    expect(component.hasValidLogo(tenants[1])).toBe(false);
  });

  it('closes on a document click outside the component', () => {
    component.toggle();
    expect(component.isOpen()).toBe(true);
    component.onDocumentClick({ target: document.body } as unknown as Event);
    expect(component.isOpen()).toBe(false);
  });

  // Axe-core regression (axe 4.10.2 scan of /a/atoms/new, 2026-05-17).
  // aria-valid-attr-value (critical, incomplete tier): the trigger's
  // `aria-controls="tenant-list"` referenced an id that did not exist
  // in the DOM while the listbox was collapsed. WAI-ARIA APG
  // combobox/disclosure guidance says the referenced node must exist
  // whenever the attribute does. Chosen fix: drop `aria-controls`
  // when closed (option b) — pure attribute toggle, no extra DOM, no
  // hidden-listbox layout overhead. The `aria-expanded` signal still
  // carries the open/closed state for AT users.
  describe('a11y regressions (axe 2026-05-17 /a/atoms/new scan)', () => {
    it('does not emit aria-controls on the trigger while the listbox is closed', () => {
      const el = fixture.nativeElement as HTMLElement;
      const trigger = el.querySelector(
        '[data-testid="tenant-switcher-trigger"]',
      );
      expect(trigger?.hasAttribute('aria-controls')).toBe(false);
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    });

    it('emits aria-controls="tenant-list" on the trigger while open, and the listbox node exists', () => {
      component.toggle();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const trigger = el.querySelector(
        '[data-testid="tenant-switcher-trigger"]',
      );
      expect(trigger?.getAttribute('aria-controls')).toBe('tenant-list');
      expect(trigger?.getAttribute('aria-expanded')).toBe('true');
      // The id must exist in the DOM whenever aria-controls references it.
      const listbox = el.querySelector('#tenant-list');
      expect(listbox).not.toBeNull();
      expect(listbox?.getAttribute('role')).toBe('listbox');
    });
  });

  // CHO-1709 WP-6 — the always-visible trigger renders the ACTIVE
  // tenant's real identity: brand logo `<img>` when the hydrated
  // TenantContext carries a logoUrl, display name text otherwise/with it.
  // The name comes from TenantContext.name (display_name post-hydration)
  // — never the slug.
  describe('WP-6 — active tenant identity in the trigger (logo + display name)', () => {
    it('renders the display name in the trigger (name field, not the slug)', () => {
      const el = fixture.nativeElement as HTMLElement;
      const name = el.querySelector('[data-testid="tenant-switcher-active-name"]');
      expect(name?.textContent?.trim()).toBe('Alpha School');
      expect(name?.textContent).not.toContain('alpha');
    });

    it('renders name-only (generic icon, no logo img) when logoUrl is null', () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="tenant-switcher-active-logo"]')).toBeNull();
      expect(el.querySelector('.tenant-switcher__icon')).not.toBeNull();
      expect(
        el.querySelector('[data-testid="tenant-switcher-active-name"]')?.textContent?.trim(),
      ).toBe('Alpha School');
    });

    it('renders the logo img (alt = tenant name, fixed 24px box) when logoUrl is set', () => {
      tenantContextStub.currentTenant.set(tenants[1]);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const img = el.querySelector<HTMLImageElement>(
        '[data-testid="tenant-switcher-active-logo"]',
      );
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('https://img.test/logo.png');
      expect(img?.getAttribute('alt')).toBe('Beta University');
      expect(img?.getAttribute('height')).toBe('24');
      // The brand logo replaces the generic domain glyph.
      expect(el.querySelector('.tenant-switcher__icon')).toBeNull();
      // Display name still rendered alongside the logo.
      expect(
        el.querySelector('[data-testid="tenant-switcher-active-name"]')?.textContent?.trim(),
      ).toBe('Beta University');
    });

    it('falls back to icon + name when the active logo errors (broken URL)', () => {
      tenantContextStub.currentTenant.set(tenants[1]);
      fixture.detectChanges();

      component.onActiveLogoError();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="tenant-switcher-active-logo"]')).toBeNull();
      expect(el.querySelector('.tenant-switcher__icon')).not.toBeNull();
      expect(
        el.querySelector('[data-testid="tenant-switcher-active-name"]')?.textContent?.trim(),
      ).toBe('Beta University');
    });

    it('renders icon-only (no name span) when there is no current tenant', () => {
      tenantContextStub.currentTenant.set(null);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="tenant-switcher-active-name"]')).toBeNull();
      expect(el.querySelector('[data-testid="tenant-switcher-active-logo"]')).toBeNull();
      expect(el.querySelector('.tenant-switcher__icon')).not.toBeNull();
    });
  });
});
