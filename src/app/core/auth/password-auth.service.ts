import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BffClientService } from '../services/bff-client.service';
import { AuthTokenResponse } from './auth.models';

/**
 * Username/password sign-in against the chora-gateway session mint.
 *
 * Frozen contract (chora-gateway `POST /api/v1/auth/session/mint`):
 *
 *   Request:  { "username": "...", "password": "..." }
 *   200:      { access_token, token_type:"Bearer", expires_in,
 *              refresh_token, refresh_expires_in, gcid, memberships }
 *   401:      { error: { code: "INVALID_CREDENTIALS", message } }
 *
 * The returned `access_token` IS the Chora session JWT — feed it to
 * `AuthService.handleAuthResponse` exactly like every other mint result. The
 * JWT's `tenant_id` and `roles` claims are authoritative; this service never
 * invents or overrides a tenant.
 *
 * The `refresh_token` is the durable half of the session: `AuthService`
 * persists it so a reload or the 1h access-token expiry can re-mint without
 * a password.
 */
@Injectable({ providedIn: 'root' })
export class PasswordAuthService {
  private readonly bff = inject(BffClientService);

  /**
   * Username/password auth is always available — it is the gateway's own
   * credential check against chora-identity, not a hosted IdP that needs
   * console provisioning.
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Exchange a username/password pair for a Chora session. Resolves to the
   * mint envelope on 200; rejects with the gateway's error envelope (e.g.
   * `INVALID_CREDENTIALS`) on 401 so callers can surface the message.
   */
  async signInWithPassword(
    username: string,
    password: string,
  ): Promise<AuthTokenResponse> {
    return firstValueFrom(
      this.bff.post<AuthTokenResponse>('/api/v1/auth/session/mint', {
        username,
        password,
      }),
    );
  }

  /**
   * Clears the client-side session. The refresh token lives in
   * `AuthService`'s storage (dropped by `AuthService.clearAuth()`); the
   * gateway's `/api/v1/auth/logout` call happens in `AuthService.logout`.
   */
  async signOut(): Promise<void> {
    /* nothing client-side to clear here — see AuthService */
  }
}
