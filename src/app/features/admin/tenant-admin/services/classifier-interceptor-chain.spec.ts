/**
 * The one fence that runs error classifiers through the app's REAL interceptor
 * chain (UX Track U, package E1 item 4b).
 *
 * Every other service spec in this folder builds its TestBed with
 * `provideHttpClient()` and no interceptors. The app builds its own with
 * `provideHttpClient(withInterceptors([authInterceptor, errorInterceptor]))`
 * (app.config.ts), and `errorInterceptor` rethrows every HTTP failure as
 * `ApiError`. A classifier that branches on `err instanceof HttpErrorResponse`
 * therefore matches in every spec and in nothing the user ever runs: the whole
 * switch is unreachable and every failure, whatever its status, comes back as
 * `network-error`.
 *
 * Measured before this fence was written, on the wizard's add-on call: a 400
 * carrying `unknown_addon_code` classified as `unknown-code` under the spec
 * harness and as `network-error` through the chain above.
 *
 * So this spec provides the interceptor the way the app does. It is deliberately
 * the only one that does, because the point is not to re-test each classifier's
 * table but to prove the classifiers can see a status at all. `httpErrorView`
 * exists for exactly this and normalises both shapes; twenty services already
 * use it.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';
import { TenantAddonsService } from './tenant-addons.service';
import { TenantBrandingService } from './tenant-branding.service';
import { TenantSetupService } from './tenant-setup.service';
import { TenantIdpAdminService } from './tenant-idp-admin.service';
import { TenantBillingService } from './tenant-billing.service';
import { TenantAddonsAdminService } from './tenant-addons-admin.service';
import { ClassroomService } from '../../../surfaces/rplus/classroom/classroom.service';
import { BootstrapTenantService } from '../../../onboarding/no-tenant/bootstrap-tenant.service';

/** Exactly what app.config.ts installs, minus the auth interceptor, which only
 *  stamps a header and has no bearing on how a failure is shaped. */
function chainTestBed(): HttpTestingController {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return TestBed.inject(HttpTestingController);
}

interface Kinded {
  readonly kind: string;
}

/** Fire a call, flush one error response, and return what the classifier made of it. */
async function classified(
  call: () => Promise<unknown>,
  status: number,
  // The error envelope this harness flushes. Typed as the object shape rather
  // than `unknown`, because TestRequest.flush takes a body union that
  // `unknown` does not satisfy: under tsconfig.spec.json that was a TS2345,
  // and a spec that does not typecheck is a spec nobody can trust to fail.
  body: Record<string, unknown>,
): Promise<string> {
  const httpMock = chainTestBed();
  const pending = call();
  const reqs = httpMock.match(() => true);
  expect(reqs.length, 'expected exactly one request').toBe(1);
  reqs[0].flush(body, { status, statusText: String(status) });
  const result = (await pending) as Kinded;
  return result.kind;
}

const SETUP_PAYLOAD = { idp_providers: [], finish: true } as never;

const NO_TENANT = { error: { code: 'GATEWAY_NO_ACTIVE_TENANT', message: 'no active organisation' } };

describe('error classifiers, through the interceptor chain the app installs', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does not report a 400 as a network failure', async () => {
    const kind = await classified(
      () =>
        firstValueFrom(
          TestBed.inject(TenantAddonsService).applyAddons({ add_on_codes: ['tms'] }),
        ),
      400,
      { error: { code: 'unknown_addon_code', message: 'nope' } },
    );
    expect(
      kind,
      'the classifier could not see the status, so its whole switch is unreachable in the app',
    ).toBe('unknown-code');
  });

  // The three wizard calls behind the gateway's 409. E1 gave the unswitched
  // operator a named refusal at the API; it only reaches them if the SPA can
  // tell that refusal apart from a dropped connection.
  it('gives the wizard add-on step the named refusal for a tenant-less session', async () => {
    const kind = await classified(
      () =>
        firstValueFrom(
          TestBed.inject(TenantAddonsService).applyAddons({ add_on_codes: ['tms'] }),
        ),
      409,
      NO_TENANT,
    );
    expect(kind).toBe('no-active-tenant');
  });

  it('gives the wizard branding step the named refusal for a tenant-less session', async () => {
    const kind = await classified(
      () =>
        firstValueFrom(
          // primary_color_hex, not primary_color: BrandingUpdatePayload has
          // only the _hex spelling, and the wrong one made this fence send a
          // body the service would refuse in production while still passing.
          TestBed.inject(TenantBrandingService).updateBranding({
            primary_color_hex: '#123456',
          }),
        ),
      409,
      NO_TENANT,
    );
    expect(kind).toBe('no-active-tenant');
  });

  it('gives the wizard apply step the named refusal for a tenant-less session', async () => {
    const kind = await classified(
      () => firstValueFrom(TestBed.inject(TenantSetupService).applyWizard(SETUP_PAYLOAD)),
      409,
      NO_TENANT,
    );
    expect(kind).toBe('no-active-tenant');
  });

  // The remaining services in the family. These do not need the 409 kind, but
  // they must stop calling every refusal a network error.
  it('lets the other classifiers in the family see a status', async () => {
    const cases: readonly [
      string,
      () => Promise<unknown>,
      number,
      Record<string, unknown>,
    ][] = [
      [
        'idp admin list',
        () => firstValueFrom(TestBed.inject(TenantIdpAdminService).list()),
        403,
        { error: { code: 'GATEWAY_FORBIDDEN' } },
      ],
      [
        'billing invoices',
        () => firstValueFrom(TestBed.inject(TenantBillingService).listInvoices({})),
        403,
        { error: { code: 'GATEWAY_FORBIDDEN' } },
      ],
      [
        'addons admin list',
        () => firstValueFrom(TestBed.inject(TenantAddonsAdminService).list()),
        403,
        { error: { code: 'GATEWAY_FORBIDDEN' } },
      ],
      [
        'tenant bootstrap',
        () => firstValueFrom(TestBed.inject(BootstrapTenantService).bootstrap('Northwind')),
        409,
        { error: { code: 'already_member' } },
      ],
    ];
    for (const [label, call, status, body] of cases) {
      const kind = await classified(call, status, body);
      expect(kind, `${label} saw no status, so every refusal reads as a dropped connection`).not.toBe(
        'network-error',
      );
    }
  });

  // classroom.service.ts carries the same shape in a retry PREDICATE rather
  // than a classifier, and there the cost is not a mislabelled toast. Its own
  // comment says "4xx is truth (unknown session, auth, RLS), not turbulence, it
  // fails loud immediately, never retried" - but with the status unreadable the
  // predicate sees 0, decides the failure is turbulence, and retries an auth or
  // RLS refusal through the whole backoff budget.
  it('does not retry a 4xx in the classroom poll', async () => {
    const httpMock = chainTestBed();
    const svc = TestBed.inject(ClassroomService);
    const pending = firstValueFrom(svc.snapshotStream('session-1')).catch(
      (e: unknown) => e,
    );
    const first = httpMock.match(() => true);
    expect(first.length).toBe(1);
    first[0].flush({ error: { code: 'GATEWAY_FORBIDDEN' } }, { status: 403, statusText: '403' });
    await pending;
    const retried = httpMock.match(() => true);
    expect(retried.length, 'a 403 was retried; 4xx is truth, not turbulence').toBe(0);
  });
});
