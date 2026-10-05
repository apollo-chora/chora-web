import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { SettingsComponent } from './settings.component';
import { AuthService } from '../../../core/auth/auth.service';
import { TenantContextService } from '../../../core/auth/tenant-context.service';

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;

  const mockUser = signal({
    displayName: 'Alice Smith',
    email: 'alice@example.com',
    roles: ['learner', 'admin'],
  });

  const mockTenant = signal({ id: 'tenant-001', name: 'Test School' });

  const mockAuthService = {
    user: mockUser.asReadonly(),
    // ngOnInit calls auth.refreshProfile() (CHO-1818) to pull a fresh /api/me;
    // stub it so the component instantiates in tests.
    refreshProfile: () => {},
  };

  const mockTenantCtx = {
    currentTenant: mockTenant.asReadonly(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: TenantContextService, useValue: mockTenantCtx },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute display name from auth service', () => {
    expect(component.displayName()).toBe('Alice Smith');
  });

  it('should compute email from auth service', () => {
    expect(component.email()).toBe('alice@example.com');
  });

  it('should compute initial from display name', () => {
    expect(component.initial()).toBe('A');
  });

  it('should compute roles from auth service', () => {
    expect(component.roles()).toEqual(['learner', 'admin']);
  });

  it('should compute tenant name from tenant context', () => {
    expect(component.tenantName()).toBe('Test School');
  });
});

// ---------------------------------------------------------------------------
// Branch-coverage augmentation. Each block builds its OWN TestBed with
// mutable mock signals so the existing fixed-value suite above stays
// untouched. The component's logic lives entirely in five computed signals:
//   displayName = user.displayName?.trim() || user.email.split('@')[0] || ''  (CHO-1818)
//   email       = auth.user()?.email ?? ''
//   initial     = displayName().charAt(0).toUpperCase()
//   roles       = auth.user()?.roles ?? []
//   tenantName  = currentTenant()?.name || currentTenant()?.id || 'None'
// ---------------------------------------------------------------------------

interface MockUser {
  displayName?: string;
  email?: string;
  roles?: string[];
}
interface MockTenant {
  id?: string;
  name?: string;
}

