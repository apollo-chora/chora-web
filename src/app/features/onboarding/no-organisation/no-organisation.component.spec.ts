import { describe, it, expect, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { NoOrganisationComponent } from './no-organisation.component';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * NoOrganisationComponent spec, the named refusal at /welcome/no-organisation.
 *
 * This screen replaces a form whose only possible outcome was 409
 * already-member. The tests below pin the two things that make the
 * replacement worth having: it shows the identity error code when one
 * reached it, and it never navigates on its own, because the auth guard
 * sends users here and a self-redirect would loop straight back.
 */

class StubAuthService {
  logoutCalls = 0;
  logout(): void {
    this.logoutCalls += 1;
  }
}

function setup(code?: string): {
  fixture: ComponentFixture<NoOrganisationComponent>;
  el: HTMLElement;
  auth: StubAuthService;
  navigate: ReturnType<typeof vi.fn>;
} {
  const auth = new StubAuthService();
  const navigate = vi.fn().mockResolvedValue(true);
  TestBed.configureTestingModule({
    imports: [NoOrganisationComponent],
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: { navigate } },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(convertToParamMap(code ? { code } : {})),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(NoOrganisationComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, auth, navigate };
}

describe('NoOrganisationComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the identity error code verbatim when one reached it', () => {
    // Shown as sent so a user can quote it and an operator can grep for it.
    const { el } = setup('IDENTITY_ENROL_FAILED');
    expect(el.querySelector('[data-error-code]')?.textContent).toContain(
      'IDENTITY_ENROL_FAILED',
    );
  });

  it('shows the other identity fault code the same way', () => {
    const { el } = setup('IDENTITY_TENANCY_UNAVAILABLE');
    expect(el.querySelector('[data-error-code]')?.textContent).toContain(
      'IDENTITY_TENANCY_UNAVAILABLE',
    );
  });

  it('shows no code block when the guard sent the user here without one', () => {
    // Absence is informative rather than an error: the session resolved and
    // simply carried no organisation. An empty code line would read as a bug.
    const { el, fixture } = setup();
    expect(el.querySelector('[data-error-code]')).toBeNull();
    expect(fixture.componentInstance.hasCode()).toBe(false);
    expect(fixture.componentInstance.code()).toBe('');
  });

  it('does not navigate on its own', () => {
    // The guard routes here. Any self-navigation on init would bounce the
    // user straight back and loop.
    const { navigate } = setup('IDENTITY_ENROL_FAILED');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('retries by returning to the landing resolver, not by reloading itself', () => {
    // Only a fresh resolve can change the answer, so re-rendering this screen
    // would be a button that cannot work.
    const { el, navigate } = setup();
    (el.querySelector('[data-retry]') as HTMLButtonElement | null)?.click();
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('offers a sign-out that actually signs out', () => {
    const { el, auth } = setup();
    (el.querySelector('[data-sign-out]') as HTMLButtonElement | null)?.click();
    expect(auth.logoutCalls).toBe(1);
  });

  it('announces itself to assistive tech as an alert', () => {
    const { el } = setup();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });
});
