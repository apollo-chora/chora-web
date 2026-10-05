import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AccountLifecycleService } from './account-lifecycle.service';

describe('AccountLifecycleService', () => {
  let service: AccountLifecycleService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AccountLifecycleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should get account impact summary', () => {
    const expected = { authored_atoms: 5, active_enrollments: 2, assessment_records: 10, has_familiar: true };

    service.getAccountImpactSummary().subscribe((data) => {
      expect(data.authored_atoms).toBe(5);
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/gcid/deletion-impact'));
    req.flush(expected);
  });

  it('should request data export', () => {
    service.requestDataExport({ scope: 'full', format: 'json' }).subscribe((data) => {
      expect(data.id).toBe('export-1');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/gcid/data/export') && r.method === 'POST');
    expect(req.request.body).toEqual({ scope: 'full', format: 'json' });
    req.flush({ id: 'export-1', status: 'pending' });
  });

  it('should delete account', () => {
    service.deleteAccount('gcid-123').subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/gcid/gcid-123') && r.method === 'DELETE');
    req.flush(null);
  });

  // -------------------------------------------------------------------------
  // Account reactivation (GDPR Art. 17 — cancel pending deletion)
  // -------------------------------------------------------------------------

  it('cancelDeletion POSTs /api/v1/gcid/{gcid}/reactivate with an empty body', () => {
    service.cancelDeletion('gcid-123').subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/gcid/gcid-123/reactivate') && r.method === 'POST');
    expect(req.request.body).toEqual({});
    req.flush(null);
  });

  // -------------------------------------------------------------------------
  // Data export (GDPR Art. 20) — status lookup
  // -------------------------------------------------------------------------

  it('getDataExport GETs the export status and download URL for an export id', () => {
    service.getDataExport('export-11').subscribe((data) => {
      expect(data.status).toBe('ready');
      expect(data.download_url).toBe('https://cdn.chora.site/export-11.csv');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/gcid/data/export/export-11') && r.method === 'GET');
    req.flush({
      id: 'export-11',
      gcid: 'gcid-123',
      scope: 'full',
      tenant_id: null,
      status: 'ready',
      format: 'csv',
      download_url: 'https://cdn.chora.site/export-11.csv',
      requested_at: '2026-06-01T00:00:00Z',
      ready_at: '2026-06-01T00:05:00Z',
      expires_at: '2026-06-08T00:00:00Z',
    });
  });

  // -------------------------------------------------------------------------
  // Tenant deletion (two-person approval)
  // -------------------------------------------------------------------------

  it('initiateTenantDeletion POSTs the reason payload to the deletion path', () => {
    service.initiateTenantDeletion({ reason: 'tenant no longer active' }).subscribe((request) => {
      expect(request.status).toBe('pending_first_approval');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/tenancy/tenants/current/deletion') && r.method === 'POST');
    expect(req.request.body).toEqual({ reason: 'tenant no longer active' });
    req.flush({
      id: 'del-1',
      tenant_id: 't-1',
      initiated_by: 'gcid-123',
      second_approver_gcid: null,
      status: 'pending_first_approval',
      grace_period_ends_at: null,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    });
  });

  it('getTenantDeletionStatus GETs the current deletion request (null when none)', () => {
    service.getTenantDeletionStatus().subscribe((status) => {
      expect(status).toBeNull();
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/tenancy/tenants/current/deletion') && r.method === 'GET');
    req.flush(null);
  });

  it('nominateApprover POSTs the approver gcid to /approver', () => {
    service.nominateApprover({ approver_gcid: 'gcid-approver' }).subscribe((request) => {
      expect(request.second_approver_gcid).toBe('gcid-approver');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/tenancy/tenants/current/deletion/approver') && r.method === 'POST');
    expect(req.request.body).toEqual({ approver_gcid: 'gcid-approver' });
    req.flush({
      id: 'del-1',
      tenant_id: 't-1',
      initiated_by: 'gcid-123',
      second_approver_gcid: 'gcid-approver',
      status: 'pending_second_approval',
      grace_period_ends_at: null,
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    });
  });

  it('confirmTenantDeletion POSTs an empty body to /confirm', () => {
    service.confirmTenantDeletion().subscribe((request) => {
      expect(request.status).toBe('approved');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/tenancy/tenants/current/deletion/confirm') && r.method === 'POST');
    expect(req.request.body).toEqual({});
    req.flush({
      id: 'del-1',
      tenant_id: 't-1',
      initiated_by: 'gcid-123',
      second_approver_gcid: 'gcid-approver',
      status: 'approved',
      grace_period_ends_at: '2026-07-01T00:00:00Z',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    });
  });

  it('cancelTenantDeletion DELETEs the deletion request', () => {
    service.cancelTenantDeletion().subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/tenancy/tenants/current/deletion') && r.method === 'DELETE');
    req.flush(null);
  });

  it('requestTenantDataExport POSTs the desired format to /export', () => {
    service.requestTenantDataExport('csv').subscribe((data) => {
      expect(data.format).toBe('csv');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/tenancy/tenants/current/deletion/export') && r.method === 'POST');
    expect(req.request.body).toEqual({ format: 'csv' });
    req.flush({
      id: 'export-12',
      gcid: 'gcid-123',
      scope: 'tenant_scoped',
      tenant_id: 't-1',
      status: 'pending',
      format: 'csv',
      download_url: null,
      requested_at: '2026-06-01T00:00:00Z',
      ready_at: null,
      expires_at: null,
    });
  });

  it('getEligibleApprovers GETs tenant admins and owners via the role query params', () => {
    service.getEligibleApprovers().subscribe((res) => {
      expect(res.data.length).toBe(1);
      expect(res.data[0].roles).toContain('tenant_admin');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/tenants/members') && r.method === 'GET');
    expect(req.request.url).toContain('role=tenant_admin');
    expect(req.request.url).toContain('role=tenant_owner');
    req.flush({
      data: [
        { gcid: 'gcid-approver', display_name: 'Ada', email: 'ada@mtm.sg', roles: ['tenant_admin'] },
      ],
    });
  });

  it('getTenantDeletionAudit GETs the audit trail', () => {
    service.getTenantDeletionAudit().subscribe((res) => {
      expect(res.items.length).toBe(1);
      expect(res.items[0].action).toBe('delete_initiated');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/tenancy/tenants/current/deletion/audit') && r.method === 'GET');
    req.flush({
      items: [
        { id: 'aud-1', action: 'delete_initiated', performed_by: 'gcid-123', performed_at: '2026-06-01T00:00:00Z', details: 'reason' },
      ],
    });
  });

  // -------------------------------------------------------------------------
  // Phase 48.3: impact summary & tenant hierarchy
  // -------------------------------------------------------------------------

  it('getTenantDeletionImpact GETs the impact summary', () => {
    service.getTenantDeletionImpact().subscribe((impact) => {
      expect(impact.total_users).toBe(42);
      expect(impact.cold_storage_policy).toBe('archive');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/tenancy/tenants/current/deletion/impact') && r.method === 'GET');
    req.flush({
      total_users: 42,
      total_atoms: 120,
      total_enrollments: 60,
      total_assessments: 15,
      total_media_assets: 30,
      total_familiars: 3,
      data_retention_days: 90,
      cold_storage_policy: 'archive',
    });
  });

  it('getTenantHierarchy GETs the franchise child summary', () => {
    service.getTenantHierarchy().subscribe((hierarchy) => {
      expect(hierarchy.is_parent).toBe(true);
      expect(hierarchy.children.length).toBe(1);
      expect(hierarchy.children[0].tenant_name).toBe('Acme');
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/tenancy/tenants/current/hierarchy') && r.method === 'GET');
    req.flush({
      is_parent: true,
      children: [{ tenant_id: 't-2', tenant_name: 'Acme', user_count: 10, atom_count: 20 }],
    });
  });
});
