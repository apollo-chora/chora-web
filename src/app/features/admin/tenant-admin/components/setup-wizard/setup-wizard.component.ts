/**
 * SetupWizardComponent — Multi-step tenant configuration wizard with branding,
 * add-on selection, identity provider setup, and review.
 *
 * Route: /h/setup (re-parented from admin/tenant/settings/wizard in E5;
 * the old path redirects here)
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type {
  BrandingConfig,
  IdentityProviderConfig,
  SetupWizardState,
} from '../../models/tenant-lifecycle.model';
import { TenantBrandingService } from '../../services/tenant-branding.service';
import type { BrandingUpdatePayload, BrandingUpdateResult } from '../../models/tenant-branding.model';
import { TenantEntitlementsReadbackService } from '../../services/tenant-entitlements-readback.service';
import {
  ADDONS_MANAGEMENT_PATH,
  EntitlementsReadbackResult,
} from '../../models/tenant-entitlements-readback.model';
import { TenantSetupService } from '../../services/tenant-setup.service';
import type { SetupApplyPayload, SetupApplyResult } from '../../models/tenant-setup.model';
import { TenantSetupHydrationService } from '../../services/tenant-setup-hydration.service';
import type {
  HydrationState,
  HydrationSources,
} from '../../models/tenant-setup-hydration.model';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const WIZARD_STEPS = ['branding', 'addons', 'identity', 'review'] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

interface AvailableAddOn {
  /** Catalogue code — MUST match a row in chora_tenancy.add_ons.code */
  code: string;
  /** i18n key for the user-facing label */
  name: string;
  /** i18n key for the short description shown under the label */
  description: string;
  /**
   * When true, the add-on is always-on for every tenant and cannot be
   * unticked. The wizard renders it disabled and omits it from the
   * POST body so the backend's "no demote of already-active" guard
   * is never even tested. Only `base` is always-on in the seed.
   */
  alwaysOn?: boolean;
}

// Aligned to chora-tenancy/internal/domain/add_on.NewSeedCatalogue
// (CHO-1665). Wizard payload codes MUST match the DB catalogue exactly
// — backend validates up-front and 400s with `unknown_addon_code` on
// any miss. Order here is the wizard's render order, NOT the seed's.
const AVAILABLE_ADD_ONS: AvailableAddOn[] = [
  { code: 'base', name: 'admin.wizard.addon_base', description: 'admin.wizard.addon_base_desc', alwaysOn: true },
  { code: 'tms', name: 'admin.wizard.addon_tms', description: 'admin.wizard.addon_tms_desc' },
  { code: 'cms', name: 'admin.wizard.addon_cms', description: 'admin.wizard.addon_cms_desc' },
  { code: 'kg_hexagonal', name: 'admin.wizard.addon_kg_hexagonal', description: 'admin.wizard.addon_kg_hexagonal_desc' },
  { code: 'familiar', name: 'admin.wizard.addon_familiar', description: 'admin.wizard.addon_familiar_desc' },
  { code: 'daily_dose', name: 'admin.wizard.addon_daily_dose', description: 'admin.wizard.addon_daily_dose_desc' },
  { code: 'pvp-arena', name: 'admin.wizard.addon_pvp_arena', description: 'admin.wizard.addon_pvp_arena_desc' },
  { code: 'course_application', name: 'admin.wizard.addon_course_application', description: 'admin.wizard.addon_course_application_desc' },
  { code: 'campus-ops', name: 'admin.wizard.addon_campus_ops', description: 'admin.wizard.addon_campus_ops_desc' },
  { code: 'ai_assist', name: 'admin.wizard.addon_ai_assist', description: 'admin.wizard.addon_ai_assist_desc' },
  { code: 'governance_dashboard', name: 'admin.wizard.addon_governance_dashboard', description: 'admin.wizard.addon_governance_dashboard_desc' },
  { code: 'marketplace', name: 'admin.wizard.addon_marketplace', description: 'admin.wizard.addon_marketplace_desc' },
];

