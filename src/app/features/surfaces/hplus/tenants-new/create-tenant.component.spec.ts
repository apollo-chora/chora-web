/**
 * CreateTenantComponent specs (UX Track U, package E1, screen S2).
 *
 * Drives the REAL service through HttpTestingController so the literal BFF
 * path is pinned. This screen is the only way to create an organisation, and a
 * silently wrong URL would look exactly like a permission failure.
 *
 * The assertions that matter most are not the happy path:
 *   - a failed create must not route on and must not switch the operator's tenant
 *   - each refusal must reach the operator as its own reason, never one generic error
 *   - the tenant switch on 201 is a session re-mint, not a poll
 */
import { HPLUS_ROUTES } from '../hplus.routes';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreateTenantComponent } from './create-tenant.component';
import {
  CHORA_MASTER_TENANT_ID,
  CONTINUE_SETUP_PATH,
  SUB_TENANTS_PATH,
} from './create-tenant.model';
import { TranslateService } from '../../../../core/services/translate.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import { environment } from '../../../../../environments/environment';

const CREATE_URL = `${environment.bffBaseUrl}${SUB_TENANTS_PATH}`;
const OPERATOR_GCID = '01931f2a-0000-7000-8000-000000000abc';
const NEW_TENANT_ID = '01931f2a-1111-7000-8000-0000000000ff';

const CATALOGUE = {
  kind: 'success' as const,
  items: [
    { addon_plan_id: 'p1', code: 'tms', display_name: 'Training Management Suite', category: 'Delivery' },
    { addon_plan_id: 'p2', code: 'cms', display_name: 'Content Management Suite', category: 'Creation' },
  ],
  nextCursor: null,
};

