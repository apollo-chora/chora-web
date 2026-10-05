import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, type UrlTree } from '@angular/router';
import { platformOperatorGuard } from './platform-operator.guard';
import { AuthService, type AuthUser } from './auth.service';

function buildUser(roles: string[]): AuthUser {
  return {
    gcid: 'u1',
    tenantId: 't1',
    roles,
    capabilities: [],
    displayName: 'Dale',
    email: 'dale@test.com',
  };
}

describe('platformOperatorGuard', () => {
  const userSig = signal<AuthUser | null>(null);
  let createUrlTree: Mock<(commands: string[]) => UrlTree>;

  beforeEach(() => {
    userSig.set(null);
    createUrlTree = vi.fn<(commands: string[]) => UrlTree>(
      (commands: string[]) => commands as unknown as UrlTree,
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: userSig } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });
  });

  function run(): boolean | UrlTree {
    return TestBed.runInInjectionContext(() =>
      platformOperatorGuard({} as never, {} as never),
    ) as boolean | UrlTree;
  }

  it('allows activation when the JWT carries lowercase platform_operator', () => {
    userSig.set(buildUser(['platform_operator']));
    expect(run()).toBe(true);
    expect(createUrlTree).not.toHaveBeenCalled();
  });

  it('allows activation when the JWT carries canonical PLATFORM_OPERATOR', () => {
    userSig.set(buildUser(['learner', 'PLATFORM_OPERATOR']));
    expect(run()).toBe(true);
  });

  it('redirects to /unauthorized when the role is absent', () => {
    userSig.set(buildUser(['tenant_admin', 'learner']));
    run();
    expect(createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });

  it('redirects to /unauthorized when no session exists', () => {
    run();
    expect(createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });

  it('does NOT grant via tenant_admin capabilities (role gate, not capability gate)', () => {
    // tenant_admin holds tenant:manage but is NOT a platform operator —
    // the wizard must stay hidden per Phase-A ruling #5.
    userSig.set(buildUser(['TENANT_ADMIN']));
    run();
    expect(createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });
});
