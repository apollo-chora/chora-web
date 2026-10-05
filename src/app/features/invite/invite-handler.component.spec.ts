import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { InviteHandlerComponent } from './invite-handler.component';
import { AuthService } from '../../core/auth/auth.service';
import { PendingActionService } from '../../core/services/pending-action.service';
import { LandingService } from '../../core/auth/landing.service';
/**
 * C2 slice 3 (ADR-240): this screen no longer decides where an authenticated
 * session lands. It asks `LandingService`, the ONE landing resolver, and uses
 * whatever comes back. The stub returns a sentinel no hard-coded fallback
 * could ever produce, so this asserts DELEGATION rather than re-testing the
 * resolver's rules (those live in `core/auth/landing.service.spec.ts`).
 */
const RESOLVED_LANDING = '/resolved-landing';
const landingStub = { landingRoute: () => RESOLVED_LANDING };


describe('InviteHandlerComponent', () => {
  function setup(
    params: Record<string, string>,
    data: Record<string, unknown>,
    authenticated = false,
  ) {
    TestBed.resetTestingModule();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [InviteHandlerComponent],
      providers: [
        { provide: LandingService, useValue: landingStub },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: (key: string) => params[key] ?? null },
              data,
            },
          },
        },
      ],
    });

    const auth = TestBed.inject(AuthService);
    if (authenticated) {
      auth.setUser(
        { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'Test', email: 'test@example.com' },
        'token',
      );
    }

    const fixture = TestBed.createComponent(InviteHandlerComponent);
    fixture.detectChanges();

    return {
      router: TestBed.inject(Router),
      pendingAction: TestBed.inject(PendingActionService),
    };
  }

  it('should capture referral code and redirect to login', () => {
    const { router, pendingAction } = setup({ code: 'REF-123' }, { actionType: 'referral' });
    expect(pendingAction.action()?.code).toBe('REF-123');
    expect(pendingAction.action()?.type).toBe('referral');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should capture invite code and redirect to login', () => {
    const { router, pendingAction } = setup({ code: 'INV-456' }, { actionType: 'invite' });
    expect(pendingAction.action()?.code).toBe('INV-456');
    expect(pendingAction.action()?.type).toBe('invite');
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('redirects an authenticated visitor to the landing resolver answer', () => {
    const { router, pendingAction } = setup(
      { code: 'REF-789' },
      { actionType: 'referral' },
      true,
    );
    expect(pendingAction.action()?.code).toBe('REF-789');
    expect(router.navigate).toHaveBeenCalledWith([RESOLVED_LANDING]);
  });
});