@Component({
  selector: 'chora-setup-wizard',
  standalone: true,
  imports: [FormsModule, TranslatePipe, RouterLink],
  templateUrl: './setup-wizard.component.html',
  styleUrl: './setup-wizard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetupWizardComponent {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly brandingSvc = inject(TenantBrandingService);
  private readonly entitlementsSvc = inject(TenantEntitlementsReadbackService);
  private readonly setupSvc = inject(TenantSetupService);
  private readonly hydrationSvc = inject(TenantSetupHydrationService);

  constructor() {
    this.hydrate();
    this.loadGrantedAddOns();
  }

  // --- Steps ---
  readonly steps = WIZARD_STEPS;
  readonly currentStepIndex = signal(0);
  readonly currentStep = computed<WizardStep>(
    () => WIZARD_STEPS[this.currentStepIndex()] ?? 'branding',
  );

  // --- Branding (CHO-1655 Phase A — wire-shape names) ---
  readonly logoUrl = signal('');
  readonly primaryColorHex = signal('#2563eb');
  readonly brandingError = signal('');

  // --- Add-Ons: a READ-BACK of the durable grant, not a picker (E5 slice 2) ---
  //
  // The step used to write the operator's ticks to
  // `setup_wizard_addon_selections`. That table is this wizard's INTENT and it
  // is not the organisation's plan: tenant creation grants durably into
  // `add_on_subscriptions`, and chora-tenancy's own POST handler comment
  // records that the wizard leaves that table alone, so the two DIVERGE.
  // Rendering the intent would show an operator what somebody once ticked and
  // label it the plan. The step now reads the grant and sends changes to
  // /h/addons, which is the screen that actually manages it.
  readonly availableAddOns = AVAILABLE_ADD_ONS;
  readonly addonsManagementPath = ADDONS_MANAGEMENT_PATH;
  /** Granted codes, verbatim and in server order. */
  readonly entitlementCodes = signal<readonly string[]>([]);
  /**
   * Granted rows the server could not name (legacy `add_ons` rows predating
   * tenancy migration 0021). Shown rather than dropped: an operator told
   * "3 add-ons" when 4 are granted has been told something false.
   */
  readonly entitlementsUncodedCount = signal(0);
  readonly entitlementsLoading = signal(false);
  /** i18n key for an inline, retryable failure; empty when there is none. */
  readonly entitlementsError = signal('');

  /**
   * One row per granted code. `labelKey` is null when AVAILABLE_ADD_ONS, which
   * is a hardcoded list in this file, does not know the code: the template
   * then shows the raw code, because a grant the catalogue has not caught up
   * with is still part of the plan.
   */
  readonly grantedAddOns = computed<
    readonly { code: string; labelKey: string | null; descriptionKey: string | null }[]
  >(() =>
    this.entitlementCodes().map((code) => {
      const known = AVAILABLE_ADD_ONS.find((a) => a.code === code);
      return {
        code,
        labelKey: known?.name ?? null,
        descriptionKey: known?.description ?? null,
      };
    }),
  );

  // --- Identity ---
  readonly providerType = signal<'oidc' | 'singpass'>('oidc');
  readonly clientId = signal('');
  readonly clientSecret = signal('');
  readonly discoveryUrl = signal('');
  readonly singpassEnabled = signal(false);
  // Inline error surfaced on step 3 when identity validation fails
  // (invalid / unknown-provider-type result kinds from CHO-1682's BFF).
  readonly identityError = signal('');

  /**
   * The session has no active organisation, so every /me/ step of this wizard
   * will be refused. The gateway names it (GATEWAY_NO_ACTIVE_TENANT) rather
   * than answering the bare 401 chora-tenancy used to send, which told an
   * authenticated operator to sign in again and fixed nothing. Held as its own
   * state because it is not a form error and not a transient failure: nothing
   * on this screen can clear it.
   */
  readonly noActiveTenant = signal(false);
  // Per-provider field guard — when singpass, hide OIDC inputs so the
  // FE matches the backend's per-provider validity matrix (CHO-1682
  // 400s otherwise: "singpass forbids client_id / client_secret /
  // discovery_url").
  readonly identityIsSingpass = computed(() => this.providerType() === 'singpass');

  // --- State ---
  readonly applying = signal(false);
  // Set when step 4 Apply's 502 GATEWAY_UPSTREAM_TENANCY landed — identity
  // row created but tenancy finish failed. Drives the inline retry CTA on
  // step 4 (both downstreams are idempotent so re-issue is safe).
  readonly tenancyRetryAvailable = signal(false);

  // --- Re-entry hydration (CHO-1692) ---
  // `hydrationLoading` flips true while the parallel BFF reads are in
  // flight + drops to false on completion (success OR partial failure
  // — the hydration Observable never throws). The template uses it to
  // show a skeleton over the wizard panel so the user does not see a
  // flash of defaults before persisted values land.
  readonly hydrationLoading = signal(false);

  /**
   * Per-leg load status, and the reason this component reads it at all.
   *
   * A failed leg does NOT leave its fields empty. `applyHydration` leaves each
   * signal at its DEFAULT, and the defaults are live values: `#2563eb` for the
   * primary colour, '' for the logo, '' for client id and discovery URL. Step 0
   * persists branding on Next and `apply()` persists branding AND identity, so
   * before this existed a failed leg silently overwrote saved settings with
   * fabricated ones, and nothing told the admin.
   *
   * Null until the first read resolves, which is not a failure: it is the
   * loading state, and the banner must not flash during it.
   */
  readonly hydrationSources = signal<HydrationSources | null>(null);

  readonly tenantHydrationFailed = computed(
    () => this.hydrationSources()?.tenant === 'failed',
  );
  readonly idpHydrationFailed = computed(
    () => this.hydrationSources()?.idp === 'failed',
  );
  /** Either leg. Drives the banner; the refusals are per-leg and narrower. */
  readonly hydrationFailed = computed(
    () => this.tenantHydrationFailed() || this.idpHydrationFailed(),
  );
  // ISO timestamp from chora-tenancy's v1TenantDTO when set; null on
  // fresh tenants. Drives the re-entry banner.
  readonly wizardCompletedAt = signal<string | null>(null);
  readonly showReentryBanner = computed(
    () => this.wizardCompletedAt() !== null,
  );

  // --- Computed ---
  readonly isFirstStep = computed(() => this.currentStepIndex() === 0);
  readonly isLastStep = computed(
    () => this.currentStepIndex() === WIZARD_STEPS.length - 1,
  );

  readonly canProceed = computed(() => {
    switch (this.currentStep()) {
      case 'branding':
        return true; // Branding is optional
      case 'addons':
        return true; // Add-ons are optional
      case 'identity':
        return true; // Identity is optional (can use defaults)
      case 'review':
        return true;
    }
  });

  readonly brandingConfig = computed<BrandingConfig>(() => ({
    logo_url: this.logoUrl() || null,
    primary_color_hex: this.primaryColorHex(),
  }));

  // CHO-1655 Phase A — wire-shape payload for TenantBrandingService.
  // Only includes fields that have a non-empty value; chora-tenancy
  // PATCH-merges so omitted fields preserve their previous state.
  readonly brandingPayload = computed<BrandingUpdatePayload>(() => {
    const payload: { primary_color_hex?: string; logo_url?: string; custom_domain?: string } = {};
    const color = this.primaryColorHex().trim();
    if (color.length > 0) {
      payload.primary_color_hex = color;
    }
    const logo = this.logoUrl().trim();
    if (logo.length > 0) {
      payload.logo_url = logo;
    }
    return payload;
  });

  readonly identityConfig = computed<IdentityProviderConfig>(() => ({
    provider_type: this.providerType(),
    client_id: this.clientId(),
    client_secret: this.clientSecret(),
    discovery_url: this.discoveryUrl(),
    singpass_enabled: this.singpassEnabled(),
  }));

  readonly wizardState = computed<SetupWizardState>(() => ({
    current_step: this.currentStepIndex(),
    branding: this.brandingConfig(),
    // The DURABLE codes, not a local selection. `add_ons` is diagnostic
    // passthrough on the apply (the BFF consumes `identity`; phyllis setup.go
    // never reads this field), so the honest value is what the grant says. A
    // failed read leaves it empty, which records nothing rather than recording
    // "this organisation holds no add-ons".
    add_ons: [...this.entitlementCodes()],
    identity: this.identityConfig(),
  }));

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /**
   * Advance to the next step. For the branding step (step 0) the wizard
   * first persists branding via TenantBrandingService — only advances on
   * success. Other steps just advance the index; Phases B and C will
   * wire those to their own services.
   */
  async nextStep(): Promise<void> {
    if (this.currentStep() === 'branding') {
      await this.applyBrandingAndAdvance();
      return;
    }
    // The add-ons step writes nothing: it reads the grant and advances like
    // any display-only step.
    if (!this.canProceed()) return;
    const idx = this.currentStepIndex();
    if (idx < WIZARD_STEPS.length - 1) {
      this.currentStepIndex.set(idx + 1);
    }
  }

  /**
   * Persist branding via the BFF and advance on success. On error,
   * stays on step 0 and surfaces an inline message (invalid) or a
   * toast (auth / server / network).
   */
  private async applyBrandingAndAdvance(): Promise<void> {
    this.brandingError.set('');
    // Refuse rather than overwrite. The colour and logo on screen are this
    // component's defaults, not the tenant's saved values, and persisting them
    // would destroy the real ones. The banner carries the retry.
    if (this.tenantHydrationFailed()) return;
    const payload = this.brandingPayload();
    // Local guard — invalid hex without round-trip.
    if (payload.primary_color_hex && !HEX_COLOR_RE.test(payload.primary_color_hex)) {
      this.brandingError.set('Primary colour must be a 6-digit hex like #RRGGBB.');
      return;
    }
    const result = await new Promise<BrandingUpdateResult>((resolve) => {
      this.brandingSvc.updateBranding(payload).subscribe({
        next: (r) => resolve(r),
        error: () => resolve({ kind: 'network-error' }),
      });
    });
    switch (result.kind) {
      case 'success':
        this.currentStepIndex.update((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
        return;
      case 'invalid':
        this.brandingError.set(result.message);
        return;
      case 'unauthenticated':
        this.toast.show('admin.wizard.branding_unauthenticated', 'error');
        return;
      case 'tenant-not-found':
        this.toast.show('admin.wizard.branding_tenant_not_found', 'error');
        return;
      case 'no-active-tenant':
        // Inline, not a toast: the operator has to leave and do something
        // (create an organisation, or switch into one), so the reason has to
        // stay on screen. PLATFORM_OPERATOR is tenant-less by design, so this
        // is the ordinary state for an operator who reached the wizard
        // directly rather than through the create flow.
        this.brandingError.set('');
        this.noActiveTenant.set(true);
        return;
      case 'server-error':
        this.toast.show('admin.wizard.branding_server_error', 'error');
        return;
      case 'network-error':
        this.toast.show('admin.wizard.branding_network_error', 'error');
        return;
    }
  }

  previousStep(): void {
    const idx = this.currentStepIndex();
    if (idx > 0) {
      this.currentStepIndex.set(idx - 1);
    }
  }

  goToStep(index: number): void {
    if (index >= 0 && index < WIZARD_STEPS.length) {
      this.currentStepIndex.set(index);
    }
  }

  // ---------------------------------------------------------------------------
  // Branding — onLogoFileSelected removed in CHO-1655 Phase A.
  // Direct GCS signed-URL upload is deferred to a separate backlog
  // story (logo URL paste is enough for now via the URL text input).
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Add-Ons read-back (E5 slice 2)
  // ---------------------------------------------------------------------------

  /**
   * Read the durable grant. Runs once at construction beside hydration, and
   * again on demand from the step's retry.
   *
   * The service never errors, so this only ever switches on a `kind`.
   * `no-active-tenant` deliberately raises the standing banner instead of an
   * inline retry: there is no organisation to read the plan of, and a retry
   * that cannot succeed is worse than none.
   */
  private loadGrantedAddOns(): void {
    this.entitlementsLoading.set(true);
    this.entitlementsError.set('');
    this.entitlementsSvc.readGrantedAddOns().subscribe({
      next: (result: EntitlementsReadbackResult) => {
        this.applyReadback(result);
        this.entitlementsLoading.set(false);
      },
      error: () => {
        // Defensive net only: the service contract is "never throws". Without
        // it a future regression would leave the skeleton spinning forever.
        this.entitlementsError.set('admin.wizard.addons_readback_network_error');
        this.entitlementsLoading.set(false);
      },
    });
  }

  /** Retry the read-back from the step's inline failure state. */
  retryEntitlements(): void {
    this.loadGrantedAddOns();
  }

  private applyReadback(result: EntitlementsReadbackResult): void {
    switch (result.kind) {
      case 'success':
        this.entitlementCodes.set(result.readback.codes);
        this.entitlementsUncodedCount.set(result.readback.uncodedCount);
        return;
      case 'no-active-tenant':
        // Same state the sibling steps raise, and for the same reason: nothing
        // on this screen can clear it.
        this.noActiveTenant.set(true);
        return;
      case 'unauthenticated':
        this.entitlementsError.set('admin.wizard.addons_readback_unauthenticated');
        return;
      case 'server-error':
        this.entitlementsError.set('admin.wizard.addons_readback_server_error');
        return;
      case 'network-error':
        this.entitlementsError.set('admin.wizard.addons_readback_network_error');
        return;
    }
  }

  // ---------------------------------------------------------------------------
  // Hydration (CHO-1692)
  // ---------------------------------------------------------------------------

  /**
   * Issue the parallel hydration GETs and pre-fill the form signals
   * from persisted state. Runs once at construction. The hydration
   * service Observable never errors — partial failures yield `null`
   * slices that this method tolerates by leaving the corresponding
   * signal at its default.
   *
   * `clientSecret` is NEVER hydrated — the BE deliberately omits the
   * value, and the model carries `client_secret_name` only. Users
   * must re-enter the secret per session if they want to rotate it.
   */
  /**
   * Re-run the hydration read from the banner's retry.
   *
   * It re-runs the LEG, it does not clear the flag locally: a retry that only
   * hid the banner would leave the admin persisting the same fabricated
   * defaults with the warning gone, which is worse than no retry at all.
   * `applyHydration` overwrites `hydrationSources` with whatever the new read
   * reports, so the refusals lift only when the legs actually come back.
   */
  retryHydration(): void {
    this.hydrate();
  }

  private hydrate(): void {
    this.hydrationLoading.set(true);
    this.hydrationSvc.hydrate().subscribe({
      next: (state: HydrationState) => {
        this.applyHydration(state);
        this.hydrationLoading.set(false);
      },
      error: () => {
        // The hydration Observable contract is "never throws" — this
        // branch is a defensive net so a future regression doesn't
        // leave the skeleton spinning forever.
        this.hydrationLoading.set(false);
      },
    });
  }

  private applyHydration(state: HydrationState): void {
    if (state.branding) {
      if (state.branding.primary_color_hex) {
        this.primaryColorHex.set(state.branding.primary_color_hex);
      }
      if (state.branding.logo_url) {
        this.logoUrl.set(state.branding.logo_url);
      }
    }
    if (state.identity) {
      this.providerType.set(state.identity.provider_type);
      this.clientId.set(state.identity.client_id);
      this.discoveryUrl.set(state.identity.discovery_url);
      this.singpassEnabled.set(state.identity.singpass_enabled);
      // clientSecret intentionally NOT touched — see hydrate() jsdoc.
    }
    // E5 slice 2 stopped step 2 reading hydration's `addOnCodes`: those codes
    // are `setup_wizard_addon_selections`, this wizard's INTENT, not the
    // organisation's GRANT, and step 2 reads the grant instead. The field then
    // had no reader at all while its GET still fired on every load, so the
    // relay retired the leg outright; there is no `addOnCodes` to ignore here
    // any more.
    this.wizardCompletedAt.set(state.wizardCompletedAt);
    this.hydrationSources.set(state.sources);
  }

  // ---------------------------------------------------------------------------
  // Apply
  // ---------------------------------------------------------------------------

  /**
   * Apply the wizard state via the real CHO-1682 BFF aggregator. Switch
   * on the discriminated `SetupApplyResult` per CHO-1683:
   *
   *  - success                   → newly_completed-aware toast + nav
   *  - invalid / unknown-provider-type → inline error on step 3
   *                                       + jump back so the user fixes it
   *  - unauthenticated           → toast (router auth-guard handles redirect)
   *  - secret-manager-failed     → toast (no DB row leaked; retry isn't safe yet)
   *  - tenancy-failed-retry-safe → inline retry CTA on step 4
   *                                 (both downstreams are idempotent)
   *  - server-error / network-error → toast
   */
  apply(): void {
    // `wizardState()` carries branding AND identity, so either failed leg is
    // enough to make this payload fabricated. Empty client_id and discovery_url
    // written over a real IdP config break the tenant's sign-in, which is worse
    // than the branding case, so this refuses on both legs symmetrically.
    if (this.hydrationFailed()) return;
    this.applying.set(true);
    this.identityError.set('');
    this.tenancyRetryAvailable.set(false);
    const payload: SetupApplyPayload = this.wizardState() as SetupApplyPayload;
    this.setupSvc.applyWizard(payload).subscribe({
      next: (result: SetupApplyResult) => {
        this.applying.set(false);
        this.handleApplyResult(result);
      },
      error: () => {
        // Service classifies HTTP errors; this fallback only fires if
        // the Observable itself errors before classify() can run.
        this.applying.set(false);
        this.toast.show('admin.wizard.apply_network_error', 'error');
      },
    });
  }

  private handleApplyResult(result: SetupApplyResult): void {
    switch (result.kind) {
      case 'success': {
        const toastKey = result.response.finish_setup.newly_completed
          ? 'admin.wizard.apply_success_new'
          : 'admin.wizard.apply_success_already_done';
        this.toast.show(toastKey, 'success');
        this.router.navigate(['/h/tenant']);
        return;
      }
      case 'invalid':
        this.identityError.set(result.message);
        // Jump back to the Identity step so the inline error is visible.
        this.currentStepIndex.set(WIZARD_STEPS.indexOf('identity'));
        return;
      case 'unknown-provider-type':
        this.identityError.set(result.message);
        this.currentStepIndex.set(WIZARD_STEPS.indexOf('identity'));
        this.toast.show('admin.wizard.apply_unknown_provider_type', 'error');
        return;
      case 'no-active-tenant':
        this.identityError.set('');
        this.noActiveTenant.set(true);
        return;
      case 'unauthenticated':
        this.toast.show('admin.wizard.apply_unauthenticated', 'error');
        return;
      case 'secret-manager-failed':
        // Atomic at the backend — no DB row leaked. Retry is safe but the
        // user should know SM is currently broken; a plain toast is enough.
        this.toast.show('admin.wizard.apply_server_error', 'error');
        return;
      case 'tenancy-failed-retry-safe':
        // Identity row IS created; tenancy finish failed. Surface an
        // inline retry CTA on step 4 (both endpoints are idempotent).
        this.tenancyRetryAvailable.set(true);
        this.toast.show('admin.wizard.apply_tenancy_failed_retry_safe', 'error');
        return;
      case 'server-error':
        this.toast.show('admin.wizard.apply_server_error', 'error');
        return;
      case 'network-error':
        this.toast.show('admin.wizard.apply_network_error', 'error');
        return;
    }
  }

  cancel(): void {
    this.router.navigate(['/h/tenant']);
  }

  trackByCode(_index: number, addOn: AvailableAddOn): string {
    return addOn.code;
  }

  getStepLabel(step: WizardStep): string {
    switch (step) {
      case 'branding':
        return 'admin.wizard.step_branding';
      case 'addons':
        return 'admin.wizard.step_addons';
      case 'identity':
        return 'admin.wizard.step_identity';
      case 'review':
        return 'admin.wizard.step_review';
    }
  }
}
