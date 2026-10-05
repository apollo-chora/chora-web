import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { WebAuthnService } from '../../../../core/auth/webauthn.service';
import { WebAuthnCredentialResponse } from '../../../../core/auth/auth.models';
import { isApiError } from '../../../../core/interceptors/api-error.model';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';

/**
 * /settings/security — passkey registration (Phase A4 FE seam).
 *
 * Passkeys: thin wrapper over WebAuthnService's CURRENT public API
 * (register/login/isSupported — no list/delete yet; the backend
 * completion is CHO-1718/A4, owned by a parallel agent). Registration
 * uses the session GCID and surfaces the created credential inline.
 *
 * TOTP MFA enrolment was REMOVED with the Firebase Identity Platform
 * extraction: the second factor lived entirely inside Firebase's
 * multiFactor SDK and the gateway publishes no TOTP routes, so the
 * enrolment flow had no server-side equivalent.
 */
@Component({
  selector: 'chora-security-settings',
  imports: [FormsModule, TranslatePipe],
  templateUrl: './security-settings.component.html',
  styleUrl: './security-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecuritySettingsComponent implements OnInit {
  private readonly webAuthn = inject(WebAuthnService);
  private readonly auth = inject(AuthService);

  // ── Passkey state ───────────────────────────────────────────────────
  readonly webAuthnSupported = signal(false);
  readonly passkeyBusy = signal(false);
  readonly passkeyError = signal<string | null>(null);
  readonly registeredPasskey = signal<WebAuthnCredentialResponse | null>(null);

  ngOnInit(): void {
    this.webAuthnSupported.set(this.webAuthn.isSupported());
  }

  registerPasskey(): void {
    const gcid = this.auth.gcid();
    if (!gcid) {
      this.passkeyError.set('identity.passkey-setup.error');
      return;
    }
    this.passkeyBusy.set(true);
    this.passkeyError.set(null);
    this.webAuthn.register(gcid).subscribe({
      next: (credential) => {
        this.registeredPasskey.set(credential);
        this.passkeyBusy.set(false);
      },
      error: (err: unknown) => {
        this.passkeyBusy.set(false);
        this.passkeyError.set(
          isApiError(err) ? err.message : 'identity.passkey-setup.error',
        );
      },
    });
  }
}
