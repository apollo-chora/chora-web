import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from './auth.service';

describe('roleGuard', () => {
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: Router, useValue: { createUrlTree: vi.fn((commands: string[]) => commands) } },
      ],
    });
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('should allow when user has capability', () => {
    authService.setUser(
      {
        gcid: 'g1',
        tenantId: 't1',
        roles: ['admin'],
        capabilities: ['tenant:manage'],
        displayName: 'Admin',
        email: 'admin@example.com',
      },
      'token',
    );

    const guard = roleGuard('tenant:manage');
    const result = TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    expect(result).toBe(true);
  });

  it('should redirect to /unauthorized when user lacks capability', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: ['learner'], capabilities: [], displayName: 'Learner', email: 'learner@example.com' },
      'token',
    );

    const guard = roleGuard('tenant:manage');
    TestBed.runInInjectionContext(() => guard({} as never, {} as never));
    expect(router.createUrlTree).toHaveBeenCalledWith(['/unauthorized']);
  });
});
