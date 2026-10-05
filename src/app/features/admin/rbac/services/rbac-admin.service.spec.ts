import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { RbacAdminService } from './rbac-admin.service';
import { environment } from '../../../../../environments/environment';
import type {
  RoleCapabilities,
  EffectivePermissionsResponse,
  TenantUserListResponse,
  RoleAssignmentRequest,
} from '../models/rbac.model';

const BASE = environment.bffBaseUrl;
const GCID = '00000000-0000-7000-8000-000000001999';

describe('RbacAdminService', () => {
  let service: RbacAdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RbacAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('is created', () => {
    expect(service).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // getCapabilities
  // -------------------------------------------------------------------------

  it('GETs /api/v1/rbac/capabilities on the BFF', async () => {
    const payload: RoleCapabilities[] = [
      {
        role: 'tenant_admin',
        capabilities: [
          { code: 'users.manage', label: 'Manage users', description: 'Add/remove users' },
        ],
      },
    ];
    const promise = firstValueFrom(service.getCapabilities());

    const req = httpMock.expectOne(`${BASE}/api/v1/rbac/capabilities`);
    expect(req.request.method).toBe('GET');
    req.flush(payload);

    const result = await promise;
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe('tenant_admin');
    expect(result[0]!.capabilities[0]!.code).toBe('users.manage');
  });

  it('propagates a 500 error from getCapabilities', async () => {
    const promise = firstValueFrom(service.getCapabilities());

    const req = httpMock.expectOne(`${BASE}/api/v1/rbac/capabilities`);
    req.flush('boom', { status: 500, statusText: 'Internal Server Error' });

    await expect(promise).rejects.toMatchObject({ status: 500 });
  });

  // -------------------------------------------------------------------------
  // getEffectivePermissions
  // -------------------------------------------------------------------------

  it('GETs /api/v1/rbac/effective-permissions with the gcid query param', async () => {
    const payload: EffectivePermissionsResponse = {
      gcid: GCID,
      permissions: [
        { capability: 'atoms.publish', grantedBy: ['content_author', 'tenant_admin'] },
      ],
    };
    const promise = firstValueFrom(service.getEffectivePermissions(GCID));

    const req = httpMock.expectOne(
      `${BASE}/api/v1/rbac/effective-permissions?gcid=${GCID}`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('gcid')).toBe(GCID);
    req.flush(payload);

    const result = await promise;
    expect(result.gcid).toBe(GCID);
    expect(result.permissions[0]!.capability).toBe('atoms.publish');
    expect(result.permissions[0]!.grantedBy).toContain('tenant_admin');
  });

  it('propagates a 404 error from getEffectivePermissions', async () => {
    const promise = firstValueFrom(service.getEffectivePermissions(GCID));

    const req = httpMock.expectOne(
      `${BASE}/api/v1/rbac/effective-permissions?gcid=${GCID}`,
    );
    req.flush('not found', { status: 404, statusText: 'Not Found' });

    await expect(promise).rejects.toMatchObject({ status: 404 });
  });

  // -------------------------------------------------------------------------
  // getUsers
  // -------------------------------------------------------------------------

  it('GETs /api/v1/admin/users with default pagination and no search', async () => {
    const payload: TenantUserListResponse = {
      users: [
        {
          gcid: GCID,
          email: 'chen@example.com',
          displayName: 'Mr. Chen',
          roles: ['instructor'],
          lastActiveAt: '2026-06-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    };
    const promise = firstValueFrom(service.getUsers());

    const req = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/v1/admin/users`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('25');
    expect(req.request.params.has('search')).toBe(false);
    req.flush(payload);

    const result = await promise;
    expect(result.total).toBe(1);
    expect(result.users[0]!.displayName).toBe('Mr. Chen');
    expect(result.users[0]!.roles).toContain('instructor');
  });

  it('GETs /api/v1/admin/users with explicit page/pageSize and a search term', async () => {
    const payload: TenantUserListResponse = {
      users: [],
      total: 0,
      page: 3,
      pageSize: 10,
    };
    const promise = firstValueFrom(service.getUsers(3, 10, 'chen'));

    const req = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/v1/admin/users`,
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('3');
    expect(req.request.params.get('pageSize')).toBe('10');
    expect(req.request.params.get('search')).toBe('chen');
    req.flush(payload);

    const result = await promise;
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
    expect(result.users).toEqual([]);
  });

  it('does NOT add the search param when search is an empty string (falsy)', async () => {
    const promise = firstValueFrom(service.getUsers(2, 50, ''));

    const req = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/v1/admin/users`,
    );
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('50');
    expect(req.request.params.has('search')).toBe(false);
    req.flush({ users: [], total: 0, page: 2, pageSize: 50 });

    await promise;
  });

  it('propagates a 403 error from getUsers', async () => {
    const promise = firstValueFrom(service.getUsers());

    const req = httpMock.expectOne(
      (r) => r.url === `${BASE}/api/v1/admin/users`,
    );
    req.flush('forbidden', { status: 403, statusText: 'Forbidden' });

    await expect(promise).rejects.toMatchObject({ status: 403 });
  });

  // -------------------------------------------------------------------------
  // assignRole
  // -------------------------------------------------------------------------

  it('POSTs /api/v1/admin/users/roles with the assignment body', async () => {
    const body: RoleAssignmentRequest = { gcid: GCID, role: 'assessor' };
    const promise = firstValueFrom(service.assignRole(body));

    const req = httpMock.expectOne(`${BASE}/api/v1/admin/users/roles`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush(null);

    await promise;
  });

  it('propagates a 409 error from assignRole', async () => {
    const body: RoleAssignmentRequest = { gcid: GCID, role: 'assessor' };
    const promise = firstValueFrom(service.assignRole(body));

    const req = httpMock.expectOne(`${BASE}/api/v1/admin/users/roles`);
    req.flush('conflict', { status: 409, statusText: 'Conflict' });

    await expect(promise).rejects.toMatchObject({ status: 409 });
  });

  // -------------------------------------------------------------------------
  // revokeRole
  // -------------------------------------------------------------------------

  it('DELETEs /api/v1/admin/users/roles/{role} with the role + gcid encoded in the URL', async () => {
    const promise = firstValueFrom(service.revokeRole(GCID, 'platform_ops'));

    const req = httpMock.expectOne(
      `${BASE}/api/v1/admin/users/roles/${encodeURIComponent('platform_ops')}?gcid=${encodeURIComponent(GCID)}`,
    );
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    await promise;
  });

  it('URL-encodes the role and gcid in the revokeRole path', async () => {
    const weirdGcid = 'gcid/with space';
    const promise = firstValueFrom(service.revokeRole(weirdGcid, 'super_admin'));

    const req = httpMock.expectOne(
      `${BASE}/api/v1/admin/users/roles/super_admin?gcid=${encodeURIComponent(weirdGcid)}`,
    );
    expect(req.request.method).toBe('DELETE');
    expect(req.request.urlWithParams).toContain('gcid%2Fwith%20space');
    req.flush(null);

    await promise;
  });

  it('propagates a 500 error from revokeRole', async () => {
    const promise = firstValueFrom(service.revokeRole(GCID, 'learner'));

    const req = httpMock.expectOne(
      `${BASE}/api/v1/admin/users/roles/learner?gcid=${encodeURIComponent(GCID)}`,
    );
    req.flush('boom', { status: 500, statusText: 'Internal Server Error' });

    await expect(promise).rejects.toMatchObject({ status: 500 });
  });
});
