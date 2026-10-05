import { Injectable, inject } from '@angular/core';
import { Observable, from, switchMap } from 'rxjs';
import { BffClientService } from '../services/bff-client.service';
import {
  AuthTokenResponse,
  WebAuthnRegistrationOptions,
  WebAuthnLoginOptions,
  WebAuthnCredentialResponse,
} from './auth.models';

/**
 * Begin-route envelopes per chora-contracts/openapi/auth-gateway.yaml
 * (WebAuthnOptionsResponse): the gateway returns the W3C options PLUS a
 * server-side single-use `challenge_id` that MUST be echoed back on the
 * matching finish call — the options object itself is consumed by
 * `navigator.credentials` and never returns to the server.
 *
 * Declared locally (intersection with the shared models) so this file stays
 * self-contained while the shared auth.models.ts is owned by the UI build-out.
 */
type WebAuthnRegisterBeginResponse = WebAuthnRegistrationOptions & { challenge_id?: string };
type WebAuthnLoginBeginResponse = WebAuthnLoginOptions & { challenge_id?: string };

/**
 * Passkey ceremonies against the chora-gateway BFF (auth-hardening Phase A4,
 * ADR-181 D2, CHO-1718):
 *
 *   POST /api/v1/auth/webauthn/register/begin   (authenticated — passkey is
 *   POST /api/v1/auth/webauthn/register/finish   added to the EXISTING account)
 *   POST /api/v1/auth/webauthn/login/begin      (anonymous)
 *   POST /api/v1/auth/webauthn/login/finish     (anonymous → AuthTokenResponse,
 *                                                same shape as the session mint)
 *
 * login() resolves to the standard AuthTokenResponse — feed it to
 * AuthService.handleAuthResponse exactly like any other mint result; the
 * session JWT carries gcid + tenant_id + roles (the dev tenant-less token is
 * dead).
 */
@Injectable({ providedIn: 'root' })
export class WebAuthnService {
  private readonly bff = inject(BffClientService);

  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined' &&
      typeof navigator.credentials !== 'undefined'
    );
  }

  /**
   * Full registration ceremony for the signed-in user (gcid must match the
   * session's gcid claim — the gateway enforces it). Requires an
   * authenticated Chora session: the register routes are JWT-gated.
   */
  register(gcid: string): Observable<WebAuthnCredentialResponse> {
    return this.bff
      .post<WebAuthnRegisterBeginResponse>('/api/v1/auth/webauthn/register/begin', { gcid })
      .pipe(
        switchMap((beginResponse) =>
          from(
            navigator.credentials.create({
              publicKey: this.decodeCreationOptions(beginResponse.options),
            }),
          ).pipe(
            switchMap((credential) => {
              const pubKeyCred = credential as PublicKeyCredential;
              const response = pubKeyCred.response as AuthenticatorAttestationResponse;
              return this.bff.post<WebAuthnCredentialResponse>(
                '/api/v1/auth/webauthn/register/finish',
                {
                  gcid,
                  challenge_id: beginResponse.challenge_id,
                  attestation_response: {
                    id: pubKeyCred.id,
                    rawId: this.bufferToBase64url(pubKeyCred.rawId),
                    type: pubKeyCred.type,
                    response: {
                      attestationObject: this.bufferToBase64url(response.attestationObject),
                      clientDataJSON: this.bufferToBase64url(response.clientDataJSON),
                    },
                  },
                },
              );
            }),
          ),
        ),
      );
  }

  /**
   * Full login ceremony. Anonymous; the email hint is optional (discoverable
   * credentials let the authenticator pick). Resolves to the standard
   * AuthTokenResponse minted by the gateway's shared session-mint pipeline.
   */
  login(email?: string): Observable<AuthTokenResponse> {
    return this.bff
      .post<WebAuthnLoginBeginResponse>('/api/v1/auth/webauthn/login/begin', { email })
      .pipe(
        switchMap((beginResponse) =>
          from(
            navigator.credentials.get({
              publicKey: this.decodeRequestOptions(beginResponse.options),
            }),
          ).pipe(
            switchMap((credential) => {
              const pubKeyCred = credential as PublicKeyCredential;
              const response = pubKeyCred.response as AuthenticatorAssertionResponse;
              return this.bff.post<AuthTokenResponse>('/api/v1/auth/webauthn/login/finish', {
                challenge_id: beginResponse.challenge_id,
                email,
                assertion_response: {
                  id: pubKeyCred.id,
                  rawId: this.bufferToBase64url(pubKeyCred.rawId),
                  type: pubKeyCred.type,
                  response: {
                    authenticatorData: this.bufferToBase64url(response.authenticatorData),
                    clientDataJSON: this.bufferToBase64url(response.clientDataJSON),
                    signature: this.bufferToBase64url(response.signature),
                    userHandle: response.userHandle
                      ? this.bufferToBase64url(response.userHandle)
                      : null,
                  },
                },
              });
            }),
          ),
        ),
      );
  }

  bufferToBase64url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  base64urlToBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private decodeCreationOptions(
    options: Record<string, unknown>,
  ): PublicKeyCredentialCreationOptions {
    const decoded = { ...options } as Record<string, unknown>;
    if (typeof decoded['challenge'] === 'string') {
      decoded['challenge'] = this.base64urlToBuffer(decoded['challenge'] as string);
    }
    if (decoded['user'] && typeof (decoded['user'] as Record<string, unknown>)['id'] === 'string') {
      (decoded['user'] as Record<string, unknown>)['id'] = this.base64urlToBuffer(
        (decoded['user'] as Record<string, unknown>)['id'] as string,
      );
    }
    return decoded as unknown as PublicKeyCredentialCreationOptions;
  }

  private decodeRequestOptions(
    options: Record<string, unknown>,
  ): PublicKeyCredentialRequestOptions {
    const decoded = { ...options } as Record<string, unknown>;
    if (typeof decoded['challenge'] === 'string') {
      decoded['challenge'] = this.base64urlToBuffer(decoded['challenge'] as string);
    }
    if (Array.isArray(decoded['allowCredentials'])) {
      decoded['allowCredentials'] = (
        decoded['allowCredentials'] as Record<string, unknown>[]
      ).map((cred) => ({
        ...cred,
        id:
          typeof cred['id'] === 'string' ? this.base64urlToBuffer(cred['id'] as string) : cred['id'],
      }));
    }
    return decoded as unknown as PublicKeyCredentialRequestOptions;
  }
}
