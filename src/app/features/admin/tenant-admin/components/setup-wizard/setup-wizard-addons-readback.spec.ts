/**
 * The divergence test (E5 slice 2).
 *
 * Every other wizard spec mocks the services, which proves the component reads
 * what it is handed. This one hands the component NOTHING: it wires the REAL
 * TenantSetupHydrationService and TenantEntitlementsReadbackService against a
 * mock HTTP backend, answers both add-on endpoints with DIFFERENT codes, and
 * asserts which one reaches the screen.
 *
 * That distinction is the whole point of the slice. `GET /api/feature-flags`
 * is chora-gateway's proxy of chora-tenancy `GET /api/tenants/{id}/entitlements`
 * and returns `add_on_subscriptions`, the durable grant written when the
 * organisation was created. `GET /api/v1/tenants/me/addons` returns
 * `setup_wizard_addon_selections`, this wizard's own INTENT, which the
 * tenancy handler's POST comment records as leaving the grant untouched. The
 * two now diverge in production, so a step wired to the wrong one would show
 * an operator what somebody once ticked and label it the organisation's plan.
 *
 * The two payloads below differ in field name AND envelope, exactly as the
 * real endpoints do, so a mistake cannot pass by coincidence of shape.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { SetupWizardComponent } from './setup-wizard.component';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

const GRANT_PATH = '/api/feature-flags';
const INTENT_PATH = '/api/v1/tenants/me/addons';
const TENANT_PATH = '/api/v1/tenants/me';
const IDP_PATH = '/api/v1/tenants/me/idp-providers';

/** The code that IS granted. Must reach step 2. */
const GRANTED_CODE = 'tms';
/** The code that was merely ticked once. Must never reach step 2. */
const SELECTED_CODE = 'marketplace';

describe('SetupWizardComponent step 2, grant versus wizard intent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupWizardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastService, useValue: { show: vi.fn() } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function answerBothEndpoints(): void {
    // The GRANT: chora-tenancy entitlementDTO shape, `items` + `addon_code`.
    http.expectOne((r) => r.url.endsWith(GRANT_PATH)).flush({
      items: [
        {
          id: '01990000-0000-7000-8000-00000000000a',
          tenant_id: 't-1',
          addon_id: '01990000-0000-7000-8000-00000000000b',
          addon_code: GRANTED_CODE,
          monthly_price_cents_snapshot: 0,
          status: 'active',
          activated_at: '2026-09-01T10:00:00Z',
          updated_at: '2026-09-01T10:00:00Z',
        },
      ],
      total: 1,
    });
    // The INTENT is no longer even requested. It used to be answered here
    // because the hydration service still asked for it while nothing read the
    // answer; the relay retired that leg, so the divergence is now settled one
    // step earlier: the wizard cannot render the selection because it never
    // fetches it. `expectNone` is honest rather than vacuous here because the
    // three endpoints that DO fire are asserted individually either side of
    // it, and `http.verify()` runs in afterEach.
    http.expectNone((r) => r.url.endsWith(INTENT_PATH));
    http.expectOne((r) => r.url.endsWith(TENANT_PATH)).flush({
      tenant_id: 't-1',
      branding: { primary_color_hex: '#2563eb', logo_url: '' },
      wizard_completed_at: null,
    });
    http.expectOne((r) => r.url.endsWith(IDP_PATH)).flush({ items: [] });
  }

  it('renders the granted add-on and never the wizard selection', () => {
    const fixture = TestBed.createComponent(SetupWizardComponent);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    answerBothEndpoints();

    const component = fixture.componentInstance;
    component.goToStep(1);
    fixture.detectChanges();

    expect([...component.entitlementCodes()]).toEqual([GRANTED_CODE]);

    const html: string = fixture.nativeElement.innerHTML;
    expect(
      fixture.nativeElement.querySelector(`[data-testid="granted-addon-${GRANTED_CODE}"]`),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector(`[data-testid="granted-addon-${SELECTED_CODE}"]`),
    ).toBeNull();
    // Belt and braces on the rendered text, so a future template that stops
    // using the data-testid convention still fails rather than passing
    // vacuously.
    expect(html).not.toContain(SELECTED_CODE);
  });

  it('carries the granted code, not the selected one, into the apply payload', () => {
    const fixture = TestBed.createComponent(SetupWizardComponent);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    answerBothEndpoints();

    expect(fixture.componentInstance.wizardState().add_ons).toEqual([GRANTED_CODE]);
  });

  it('advancing past step 2 writes nothing back', () => {
    const fixture = TestBed.createComponent(SetupWizardComponent);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    answerBothEndpoints();

    const component = fixture.componentInstance;
    component.goToStep(1);
    void component.nextStep();

    expect(component.currentStep()).toBe('identity');
    // The step used to POST the ticks here. Any request at all now is a
    // regression, and http.verify() in afterEach would catch an unflushed one
    // anyway; this says so explicitly.
    http.expectNone((r) => r.method !== 'GET');
    http.expectNone((r) => r.url.endsWith(INTENT_PATH));
  });
});
