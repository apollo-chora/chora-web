/**
 * SkillsFuturesClaimsService spec — R+ /r/skillsfutures-claims
 * (real BFF wiring; HttpTestingController flushes real envelopes).
 *
 * Verifies the service issues the documented HTTP shape on the BFF and
 * maps the snake_case backend envelope into the typed FE model.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { SkillsFuturesClaimsService } from './skillsfutures-claims.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.bffBaseUrl}/api/v1/skillsfutures-claims`;

describe('SkillsFuturesClaimsService', () => {
  let service: SkillsFuturesClaimsService;
  let httpMock: HttpTestingController;
  let tenants: TenantContextService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SkillsFuturesClaimsService);
    httpMock = TestBed.inject(HttpTestingController);
    tenants = TestBed.inject(TenantContextService);
    tenants.setCurrentTenant({
      id: 'tenant-001',
      name: 'MTM Singapore',
      slug: 'mtm',
      logoUrl: null,
    });
  });

  afterEach(() => httpMock.verify());

  it('GETs /api/v1/skillsfutures-claims on the BFF (no filters)', async () => {
    const promise = firstValueFrom(service.list());
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('GET');
    req.flush({ items: [] });
    const out = await promise;
    expect(out.totalClaims).toBe(0);
    expect(out.items).toEqual([]);
  });

  it('maps the backend claim envelope into the typed model', async () => {
    const promise = firstValueFrom(service.list());
    const req = httpMock.expectOne(BASE);
    req.flush({
      items: [
        {
          id: 'claim-001',
          tenant_id: 'tenant-001',
          gcid: 'gcid-phyllis',
          course_id: 'course-cspo',
          nric_hash: 'sha256:deadbeefcafe',
          requested_amount_sgd_cents: 50000,
          approved_amount_sgd_cents: 40000,
          state: 'APPROVED',
          submitted_at: '2026-05-20T10:00:00Z',
          decided_at: '2026-05-22T12:00:00Z',
          decided_by_gcid: 'gcid-admin',
        },
      ],
    });
    const out = await promise;
    expect(out.totalClaims).toBe(1);
    const claim = out.items[0]!;
    expect(claim.id).toBe('claim-001');
    expect(claim.tenantId).toBe('tenant-001');
    expect(claim.gcid).toBe('gcid-phyllis');
    expect(claim.courseId).toBe('course-cspo');
    expect(claim.nricHash).toBe('sha256:deadbeefcafe');
    expect(claim.requestedAmountSGDCents).toBe(50000);
    expect(claim.approvedAmountSGDCents).toBe(40000);
    expect(claim.state).toBe('APPROVED');
    expect(claim.submittedAt).toBe('2026-05-20T10:00:00Z');
    expect(claim.decidedAt).toBe('2026-05-22T12:00:00Z');
    expect(claim.decidedByGCID).toBe('gcid-admin');
    expect(claim.rejectionReason).toBeNull();
  });

  it('coerces missing optional fields to null in the model', async () => {
    const promise = firstValueFrom(service.list());
    httpMock.expectOne(BASE).flush({
      items: [
        {
          id: 'claim-002',
          tenant_id: 'tenant-001',
          gcid: 'gcid-mei',
          course_id: 'course-dsa-101',
          nric_hash: 'sha256:f00ba4',
          requested_amount_sgd_cents: 30000,
          approved_amount_sgd_cents: 0,
          state: 'PENDING',
          submitted_at: '2026-05-26T09:00:00Z',
        },
      ],
    });
    const out = await promise;
    const claim = out.items[0]!;
    expect(claim.state).toBe('PENDING');
    expect(claim.decidedAt).toBeNull();
    expect(claim.decidedByGCID).toBeNull();
    expect(claim.rejectionReason).toBeNull();
  });

  it('forwards state filter as ?state= query param', async () => {
    const promise = firstValueFrom(service.list({ state: 'PENDING' }));
    const req = httpMock.expectOne(
      (r) => r.url === BASE && r.params.get('state') === 'PENDING',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ items: [] });
    await promise;
  });

  it('omits the state param when filter not supplied', async () => {
    const promise = firstValueFrom(service.list());
    const req = httpMock.expectOne(BASE);
    expect(req.request.params.has('state')).toBe(false);
    req.flush({ items: [] });
    await promise;
  });

  it('pulls tenantName from TenantContextService', async () => {
    tenants.setCurrentTenant({
      id: 'tenant-009',
      name: 'Acme Learning Co',
      slug: 'acme',
      logoUrl: null,
    });
    const promise = firstValueFrom(service.list());
    httpMock.expectOne(BASE).flush({ items: [] });
    const out = await promise;
    expect(out.tenantName).toBe('Acme Learning Co');
  });

  it('defaults tenantName to "Current tenant" when no tenant context', async () => {
    tenants.setCurrentTenant(null as never);
    const promise = firstValueFrom(service.list());
    httpMock.expectOne(BASE).flush({ items: [] });
    const out = await promise;
    expect(out.tenantName).toBe('Current tenant');
  });

  it('POSTs to /api/v1/skillsfutures-claims when submitting a new claim', async () => {
    const promise = firstValueFrom(
      service.submit({
        courseId: 'course-cspo',
        nricHash: 'sha256:abcd',
        requestedAmountSGDCents: 50000,
      }),
    );
    const req = httpMock.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      course_id: 'course-cspo',
      nric_hash: 'sha256:abcd',
      requested_amount_sgd_cents: 50000,
    });
    req.flush({
      id: 'claim-new',
      tenant_id: 'tenant-001',
      gcid: 'gcid-phyllis',
      course_id: 'course-cspo',
      nric_hash: 'sha256:abcd',
      requested_amount_sgd_cents: 50000,
      approved_amount_sgd_cents: 0,
      state: 'PENDING',
      submitted_at: '2026-05-26T10:00:00Z',
    });
    const claim = await promise;
    expect(claim.id).toBe('claim-new');
    expect(claim.state).toBe('PENDING');
  });

  it('POSTs to /{id}/approve with approved_amount_sgd_cents', async () => {
    const promise = firstValueFrom(service.approve('claim-001', 40000));
    const req = httpMock.expectOne(`${BASE}/claim-001/approve`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ approved_amount_sgd_cents: 40000 });
    req.flush({
      id: 'claim-001',
      tenant_id: 'tenant-001',
      gcid: 'gcid-phyllis',
      course_id: 'course-cspo',
      nric_hash: 'sha256:abcd',
      requested_amount_sgd_cents: 50000,
      approved_amount_sgd_cents: 40000,
      state: 'APPROVED',
      submitted_at: '2026-05-20T10:00:00Z',
      decided_at: '2026-05-26T11:00:00Z',
      decided_by_gcid: 'gcid-admin',
    });
    const claim = await promise;
    expect(claim.state).toBe('APPROVED');
    expect(claim.approvedAmountSGDCents).toBe(40000);
  });

  it('POSTs to /{id}/reject with rejection_reason', async () => {
    const promise = firstValueFrom(
      service.reject('claim-001', 'missing supporting docs'),
    );
    const req = httpMock.expectOne(`${BASE}/claim-001/reject`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      rejection_reason: 'missing supporting docs',
    });
    req.flush({
      id: 'claim-001',
      tenant_id: 'tenant-001',
      gcid: 'gcid-phyllis',
      course_id: 'course-cspo',
      nric_hash: 'sha256:abcd',
      requested_amount_sgd_cents: 50000,
      approved_amount_sgd_cents: 0,
      state: 'REJECTED',
      submitted_at: '2026-05-20T10:00:00Z',
      decided_at: '2026-05-26T11:00:00Z',
      decided_by_gcid: 'gcid-admin',
      rejection_reason: 'missing supporting docs',
    });
    const claim = await promise;
    expect(claim.state).toBe('REJECTED');
    expect(claim.rejectionReason).toBe('missing supporting docs');
  });

  it('url-encodes claim id segments in action URLs', async () => {
    const id = 'with/slash';
    const promise = firstValueFrom(service.approve(id, 1000));
    const req = httpMock.expectOne(
      `${BASE}/${encodeURIComponent(id)}/approve`,
    );
    req.flush({
      id,
      tenant_id: 'tenant-001',
      gcid: 'gcid-x',
      course_id: 'course-x',
      nric_hash: 'sha256:zz',
      requested_amount_sgd_cents: 1000,
      approved_amount_sgd_cents: 1000,
      state: 'APPROVED',
      submitted_at: '2026-05-26T00:00:00Z',
    });
    await promise;
  });
});
