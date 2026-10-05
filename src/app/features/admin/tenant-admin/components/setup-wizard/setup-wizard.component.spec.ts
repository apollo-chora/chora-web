/**
 * SetupWizardComponent spec — Phase A (CHO-1655) + Phase B FE (CHO-1665)
 *                              + Phase C FE (CHO-1683).
 *
 * Phase A: branding step (step 0) wired to TenantBrandingService.
 * Phase B: add-ons step (step 1). E5 slice 2 turned it from a picker into a
 *         READ-BACK of the durable grant; TenantAddonsService is no longer
 *         called from this component and the mock below only proves that.
 *         AVAILABLE_ADD_ONS realigned to the chora-tenancy DB seed
 *         catalogue (`base`, `tms`, `cms`, `kg_hexagonal`, ...).
 *         `base` is always-on — never togglable, never POSTed.
 * Phase C: identity step (step 2) Singpass field-guard + review/apply
 *         (step 3) wired to TenantSetupService; discriminated 8-way
 *         `SetupApplyResult` switch including the inline retry CTA on
 *         tenancy-failed-retry-safe and the newly_completed toast
 *         variant on success.
 */
import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import type { Mock } from 'vitest';

import { SetupWizardComponent } from './setup-wizard.component';
import { TenantBrandingService } from '../../services/tenant-branding.service';
import { TenantAddonsService } from '../../services/tenant-addons.service';
import { TenantSetupService } from '../../services/tenant-setup.service';
import { TenantSetupHydrationService } from '../../services/tenant-setup-hydration.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import type { BrandingUpdateResult } from '../../models/tenant-branding.model';
import type { AddonsApplyResult } from '../../models/tenant-addons.model';
import type { SetupApplyResult } from '../../models/tenant-setup.model';
import type { HydrationState } from '../../models/tenant-setup-hydration.model';
import { TenantEntitlementsReadbackService } from '../../services/tenant-entitlements-readback.service';
import type { EntitlementsReadbackResult } from '../../models/tenant-entitlements-readback.model';

function makeBrandingServiceMock(result: BrandingUpdateResult) {
  return {
    updateBranding: vi.fn(() => of(result)),
  };
}

function makeAddonsServiceMock(result: AddonsApplyResult) {
  return {
    applyAddons: vi.fn(() => of(result)),
  };
}

function makeReadbackServiceMock(result: EntitlementsReadbackResult) {
  return {
    readGrantedAddOns: vi.fn(() => of(result)) as unknown as Mock,
  };
}

function makeSetupServiceMock(result: SetupApplyResult) {
  return {
    applyWizard: vi.fn(() => of(result)),
  };
}

function emptyHydration(): HydrationState {
  return {
    branding: null,
    identity: null,
    wizardCompletedAt: null,
    sources: { tenant: 'ok', idp: 'ok' },
  };
}

function makeHydrationServiceMock(state: HydrationState = emptyHydration()) {
  return { hydrate: vi.fn(() => of(state)) };
}

function makeToastMock() {
  return { show: vi.fn() };
}

interface SetupOpts {
  branding?: BrandingUpdateResult;
  addons?: AddonsApplyResult;
  readback?: EntitlementsReadbackResult;
  setupApply?: SetupApplyResult;
  hydration?: HydrationState;
}

const defaultSuccessApply: SetupApplyResult = {
  kind: 'success',
  response: {
    idp_provider: {
      id: 'idp-1',
      tenant_id: 't-1',
      provider_type: 'oidc',
      client_id: 'acme',
      client_secret_name: 'projects/x/secrets/y',
      discovery_url: 'https://issuer.example/openid',
      singpass_enabled: false,
      created_at: '2026-06-08T00:00:00Z',
      updated_at: '2026-06-08T00:00:00Z',
    },
    finish_setup: {
      tenant_id: 't-1',
      wizard_completed_at: '2026-06-08T00:00:01Z',
      newly_completed: true,
    },
  },
};

