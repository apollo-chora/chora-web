/**
 * TenantSetupHydrationService spec — RED-phase tests for CHO-1692 Phase D FE.
 *
 * Strict TDD per chora/.claude/rules/development-execution.md: this
 * file is written BEFORE tenant-setup-hydration.service.ts exists.
 * Compile must fail with "Cannot find module './tenant-setup-hydration.service'"
 * — that's the observed RED phase. Implementation lands next and turns
 * these GREEN.
 *
 * Drives the service through HttpTestingController against the
 * canonical BFF URLs + envelope shapes from
 * `chora-contracts/openapi/bff-gateway.yaml` (`getMyTenant`) +
 * `chora-contracts/openapi/identity-admin.yaml` v1.2
 * (`listMyTenantIdpProviders`).
 *
 * Per chora-web/CLAUDE.md §6, every test calls `httpMock.verify()` in
 * afterEach. Mirrors `tenant-setup.service.spec.ts` shape (CHO-1683).
 *
 * Scenarios covered (8):
 *   1. happy path — both GETs succeed; HydrationState carries
 *      branding + identity + wizardCompletedAt + sources all-ok.
 *   2. fresh tenant — tenant returns 200 with no `wizard_completed_at`
 *      key + idp returns 200 with empty `items[]`. HydrationState
 *      branding present, wizardCompletedAt null, identity null,
 *      sources all-ok.
 *   3. already-completed tenant — `wizard_completed_at` set on tenant
 *      payload; HydrationState exposes the ISO string verbatim so the
 *      wizard banner can render it.
 *   4. partial failure — tenant GET 5xx, idp GET ok. HydrationState
 *      branding null, wizardCompletedAt null, identity present,
 *      sources.tenant='failed', sources.idp='ok'. Observable
 *      COMPLETES (no throw).
 *   5. partial failure — idp GET 5xx, tenant GET ok. HydrationState
 *      branding present, identity null, sources.idp='failed',
 *      sources.tenant='ok'.
 *   6. both failed — 401 / network — both slices null,
 *      sources.tenant='failed', sources.idp='failed'. Observable
 *      COMPLETES (no throw).
 *   7. client_secret never leaks — even if the wire envelope somehow
 *      carries a `client_secret` field, HydrationIdentity must NOT
 *      surface it (the type doesn't permit, but the test pins the
 *      runtime invariant by asserting the field is absent on the
 *      hydrated identity object).
 *   8. multiple idp rows — service picks the first row deterministically
 *      (the BE invariant is one row per (tenant, provider_type) so
 *      multi-row only happens when a tenant has e.g. OIDC + singpass;
 *      we pick the first emitted by the contract).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { TenantSetupHydrationService } from './tenant-setup-hydration.service';
import {
  HYDRATION_IDP_PROVIDERS_PATH,
  HYDRATION_TENANT_PATH,
  MeIdpProvidersHydrationWire,
  MeTenantHydrationWire,
} from '../models/tenant-setup-hydration.model';
import { environment } from '../../../../../environments/environment';

const TENANT_URL = `${environment.bffBaseUrl}${HYDRATION_TENANT_PATH}`;
const IDP_URL = `${environment.bffBaseUrl}${HYDRATION_IDP_PROVIDERS_PATH}`;
// Hard-coded on purpose. The production constant was deleted with the leg, and
// an absence assertion must not depend on a constant that no longer exists:
// importing one back would let a future rename silently stop asserting.
const ADDONS_URL = `${environment.bffBaseUrl}/api/v1/tenants/me/addons`;

function setup(): {
  service: TenantSetupHydrationService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const service = TestBed.inject(TenantSetupHydrationService);
  const httpMock = TestBed.inject(HttpTestingController);
  return { service, httpMock };
}

const tenantHappy: MeTenantHydrationWire = {
  id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
  branding: {
    primary_color_hex: '#7C3AED',
    logo_url: 'https://cdn.example.com/acme.svg',
  },
  wizard_completed_at: '2026-06-07T12:34:56.000000000Z',
};

const idpHappy: MeIdpProvidersHydrationWire = {
  items: [
    {
      id: '019e0000-0000-7000-8000-iiiiiiiiiiii',
      tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
      provider_type: 'oidc',
      client_id: 'acme-client',
      client_secret_name:
        'projects/chora-489812/secrets/idp-client-secret-acme',
      discovery_url:
        'https://issuer.example.com/.well-known/openid-configuration',
      singpass_enabled: false,
      created_at: '2026-06-07T12:34:55Z',
      updated_at: '2026-06-07T12:34:55Z',
    },
  ],
};

describe('TenantSetupHydrationService', () => {
  let mock: HttpTestingController;

  afterEach(() => {
    mock?.verify();
  });

  // -------------------------------------------------------------------------
  // 1. Happy path
  // -------------------------------------------------------------------------

  it('issues both GETs in parallel and stitches their responses into HydrationState', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrate());

    const tenantReq = httpMock.expectOne(TENANT_URL);
    expect(tenantReq.request.method).toBe('GET');
    const idpReq = httpMock.expectOne(IDP_URL);
    expect(idpReq.request.method).toBe('GET');

    tenantReq.flush(tenantHappy, { status: 200, statusText: 'OK' });
    idpReq.flush(idpHappy, { status: 200, statusText: 'OK' });

    const state = await promise;
    expect(state.sources.tenant).toBe('ok');
    expect(state.sources.idp).toBe('ok');
    expect(state.branding).toEqual({
      primary_color_hex: '#7C3AED',
      logo_url: 'https://cdn.example.com/acme.svg',
    });
    expect(state.wizardCompletedAt).toBe(
      '2026-06-07T12:34:56.000000000Z',
    );
    expect(state.identity).toEqual({
      provider_type: 'oidc',
      client_id: 'acme-client',
      discovery_url:
        'https://issuer.example.com/.well-known/openid-configuration',
      singpass_enabled: false,
      client_secret_name:
        'projects/chora-489812/secrets/idp-client-secret-acme',
    });
  });

  // -------------------------------------------------------------------------
  // 2. Fresh tenant — no wizard_completed_at + empty idp items
  // -------------------------------------------------------------------------

  it('treats missing wizard_completed_at as null and empty items as no identity', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrate());
    httpMock.expectOne(TENANT_URL).flush(
      {
        id: '01970000-0000-7000-8000-bbbbbbbbbbbb',
        branding: { primary_color_hex: '#2563eb' },
      } satisfies MeTenantHydrationWire,
      { status: 200, statusText: 'OK' },
    );
    httpMock.expectOne(IDP_URL).flush(
      { items: [] } satisfies MeIdpProvidersHydrationWire,
      { status: 200, statusText: 'OK' },
    );

    const state = await promise;
    expect(state.sources.tenant).toBe('ok');
    expect(state.sources.idp).toBe('ok');
    expect(state.wizardCompletedAt).toBeNull();
    expect(state.identity).toBeNull();
    expect(state.branding?.primary_color_hex).toBe('#2563eb');
  });

  // -------------------------------------------------------------------------
  // 3. Already-completed tenant — banner trigger
  // -------------------------------------------------------------------------

  it('exposes wizard_completed_at verbatim so the banner can render it', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrate());
    httpMock.expectOne(TENANT_URL).flush(tenantHappy, {
      status: 200,
      statusText: 'OK',
    });
    httpMock.expectOne(IDP_URL).flush(idpHappy, {
      status: 200,
      statusText: 'OK',
    });

    const state = await promise;
    expect(state.wizardCompletedAt).toBe(
      '2026-06-07T12:34:56.000000000Z',
    );
  });

  // -------------------------------------------------------------------------
  // 4. Tenant 5xx — partial failure, idp survives
  // -------------------------------------------------------------------------

  it('continues with idp slice when tenant GET fails with 5xx', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrate());
    httpMock.expectOne(TENANT_URL).flush(null, {
      status: 502,
      statusText: 'Bad Gateway',
    });
    httpMock.expectOne(IDP_URL).flush(idpHappy, {
      status: 200,
      statusText: 'OK',
    });

    const state = await promise;
    expect(state.sources.tenant).toBe('failed');
    expect(state.sources.idp).toBe('ok');
    expect(state.branding).toBeNull();
    expect(state.wizardCompletedAt).toBeNull();
    expect(state.identity?.client_id).toBe('acme-client');
  });

  // -------------------------------------------------------------------------
  // 5. Idp 5xx — partial failure, tenant survives
  // -------------------------------------------------------------------------

  it('continues with tenant slice when idp GET fails with 5xx', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrate());
    httpMock.expectOne(TENANT_URL).flush(tenantHappy, {
      status: 200,
      statusText: 'OK',
    });
    httpMock.expectOne(IDP_URL).flush(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });

    const state = await promise;
    expect(state.sources.tenant).toBe('ok');
    expect(state.sources.idp).toBe('failed');
    expect(state.branding?.primary_color_hex).toBe('#7C3AED');
    expect(state.identity).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 6. Both failed — never throws
  // -------------------------------------------------------------------------

  it('returns all-null HydrationState (no throw) when both GETs fail', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrate());
    httpMock.expectOne(TENANT_URL).flush(null, {
      status: 401,
      statusText: 'Unauthorized',
    });
    httpMock.expectOne(IDP_URL).flush(null, {
      status: 0,
      statusText: 'Network error',
    });

    const state = await promise;
    expect(state.sources.tenant).toBe('failed');
    expect(state.sources.idp).toBe('failed');
    expect(state.branding).toBeNull();
    expect(state.identity).toBeNull();
    expect(state.wizardCompletedAt).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 7. client_secret never appears on hydrated identity
  // -------------------------------------------------------------------------

  it('does not leak client_secret onto the hydrated identity even if the wire carries one', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrate());
    httpMock.expectOne(TENANT_URL).flush(tenantHappy, {
      status: 200,
      statusText: 'OK',
    });
    // Defensive payload — the BE contract OMITS client_secret on GET,
    // but we pin the runtime invariant here: even if a future BE bug
    // surfaces the field, the hydration model must NOT carry it
    // forward to the wizard.
    httpMock.expectOne(IDP_URL).flush(
      {
        items: [
          {
            ...idpHappy.items[0],
            client_secret: 'oh-no',
            // The cast is the point: it forces a field the wire type forbids,
            // which is exactly the leak this test guards against. The disable
            // has to sit on the cast line, not on the property above it.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
      },
      { status: 200, statusText: 'OK' },
    );

    const state = await promise;
    expect(state.identity).not.toBeNull();
    expect(
      (state.identity as unknown as Record<string, unknown>)['client_secret'],
    ).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 8. Multiple idp rows — first row wins
  // -------------------------------------------------------------------------

  it('uses the first idp row when multiple are returned', async () => {
    const { service, httpMock } = setup();
    mock = httpMock;

    const promise = firstValueFrom(service.hydrate());
    httpMock.expectOne(TENANT_URL).flush(tenantHappy, {
      status: 200,
      statusText: 'OK',
    });
    httpMock.expectOne(IDP_URL).flush(
      {
        items: [
          { ...idpHappy.items[0], client_id: 'first-row' },
          {
            ...idpHappy.items[0],
            id: 'second',
            provider_type: 'singpass',
            client_id: 'second-row',
            singpass_enabled: true,
          },
        ],
      } satisfies MeIdpProvidersHydrationWire,
      { status: 200, statusText: 'OK' },
    );

    const state = await promise;
    expect(state.identity?.client_id).toBe('first-row');
    expect(state.identity?.provider_type).toBe('oidc');
  });

  // E5 relay (E3 slice 8 follow-up): the addons leg is RETIRED.
  //
  // E5 slice 2 (`b595394d1`) stopped step 2 reading `addOnCodes`, because those
  // codes are the wizard's own INTENT (`setup_wizard_addon_selections`) and not
  // the organisation's GRANT, which step 2 reads instead. Nothing has read the
  // field since. The GET kept firing on every wizard load anyway: a round trip
  // per load whose only consumer was a field the wizard deliberately ignores.
  //
  // This asserts the absence, which `expectNone` can do honestly here because
  // the other two legs are flushed in the same test: if hydrate() were broken
  // outright the awaited state would not resolve and the test would fail on the
  // assertions below rather than pass vacuously.
  it('does not call the addons endpoint at all, because nothing reads it', async () => {
    const { service, httpMock } = setup();

    const promise = firstValueFrom(service.hydrate());
    httpMock.expectOne(TENANT_URL).flush(tenantHappy, { status: 200, statusText: 'OK' });
    httpMock.expectOne(IDP_URL).flush(idpHappy, { status: 200, statusText: 'OK' });
    httpMock.expectNone(ADDONS_URL);

    const state = await promise;

    // Positive control: the surviving legs still stitch, so the absence above
    // is the addons leg being gone and not hydrate() failing to run.
    expect(state.branding?.primary_color_hex).toBe('#7C3AED');
    expect(state.identity?.provider_type).toBeTruthy();
    expect(state.sources.tenant).toBe('ok');
    expect(state.sources.idp).toBe('ok');

    httpMock.verify();
  });
});
