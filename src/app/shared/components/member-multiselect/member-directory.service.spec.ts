/**
 * MemberDirectoryService spec — role-generic tenant-member roster for the
 * shared `chora-member-multiselect` checklist.
 *
 * Drives the service through HttpTestingController against the real BFF
 * route (`GET /api/v1/admin/tenant-members?role=<ROLE>` per
 * identity-admin.yaml#searchTenantMembers), asserting the role/page_size
 * params and the next_page_token pagination loop (the checklist needs the
 * FULL roster — a truncating first page would silently drop members).
 * Mirrors the tenant-members-admin spec shape: per-chora-web/CLAUDE.md §6,
 * every test runs `httpMock.verify()` in afterEach.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
} from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
  TestRequest,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { MemberDirectoryService } from './member-directory.service';
import type {
  TenantMemberRole,
  TenantMemberSummary,
} from '../../../features/surfaces/rplus/assessments/assessment-instantiation/assessment-instantiation.model';

const G1 = '018f0000-0000-7000-8000-000000000001';
const G2 = '018f0000-0000-7000-8000-000000000002';

function buildMember(
  overrides: Partial<TenantMemberSummary> = {},
): TenantMemberSummary {
  return {
    gcid: G1,
    email: 'alice@example.com',
    display_name: 'Alice Learner',
    avatar_url: null,
    roles: ['LEARNER'] as readonly TenantMemberRole[],
    last_active_at: '2026-07-20T00:00:00Z',
    ...overrides,
  };
}

describe('MemberDirectoryService', () => {
  let service: MemberDirectoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MemberDirectoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function expectDirectoryRequest(
    role: string,
    pageToken?: string,
  ): TestRequest {
    return httpMock.expectOne((r) => {
      if (!r.url.endsWith('/api/v1/admin/tenant-members')) return false;
      if (r.params.get('role') !== role) return false;
      if (pageToken === undefined) return true;
      return r.params.get('page_token') === pageToken;
    });
  }

  it('GETs /api/v1/admin/tenant-members with role=LEARNER and page_size=100 for learner rosters', async () => {
    const promise = firstValueFrom(service.listMembers('learner'));
    const req = expectDirectoryRequest('LEARNER');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page_size')).toBe('100');
    expect(req.request.params.has('page_token')).toBe(false);
    req.flush({
      items: [buildMember()],
      next_page_token: null,
    });
    const rows = await promise;
    expect(rows.length).toBe(1);
    expect(rows[0].gcid).toBe(G1);
  });

  it('maps the instructor UI role to role=INSTRUCTOR (Roster wants LEARNER, people-picker wants INSTRUCTOR)', async () => {
    const promise = firstValueFrom(service.listMembers('instructor'));
    const req = expectDirectoryRequest('INSTRUCTOR');
    expect(req.request.params.get('page_size')).toBe('100');
    req.flush({
      items: [
        buildMember({
          gcid: G1,
          display_name: 'Ivy Instructor',
          roles: ['INSTRUCTOR'] as readonly TenantMemberRole[],
        }),
      ],
      next_page_token: null,
    });
    const rows = await promise;
    expect(rows[0].display_name).toBe('Ivy Instructor');
  });

  it('pages through next_page_token to completion and concatenates every page', async () => {
    const promise = firstValueFrom(service.listMembers('learner'));
    expectDirectoryRequest('LEARNER').flush({
      items: [buildMember()],
      next_page_token: 'CUR2',
    });
    const second = expectDirectoryRequest('LEARNER', 'CUR2');
    expect(second.request.params.get('page_size')).toBe('100');
    second.flush({
      items: [
        buildMember({
          gcid: G2,
          display_name: 'Bob Learner',
          email: 'bob@example.com',
        }),
      ],
      next_page_token: null,
    });
    const rows = await promise;
    expect(rows.map((m) => m.gcid)).toEqual([G1, G2]);
  });

  it('returns [] for an empty single page (tenant has no members for the role)', async () => {
    const promise = firstValueFrom(service.listMembers('learner'));
    expectDirectoryRequest('LEARNER').flush({
      items: [],
      next_page_token: null,
    });
    const rows = await promise;
    expect(rows).toEqual([]);
  });

  it('never sends a page_token on the first request (starts at the head of the directory)', async () => {
    const promise = firstValueFrom(service.listMembers('instructor'));
    const req = expectDirectoryRequest('INSTRUCTOR');
    expect(req.request.params.has('page_token')).toBe(false);
    req.flush({ items: [], next_page_token: null });
    await promise;
  });
});