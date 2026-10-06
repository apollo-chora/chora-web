/**
 * H+ Identity Provider Federation — Wave 4 (CHO-1694).
 *
 * Wave 3 shipped 4 static cards (Microsoft / Google / Singpass / SAML);
 * Wave 4 wires them to `chora-identity` via `TenantIdpAdminService`:
 *   - On mount, GET /api/v1/tenants/me/idp-providers → render real state.
 *   - Connect CTA opens an inline form → POST upsert → reload.
 *   - Disconnect CTA confirms → DELETE /idp-providers/{providerType} → reload.
 *   - Test Connection is intentionally DISABLED — the live handshake
 *     endpoint is a separate follow-up (see CHO-1694 "Out of scope").
 *
 * Microsoft vs Google distinction (both are OIDC on the BE schema —
 * one row per tenant + provider_type): the card whose well-known URL
 * the persisted `discovery_url` contains is the "connected" one; the
 * sibling card is "disconnected". Connecting the sibling REPLACES the
 * row (the upsert is keyed on provider_type). UX trade-off acknowledged
 * in the Jira description — the alternative is multi-OIDC support which
 * is deferred.
 *
 * client_secret is INTENTIONALLY NOT held in the component after a
 * successful upsert — Secret Manager invariant carries through from
 * CHO-1692 (the field is cleared after the POST). Re-disconnect →
 * re-connect requires re-entering the secret.
 */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { TenantIdpAdminService } from '../../../admin/tenant-admin/services/tenant-idp-admin.service';
import type {
  IdpProviderRow,
  ProviderType,
} from '../../../admin/tenant-admin/models/tenant-idp-admin.model';

export type IdpId = 'microsoft' | 'google' | 'singpass' | 'saml';
export type IdpState = 'connected' | 'pending' | 'disconnected';

/** Per-card view-model surfaced to the template. */
interface IdpCardVm {
  readonly id: IdpId;
  readonly nameKey: string;
  readonly icon: string;
  state: IdpState;
  /**
   * `client_secret_name` from the persisted row (when applicable) —
   * surfaces a "secret already configured" affordance without exposing
   * the value.
   */
  clientSecretName: string | null;
  readonly noteKey: string | null;
}

/** Connect-form state when a card is being configured. */
interface ConnectFormState {
  readonly cardId: IdpId;
  readonly providerType: ProviderType;
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  singpassEnabled: boolean;
  submitting: boolean;
  errorMessage: string | null;
}

const MICROSOFT_DISCOVERY_PREFIX = 'https://login.microsoftonline.com';
const GOOGLE_DISCOVERY_PREFIX = 'https://accounts.google.com';

@Component({
  selector: 'chora-hplus-idp',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './idp-federation.component.html',
  styleUrl: './idp-federation.component.scss',
})
export class IdpFederationComponent {
  private readonly idpSvc = inject(TenantIdpAdminService);
  private readonly toast = inject(ToastService);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  /** Active inline connect-form, if any. Only one card at a time. */
  readonly connectForm = signal<ConnectFormState | null>(null);

  /** Currently-pending disconnect (card id), drives a confirm-overlay state. */
  readonly disconnectPending = signal<IdpId | null>(null);

  /** 4-card view-model derived from the server response. */
  private readonly _cards = signal<readonly IdpCardVm[]>(this.buildDefaultCards());
  readonly cards = this._cards.asReadonly();

  constructor() {
    this.reload();
  }

  // ---------------------------------------------------------------------------
  // Hydration
  // ---------------------------------------------------------------------------