function setup(opts: { catalogue?: unknown; switchTenant?: unknown } = {}) {
  const switchTenant = opts.switchTenant ?? vi.fn(() => of(void 0));
  const addons = { listMarketplace: vi.fn(() => of(opts.catalogue ?? CATALOGUE)) };
  TestBed.configureTestingModule({
    imports: [CreateTenantComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      { provide: AuthService, useValue: { gcid: signal(OPERATOR_GCID) } },
      { provide: TenantContextService, useValue: { switchTenant } },
      { provide: TenantAddonsAdminService, useValue: addons },
    ],
  });
  const fixture = TestBed.createComponent(CreateTenantComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  const router = TestBed.inject(Router);
  return { fixture, cmp: fixture.componentInstance, httpMock, switchTenant, addons, router };
}

/** Fill the form with a submittable draft. */
function fillValid(cmp: CreateTenantComponent) {
  cmp.displayName.set('Northwind Academy');
}

describe('CreateTenantComponent', () => {
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
  });

  it('defaults the parent to chora-master and keeps it read-only in v1', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();

    expect(s.cmp.parentTenantId).toBe(CHORA_MASTER_TENANT_ID);
    const el: HTMLElement = s.fixture.nativeElement;
    const parent = el.querySelector<HTMLInputElement>('[data-testid="parent-tenant-id"]');
    expect(parent).toBeTruthy();
    expect(parent!.readOnly).toBe(true);
  });

  it('defaults the first administrator to the operator, which is the ruled v1', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();

    // R10: a new organisation's first administrator has by definition never
    // signed in, so no GCID exists to type. The operator holds it temporarily
    // and hands over through /h/members.
    expect(s.cmp.ownerGcid()).toBe(OPERATOR_GCID);
  });

  it('defaults the hosting mode to FRANCHISE', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();

    expect(s.cmp.hostingMode()).toBe('FRANCHISE');
  });

  it('posts the chosen add-on codes on the canonical create path', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.toggleAddOn('tms');
    s.cmp.submit();

    const req = httpMock.expectOne(CREATE_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      parent_tenant_id: CHORA_MASTER_TENANT_ID,
      display_name: 'Northwind Academy',
      hosting_mode: 'FRANCHISE',
      owner_gcid: OPERATOR_GCID,
      add_on_codes: ['tms'],
    });
    req.flush({ tenant_id: NEW_TENANT_ID, display_name: 'Northwind Academy' }, { status: 201, statusText: 'Created' });
  });

  it('refuses a name under three characters without calling the service', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    s.cmp.displayName.set('No');
    s.cmp.submit();

    // The gateway enforces only non-empty and 256; the domain enforces 3, and
    // the operator should learn that here rather than through a 500 upstream.
    httpMock.expectNone(CREATE_URL);
    expect(s.cmp.errorKey()).toBe('hplus.tenants_new.errors.name_too_short');
  });

  it('refuses a name over the 256-character ceiling before calling the service', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    s.cmp.displayName.set('x'.repeat(257));
    s.cmp.submit();

    httpMock.expectNone(CREATE_URL);
    expect(s.cmp.errorKey()).toBe('hplus.tenants_new.errors.name_too_long');
  });

  it('refuses an emptied administrator field rather than posting a blank owner', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    // The operator can clear the default; a blank owner_gcid would 400
    // upstream, and the gateway's message names the field but not the fix.
    s.cmp.onOwnerGcid('   ');
    s.cmp.submit();

    httpMock.expectNone(CREATE_URL);
    expect(s.cmp.errorKey()).toBe('hplus.tenants_new.errors.owner_required');
  });

  it('falls back on the status when the body carries no recognised code', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.submit();
    httpMock
      .expectOne(CREATE_URL)
      .flush({ error: { code: 'SOMETHING_NEW' } }, { status: 409, statusText: 'Conflict' });

    expect(s.cmp.errorKey()).toBe('hplus.tenants_new.errors.already_exists');
  });

  it('falls back to the generic reason for a status it has no copy for', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.submit();
    httpMock
      .expectOne(CREATE_URL)
      .flush({}, { status: 418, statusText: 'Teapot' });

    expect(s.cmp.errorKey()).toBe('hplus.tenants_new.errors.unexpected');
  });

  it('ignores a second submit while one is in flight', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.submit();
    s.cmp.submit();

    // One organisation, not two: expectOne fails if the second call fired.
    httpMock
      .expectOne(CREATE_URL)
      .flush({ tenant_id: NEW_TENANT_ID }, { status: 201, statusText: 'Created' });
  });

  it('deselects an add-on that is toggled twice', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.toggleAddOn('tms');
    s.cmp.toggleAddOn('cms');
    s.cmp.toggleAddOn('tms');
    expect(s.cmp.isChosen('tms')).toBe(false);
    s.cmp.submit();

    const req = httpMock.expectOne(CREATE_URL);
    expect((req.request.body as { add_on_codes: string[] }).add_on_codes).toEqual(['cms']);
    req.flush({ tenant_id: NEW_TENANT_ID }, { status: 201, statusText: 'Created' });
  });

  it('re-mints the session onto the new tenant on the 201, with no poll', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.submit();

    httpMock
      .expectOne(CREATE_URL)
      .flush({ tenant_id: NEW_TENANT_ID, display_name: 'Northwind Academy' }, { status: 201, statusText: 'Created' });

    // The mint resolves memberships over the AUTHORITATIVE chora_tenancy
    // members table, not the identity mirror, and Persist writes the owner row
    // inside the create transaction. So the membership is readable the instant
    // the 201 returns and a bounded wait would be dead code.
    expect(s.switchTenant).toHaveBeenCalledWith(NEW_TENANT_ID);
    httpMock.verify();
  });

  it('says the roster catches up shortly rather than showing it as complete', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.submit();
    httpMock
      .expectOne(CREATE_URL)
      .flush({ tenant_id: NEW_TENANT_ID, display_name: 'Northwind Academy' }, { status: 201, statusText: 'Created' });
    s.fixture.detectChanges();

    // The H+ roster reads the identity mirror, which is fed asynchronously
    // through the outbox, so it is the one thing here that is not immediate.
    expect(s.cmp.created()?.tenant_id).toBe(NEW_TENANT_ID);
    const text: string = s.fixture.nativeElement.textContent ?? '';
    expect(text).toContain('hplus.tenants_new.success.roster_pending');
  });

  it('sends the operator on to a route that actually exists', async () => {
    // The first-launch spec proposes /h/setup for the re-parented wizard and
    // that route does not exist yet, so the obvious link would be dead. Assert
    // the target against the admin route table rather than reading it back
    // from the same constant the component used.
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.submit();
    httpMock
      .expectOne(CREATE_URL)
      .flush({ tenant_id: NEW_TENANT_ID }, { status: 201, statusText: 'Created' });
    s.fixture.detectChanges();

    // `nativeElement` is `any`, so the type argument was an untyped call and
    // tsc refused it. Narrow the element first. Pre-existing, not an E5 change.
    const link = (s.fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      '[data-testid="continue-setup"]',
    );
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe(CONTINUE_SETUP_PATH);

    // E5 moved the wizard onto this surface. The fence moves with it: assert
    // against the table that now declares the route, not the one that used to.
    const declared = HPLUS_ROUTES.some((r) => r.path === 'setup');
    expect(declared, 'the H+ route table must declare the wizard').toBe(true);
    expect(CONTINUE_SETUP_PATH).toBe('/h/setup');
  });

  it('does not switch tenants when the create fails', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.submit();

    httpMock
      .expectOne(CREATE_URL)
      .flush({ error: { code: 'GATEWAY_FORBIDDEN' } }, { status: 403, statusText: 'Forbidden' });

    expect(s.switchTenant).not.toHaveBeenCalled();
    expect(s.cmp.created()).toBeNull();
  });

  // The codes below are the ones writeSubTenantErr and validateSubTenant
  // actually emit. Note what is NOT here: there is no distinct code for an
  // unknown add-on code. Every 400 on this route, local validation and the
  // upstream InvalidArgument alike, carries GATEWAY_INVALID_REQUEST, so the
  // screen cannot tell the operator which field was wrong from the code. It
  // shows the envelope's message for that, and the picker offers only
  // catalogue codes so the case should not arise from this screen at all.
  it('gives each refusal its own reason', () => {
    const cases: readonly [number, string, string][] = [
      [403, 'GATEWAY_FORBIDDEN', 'hplus.tenants_new.errors.forbidden'],
      [409, 'GATEWAY_ALREADY_EXISTS', 'hplus.tenants_new.errors.already_exists'],
      [409, 'GATEWAY_PRECONDITION_FAILED', 'hplus.tenants_new.errors.parent_precondition'],
      [400, 'GATEWAY_INVALID_REQUEST', 'hplus.tenants_new.errors.invalid'],
      [401, 'GATEWAY_UNAUTHENTICATED', 'hplus.tenants_new.errors.unauthenticated'],
      [503, 'GATEWAY_UPSTREAM_UNAVAILABLE', 'hplus.tenants_new.errors.upstream'],
      [500, 'GATEWAY_UPSTREAM_ERROR', 'hplus.tenants_new.errors.unexpected'],
    ];
    for (const [status, code, key] of cases) {
      const s = setup();
      httpMock = s.httpMock;
      s.fixture.detectChanges();
      fillValid(s.cmp);
      s.cmp.submit();
      httpMock
        .expectOne(CREATE_URL)
        .flush({ error: { code } }, { status, statusText: String(status) });
      expect(s.cmp.errorKey(), `${status} ${code}`).toBe(key);
      httpMock.verify();
      TestBed.resetTestingModule();
    }
  });

  it('shows which field the gateway rejected, since the 400 code cannot say', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.submit();
    httpMock.expectOne(CREATE_URL).flush(
      { error: { code: 'GATEWAY_INVALID_REQUEST', message: 'owner_gcid must be a UUID' } },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(s.cmp.errorKey()).toBe('hplus.tenants_new.errors.invalid');
    expect(s.cmp.errorDetail()).toBe('owner_gcid must be a UUID');
  });

  it('reports a catalogue it could not read instead of an empty picker', () => {
    const s = setup({ catalogue: { kind: 'error', items: [], nextCursor: null } });
    httpMock = s.httpMock;
    s.fixture.detectChanges();

    // An add-on list that failed to load and a tenant genuinely offered
    // nothing are different facts, and only the first is a gap.
    expect(s.cmp.catalogueUnavailable()).toBe(true);
    const text: string = s.fixture.nativeElement.textContent ?? '';
    expect(text).toContain('hplus.tenants_new.addons.unavailable');
  });

  it('surfaces a failed tenant switch instead of routing on as if it worked', () => {
    const s = setup({ switchTenant: vi.fn(() => throwError(() => new Error('mint failed'))) });
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    fillValid(s.cmp);
    s.cmp.submit();
    httpMock
      .expectOne(CREATE_URL)
      .flush({ tenant_id: NEW_TENANT_ID, display_name: 'Northwind Academy' }, { status: 201, statusText: 'Created' });

    // The organisation exists; the operator's session does not point at it.
    // Saying "ready" here would send them into the wizard to collect 401s.
    expect(s.cmp.errorKey()).toBe('hplus.tenants_new.errors.switch_failed');
  });
});