async function buildWith(
  userValue: MockUser | null,
  tenantValue: MockTenant | null,
): Promise<{ fixture: ComponentFixture<SettingsComponent>; element: HTMLElement }> {
  const user = signal<MockUser | null>(userValue);
  const tenant = signal<MockTenant | null>(tenantValue);

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [SettingsComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { user: user.asReadonly(), refreshProfile: () => {} } },
      {
        provide: TenantContextService,
        useValue: { currentTenant: tenant.asReadonly() },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(SettingsComponent);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('SettingsComponent (branch coverage)', () => {
  describe('when auth.user() is null', () => {
    it('displayName() falls back to "" (?. short-circuit + ?? RHS)', async () => {
      const { fixture, element } = await buildWith(null, { id: 't', name: 'T' });
      expect(fixture.componentInstance.displayName()).toBe('');
      expect(
        element.querySelector('[data-testid="settings-name"]')?.textContent?.trim(),
      ).toBe('');
    });

    it('email() falls back to "" (?. short-circuit + ?? RHS)', async () => {
      const { fixture, element } = await buildWith(null, { id: 't', name: 'T' });
      expect(fixture.componentInstance.email()).toBe('');
      expect(
        element.querySelector('[data-testid="settings-email"]')?.textContent?.trim(),
      ).toBe('');
    });

    it('initial() is "" when displayName is empty ("".charAt(0))', async () => {
      const { fixture } = await buildWith(null, { id: 't', name: 'T' });
      expect(fixture.componentInstance.initial()).toBe('');
    });

    it('roles() falls back to [] → @for renders no badges', async () => {
      const { fixture, element } = await buildWith(null, { id: 't', name: 'T' });
      expect(fixture.componentInstance.roles()).toEqual([]);
      expect(element.querySelectorAll('.settings__role-badge').length).toBe(0);
    });
  });

  describe('when auth.user() is present but fields are nullish', () => {
    it('displayName() derives from the email local-part when displayName is undefined (CHO-1818)', async () => {
      const { fixture } = await buildWith(
        { email: 'a@b.com', roles: ['x'] },
        { id: 't', name: 'T' },
      );
      // No displayName on the user → fall back to the email local-part
      // (admin-set names land via /api/me; until then show something readable).
      expect(fixture.componentInstance.displayName()).toBe('a');
      expect(fixture.componentInstance.initial()).toBe('A');
    });

    it('email() ?? RHS fires when email is undefined', async () => {
      const { fixture } = await buildWith(
        { displayName: 'Bob', roles: ['x'] },
        { id: 't', name: 'T' },
      );
      expect(fixture.componentInstance.email()).toBe('');
    });

    it('roles() ?? RHS fires when roles is undefined', async () => {
      const { fixture, element } = await buildWith(
        { displayName: 'Bob', email: 'b@b.com' },
        { id: 't', name: 'T' },
      );
      expect(fixture.componentInstance.roles()).toEqual([]);
      expect(element.querySelectorAll('.settings__role-badge').length).toBe(0);
    });
  });

  describe('roles() loop arms', () => {
    it('renders no badge when roles is the empty array', async () => {
      const { fixture, element } = await buildWith(
        { displayName: 'Bob', email: 'b@b.com', roles: [] },
        { id: 't', name: 'T' },
      );
      expect(fixture.componentInstance.roles()).toEqual([]);
      expect(element.querySelectorAll('.settings__role-badge').length).toBe(0);
    });

    it('renders one badge per role for a multi-element array', async () => {
      const { fixture, element } = await buildWith(
        { displayName: 'Bob', email: 'b@b.com', roles: ['learner', 'instructor', 'admin'] },
        { id: 't', name: 'T' },
      );
      expect(fixture.componentInstance.roles().length).toBe(3);
      expect(element.querySelectorAll('.settings__role-badge').length).toBe(3);
    });
  });

  describe('initial() upper-casing', () => {
    it('uppercases the first character of a non-empty name', async () => {
      const { fixture, element } = await buildWith(
        { displayName: 'ada lovelace', email: 'a@b.com', roles: [] },
        { id: 't', name: 'T' },
      );
      expect(fixture.componentInstance.initial()).toBe('A');
      expect(
        element.querySelector('.settings__avatar')?.textContent?.trim(),
      ).toBe('A');
    });
  });

  describe('tenantName() || ladder', () => {
    it("returns 'None' when currentTenant() is null (?. short-circuit on both terms)", async () => {
      const { fixture, element } = await buildWith(
        { displayName: 'Bob', email: 'b@b.com', roles: [] },
        null,
      );
      expect(fixture.componentInstance.tenantName()).toBe('None');
      expect(
        element.querySelector('[data-testid="settings-tenant"]')?.textContent?.trim(),
      ).toBe('None');
    });

    it('returns the name when present (first || arm truthy)', async () => {
      const { fixture } = await buildWith(
        { displayName: 'Bob', email: 'b@b.com', roles: [] },
        { id: 'tenant-1', name: 'Acme Academy' },
      );
      expect(fixture.componentInstance.tenantName()).toBe('Acme Academy');
    });

    it('falls back to id when name is empty (name falsy → id truthy)', async () => {
      const { fixture } = await buildWith(
        { displayName: 'Bob', email: 'b@b.com', roles: [] },
        { id: 'tenant-xyz', name: '' },
      );
      expect(fixture.componentInstance.tenantName()).toBe('tenant-xyz');
    });

    it("falls back to 'None' when both name and id are empty (both || arms falsy)", async () => {
      const { fixture } = await buildWith(
        { displayName: 'Bob', email: 'b@b.com', roles: [] },
        { id: '', name: '' },
      );
      expect(fixture.componentInstance.tenantName()).toBe('None');
    });
  });

  describe('quick links', () => {
    it('renders the four quick-link entries including the danger link', async () => {
      const { element } = await buildWith(
        { displayName: 'Bob', email: 'b@b.com', roles: ['x'] },
        { id: 't', name: 'T' },
      );
      expect(element.querySelectorAll('.settings__link').length).toBe(4);
      expect(element.querySelector('.settings__link--danger')).toBeTruthy();
    });

    it('renders the security quick link (Phase A3 — /settings/security)', async () => {
      const { element } = await buildWith(
        { displayName: 'Bob', email: 'b@b.com', roles: ['x'] },
        { id: 't', name: 'T' },
      );
      const link = element.querySelector('[data-testid="settings-security-link"]');
      expect(link).toBeTruthy();
      expect(link?.getAttribute('href')).toBe('/settings/security');
    });
  });
});