  /**
   * Fetches active IdP rows + maps them onto the 4-card view-model.
   * Public so the connect / disconnect flows can call it post-mutation.
   */
  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.idpSvc.list().subscribe({
      next: (result) => {
        this.loading.set(false);
        switch (result.kind) {
          case 'success':
            this._cards.set(this.mapRowsToCards(result.rows));
            return;
          case 'unauthenticated':
            this.loadError.set('hplus.idp.unauthenticated');
            return;
          case 'server-error':
          case 'network-error':
            this.loadError.set('hplus.idp.serverError');
            return;
        }
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('hplus.idp.serverError');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Card derivation
  // ---------------------------------------------------------------------------

  private buildDefaultCards(): readonly IdpCardVm[] {
    return [
      // CHO-1808 — each card carries a noteKey explaining the
      // platform-vs-tenant distinction (per the page-level disclaimer).
      // Microsoft/Google/Singpass have a platform-level sibling on
      // /login; SAML has no platform-level equivalent.
      {
        id: 'microsoft',
        nameKey: 'hplus.idp.microsoft',
        icon: 'fa-microsoft',
        state: 'disconnected',
        clientSecretName: null,
        noteKey: 'hplus.idp.microsoftNote',
      },
      {
        id: 'google',
        nameKey: 'hplus.idp.google',
        icon: 'fa-google',
        state: 'disconnected',
        clientSecretName: null,
        noteKey: 'hplus.idp.googleNote',
      },
      {
        id: 'singpass',
        nameKey: 'hplus.idp.singpass',
        icon: 'fa-id-card',
        state: 'disconnected',
        clientSecretName: null,
        noteKey: 'hplus.idp.singpassNote',
      },
      {
        id: 'saml',
        nameKey: 'hplus.idp.saml',
        icon: 'fa-shield-halved',
        state: 'disconnected',
        clientSecretName: null,
        noteKey: 'hplus.idp.samlNote',
      },
    ];
  }

  private mapRowsToCards(
    rows: readonly IdpProviderRow[],
  ): readonly IdpCardVm[] {
    const cards = this.buildDefaultCards().map((c) => ({ ...c }));
    const oidcRow = rows.find((r) => r.provider_type === 'oidc');
    const samlRow = rows.find((r) => r.provider_type === 'saml');
    const singpassRow = rows.find((r) => r.provider_type === 'singpass');

    if (oidcRow) {
      const url = oidcRow.discovery_url ?? '';
      if (url.startsWith(MICROSOFT_DISCOVERY_PREFIX)) {
        const card = cards.find((c) => c.id === 'microsoft')!;
        card.state = 'connected';
        card.clientSecretName = oidcRow.client_secret_name ?? null;
      } else if (url.startsWith(GOOGLE_DISCOVERY_PREFIX)) {
        const card = cards.find((c) => c.id === 'google')!;
        card.state = 'connected';
        card.clientSecretName = oidcRow.client_secret_name ?? null;
      } else {
        // Generic OIDC row that doesn't match the well-known prefixes —
        // attach it to the Microsoft card for visibility. Future story:
        // surface a generic "OIDC" card when neither MS nor Google.
        const card = cards.find((c) => c.id === 'microsoft')!;
        card.state = 'connected';
        card.clientSecretName = oidcRow.client_secret_name ?? null;
      }
    }

    if (samlRow) {
      const card = cards.find((c) => c.id === 'saml')!;
      card.state = 'connected';
    }

    if (singpassRow) {
      const card = cards.find((c) => c.id === 'singpass')!;
      card.state = singpassRow.singpass_enabled ? 'connected' : 'pending';
    }

    return cards;
  }

  // ---------------------------------------------------------------------------
  // Connect flow
  // ---------------------------------------------------------------------------

  openConnectForm(cardId: IdpId): void {
    const providerType = this.providerTypeFor(cardId);
    const defaultDiscovery = this.defaultDiscoveryFor(cardId);
    this.connectForm.set({
      cardId,
      providerType,
      clientId: '',
      clientSecret: '',
      discoveryUrl: defaultDiscovery,
      singpassEnabled: cardId === 'singpass',
      submitting: false,
      errorMessage: null,
    });
  }

  cancelConnectForm(): void {
    this.connectForm.set(null);
  }

  updateConnectField<K extends keyof ConnectFormState>(
    key: K,
    value: ConnectFormState[K],
  ): void {
    this.connectForm.update((f) => (f ? { ...f, [key]: value } : f));
  }

  submitConnectForm(): void {
    const form = this.connectForm();
    if (!form || form.submitting) return;
    this.connectForm.update((f) =>
      f ? { ...f, submitting: true, errorMessage: null } : f,
    );
    this.idpSvc
      .upsert({
        provider_type: form.providerType,
        client_id: form.clientId || undefined,
        client_secret: form.clientSecret || undefined,
        discovery_url: form.discoveryUrl || undefined,
        singpass_enabled:
          form.providerType === 'singpass' ? form.singpassEnabled : undefined,
      })
      .subscribe({
        next: (result) => {
          switch (result.kind) {
            case 'success':
              this.connectForm.set(null);
              this.toast.show('hplus.idp.connectedToast', 'success');
              this.reload();
              return;
            case 'invalid':
              this.connectForm.update((f) =>
                f
                  ? { ...f, submitting: false, errorMessage: result.message }
                  : f,
              );
              return;
            case 'unauthenticated':
              this.connectForm.set(null);
              this.toast.show('hplus.idp.unauthenticated', 'error');
              return;
            case 'secret-manager-failed':
              this.connectForm.update((f) =>
                f
                  ? { ...f, submitting: false, errorMessage: result.message }
                  : f,
              );
              return;
            case 'server-error':
            case 'network-error':
              this.connectForm.update((f) =>
                f
                  ? {
                      ...f,
                      submitting: false,
                      errorMessage: 'hplus.idp.serverError',
                    }
                  : f,
              );
              return;
          }
        },
        error: () => {
          this.connectForm.update((f) =>
            f
              ? {
                  ...f,
                  submitting: false,
                  errorMessage: 'hplus.idp.serverError',
                }
              : f,
          );
        },
      });
  }

  // ---------------------------------------------------------------------------
  // Disconnect flow
  // ---------------------------------------------------------------------------

  requestDisconnect(cardId: IdpId): void {
    this.disconnectPending.set(cardId);
  }

  cancelDisconnect(): void {
    this.disconnectPending.set(null);
  }

  confirmDisconnect(): void {
    const cardId = this.disconnectPending();
    if (!cardId) return;
    const providerType = this.providerTypeFor(cardId);
    this.idpSvc.delete(providerType).subscribe({
      next: (result) => {
        switch (result.kind) {
          case 'success':
            this.disconnectPending.set(null);
            this.toast.show('hplus.idp.disconnectedToast', 'success');
            this.reload();
            return;
          case 'not-found':
            // Row already gone — treat as success; refresh to reflect.
            this.disconnectPending.set(null);
            this.reload();
            return;
          case 'invalid':
          case 'server-error':
          case 'network-error':
            this.disconnectPending.set(null);
            this.toast.show('hplus.idp.serverError', 'error');
            return;
          case 'unauthenticated':
            this.disconnectPending.set(null);
            this.toast.show('hplus.idp.unauthenticated', 'error');
            return;
        }
      },
      error: () => {
        this.disconnectPending.set(null);
        this.toast.show('hplus.idp.serverError', 'error');
      },
    });
  }

  // ---------------------------------------------------------------------------
  // View helpers
  // ---------------------------------------------------------------------------

  badgeClass(state: IdpState): string {
    switch (state) {
      case 'connected':
        return 'badge badge-success';
      case 'pending':
        return 'badge badge-warning';
      case 'disconnected':
        return 'badge badge-muted';
    }
  }

  stateLabelKey(state: IdpState): string {
    return `hplus.idp.state.${state}`;
  }

  // ---------------------------------------------------------------------------
  // Mapping helpers
  // ---------------------------------------------------------------------------

  private providerTypeFor(cardId: IdpId): ProviderType {
    if (cardId === 'singpass') return 'singpass';
    if (cardId === 'saml') return 'saml';
    return 'oidc';
  }

  private defaultDiscoveryFor(cardId: IdpId): string {
    if (cardId === 'microsoft') {
      return `${MICROSOFT_DISCOVERY_PREFIX}/common/v2.0/.well-known/openid-configuration`;
    }
    if (cardId === 'google') {
      return `${GOOGLE_DISCOVERY_PREFIX}/.well-known/openid-configuration`;
    }
    return '';
  }
}
