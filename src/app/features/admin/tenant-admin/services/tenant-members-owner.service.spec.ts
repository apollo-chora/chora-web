/**
 * TenantMembersAdminService, ownership refusals (S7-B8 / UX refactor R21).
 *
 * The backend now refuses to strip or empty tenant ownership with HTTP 409 and
 * one of two named codes. Both existing classifiers would swallow that:
 * classifyMutation folds every 409 into `duplicate` ("already a member") and
 * classifyAck has no 409 arm at all, so it falls through to `server-error`.
 * Either way the admin is told something untrue about a refusal they can
 * actually act on, which is the "a default arm hides the outage" shape.
 *
 * The mapping is keyed on the flat envelope's `code`, not on the status, so an
 * ordinary duplicate 409 keeps behaving exactly as it did.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { TenantMembersAdminService } from './tenant-members-admin.service';
import {
  ADMIN_TENANT_MEMBERS_PATH,
  adminTenantMemberPath,
  adminTenantMemberRolesPath,
} from '../models/tenant-members-admin.model';
import { environment } from '../../../../../environments/environment';

const GCID = '00000000-0000-7000-8000-0000000000aa';
const ROLES_URL = `${environment.bffBaseUrl}${adminTenantMemberRolesPath(GCID)}`;
const MEMBER_URL = `${environment.bffBaseUrl}${adminTenantMemberPath(GCID)}`;

function setup(): { service: TenantMembersAdminService; httpMock: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(TenantMembersAdminService),
    httpMock: TestBed.inject(HttpTestingController),
  };
}

describe('TenantMembersAdminService ownership refusals', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  it('setRoles() maps IDENTITY_OWNER_ROLE_PROTECTED to owner-protected', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.setRoles(GCID, ['INSTRUCTOR']));
    httpMock.expectOne(ROLES_URL).flush(
      { code: 'IDENTITY_OWNER_ROLE_PROTECTED', message: 'owns the organisation' },
      { status: 409, statusText: 'conflict' },
    );
    const res = await p;
    expect(res.kind).toBe('owner-protected');
    if (res.kind === 'owner-protected') expect(res.reason).toBe('owner-role');
  });

  it('setRoles() maps IDENTITY_LAST_OWNER_PROTECTED to owner-protected', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.setRoles(GCID, ['ADMIN']));
    httpMock.expectOne(ROLES_URL).flush(
      { code: 'IDENTITY_LAST_OWNER_PROTECTED', message: 'last owner' },
      { status: 409, statusText: 'conflict' },
    );
    const res = await p;
    expect(res.kind).toBe('owner-protected');
    if (res.kind === 'owner-protected') expect(res.reason).toBe('last-owner');
  });

  it('setRoles() still maps an ordinary 409 to duplicate', async () => {
    // The regression fence: the new arm is keyed on the code, so every other
    // conflict keeps the behaviour it had.
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.setRoles(GCID, ['ADMIN']));
    httpMock.expectOne(ROLES_URL).flush(
      { code: 'IDENTITY_MEMBERSHIP_DUPLICATE', message: 'dup' },
      { status: 409, statusText: 'conflict' },
    );
    expect((await p).kind).toBe('duplicate');
  });

  it('removeMember() maps IDENTITY_LAST_OWNER_PROTECTED to owner-protected', async () => {
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.removeMember(GCID));
    httpMock.expectOne(MEMBER_URL).flush(
      { code: 'IDENTITY_LAST_OWNER_PROTECTED', message: 'last owner' },
      { status: 409, statusText: 'conflict' },
    );
    const res = await p;
    expect(res.kind).toBe('owner-protected');
    if (res.kind === 'owner-protected') expect(res.reason).toBe('last-owner');
  });

  it('removeMember() maps an unnamed 409 to server-error, not to an ownership claim', async () => {
    // A conflict this build does not recognise must not be reported as an
    // ownership problem: "hand ownership over" is useless advice for a refusal
    // that has nothing to do with ownership.
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.removeMember(GCID));
    httpMock
      .expectOne(MEMBER_URL)
      .flush({ code: 'SOMETHING_ELSE', message: 'x' }, { status: 409, statusText: 'conflict' });
    expect((await p).kind).toBe('server-error');
  });

  it('leaves the roster path untouched', async () => {
    // The list classifier has no ownership case and must not grow one; a 409
    // on a read would be a different bug entirely.
    const { service, httpMock } = setup();
    const p = firstValueFrom(service.roster());
    httpMock
      .expectOne(`${environment.bffBaseUrl}${ADMIN_TENANT_MEMBERS_PATH}`)
      .flush({ code: 'X', message: 'y' }, { status: 409, statusText: 'conflict' });
    expect((await p).kind).toBe('server-error');
  });
});
