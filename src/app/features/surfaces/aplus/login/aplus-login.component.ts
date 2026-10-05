import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { PasswordAuthService } from '../../../../core/auth/password-auth.service';
import { WebAuthnService } from '../../../../core/auth/webauthn.service';
import { isApiError } from '../../../../core/interceptors/api-error.model';
import { ReturnUrlService } from '../../../../core/services/return-url.service';
import { LandingService } from '../../../../core/auth/landing.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

/**
 * A+ surface login screen — Phyllis demo Step 1.
 *
 * Ports the canonical Stitch HTML at `.stitch-imports/aplus/login.html` to a
 * strict Angular 21+ standalone, signal-based, OnPush component.
 *
 * - Tablet-first (≥768px primary, ≥1280px desktop enhanced).
 * - Polyglass shell: `.glass-panel` + `.surface-aplus` for indigo→pink accent.
 * - Username + password sign-in goes straight to the chora-gateway session
 *   mint (`POST /api/v1/auth/session/mint`); the returned Chora session JWT
 *   is fed to `AuthService.handleAuthResponse`. The gateway resolves the
 *   tenant from the verified credentials — the frontend never guesses one.
 * - Passkey (WebAuthn) login talks to the gateway's webauthn routes
 *   directly and does not depend on any hosted IdP.
 *
 * REMOVED with the Firebase/Identity Platform extraction (no server-side
 * equivalent exists in the frozen gateway contract): Google/Microsoft/Singpass
 * social sign-in, email verification, password-reset email, TOTP MFA
 * challenge, and self-service registration.
 */
@Component({
  selector: 'chora-aplus-login',
  imports: [FormsModule, TranslatePipe],
  templateUrl: './aplus-login.component.html',
  styleUrl: './aplus-login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AplusLoginComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly passwordAuth = inject(PasswordAuthService);
  private readonly webAuthnService = inject(WebAuthnService);
  private readonly returnUrlService = inject(ReturnUrlService);
  private readonly router = inject(Router);
  private readonly landing = inject(LandingService);

  /** Two-way bound to the username <input> as a signal. */
  readonly username = signal('');
  /** Two-way bound to the password <input> as a signal. */
  readonly password = signal('');
  /** Show/hide password toggle. */
  readonly passwordVisible = signal(false);
  /** Loading state during async sign-in flow. */
  readonly isLoading = signal(false);
  /** i18n key or BFF-provided message for the error banner. */
  readonly errorMessage = signal<string | null>(null);
  /** Feature-detection result for WebAuthn (passkey support). */
  readonly webAuthnSupported = signal(false);

  ngOnInit(): void {
    this.webAuthnSupported.set(this.webAuthnService.isSupported());
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update((v) => !v);
  }

  /**
   * Username + password → gateway session mint → Chora session. A 401
   * (`INVALID_CREDENTIALS`) surfaces the gateway's message; any other
   * failure maps to the generic credentials error.
   */
  async loginWithPassword(): Promise<void> {
    const username = this.username().trim();
    const password = this.password();
    if (!username || !password) {
      this.errorMessage.set('identity.login.error_fields_required');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const session = await this.passwordAuth.signInWithPassword(username, password);
      this.authService.handleAuthResponse(session);
      this.navigateAfterLogin();
    } catch (err) {
      this.isLoading.set(false);
      this.errorMessage.set(
        isApiError(err) ? err.message : 'identity.login.error_credentials',
      );
    }
  }

  loginWithPasskey(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const hint = this.username().trim() || undefined;
    this.webAuthnService.login(hint).subscribe({
      next: (response) => {
        this.authService.handleAuthResponse(response);
        this.navigateAfterLogin();
      },
      error: (err: unknown) => {
        this.isLoading.set(false);
        this.errorMessage.set(
          isApiError(err) ? err.message : 'identity.login.error_passkey',
        );
      },
    });
  }

  private navigateAfterLogin(): void {
    this.isLoading.set(false);
    const returnUrl = this.returnUrlService.consume();
    this.router.navigateByUrl(returnUrl ?? this.landing.landingRoute());
  }
}
