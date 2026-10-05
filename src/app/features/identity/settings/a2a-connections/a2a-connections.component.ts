/**
 * A2AConnectionsComponent — consent revocation and management page.
 *
 * Settings > Privacy > A2A Connections. Lists active grants with
 * scope modification, activity log, and revocation with confirmation.
 *
 * @see docs/design/ux_a2a_protocol.md (Consent revocation flow)
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { A2AConsentService } from '../../../choraverse/services/a2a-consent.service';
import {
  A2AConsent,
  ConsentScope,
  CONSENT_SCOPE_LABELS,
  CONSENT_SCOPE_DESCRIPTIONS,
  A2A_SKILL_LABELS,
  CONSENT_DURATION_LABELS,
  ConsentScopeModification,
} from '../../../admin/a2a/models/a2a.model';

@Component({
  selector: 'chora-a2a-connections',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './a2a-connections.component.html',
  styleUrl: './a2a-connections.component.scss',
})
export class A2AConnectionsComponent implements OnInit, OnDestroy {
  private readonly consentService = inject(A2AConsentService);
  private subscriptions = new Subscription();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Currently expanded grant (for detail view) */
  readonly expandedGrantId = signal<string | null>(null);

  /** Revocation confirmation dialog */
  readonly revokeDialogGrant = signal<A2AConsent | null>(null);

  /** Scope modification dialog */
  readonly scopeModifyGrant = signal<A2AConsent | null>(null);

  /** Selected new scope for modification */
  readonly newScope = signal<ConsentScope | null>(null);

  /** Typed revoke confirmation text (for full_persona) */
  readonly revokeConfirmText = signal('');

  /** WebAuthn error */
  readonly webauthnError = signal<string | null>(null);

  /** Label maps */
  readonly scopeLabels = CONSENT_SCOPE_LABELS;
  readonly scopeDescriptions = CONSENT_SCOPE_DESCRIPTIONS;
  readonly skillLabels = A2A_SKILL_LABELS;
  readonly durationLabels = CONSENT_DURATION_LABELS;

  /** All scope values for modification */
  readonly allScopes = Object.values(ConsentScope);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  readonly activeGrants = this.consentService.activeGrants;
  readonly activityLog = this.consentService.activityLog;
  readonly isSubmitting = this.consentService.isSubmitting;

  readonly isRevokeDialogOpen = computed(() => this.revokeDialogGrant() !== null);
  readonly isScopeModifyOpen = computed(() => this.scopeModifyGrant() !== null);

  /** Whether the typed REVOKE text matches (for full_persona scope grants) */
  readonly isRevokeConfirmed = computed(() => {
    const grant = this.revokeDialogGrant();
    if (!grant) return false;
    if (grant.scope === ConsentScope.FullPersona) {
      return this.revokeConfirmText().toUpperCase() === 'REVOKE';
    }
    return true;
  });

  /** Whether the expanded grant has activity log loaded */
  readonly hasActivityLog = computed(() => this.activityLog().length > 0);

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    this.subscriptions.add(
      this.consentService.getActiveGrants().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  toggleGrant(grantId: string): void {
    const current = this.expandedGrantId();
    if (current === grantId) {
      this.expandedGrantId.set(null);
    } else {
      this.expandedGrantId.set(grantId);
      this.subscriptions.add(
        this.consentService.getActivityLog(grantId).subscribe(),
      );
    }
  }

  isExpanded(grantId: string): boolean {
    return this.expandedGrantId() === grantId;
  }

  // ---- Revocation ----

  openRevokeDialog(grant: A2AConsent): void {
    this.revokeDialogGrant.set(grant);
    this.revokeConfirmText.set('');
    this.webauthnError.set(null);
  }

  closeRevokeDialog(): void {
    this.revokeDialogGrant.set(null);
    this.revokeConfirmText.set('');
    this.webauthnError.set(null);
  }

  updateRevokeConfirmText(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.revokeConfirmText.set(input.value);
  }

  confirmRevoke(): void {
    const grant = this.revokeDialogGrant();
    if (!grant) return;

    this.subscriptions.add(
      this.consentService.revokeConsent(grant.id).subscribe({
        next: () => this.closeRevokeDialog(),
        error: () => {
          this.webauthnError.set('a2a.connections.revoke_failed');
        },
      }),
    );
  }

  // ---- Scope modification ----

  openScopeModify(grant: A2AConsent): void {
    this.scopeModifyGrant.set(grant);
    this.newScope.set(grant.scope);
    this.webauthnError.set(null);
  }

  closeScopeModify(): void {
    this.scopeModifyGrant.set(null);
    this.newScope.set(null);
    this.webauthnError.set(null);
  }

  selectNewScope(scope: ConsentScope): void {
    this.newScope.set(scope);
  }

  async confirmScopeModify(): Promise<void> {
    const grant = this.scopeModifyGrant();
    const scope = this.newScope();
    if (!grant || !scope || scope === grant.scope) return;

    this.webauthnError.set(null);

    try {
      const credential = await this.performWebAuthn();

      const modification: ConsentScopeModification = {
        consentId: grant.id,
        newScope: scope,
        webauthnCredential: credential,
      };

      this.subscriptions.add(
        this.consentService.modifyScope(modification).subscribe({
          next: () => this.closeScopeModify(),
          error: () => {
            this.webauthnError.set('a2a.connections.scope_modify_failed');
          },
        }),
      );
    } catch {
      this.webauthnError.set('a2a.connections.webauthn_failed');
    }
  }

  // ---- Utility ----

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  formatDateTime(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  requiresTypedRevoke(grant: A2AConsent): boolean {
    return grant.scope === ConsentScope.FullPersona;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async performWebAuthn(): Promise<string> {
    if (!navigator.credentials) {
      throw new Error('WebAuthn not supported');
    }

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        timeout: 60000,
        userVerification: 'required',
        rpId: window.location.hostname,
      },
    });

    return credential?.id ?? '';
  }
}
