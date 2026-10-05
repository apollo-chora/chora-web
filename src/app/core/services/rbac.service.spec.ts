import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RbacService } from './rbac.service';
import { AuthService, type AuthUser } from '../auth/auth.service';

function buildUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    gcid: 'u1',
    tenantId: 't1',
    roles: ['learner'],
    capabilities: ['atom:read', 'atom:submit', 'dashboard:view'],
    displayName: 'Jane',
    email: 'jane@test.com',
    ...overrides,
  };
}

describe('RbacService', () => {
  let service: RbacService;
  const userSig = signal<AuthUser | null>(buildUser());
  const authMock = { user: userSig };

  beforeEach(() => {
    userSig.set(buildUser());
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authMock }],
    });
    service = TestBed.inject(RbacService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should check single capability', () => {
    expect(service.hasCapability('atom:read')).toBe(true);
    expect(service.hasCapability('atom:publish')).toBe(false);
  });

  it('should check any capability', () => {
    expect(service.hasAnyCapability('atom:publish', 'atom:read')).toBe(true);
    expect(service.hasAnyCapability('admin:manage', 'tenant:delete')).toBe(false);
  });

  it('should check all capabilities', () => {
    expect(service.hasAllCapabilities('atom:read', 'atom:submit')).toBe(true);
    expect(service.hasAllCapabilities('atom:read', 'atom:publish')).toBe(false);
  });

  // ── hasRole — session JWT roles (auth-hardening §4.7e, CHO-1717) ───────
  describe('hasRole — case-insensitive canonical role check', () => {
    it('matches a role present verbatim in the JWT roles claim', () => {
      userSig.set(buildUser({ roles: ['learner', 'author'] }));
      expect(service.hasRole('learner')).toBe(true);
      expect(service.hasRole('author')).toBe(true);
    });

    it('matches canonical UPPERCASE claim against lowercase query', () => {
      // JWT may carry the ADR-165 canonical form (PLATFORM_OPERATOR).
      userSig.set(buildUser({ roles: ['PLATFORM_OPERATOR'] }));
      expect(service.hasRole('platform_operator')).toBe(true);
    });

    it('matches lowercase claim against canonical UPPERCASE query', () => {
      // Deployed mints forward membership rows verbatim (lowercase).
      userSig.set(buildUser({ roles: ['platform_operator'] }));
      expect(service.hasRole('PLATFORM_OPERATOR')).toBe(true);
    });

    it('returns false when the role is absent', () => {
      userSig.set(buildUser({ roles: ['learner'] }));
      expect(service.hasRole('platform_operator')).toBe(false);
      expect(service.hasRole('tenant_admin')).toBe(false);
    });

    it('returns false for empty / blank role names (fail-closed)', () => {
      userSig.set(buildUser({ roles: ['', '  ', 'learner'] }));
      expect(service.hasRole('')).toBe(false);
      expect(service.hasRole('   ')).toBe(false);
    });

    it('returns false when no user session exists', () => {
      userSig.set(null);
      expect(service.hasRole('platform_operator')).toBe(false);
    });

    it('exposes the raw roles claim via the roles signal', () => {
      userSig.set(buildUser({ roles: ['platform_operator', 'learner'] }));
      expect(service.roles()).toEqual(['platform_operator', 'learner']);
      userSig.set(null);
      expect(service.roles()).toEqual([]);
    });
  });
});
