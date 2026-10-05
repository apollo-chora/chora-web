import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { SecuritySettingsComponent } from './security-settings.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { WebAuthnService } from '../../../../core/auth/webauthn.service';
import { TranslateService } from '../../../../core/services/translate.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiError } from '../../../../core/interceptors/api-error.model';

describe('SecuritySettingsComponent', () => {
  let fixture: ComponentFixture<SecuritySettingsComponent>;
  let component: SecuritySettingsComponent;
  let webAuthnStub: {
    isSupported: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
  };
  const gcidSignal = signal<string | null>('gcid-42');

  async function build(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [SecuritySettingsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WebAuthnService, useValue: webAuthnStub },
        { provide: AuthService, useValue: { gcid: gcidSignal.asReadonly() } },
        TranslateService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SecuritySettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    gcidSignal.set('gcid-42');
    webAuthnStub = {
      isSupported: vi.fn().mockReturnValue(true),
      register: vi
        .fn()
        .mockReturnValue(of({ id: 'cred-1', gcid: 'gcid-42', created_at: '2026-06-11T00:00:00Z' })),
    };
  });

  it('should create', async () => {
    await build();
    expect(component).toBeTruthy();
    expect(component.webAuthnSupported()).toBe(true);
  });

  // ── Passkey panel (thin A4 FE seam over WebAuthnService) ─────────────

  it('registers a passkey for the session GCID and shows the credential', async () => {
    await build();

    component.registerPasskey();
    fixture.detectChanges();

    expect(webAuthnStub.register).toHaveBeenCalledWith('gcid-42');
    expect(component.registeredPasskey()).toEqual({
      id: 'cred-1',
      gcid: 'gcid-42',
      created_at: '2026-06-11T00:00:00Z',
    });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="security-passkey-registered"]')).not.toBeNull();
  });

  it('surfaces the ApiError message when passkey registration fails', async () => {
    webAuthnStub.register.mockReturnValue(
      throwError(
        () =>
          new ApiError(500, {
            code: 'IAM_WEBAUTHN_REGISTRATION_FAILED',
            message: 'Registration failed upstream',
            correlation_id: 'corr-pk',
          }),
      ),
    );
    await build();

    component.registerPasskey();

    expect(component.passkeyError()).toBe('Registration failed upstream');
    expect(component.passkeyBusy()).toBe(false);
  });

  it('shows the generic passkey error when no GCID is in session', async () => {
    gcidSignal.set(null);
    await build();

    component.registerPasskey();

    expect(webAuthnStub.register).not.toHaveBeenCalled();
    expect(component.passkeyError()).toBe('identity.passkey-setup.error');
  });

  it('hides the register button and shows the unsupported note when WebAuthn is unavailable', async () => {
    webAuthnStub.isSupported.mockReturnValue(false);
    await build();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="security-passkey-register-btn"]')).toBeNull();
    expect(el.querySelector('[data-testid="security-passkey-unsupported"]')).not.toBeNull();
  });

  it('has 0 axe critical/serious violations', async () => {
    await build();
    fixture.detectChanges();

    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});
