/**
 * TenantMembersAdminService spec — TDD RED for the L1 Tenant lane
 * (CHO-1709): H+ Members roster + add-by-email + role change against the
 * CHO-1708 gateway proxies. Mirrors tenant-addons-admin.service.spec.ts
 * (HttpTestingController against the canonical BFF URL; httpMock.verify()
 * in afterEach per chora-web/CLAUDE.md §6).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Observable, firstValueFrom } from 'rxjs';

import { TenantMembersAdminService } from './tenant-members-admin.service';
import {
  ADMIN_FRANCHISEES_PATH,
  ADMIN_TENANT_INVITES_PATH,
  ADMIN_TENANT_MEMBERS_PATH,
  ADMIN_TENANT_MEMBERSHIPS_PATH,
  TenantMemberSummary,
  adminTenantInvitePath,
  adminTenantMemberDisplayNamePath,
  adminTenantMemberPath,
  adminTenantMemberRolePath,
  adminTenantMemberRolesPath,
} from '../models/tenant-members-admin.model';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.bffBaseUrl}${ADMIN_TENANT_MEMBERS_PATH}`;
const MEMBERSHIPS = `${environment.bffBaseUrl}${ADMIN_TENANT_MEMBERSHIPS_PATH}`;
const INVITES = `${environment.bffBaseUrl}${ADMIN_TENANT_INVITES_PATH}`;
const FRANCHISEES = `${environment.bffBaseUrl}${ADMIN_FRANCHISEES_PATH}`;

const anika: TenantMemberSummary = {
  gcid: '00000000-0000-7000-8000-000000001999',
  email: 'anika@mtm.sg',
  display_name: 'Anika',
  roles: ['INSTRUCTOR'],
  last_active_at: '2026-06-10T12:00:00Z',
};

function setup(): {
  service: TenantMembersAdminService;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(TenantMembersAdminService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('TenantMembersAdminService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('roster() GETs the collection and surfaces rows', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.roster());
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [anika], next_page_token: null });
    const res = await p;
    expect(res.kind).toBe('success');
    if (res.kind === 'success') {
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].gcid).toBe(anika.gcid);
    }
  });

  it('roster() forwards the q filter as a query param', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.roster('ani'));
    const req = httpMock.expectOne(`${BASE}?q=ani`);
    req.flush({ items: [] });
    const res = await p;
    expect(res.kind).toBe('success');
  });

  it('roster() maps an empty items list to success with no rows', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.roster());
    httpMock.expectOne(BASE).flush({ items: [] });
    const res = await p;
    expect(res.kind).toBe('success');
    if (res.kind === 'success') expect(res.rows.length).toBe(0);
  });

  async function expectRosterKind(status: number | 'network', kind: string): Promise<void> {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.roster());
    const req = httpMock.expectOne(BASE);
    if (status === 'network') {
      req.error(new ProgressEvent('error'));
    } else {
      req.flush({ code: 'X', message: 'y' }, { status, statusText: 'err' });
    }
    expect((await p).kind).toBe(kind);
  }

  it('roster() classifies 401 as unauthenticated', () => expectRosterKind(401, 'unauthenticated'));
  it('roster() classifies 403 as forbidden', () => expectRosterKind(403, 'forbidden'));
  it('roster() classifies 5xx as server-error', () => expectRosterKind(500, 'server-error'));
  it('roster() classifies transport failure as network-error', () =>
    expectRosterKind('network', 'network-error'));

  it('add() POSTs {email, role} and surfaces the created member', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.add('Anika@MTM.sg', 'INSTRUCTOR'));
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'Anika@MTM.sg', role: 'INSTRUCTOR' });
    req.flush(anika, { status: 201, statusText: 'Created' });
    const res = await p;
    expect(res.kind).toBe('success');
    if (res.kind === 'success') expect(res.member.email).toBe('anika@mtm.sg');
  });

  it('add() maps 404 IDENTITY_USER_NOT_FOUND to user-not-found', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.add('ghost@mtm.sg', 'LEARNER'));
    httpMock
      .expectOne(BASE)
      .flush({ code: 'IDENTITY_USER_NOT_FOUND', message: 'no user' }, { status: 404, statusText: 'nf' });
    expect((await p).kind).toBe('user-not-found');
  });

  it('add() maps 409 to duplicate', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.add('anika@mtm.sg', 'ADMIN'));
    httpMock
      .expectOne(BASE)
      .flush({ code: 'IDENTITY_MEMBERSHIP_DUPLICATE', message: 'dup' }, { status: 409, statusText: 'conflict' });
    expect((await p).kind).toBe('duplicate');
  });

  it('add() maps 400 to invalid with the flat envelope code', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.add('agent@mtm.sg', 'LEARNER'));
    httpMock
      .expectOne(BASE)
      .flush({ code: 'IDENTITY_AGID_REJECTED', message: 'agid' }, { status: 400, statusText: 'bad' });
    const res = await p;
    expect(res.kind).toBe('invalid');
    if (res.kind === 'invalid') expect(res.code).toBe('IDENTITY_AGID_REJECTED');
  });

  it('changeRole() PATCHes the {gcid}/role item path', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.changeRole(anika.gcid, 'ADMIN'));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}${adminTenantMemberRolePath(anika.gcid)}`,
    );
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role: 'ADMIN' });
    req.flush({ ...anika, roles: ['ADMIN'] });
    const res = await p;
    expect(res.kind).toBe('success');
    if (res.kind === 'success') expect(res.member.roles[0]).toBe('ADMIN');
  });

  it('changeRole() maps 404 to user-not-found (membership absent)', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.changeRole(anika.gcid, 'ADMIN'));
    httpMock
      .expectOne(`${environment.bffBaseUrl}${adminTenantMemberRolePath(anika.gcid)}`)
      .flush({ code: 'IDENTITY_MEMBERSHIP_NOT_FOUND', message: 'nf' }, { status: 404, statusText: 'nf' });
    expect((await p).kind).toBe('user-not-found');
  });

  // ── WS4 / ADR-194 — operator cross-tenant grant (D1) ─────────────────
  describe('grantMembership (operator cross-tenant grant)', () => {
    const TARGET = '00000000-0000-7000-8000-000000000001';
    const grantBody = {
      gcid: anika.gcid,
      tenant_id: TARGET,
      roles: ['INSTRUCTOR'],
    };

    it('POSTs {gcid, tenant_id, roles[]} and surfaces the membership row', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(
        service.grantMembership(anika.gcid, TARGET, ['INSTRUCTOR']),
      );
      const req = httpMock.expectOne(MEMBERSHIPS);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(grantBody);
      req.flush(
        {
          membership_id: 'm-1',
          gcid: anika.gcid,
          tenant_id: TARGET,
          roles: ['INSTRUCTOR'],
          granted_at: '2026-06-25T00:00:00Z',
        },
        { status: 201, statusText: 'Created' },
      );
      const res = await p;
      expect(res.kind).toBe('success');
      if (res.kind === 'success') {
        expect(res.membership.membership_id).toBe('m-1');
        expect(res.membership.tenant_id).toBe(TARGET);
      }
    });

    it('maps 403 (not platform_operator) to forbidden', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(
        service.grantMembership(anika.gcid, TARGET, ['INSTRUCTOR']),
      );
      httpMock
        .expectOne(MEMBERSHIPS)
        .flush({ code: 'AUTH_INSUFFICIENT_ROLE', message: 'no' }, { status: 403, statusText: 'forbidden' });
      expect((await p).kind).toBe('forbidden');
    });

    it('maps 422 (role not grantable) to invalid with the flat code', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(
        service.grantMembership(anika.gcid, TARGET, ['INSTRUCTOR']),
      );
      httpMock
        .expectOne(MEMBERSHIPS)
        .flush({ code: 'IDENTITY_ROLE_NOT_GRANTABLE', message: 'no' }, { status: 422, statusText: 'unproc' });
      const res = await p;
      expect(res.kind).toBe('invalid');
      if (res.kind === 'invalid') expect(res.code).toBe('IDENTITY_ROLE_NOT_GRANTABLE');
    });

    it('maps 409 to duplicate and 404 to not-found', async () => {
      const { service, httpMock } = setup();
      const dup = firstValueFrom(service.grantMembership(anika.gcid, TARGET, ['ADMIN']));
      httpMock.expectOne(MEMBERSHIPS).flush({ code: 'X', message: 'dup' }, { status: 409, statusText: 'c' });
      expect((await dup).kind).toBe('duplicate');

      const nf = firstValueFrom(service.grantMembership(anika.gcid, TARGET, ['ADMIN']));
      httpMock.expectOne(MEMBERSHIPS).flush({ code: 'X', message: 'nf' }, { status: 404, statusText: 'nf' });
      expect((await nf).kind).toBe('not-found');
    });
  });

  // ── WS4 / ADR-194 — cold-invite create/list/revoke (D2) ──────────────
  describe('createInvite (unified add-by-email + cold-invite)', () => {
    it('POSTs {email, roles[]} (no tenant) and maps kind:granted', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.createInvite('anika@mtm.sg', ['INSTRUCTOR']));
      const req = httpMock.expectOne(INVITES);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'anika@mtm.sg', roles: ['INSTRUCTOR'] });
      req.flush(
        {
          kind: 'granted',
          membership_id: 'm-9',
          gcid: anika.gcid,
          tenant_id: 't-1',
          roles: ['INSTRUCTOR'],
          granted_at: '2026-06-25T00:00:00Z',
        },
        { status: 201, statusText: 'Created' },
      );
      const res = await p;
      expect(res.kind).toBe('granted');
      if (res.kind === 'granted') expect(res.membership.membership_id).toBe('m-9');
    });

    it('includes tenant_id in the body for the operator path', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(
        service.createInvite('cold@mtm.sg', ['INSTRUCTOR'], 'tenant-x'),
      );
      const req = httpMock.expectOne(INVITES);
      expect(req.request.body).toEqual({
        email: 'cold@mtm.sg',
        roles: ['INSTRUCTOR'],
        tenant_id: 'tenant-x',
      });
      req.flush(
        {
          kind: 'invited',
          invite_id: 'i-1',
          email: 'cold@mtm.sg',
          tenant_id: 'tenant-x',
          roles: ['INSTRUCTOR'],
          status: 'pending',
          expires_at: '2026-07-25T00:00:00Z',
          created_at: '2026-06-25T00:00:00Z',
        },
        { status: 201, statusText: 'Created' },
      );
      const res = await p;
      expect(res.kind).toBe('invited');
      if (res.kind === 'invited') expect(res.invite.invite_id).toBe('i-1');
    });

    it('maps 409 to duplicate, 422 to invalid, 403 to forbidden', async () => {
      const { service, httpMock } = setup();
      const dup = firstValueFrom(service.createInvite('a@b.c', ['LEARNER']));
      httpMock.expectOne(INVITES).flush({ code: 'X', message: 'd' }, { status: 409, statusText: 'c' });
      expect((await dup).kind).toBe('duplicate');

      const inv = firstValueFrom(service.createInvite('a@b.c', ['ADMIN']));
      httpMock.expectOne(INVITES).flush({ code: 'IDENTITY_ROLE_NOT_GRANTABLE', message: 'x' }, { status: 422, statusText: 'u' });
      const r = await inv;
      expect(r.kind).toBe('invalid');
      if (r.kind === 'invalid') expect(r.code).toBe('IDENTITY_ROLE_NOT_GRANTABLE');

      const fb = firstValueFrom(service.createInvite('a@b.c', ['ADMIN']));
      httpMock.expectOne(INVITES).flush({ code: 'X', message: 'f' }, { status: 403, statusText: 'f' });
      expect((await fb).kind).toBe('forbidden');
    });
  });

  describe('listInvites / revokeInvite / removeMember', () => {
    it('listInvites() GETs the collection and surfaces invites', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.listInvites());
      const req = httpMock.expectOne(INVITES);
      expect(req.request.method).toBe('GET');
      req.flush({
        items: [
          {
            invite_id: 'i-1',
            email: 'cold@mtm.sg',
            tenant_id: 't-1',
            roles: ['INSTRUCTOR'],
            status: 'pending',
            expires_at: '2026-07-25T00:00:00Z',
            created_at: '2026-06-25T00:00:00Z',
          },
        ],
      });
      const res = await p;
      expect(res.kind).toBe('success');
      if (res.kind === 'success') expect(res.invites.length).toBe(1);
    });

    it('listInvites() maps a missing items array to an empty success', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.listInvites());
      httpMock.expectOne(INVITES).flush({});
      const res = await p;
      expect(res.kind).toBe('success');
      if (res.kind === 'success') expect(res.invites.length).toBe(0);
    });

    it('listInvites() classifies 403 as forbidden', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.listInvites());
      httpMock.expectOne(INVITES).flush({ code: 'X', message: 'f' }, { status: 403, statusText: 'f' });
      expect((await p).kind).toBe('forbidden');
    });

    it('revokeInvite() DELETEs the item path and acks 204', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.revokeInvite('i-7'));
      const req = httpMock.expectOne(`${environment.bffBaseUrl}${adminTenantInvitePath('i-7')}`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect((await p).kind).toBe('success');
    });

    it('revokeInvite() maps 404 to not-found', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.revokeInvite('i-7'));
      httpMock
        .expectOne(`${environment.bffBaseUrl}${adminTenantInvitePath('i-7')}`)
        .flush({ code: 'X', message: 'nf' }, { status: 404, statusText: 'nf' });
      expect((await p).kind).toBe('not-found');
    });

    it('removeMember() DELETEs /tenant-members/{gcid} and acks 204', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.removeMember(anika.gcid));
      const req = httpMock.expectOne(`${environment.bffBaseUrl}${adminTenantMemberPath(anika.gcid)}`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect((await p).kind).toBe('success');
    });

    it('removeMember() maps 404 to not-found and 403 to forbidden', async () => {
      const { service, httpMock } = setup();
      const nf = firstValueFrom(service.removeMember(anika.gcid));
      httpMock
        .expectOne(`${environment.bffBaseUrl}${adminTenantMemberPath(anika.gcid)}`)
        .flush({ code: 'X', message: 'nf' }, { status: 404, statusText: 'nf' });
      expect((await nf).kind).toBe('not-found');

      const fb = firstValueFrom(service.removeMember(anika.gcid));
      httpMock
        .expectOne(`${environment.bffBaseUrl}${adminTenantMemberPath(anika.gcid)}`)
        .flush({ code: 'X', message: 'f' }, { status: 403, statusText: 'f' });
      expect((await fb).kind).toBe('forbidden');
    });
  });

  // ── Classifier branch coverage (401 / network / 500) across WS4 calls ─
  // One TestBed per `it` (configureTestingModule can't run twice in a test);
  // the shared httpMock flushes each sequential request before the next.
  describe('WS4 classifier branches', () => {
    async function expectKind<R extends { kind: string }>(
      service: TenantMembersAdminService,
      httpMock: HttpTestingController,
      make: (s: TenantMembersAdminService) => Observable<R>,
      url: string,
      status: number | 'network',
      kind: string,
    ): Promise<void> {
      const p = firstValueFrom(make(service));
      const req = httpMock.expectOne(url);
      if (status === 'network') req.error(new ProgressEvent('error'));
      else req.flush({ code: 'X', message: 'y' }, { status, statusText: 'e' });
      expect((await p).kind).toBe(kind);
    }

    const T = '00000000-0000-7000-8000-000000000001';

    it('grantMembership 401/network/500', async () => {
      const { service, httpMock } = setup();
      const call = (s: TenantMembersAdminService) => s.grantMembership(anika.gcid, T, ['ADMIN']);
      await expectKind(service, httpMock, call, MEMBERSHIPS, 401, 'unauthenticated');
      await expectKind(service, httpMock, call, MEMBERSHIPS, 'network', 'network-error');
      await expectKind(service, httpMock, call, MEMBERSHIPS, 500, 'server-error');
    });

    it('createInvite 401/network/500', async () => {
      const { service, httpMock } = setup();
      const call = (s: TenantMembersAdminService) => s.createInvite('a@b.c', ['LEARNER']);
      await expectKind(service, httpMock, call, INVITES, 401, 'unauthenticated');
      await expectKind(service, httpMock, call, INVITES, 'network', 'network-error');
      await expectKind(service, httpMock, call, INVITES, 500, 'server-error');
    });

    it('listInvites 401/network/500', async () => {
      const { service, httpMock } = setup();
      const call = (s: TenantMembersAdminService) => s.listInvites();
      await expectKind(service, httpMock, call, INVITES, 401, 'unauthenticated');
      await expectKind(service, httpMock, call, INVITES, 'network', 'network-error');
      await expectKind(service, httpMock, call, INVITES, 500, 'server-error');
    });

    it('revokeInvite 401/network/500', async () => {
      const { service, httpMock } = setup();
      const url = `${environment.bffBaseUrl}${adminTenantInvitePath('i-1')}`;
      const call = (s: TenantMembersAdminService) => s.revokeInvite('i-1');
      await expectKind(service, httpMock, call, url, 401, 'unauthenticated');
      await expectKind(service, httpMock, call, url, 'network', 'network-error');
      await expectKind(service, httpMock, call, url, 500, 'server-error');
    });

    it('removeMember 401/network/500', async () => {
      const { service, httpMock } = setup();
      const url = `${environment.bffBaseUrl}${adminTenantMemberPath(anika.gcid)}`;
      const call = (s: TenantMembersAdminService) => s.removeMember(anika.gcid);
      await expectKind(service, httpMock, call, url, 401, 'unauthenticated');
      await expectKind(service, httpMock, call, url, 'network', 'network-error');
      await expectKind(service, httpMock, call, url, 500, 'server-error');
    });
  });

  it('createInvite 422 with a code-less body falls back to IDENTITY_INVALID_BODY', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.createInvite('a@b.c', ['LEARNER']));
    httpMock.expectOne(INVITES).flush({}, { status: 422, statusText: 'u' });
    const r = await p;
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') expect(r.code).toBe('IDENTITY_INVALID_BODY');
  });

  // ── Display-name editor (pre-existing service method; coverage) ──────
  it('setDisplayName() PATCHes {gcid}/display-name with {display_name}', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.setDisplayName(anika.gcid, 'Anika Tan'));
    const req = httpMock.expectOne(
      `${environment.bffBaseUrl}${adminTenantMemberDisplayNamePath(anika.gcid)}`,
    );
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ display_name: 'Anika Tan' });
    req.flush({ ...anika, display_name: 'Anika Tan', roles: [] });
    const res = await p;
    expect(res.kind).toBe('success');
    if (res.kind === 'success') expect(res.member.display_name).toBe('Anika Tan');
  });

  // ── Operator managed-tenant directory (ADR-217 Debt 1) ───────────────
  // listManagedTenants() sources the operator invite-target picker from the
  // recursive franchisee directory (MASTER-only). It pages the FULL subtree
  // (page_size=100 + next_page_token) so the <select> never truncates, maps
  // {tenant_id,name} → {id,name}, and fail-loud classifies transport errors
  // rather than degrading to a silent empty list.
  describe('listManagedTenants()', () => {
    it('GETs the franchisee directory at page_size=100 and maps rows', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.listManagedTenants());
      const req = httpMock.expectOne(`${FRANCHISEES}?page_size=100`);
      expect(req.request.method).toBe('GET');
      req.flush({
        franchisees: [
          { tenant_id: 'ten_acme', name: 'Acme Pte Ltd' },
          { tenant_id: 'ten_beta', name: 'Beta LLP' },
        ],
        next_page_token: null,
      });
      const res = await p;
      expect(res.kind).toBe('success');
      if (res.kind === 'success') {
        expect(res.tenants).toEqual([
          { id: 'ten_acme', name: 'Acme Pte Ltd' },
          { id: 'ten_beta', name: 'Beta LLP' },
        ]);
      }
    });

    it('follows next_page_token and accumulates every page', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.listManagedTenants());
      httpMock.expectOne(`${FRANCHISEES}?page_size=100`).flush({
        franchisees: [{ tenant_id: 'ten_1', name: 'One' }],
        next_page_token: 'CUR2',
      });
      httpMock.expectOne(`${FRANCHISEES}?page_size=100&page_token=CUR2`).flush({
        franchisees: [{ tenant_id: 'ten_2', name: 'Two' }],
        next_page_token: null,
      });
      const res = await p;
      expect(res.kind).toBe('success');
      if (res.kind === 'success') {
        expect(res.tenants.map((t) => t.id)).toEqual(['ten_1', 'ten_2']);
      }
    });

    it('falls back to the tenant id when a directory row has no name', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.listManagedTenants());
      httpMock.expectOne(`${FRANCHISEES}?page_size=100`).flush({
        franchisees: [{ tenant_id: 'ten_nameless', name: '  ' }],
        next_page_token: null,
      });
      const res = await p;
      if (res.kind === 'success') {
        expect(res.tenants).toEqual([{ id: 'ten_nameless', name: 'ten_nameless' }]);
      }
    });

    it('maps an empty directory to success with no tenants', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.listManagedTenants());
      httpMock
        .expectOne(`${FRANCHISEES}?page_size=100`)
        .flush({ franchisees: [], next_page_token: null });
      const res = await p;
      expect(res.kind).toBe('success');
      if (res.kind === 'success') expect(res.tenants.length).toBe(0);
    });

    it('classifies 403 as forbidden (non-operator caller)', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.listManagedTenants());
      httpMock
        .expectOne(`${FRANCHISEES}?page_size=100`)
        .flush(
          { code: 'GATEWAY_FORBIDDEN', message: 'x' },
          { status: 403, statusText: 'f' },
        );
      expect((await p).kind).toBe('forbidden');
    });

    it('classifies a transport failure as network-error (fail-loud, not empty)', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.listManagedTenants());
      httpMock
        .expectOne(`${FRANCHISEES}?page_size=100`)
        .error(new ProgressEvent('error'));
      expect((await p).kind).toBe('network-error');
    });
  });

  // ── Multi-role REPLACE — CHO-1809 follow-up ────────────────────────
  describe('setRoles()', () => {
    it('PUTs the full role set to {gcid}/roles and surfaces the updated member', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.setRoles(anika.gcid, ['INSTRUCTOR', 'ADMIN']));
      const req = httpMock.expectOne(
        `${environment.bffBaseUrl}${adminTenantMemberRolesPath(anika.gcid)}`,
      );
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ roles: ['INSTRUCTOR', 'ADMIN'] });
      req.flush({ ...anika, roles: ['INSTRUCTOR', 'ADMIN'] });
      const res = await p;
      expect(res.kind).toBe('success');
      if (res.kind === 'success') {
        expect(res.member.roles).toEqual(['INSTRUCTOR', 'ADMIN']);
      }
    });

    it('maps 401 to unauthenticated', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.setRoles(anika.gcid, ['ADMIN']));
      httpMock
        .expectOne(`${environment.bffBaseUrl}${adminTenantMemberRolesPath(anika.gcid)}`)
        .flush({ code: 'X', message: 'u' }, { status: 401, statusText: 'u' });
      expect((await p).kind).toBe('unauthenticated');
    });

    it('maps 403 to forbidden', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.setRoles(anika.gcid, ['ADMIN']));
      httpMock
        .expectOne(`${environment.bffBaseUrl}${adminTenantMemberRolesPath(anika.gcid)}`)
        .flush({ code: 'X', message: 'f' }, { status: 403, statusText: 'f' });
      expect((await p).kind).toBe('forbidden');
    });

    it('maps 5xx to server-error', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.setRoles(anika.gcid, ['ADMIN']));
      httpMock
        .expectOne(`${environment.bffBaseUrl}${adminTenantMemberRolesPath(anika.gcid)}`)
        .flush(null, { status: 500, statusText: 'e' });
      expect((await p).kind).toBe('server-error');
    });

    it('maps 422 to invalid with the flat envelope code', async () => {
      const { service, httpMock } = setup();
      const p = firstValueFrom(service.setRoles(anika.gcid, ['ADMIN']));
      httpMock
        .expectOne(`${environment.bffBaseUrl}${adminTenantMemberRolesPath(anika.gcid)}`)
        .flush({ code: 'IDENTITY_ROLE_NOT_GRANTABLE', message: 'x' }, { status: 422, statusText: 'u' });
      const res = await p;
      expect(res.kind).toBe('invalid');
      if (res.kind === 'invalid') expect(res.code).toBe('IDENTITY_ROLE_NOT_GRANTABLE');
    });
  });

  // ── roster() q-trimming branch ─────────────────────────────────────
  it('roster() treats a whitespace-only q as no filter — bare URL, no q param', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.roster('   '));
    const req = httpMock.expectOne(BASE);
    expect(req.request.params.has('q')).toBe(false);
    req.flush({ items: [] });
    const res = await p;
    expect(res.kind).toBe('success');
  });

  // ── listManagedTenants() classifier residual branches ──────────────
  it('listManagedTenants() classifies 401 as unauthenticated', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.listManagedTenants());
    httpMock
      .expectOne(`${FRANCHISEES}?page_size=100`)
      .flush({ code: 'X', message: 'u' }, { status: 401, statusText: 'u' });
    expect((await p).kind).toBe('unauthenticated');
  });

  it('listManagedTenants() classifies 5xx as server-error', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.listManagedTenants());
    httpMock
      .expectOne(`${FRANCHISEES}?page_size=100`)
      .flush(null, { status: 500, statusText: 'e' });
    expect((await p).kind).toBe('server-error');
  });
});