async function setupComponent(opts: SetupOpts = {}) {
  const brandingResult: BrandingUpdateResult = opts.branding ?? {
    kind: 'success',
    response: { primary_color_hex: '#FF5500', logo_url: '', custom_domain: '' },
  };
  const addonsResult: AddonsApplyResult = opts.addons ?? {
    kind: 'success',
    response: { subscriptions: [] },
  };
  const setupResult: SetupApplyResult = opts.setupApply ?? defaultSuccessApply;
  const readbackResult: EntitlementsReadbackResult = opts.readback ?? {
    kind: 'success',
    readback: { codes: [], uncodedCount: 0 },
  };
  const readbackMock = makeReadbackServiceMock(readbackResult);
  const brandingMock = makeBrandingServiceMock(brandingResult);
  const addonsMock = makeAddonsServiceMock(addonsResult);
  const setupMock = makeSetupServiceMock(setupResult);
  const hydrationMock = makeHydrationServiceMock(
    opts.hydration ?? emptyHydration(),
  );
  const toastMock = makeToastMock();

  await TestBed.configureTestingModule({
    imports: [SetupWizardComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      { provide: TenantBrandingService, useValue: brandingMock },
      { provide: TenantAddonsService, useValue: addonsMock },
      { provide: TenantSetupService, useValue: setupMock },
      { provide: TenantSetupHydrationService, useValue: hydrationMock },
      { provide: TenantEntitlementsReadbackService, useValue: readbackMock },
      { provide: ToastService, useValue: toastMock },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(SetupWizardComponent);
  const component = fixture.componentInstance;
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  return {
    fixture,
    component,
    brandingMock,
    addonsMock,
    setupMock,
    hydrationMock,
    readbackMock,
    toastMock,
    router,
  };
}

describe('SetupWizardComponent', () => {
  // -------------------------------------------------------------------------
  // Step navigation
  // -------------------------------------------------------------------------

  it('starts at step 0 (branding)', async () => {
    const { component } = await setupComponent();
    expect(component.currentStepIndex()).toBe(0);
    expect(component.currentStep()).toBe('branding');
  });

  it('navigates back via previousStep', async () => {
    const { component } = await setupComponent();
    component.goToStep(2);
    component.previousStep();
    expect(component.currentStep()).toBe('addons');
  });

  it('does not go below step 0', async () => {
    const { component } = await setupComponent();
    component.previousStep();
    expect(component.currentStepIndex()).toBe(0);
  });

  it('does not go above last step', async () => {
    const { component } = await setupComponent();
    component.goToStep(3);
    component.nextStep();
    expect(component.currentStepIndex()).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Branding step (step 0) — Phase A focus
  // -------------------------------------------------------------------------

  it('branding step uses the wire shape: primary_color_hex (no secondary)', async () => {
    const { component } = await setupComponent();
    component.primaryColorHex.set('#FF5500');
    component.logoUrl.set('https://cdn.example.com/logo.png');

    expect(component.brandingPayload()).toEqual({
      primary_color_hex: '#FF5500',
      logo_url: 'https://cdn.example.com/logo.png',
    });
  });

  it('Next on branding step calls TenantBrandingService.updateBranding', async () => {
    const { component, brandingMock } = await setupComponent();
    component.primaryColorHex.set('#FF5500');
    component.logoUrl.set('https://cdn.example.com/logo.png');

    await component.nextStep();

    expect(brandingMock.updateBranding).toHaveBeenCalledWith({
      primary_color_hex: '#FF5500',
      logo_url: 'https://cdn.example.com/logo.png',
    });
  });

  // UX Track U, E1 item 4b. PLATFORM_OPERATOR is tenant-less by design, so an
  // operator who opens the wizard directly rather than through the create flow
  // has no active organisation and every step here will be refused. The
  // gateway names that (409 GATEWAY_NO_ACTIVE_TENANT); the wizard has to show
  // it, and show it persistently, because nothing on this screen can clear it.
  it('shows a persistent reason, not a toast, when the session has no organisation', async () => {
    const { fixture, component, toastMock } = await setupComponent({
      branding: { kind: 'no-active-tenant' },
    });

    await component.nextStep();
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector(
      '[data-testid="no-active-tenant"]',
    );
    expect(banner, 'the operator was left with no reason at all').toBeTruthy();
    expect(banner.textContent).toContain('admin.wizard.no_active_tenant');
    // A link to the fix, not just a diagnosis.
    expect(
      fixture.nativeElement.querySelector('[data-testid="no-active-tenant-create"]'),
    ).toBeTruthy();
    // Not a toast: a transient message would be gone before they could act,
    // and this is not a transient failure.
    expect(toastMock.show).not.toHaveBeenCalled();
    // And it does not advance as though the step had worked.
    expect(component.currentStep()).toBe('branding');
  });

  it('Next on branding success advances to step 1 (addons)', async () => {
    const { component } = await setupComponent({
      branding: {
        kind: 'success',
        response: { primary_color_hex: '#FF5500', logo_url: '', custom_domain: '' },
      },
    });
    component.primaryColorHex.set('#FF5500');

    await component.nextStep();

    expect(component.currentStep()).toBe('addons');
  });

  it('Next on branding invalid surfaces inline error and stays on step 0', async () => {
    const { component } = await setupComponent({
      branding: {
        kind: 'invalid',
        message: 'primary_color_hex must be #RRGGBB',
      },
    });
    component.primaryColorHex.set('red');

    await component.nextStep();

    expect(component.currentStep()).toBe('branding');
    expect(component.brandingError()).toContain('#RRGGBB');
  });

  it('Next on branding unauthenticated surfaces toast and stays on step 0', async () => {
    const { component, toastMock } = await setupComponent({
      branding: { kind: 'unauthenticated' },
    });
    component.primaryColorHex.set('#FF5500');

    await component.nextStep();

    expect(component.currentStep()).toBe('branding');
    expect(toastMock.show).toHaveBeenCalled();
  });

  it('Next on branding server-error surfaces toast and stays on step 0', async () => {
    const { component, toastMock } = await setupComponent({
      branding: { kind: 'server-error' },
    });
    component.primaryColorHex.set('#FF5500');

    await component.nextStep();

    expect(component.currentStep()).toBe('branding');
    expect(toastMock.show).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Add-ons step (step 1). E5 slice 2 made it a READ-BACK, not a picker.
  //
  // The step used to write the operator's ticks to
  // `setup_wizard_addon_selections` through TenantAddonsService. That table is
  // the wizard's INTENT and it is not the organisation's plan: tenant creation
  // (E1 S2) grants durably into `add_on_subscriptions`, and chora-tenancy's own
  // POST handler comment records that the wizard leaves that table untouched.
  // The two therefore DIVERGE, so the step now reads the grant and points the
  // operator at /h/addons to change it.
  //
  // The endpoint is `GET /api/feature-flags`, which is chora-gateway's proxy of
  // chora-tenancy `GET /api/tenants/{id}/entitlements` with the tenant taken
  // from the validated JWT. The path the design named cannot be called from a
  // browser at all: the gateway claims the whole `/api/tenants/` subtree and
  // hands it to handleTenantByID, which 404s any path with a slash after the
  // id. The end-to-end proof that the grant and not the intent reaches the
  // screen lives in setup-wizard-addons-readback.spec.ts, which drives both
  // endpoints for real.
  // -------------------------------------------------------------------------

  it('renders the granted add-ons, in server order, with catalogue labels', async () => {
    const { component } = await setupComponent({
      readback: {
        kind: 'success',
        readback: { codes: ['base', 'tms', 'kg_hexagonal'], uncodedCount: 0 },
      },
    });
    expect(component.grantedAddOns().map((a) => a.code)).toEqual([
      'base',
      'tms',
      'kg_hexagonal',
    ]);
    expect(component.grantedAddOns()[1].labelKey).toBe('admin.wizard.addon_tms');
  });

  it('shows a granted code the catalogue does not know, rather than dropping it', async () => {
    // AVAILABLE_ADD_ONS is a hardcoded list in this component. A grant it has
    // not caught up with is still the organisation's plan, and hiding it would
    // tell the operator their plan is smaller than it is.
    const { component } = await setupComponent({
      readback: {
        kind: 'success',
        readback: { codes: ['tms', 'not_in_the_catalogue'], uncodedCount: 0 },
      },
    });
    const unknown = component.grantedAddOns()[1];
    expect(unknown.code).toBe('not_in_the_catalogue');
    expect(unknown.labelKey).toBeNull();
  });

  it('surfaces granted rows that carry no catalogue code', async () => {
    const { component } = await setupComponent({
      readback: {
        kind: 'success',
        readback: { codes: ['tms'], uncodedCount: 2 },
      },
    });
    expect(component.entitlementsUncodedCount()).toBe(2);
  });

  it('an empty grant is an empty plan, never an error', async () => {
    const { component } = await setupComponent({
      readback: { kind: 'success', readback: { codes: [], uncodedCount: 0 } },
    });
    expect(component.grantedAddOns()).toEqual([]);
    expect(component.entitlementsError()).toBe('');
  });

  it('Next on the add-ons step advances without writing anything', async () => {
    const { component, addonsMock } = await setupComponent();
    component.goToStep(1);

    await component.nextStep();

    expect(component.currentStep()).toBe('identity');
    // The read-back is display-only. A write here would put wizard intent back
    // on the wire beside a grant that already disagrees with it.
    expect(addonsMock.applyAddons).not.toHaveBeenCalled();
  });

  it('carries the DURABLE codes into the apply payload, not a local selection', async () => {
    const { component } = await setupComponent({
      readback: {
        kind: 'success',
        readback: { codes: ['base', 'tms'], uncodedCount: 0 },
      },
    });
    expect(component.wizardState().add_ons).toEqual(['base', 'tms']);
  });

  it('a failed read-back sends NO add-ons rather than an empty plan', async () => {
    // `add_ons` is diagnostic passthrough on the apply (phyllis setup.go never
    // reads it), so an empty array here would record "this organisation holds
    // nothing" when the truth is "we could not read what it holds".
    const { component } = await setupComponent({
      readback: { kind: 'server-error' },
    });
    expect(component.wizardState().add_ons).toEqual([]);
    expect(component.entitlementsError()).toBe('admin.wizard.addons_readback_server_error');
  });

  it('a read-back failure is inline and retryable, never a toast', async () => {
    const { component, toastMock, readbackMock } = await setupComponent({
      readback: { kind: 'network-error' },
    });
    expect(component.entitlementsError()).toBe('admin.wizard.addons_readback_network_error');
    // Nothing on this step is actionable by dismissing a toast, so the reason
    // has to stay on screen next to the retry.
    expect(toastMock.show).not.toHaveBeenCalled();

    readbackMock.readGrantedAddOns.mockReturnValue(
      of({ kind: 'success', readback: { codes: ['tms'], uncodedCount: 0 } }),
    );
    component.retryEntitlements();

    expect(component.entitlementsError()).toBe('');
    expect(component.grantedAddOns().map((a) => a.code)).toEqual(['tms']);
  });

  it('a read-back with no organisation raises the standing no-tenant banner', async () => {
    const { component } = await setupComponent({
      readback: { kind: 'no-active-tenant' },
    });
    expect(component.noActiveTenant()).toBe(true);
    // The banner already says the one thing that can be done about it, so the
    // step must not also show a retry that cannot succeed.
    expect(component.entitlementsError()).toBe('');
  });

  it('drops the read-back loading flag once the read settles', async () => {
    const { component } = await setupComponent();
    expect(component.entitlementsLoading()).toBe(false);
  });
  // -------------------------------------------------------------------------
  // Identity step (step 2) — Phase C focus (CHO-1683 / CHO-1682)
  //
  // Field-guard: when provider_type=singpass the OIDC client_id /
  // client_secret / discovery_url inputs MUST be hidden so the wizard
  // never POSTs a payload the backend would reject with 400
  // "singpass forbids client_id / client_secret / discovery_url".
  // -------------------------------------------------------------------------

  it('identityIsSingpass flips with the provider_type signal', async () => {
    const { component } = await setupComponent();
    expect(component.identityIsSingpass()).toBe(false);
    component.providerType.set('singpass');
    expect(component.identityIsSingpass()).toBe(true);
    component.providerType.set('oidc');
    expect(component.identityIsSingpass()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Step 4 Apply — Phase C focus (CHO-1683 / CHO-1682)
  //
  // Switch on SetupApplyResult.kind: success (newly_completed-aware
  // toast + navigate), invalid / unknown-provider-type (inline error
  // + jump back to step 2 identity), unauthenticated / server / network
  // (toast), tenancy-failed-retry-safe (inline retry CTA + toast).
  // -------------------------------------------------------------------------

  it('Apply success (newly_completed=true) shows celebratory toast + navigates', async () => {
    const { component, setupMock, toastMock, router } = await setupComponent({
      setupApply: { ...defaultSuccessApply },
    });
    component.goToStep(3); // review
    component.apply();
    await Promise.resolve();
    expect(setupMock.applyWizard).toHaveBeenCalled();
    expect(toastMock.show).toHaveBeenCalledWith('admin.wizard.apply_success_new', 'success');
    expect(router.navigate).toHaveBeenCalledWith(['/h/tenant']);
  });

  it('Apply success (newly_completed=false) shows quiet "already done" toast', async () => {
    const alreadyDone: SetupApplyResult = {
      kind: 'success',
      response: {
        ...defaultSuccessApply.response,
        finish_setup: {
          ...defaultSuccessApply.response.finish_setup,
          newly_completed: false,
        },
      },
    };
    const { component, toastMock } = await setupComponent({ setupApply: alreadyDone });
    component.goToStep(3);
    component.apply();
    await Promise.resolve();
    expect(toastMock.show).toHaveBeenCalledWith('admin.wizard.apply_success_already_done', 'success');
  });

  it('Apply invalid surfaces inline identityError + jumps back to step 2 (identity)', async () => {
    const { component } = await setupComponent({
      setupApply: { kind: 'invalid', message: 'oidc requires client_id' },
    });
    component.goToStep(3);
    component.apply();
    await Promise.resolve();
    expect(component.currentStep()).toBe('identity');
    expect(component.identityError()).toContain('client_id');
  });

  it('Apply unknown-provider-type surfaces inline error + toast + jumps to identity', async () => {
    const { component, toastMock } = await setupComponent({
      setupApply: { kind: 'unknown-provider-type', message: 'unknown provider_type "bogus"' },
    });
    component.goToStep(3);
    component.apply();
    await Promise.resolve();
    expect(component.currentStep()).toBe('identity');
    expect(component.identityError()).toContain('provider_type');
    expect(toastMock.show).toHaveBeenCalledWith('admin.wizard.apply_unknown_provider_type', 'error');
  });

  it('Apply unauthenticated surfaces auth toast', async () => {
    const { component, toastMock } = await setupComponent({
      setupApply: { kind: 'unauthenticated' },
    });
    component.goToStep(3);
    component.apply();
    await Promise.resolve();
    expect(toastMock.show).toHaveBeenCalledWith('admin.wizard.apply_unauthenticated', 'error');
  });

  it('Apply tenancy-failed-retry-safe sets retry CTA flag + toast (idempotent re-issue)', async () => {
    const { component, toastMock } = await setupComponent({
      setupApply: {
        kind: 'tenancy-failed-retry-safe',
        message: 'identity succeeded; tenancy returned 500 (retry-safe — both endpoints idempotent)',
      },
    });
    component.goToStep(3);
    component.apply();
    await Promise.resolve();
    expect(component.tenancyRetryAvailable()).toBe(true);
    expect(toastMock.show).toHaveBeenCalledWith('admin.wizard.apply_tenancy_failed_retry_safe', 'error');
  });

  it('Apply server-error surfaces toast and does NOT navigate', async () => {
    const { component, toastMock, router } = await setupComponent({
      setupApply: { kind: 'server-error' },
    });
    component.goToStep(3);
    component.apply();
    await Promise.resolve();
    expect(toastMock.show).toHaveBeenCalledWith('admin.wizard.apply_server_error', 'error');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('Apply network-error surfaces network toast', async () => {
    const { component, toastMock } = await setupComponent({
      setupApply: { kind: 'network-error' },
    });
    component.goToStep(3);
    component.apply();
    await Promise.resolve();
    expect(toastMock.show).toHaveBeenCalledWith('admin.wizard.apply_network_error', 'error');
  });

  it('Retry CTA call (after tenancy-failed-retry-safe) re-invokes setupSvc.applyWizard', async () => {
    const { component, setupMock } = await setupComponent({
      setupApply: {
        kind: 'tenancy-failed-retry-safe',
        message: 'retry-safe',
      },
    });
    component.goToStep(3);
    component.apply();
    await Promise.resolve();
    expect(component.tenancyRetryAvailable()).toBe(true);

    // Simulate the retry button click — invoke apply() again. The
    // template's [click]="apply()" on the retry button does exactly this.
    component.apply();
    await Promise.resolve();
    expect(setupMock.applyWizard).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // CHO-1692 Phase D — Re-entry hydration
  // -------------------------------------------------------------------------
  // Verifies: hydration runs on mount, prefills signals from server
  // state, surfaces the loading state to the template, drives the
  // re-entry banner from wizard_completed_at, and tolerates partial
  // hydration failures without crashing the wizard.

  it('calls hydrationSvc.hydrate exactly once on mount', async () => {
    const { hydrationMock } = await setupComponent();
    expect(hydrationMock.hydrate).toHaveBeenCalledTimes(1);
  });

  it('prefills branding + identity signals from hydration response', async () => {
    const { component } = await setupComponent({
      hydration: {
        branding: {
          primary_color_hex: '#AABBCC',
          logo_url: 'https://cdn.example.com/saved.svg',
        },
        identity: {
          provider_type: 'oidc',
          client_id: 'persisted-client',
          discovery_url: 'https://issuer.example/.well-known/openid-configuration',
          singpass_enabled: false,
          client_secret_name: 'projects/x/secrets/y',
        },
        wizardCompletedAt: null,
            sources: { tenant: 'ok', idp: 'ok' },
      },
    });
    expect(component.primaryColorHex()).toBe('#AABBCC');
    expect(component.logoUrl()).toBe('https://cdn.example.com/saved.svg');
    expect(component.providerType()).toBe('oidc');
    expect(component.clientId()).toBe('persisted-client');
    expect(component.discoveryUrl()).toBe(
      'https://issuer.example/.well-known/openid-configuration',
    );
    expect(component.singpassEnabled()).toBe(false);
    // client_secret stays empty — the server never returns the value.
    expect(component.clientSecret()).toBe('');
  });

  it('never prefills clientSecret even when hydration carries client_secret_name', async () => {
    const { component } = await setupComponent({
      hydration: {
        branding: null,
        identity: {
          provider_type: 'oidc',
          client_id: 'persisted',
          discovery_url: 'https://issuer/openid',
          singpass_enabled: false,
          client_secret_name: 'projects/x/secrets/secret-already-set',
        },
        wizardCompletedAt: null,
            sources: { tenant: 'ok', idp: 'ok' },
      },
    });
    expect(component.clientSecret()).toBe('');
  });

  it('flips singpass branch when hydration returns provider_type=singpass', async () => {
    const { component } = await setupComponent({
      hydration: {
        branding: null,
        identity: {
          provider_type: 'singpass',
          client_id: '',
          discovery_url: '',
          singpass_enabled: true,
          client_secret_name: null,
        },
        wizardCompletedAt: null,
            sources: { tenant: 'ok', idp: 'ok' },
      },
    });
    expect(component.providerType()).toBe('singpass');
    expect(component.singpassEnabled()).toBe(true);
    expect(component.identityIsSingpass()).toBe(true);
  });

  it('exposes wizardCompletedAt to the template when set', async () => {
    const { component } = await setupComponent({
      hydration: {
        branding: null,
        identity: null,
        wizardCompletedAt: '2026-06-07T12:00:00Z',
            sources: { tenant: 'ok', idp: 'ok' },
      },
    });
    expect(component.wizardCompletedAt()).toBe('2026-06-07T12:00:00Z');
    expect(component.showReentryBanner()).toBe(true);
  });

  it('does not show the re-entry banner for a fresh tenant', async () => {
    const { component } = await setupComponent({
      hydration: {
        branding: { primary_color_hex: '#2563eb', logo_url: null },
        identity: null,
        wizardCompletedAt: null,
            sources: { tenant: 'ok', idp: 'ok' },
      },
    });
    expect(component.showReentryBanner()).toBe(false);
  });

  it('drops the loading signal to false after hydration completes', async () => {
    const { component } = await setupComponent();
    // hydrate emits synchronously via `of(...)` in the mock; by the
    // time fixture.detectChanges() has resolved, hydrationLoading must
    // already be false (avoid flash-of-defaults: spec is the contract).
    expect(component.hydrationLoading()).toBe(false);
  });

  it('keeps signals at defaults when hydration returns all-null slices', async () => {
    const { component } = await setupComponent({
      hydration: {
        branding: null,
        identity: null,
        wizardCompletedAt: null,
            sources: { tenant: 'failed', idp: 'failed' },
      },
    });
    expect(component.primaryColorHex()).toBe('#2563eb');
    expect(component.logoUrl()).toBe('');
    expect(component.providerType()).toBe('oidc');
    expect(component.clientId()).toBe('');
    expect(component.discoveryUrl()).toBe('');
    expect(component.singpassEnabled()).toBe(false);
    expect(component.showReentryBanner()).toBe(false);
  });
});

describe('SetupWizardComponent - E5, exits land on H+', () => {
  it('sends a cancel to /h/tenant, not the retired admin root', async () => {
    // The wizard now lives at /h/setup. Cancelling to /admin would drop an
    // operator out of the surface they were working in, onto a tree whose
    // tenant screens this refactor has been retiring.
    const { component, router } = await setupComponent();

    component.cancel();

    expect(router.navigate).toHaveBeenCalledWith(['/h/tenant']);
  });
});

// -----------------------------------------------------------------------------
// Hydration failure: the banner, and the refusals behind it
// -----------------------------------------------------------------------------
//
// THE DEFECT THIS PINS, which shipped and was silent.
//
// `applyHydration` leaves each signal at its DEFAULT when a leg fails, and the
// defaults are live values: `primaryColorHex` is '#2563eb' and `logoUrl` is ''.
// Step 0 PERSISTS branding through TenantBrandingService on Next. So a failed
// tenant leg showed the admin a plausible blue wizard with no logo, gave them no
// way to tell it from their real brand, and wrote that default OVER their saved
// branding the moment they advanced. The idp leg is worse: empty `clientId` and
// `discoveryUrl` persisted over a real IdP config break the tenant's sign-in.
//
// `sources` existed the whole time and the model's own comment claimed it drove
// a "we couldn't load your saved settings" hint. Nothing read it.
//
// The rule these tests fix in place: a failed leg refuses every write path whose
// payload it fabricated. Branding persist refuses on a failed TENANT leg; the
// final apply carries branding AND identity, so it refuses on EITHER.

function hydrationWith(
  sources: { tenant: 'ok' | 'failed'; idp: 'ok' | 'failed' },
): HydrationState {
  return { branding: null, identity: null, wizardCompletedAt: null, sources };
}

describe('SetupWizardComponent, hydration failure', () => {
  it('tells the admin when the tenant leg failed, instead of showing defaults silently', async () => {
    const { fixture } = await setupComponent({
      hydration: hydrationWith({ tenant: 'failed', idp: 'ok' }),
    });
    expect(
      fixture.nativeElement.querySelector('[data-testid="hydration-failed-banner"]'),
    ).toBeTruthy();
  });

  it('tells the admin when the idp leg failed', async () => {
    const { fixture } = await setupComponent({
      hydration: hydrationWith({ tenant: 'ok', idp: 'failed' }),
    });
    expect(
      fixture.nativeElement.querySelector('[data-testid="hydration-failed-banner"]'),
    ).toBeTruthy();
  });

  it('shows no banner when both legs loaded, so the banner means something', async () => {
    const { fixture } = await setupComponent({
      hydration: hydrationWith({ tenant: 'ok', idp: 'ok' }),
    });
    expect(
      fixture.nativeElement.querySelector('[data-testid="hydration-failed-banner"]'),
    ).toBeNull();
  });

  it('REFUSES to persist branding while the tenant leg is failed', async () => {
    const { component, brandingMock } = await setupComponent({
      hydration: hydrationWith({ tenant: 'failed', idp: 'ok' }),
    });

    await component.nextStep();

    expect(brandingMock.updateBranding).not.toHaveBeenCalled();
    expect(component.currentStep()).toBe('branding');
  });

  it('still persists branding when the tenant leg loaded', async () => {
    const { component, brandingMock } = await setupComponent({
      hydration: hydrationWith({ tenant: 'ok', idp: 'ok' }),
    });

    await component.nextStep();

    expect(brandingMock.updateBranding).toHaveBeenCalled();
  });

  it('REFUSES to apply while the idp leg is failed, because empty client_id would break sign-in', async () => {
    const { component, setupMock } = await setupComponent({
      hydration: hydrationWith({ tenant: 'ok', idp: 'failed' }),
    });

    component.apply();

    expect(setupMock.applyWizard).not.toHaveBeenCalled();
  });

  it('REFUSES to apply while the tenant leg is failed, because the payload carries branding too', async () => {
    const { component, setupMock } = await setupComponent({
      hydration: hydrationWith({ tenant: 'failed', idp: 'ok' }),
    });

    component.apply();

    expect(setupMock.applyWizard).not.toHaveBeenCalled();
  });

  it('still applies when both legs loaded', async () => {
    const { component, setupMock } = await setupComponent({
      hydration: hydrationWith({ tenant: 'ok', idp: 'ok' }),
    });

    component.apply();

    expect(setupMock.applyWizard).toHaveBeenCalled();
  });

  it('retry re-runs hydration and clears the banner and the refusal', async () => {
    const { fixture, component, hydrationMock, brandingMock } = await setupComponent({
      hydration: hydrationWith({ tenant: 'failed', idp: 'failed' }),
    });
    expect(
      fixture.nativeElement.querySelector('[data-testid="hydration-failed-banner"]'),
    ).toBeTruthy();

    // Second read succeeds.
    hydrationMock.hydrate.mockReturnValue(of(hydrationWith({ tenant: 'ok', idp: 'ok' })));
    component.retryHydration();
    fixture.detectChanges();

    // It actually re-ran the leg, rather than only clearing local state.
    expect(hydrationMock.hydrate).toHaveBeenCalledTimes(2);
    expect(
      fixture.nativeElement.querySelector('[data-testid="hydration-failed-banner"]'),
    ).toBeNull();

    // And the refusal is lifted, which is the point of the retry.
    await component.nextStep();
    expect(brandingMock.updateBranding).toHaveBeenCalled();
  });
});
