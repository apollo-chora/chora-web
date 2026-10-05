import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TenantContextService, TenantContext } from './tenant-context.service';
import { AuthService } from './auth.service';

describe('TenantContextService', () => {
  let service: TenantContextService;

  beforeEach(() => {
    // setCurrentTenant now persists to localStorage — clear between tests.
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(TenantContextService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have null current tenant by default', () => {
    expect(service.currentTenant()).toBeNull();
    expect(service.tenantId()).toBeNull();
  });

  it('should set and read current tenant', () => {
    const tenant: TenantContext = {
      id: 'tenant-1',
      name: 'Test School',
      slug: 'test-school',
      logoUrl: null,
    };

    service.setCurrentTenant(tenant);

    expect(service.currentTenant()).toEqual(tenant);
    expect(service.tenantId()).toBe('tenant-1');
  });

  it('should set available tenants', () => {
    const tenants: TenantContext[] = [
      { id: 't1', name: 'School A', slug: 'school-a', logoUrl: null },
      { id: 't2', name: 'School B', slug: 'school-b', logoUrl: '/logo.png' },
    ];

    service.setAvailableTenants(tenants);

    expect(service.availableTenants()).toHaveLength(2);
    expect(service.availableTenants()[1].name).toBe('School B');
  });

  it('should retain membership metadata on stored tenant objects', () => {
    const tenants: TenantContext[] = [
      {
        id: 't1',
        name: '',
        slug: 'school-a',
        logoUrl: null,
        roles: ['learner', 'author'],
        surfaces: ['aplus', 'cplus'],
        isDefault: true,
      },
    ];

    service.setAvailableTenants(tenants);

    const stored = service.availableTenants()[0];
    expect(stored.roles).toEqual(['learner', 'author']);
    expect(stored.surfaces).toEqual(['aplus', 'cplus']);
    expect(stored.isDefault).toBe(true);
  });

  // ── Active-tenant persistence (CHO-1841, re-landed as CHO-2289) ────────
  //
  // The selected tenant id is persisted so a later mint request can replay
  // it as the `active_tenant_id` hint. (A cold load no longer re-mints —
  // no refresh tokens in this milestone — but the value stays available
  // for the next authentication, and the BE re-validates membership
  // server-side regardless of what the hint says.)
  describe('active tenant persistence', () => {
    const STORAGE_KEY = 'chora_active_tenant_id';
    const tenant: TenantContext = {
      id: 'tenant-1',
      name: 'Test School',
      slug: 'test-school',
      logoUrl: null,
    };

    beforeEach(() => localStorage.clear());

    it('persists the tenant id when setCurrentTenant is called', () => {
      service.setCurrentTenant(tenant);
      expect(localStorage.getItem(STORAGE_KEY)).toBe('tenant-1');
    });

    it('readPersistedActiveTenantId returns the stored id', () => {
      service.setCurrentTenant(tenant);
      expect(service.readPersistedActiveTenantId()).toBe('tenant-1');
    });

    it('readPersistedActiveTenantId returns null when nothing is stored', () => {
      expect(service.readPersistedActiveTenantId()).toBeNull();
    });

    it('clearPersistedActiveTenantId removes the stored id', () => {
      service.setCurrentTenant(tenant);
      service.clearPersistedActiveTenantId();
      expect(service.readPersistedActiveTenantId()).toBeNull();
    });

    it('overwrites the persisted id on a tenant switch', () => {
      service.setCurrentTenant(tenant);
      service.setCurrentTenant({ ...tenant, id: 'tenant-2', slug: 'other' });
      expect(service.readPersistedActiveTenantId()).toBe('tenant-2');
    });

    it('survives a localStorage throw on write (private-mode quota)', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
      expect(() => service.setCurrentTenant(tenant)).not.toThrow();
      // The in-memory signal must still update — storage is best-effort only.
      expect(service.tenantId()).toBe('tenant-1');
      spy.mockRestore();
    });

    it('readPersistedActiveTenantId returns null when localStorage throws', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });
      expect(service.readPersistedActiveTenantId()).toBeNull();
      spy.mockRestore();
    });

    it('clearPersistedActiveTenantId survives a localStorage throw', () => {
      const spy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('SecurityError');
      });
      expect(() => service.clearPersistedActiveTenantId()).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('switchTenant', () => {
    it('delegates to AuthService.mintWithActiveTenant', async () => {
      const mintSpy = vi.fn().mockReturnValue(of(undefined));
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: AuthService, useValue: { mintWithActiveTenant: mintSpy } },
        ],
      });
      service = TestBed.inject(TenantContextService);

      let completed = false;
      await new Promise<void>((resolve) => {
        service.switchTenant('tenant-xyz').subscribe({
          complete: () => {
            completed = true;
            resolve();
          },
        });
      });

      expect(mintSpy).toHaveBeenCalledWith('tenant-xyz');
      expect(completed).toBe(true);
    });
  });
});
