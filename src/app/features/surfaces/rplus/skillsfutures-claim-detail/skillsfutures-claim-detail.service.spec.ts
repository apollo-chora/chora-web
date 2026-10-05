/**
 * SkillsFuturesClaimDetailService spec — R+ Wave-5 drill-down.
 *
 * Verifies:
 *   - GET  /api/v1/skillsfutures-claims/{id}
 *   - POST /api/v1/skillsfutures-claims/{id}/approve   (admin decision)
 *   - POST /api/v1/skillsfutures-claims/{id}/reject    (admin decision)
 *   - snake_case → camelCase mapping
 *   - 404 + 5xx propagate to the caller (fail-loud per
 *     feedback_no_stubs_real_wiring)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { SkillsFuturesClaimDetailService } from './skillsfutures-claim-detail.service';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.bffBaseUrl}/api/v1/skillsfutures-claims`;

describe('SkillsFuturesClaimDetailService', () => {
  let service: SkillsFuturesClaimDetailService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SkillsFuturesClaimDetailService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('get(id)', () => {
    it('GETs /api/v1/skillsfutures-claims/{id} on the BFF', async () => {
      const promise = firstValueFrom(service.get('claim-001'));
      const req = httpMock.expectOne(`${BASE}/claim-001`);
      expect(req.request.method).toBe('GET');
      req.flush({
        id: 'claim-001',
        tenant_id: 'tenant-001',
        gcid: 'gcid-phyllis',
        course_id: 'course-cspo',
        nric_hash: 'sha256:abcd',
        requested_amount_sgd_cents: 50000,
        approved_amount_sgd_cents: 0,
        state: 'PENDING',
        submitted_at: '2026-05-20T10:00:00Z',
      });
      const out = await promise;
      expect(out.id).toBe('claim-001');
      expect(out.state).toBe('PENDING');
      expect(out.decidedAt).toBeNull();
      expect(out.decidedByGCID).toBeNull();
      expect(out.rejectionReason).toBeNull();
    });

    it('URL-encodes the id segment', async () => {
      const promise = firstValueFrom(service.get('with/slash'));
      httpMock.expectOne(`${BASE}/${encodeURIComponent('with/slash')}`).flush({
        id: 'with/slash',
        tenant_id: 'tenant-001',
        gcid: 'gcid-x',
        course_id: 'course-x',
        nric_hash: 'sha256:zz',
        requested_amount_sgd_cents: 1000,
        approved_amount_sgd_cents: 0,
        state: 'PENDING',
        submitted_at: '2026-05-26T00:00:00Z',
      });
      await promise;
    });

    it('preserves decided_at + decided_by_gcid on APPROVED claims', async () => {
      const promise = firstValueFrom(service.get('claim-002'));
      httpMock.expectOne(`${BASE}/claim-002`).flush({
        id: 'claim-002',
        tenant_id: 'tenant-001',
        gcid: 'gcid-phyllis',
        course_id: 'course-cspo',
        nric_hash: 'sha256:def',
        requested_amount_sgd_cents: 50000,
        approved_amount_sgd_cents: 40000,
        state: 'APPROVED',
        submitted_at: '2026-05-20T10:00:00Z',
        decided_at: '2026-05-22T12:00:00Z',
        decided_by_gcid: 'gcid-admin',
      });
      const out = await promise;
      expect(out.state).toBe('APPROVED');
      expect(out.approvedAmountSGDCents).toBe(40000);
      expect(out.decidedAt).toBe('2026-05-22T12:00:00Z');
      expect(out.decidedByGCID).toBe('gcid-admin');
    });

    it('preserves rejection_reason on REJECTED claims', async () => {
      const promise = firstValueFrom(service.get('claim-003'));
      httpMock.expectOne(`${BASE}/claim-003`).flush({
        id: 'claim-003',
        tenant_id: 'tenant-001',
        gcid: 'gcid-mei',
        course_id: 'course-dsa-101',
        nric_hash: 'sha256:f00',
        requested_amount_sgd_cents: 30000,
        approved_amount_sgd_cents: 0,
        state: 'REJECTED',
        submitted_at: '2026-05-21T10:00:00Z',
        decided_at: '2026-05-23T12:00:00Z',
        decided_by_gcid: 'gcid-admin',
        rejection_reason: 'missing supporting docs',
      });
      const out = await promise;
      expect(out.state).toBe('REJECTED');
      expect(out.rejectionReason).toBe('missing supporting docs');
    });

    it('propagates 404 errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.get('missing'));
      httpMock.expectOne(`${BASE}/missing`).flush('claim not found', {
        status: 404,
        statusText: 'Not Found',
      });
      await expect(promise).rejects.toBeInstanceOf(HttpErrorResponse);
      await expect(promise).rejects.toMatchObject({ status: 404 });
    });

    it('propagates 5xx errors to the caller (fail-loud)', async () => {
      const promise = firstValueFrom(service.get('claim-001'));
      httpMock.expectOne(`${BASE}/claim-001`).flush('upstream', {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await expect(promise).rejects.toMatchObject({ status: 503 });
    });
  });

  describe('approve(id, amount)', () => {
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
  });

  describe('reject(id, reason)', () => {
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
  });
});
